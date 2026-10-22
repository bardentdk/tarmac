/**
 * pids.ts — le dictionnaire français ↔ voiture.
 *
 * Un PID (Parameter ID) est un numéro de question normalisé. On demande « 0C »
 * et le calculateur répond deux octets qu'il faut convertir : (256×A + B) / 4
 * donne le régime en tours/minute. Sans ce dictionnaire, on lirait « 1A F8 »
 * au lieu de « 1 726 tr/min ».
 *
 * Les formules viennent de la norme SAE J1979 (mode 01) et sont vérifiables :
 * aucune n'est inventée. Les PID constructeur, eux, vivent dans `vagDids.ts`
 * et sont tous marqués « À VÉRIFIER ».
 */

/** Les grandeurs que l'app sait afficher. Une clé = une tuile, une courbe. */
export type MetricKey =
  | 'rpm'
  | 'speed'
  | 'map'
  | 'advance'
  | 'throttle'
  | 'load'
  | 'coolant'
  | 'iat'
  | 'oil'
  | 'baro'
  | 'voltage'
  | 'maf'
  | 'fuelTrimShort'
  | 'fuelTrimLong'
  | 'lambda'
  | 'dsgTemp'
  | 'boost'
  | 'gpsSpeed'
  | 'slip'
  | 'gear';

export interface PidDef {
  /** Le PID sur deux caractères hexadécimaux, sans le service. */
  pid: string;
  key: MetricKey;
  label: string;
  unit: string;
  /** Nombre d'octets de données attendus. */
  bytes: number;
  /**
   * Conversion des octets en valeur physique.
   * `d[0]` est l'octet A de la norme, `d[1]` l'octet B, etc.
   */
  decode: (d: number[]) => number;
  /**
   * `fast` : relu à chaque tour de boucle (ce qui bouge pendant un run).
   * `slow` : une fois par seconde (températures, tension).
   */
  rate: 'fast' | 'slow';
  /** Bornes plausibles. Hors bornes = trame corrompue, on jette la valeur. */
  min: number;
  max: number;
  /** Nombre de décimales à l'affichage. */
  decimals: number;
}

/** Les PID standards du mode 01 utilisés par Tarmac. */
export const PIDS: PidDef[] = [
  {
    pid: '04', key: 'load', label: 'Charge moteur', unit: '%', bytes: 1,
    decode: (d) => (d[0] * 100) / 255, rate: 'fast', min: 0, max: 100, decimals: 0,
  },
  {
    pid: '05', key: 'coolant', label: 'Liquide de refroidissement', unit: '°C', bytes: 1,
    decode: (d) => d[0] - 40, rate: 'slow', min: -40, max: 215, decimals: 0,
  },
  {
    pid: '06', key: 'fuelTrimShort', label: 'Correction court terme', unit: '%', bytes: 1,
    decode: (d) => (d[0] - 128) * (100 / 128), rate: 'slow', min: -100, max: 99, decimals: 1,
  },
  {
    pid: '07', key: 'fuelTrimLong', label: 'Correction long terme', unit: '%', bytes: 1,
    decode: (d) => (d[0] - 128) * (100 / 128), rate: 'slow', min: -100, max: 99, decimals: 1,
  },
  {
    pid: '0B', key: 'map', label: 'Pression admission', unit: 'kPa', bytes: 1,
    decode: (d) => d[0], rate: 'fast', min: 0, max: 255, decimals: 0,
  },
  {
    pid: '0C', key: 'rpm', label: 'Régime', unit: 'tr/min', bytes: 2,
    decode: (d) => (256 * d[0] + d[1]) / 4, rate: 'fast', min: 0, max: 16383, decimals: 0,
  },
  {
    pid: '0D', key: 'speed', label: 'Vitesse', unit: 'km/h', bytes: 1,
    decode: (d) => d[0], rate: 'fast', min: 0, max: 255, decimals: 0,
  },
  {
    pid: '0E', key: 'advance', label: 'Avance à l\'allumage', unit: '°', bytes: 1,
    decode: (d) => d[0] / 2 - 64, rate: 'fast', min: -64, max: 63.5, decimals: 1,
  },
  {
    pid: '0F', key: 'iat', label: 'Air d\'admission', unit: '°C', bytes: 1,
    decode: (d) => d[0] - 40, rate: 'slow', min: -40, max: 215, decimals: 0,
  },
  {
    pid: '10', key: 'maf', label: 'Débit d\'air', unit: 'g/s', bytes: 2,
    decode: (d) => (256 * d[0] + d[1]) / 100, rate: 'fast', min: 0, max: 655.35, decimals: 1,
  },
  {
    pid: '11', key: 'throttle', label: 'Papillon', unit: '%', bytes: 1,
    decode: (d) => (d[0] * 100) / 255, rate: 'fast', min: 0, max: 100, decimals: 0,
  },
  {
    pid: '24', key: 'lambda', label: 'Richesse (sonde 1)', unit: 'λ', bytes: 4,
    // Les deux premiers octets portent le rapport air/essence normalisé.
    decode: (d) => ((256 * d[0] + d[1]) * 2) / 65536, rate: 'fast', min: 0, max: 2, decimals: 2,
  },
  {
    pid: '33', key: 'baro', label: 'Pression atmosphérique', unit: 'kPa', bytes: 1,
    decode: (d) => d[0], rate: 'slow', min: 0, max: 255, decimals: 0,
  },
  {
    pid: '42', key: 'voltage', label: 'Tension calculateur', unit: 'V', bytes: 2,
    decode: (d) => (256 * d[0] + d[1]) / 1000, rate: 'slow', min: 0, max: 65.5, decimals: 1,
  },
  {
    // Souvent absent sur les moteurs VW : le masque 0140 dira si on peut le demander.
    pid: '5C', key: 'oil', label: 'Huile moteur', unit: '°C', bytes: 1,
    decode: (d) => d[0] - 40, rate: 'slow', min: -40, max: 215, decimals: 0,
  },
];

