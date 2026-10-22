/**
 * PollingScheduler.ts — le chef de cuisine.
 *
 * Le boîtier est un guichet unique : une question à la fois. Le planificateur
 * décide donc QUOI demander, DANS QUEL ORDRE, et à QUELLE CADENCE, pour tirer
 * le maximum d'un tuyau étroit.
 *
 * Trois idées font tout le travail :
 *
 *   1. **Deux vitesses.** Le régime et la vitesse changent dix fois par
 *      seconde ; la température d'eau, une fois par minute. Les relire à la
 *      même cadence gâcherait les trois quarts du débit. Les « rapides »
 *      tournent en boucle, les « lents » passent une fois par seconde.
 *
 *   2. **Le groupement.** Quand le boîtier sait répondre à plusieurs PID d'un
 *      coup (`010C0D0B`), on passe de 1 valeur par aller-retour à 6. C'est le
 *      gain le plus important de toute l'app — mais uniquement si l'examen de
 *      capacités l'a confirmé.
 *
 *   3. **L'apprentissage des absences.** Un PID absent coûte un délai complet
 *      à chaque tour. Après trois `NO DATA` d'affilée, on le retire de la
 *      rotation et on le signale dans la console.
 *
 * La boucle tourne indépendamment de l'interface : changer d'écran ne
 * l'interrompt pas, et elle écrit dans le tampon circulaire, pas dans React.
 */
import { ElmProtocol } from '@/elm/ElmProtocol';
import { supportsPid, type ElmCapabilities } from '@/elm/capabilities';
import { decodeMode01 } from './decode';
import { boostBar, FAST_PIDS, PID_BY_ID, SLOW_PIDS } from './pids';
import { live } from '@/store/liveStore';
import { consoleLog } from '@/debug/ConsoleLog';
import { ElmError } from '@/elm/sanitize';

/** Cadence demandée par l'interface. */
export type PollMode =
  /** App en arrière-plan : juste de quoi garder le lien vivant. */
  | 'idle'
  /** Écran de données live ou accueil : tout, à cadence confortable. */
  | 'live'
  /** Run en cours : les rapides au maximum, les lents au minimum. */
  | 'run';

interface ModeConfig {
  /** Pause entre deux tours de boucle (ms). 0 = aussi vite que possible. */
  gapMs: number;
  /** Période de relecture des grandeurs lentes (ms). */
  slowEveryMs: number;
  /** Interroger les grandeurs lentes du tout ? */
  includeSlow: boolean;
}

const MODES: Record<PollMode, ModeConfig> = {
  idle: { gapMs: 900, slowEveryMs: 5000, includeSlow: true },
  live: { gapMs: 0, slowEveryMs: 1000, includeSlow: true },
  // Pendant un run, chaque milliseconde compte : on ne lit que ce qui bouge.
  run: { gapMs: 0, slowEveryMs: 4000, includeSlow: true },
};

export class PollingScheduler {
  private running = false;
  private mode: PollMode = 'live';
  private lastSlowAt = 0;
  /** PID → nombre de `NO DATA` consécutifs. */
  private misses = new Map<string, number>();
  private dropped = new Set<string>();
  private loopPromise: Promise<void> | null = null;

