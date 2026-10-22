/**
 * foregroundService.ts — l'ancre qui empêche Android de couper la connexion.
 *
 * Quand l'écran s'éteint, Android « endort » les applications pour économiser
 * la batterie : plus de minuteries, plus de Bluetooth, plus rien. Pour une app
 * de chrono branchée sur une voiture, c'est fatal — on perdrait le run.
 *
 * La seule façon officielle d'y échapper est un service au premier plan : on
 * affiche une notification permanente, et en échange le système laisse l'app
 * travailler. C'est le même mécanisme que les applications de navigation ou de
 * musique. La notification n'est pas un détail cosmétique : sans elle,
 * l'autorisation n'existe pas.
 *
 * Sur Android 14 et plus, il faut en plus déclarer le TYPE de service. Ici
 * `connectedDevice`, avec la permission `FOREGROUND_SERVICE_CONNECTED_DEVICE`
 * (déclarée dans app.json).
 *
 * Sur iOS, rien de tout ça : la clé `UIBackgroundModes: bluetooth-central`
 * dans Info.plist suffit, et elle ne concerne que le BLE.
 */
import { Platform } from 'react-native';
import { consoleLog } from '@/debug/ConsoleLog';

const CHANNEL_ID = 'tarmac-connexion';
const NOTIF_ID = 'tarmac-obd';

/** Notifee n'existe ni sur le web, ni en test, ni dans Expo Go. */
interface NotifeeLike {
  createChannel(c: Record<string, unknown>): Promise<string>;
  displayNotification(n: Record<string, unknown>): Promise<string>;
  stopForegroundService(): Promise<void>;
  registerForegroundService(cb: () => Promise<void>): void;
  requestPermission(): Promise<{ authorizationStatus: number }>;
  cancelNotification(id: string): Promise<void>;
}

let notifee: NotifeeLike | null | undefined;
let importance = 2;
let serviceType = 16;

function mod(): NotifeeLike | null {
  if (notifee !== undefined) return notifee;
  if (Platform.OS !== 'android') { notifee = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@notifee/react-native');
    notifee = (m.default ?? m) as NotifeeLike;
    importance = m.AndroidImportance?.LOW ?? 2;
    serviceType = m.AndroidForegroundServiceType?.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE ?? 16;
  } catch {
    notifee = null;
  }
  return notifee;
}

let registered = false;
let active = false;

/**
 * À appeler UNE fois au démarrage de l'app, avant tout affichage de
 * notification. Notifee exige que la tâche du service soit enregistrée au
 * niveau module, pas au moment du besoin.
 */
export function registerForegroundTask(): void {
  const n = mod();
  if (!n || registered) return;
  registered = true;
  // La tâche ne fait rien d'elle-même : c'est le ConnectionManager qui
  // travaille. Elle doit juste rester en vie tant que le service tourne.
  n.registerForegroundService(() => new Promise<void>(() => {}));
}

/** Démarre le service. Sans effet hors Android. */
export async function startForegroundService(status: string): Promise<void> {
  const n = mod();
  if (!n) return;
  try {
    registerForegroundTask();
    await n.requestPermission();
    await n.createChannel({
      id: CHANNEL_ID,
      name: 'Connexion au boîtier',
      description: 'Garde la liaison avec le boîtier OBD quand l\'écran est éteint.',
      importance,
      // Pas de son ni de vibration : on roule, on ne veut pas être distrait.
      sound: undefined,
      vibration: false,
    });
    await n.displayNotification({
      id: NOTIF_ID,
      title: 'Tarmac connecté au boîtier',
      body: status,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [serviceType],
        ongoing: true,
        onlyAlertOnce: true,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
    active = true;
    consoleLog.sys('Service au premier plan démarré');
  } catch (e) {
    consoleLog.err(`Service au premier plan indisponible : ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Met à jour le texte de la notification (« Reconnexion… », « 42 valeurs/s »).
 * On réaffiche la même notification : Android remplace le contenu sans
 * reclignoter, à condition de garder le même identifiant.
 */
export async function updateForegroundStatus(status: string): Promise<void> {
  if (!active) return;
  const n = mod();
  if (!n) return;
  try {
    await n.displayNotification({
      id: NOTIF_ID,
      title: 'Tarmac connecté au boîtier',
      body: status,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [serviceType],
        ongoing: true,
        onlyAlertOnce: true,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch { /* la notification n'est pas critique */ }
}

/** Arrête le service. À n'appeler QUE sur déconnexion volontaire. */
export async function stopForegroundService(): Promise<void> {
  if (!active) return;
  const n = mod();
  active = false;
  if (!n) return;
  try {
    await n.stopForegroundService();
    await n.cancelNotification(NOTIF_ID);
    consoleLog.sys('Service au premier plan arrêté');
  } catch { /* déjà arrêté */ }
}

export const isForegroundActive = () => active;
