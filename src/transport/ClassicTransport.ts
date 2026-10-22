/**
 * ClassicTransport.ts — le livreur Bluetooth classique (Android uniquement).
 *
 * Beaucoup de clones ELM327 vendus en grande surface ne font PAS du BLE : ils
 * font du Bluetooth « classique » (profil SPP, un port série sans fil). Il faut
 * les appairer une fois dans les réglages Android, avec un code PIN.
 *
 * ⚠️ iOS NE PEUT PAS parler à ces boîtiers. Apple réserve le Bluetooth
 * classique aux accessoires certifiés MFi, et aucun clone ne l'est. Ce n'est
 * pas une limite de l'app : c'est verrouillé par le système. L'écran de
 * connexion doit l'expliquer franchement plutôt que de laisser l'utilisateur
 * chercher pendant une heure.
 *
 * Deux pièges Android, tous les deux codés ici :
 *   · il faut ANNULER toute découverte Bluetooth en cours avant de se
 *     connecter, sinon l'ouverture du canal RFCOMM échoue une fois sur deux ;
 *   · si la connexion sécurisée échoue, il faut réessayer en mode non
 *     sécurisé : certains clones ne gèrent que celui-là.
 */
import { Platform } from 'react-native';
import {
  BaseTransport,
  looksLikeObd,
  type DiscoveredDevice,
  type ObdScanner,
  type TransportKind,
} from './types';
import { consoleLog } from '@/debug/ConsoleLog';

/**
 * `react-native-bluetooth-classic` n'a pas de plugin Expo et n'est pas garanti
 * compatible avec la nouvelle architecture React Native. On le charge donc à la
 * demande : l'app démarre même si le module natif est absent (Expo Go, web,
 * tests), et l'écran de connexion affiche un message au lieu de planter.
 */
interface ClassicDeviceLike {
  address: string;
  name?: string | null;
  connect(opts?: Record<string, unknown>): Promise<boolean>;
  disconnect(): Promise<boolean>;
  write(data: string, encoding?: string): Promise<boolean>;
  onDataReceived(cb: (e: { data: string }) => void): { remove(): void };
  isConnected(): Promise<boolean>;
}

interface ClassicModuleLike {
  isBluetoothEnabled(): Promise<boolean>;
  getBondedDevices(): Promise<ClassicDeviceLike[]>;
  startDiscovery(): Promise<ClassicDeviceLike[]>;
  cancelDiscovery(): Promise<boolean>;
  connectToDevice(address: string, opts?: Record<string, unknown>): Promise<ClassicDeviceLike>;
  onDeviceDisconnected(cb: (e: { address?: string }) => void): { remove(): void };
}

let cachedModule: ClassicModuleLike | null | undefined;

