/**
 * types.ts — ce qu'est un « run » pour Tarmac.
 *
 * Un run, c'est une mesure : un départ, une arrivée, un chrono, et surtout
 * tout ce qui s'est passé entre les deux. C'est ce « entre les deux » qui fait
 * la différence avec un simple chronomètre : c'est là que se trouve la réponse
 * à « pourquoi ce run était lent ».
 */

/** Les épreuves que l'app sait chronométrer. */
export type RunMode = '0-100' | '100-200' | '402m' | '60ft';

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
];

export const runModeDef = (mode: RunMode): RunModeDef =>
  RUN_MODES.find((m) => m.mode === mode) ?? RUN_MODES[0];

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
}
