/**
 * storage.ts — la mémoire de l'app entre deux lancements.
 *
 * On utilise MMKV : c'est un stockage clé/valeur SYNCHRONE. La différence est
 * capitale ici : on a besoin de relire le dernier boîtier utilisé pendant la
 * phase de connexion, sans `await`, au milieu d'un code qui doit aller vite.
 * Avec un stockage asynchrone, il faudrait attendre, et l'app perdrait une
 * demi-seconde au démarrage.
 *
 * MMKV v4 repose sur du code natif (Nitro). Sur le web, dans Expo Go ou en
 * test, il n'existe pas : on bascule alors sur une mémoire volatile. L'app
 * fonctionne, elle oublie simplement ses réglages en se fermant — c'est le bon
 * compromis, plutôt qu'un écran blanc.
 */

/** Le contrat minimal qu'on utilise de MMKV. Permet d'avoir un substitut. */
interface KeyValue {
  set(key: string, value: boolean | string | number): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;
}

/** Substitut en mémoire : même interface, aucune persistance. */
function volatileStore(): KeyValue {
  const m = new Map<string, boolean | string | number>();
  return {
    set: (k, v) => void m.set(k, v),
    getString: (k) => m.get(k) as string | undefined,
    getNumber: (k) => m.get(k) as number | undefined,
    getBoolean: (k) => m.get(k) as boolean | undefined,
    delete: (k) => void m.delete(k),
    contains: (k) => m.has(k),
    getAllKeys: () => [...m.keys()],
    clearAll: () => m.clear(),
  };
}

let kv: KeyValue;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMMKV } = require('react-native-mmkv');
  kv = createMMKV({ id: 'tarmac' }) as KeyValue;
} catch {
  kv = volatileStore();
}

export const storage = kv;

/* ───────────────────── Lecture / écriture d'objets ───────────────────── */

function readJson<T>(key: string, fallback: T): T {
  const raw = kv.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Donnée corrompue : on la jette plutôt que de planter au démarrage.
    kv.delete(key);
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  kv.set(key, JSON.stringify(value));
}

/* ───────────────────────── Dernier boîtier utilisé ───────────────────── */

export interface LastDevice {
  id: string;
  name: string | null;
  kind: 'ble' | 'classic' | 'wifi' | 'mock';
  usedAt: number;
}

const K_LAST = 'device.last';

export const rememberLastDevice = (d: Omit<LastDevice, 'usedAt'>) =>
  writeJson(K_LAST, { ...d, usedAt: Date.now() } satisfies LastDevice);

export const recallLastDevice = (): LastDevice | null => readJson<LastDevice | null>(K_LAST, null);

export const forgetLastDevice = () => kv.delete(K_LAST);

/* ───────────────────────── Profil BLE par boîtier ───────────────────── */

export interface SavedBleProfile {
  profileName: string;
  service: string;
  notify: string;
  write: string;
  withoutResponse: boolean;
}

const bleKey = (id: string) => `ble.profile.${id}`;

/**
 * Mémorise le couple de caractéristiques qui a fonctionné pour CE boîtier.
 * La deuxième connexion n'a plus besoin d'essayer les profils un par un, ni de
 * partir en exploration : on économise environ 400 ms et quelques échecs.
 */
export const rememberBleProfile = (deviceId: string, p: SavedBleProfile) => writeJson(bleKey(deviceId), p);

export const recallBleProfile = (deviceId: string): SavedBleProfile | null =>
  readJson<SavedBleProfile | null>(bleKey(deviceId), null);

export const forgetBleProfile = (deviceId: string) => kv.delete(bleKey(deviceId));

/* ───────────────────── Fiche de capacités par boîtier ───────────────── */

const capsKey = (id: string) => `caps.${id}`;

export function rememberCaps(deviceId: string, caps: unknown): void {
  writeJson(capsKey(deviceId), caps);
}

export function recallCaps<T>(deviceId: string): T | null {
  return readJson<T | null>(capsKey(deviceId), null);
}

/* ───────────────────────── Adresses Wi-Fi ajoutées ───────────────────── */