  constructor(
    private elm: ElmProtocol,
    private caps: ElmCapabilities,
    /** Liste blanche de l'utilisateur. Vide = tout ce qui est supporté. */
    private enabledPids: string[] = [],
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  get currentMode(): PollMode {
    return this.mode;
  }

  /** PID écartés faute de réponse, affichés dans la console de diagnostic. */
  get droppedPids(): string[] {
    return [...this.dropped];
  }

  setMode(mode: PollMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    consoleLog.sys(`Cadence d'interrogation : ${mode}`);
  }

  /** Permet de remplacer la fiche de capacités après une reconnexion. */
  updateCaps(caps: ElmCapabilities): void {
    this.caps = caps;
    this.misses.clear();
    this.dropped.clear();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    consoleLog.sys('Planificateur démarré');
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    consoleLog.sys('Planificateur arrêté');
    await this.loopPromise?.catch(() => {});
    this.loopPromise = null;
  }

  /* ─────────────────────────── La boucle ─────────────────────────── */

  private async loop(): Promise<void> {
    while (this.running) {
      const cfg = MODES[this.mode];

      try {
        await this.pollGroup(this.activePids(FAST_PIDS));

        if (cfg.includeSlow && Date.now() - this.lastSlowAt >= cfg.slowEveryMs) {
          this.lastSlowAt = Date.now();
          await this.pollGroup(this.activePids(SLOW_PIDS));
        }
      } catch (e) {
        // Une erreur de transport signifie que le lien est tombé : on sort, le
        // ConnectionManager se charge de la reconnexion. Inutile de s'acharner.
        if (!(e instanceof ElmError)) {
          consoleLog.err(`Interrogation interrompue : ${e instanceof Error ? e.message : String(e)}`);
          this.running = false;
          break;
        }
      }

      // Rendre la main au moteur JavaScript, même avec `gapMs: 0`. Sans ce
      // point de respiration, la boucle monopoliserait le thread et
      // l'interface ne se redessinerait plus.
      await new Promise((r) => setTimeout(r, cfg.gapMs));
    }
  }

  /** Les PID encore dans la rotation, filtrés par capacités et réglages. */
  private activePids(source: string[]): string[] {
    return source.filter((pid) => {
      if (this.dropped.has(pid)) return false;
      if (this.enabledPids.length > 0 && !this.enabledPids.includes(pid)) return false;
      return supportsPid(this.caps, pid);
    });
  }

  /**
   * Interroge une liste de PID, en les groupant si le boîtier sait le faire.
   * Un groupe en échec est réessayé PID par PID : ça permet d'identifier
   * précisément celui qui manque, au lieu de perdre tout le groupe.
   */
  private async pollGroup(pids: string[]): Promise<void> {
    if (pids.length === 0) return;

    if (!this.caps.multiPid) {
      for (const pid of pids) {
        if (!this.running) return;
        await this.pollSingle(pid);
      }
      return;
    }

    const size = Math.max(1, Math.min(6, this.caps.maxPidsPerRequest));
    for (let i = 0; i < pids.length; i += size) {
      if (!this.running) return;
      const group = pids.slice(i, i + size);
      const cmd = '01' + group.join('') + (this.caps.responseCountHint ? '1' : '');

      try {
        const r = await this.elm.send(cmd, { timeoutMs: 1500, retries: 0, tolerateErrors: true });
        live.markRequest(this.elm.stats.avgMs);

        if (r.error) {
          // Le groupe entier a échoué. On repasse en individuel pour savoir qui.
          for (const pid of group) {
            if (!this.running) return;
            await this.pollSingle(pid);
          }
          continue;
        }

        const decoded = decodeMode01(r.clean);
        const now = Date.now();
        const seen = new Set<string>();
        for (const d of decoded) {
          live.set(d.key, d.value, now);
          seen.add(d.pid);
          this.misses.delete(d.pid);
        }
        // Les PID du groupe restés muets : on les compte comme des absences.
        for (const pid of group) if (!seen.has(pid)) this.noteMiss(pid);

        this.computeDerived(now);
      } catch {
        // Dépassement de délai sur le groupe : on retombe en individuel, qui
        // est plus lent mais plus tolérant.
        for (const pid of group) {
          if (!this.running) return;
          await this.pollSingle(pid);
        }
      }
    }
  }

  private async pollSingle(pid: string): Promise<void> {
    const cmd = '01' + pid + (this.caps.responseCountHint ? '1' : '');
    try {
      const r = await this.elm.send(cmd, { timeoutMs: 1200, retries: 0, tolerateErrors: true });
      live.markRequest(this.elm.stats.avgMs);

      if (r.error) {
        this.noteMiss(pid);
        return;
      }
      const decoded = decodeMode01(r.clean);
      if (decoded.length === 0) {
        this.noteMiss(pid);
        return;
      }
      const now = Date.now();
      for (const d of decoded) live.set(d.key, d.value, now);
      this.misses.delete(pid);
      this.computeDerived(now);
    } catch {
      this.noteMiss(pid);
    }
  }

  /**
   * Compte une absence. Au bout de trois d'affilée, le PID sort de la
   * rotation : inutile de payer un délai complet à chaque tour pour une donnée
   * que ce moteur ne fournit pas (la température d'huile, typiquement).
   */
  private noteMiss(pid: string): void {
    const n = (this.misses.get(pid) ?? 0) + 1;
    this.misses.set(pid, n);
    if (n >= 3 && !this.dropped.has(pid)) {
      this.dropped.add(pid);
      const label = PID_BY_ID[pid]?.label ?? pid;
      consoleLog.sys(`PID ${pid} (${label}) retiré de la rotation : 3 absences de suite`);
    }
  }

  /**
   * Calcule les grandeurs qui n'ont pas de PID.
   *
   * Le boost, par exemple : la pression d'admission lue est ABSOLUE, donc elle
   * vaut environ 100 kPa moteur à l'arrêt. Ce que le conducteur appelle
   * « boost », c'est ce que le turbo AJOUTE, donc la différence avec la
   * pression atmosphérique.
   */
  private computeDerived(now: number): void {
    const map = live.get('map');
    const baro = live.get('baro');
    const b = boostBar(map, baro);
    if (b !== null) live.set('boost', b, now);

    // Patinage : la vitesse OBD vient des roues, la vitesse GPS du satellite.
    // L'écart, c'est ce qui part en fumée.
    const wheel = live.get('speed');
    const gps = live.get('gpsSpeed');
    if (wheel !== null && gps !== null && gps > 5) {
      live.set('slip', Math.max(0, ((wheel - gps) / gps) * 100), now);
    }
  }
}
