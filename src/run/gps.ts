/**
 * gps.ts — la vitesse de référence.
 *
 * Pourquoi ne pas se contenter de la vitesse OBD ? Parce que le compteur d'une
 * voiture mesure la rotation des ROUES. Si les roues patinent, il surestime.
 * S'il y a un décalage de calibration (très fréquent : +2 à +5 %), il mente
 * en permanence. Et il n'est rafraîchi que 5 à 10 fois par seconde.
 *
 * Le GPS, lui, mesure le déplacement RÉEL, via l'effet Doppler sur le signal
 * satellite — pas par différence de positions, ce qui serait beaucoup moins
 * précis. C'est pour ça qu'un chrono de drag se fait au GPS.
 *
 * L'écart entre les deux, c'est exactement la mesure de patinage affichée
 * pendant un run.
 */
import * as Location from 'expo-location';
import { live } from '@/store/liveStore';
import { consoleLog } from '@/debug/ConsoleLog';

export interface GpsStatus {
  granted: boolean;
  /** Fréquence réellement obtenue (Hz). Dépend du téléphone. */
  hz: number;
  /** Précision horizontale annoncée (m). */
  accuracyM: number | null;
  altitudeM: number | null;
  /** Nombre d'échantillons reçus depuis le démarrage. */
  samples: number;
}

type Listener = (s: GpsStatus) => void;

class GpsTracker {
  private sub: Location.LocationSubscription | null = null;
  private listeners = new Set<Listener>();
  private stamps: number[] = [];
  private status: GpsStatus = { granted: false, hz: 0, accuracyM: null, altitudeM: null, samples: 0 };

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getStatus = (): GpsStatus => this.status;

  /**
   * Demande l'autorisation et démarre le suivi.
   *
   * `BestForNavigation` + `timeInterval: 0` demande la cadence maximale. On
   * n'obtient pas toujours 25 Hz : la plupart des téléphones plafonnent entre
   * 1 et 10 Hz, certains montent à 25 Hz. On mesure donc la cadence réelle et
   * on l'affiche, plutôt que de promettre un chiffre.
   */
  async start(): Promise<GpsStatus> {
    if (this.sub) return this.status;

    const { status } = await Location.requestForegroundPermissionsAsync();
    this.status = { ...this.status, granted: status === 'granted' };
    if (status !== 'granted') {
      consoleLog.err('GPS refusé : les chronos seront basés sur la vitesse OBD, moins précise');
      this.notify();
      return this.status;
    }

    this.sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 0,
        distanceInterval: 0,
      },
      (pos) => {
        const now = Date.now();
        // `speed` est en m/s et vaut -1 quand le téléphone ne sait pas.
        const ms = pos.coords.speed ?? -1;
        if (ms >= 0) live.set('gpsSpeed', ms * 3.6, now);

        this.stamps.push(now);
        this.stamps = this.stamps.filter((t) => now - t < 1000);
        this.status = {
          granted: true,
          hz: this.stamps.length,
          accuracyM: pos.coords.accuracy ?? null,
          altitudeM: pos.coords.altitude ?? null,
          samples: this.status.samples + 1,
        };
        this.notify();
      },
    );

    consoleLog.sys('Suivi GPS démarré');
    return this.status;
  }

  stop(): void {
    this.sub?.remove();
    this.sub = null;
    this.stamps = [];
    consoleLog.sys('Suivi GPS arrêté');
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.status));
  }
}

export const gps = new GpsTracker();

/**
 * Vitesse à utiliser pour le chrono : le GPS s'il est fiable, l'OBD sinon.
 *
 * Le GPS est préféré, mais il n'est pas toujours là (parking couvert, tunnel,
 * autorisation refusée). On se rabat alors sur la vitesse OBD en le signalant
 * à l'appelant, pour que l'interface puisse l'écrire noir sur blanc : un
 * chrono sans GPS n'a pas la même valeur.
 */
export function referenceSpeed(): { kph: number | null; source: 'gps' | 'obd' | 'none' } {
  const g = live.get('gpsSpeed');
  if (g !== null) return { kph: g, source: 'gps' };
  const o = live.get('speed');
  if (o !== null) return { kph: o, source: 'obd' };
  return { kph: null, source: 'none' };
}
