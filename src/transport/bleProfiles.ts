/**
 * bleProfiles.ts — le trousseau de clés des ELM327 BLE.
 *
 * En Bluetooth basse consommation, un appareil expose des « services » qui
 * contiennent des « caractéristiques ». Pour parler à un boîtier, il faut
 * connaître la bonne porte (service), la bonne fente pour écrire, et la bonne
 * boîte aux lettres pour lire. Les fabricants de clones ne se sont jamais mis
 * d'accord : d'où ce trousseau, essayé clé par clé.
 *
 * Si aucune clé ne marche, `autoDetect` (dans BleTransport) part en exploration
 * et déduit les bonnes caractéristiques à partir de leurs propriétés. Le couple
 * trouvé est ensuite mémorisé par boîtier (MMKV) pour que la deuxième connexion
 * soit immédiate.
 */

export interface BleProfile {
  name: string;
  service: string;
  /** Caractéristique sur laquelle on s'abonne pour recevoir. */
  notify: string;
  /** Caractéristique sur laquelle on écrit. Souvent la même que `notify`. */
  write: string;
}

/**
 * Les UUID BLE « courts » (16 bits) s'écrivent en entier sur 128 bits avec la
 * base Bluetooth standard. react-native-ble-plx attend la forme longue.
 */
export function expandUuid(short: string): string {
  const s = short.replace(/-/g, '').toUpperCase();
  if (s.length === 32) return short.toLowerCase();
  const padded = s.padStart(4, '0');
  return `0000${padded}-0000-1000-8000-00805f9b34fb`.toLowerCase();
}

/**
 * Essayés dans cet ordre. Le profil HM-10 couvre la grande majorité des clones
 * chinois vendus sous le nom « ELM327 v1.5 ».
 */
export const BLE_PROFILES: BleProfile[] = [
  {
    // HM-10 et dérivés : une seule caractéristique sert à lire ET à écrire.
    name: 'HM-10 (FFE0/FFE1)',
    service: expandUuid('FFE0'),
    notify: expandUuid('FFE1'),
    write: expandUuid('FFE1'),
  },
  {
    name: 'Variante FFF0',
    service: expandUuid('FFF0'),
    notify: expandUuid('FFF1'),
    write: expandUuid('FFF2'),
  },
  {
    // Observé sur certains Vgate iCar.
    name: 'Vgate (18F0)',
    service: expandUuid('18F0'),
    notify: expandUuid('2AF0'),
    write: expandUuid('2AF1'),
  },
  {
    // Nordic UART Service : le profil de la future Tarmac Box (ESP32-S3).
    name: 'Nordic UART',
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

/**
 * MTU demandé sur Android. 185 est la plus grande valeur acceptée par la quasi
 * totalité des puces récentes ; si le boîtier refuse, on garde le MTU négocié
 * et on écrit par paquets de 20 octets.
 */
export const PREFERRED_MTU = 185;

/** Marge protocolaire BLE : 3 octets d'en-tête ATT par trame d'écriture. */
export const ATT_OVERHEAD = 3;

/** Taille d'écriture par défaut quand le MTU est inconnu (MTU minimal 23 − 3). */
export const DEFAULT_CHUNK = 20;
