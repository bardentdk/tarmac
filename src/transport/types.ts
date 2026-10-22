/**
 * types.ts — le contrat du « livreur » (étage 1 de l'architecture).
 *
 * Un transport ne comprend RIEN à l'OBD. Il transporte des octets, comme un
 * coursier qui livre un colis sans savoir ce qu'il y a dedans. C'est ce qui
 * permet au reste de l'app de ne jamais savoir si on parle en Bluetooth basse
 * consommation, en Bluetooth classique, en Wi-Fi ou à un faux boîtier.
 *
 * Toute nouvelle façon de parler à un boîtier (demain : le protocole binaire
 * de la Tarmac Box) s'ajoute en implémentant cette seule interface.
 */

/** Les états possibles d'un « tuyau » vers le boîtier. */
export type TransportState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export type TransportKind = 'ble' | 'classic' | 'wifi' | 'mock';

/** Un boîtier trouvé pendant la recherche. */
export interface DiscoveredDevice {
  /** Adresse MAC (Android), UUID (iOS) ou « ip:port » (Wi-Fi). */
  id: string;
  name: string | null;
  kind: TransportKind;
  /** Force du signal, uniquement en BLE. */
  rssi?: number;
  /** Le nom ressemble-t-il à un boîtier OBD ? Sert à trier la liste. */
  likelyObd: boolean;
  /** Déjà appairé dans les réglages du système (Bluetooth classique). */
  paired?: boolean;
}

/** Le contrat que chaque transport doit respecter. */
export interface ObdTransport {
  readonly kind: TransportKind;
  readonly state: TransportState;

  connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void>;
  disconnect(): Promise<void>;

  /** Envoie des octets bruts. Le transport découpe lui-même selon le MTU. */
  write(data: Uint8Array): Promise<void>;

  /** Reçoit des octets bruts, morceau par morceau (une réponse peut arriver en plusieurs morceaux). */
  onData(listener: (chunk: Uint8Array) => void): () => void;

  /** Prévient quand l'état change (surtout : déconnexion inattendue). */
  onStateChange(listener: (state: TransportState, error?: Error) => void): () => void;
}

/** Un transport capable de chercher des boîtiers autour de lui. */
export interface ObdScanner {
  /**
   * Lance la recherche. Rappelle `onFound` à chaque boîtier vu (plusieurs fois
   * pour le même, avec un RSSI à jour). Renvoie la fonction d'arrêt.
   */
  scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: Error) => void): Promise<() => void>;
}

/**
 * Noms qui trahissent un boîtier OBD. Liste volontairement large : mieux vaut
 * remonter un appareil de trop que de cacher le bon boîtier à l'utilisateur.
 */
const OBD_NAME_HINTS = [
  'obd', 'elm', 'elm327', 'vgate', 'veepeak', 'viecar', 'konnwei', 'carista',
  'obdlink', 'icar', 'vlinker', 'obdii', 'obd2', 'tarmac', 'kw9', 'ios-vlink',
  'carly', 'autophix', 'ancel', 'bafx', 'scantool',
];

/** Un nom de boîtier ressemble-t-il à un boîtier OBD ? */
export function looksLikeObd(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().replace(/[\s_-]/g, '');
  return OBD_NAME_HINTS.some((h) => n.includes(h));
}

/** Convertit un RSSI (dBm) en 0-4 barres. */
export function rssiToBars(rssi: number | undefined): 0 | 1 | 2 | 3 | 4 {
  if (rssi === undefined) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  if (rssi >= -90) return 1;
  return 0;
}

/** ASCII → octets. Les commandes ELM327 sont toujours de l'ASCII pur. */
export function toBytes(ascii: string): Uint8Array {
  const out = new Uint8Array(ascii.length);
  for (let i = 0; i < ascii.length; i++) out[i] = ascii.charCodeAt(i) & 0xff;
  return out;
}

/** Octets → ASCII. */
export function fromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * Socle commun aux transports : gestion des abonnés et de l'état.
 * Évite de réécrire quatre fois la même plomberie d'événements.
 */
export abstract class BaseTransport implements ObdTransport {
  abstract readonly kind: TransportKind;

  private _state: TransportState = 'idle';
  private dataListeners = new Set<(c: Uint8Array) => void>();
  private stateListeners = new Set<(s: TransportState, e?: Error) => void>();

  get state(): TransportState {
    return this._state;
  }

  protected setState(s: TransportState, e?: Error): void {
    if (this._state === s && !e) return;
    this._state = s;
    this.stateListeners.forEach((l) => l(s, e));
  }

  protected emitData(chunk: Uint8Array): void {
    this.dataListeners.forEach((l) => l(chunk));
  }

  onData(listener: (chunk: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onStateChange(listener: (state: TransportState, error?: Error) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** À appeler quand on jette le transport : libère tous les abonnements. */
  protected clearListeners(): void {
    this.dataListeners.clear();
    this.stateListeners.clear();
  }

  abstract connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract write(data: Uint8Array): Promise<void>;
}
