/**
 * types.ts — ce qu'est un « run » pour Tarmac.
 *
 * Un run, c'est une mesure : un départ, une arrivée, un chrono, et surtout
 * tout ce qui s'est passé entre les deux. C'est ce « entre les deux » qui fait
 * la différence avec un simple chronomètre : c'est là que se trouve la réponse
 * à « pourquoi ce run était lent ».
 */

// Les intermédiaires sont définis dans `splits.ts` ; on les réexporte ici pour
// que `types.ts` reste le point d'entrée unique des types de run.
import type { Split } from './splits';

export type { Split };

/** Les épreuves que l'app sait chronométrer. */
export type RunMode = '0-100' | '100-200' | '402m' | '60ft' | '0-200' | '80-120' | '1000m';

export interface RunModeDef {
  mode: RunMode;
  label: string;
  /** Explication courte affichée sous le choix. */
  hint: string;
  /** Type d'épreuve : vitesse à atteindre, ou distance à parcourir. */
  kind: 'speed' | 'distance';
  /** Vitesse de départ (km/h). 0 = départ arrêté. */
  fromKph: number;
  /** Vitesse d'arrivée (km/h), pour les épreuves de vitesse. */
  toKph?: number;
  /** Distance à parcourir (m), pour les épreuves de distance. */
  distanceM?: number;
}

export const RUN_MODES: RunModeDef[] = [
  { mode: '0-100', label: '0-100', hint: 'Départ arrêté jusqu\'à 100 km/h', kind: 'speed', fromKph: 0, toKph: 100 },
  { mode: '100-200', label: '100-200', hint: 'Reprise de 100 à 200 km/h', kind: 'speed', fromKph: 100, toKph: 200 },
  { mode: '402m', label: '402 m', hint: 'Le quart de mile, départ arrêté', kind: 'distance', fromKph: 0, distanceM: 402.336 },
  { mode: '60ft', label: '60 ft', hint: 'Les 18,29 premiers mètres : la qualité du départ', kind: 'distance', fromKph: 0, distanceM: 18.288 },
  // Le 0-200 d'une traction de 190 ch demande une longue ligne droite : on le
  // dit, parce que le run s'interrompra sinon au bout de deux minutes d'attente.
  { mode: '0-200', label: '0-200', hint: 'Départ arrêté jusqu\'à 200 km/h — longue ligne droite nécessaire', kind: 'speed', fromKph: 0, toKph: 200 },
  // La reprise 80-120 est la mesure de référence en France : c'est elle qui
  // parle d'un dépassement réel, et elle se fait sur un seul rapport.
  { mode: '80-120', label: '80-120', hint: 'Reprise de 80 à 120 km/h, la mesure du dépassement', kind: 'speed', fromKph: 80, toKph: 120 },
  { mode: '1000m', label: '1000 m', hint: 'Le kilomètre départ arrêté', kind: 'distance', fromKph: 0, distanceM: 1000 },
];

export const runModeDef = (mode: RunMode): RunModeDef =>
  RUN_MODES.find((m) => m.mode === mode) ?? RUN_MODES[0];

/**
 * Les épreuves proposées en tête de liste sur l'écran d'accueil.
 * Les sept modes existent, mais en afficher sept d'un coup noie l'utilisateur.
 */
export const COMMON_MODES: RunMode[] = ['0-100', '80-120', '402m', '100-200'];

/** Un instant du run, échantillonné à la cadence du GPS (25 Hz visés). */
export interface RunSample {
  /** Millisecondes depuis le départ. */
  ms: number;
  /** Vitesse réelle, mesurée au GPS (km/h). */
  speedKph: number;
  /** Vitesse lue aux roues par l'OBD (km/h). L'écart révèle le patinage. */
  wheelSpeedKph: number | null;
  /** Distance parcourue depuis le départ (m), intégrée depuis la vitesse GPS. */
  distanceM: number;
  rpm: number | null;
  /** Suralimentation (bar). */
  boostBar: number | null;
  advanceDeg: number | null;
  iatC: number | null;
  /** Rapport engagé, estimé par le rapport régime/vitesse. */
  gear: number | null;
  throttlePct: number | null;
}

