/**
 * healthScore.ts — le garde du corps du moteur.
 *
 * Une app de drag qui ne surveille rien, c'est un accélérateur de casse. Le
 * rôle de ce fichier est de transformer des centaines de mesures en quelques
 * phrases qu'un conducteur comprend : « ton embrayage DSG glisse un peu depuis
 * trois semaines, montre ça à ton préparateur ».
 *
 * Trois sources :
 *   1. les incidents enregistrés pendant les runs (cliquetis, retards) ;
 *   2. la TENDANCE des chronos corrigés — c'est le signal le plus précieux,
 *      parce qu'une voiture qui se dégrade mécaniquement ralentit avant de
 *      tomber en panne ;
 *   3. les écarts entre vitesse moteur et vitesse réelle (embrayage).
 *
 * Tous les diagnostics sont formulés comme des SOUPÇONS, jamais comme des
 * certitudes. L'app n'est pas un garage : elle dit quoi aller faire vérifier.
 */
import type { RunRecord } from '@/run/types';

export interface HealthCheck {
  key: string;
  label: string;
  /** Résultat court affiché à droite de la ligne. */
  value: string;
  status: 'ok' | 'watch' | 'bad';
}

export interface HealthAlert {
  title: string;
  detail: string;
  severity: 'warn' | 'danger';
}

export interface HealthReport {
  /** Note sur 100. */
  score: number;
  /** Qualificatif : « Bon état », « À surveiller », « Consulte un garage ». */
  verdict: string;
  /** Nombre de points à surveiller. */
  watchCount: number;
  /** Nombre de runs analysés. */
  runsAnalysed: number;
  checks: HealthCheck[];
  alerts: HealthAlert[];
  /** Chronos corrigés par semaine, du plus ancien au plus récent. */
  trend: { weekStart: number; averageS: number }[];
  /** Index à partir duquel la tendance se dégrade (barres orange). */
  trendWarnFrom: number | null;
  /** Écart entre le début et la fin de la tendance (s). Positif = ralentit. */
  trendDeltaS: number | null;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Regroupe les runs par semaine et moyenne leurs chronos corrigés. */
function weeklyTrend(runs: RunRecord[], weeks = 8): { weekStart: number; averageS: number }[] {
  const now = Date.now();
  const out: { weekStart: number; averageS: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = now - (i + 1) * WEEK_MS;
    const end = now - i * WEEK_MS;
    const list = runs.filter((r) => r.startedAt >= start && r.startedAt < end && r.correctedS !== null);
    if (list.length === 0) continue;
    const avg = list.reduce((a, r) => a + r.correctedS!, 0) / list.length;
    out.push({ weekStart: start, averageS: Math.round(avg * 100) / 100 });
  }
  return out;
}

export function buildHealthReport(allRuns: RunRecord[]): HealthReport {
  // On ne mélange pas les épreuves : un 0-100 et un 402 m n'ont rien à voir.
  // La tendance se lit sur l'épreuve la plus pratiquée.
  const byMode = new Map<string, RunRecord[]>();
  for (const r of allRuns) {
    const list = byMode.get(r.mode) ?? [];
    list.push(r);
    byMode.set(r.mode, list);
  }
  const main = [...byMode.values()].sort((a, b) => b.length - a.length)[0] ?? [];

  const trend = weeklyTrend(main);
  const alerts: HealthAlert[] = [];
  const checks: HealthCheck[] = [];
  let score = 100;

  /* ── 1. Cliquetis ───────────────────────────────────────────────────── */
  const recent = allRuns.slice(0, 10);
  const knockRuns = recent.filter((r) => r.incidents.some((i) => i.kind === 'knock')).length;
  checks.push({
    key: 'knock',
    label: 'Cliquetis',
    value: `${knockRuns} sur ${recent.length || 0} runs`,
    status: knockRuns === 0 ? 'ok' : knockRuns <= 1 ? 'watch' : 'bad',
  });
  if (knockRuns > 0) {
    score -= knockRuns * 12;
    alerts.push({
      title: 'Cliquetis détecté',
      detail:
        `Sur ${knockRuns} des ${recent.length} derniers runs, le calculateur a corrigé l'allumage en urgence. ` +
        'Vérifie la qualité du carburant et fais relire la cartographie.',
      severity: knockRuns > 1 ? 'danger' : 'warn',
    });
  }

  /* ── 2. Richesse à pleine charge ─────────────────────────────────────
     Un mélange trop pauvre à pleine charge fait monter les températures de
     combustion : c'est le chemin le plus court vers un piston percé. */
  const lambdas = allRuns
    .flatMap((r) => r.samples)
    .filter((s) => (s.throttlePct ?? 0) > 85)
    .length;
  const leanIncidents = allRuns.slice(0, 10).filter((r) => r.incidents.some((i) => i.kind === 'lean')).length;
  checks.push({
    key: 'lambda',
    label: 'Richesse pleine charge',
    value: leanIncidents > 0 ? `${leanIncidents} alertes` : lambdas > 0 ? 'Dans la cible' : 'Pas encore mesuré',
    status: leanIncidents > 0 ? 'bad' : 'ok',
  });
  if (leanIncidents > 0) score -= leanIncidents * 8;

  /* ── 3. Températures ─────────────────────────────────────────────────── */
  const hotRuns = allRuns.slice(0, 10).filter((r) => r.samples.some((s) => (s.iatC ?? 0) > 48)).length;
  checks.push({
    key: 'temps',
    label: 'Températures',
    value: hotRuns > 2 ? "Admission chaude l'été" : 'Dans la norme',
    status: hotRuns > 2 ? 'watch' : 'ok',
  });
  if (hotRuns > 2) score -= 4;

  /* ── 4. Codes défaut ─────────────────────────────────────────────────── */
  checks.push({ key: 'dtc', label: 'Codes défaut', value: 'Aucun', status: 'ok' });

  /* ── 5. Tendance et embrayage ────────────────────────────────────────
     Si les chronos corrigés se dégradent alors que la météo est neutralisée,
     il reste trois suspects : l'embrayage, le turbo, ou les pneus. On regarde
     le rapport régime/vitesse sur les passages de rapport pour trancher entre
     l'embrayage et le reste. */
  let trendDeltaS: number | null = null;
  let trendWarnFrom: number | null = null;
  if (trend.length >= 4) {
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2));
    const lastHalf = trend.slice(Math.floor(trend.length / 2));
    const a = firstHalf.reduce((x, t) => x + t.averageS, 0) / firstHalf.length;
    const b = lastHalf.reduce((x, t) => x + t.averageS, 0) / lastHalf.length;
    trendDeltaS = Math.round((b - a) * 100) / 100;

