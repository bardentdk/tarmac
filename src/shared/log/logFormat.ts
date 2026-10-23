/**
 * logFormat.ts — le format d'un enregistrement de session.
 *
 * Un « log », au sens où l'entend un préparateur, c'est un tableau : une ligne
 * par instant, une colonne par grandeur. Il le charge dans un tableur ou dans
 * son outil de cartographie, et il cherche à l'œil l'endroit où quelque chose
 * déraille.
 *
 * Deux contraintes ont dicté le format :
 *
 *   1. **Il doit s'ouvrir chez le mappeur sans mode d'emploi.** D'où du CSV
 *      avec un en-tête de commentaires, le point-virgule comme séparateur (les
 *      tableurs français l'attendent) et le point décimal (les outils
 *      d'analyse l'attendent).
 *
 *   2. **Il doit tenir en mémoire pendant l'enregistrement.** On stocke donc
 *      les colonnes dans des tableaux de nombres plutôt qu'un objet par ligne :
 *      une demi-heure à 20 Hz fait 36 000 lignes, soit 36 000 objets évités.
 */
import type { MetricKey } from '@/obd/pids';
import { metricInfo } from '@/obd/pids';

/** Ce qui a lancé l'enregistrement. */
export type LogTrigger = 'manuel' | 'pleine-charge' | 'run';

/** Un repère posé dans le log, à la main ou automatiquement. */
export interface LogMarker {
  /** Millisecondes depuis le début du log. */
  ms: number;
  label: string;
  /** `auto` : posé par l'app (passage de rapport, alarme). */
  source: 'manuel' | 'auto';
}

/** Statistiques d'une colonne, calculées à la clôture. */
export interface LogColumnStats {
  min: number;
  max: number;
  avg: number;
  /** Nombre de cases réellement remplies (une grandeur peut manquer). */
  filled: number;
}

/**
 * La fiche d'un log, telle qu'elle est persistée dans l'index.
 * Elle contient de quoi afficher la liste SANS relire le fichier de données.
 */
export interface LogMeta {
  id: string;
  name: string;
  startedAt: number;
  durationMs: number;
  /** Nombre de lignes. */
  rows: number;
  /** Cadence réelle obtenue (Hz). */
  rateHz: number;
  keys: MetricKey[];
  trigger: LogTrigger;
  markers: LogMarker[];
  stats: Partial<Record<MetricKey, LogColumnStats>>;
  /** Taille du fichier CSV (octets). */
  bytes: number;
  vehicleLabel: string;
  prep: string;
  /** Nom du boîtier utilisé : utile quand on compare deux logs. */
  dongle: string | null;
  /** Le log a-t-il été tronqué par la limite de mémoire ? */
  truncated: boolean;
}

/** Les données d'un log, une fois relues. */
export interface LogData {
  /** Horodatages relatifs au début, en millisecondes. */
  ms: number[];
  /** Une colonne par grandeur. `NaN` quand la valeur manquait. */
  columns: Partial<Record<MetricKey, number[]>>;
}

/**
 * Les grandeurs enregistrées par défaut.
 *
 * On prend tout ce qui bouge pendant un run, plus les températures : c'est
 * précisément la combinaison qui permet d'expliquer un chrono. Les lentes ne
 * coûtent presque rien en taille de fichier puisqu'elles changent peu.
 */
export const DEFAULT_LOG_KEYS: MetricKey[] = [
  'rpm',
  'speed',
  'gpsSpeed',
  'boost',
  'map',
  'throttle',
  'load',
  'advance',
  'lambda',
  'maf',
  'iat',
  'coolant',
  'oil',
  'voltage',
  'fuelTrimShort',
  'fuelTrimLong',
  'slip',
];

/** Nombre de décimales à écrire pour chaque grandeur. */
function decimalsFor(key: MetricKey): number {
  const d = metricInfo(key).decimals;
  // Le boost et la richesse méritent une décimale de plus dans un fichier
  // destiné à l'analyse : on y cherche des variations fines.
  if (key === 'boost' || key === 'lambda') return Math.max(3, d);
  return d;
}