function classicModule(): ClassicModuleLike | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== 'android') { cachedModule = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-bluetooth-classic');
    cachedModule = (mod?.default ?? mod) as ClassicModuleLike;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** Le Bluetooth classique est-il utilisable sur cet appareil ? */
export function classicAvailability(): { usable: boolean; reason?: string } {
  if (Platform.OS === 'ios') {
    return {
      usable: false,
      reason:
        'iOS ne permet pas de parler aux boîtiers Bluetooth classique : Apple réserve ce mode aux accessoires certifiés MFi, et aucun clone ELM327 ne l\'est. Sur iPhone, il faut un boîtier BLE ou Wi-Fi.',
    };
  }
  if (!classicModule()) {
    return {
      usable: false,
      reason:
        'Le module Bluetooth classique n\'est pas chargé. Il demande un build de développement (npx expo run:android), pas Expo Go.',
    };
  }
  return { usable: true };
}

export class ClassicTransport extends BaseTransport implements ObdScanner {
  readonly kind: TransportKind = 'classic';

  private device: ClassicDeviceLike | null = null;
  private dataSub: { remove(): void } | null = null;
  private discSub: { remove(): void } | null = null;
  private intentional = false;

  /**
   * Liste d'abord les appareils DÉJÀ APPAIRÉS, puis lance une découverte.
   *
   * Pourquoi les appairés d'abord ? Parce que c'est beaucoup plus fiable : un
   * boîtier appairé dans les réglages Android se connecte quasi
   * systématiquement, alors qu'une découverte à chaud échoue souvent. L'écran
   * d'aide explique à l'utilisateur de faire l'appairage une fois pour toutes
   * (codes PIN habituels : 1234, 0000, 6789).
   */
  async scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: Error) => void): Promise<() => void> {
    const mod = classicModule();
    const avail = classicAvailability();
    if (!mod || !avail.usable) throw new Error(avail.reason ?? 'Bluetooth classique indisponible');

    if (!(await mod.isBluetoothEnabled())) throw new Error('Le Bluetooth est éteint.');

    try {
      const bonded = await mod.getBondedDevices();
      for (const d of bonded) {
        onFound({
          id: d.address,
          name: d.name ?? null,
          kind: 'classic',
          likelyObd: looksLikeObd(d.name),
          paired: true,
        });
      }
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }

    let cancelled = false;
    consoleLog.sys('Découverte Bluetooth classique lancée');
    mod
      .startDiscovery()
      .then((list) => {
        if (cancelled) return;
        for (const d of list) {
          onFound({
            id: d.address,
            name: d.name ?? null,
            kind: 'classic',
            likelyObd: looksLikeObd(d.name),
            paired: false,
          });
        }
      })
      .catch((e: Error) => { if (!cancelled) onError?.(e); });

    return () => {
      cancelled = true;
      mod.cancelDiscovery().catch(() => {});
    };
  }

  async connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void> {
    const mod = classicModule();
    if (!mod) throw new Error(classicAvailability().reason ?? 'Bluetooth classique indisponible');

    this.intentional = false;
    this.setState('connecting');

    // PIÈGE N°1 — annuler la découverte. Android ne peut pas ouvrir un canal
    // RFCOMM pendant qu'il scanne : la radio est occupée. L'échec qui en
    // résulte n'a aucun message clair, d'où des heures perdues en débogage.
    try {
      await mod.cancelDiscovery();
    } catch { /* aucune découverte en cours : parfait */ }

    const timeout = opts?.timeoutMs ?? 12000;

    try {
      // PIÈGE N°2 — essayer d'abord en sécurisé (le cas normal), puis en non
      // sécurisé si ça échoue. Certains clones n'implémentent pas
      // l'authentification et refusent toute connexion sécurisée.
      let dev: ClassicDeviceLike;
      try {
        dev = await this.withTimeout(
          mod.connectToDevice(deviceId, { CONNECTOR_TYPE: 'rfcomm', DELIMITER: '', SECURE_SOCKET: true }),
          timeout,
        );
      } catch (secureErr) {
        consoleLog.sys('Connexion sécurisée refusée : nouvelle tentative en mode non sécurisé');
        dev = await this.withTimeout(
          mod.connectToDevice(deviceId, { CONNECTOR_TYPE: 'rfcomm', DELIMITER: '', SECURE_SOCKET: false }),
          timeout,
        );
        void secureErr;
      }

      this.device = dev;

      // On lit le flux BRUT, sans délimiteur : c'est l'étage ELM327 qui sait
      // qu'une réponse se termine par `>`. Mettre un délimiteur ici
      // découperait les réponses au mauvais endroit.
      this.dataSub = dev.onDataReceived((e) => {
        const bytes = new Uint8Array(e.data.length);
        for (let i = 0; i < e.data.length; i++) bytes[i] = e.data.charCodeAt(i) & 0xff;
        this.emitData(bytes);
      });

      this.discSub = mod.onDeviceDisconnected(() => {
        consoleLog.err('Déconnexion Bluetooth classique');
        this.cleanupSubs();
        this.setState('disconnected', this.intentional ? undefined : new Error('Le boîtier a décroché'));
      });

      this.setState('connected');
      consoleLog.sys(`Boîtier classique connecté (${deviceId})`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      consoleLog.err(`Connexion classique échouée : ${err.message}`);
      this.cleanupSubs();
      this.device = null;
      this.setState('error', err);
      throw err;
    }
  }

  async write(data: Uint8Array): Promise<void> {
    const dev = this.device;
    if (!dev || this.state !== 'connected') throw new Error('Boîtier classique non connecté');
    let s = '';
    for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]);
    // Le RFCOMM n'a pas de MTU contraignant : une commande ELM327 fait au
    // maximum une dizaine d'octets, elle passe toujours en une fois.
    await dev.write(s, 'ascii');
  }

  async disconnect(): Promise<void> {
    this.intentional = true;
    this.setState('disconnecting');
    this.cleanupSubs();
    const dev = this.device;
    this.device = null;
    try {
      await dev?.disconnect();
    } catch { /* déjà parti */ }
    this.setState('disconnected');
  }

  private cleanupSubs(): void {
    this.dataSub?.remove();
    this.dataSub = null;
    this.discSub?.remove();
    this.discSub = null;
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Pas de réponse du boîtier après ${ms / 1000} s`)), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }
}