export interface WifiTarget {
  host: string;
  port: number;
  label: string;
}

const K_WIFI = 'wifi.targets';

export const getWifiTargets = (): WifiTarget[] => readJson<WifiTarget[]>(K_WIFI, []);

export function addWifiTarget(t: WifiTarget): void {
  const list = getWifiTargets().filter((x) => !(x.host === t.host && x.port === t.port));
  writeJson(K_WIFI, [t, ...list].slice(0, 8));
}

/* ───────────────────────── Réglages de l'app ───────────────────────── */

export interface AppSettings {
  /** Se reconnecter tout seul au dernier boîtier à l'ouverture. */
  autoReconnect: boolean;
  /** `vw-can` impose ISO 15765-4 CAN 11 bits / 500 kbit/s. */
  protocol: 'auto' | 'vw-can';
  /** Grandeurs à interroger. Vide = la sélection par défaut. */
  enabledPids: string[];
  /** Alertes moteur. */
  alertKnock: boolean;
  alertTemps: boolean;
  alertLean: boolean;
  /** Communauté. */
  showInRanking: boolean;
  hideRunLocation: boolean;
  /** Service au premier plan sur Android (garde la connexion écran éteint). */
  foregroundService: boolean;
  /** Profil du boîtier simulé utilisé en mode démo. */
  mockProfile: 'sage' | 'clone' | 'cauchemar';
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoReconnect: true,
  protocol: 'vw-can',
  enabledPids: [],
  alertKnock: true,
  alertTemps: true,
  alertLean: true,
  showInRanking: true,
  hideRunLocation: false,
  foregroundService: true,
  mockProfile: 'clone',
};

const K_SETTINGS = 'settings';

export const loadSettings = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(K_SETTINGS, {}) });

export const saveSettings = (s: AppSettings) => writeJson(K_SETTINGS, s);

/* ───────────────────────── Fiche du véhicule ───────────────────────── */

export type PrepLevel = 'origine' | 'stage1' | 'stage2' | 'autre';

export interface VehicleProfile {
  /** Lu automatiquement par le VIN quand c'est possible. */
  vin: string | null;
  label: string;
  details: string;
  prep: PrepLevel;
  /** Masse en ordre de marche, conducteur inclus (kg). Sert au dyno virtuel. */
  massKg: number;
  tyres: string;
  tunerEmail: string;
  /** Nom du boîtier associé, affiché dans les réglages. */
  dongleName: string | null;
}

export const DEFAULT_VEHICLE: VehicleProfile = {
  vin: null,
  label: 'Seat Ibiza FR 1.5 TSI',
  details: 'DSG7 · 2021 · Moteur DADA',
  prep: 'stage1',
  massKg: 1290,
  tyres: '215/45 R18',
  tunerEmail: '',
  dongleName: null,
};

const K_VEHICLE = 'vehicle';

export const loadVehicle = (): VehicleProfile => ({ ...DEFAULT_VEHICLE, ...readJson<Partial<VehicleProfile>>(K_VEHICLE, {}) });

export const saveVehicle = (v: VehicleProfile) => writeJson(K_VEHICLE, v);

/* ───────────────────────── Parcours d'accueil ───────────────────────── */

const K_ONBOARDED = 'onboarded';

export const isOnboarded = (): boolean => kv.getBoolean(K_ONBOARDED) === true;
export const setOnboarded = (v: boolean) => kv.set(K_ONBOARDED, v);

/* ───────────────────────── Historique des runs ───────────────────────── */

const K_RUNS = 'runs';

export function readRuns<T>(): T[] {
  return readJson<T[]>(K_RUNS, []);
}

export function writeRuns(runs: unknown[]): void {
  // On garde 200 runs : au-delà, l'historique n'apporte plus rien et le JSON
  // devient lourd à relire au démarrage.
  writeJson(K_RUNS, runs.slice(0, 200));
}

/** Pseudo affiché dans le classement. */
const K_PSEUDO = 'pseudo';
export const loadPseudo = (): string => kv.getString(K_PSEUDO) ?? '';
export const savePseudo = (v: string) => kv.set(K_PSEUDO, v);