/** En-tête de colonne lisible : `regime_trmin`, `admission_c`… */
export function columnName(key: MetricKey): string {
  const { label, unit } = metricInfo(key);
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  return unit ? `${slug(label)}_${slug(unit)}` : slug(label);
}

/** Construit le CSV complet, en-tête de commentaires inclus. */
export function logToCsv(meta: LogMeta, data: LogData): string {
  const head = ['ms', ...meta.keys.map(columnName)].join(';');

  const lines: string[] = [];
  for (let i = 0; i < data.ms.length; i++) {
    const row: (string | number)[] = [Math.round(data.ms[i])];
    for (const k of meta.keys) {
      const v = data.columns[k]?.[i];
      row.push(v === undefined || Number.isNaN(v) ? '' : v.toFixed(decimalsFor(k)));
    }
    lines.push(row.join(';'));
  }

  const comments = [
    `# Tarmac - log "${meta.name}"`,
    `# debut: ${new Date(meta.startedAt).toISOString()}`,
    `# duree: ${(meta.durationMs / 1000).toFixed(1)} s`,
    `# lignes: ${meta.rows} (${meta.rateHz.toFixed(1)} Hz)`,
    `# declencheur: ${meta.trigger}`,
    `# vehicule: ${meta.vehicleLabel} (${meta.prep})`,
    meta.dongle ? `# boitier: ${meta.dongle}` : null,
    meta.truncated ? '# ATTENTION: log tronque (limite de memoire atteinte)' : null,
    ...meta.markers.map((m) => `# repere ${(m.ms / 1000).toFixed(2)} s: ${m.label}`),
  ].filter(Boolean);

  return [...comments, '', head, ...lines].join('\n');
}

/**
 * Relit un CSV produit par `logToCsv`.
 *
 * Sert à l'écran de visualisation et au rejeu dans le simulateur : un log réel
 * doit pouvoir rejouer un comportement observé sur la voiture.
 */
export function csvToLog(csv: string, keys: MetricKey[]): LogData {
  const lines = csv.split('\n');
  const ms: number[] = [];
  const columns: Partial<Record<MetricKey, number[]>> = {};
  for (const k of keys) columns[k] = [];

  let headerSeen = false;
  let order: MetricKey[] = keys;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (!headerSeen) {
      headerSeen = true;
      // On se fie à l'en-tête réel du fichier plutôt qu'à l'ordre supposé :
      // un log ancien peut avoir été enregistré avec d'autres colonnes.
      const names = line.split(';').slice(1);
      const byName = new Map(keys.map((k) => [columnName(k), k]));
      order = names.map((n) => byName.get(n)).filter((k): k is MetricKey => k !== undefined);
      continue;
    }

    const cells = line.split(';');
    ms.push(Number(cells[0]));
    for (let c = 0; c < order.length; c++) {
      const k = order[c];
      const txt = cells[c + 1];
      columns[k]!.push(txt === undefined || txt === '' ? NaN : Number(txt));
    }
  }

  return { ms, columns };
}

/**
 * Toutes les grandeurs qu'un log peut contenir. Écrit comme un `Record` pour
 * que le compilateur réclame toute nouvelle clé de `MetricKey` : un log
 * importé ne doit jamais perdre une colonne parce qu'on l'a oubliée ici.
 */
const KNOWN_KEYS: Record<MetricKey, true> = {
  rpm: true, speed: true, map: true, advance: true, throttle: true, load: true, coolant: true,
  iat: true, oil: true, baro: true, voltage: true, maf: true, fuelTrimShort: true,
  fuelTrimLong: true, lambda: true, dsgTemp: true, boost: true, gpsSpeed: true, slip: true, gear: true,
};
const ALL_LOG_KEYS = Object.keys(KNOWN_KEYS) as MetricKey[];

/** Un log relu depuis un fichier : la fiche sans ce que seul l'index connaît. */
export interface ParsedLog {
  meta: Omit<LogMeta, 'id' | 'stats' | 'bytes'>;
  data: LogData;
}

