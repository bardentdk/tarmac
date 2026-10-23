/**
 * splits.ts — les temps intermédiaires.
 *
 * Un chrono global ne dit pas OÙ le temps a été perdu. Les intermédiaires, si.
 *
 * Exemple vécu : deux 402 m à 15,0 s, mais l'un passe les 60 pieds en 2,30 s
 * et l'autre en 2,05 s. Le premier a raté son départ et rattrapé en haut ; le
 * second a bien lancé puis s'est essoufflé. Ce sont deux problèmes opposés, et
 * seul l'intermédiaire les distingue.
 *
 * Tout est obtenu par interpolation entre deux échantillons, jamais en prenant
 * l'échantillon le plus proche : à 25 Hz, arrondir coûte jusqu'à 40 ms, soit
 * plus que l'écart entre deux bons runs.
 */
import type { RunMode, RunSample } from './types';

export interface Split {
  /** Libellé affiché : « 0-50 », « 60 ft », « 201 m ». */
  label: string;
  kind: 'speed' | 'distance';
  /** Temps depuis le départ, en secondes. */
  timeS: number;
  /** Vitesse au franchissement (épreuves de distance). */
  trapKph?: number;
  /** Cible atteinte (km/h ou m), pour la comparaison entre runs. */
  target: number;
}

/** Les intermédiaires pertinents pour chaque épreuve. */
const SPLIT_PLAN: Record<RunMode, { speeds: number[]; distances: { m: number; label: string }[] }> = {
  '0-100': {
    speeds: [50, 80, 100],
    // 100 m : un repère que tout le monde a sur une piste.
    distances: [{ m: 18.288, label: '60 ft' }, { m: 100, label: '100 m' }],
  },
  '100-200': {
    speeds: [130, 160, 200],
    distances: [],
  },
  '402m': {
    speeds: [100],
    distances: [
      { m: 18.288, label: '60 ft' },
      { m: 201.168, label: '1/8 mile' },
      { m: 402.336, label: '402 m' },
    ],
  },
  '60ft': {
    speeds: [],
    distances: [{ m: 18.288, label: '60 ft' }],
  },
  '0-200': {
    speeds: [50, 100, 150, 200],
    distances: [{ m: 402.336, label: '402 m' }],
  },
  '80-120': {
    speeds: [100, 120],
    distances: [],
  },
  '1000m': {
    speeds: [100, 150],
    distances: [
      { m: 402.336, label: '402 m' },
      { m: 1000, label: '1000 m' },
    ],
  },
};

/**
 * Instant où une série croise une valeur, par interpolation linéaire.
 * Renvoie `null` si la valeur n'est jamais atteinte.
 */
function crossing(
  samples: RunSample[],
  pick: (s: RunSample) => number,
  target: number,
): { timeS: number; index: number } | null {
  for (let i = 1; i < samples.length; i++) {
    const prev = pick(samples[i - 1]);
    const cur = pick(samples[i]);
    if (prev < target && cur >= target) {
      const span = cur - prev;
      const f = span > 0 ? (target - prev) / span : 0;
      const ms = samples[i - 1].ms + f * (samples[i].ms - samples[i - 1].ms);
      return { timeS: Math.round((ms / 1000) * 1000) / 1000, index: i };
    }
  }
  return null;
}

/** Vitesse interpolée à un instant donné (km/h). */
function speedAtMs(samples: RunSample[], ms: number): number | null {
  if (samples.length === 0) return null;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].ms >= ms) {
      const a = samples[i - 1];
      const b = samples[i];
      const f = (ms - a.ms) / Math.max(1, b.ms - a.ms);
      return a.speedKph + f * (b.speedKph - a.speedKph);
    }
  }
  return samples[samples.length - 1].speedKph;
}

/**
 * Calcule les intermédiaires d'un run.
 *
 * On ne retient que ceux réellement franchis : afficher « 0-200 : — » sur un
 * run qui s'est arrêté à 120 n'apporte rien.
 */
export function computeSplits(samples: RunSample[], mode: RunMode): Split[] {
  if (samples.length < 3) return [];
  const plan = SPLIT_PLAN[mode];
  if (!plan) return [];

  const out: Split[] = [];

  for (const kph of plan.speeds) {
    const hit = crossing(samples, (s) => s.speedKph, kph);
    if (!hit) continue;
    const from = mode === '100-200' ? 100 : mode === '80-120' ? 80 : 0;
    out.push({
      label: `${from}-${kph}`,
      kind: 'speed',
      timeS: hit.timeS,
      target: kph,
    });
  }

  for (const d of plan.distances) {
    const hit = crossing(samples, (s) => s.distanceM, d.m);
    if (!hit) continue;
    const trap = speedAtMs(samples, hit.timeS * 1000);
    out.push({
      label: d.label,
      kind: 'distance',
      timeS: hit.timeS,
      trapKph: trap !== null ? Math.round(trap) : undefined,
      target: d.m,
    });
  }

  return out.sort((a, b) => a.timeS - b.timeS);
}

/**
 * Compare les intermédiaires de deux runs.
 *
 * C'est la lecture la plus utile de l'écran d'analyse : elle montre non
 * seulement qu'on a perdu du temps, mais à quel moment l'écart s'est creusé —
 * et si on l'a repris ensuite.
 */
export interface SplitDelta {
  label: string;
  timeS: number;
  /** Écart contre la référence (s). Positif = plus lent. */
  deltaS: number | null;
  /** L'écart s'est-il creusé ou réduit depuis l'intermédiaire précédent ? */
  trend: 'creuse' | 'reduit' | 'stable' | null;
}

export function compareSplits(run: Split[], reference: Split[]): SplitDelta[] {
  const refByLabel = new Map(reference.map((s) => [s.label, s]));
  let previousDelta: number | null = null;

  return run.map((s) => {
    const ref = refByLabel.get(s.label);
    const deltaS = ref ? Math.round((s.timeS - ref.timeS) * 1000) / 1000 : null;

    let trend: SplitDelta['trend'] = null;
    if (deltaS !== null && previousDelta !== null) {
      const change = deltaS - previousDelta;
      trend = Math.abs(change) < 0.015 ? 'stable' : change > 0 ? 'creuse' : 'reduit';
    }
    if (deltaS !== null) previousDelta = deltaS;

    return { label: s.label, timeS: s.timeS, deltaS, trend };
  });
}

/**
 * Le segment où le plus de temps a été perdu.
 * Sert à écrire une phrase du genre « tu as tout perdu entre 50 et 80 km/h ».
 */
export function worstSegment(deltas: SplitDelta[]): { label: string; lostS: number } | null {
  let worst: { label: string; lostS: number } | null = null;
  let previous = 0;
  for (const d of deltas) {
    if (d.deltaS === null) continue;
    const lost = d.deltaS - previous;
    previous = d.deltaS;
    if (lost > 0.01 && (!worst || lost > worst.lostS)) {
      worst = { label: d.label, lostS: Math.round(lost * 1000) / 1000 };
    }
  }
  return worst;
}
