/**
 * weather.ts — remettre tous les runs sur un pied d'égalité.
 *
 * Un moteur ne fait pas la même puissance selon l'air qu'il respire. Un matin
 * frais à 15 °C, l'air est dense : beaucoup d'oxygène par litre, donc beaucoup
 * de puissance. Un après-midi à 32 °C avec 80 % d'humidité, à La Réunion, le
 * même moteur perd facilement 5 %. Comparer deux chronos sans corriger ça,
 * c'est comparer deux pesées sur deux balances différentes.
 *
 * On utilise la correction utilisée par la norme SAE J1349, simplifiée :
 *   · on calcule la pression d'air SEC (la vapeur d'eau prend la place de
 *     l'oxygène sans en apporter) ;
 *   · on compare à des conditions de référence ;
 *   · on en tire un facteur appliqué au chrono.
 *
 * Toutes les formules sont documentées ligne par ligne. Aucune n'est inventée.
 */
import type { RunConditions } from './types';

/** Conditions de référence SAE J1349 : 25 °C, 99 kPa d'air sec. */
const REF_TEMP_K = 298.15;
const REF_DRY_KPA = 99.0;

/**
 * Pression de vapeur saturante de l'eau, en kPa (formule de Magnus-Tetens).
 * Elle dit combien de vapeur d'eau l'air PEUT contenir à cette température.
 */
export function saturationVaporKpa(tempC: number): number {
  return 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Densité relative de l'air, en pourcentage par rapport à la référence.
 * Négatif = air moins dense que la référence, donc moins de puissance.
 */
export function airDensityDeltaPct(airC: number, baroKpa: number, humidityPct: number): number {
  const tempK = airC + 273.15;
  // La vapeur d'eau présente, déduite de l'humidité relative.
  const vaporKpa = saturationVaporKpa(airC) * (humidityPct / 100);
  // La part de la pression qui correspond réellement à de l'air sec.
  const dryKpa = Math.max(1, baroKpa - vaporKpa);
  // Loi des gaz parfaits : densité proportionnelle à P/T.
  const ratio = (dryKpa / REF_DRY_KPA) * (REF_TEMP_K / tempK);
  return (ratio - 1) * 100;
}

/**
 * Facteur de correction du chrono.
 *
 * Un air 4 % moins dense coûte environ 4 % de puissance, mais pas 4 % de
 * chrono : le temps d'accélération varie moins que la puissance (l'inertie et
 * les frottements ne changent pas). L'exposant 0,5 reflète cette atténuation —
 * c'est l'ordre de grandeur retenu par les apps de drag du marché.
 *
 * Facteur < 1 = les conditions étaient DÉFAVORABLES, le temps corrigé est donc
 * meilleur que le temps brut.
 */
export function correctionFactor(densityDeltaPct: number): number {
  const d = densityDeltaPct / 100;
  const f = Math.pow(1 + d, 0.5);
  // On borne la correction à ±8 % : au-delà, c'est une erreur de mesure, et il
  // vaut mieux afficher un temps brut qu'un temps corrigé fantaisiste.
  return Math.max(0.92, Math.min(1.08, f));
}

/**
 * Construit les conditions d'un run à partir de ce qu'on sait mesurer.
 *
 * L'app lit la pression atmosphérique par le PID 33 et la température d'air
 * par le PID 0F. Attention : le capteur d'air d'admission est DANS le moteur,
 * donc plus chaud que l'air ambiant dès qu'on a roulé. On applique une
 * correction empirique, et on le dit.
 *
 * L'humidité n'est pas mesurable par l'OBD : on prend une valeur par défaut
 * raisonnable, surchargeable par une météo en ligne plus tard.
 */
export function buildConditions(opts: {
  /** Température d'air d'admission lue par le PID 0F (°C). */
  iatC: number | null;
  /** Pression atmosphérique lue par le PID 33 (kPa). */
  baroKpa: number | null;
  /** Humidité relative (%), si connue. */
  humidityPct?: number;
  /** Altitude GPS (m), si connue. */
  altitudeM?: number;
  /** La voiture roulait-elle depuis un moment ? L'admission est alors chaude. */
  warmedUp?: boolean;
}): RunConditions {
  const baroKpa = opts.baroKpa ?? 101;
  const humidityPct = opts.humidityPct ?? 70;
  // L'admission d'un moteur suralimenté est toujours plus chaude que l'air
  // ambiant. On retire quelques degrés pour estimer l'air réellement ambiant.
  const raw = opts.iatC ?? 25;
  const airC = opts.warmedUp ? Math.max(raw - 12, raw * 0.62) : raw;

  const densityDeltaPct = airDensityDeltaPct(airC, baroKpa, humidityPct);

  // Altitude estimée depuis la pression si le GPS ne la donne pas
  // (formule barométrique simplifiée, valable près du sol).
  const altitudeM = opts.altitudeM ?? Math.max(0, Math.round((1013.25 - baroKpa * 10) * 8.3));

  return {
    airC: Math.round(airC * 10) / 10,
    baroKpa: Math.round(baroKpa),
    humidityPct: Math.round(humidityPct),
    altitudeM,
    densityDeltaPct: Math.round(densityDeltaPct * 10) / 10,
    correctionFactor: correctionFactor(densityDeltaPct),
  };
}

/** Applique la correction à un chrono brut. */
export function correctTime(timeS: number | null, c: RunConditions): number | null {
  if (timeS === null) return null;
  return Math.round(timeS * c.correctionFactor * 1000) / 1000;
}

/** Phrase prête à afficher : « Air −3,8 % moins dense que standard ». */
export function describeConditions(c: RunConditions): { headline: string; detail: string } {
  const sign = c.densityDeltaPct < 0 ? '−' : '+';
  const abs = Math.abs(c.densityDeltaPct).toFixed(1).replace('.', ',');
  const sense = c.densityDeltaPct < 0 ? 'moins' : 'plus';
  return {
    headline: `Air ${sign}${abs} % ${sense} dense que standard`,
    detail: `${Math.round(c.airC)} °C · ${c.humidityPct} % humidité · ${c.altitudeM} m — temps corrigés auto`,
  };
}
