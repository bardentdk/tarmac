/**
 * capabilities.ts — la fiche d'aptitude du boîtier.
 *
 * Deux ELM327 qui portent la même étiquette « v1.5 » peuvent être
 * complètement différents à l'intérieur. L'un accepte six PID par requête,
 * l'autre se bloque au deuxième. L'un comprend `ATST`, l'autre répond `?`.
 *
 * Plutôt que de parier, on fait passer un petit examen au boîtier juste après
 * l'initialisation, et on n'active une optimisation QUE si l'examen est réussi.
 * La règle est explicite dans le cahier des charges : un clone lent mais stable
 * vaut mieux qu'un clone rapide qui plante.
 *
 * Le résultat est mémorisé par boîtier : le deuxième démarrage ne repasse pas
 * l'examen, ce qui économise environ une seconde de connexion.
 */
import { ElmProtocol } from './ElmProtocol';
import { decodeMode01, decodeSupported } from '@/obd/decode';
import { consoleLog } from '@/debug/ConsoleLog';

export interface ElmCapabilities {
  /** Version annoncée par `ATI`. Les clones mentent, on la garde pour la console. */
  version: string;
  /** Description renvoyée par `AT@1`. */
  description: string;
  /** Protocole réellement utilisé, lu par `ATDP`. */
  protocol: string;
  /** Plusieurs PID dans une seule requête (`010C0D05`). */
  multiPid: boolean;
  /** Nombre maximum de PID par requête quand `multiPid` est vrai. */
  maxPidsPerRequest: number;
  /** Le suffixe « nombre de réponses attendues » (`010C1`) est compris. */
  responseCountHint: boolean;
  /** `ATST` (réglage du délai d'attente) accepté. */
  canSetTimeout: boolean;
  /** `ATAT1` (délai adaptatif) accepté. */
  adaptiveTiming: boolean;
  /** `ATSH7E0` accepté : on peut viser le calculateur moteur directement. */
  headerSet: boolean;
  /** Les PID du mode 01 que le calculateur déclare supporter. */
  supportedPids: string[];
  /** Mesure du temps d'un aller-retour simple, en millisecondes. */
  roundTripMs: number;
  /** Date de l'examen, pour savoir si la fiche est périmée. */
  testedAt: number;
}

export const UNKNOWN_CAPS: ElmCapabilities = {
  version: '?',
  description: '',
  protocol: '?',
  multiPid: false,
  maxPidsPerRequest: 1,
  responseCountHint: false,
  canSetTimeout: false,
  adaptiveTiming: false,
  headerSet: false,
  supportedPids: [],
  roundTripMs: 0,
  testedAt: 0,
};

/**
 * Fait passer l'examen au boîtier.
 *
 * @param elm   Le protocole déjà initialisé (ElmInit est passé avant).
 * @param base  Ce qu'on sait déjà (version, protocole, résultats de l'init).
 */
