/**
 * analysis.ts — « pourquoi tu as perdu 0,21 seconde ».
 *
 * C'est la fonctionnalité qui différencie Tarmac d'un chronomètre. Dire
 * « 6,84 s » n'apprend rien. Dire « 0,12 s perdue en patinage, 0,07 s à cause
 * de l'admission chaude, 0,02 s sur le passage 2→3 » dit quoi faire au
 * prochain run.
 *
 * Méthode : on compare le run au MEILLEUR run de la même épreuve, échantillon
 * par échantillon, et on attribue l'écart de temps à des causes identifiées.
 * C'est la même logique qu'un analyste de course qui superpose deux tours.
 *
 * Les coefficients de conversion (tant de % de patinage = tant de secondes)
 * sont des estimations issues du modèle physique, pas des mesures. Ils sont
 * regroupés et commentés pour pouvoir être affinés avec des données réelles.
 */
import type { RunRecord, RunSample } from './types';
import { runModeDef } from './types';

/** Une cause identifiée, avec son coût en secondes. */
export interface LossCause {
  rank: number;
  title: string;
  /** Temps perdu attribué à cette cause (s). */
  costS: number;
  /** Part de la perte totale, de 0 à 1 (pour la barre). */
  share: number;
  /** Explication en français simple. */
  explanation: string;
  /** Couleur de la barre : orange = corrigeable, bleu = normal. */
  tone: 'warn' | 'info';
}

export interface RunAnalysis {
  /** Écart avec le run de référence (s). Positif = plus lent. */
  deltaS: number | null;
  /** Le run de référence utilisé. */
  reference: RunRecord | null;
  causes: LossCause[];
  /** Conseil pour le prochain run, en une phrase actionnable. */
  advice: string;
}

/**
 * Coefficients de traduction « symptôme → secondes perdues ».
 * Ordres de grandeur dérivés du modèle physique du véhicule.
 */
const COST = {
  /** Secondes perdues par point de pourcentage de patinage au départ. */
  perSlipPct: 0.011,
  /** Secondes perdues par degré d'avance retiré, par seconde de retard subi. */
  perRetardDegPerS: 0.012,
  /** Secondes perdues par milliseconde de passage de rapport au-delà de la normale. */
  perExtraShiftMs: 0.0008,
  /** Durée normale d'un passage sur une DSG7 (ms). */
  normalShiftMs: 180,
};