/** Conditions atmosphériques au moment du run, pour la correction météo. */
export interface RunConditions {
  /** Température d'air ambiant (°C). */
  airC: number;
  /** Pression atmosphérique (kPa). */
  baroKpa: number;
  /** Humidité relative (%). Estimée si non mesurée. */
  humidityPct: number;
  /** Altitude (m). */
  altitudeM: number;
  /**
   * Densité de l'air par rapport aux conditions standard, en pourcentage.
   * −3,8 % veut dire « l'air est 3,8 % moins dense que la référence ».
   */
  densityDeltaPct: number;
  /** Facteur de correction appliqué au chrono. */
  correctionFactor: number;
}

/** Un repère de passage de rapport détecté dans le run. */
export interface ShiftEvent {
  /** Millisecondes depuis le départ. */
  ms: number;
  from: number;
  to: number;
  /** Durée de la coupure de couple (ms). */
  durationMs: number;
}

/** Un événement notable : cliquetis, retard d'avance, patinage. */
export interface RunIncident {
  ms: number;
  kind: 'knock' | 'retard' | 'slip' | 'lean' | 'overheat';
  /** Message en français, prêt à afficher. */
  message: string;
  /** Sévérité : `warn` on note, `danger` on arrête le run. */
  severity: 'info' | 'warn' | 'danger';
  /** Valeur associée (degrés de retard, % de patinage…). */
  value?: number;
}

/**
 * D'où vient la vitesse qui a servi au chrono.
 * Déterminant pour la confiance accordée au résultat.
 */
export type SpeedSource = 'gps' | 'obd';

/** Un run terminé et archivé. */
export interface RunRecord {
  id: string;
  /** Numéro affiché à l'utilisateur (« Run #48 »). */
  number: number;
  mode: RunMode;
  /** Horodatage du départ. */
  startedAt: number;
  /** Chrono brut, en secondes. `null` si le run a été arrêté. */
  timeS: number | null;
  /** Chrono corrigé des conditions météo, en secondes. */
  correctedS: number | null;
  /** Vitesse en fin de parcours (épreuves de distance), km/h. */
  trapKph: number | null;
  /** Le run a-t-il été interrompu, et pourquoi ? */
  abortedReason: string | null;
  conditions: RunConditions;
  samples: RunSample[];
  shifts: ShiftEvent[];
  incidents: RunIncident[];
  /** Patinage moyen sur les six premiers dixièmes (%). */
  launchSlipPct: number;
  /** Est-ce le meilleur temps de cette épreuve ? Recalculé à l'archivage. */
  isRecord: boolean;
  /** Niveau de préparation du véhicule au moment du run. */
  prep: string;

  /* ── Champs ajoutés pour les intermédiaires et la confiance de mesure ──
     Tous optionnels : les runs enregistrés avant leur introduction restent
     lisibles, et l'évaluation de confiance sait dire « non renseigné ». */

  /** Temps intermédiaires calculés à la clôture du run. */
  splits?: Split[];
  /** GPS ou compteur : change la confiance accordée au chrono. */
  speedSource?: SpeedSource;
  /** Cadence d'échantillonnage réellement obtenue (Hz). */
  sampleHz?: number;
  /** Pire précision GPS observée pendant le run (m). */
  gpsAccuracyM?: number | null;
  /** Dénivelé entre le départ et l'arrivée (m). Négatif = descente. */
  altitudeDeltaM?: number | null;
  /** Temps de réaction au sapin de départ, si l'arbre a été utilisé (s). */
  reactionS?: number | null;
}

/**
 * L'épreuve la plus pratiquée. On ne mélange jamais les épreuves (un 0-100 et
 * un 402 m n'ont rien à voir) : quand l'écran ne précise pas laquelle, c'est
 * sur celle-ci que se lisent le record, la moyenne et la tendance.
 */
export function mainMode(runs: RunRecord[]): RunMode | null {
  const counts = new Map<RunMode, number>();
  for (const r of runs) counts.set(r.mode, (counts.get(r.mode) ?? 0) + 1);
  let best: RunMode | null = null;
  for (const [mode, n] of counts) if (best === null || n > counts.get(best)!) best = mode;
  return best;
}
