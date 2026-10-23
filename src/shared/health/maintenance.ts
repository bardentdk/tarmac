/**
 * maintenance.ts — le carnet d'entretien.
 *
 * Une voiture qu'on emmène régulièrement au rupteur s'use plus vite qu'une
 * voiture de bureau. Les intervalles du constructeur sont calculés pour un
 * usage normal : en usage sportif, l'huile et les bougies partent bien avant.
 *
 * ⚠️ **L'OBD-II ne donne pas le compteur kilométrique.** Ce n'est pas un oubli
 * de notre part : il n'existe aucun PID normalisé pour l'odomètre, et les
 * constructeurs le gardent derrière leurs identifiants propriétaires. Les
 * seules distances disponibles sont « depuis l'effacement des codes » et
 * « depuis l'allumage du voyant », qui ne servent à rien ici. On demande donc
 * le kilométrage à l'utilisateur, et on le dit à l'écran plutôt que de faire
 * semblant de le lire.
 *
 * En revanche, l'app connaît quelque chose que le carnet du constructeur
 * ignore : **le nombre de runs**. C'est un indicateur d'usage sportif beaucoup
 * plus parlant que le kilométrage, et on s'en sert pour avancer les échéances.
 */
import type { MaintenanceEntry } from '@/store/storage';

export interface MaintenanceItem {
  id: string;
  label: string;
  /** Pourquoi c'est important, en une phrase. */
  why: string;
  /** Intervalle constructeur en kilomètres. `null` si seul le temps compte. */
  intervalKm: number | null;
  /** Intervalle en mois. */
  intervalMonths: number | null;
  /**
   * Intervalle en usage sportif, en kilomètres. Toujours plus court.
   * Appliqué dès que le véhicule accumule des runs.
   */
  sportKm: number | null;
  /**
   * Nombre de runs au-delà duquel on considère l'usage comme sportif pour
   * cette pièce. Les bougies souffrent dès le premier run, pas le liquide de
   * frein.
   */
  sportAfterRuns: number;
  /** Ordre d'affichage : le plus critique en haut. */
  critical: boolean;
}

/**
 * Les opérations suivies.
 *
 * Les intervalles « constructeur » sont les ordres de grandeur usuels d'un
 * moteur essence suralimenté moderne. Les intervalles « sportifs » viennent de
 * la pratique des préparateurs. Dans les deux cas : **à confronter au carnet
 * d'entretien réel du véhicule**, qui fait foi. L'écran le rappelle.
 */
export const MAINTENANCE_ITEMS: MaintenanceItem[] = [
  {
    id: 'oil',
    label: 'Vidange moteur + filtre',
    why:
      "L'huile perd ses additifs sous la chaleur. Un moteur suralimenté mené au rupteur la cuit bien plus vite qu'un trajet d'autoroute.",
    intervalKm: 15000,
    intervalMonths: 12,
    sportKm: 7500,
    sportAfterRuns: 10,
    critical: true,
  },
  {
    id: 'spark-plugs',
    label: "Bougies d'allumage",
    why:
      "Une bougie usée allume mal sous forte pression : c'est le premier pas vers les ratés d'allumage, et sur un moteur préparé elle lâche beaucoup plus tôt.",
    intervalKm: 60000,
    intervalMonths: 48,
    sportKm: 25000,
    sportAfterRuns: 20,
    critical: true,
  },
  {
    id: 'air-filter',
    label: 'Filtre à air',
    why: "Un filtre colmaté étrangle le moteur : on perd de la puissance avant de perdre de la fiabilité.",
    intervalKm: 30000,
    intervalMonths: 24,
    sportKm: 15000,
    sportAfterRuns: 15,
    critical: false,
  },
  {
    id: 'dsg-oil',
    label: 'Huile de boîte DSG + filtre',
    why:
      "Les embrayages à sec d'une DQ200 vivent de leur huile de commande. Les départs arrêtés la font chauffer, et une huile fatiguée fait glisser l'embrayage.",
    intervalKm: 60000,
    intervalMonths: 48,
    sportKm: 40000,
    sportAfterRuns: 25,
    critical: true,
  },
  {
    id: 'brake-fluid',
    label: 'Liquide de frein',
    why:
      "Le liquide absorbe l'humidité de l'air et son point d'ébullition s'effondre. Sur piste, c'est la pédale qui part au plancher.",
    intervalKm: null,
    intervalMonths: 24,
    sportKm: null,
    sportAfterRuns: 0,
    critical: true,
  },
  {
    id: 'coolant',
    label: 'Liquide de refroidissement',
    why: "Il perd son pouvoir anticorrosion avec le temps, et le circuit s'entartre de l'intérieur.",
    intervalKm: null,
    intervalMonths: 60,
    sportKm: null,
    sportAfterRuns: 0,
    critical: false,
  },
  {
    id: 'fuel-filter',
    label: 'Filtre à carburant',
    why:
      "Un filtre encrassé fait chuter la pression d'injection à pleine charge, exactement quand le moteur en a le plus besoin.",
    intervalKm: 60000,
    intervalMonths: 48,
    sportKm: 40000,
    sportAfterRuns: 20,
    critical: false,
  },
  {
    id: 'tyres',
    label: 'Pneus (usure et date)',
    why:
      "Toute la puissance passe par quatre empreintes de la taille d'une main. Un pneu dur ou vieux de plus de cinq ans patine, même neuf d'aspect.",
    intervalKm: 40000,
    intervalMonths: 60,
    sportKm: 20000,
    sportAfterRuns: 30,
    critical: true,
  },
];

