/**
 * RunDetector.ts — le juge de départ et le juge d'arrivée.
 *
 * Chronométrer un 0-100, ce n'est pas lancer un chronomètre au doigt. Trois
 * difficultés, et c'est tout le travail de ce fichier :
 *
 *   1. **Quand commence le run ?** Pas quand l'utilisateur appuie, mais quand
 *      la voiture se met à bouger. On arme la mesure, puis on attend que la
 *      vitesse décolle. Le vrai instant zéro est ensuite retrouvé par
 *      interpolation entre les deux derniers échantillons.
 *
 *   2. **Quand finit-il ?** Le GPS envoie des points discrets : 98 km/h puis
 *      102 km/h. Le passage exact à 100 est entre les deux, et il faut
 *      l'interpoler, sinon on perd jusqu'à 40 ms — soit plus que l'écart entre
 *      deux runs réussis.
 *
 *   3. **Que s'est-il passé entre les deux ?** On enregistre tout, à la
 *      cadence du GPS, et on note les incidents au vol : patinage, retard
 *      d'avance, cliquetis. C'est ce qui permettra de dire « tu as perdu
 *      0,12 s en patinage » au lieu de « c'était lent ».
 *
 * Le détecteur vit hors de React, comme le reste de la chaîne : un changement
 * d'écran au milieu d'un run ne doit rien interrompre.
 */
import { live } from '@/store/liveStore';
import { consoleLog } from '@/debug/ConsoleLog';
import { referenceSpeed } from './gps';
import { buildConditions, correctTime } from './weather';
import { IBIZA_STAGE1, type VehicleSpec } from '@/transport/vehicleSim';
import type { RunConditions, RunIncident, RunMode, RunRecord, RunSample, ShiftEvent } from './types';
import { runModeDef } from './types';

export type RunPhase = 'idle' | 'armed' | 'running' | 'finished' | 'aborted';

export interface RunProgress {
  phase: RunPhase;
  mode: RunMode;
  /** Chrono courant en secondes. */
  elapsedS: number;
  /** Vitesse de référence (km/h). */
  speedKph: number;
  /** Distance parcourue depuis le départ (m). */
  distanceM: number;
  /** Progression vers l'objectif, de 0 à 1. */
  ratio: number;
  gear: number | null;
  rpm: number | null;
  boostBar: number | null;
  /** Patinage instantané (%). */
  slipPct: number;
  /** Message à afficher pendant l'attente du départ. */
  hint: string;
  /** Le dernier incident notable, pour l'encart d'alerte en direct. */
  lastIncident: RunIncident | null;
  /** D'où vient la vitesse : ça change la confiance dans le chrono. */
  speedSource: 'gps' | 'obd' | 'none';
}

export interface RunDetectorCallbacks {
  onProgress(p: RunProgress): void;
  /** Le run est terminé, voici la fiche complète. */
  onFinish(r: Omit<RunRecord, 'id' | 'number' | 'isRecord' | 'prep'>): void;
  /** Un incident grave : le run est arrêté, l'écran d'alerte doit s'ouvrir. */
  onCritical(i: RunIncident): void;
}

/** Cadence interne : 25 Hz, comme la cadence GPS visée. */
const TICK_MS = 40;
/** Vitesse au-delà de laquelle on considère que la voiture a décollé (km/h). */
const LAUNCH_THRESHOLD_KPH = 1.2;
/** Au-delà de ce temps d'attente sans départ, on abandonne (s). */
const ARM_TIMEOUT_S = 120;

export class RunDetector {
  private phase: RunPhase = 'idle';
  private mode: RunMode = '0-100';
  private timer: ReturnType<typeof setInterval> | null = null;

  private armedAt = 0;
  private startedAt = 0;
  private samples: RunSample[] = [];
  private shifts: ShiftEvent[] = [];
  private incidents: RunIncident[] = [];
  private conditions: RunConditions | null = null;

  private distanceM = 0;
  private prev: { t: number; kph: number } | null = null;
  private lastGear: number | null = null;
  private gearChangedAt = 0;
  /** Nombre de corrections de cliquetis vues dans la fenêtre glissante. */
  private knockWindow: number[] = [];
  private lastIncident: RunIncident | null = null;

  constructor(
    private cb: RunDetectorCallbacks,
    private spec: VehicleSpec = IBIZA_STAGE1,
  ) {}

  get currentPhase(): RunPhase {
    return this.phase;
  }

