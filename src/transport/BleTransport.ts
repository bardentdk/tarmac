/**
 * BleTransport.ts — le livreur Bluetooth basse consommation.
 *
 * C'est le transport le plus capricieux et le plus utilisé. L'ancienne version
 * de l'app se connectait « une fois sur quinze » : presque toujours à cause de
 * l'ordre des opérations. En BLE, l'ordre n'est pas un détail de style, c'est
 * la différence entre une connexion fiable et une loterie.
 *
 * L'ORDRE CORRECT, et il n'y en a qu'un :
 *   1. arrêter le scan (on ne scanne JAMAIS pendant une connexion) ;
 *   2. se connecter, sans `autoConnect`, avec un délai explicite ;
 *   3. découvrir tous les services et caractéristiques ;
 *   4. demander un MTU plus grand (Android seulement, échec toléré) ;
 *   5. activer les notifications ;
 *   6. ET SEULEMENT LÀ, envoyer la première commande.
 *
 * Inverser 5 et 6 donne exactement le symptôme « ça marche une fois sur N » :
 * la réponse du boîtier arrive avant qu'on écoute, elle est perdue, et le
 * protocole attend un `>` qui ne viendra jamais.
 */
import { Platform } from 'react-native';
import {
  BleManager,
  State as BleState,
  type Characteristic,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import {
  BaseTransport,
  looksLikeObd,
  type DiscoveredDevice,
  type ObdScanner,
  type TransportKind,
} from './types';
import { ATT_OVERHEAD, BLE_PROFILES, DEFAULT_CHUNK, PREFERRED_MTU, type BleProfile } from './bleProfiles';
import { consoleLog } from '@/debug/ConsoleLog';
import { rememberBleProfile, recallBleProfile } from '@/store/storage';

/** Le couple de caractéristiques retenu pour ce boîtier. */
interface Resolved {
  profileName: string;
  service: string;
  notify: string;
  write: string;
  /** `writeWithoutResponse` est plus rapide, mais tous les clones ne l'acceptent pas. */
  withoutResponse: boolean;
}

/** Une seule instance de BleManager pour toute l'app : la lib l'exige. */
let sharedManager: BleManager | null = null;
export function bleManager(): BleManager {
  if (!sharedManager) sharedManager = new BleManager();
  return sharedManager;
}

export class BleTransport extends BaseTransport implements ObdScanner {
  readonly kind: TransportKind = 'ble';

  private device: Device | null = null;
  private resolved: Resolved | null = null;
  private monitor: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private chunkSize = DEFAULT_CHUNK;
  /** Vrai quand c'est l'utilisateur qui a demandé la déconnexion. */
  private intentional = false;
  /** Un scan en cours empêche toute connexion : on le suit pour pouvoir l'arrêter. */
  private scanning = false;

  /* ───────────────────────────── Recherche ───────────────────────────── */

  /** L'adaptateur Bluetooth est-il allumé ? */
  async isReady(): Promise<{ ok: boolean; reason?: string }> {
    const s = await bleManager().state();
    if (s === BleState.PoweredOn) return { ok: true };
    if (s === BleState.PoweredOff) return { ok: false, reason: 'Le Bluetooth est éteint.' };
    if (s === BleState.Unauthorized) return { ok: false, reason: "Tarmac n'a pas l'autorisation d'utiliser le Bluetooth." };
    if (s === BleState.Unsupported) return { ok: false, reason: 'Cet appareil ne gère pas le Bluetooth basse consommation.' };
    return { ok: false, reason: 'Bluetooth indisponible pour le moment.' };
  }

  async scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: Error) => void): Promise<() => void> {
    const ready = await this.isReady();
    if (!ready.ok) throw new Error(ready.reason);

    this.scanning = true;
    consoleLog.sys('Recherche BLE lancée');
    // `null` = tous les services : les clones n'annoncent pas toujours le leur
    // dans la trame de publicité, filtrer par UUID ferait disparaître le bon boîtier.
    bleManager().startDeviceScan(null, { allowDuplicates: true }, (err, dev) => {
      if (err) { onError?.(err); return; }
      if (!dev) return;
      const name = dev.name ?? dev.localName ?? null;
      onFound({
        id: dev.id,
        name,
        kind: 'ble',
        rssi: dev.rssi ?? undefined,
        likelyObd: looksLikeObd(name),
      });
    });

    return () => this.stopScan();
  }

  stopScan(): void {
    if (!this.scanning) return;
    bleManager().stopDeviceScan();
    this.scanning = false;
    consoleLog.sys('Recherche BLE arrêtée');
  }

  /* ───────────────────────────── Connexion ───────────────────────────── */

  async connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void> {
    const timeout = opts?.timeoutMs ?? 12000;
    this.intentional = false;
    this.setState('connecting');

    // ÉTAPE 1 — arrêter le scan. Sur beaucoup de puces Android, une connexion
    // lancée pendant un scan échoue sans message clair, ou réussit puis
    // décroche aussitôt. C'est la première cause du « une fois sur quinze ».
    this.stopScan();

    try {
      // ÉTAPE 2 — connexion. `autoConnect: false` : plus rapide et surtout
      // plus prévisible. `autoConnect: true` délègue à la pile Android, qui
      // peut mettre 10 secondes sans jamais dire pourquoi.
      consoleLog.sys(`Connexion BLE à ${deviceId}`);
      let dev = await bleManager().connectToDevice(deviceId, { autoConnect: false, timeout });
      this.device = dev;

      // On s'abonne à la déconnexion AVANT toute autre opération : si le
      // boîtier décroche pendant la découverte, on veut le savoir.
      this.disconnectSub = dev.onDisconnected((err) => {
        consoleLog.err(`Déconnexion BLE${err ? ` : ${err.message}` : ''}`);
        this.cleanupSubs();
        this.setState('disconnected', this.intentional ? undefined : new Error(err?.message ?? 'Le boîtier a décroché'));
      });

      // ÉTAPE 3 — découverte. Sans ça, les caractéristiques n'existent pas
      // encore du point de vue de la lib, et tout échoue.
      dev = await dev.discoverAllServicesAndCharacteristics();
      this.device = dev;

      // ÉTAPE 4 — MTU. Android négocie 23 octets par défaut, ce qui limite à
      // 20 octets utiles par écriture. Demander 185 réduit le nombre de
      // trames. Un refus n'est PAS une erreur : on garde 20 octets.
      if (Platform.OS === 'android') {
        try {
          const withMtu = await dev.requestMTU(PREFERRED_MTU);
          this.chunkSize = Math.max(DEFAULT_CHUNK, (withMtu.mtu ?? 23) - ATT_OVERHEAD);
          consoleLog.sys(`MTU négocié : ${withMtu.mtu ?? '?'} (écritures de ${this.chunkSize} octets)`);
        } catch {
          this.chunkSize = DEFAULT_CHUNK;
          consoleLog.sys('MTU refusé par le boîtier : écritures de 20 octets');
        }
      } else {
        // iOS négocie tout seul et n'expose pas de réglage. 20 octets reste sûr.
        this.chunkSize = DEFAULT_CHUNK;
      }

      // Choix du couple de caractéristiques.
      this.resolved = await this.resolveProfile(dev, deviceId);
      consoleLog.sys(`Profil BLE retenu : ${this.resolved.profileName}`);

      // ÉTAPE 5 — notifications. On écoute AVANT de parler.
      await this.startNotifications(dev, this.resolved);

      // ÉTAPE 6 — et seulement maintenant, le tuyau est prêt. C'est au
      // ConnectionManager d'enchaîner avec l'initialisation ELM327.
      this.setState('connected');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      consoleLog.err(`Connexion BLE échouée : ${err.message}`);
      await this.hardCleanup();
      this.setState('error', err);
      throw err;
    }
  }

  /**
   * Trouve la bonne porte d'entrée du boîtier.
   *
   * On essaie d'abord le profil mémorisé pour CE boîtier (connexion suivante
   * instantanée), puis la table des profils connus, puis en dernier recours
   * l'exploration : on parcourt tous les services et on cherche une
   * caractéristique qui notifie et une qui écrit.
   */
  private async resolveProfile(dev: Device, deviceId: string): Promise<Resolved> {
    const services = await dev.services();
    const chars = new Map<string, Characteristic[]>();
    for (const s of services) {
      chars.set(s.uuid.toLowerCase(), await s.characteristics());
    }

    const build = (p: BleProfile): Resolved | null => {
      const list = chars.get(p.service.toLowerCase());
      if (!list) return null;
      const n = list.find((c) => c.uuid.toLowerCase() === p.notify.toLowerCase());
      const w = list.find((c) => c.uuid.toLowerCase() === p.write.toLowerCase());
      if (!n || !w) return null;
      if (!(n.isNotifiable || n.isIndicatable)) return null;
      if (!(w.isWritableWithResponse || w.isWritableWithoutResponse)) return null;
      return {
        profileName: p.name,
        service: p.service,
        notify: p.notify,
        write: p.write,
        withoutResponse: w.isWritableWithoutResponse,
      };
    };

    // 1. Le profil déjà validé pour ce boîtier.
    const saved = recallBleProfile(deviceId);
    if (saved) {
      const hit = build({ name: `mémorisé (${saved.profileName})`, service: saved.service, notify: saved.notify, write: saved.write });
      if (hit) return { ...hit, withoutResponse: saved.withoutResponse };
      consoleLog.sys('Le profil mémorisé ne correspond plus : nouvelle recherche');
    }

    // 2. La table des profils connus, dans l'ordre.
    for (const p of BLE_PROFILES) {
      const hit = build(p);
      if (hit) {
        rememberBleProfile(deviceId, hit);
        return hit;
      }
    }

    // 3. Exploration. On cherche un service qui contient À LA FOIS une
    // caractéristique qui notifie et une qui écrit. Les garder dans le même
    // service est indispensable : l'API BLE adresse toujours le couple
    // (service, caractéristique), on ne peut pas écrire « ailleurs ».
    for (const [svc, list] of chars) {
      const n = list.find((c) => c.isNotifiable || c.isIndicatable);
      const w = list.find((c) => c.isWritableWithoutResponse || c.isWritableWithResponse);
      if (!n || !w) continue;
      const found: Resolved = {
        profileName: 'détecté automatiquement',
        service: svc,
        notify: n.uuid,
        write: w.uuid,
        withoutResponse: w.isWritableWithoutResponse,
      };
      rememberBleProfile(deviceId, found);
      consoleLog.sys(`Détection automatique : service ${svc}, notifie sur ${n.uuid}, écrit sur ${w.uuid}`);
      return found;
    }

    throw new Error(
      "Ce boîtier n'expose aucun service utilisable (il faut une voie de lecture et une voie d'écriture dans le même service).",
    );
  }

  private async startNotifications(dev: Device, r: Resolved): Promise<void> {
    this.monitor = dev.monitorCharacteristicForService(r.service, r.notify, (err, c) => {
      if (err) {
        // Une erreur de monitoring pendant une déconnexion volontaire est normale.
        if (!this.intentional) consoleLog.err(`Notification BLE perdue : ${err.message}`);
        return;
      }
      if (!c?.value) return;
      // react-native-ble-plx transmet du base64. On repasse en octets.
      const bytes = new Uint8Array(Buffer.from(c.value, 'base64'));
      this.emitData(bytes);
    });

    // Petite pause : sur plusieurs puces Android, l'écriture du descripteur de
    // notification n'est pas encore effective quand le rappel est posé. 120 ms
    // suffisent et se paient une seule fois par connexion.
    await new Promise((res) => setTimeout(res, 120));
  }

  /* ───────────────────────────── Écriture ───────────────────────────── */

  async write(data: Uint8Array): Promise<void> {
    const dev = this.device;
    const r = this.resolved;
    if (!dev || !r || this.state !== 'connected') throw new Error('Boîtier BLE non connecté');

    // Découpage selon le MTU : une écriture plus longue que la trame BLE est
    // silencieusement tronquée par certaines piles. Mieux vaut deux trames.
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const slice = data.subarray(i, i + this.chunkSize);
      const b64 = Buffer.from(slice).toString('base64');
      if (r.withoutResponse) {
        await dev.writeCharacteristicWithoutResponseForService(r.service, r.write, b64);
      } else {
        await dev.writeCharacteristicWithResponseForService(r.service, r.write, b64);
      }
    }
  }

  /* ─────────────────────────── Déconnexion ─────────────────────────── */

  async disconnect(): Promise<void> {
    this.intentional = true;
    this.setState('disconnecting');
    await this.hardCleanup();
    this.setState('disconnected');
  }

  private cleanupSubs(): void {
    this.monitor?.remove();
    this.monitor = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
  }

  private async hardCleanup(): Promise<void> {
    this.cleanupSubs();
    const dev = this.device;
    this.device = null;
    this.resolved = null;
    if (!dev) return;
    try {
      // `cancelDeviceConnection` échoue si l'appareil est déjà parti : ce n'est
      // pas une erreur à remonter, juste une course entre deux événements.
      await bleManager().cancelDeviceConnection(dev.id);
    } catch { /* déjà déconnecté */ }
  }
}
