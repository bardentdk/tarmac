/**
 * WifiTransport.ts — le livreur Wi-Fi.
 *
 * Un ELM327 Wi-Fi crée son propre réseau sans fil et se comporte comme un
 * serveur réseau : on ouvre une connexion TCP vers lui, on écrit des
 * commandes, on lit des réponses. C'est le transport le plus simple des trois.
 *
 * Deux choses à dire à l'utilisateur, et l'écran de connexion s'en charge :
 *   · pendant qu'il est sur le Wi-Fi du boîtier, le téléphone n'a PLUS
 *     Internet (le boîtier ne route rien). C'est normal, et déroutant ;
 *   · sur iPhone, la première connexion déclenche la demande d'autorisation
 *     « réseau local ». Si l'utilisateur refuse, plus rien ne marchera jusqu'à
 *     ce qu'il la réactive dans les réglages système.
 *
 * L'adresse par défaut est `192.168.0.10:35000`, utilisée par la quasi-totalité
 * des boîtiers du marché. Elle reste modifiable dans les réglages.
 */
import {
  BaseTransport,
  type DiscoveredDevice,
  type ObdScanner,
  type TransportKind,
} from './types';
import { consoleLog } from '@/debug/ConsoleLog';
import { getWifiTargets } from '@/store/storage';

/** Adresse d'usine de la grande majorité des ELM327 Wi-Fi. */
export const DEFAULT_WIFI_HOST = '192.168.0.10';
export const DEFAULT_WIFI_PORT = 35000;

/** Autres adresses rencontrées sur le marché. */
export const KNOWN_WIFI_TARGETS: { host: string; port: number; label: string }[] = [
  { host: DEFAULT_WIFI_HOST, port: DEFAULT_WIFI_PORT, label: 'ELM327 Wi-Fi (adresse standard)' },
  { host: '192.168.4.1', port: 35000, label: 'Boîtier ESP (192.168.4.1)' },
  { host: '192.168.0.11', port: 35000, label: 'Variante 192.168.0.11' },
  { host: '10.0.0.10', port: 35000, label: 'Variante 10.0.0.10' },
  // Un émulateur ELM327 sur PC (projet open source « ELM327-emulator ») écoute
  // en général ici : c'est la façon de tester le Wi-Fi sans voiture.
  { host: '127.0.0.1', port: 35000, label: 'Émulateur local (PC)' },
];

/**
 * Une socket TCP, telle que l'expose react-native-tcp-socket.
 * Le module livre les données soit en chaîne, soit en tableau d'octets
 * (un Buffer Node). On décrit la forme minimale dont on a besoin pour éviter
 * de dépendre des types Node dans une app mobile.
 */
type RawData = string | ArrayLike<number>;

interface SocketLike {
  on(event: 'data', cb: (data: RawData) => void): void;
  on(event: 'error', cb: (e: Error) => void): void;
  on(event: 'close', cb: (hadError?: boolean) => void): void;
  on(event: 'connect', cb: () => void): void;
  write(data: string, encoding?: string): boolean;
  destroy(): void;
  setNoDelay?(v: boolean): void;
}

interface TcpModuleLike {
  createConnection(
    opts: { host: string; port: number; timeout?: number; tls?: boolean },
    cb: () => void,
  ): SocketLike;
}

let cachedTcp: TcpModuleLike | null | undefined;

function tcpModule(): TcpModuleLike | null {
  if (cachedTcp !== undefined) return cachedTcp;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-tcp-socket');
    cachedTcp = (mod?.default ?? mod) as TcpModuleLike;
  } catch {
    cachedTcp = null;
  }
  return cachedTcp;
}

/** « ip:port » → { host, port }. */
export function parseWifiId(id: string): { host: string; port: number } {
  const [host, port] = id.split(':');
  return { host: host || DEFAULT_WIFI_HOST, port: Number(port) || DEFAULT_WIFI_PORT };
}

/**
 * Le « scanner » Wi-Fi ne scanne rien : il n'existe aucun moyen de découvrir
 * un boîtier TCP depuis une app mobile. On propose donc la liste des adresses
 * connues plus celles que l'utilisateur a déjà utilisées, et on laisse l'app
 * tester laquelle répond.
 */
export const wifiScanner: ObdScanner = {
  async scan(onFound) {
    const custom = getWifiTargets();
    const all = [...custom, ...KNOWN_WIFI_TARGETS];
    const seen = new Set<string>();
    all.forEach((t, i) => {
      const id = `${t.host}:${t.port}`;
      if (seen.has(id)) return;
      seen.add(id);
      setTimeout(() => onFound({ id, name: t.label, kind: 'wifi', likelyObd: true }), 80 * (i + 1));
    });
    return () => {};
  },
};

export class WifiTransport extends BaseTransport implements ObdScanner {
  readonly kind: TransportKind = 'wifi';

  private socket: SocketLike | null = null;
  private intentional = false;

  async scan(onFound: (d: DiscoveredDevice) => void): Promise<() => void> {
    return wifiScanner.scan(onFound);
  }

  async connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void> {
    const mod = tcpModule();
    if (!mod) {
      throw new Error(
        'Le module réseau TCP n\'est pas chargé. Il demande un build de développement (npx expo run:android / run:ios), pas Expo Go.',
      );
    }

    const { host, port } = parseWifiId(deviceId);
    const timeout = opts?.timeoutMs ?? 8000;
    this.intentional = false;
    this.setState('connecting');
    consoleLog.sys(`Connexion TCP vers ${host}:${port}`);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.socket?.destroy();
        this.socket = null;
        reject(new Error(
          `Aucune réponse de ${host}:${port}. Le téléphone est-il bien connecté au Wi-Fi du boîtier ?`,
        ));
      }, timeout);

      const sock = mod.createConnection({ host, port, timeout }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Désactiver l'algorithme de Nagle : nos commandes font 5 octets, on ne
        // veut surtout pas que le système les mette en attente pour « grouper ».
        sock.setNoDelay?.(true);
        this.setState('connected');
        consoleLog.sys(`Boîtier Wi-Fi connecté (${host}:${port})`);
        resolve();
      });

      this.socket = sock;

      sock.on('data', (data) => {
        const bytes =
          typeof data === 'string'
            ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 0xff)
            : Uint8Array.from(data);
        this.emitData(bytes);
      });

      sock.on('error', (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.socket = null;
          this.setState('error', e);
          reject(e);
          return;
        }
        consoleLog.err(`Erreur socket : ${e.message}`);
      });

      sock.on('close', () => {
        if (!settled) return;
        this.socket = null;
        consoleLog.err('Socket Wi-Fi fermée');
        this.setState('disconnected', this.intentional ? undefined : new Error('Le boîtier Wi-Fi a coupé la connexion'));
      });
    });
  }

  async write(data: Uint8Array): Promise<void> {
    const sock = this.socket;
    if (!sock || this.state !== 'connected') throw new Error('Boîtier Wi-Fi non connecté');
    let s = '';
    for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]);
    sock.write(s, 'ascii');
  }

  async disconnect(): Promise<void> {
    this.intentional = true;
    this.setState('disconnecting');
    this.socket?.destroy();
    this.socket = null;
    this.setState('disconnected');
  }
}