  /**
   * Arme la mesure. Le chrono ne démarre pas tout de suite : on attend que la
   * voiture bouge (ou, pour un 100-200, qu'elle passe les 100 km/h).
   */
  arm(mode: RunMode): void {
    this.reset();
    this.mode = mode;
    this.phase = 'armed';
    this.armedAt = Date.now();

    // On fige les conditions météo au moment de l'armement : c'est l'air que
    // le moteur va respirer pendant le run.
    this.conditions = buildConditions({
      iatC: live.get('iat'),
      baroKpa: live.get('baro'),
      warmedUp: true,
    });

    consoleLog.sys(`Run armé : ${mode}`);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit();
  }

  /** Annulation par l'utilisateur. */
  cancel(reason = 'Annulé'): void {
    if (this.phase === 'idle') return;
    this.stopTimer();
    this.phase = 'aborted';
    consoleLog.sys(`Run annulé : ${reason}`);
    this.emit(reason);
    this.phase = 'idle';
  }

  private reset(): void {
    this.stopTimer();
    this.samples = [];
    this.shifts = [];
    this.incidents = [];
    this.distanceM = 0;
    this.prev = null;
    this.lastGear = null;
    this.gearChangedAt = 0;
    this.knockWindow = [];
    this.lastIncident = null;
    this.startedAt = 0;
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /* ──────────────────────────── La boucle ──────────────────────────── */

  private tick(): void {
    const now = Date.now();
    const def = runModeDef(this.mode);
    const { kph, source } = referenceSpeed();

    if (kph === null) {
      this.emit('En attente de la vitesse (GPS ou OBD)…');
      return;
    }

    /* ── Phase d'attente : guetter le départ ──────────────────────────── */
    if (this.phase === 'armed') {
      if (now - this.armedAt > ARM_TIMEOUT_S * 1000) {
        this.cancel('Pas de départ détecté');
        return;
      }

      const launched =
        def.fromKph === 0
          ? kph >= LAUNCH_THRESHOLD_KPH
          : kph >= def.fromKph;

      if (!launched) {
        this.prev = { t: now, kph };
        this.emit(
          def.fromKph === 0
            ? 'Prêt. Le chrono part dès que la voiture bouge.'
            : `Prêt. Le chrono part à ${def.fromKph} km/h.`,
        );
        return;
      }

      // Instant zéro retrouvé par interpolation : on remonte entre le dernier
      // échantillon sous le seuil et celui-ci. Sans ça, on perd un tick entier.
      const p = this.prev;
      let t0 = now;
      if (p && kph > p.kph) {
        const frac = (def.fromKph === 0 ? LAUNCH_THRESHOLD_KPH : def.fromKph) - p.kph;
        const span = kph - p.kph;
        t0 = p.t + (frac / span) * (now - p.t);
      }
      this.startedAt = t0;
      this.phase = 'running';
      this.distanceM = 0;
      this.prev = { t: t0, kph: def.fromKph === 0 ? 0 : def.fromKph };
      consoleLog.sys(`Départ détecté (source ${source})`);
    }

    if (this.phase !== 'running') return;

    /* ── Intégration de la distance ────────────────────────────────────
       On n'a pas de capteur de distance : on l'obtient en additionnant
       vitesse × temps, comme on calculerait un trajet à partir d'un
       compteur. La moyenne des deux vitesses (méthode des trapèzes) est
       bien plus juste qu'un simple produit. */
    const p = this.prev!;
    const dt = (now - p.t) / 1000;
    if (dt > 0) {
      const avgMs = ((p.kph + kph) / 2) / 3.6;
      this.distanceM += avgMs * dt;
    }

    /* ── Échantillon ───────────────────────────────────────────────────── */
    const rpm = live.get('rpm');
    const wheel = live.get('speed');
    const gear = this.estimateGear(rpm, kph);
    const advance = live.get('advance');
    const sample: RunSample = {
      ms: Math.round(now - this.startedAt),
      speedKph: kph,
      wheelSpeedKph: wheel,
      distanceM: this.distanceM,
      rpm,
      boostBar: live.get('boost'),
      advanceDeg: advance,
      iatC: live.get('iat'),
      gear,
      throttlePct: live.get('throttle'),
    };
    this.samples.push(sample);

    this.detectShift(gear, sample.ms);
    this.detectIncidents(sample, wheel, kph, advance);

    /* ── Arrivée ───────────────────────────────────────────────────────── */
    const reached =
      def.kind === 'speed'
        ? kph >= (def.toKph ?? Infinity)
        : this.distanceM >= (def.distanceM ?? Infinity);

    if (reached) {
      // Interpolation du franchissement, même raisonnement qu'au départ.
      let tEnd = now;
      if (def.kind === 'speed' && kph > p.kph) {
        const frac = (def.toKph ?? kph) - p.kph;
        tEnd = p.t + (frac / (kph - p.kph)) * (now - p.t);
      } else if (def.kind === 'distance' && dt > 0) {
        const target = def.distanceM ?? this.distanceM;
        const prevDist = this.distanceM - ((p.kph + kph) / 2 / 3.6) * dt;
        const span = this.distanceM - prevDist;
        if (span > 0) tEnd = p.t + ((target - prevDist) / span) * (now - p.t);
      }

      this.finish((tEnd - this.startedAt) / 1000, kph);
      return;
    }

    this.prev = { t: now, kph };
    this.emit();
  }

  /**
   * Estime le rapport engagé à partir du couple régime/vitesse.
   *
   * En 3e à 60 km/h, le moteur tourne à un régime précis, imposé par la
   * mécanique. Le rapport régime/vitesse est donc une signature de chaque
   * rapport. On compare la signature mesurée aux signatures théoriques.
   */
  private estimateGear(rpm: number | null, kph: number): number | null {
    if (rpm === null || kph < 5 || rpm < 900) return null;
    const circum = 2 * Math.PI * this.spec.wheelRadiusM;
    const measured = rpm / (kph / 3.6); // tours moteur par m/s
    let best: number | null = null;
    let bestErr = Infinity;
    for (let g = 0; g < this.spec.gearRatios.length; g++) {
      const ratio = this.spec.gearRatios[g] * (this.spec.finalDrives[g] ?? this.spec.finalDrives[0]);
      const theory = (60 * ratio) / circum;
      const err = Math.abs(theory - measured) / theory;
      if (err < bestErr) { bestErr = err; best = g + 1; }
    }
    // Au-delà de 12 % d'écart, on patine ou l'embrayage glisse : on préfère
    // ne rien afficher plutôt qu'un rapport faux.
    return bestErr < 0.12 ? best : null;
  }

  /** Repère un changement de rapport et mesure la durée de la coupure. */
  private detectShift(gear: number | null, ms: number): void {
    if (gear === null) return;
    if (this.lastGear === null) { this.lastGear = gear; this.gearChangedAt = ms; return; }
    if (gear === this.lastGear) return;
    this.shifts.push({ ms, from: this.lastGear, to: gear, durationMs: Math.max(0, ms - this.gearChangedAt) });
    this.lastGear = gear;
    this.gearChangedAt = ms;
  }

  /**
   * Note les incidents au vol.
   *
   * Le cliquetis est le seul qui peut ARRÊTER un run : c'est une détonation
   * dans le cylindre, et répétée, elle casse des pistons. Le reste est
   * enregistré pour l'analyse d'après-run.
   */
  private detectIncidents(s: RunSample, wheel: number | null, gpsKph: number, advance: number | null): void {
    const push = (i: RunIncident) => {
      this.incidents.push(i);
      this.lastIncident = i;
    };

    // Patinage : les roues tournent plus vite que la voiture n'avance.
    if (wheel !== null && gpsKph > 8) {
      const slip = ((wheel - gpsKph) / gpsKph) * 100;
      if (slip > 6) {
        push({
          ms: s.ms,
          kind: 'slip',
          severity: 'warn',
          value: Math.round(slip),
          message: `Patinage ${Math.round(slip)} % — la puissance part en fumée`,
        });
      }
    }

    // Retard d'avance : le calculateur se protège, on perd du couple.
    // L'avance « attendue » dépend du régime ; on compare au point le plus
    // avancé vu depuis le début du run, à régime comparable.
    if (advance !== null && s.rpm !== null && s.rpm > 3000 && (s.throttlePct ?? 0) > 70) {
      const peers = this.samples.filter(
        (x) => x.advanceDeg !== null && x.rpm !== null && Math.abs(x.rpm - s.rpm!) < 400,
      );
      if (peers.length > 6) {
        const best = Math.max(...peers.map((x) => x.advanceDeg!));
        const drop = best - advance;
        if (drop > 1.5) {
          push({
            ms: s.ms,
            kind: 'retard',
            severity: 'warn',
            value: Math.round(drop * 10) / 10,
            message: `Avance réduite −${drop.toFixed(1).replace('.', ',')}° — le calculateur se protège`,
          });
        }
        // Une chute brutale et répétée, c'est du cliquetis actif.
        if (drop > 3) {
          this.knockWindow.push(s.ms);
          this.knockWindow = this.knockWindow.filter((t) => s.ms - t < 2000);
          if (this.knockWindow.length >= 5) {
            const critical: RunIncident = {
              ms: s.ms,
              kind: 'knock',
              severity: 'danger',
              value: this.knockWindow.length,
              message: `Cliquetis répété détecté · ${this.knockWindow.length} corrections en 2 secondes · ${Math.round(s.rpm)} tr/min`,
            };
            push(critical);
            this.abortOnCritical(critical);
          }
        }
      }
    }

    // Admission trop chaude : pas dangereux à l'instant, mais ça coûte du temps.
    if (s.iatC !== null && s.iatC > 50 && !this.incidents.some((i) => i.kind === 'overheat')) {
      push({
        ms: s.ms,
        kind: 'overheat',
        severity: 'warn',
        value: Math.round(s.iatC),
        message: `Admission à ${Math.round(s.iatC)} °C — laisse refroidir avant le prochain run`,
      });
    }
  }

  /** Arrêt immédiat pour cause de danger moteur. */
  private abortOnCritical(i: RunIncident): void {
    this.stopTimer();
    this.phase = 'aborted';
    consoleLog.err(`Run interrompu : ${i.message}`);
    this.emit(i.message);
    this.cb.onCritical(i);

    this.cb.onFinish({
      mode: this.mode,
      startedAt: this.startedAt,
      timeS: null,
      correctedS: null,
      trapKph: null,
      abortedReason: 'Arrêté : cliquetis',
      conditions: this.conditions ?? buildConditions({ iatC: null, baroKpa: null }),
      samples: this.samples,
      shifts: this.shifts,
      incidents: this.incidents,
      launchSlipPct: this.launchSlip(),
    });
    this.phase = 'idle';
  }

  /** Clôture normale. */
  private finish(timeS: number, trapKph: number): void {
    this.stopTimer();
    this.phase = 'finished';
    const conditions = this.conditions ?? buildConditions({ iatC: null, baroKpa: null });
    const def = runModeDef(this.mode);

    consoleLog.sys(`Run terminé : ${timeS.toFixed(3)} s (${this.mode})`);
    this.emit();

    this.cb.onFinish({
      mode: this.mode,
      startedAt: this.startedAt,
      timeS: Math.round(timeS * 1000) / 1000,
      correctedS: correctTime(timeS, conditions),
      trapKph: def.kind === 'distance' ? Math.round(trapKph) : null,
      abortedReason: null,
      conditions,
      samples: this.samples,
      shifts: this.shifts,
      incidents: this.incidents,
      launchSlipPct: this.launchSlip(),
    });
    this.phase = 'idle';
  }

  /** Patinage moyen sur les 600 premières millisecondes : la qualité du départ. */
  private launchSlip(): number {
    const early = this.samples.filter((s) => s.ms <= 600 && s.wheelSpeedKph !== null && s.speedKph > 3);
    if (early.length === 0) return 0;
    const sum = early.reduce((a, s) => a + Math.max(0, ((s.wheelSpeedKph! - s.speedKph) / s.speedKph) * 100), 0);
    return Math.round((sum / early.length) * 10) / 10;
  }

  private emit(hint = ''): void {
    const def = runModeDef(this.mode);
    const { kph, source } = referenceSpeed();
    const speed = kph ?? 0;
    const elapsedS = this.phase === 'running' ? (Date.now() - this.startedAt) / 1000 : 0;

    const ratio =
      def.kind === 'speed'
        ? Math.max(0, Math.min(1, (speed - def.fromKph) / ((def.toKph ?? 100) - def.fromKph)))
        : Math.max(0, Math.min(1, this.distanceM / (def.distanceM ?? 1)));

    const wheel = live.get('speed');
    const slipPct = wheel !== null && speed > 8 ? Math.max(0, ((wheel - speed) / speed) * 100) : 0;

    this.cb.onProgress({
      phase: this.phase,
      mode: this.mode,
      elapsedS,
      speedKph: speed,
      distanceM: this.distanceM,
      ratio,
      gear: this.lastGear,
      rpm: live.get('rpm'),
      boostBar: live.get('boost'),
      slipPct: Math.round(slipPct),
      hint,
      lastIncident: this.lastIncident,
      speedSource: source,
    });
  }
}