/**
 * Relit un CSV complet — en-tête de commentaires compris — pour l'importer.
 *
 * Contrairement à `csvToLog`, on ne connaît rien d'avance : les grandeurs se
 * déduisent de l'en-tête, la fiche des commentaires. On refuse tout fichier
 * qui n'a pas la signature d'un log Tarmac plutôt que de deviner : un tableur
 * quelconque donnerait un log vide ou, pire, des colonnes mal attribuées.
 * Lève une `Error` au message affichable tel quel.
 */
export function parseLogCsv(csv: string): ParsedLog {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  const first = lines.find((l) => l !== '') ?? '';

  if (first.startsWith('# Tarmac - run')) {
    throw new Error('Ce fichier est un export de run, pas un log. Seuls les logs peuvent être importés.');
  }
  const title = /^# Tarmac - log "(.*)"$/.exec(first);
  if (!title) throw new Error('Ce fichier n’est pas un log Tarmac : la signature « # Tarmac - log » manque en tête.');

  let startedAt = NaN;
  let durationMs = NaN;
  let trigger: LogTrigger = 'manuel';
  let vehicleLabel = '';
  let prep = '';
  let dongle: string | null = null;
  let truncated = false;
  const markers: LogMarker[] = [];
  let header: string | null = null;

  for (const line of lines) {
    if (line === '') continue;
    if (!line.startsWith('#')) {
      header = line;
      break;
    }
    const body = line.slice(1).trim();
    let m: RegExpExecArray | null;
    if ((m = /^debut: (.+)$/.exec(body))) startedAt = Date.parse(m[1]);
    else if ((m = /^duree: ([\d.]+) s$/.exec(body))) durationMs = Number(m[1]) * 1000;
    else if ((m = /^declencheur: (.+)$/.exec(body))) {
      const t = m[1].trim();
      if (t === 'manuel' || t === 'pleine-charge' || t === 'run') trigger = t;
    } else if ((m = /^vehicule: (.*) \((.*)\)$/.exec(body))) {
      vehicleLabel = m[1];
      prep = m[2];
    } else if ((m = /^boitier: (.+)$/.exec(body))) dongle = m[1];
    else if (body.startsWith('ATTENTION: log tronque')) truncated = true;
    else if ((m = /^repere ([\d.]+) s: (.*)$/.exec(body))) {
      // Le fichier ne dit pas qui a posé le repère : on le tient pour manuel.
      markers.push({ ms: Math.round(Number(m[1]) * 1000), label: m[2], source: 'manuel' });
    }
  }

  if (!header || header.split(';')[0] !== 'ms') {
    throw new Error('Log Tarmac illisible : la ligne d’en-tête des colonnes (« ms;… ») est introuvable.');
  }

  const byName = new Map(ALL_LOG_KEYS.map((k) => [columnName(k), k]));
  const keys = header
    .split(';')
    .slice(1)
    .map((n) => byName.get(n))
    .filter((k): k is MetricKey => k !== undefined);
  if (keys.length === 0) throw new Error('Log Tarmac sans aucune grandeur reconnue.');

  const data = csvToLog(csv.replace(/\r/g, ''), keys);
  const rows = data.ms.length;
  if (rows === 0 || data.ms.some((v) => !Number.isFinite(v))) {
    throw new Error(rows === 0 ? 'Ce log ne contient aucune ligne de données.' : 'Log Tarmac corrompu : horodatage illisible.');
  }

  if (!Number.isFinite(durationMs)) durationMs = data.ms[rows - 1];
  return {
    meta: {
      name: title[1],
      // Sans date de début, on prend l'instant de l'import : la liste reste triable.
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      durationMs,
      rows,
      rateHz: (rows / Math.max(1, durationMs)) * 1000,
      keys,
      trigger,
      markers,
      vehicleLabel,
      prep,
      dongle,
      truncated,
    },
    data,
  };
}

/** Taille lisible : « 1,2 Mo » plutôt que « 1258291 ». */
export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Durée lisible : « 2 min 14 s ». */
export function humanDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}