/** Interpole la vitesse d'un run à un instant donné. */
function speedAt(samples: RunSample[], ms: number): number | null {
  if (samples.length === 0) return null;
  if (ms <= samples[0].ms) return samples[0].speedKph;
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
 * Analyse un run. `reference` est le meilleur run de la même épreuve ; sans
 * référence, on explique quand même les symptômes observés mais sans chiffrer
 * l'écart (on ne peut pas perdre du temps contre rien).
 */
export function analyseRun(run: RunRecord, reference: RunRecord | null): RunAnalysis {
  const deltaS =
    run.timeS !== null && reference?.timeS != null ? Math.round((run.timeS - reference.timeS) * 1000) / 1000 : null;

  const raw: Omit<LossCause, 'rank' | 'share'>[] = [];

  /* ── 1. Patinage au départ ────────────────────────────────────────────
     Une roue qui patine ne pousse pas : elle chauffe le bitume. C'est le
     poste de perte le plus fréquent et le plus facile à corriger (moins de
     régime au départ). */
  if (run.launchSlipPct > 2) {
    const extra = reference ? Math.max(0, run.launchSlipPct - reference.launchSlipPct) : run.launchSlipPct;
    const costS = Math.round(extra * COST.perSlipPct * 1000) / 1000;
    if (costS > 0.005) {
      raw.push({
        title: 'Patinage au départ',
        costS,
        explanation: `${run.launchSlipPct.toFixed(0)} % de glisse sur les 0,6 premières secondes.`,
        tone: 'warn',
      });
    }
  }

  /* ── 2. Avance réduite (admission chaude ou cliquetis) ────────────────
     Quand l'air d'admission est chaud, le calculateur retire de l'avance
     pour éviter la détonation. Moins d'avance, moins de couple. */
  const retards = run.incidents.filter((i) => i.kind === 'retard' && i.value);
  if (retards.length > 0) {
    const avgDeg = retards.reduce((a, i) => a + (i.value ?? 0), 0) / retards.length;
    // Durée pendant laquelle le retard a été subi, bornée par le run lui-même.
    const spanS = Math.max(0.2, (retards[retards.length - 1].ms - retards[0].ms) / 1000);
    const costS = Math.round(avgDeg * COST.perRetardDegPerS * spanS * 1000) / 1000;
    const hotIat = Math.max(...run.samples.map((s) => s.iatC ?? 0));
    const rpmFrom = Math.min(...retards.map((i) => speedAtRpm(run.samples, i.ms) ?? 0).filter(Boolean));
    const rpmTo = Math.max(...retards.map((i) => speedAtRpm(run.samples, i.ms) ?? 0));
    raw.push({
      title: 'Admission trop chaude',
      costS,
      explanation:
        `${Math.round(hotIat)} °C → avance réduite de ${avgDeg.toFixed(1).replace('.', ',')}°` +
        (rpmFrom && rpmTo ? ` entre ${fmt(rpmFrom)} et ${fmt(rpmTo)} tr/min.` : '.'),
      tone: 'warn',
    });
  }

  /* ── 3. Passages de rapport ───────────────────────────────────────────
     Une DSG passe en 150 à 200 ms. Au-delà, quelque chose freine : embrayage
     fatigué, huile trop chaude, ou cartographie de boîte conservatrice. */
  for (const sh of run.shifts) {
    const extra = sh.durationMs - COST.normalShiftMs;
    if (extra <= 20) continue;
    raw.push({
      title: `Passage ${sh.from} → ${sh.to}`,
      costS: Math.round(extra * COST.perExtraShiftMs * 1000) / 1000,
      explanation: `${Math.round(sh.durationMs)} ms de coupure, contre ${COST.normalShiftMs} ms habituellement.`,
      tone: 'warn',
    });
  }

  /* ── 4. Perte résiduelle inexpliquée ──────────────────────────────────
     Si l'écart mesuré dépasse la somme des causes identifiées, on le dit
     plutôt que de l'inventer. L'honnêteté vaut mieux qu'une barre de plus. */
  const explained = raw.reduce((a, c) => a + c.costS, 0);
  if (deltaS !== null && deltaS - explained > 0.02) {
    raw.push({
      title: 'Écart non expliqué',
      costS: Math.round((deltaS - explained) * 1000) / 1000,
      explanation: 'Adhérence, vent, ou pente de la piste. Rien à corriger côté voiture.',
      tone: 'info',
    });
  }

  // Les passages de rapport dans la norme méritent d'être mentionnés : c'est
  // rassurant de savoir qu'un poste est sain.
  if (raw.length > 0 && run.shifts.length > 0 && !raw.some((c) => c.title.startsWith('Passage'))) {
    const sh = run.shifts[0];
    raw.push({
      title: `Passage ${sh.from} → ${sh.to}`,
      costS: 0.02,
      explanation: 'Dans la normale, rien à faire.',
      tone: 'info',
    });
  }

  const total = raw.reduce((a, c) => a + c.costS, 0) || 1;
  const causes = raw
    .sort((a, b) => b.costS - a.costS)
    .map((c, i) => ({ ...c, rank: i + 1, share: c.costS / total }));

  return { deltaS, reference, causes, advice: buildAdvice(run, causes) };
}

/** Régime à un instant donné du run. */
function speedAtRpm(samples: RunSample[], ms: number): number | null {
  const s = samples.find((x) => x.ms >= ms);
  return s?.rpm ?? null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/**
 * Le conseil pour le prochain run. Une seule phrase, concrète, actionnable.
 * Pas « optimisez votre lancement » mais « baisse le régime de 300 tr/min ».
 */
function buildAdvice(run: RunRecord, causes: LossCause[]): string {
  const top = causes[0];
  if (!top) return 'Run propre. Enchaîne pour confirmer le temps.';

  const hotIat = Math.max(...run.samples.map((s) => s.iatC ?? 0));

  if (top.title === 'Patinage au départ') {
    const hot = hotIat > 40 ? ` et attends que l'admission repasse sous 38 °C` : '';
    return `Baisse le régime de launch d'environ 300 tr/min${hot}.`;
  }
  if (top.title === 'Admission trop chaude') {
    return `Roule 2 minutes à allure douce pour faire tomber l'admission sous 38 °C, puis relance.`;
  }
  if (top.title.startsWith('Passage')) {
    return `Les passages de rapport traînent. Vérifie la température de boîte et montre ce log à ton préparateur.`;
  }
  return 'Change de piste ou attends moins de vent : la voiture, elle, a bien travaillé.';
}

/**
 * Prépare les courbes à afficher : le run et sa référence, ramenés sur une
 * même échelle de temps, plus les zones où l'avance a été réduite.
 */
export function buildChartSeries(run: RunRecord, reference: RunRecord | null, metric: 'speed' | 'boost' | 'rpm' | 'advance') {
  const pick = (s: RunSample): number | null => {
    switch (metric) {
      case 'speed': return s.speedKph;
      case 'boost': return s.boostBar;
      case 'rpm': return s.rpm;
      case 'advance': return s.advanceDeg;
    }
  };

  const toSeries = (r: RunRecord) =>
    r.samples
      .map((s) => ({ t: s.ms / 1000, v: pick(s) }))
      .filter((p): p is { t: number; v: number } => p.v !== null);

  const retardZones: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const s of run.samples) {
    const hit = run.incidents.some((i) => i.kind === 'retard' && Math.abs(i.ms - s.ms) < 120);
    if (hit && open === null) open = s.ms / 1000;
    if (!hit && open !== null) { retardZones.push({ from: open, to: s.ms / 1000 }); open = null; }
  }
  if (open !== null) retardZones.push({ from: open, to: (run.samples.at(-1)?.ms ?? 0) / 1000 });

  return {
    run: toSeries(run),
    reference: reference ? toSeries(reference) : undefined,
    shifts: run.shifts.map((s) => ({ t: s.ms / 1000, label: `${s.from}→${s.to}` })),
    retardZones,
  };
}

/** Valeurs du run à un instant donné, pour le curseur temporel des courbes. */
export function sampleAt(run: RunRecord, seconds: number): RunSample | null {
  const ms = seconds * 1000;
  if (run.samples.length === 0) return null;
  let best = run.samples[0];
  for (const s of run.samples) {
    if (Math.abs(s.ms - ms) < Math.abs(best.ms - ms)) best = s;
  }
  return best;
}

/** Écart de temps à un instant donné, run contre référence. */
export function deltaAt(run: RunRecord, reference: RunRecord | null, seconds: number): number | null {
  if (!reference) return null;
  const ms = seconds * 1000;
  const vRun = speedAt(run.samples, ms);
  const vRef = speedAt(reference.samples, ms);
  if (vRun === null || vRef === null || vRef === 0) return null;
  // Un écart de vitesse à instant égal se traduit en écart de temps : à
  // accélération comparable, perdre 3 km/h coûte environ 3/accélération.
  const accel = Math.max(1, (vRef - (speedAt(reference.samples, Math.max(0, ms - 500)) ?? 0)) / 0.5);
  return Math.round(((vRef - vRun) / accel) * 100) / 100;
}