export type DueLevel =
  /** Rien à faire. */
  | 'ok'
  /** Échéance proche (moins de 15 % de l'intervalle restant). */
  | 'soon'
  /** Dépassée. */
  | 'due'
  /** Jamais renseignée : on ne sait pas. */
  | 'unknown';

export interface MaintenanceStatus {
  item: MaintenanceItem;
  level: DueLevel;
  /** Dernière réalisation, si connue. */
  doneAt: number | null;
  doneAtKm: number | null;
  /** Kilomètres restants avant échéance. Null si inconnu. */
  remainingKm: number | null;
  /** Mois restants avant échéance. Null si inconnu. */
  remainingMonths: number | null;
  /** Intervalle réellement appliqué (sportif ou constructeur). */
  appliedKm: number | null;
  /** L'intervalle sportif est-il appliqué ? */
  sportApplied: boolean;
  /** Phrase prête à afficher. */
  summary: string;
}

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/**
 * Évalue une opération.
 *
 * On prend toujours la contrainte la plus sévère entre le temps et la
 * distance : c'est la règle de tous les carnets d'entretien.
 */
export function evaluateItem(
  item: MaintenanceItem,
  entry: MaintenanceEntry | undefined,
  odometerKm: number | null,
  runCount: number,
): MaintenanceStatus {
  const sportApplied = item.sportKm !== null && runCount >= item.sportAfterRuns && item.sportAfterRuns > 0;
  const appliedKm = sportApplied ? item.sportKm : item.intervalKm;

  if (!entry) {
    return {
      item,
      level: 'unknown',
      doneAt: null,
      doneAtKm: null,
      remainingKm: null,
      remainingMonths: null,
      appliedKm,
      sportApplied,
      summary: 'Jamais renseigné. Note la dernière fois que ça a été fait.',
    };
  }

  const monthsSince = (Date.now() - entry.doneAt) / MONTH_MS;
  const remainingMonths = item.intervalMonths !== null ? item.intervalMonths - monthsSince : null;

  const kmSince =
    odometerKm !== null && entry.odometerKm !== null ? odometerKm - entry.odometerKm : null;
  const remainingKm = appliedKm !== null && kmSince !== null ? appliedKm - kmSince : null;

  /** Fraction d'intervalle restante, de 1 (neuf) à 0 ou moins (dépassé). */
  const fractions: number[] = [];
  if (remainingMonths !== null && item.intervalMonths) fractions.push(remainingMonths / item.intervalMonths);
  if (remainingKm !== null && appliedKm) fractions.push(remainingKm / appliedKm);

  const worst = fractions.length ? Math.min(...fractions) : null;
  const level: DueLevel = worst === null ? 'unknown' : worst <= 0 ? 'due' : worst <= 0.15 ? 'soon' : 'ok';

  const parts: string[] = [];
  if (remainingKm !== null) {
    parts.push(remainingKm > 0 ? `${Math.round(remainingKm).toLocaleString('fr-FR')} km restants` : `${Math.abs(Math.round(remainingKm)).toLocaleString('fr-FR')} km de retard`);
  }
  if (remainingMonths !== null) {
    const m = Math.round(remainingMonths);
    parts.push(m > 0 ? `${m} mois restants` : `${Math.abs(m)} mois de retard`);
  }
  if (parts.length === 0) parts.push('Renseigne ton kilométrage pour suivre la distance');

  return {
    item,
    level,
    doneAt: entry.doneAt,
    doneAtKm: entry.odometerKm,
    remainingKm,
    remainingMonths,
    appliedKm,
    sportApplied,
    summary: parts.join(' · '),
  };
}

/** Évalue tout le carnet, le plus urgent en premier. */
export function evaluateMaintenance(
  entries: MaintenanceEntry[],
  odometerKm: number | null,
  runCount: number,
): MaintenanceStatus[] {
  const byId = new Map(entries.map((e) => [e.itemId, e]));
  const order: Record<DueLevel, number> = { due: 0, soon: 1, unknown: 2, ok: 3 };

  return MAINTENANCE_ITEMS.map((item) => evaluateItem(item, byId.get(item.id), odometerKm, runCount)).sort(
    (a, b) =>
      order[a.level] - order[b.level] ||
      Number(b.item.critical) - Number(a.item.critical) ||
      a.item.label.localeCompare(b.item.label),
  );
}

/** Combien d'opérations réclament une action ? Affiché en pastille. */
export function dueCount(list: MaintenanceStatus[]): number {
  return list.filter((s) => s.level === 'due' || s.level === 'soon').length;
}