export async function probeCapabilities(
  elm: ElmProtocol,
  base: Partial<ElmCapabilities> = {},
): Promise<ElmCapabilities> {
  const caps: ElmCapabilities = { ...UNKNOWN_CAPS, ...base, testedAt: Date.now() };

  /* ── 1. Les PID supportés ────────────────────────────────────────────
     On lit les quatre masques. Chacun déclare 32 PID. Sans ça, on
     passerait notre temps à demander des données qui n'existent pas, et
     chaque absence coûte un délai complet. */
  for (const basePid of ['00', '20', '40', '60']) {
    try {
      const r = await elm.send('01' + basePid, { timeoutMs: 3000, tolerateErrors: true });
      if (r.error) break; // Le calculateur ne va pas plus loin : inutile d'insister.
      const list = decodeSupported(r.clean, basePid);
      caps.supportedPids.push(...list);
      // Le bit 32 (PID base+0x20) dit « il y a un masque suivant ». S'il est
      // absent, on arrête : demander le suivant ne donnerait que NO DATA.
      const next = (parseInt(basePid, 16) + 0x20).toString(16).toUpperCase().padStart(2, '0');
      if (!list.includes(next)) break;
    } catch {
      break;
    }
  }

  /* ── 2. Temps d'un aller-retour simple ──────────────────────────────── */
  try {
    const r = await elm.send('010C', { timeoutMs: 3000, tolerateErrors: true });
    caps.roundTripMs = r.ms;
  } catch { /* on garde 0 : la mesure n'est qu'indicative */ }

  /* ── 3. Multi-PID ────────────────────────────────────────────────────
     On demande trois PID d'un coup. Si les trois valeurs reviennent, le
     boîtier sait grouper — c'est le gain de débit le plus important
     (× 3 à × 6 sur le nombre de valeurs par seconde). */
  try {
    const r = await elm.send('010C0D05', { timeoutMs: 3000, tolerateErrors: true });
    const decoded = decodeMode01(r.clean);
    const keys = new Set(decoded.map((d) => d.pid));
    if (!r.error && keys.has('0C') && keys.has('0D') && keys.has('05')) {
      caps.multiPid = true;
      // En CAN, l'ELM327 accepte jusqu'à 6 PID par requête. On reste à 6 :
      // au-delà, la réponse passe en multi-trames et on perd le bénéfice.
      caps.maxPidsPerRequest = 6;
      consoleLog.sys('Capacité : multi-PID confirmé (jusqu\'à 6 par requête)');
    } else {
      consoleLog.sys('Capacité : multi-PID NON supporté, repli sur un PID par requête');
    }
  } catch {
    consoleLog.sys('Capacité : multi-PID NON supporté (erreur), repli sur un PID par requête');
  }

  /* ── 4. Suffixe « nombre de réponses » ───────────────────────────────
     `010C1` veut dire « une seule réponse attendue, n'attends pas les autres
     calculateurs ». Sur un bus VW qui a une passerelle, ça fait gagner
     beaucoup : le boîtier rend la main dès la première trame. On ne l'active
     que si la réponse est valide ET plus rapide. */
  if (caps.roundTripMs > 0) {
    try {
      const r = await elm.send('010C1', { timeoutMs: 3000, tolerateErrors: true });
      const ok = !r.error && decodeMode01(r.clean).some((d) => d.pid === '0C');
      if (ok && r.ms <= caps.roundTripMs) {
        caps.responseCountHint = true;
        consoleLog.sys(`Capacité : suffixe de comptage accepté (${r.ms} ms contre ${caps.roundTripMs} ms)`);
      }
    } catch { /* non supporté : on s'en passe */ }
  }

  /* ── 5. ATST : régler soi-même le délai d'attente ─────────────────────
     Avec un délai court, le boîtier abandonne plus vite sur un PID absent.
     0x20 ≈ 128 ms, un bon compromis sur un bus CAN rapide. */
  try {
    const r = await elm.send('ATST20', { timeoutMs: 1500, tolerateErrors: true });
    caps.canSetTimeout = !r.error && /OK/i.test(r.clean);
  } catch { caps.canSetTimeout = false; }

  consoleLog.sys(
    `Fiche boîtier : ${caps.version} · protocole ${caps.protocol} · ` +
    `multi-PID ${caps.multiPid ? 'oui' : 'non'} · comptage ${caps.responseCountHint ? 'oui' : 'non'} · ` +
    `ATST ${caps.canSetTimeout ? 'oui' : 'non'} · ${caps.supportedPids.length} PID déclarés`,
  );

  return caps;
}

/** Ce boîtier sait-il répondre à ce PID ? Si la liste est vide, on tente. */
export function supportsPid(caps: ElmCapabilities, pid: string): boolean {
  if (caps.supportedPids.length === 0) return true;
  return caps.supportedPids.includes(pid.toUpperCase());
}