export const PID_BY_ID: Record<string, PidDef> = Object.fromEntries(PIDS.map((p) => [p.pid, p]));
export const PID_BY_KEY: Record<string, PidDef> = Object.fromEntries(PIDS.map((p) => [p.key, p]));

/** Les PID interrogés à chaque tour de boucle pendant un run. */
export const FAST_PIDS = PIDS.filter((p) => p.rate === 'fast').map((p) => p.pid);
/** Les PID interrogés une fois par seconde. */
export const SLOW_PIDS = PIDS.filter((p) => p.rate === 'slow').map((p) => p.pid);

/**
 * Grandeurs calculées, pas lues : elles n'ont pas de PID.
 * Le boost, par exemple, c'est la pression d'admission moins la pression
 * atmosphérique — ce que le turbo ajoute réellement.
 */
export const DERIVED_LABELS: Partial<Record<MetricKey, { label: string; unit: string; decimals: number }>> = {
  boost: { label: 'Suralimentation', unit: 'bar', decimals: 2 },
  gpsSpeed: { label: 'Vitesse GPS', unit: 'km/h', decimals: 0 },
  slip: { label: 'Patinage', unit: '%', decimals: 0 },
  gear: { label: 'Rapport', unit: '', decimals: 0 },
  dsgTemp: { label: 'Boîte DSG', unit: '°C', decimals: 0 },
};

/** Libellé + unité d'une grandeur, lue ou calculée. */
export function metricInfo(key: MetricKey): { label: string; unit: string; decimals: number } {
  const p = PID_BY_KEY[key];
  if (p) return { label: p.label, unit: p.unit, decimals: p.decimals };
  return DERIVED_LABELS[key] ?? { label: key, unit: '', decimals: 0 };
}

/**
 * Pression de suralimentation affichée, en bar.
 * MAP est une pression ABSOLUE : à l'arrêt elle vaut la pression atmosphérique
 * (environ 100 kPa). Le boost est donc la différence, divisée par 100 pour
 * passer en bar.
 */
export function boostBar(mapKpa: number | null, baroKpa: number | null): number | null {
  if (mapKpa === null) return null;
  const baro = baroKpa ?? 101;
  return (mapKpa - baro) / 100;
}

/**
 * Masques de PID supportés. Le calculateur répond à `0100` par quatre octets
 * où chaque bit dit « je sais répondre au PID numéro n ». On évite ainsi de
 * demander 20 fois une donnée qui n'existe pas (et 20 `NO DATA` à 2 s chacun).
 */
export function decodeSupportMask(baseHex: string, dataHex: string): string[] {
  const base = parseInt(baseHex, 16); // 0x00, 0x20, 0x40, 0x60
  const bytes = hexToBytes(dataHex);
  if (bytes.length < 4) return [];
  const supported: string[] = [];
  for (let b = 0; b < 4; b++) {
    for (let bit = 0; bit < 8; bit++) {
      // Le bit de poids fort du premier octet correspond au PID base+1.
      if (bytes[b] & (0x80 >> bit)) {
        const pid = base + b * 8 + bit + 1;
        supported.push(pid.toString(16).toUpperCase().padStart(2, '0'));
      }
    }
  }
  return supported;
}

/** « 1AF8 » devient [0x1A, 0xF8]. */
export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}