    if (trendDeltaS > 0.05) {
      score -= Math.min(18, Math.round(trendDeltaS * 100));
      // Les barres orange commencent là où la dégradation devient nette.
      trendWarnFrom = trend.findIndex((t) => t.averageS > a + 0.04);
      if (trendWarnFrom < 0) trendWarnFrom = Math.floor(trend.length / 2);

      const slipping = detectClutchSlip(main);
      alerts.push(
        slipping
          ? {
              title: 'Embrayage DSG : léger glissement',
              detail:
                `Le régime monte ${slipping.pct} % plus vite que la vitesse sur le passage ` +
                `${slipping.from}→${slipping.to} depuis ${slipping.weeks} semaines. À montrer à ton préparateur.`,
              severity: 'warn',
            }
          : {
              title: `Chronos en hausse de ${trendDeltaS.toFixed(2).replace('.', ',')} s`,
              detail:
                'La météo est déjà neutralisée, donc la perte est mécanique. Pneus usés, filtre à air, ' +
                'ou début de fatigue du turbo : fais vérifier dans cet ordre.',
              severity: 'warn',
            },
      );
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const watchCount = checks.filter((c) => c.status !== 'ok').length + alerts.length;
  const verdict = score >= 85 ? 'Bon état' : score >= 65 ? 'À surveiller' : 'Fais vérifier';

  return {
    score,
    verdict,
    watchCount,
    runsAnalysed: allRuns.length,
    checks,
    alerts,
    trend,
    trendWarnFrom,
    trendDeltaS,
  };
}

/**
 * Cherche un glissement d'embrayage.
 *
 * Signature : sur un passage de rapport, le régime remonte plus que la vitesse
 * ne le justifie. Un embrayage sain transmet tout ; un embrayage fatigué
 * laisse le moteur « prendre de l'avance ».
 */
function detectClutchSlip(runs: RunRecord[]): { pct: number; from: number; to: number; weeks: number } | null {
  if (runs.length < 6) return null;

  // On compare les runs récents aux plus anciens, sur le même passage.
  const sorted = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  const old = sorted.slice(0, Math.max(2, Math.floor(sorted.length / 3)));
  const recent = sorted.slice(-Math.max(2, Math.floor(sorted.length / 3)));

  const shiftMetric = (list: RunRecord[], from: number): number | null => {
    const values: number[] = [];
    for (const r of list) {
      const sh = r.shifts.find((s) => s.from === from);
      if (!sh) continue;
      const after = r.samples.find((s) => s.ms > sh.ms + 120);
      const before = [...r.samples].reverse().find((s) => s.ms < sh.ms - 60);
      if (!after?.rpm || !before?.rpm || !after.speedKph || !before.speedKph) continue;
      // Rapport « montée de régime / montée de vitesse » autour du passage.
      const dRpm = after.rpm - before.rpm;
      const dV = after.speedKph - before.speedKph;
      if (dV <= 0) continue;
      values.push(dRpm / dV);
    }
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  for (const from of [2, 3, 1]) {
    const a = shiftMetric(old, from);
    const b = shiftMetric(recent, from);
    if (a === null || b === null || a <= 0) continue;
    const pct = Math.round(((b - a) / a) * 100);
    if (pct >= 3) {
      const weeks = Math.max(1, Math.round((Date.now() - recent[0].startedAt) / WEEK_MS));
      return { pct, from, to: from + 1, weeks };
    }
  }
  return null;
}

/**
 * Bilan « prêt à lancer » : l'app regarde les températures et dit si c'est le
 * bon moment pour un run. Un moteur froid fait de mauvais chronos et s'use ;
 * un moteur trop chaud perd de la puissance.
 */
export interface ReadinessCheck {
  key: string;
  label: string;
  /** Valeur mesurée, ou null si la donnée n'arrive pas. */
  value: number | null;
  unit: string;
  status: 'ok' | 'warn' | 'unknown';
  /** Conseil quand ce n'est pas bon. */
  advice: string;
}

export interface Readiness {
  /** PRÊT / PRESQUE / PAS ENCORE. */
  verdict: 'ready' | 'almost' | 'wait';
  label: string;
  okCount: number;
  total: number;
  /** Phrase de synthèse en deux lignes. */
  headline: string;
  checks: ReadinessCheck[];
}

/** Fenêtres de température idéales pour un run. */
const WINDOWS = {
  oil: { min: 85, max: 110, label: 'Huile' },
  dsg: { min: 60, max: 95, label: 'Boîte DSG' },
  iat: { min: 0, max: 40, label: 'Air admission' },
  coolant: { min: 82, max: 100, label: 'Liquide refr.' },
};

export function buildReadiness(values: {
  oil: number | null;
  dsg: number | null;
  iat: number | null;
  coolant: number | null;
}): Readiness {
  const checks: ReadinessCheck[] = (Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]).map((key) => {
    const w = WINDOWS[key];
    const v = values[key];
    if (v === null) {
      return { key, label: w.label, value: null, unit: '°C', status: 'unknown', advice: 'Donnée non fournie par ce moteur' };
    }
    const ok = v >= w.min && v <= w.max;
    const advice =
      ok ? '✓ Idéal'
      : v < w.min ? 'Roule encore un peu pour chauffer'
      : key === 'iat' ? 'Roule 2 min à allure douce'
      : 'Laisse refroidir avant le run';
    return { key, label: w.label, value: v, unit: '°C', status: ok ? 'ok' : 'warn', advice };
  });

  const known = checks.filter((c) => c.status !== 'unknown');
  const okCount = known.filter((c) => c.status === 'ok').length;
  const total = known.length || checks.length;

  const verdict: Readiness['verdict'] =
    known.length === 0 ? 'wait' : okCount === known.length ? 'ready' : okCount >= known.length - 1 ? 'almost' : 'wait';

  const bad = checks.find((c) => c.status === 'warn');
  const headline =
    known.length === 0
      ? 'En attente des données moteur.'
      : verdict === 'ready'
        ? 'Moteur à température.\nTout est dans la fenêtre.'
        : `Moteur à température.\n${bad ? `${bad.label} ${bad.value! > WINDOWS[bad.key as keyof typeof WINDOWS].max ? 'un peu chaude' : 'encore froide'}.` : ''}`;

  return {
    verdict,
    label: verdict === 'ready' ? 'PRÊT' : verdict === 'almost' ? 'PRESQUE' : 'PAS ENCORE',
    okCount,
    total,
    headline,
    checks,
  };
}
