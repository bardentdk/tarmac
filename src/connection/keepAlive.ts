/**
 * keepAlive.ts — le battement de cœur et le chien de garde.
 *
 * Deux problèmes différents, deux mécanismes différents. On les confond
 * souvent, et c'est une source de bugs.
 *
 * **Le battement de cœur** répond à : « le boîtier s'endort si on ne lui parle
 * plus ». Beaucoup de clones coupent le lien Bluetooth après quelques secondes
 * de silence. On envoie donc une commande inoffensive (`ATRV`, la tension
 * batterie) quand rien n'est parti depuis 2 secondes. C'est l'équivalent du
 * ralenti : ça ne sert à rien d'autre qu'à ne pas caler.
 *
 * **Le chien de garde** répond à : « on parle au boîtier mais il ne répond
 * plus ». La file reste bloquée, et de l'extérieur l'app a l'air connectée
 * alors que plus aucune donnée n'arrive. Toutes les 5 secondes, on vérifie
 * qu'une réponse est arrivée récemment. Sinon : déblocage, puis reconnexion
 * propre si ça ne suffit pas.
 */
import { ElmProtocol } from '@/elm/ElmProtocol';
import { consoleLog } from '@/debug/ConsoleLog';

/** Silence toléré avant d'envoyer un battement de cœur. */
const HEARTBEAT_AFTER_MS = 2000;
/** Période de vérification du chien de garde. */
const WATCHDOG_PERIOD_MS = 5000;
/** Au-delà de ce silence, on considère la file bloquée. */
const WATCHDOG_SILENCE_MS = 6000;

export interface KeepAliveHandle {
  stop(): void;
  /** Décalage manuel : le planificateur vient de parler, pas besoin de battement. */
  noteActivity(): void;
}

export interface KeepAliveCallbacks {
  /** Le chien de garde a mordu et le déblocage n'a pas suffi. */
  onStalled(): void;
  /** Tension batterie fraîchement lue, pour l'afficher sans requête dédiée. */
  onVoltage?(volts: number): void;
}

/**
 * Démarre les deux mécanismes. Renvoie une poignée pour les arrêter.
 *
 * @param isBusy Dit si le planificateur interroge déjà en continu. Quand c'est
 *               le cas, le battement de cœur est inutile : la file ne dort pas.
 */
export function startKeepAlive(
  elm: ElmProtocol,
  isBusy: () => boolean,
  cb: KeepAliveCallbacks,
): KeepAliveHandle {
  let lastActivity = Date.now();
  let stopped = false;
  /** Évite d'empiler deux déblocages en même temps. */
  let healing = false;

  const heartbeat = setInterval(() => {
    if (stopped || healing) return;
    // Si le planificateur tourne, il y a du trafic en permanence : rien à faire.
    if (isBusy()) return;
    if (Date.now() - lastActivity < HEARTBEAT_AFTER_MS) return;

    lastActivity = Date.now();
    // `quiet: true` : ce battement ne doit pas noyer la console de diagnostic.
    elm
      .send('ATRV', { timeoutMs: 1500, retries: 0, quiet: true, tolerateErrors: true })
      .then((r) => {
        const v = parseFloat(r.clean.replace(',', '.').replace(/[^0-9.]/g, ''));
        if (Number.isFinite(v) && v > 5 && v < 20) cb.onVoltage?.(v);
      })
      .catch(() => { /* le chien de garde s'en occupera */ });
  }, 1000);

  const watchdog = setInterval(async () => {
    if (stopped || healing) return;
    const { lastReplyAt, queued } = elm.stats;

    // Aucune réponse n'est encore arrivée : la connexion vient de s'ouvrir, on
    // laisse sa chance à l'initialisation.
    if (lastReplyAt === 0) return;

    const silence = Date.now() - lastReplyAt;
    if (silence < WATCHDOG_SILENCE_MS) return;

    healing = true;
    consoleLog.err(`Chien de garde : ${Math.round(silence / 1000)} s sans réponse (${queued} en file)`);

    try {
      // Première tentative : un retour chariot nu. Ça réveille la plupart des
      // clones figés, et ça coûte 100 ms au lieu de 4 secondes de reconnexion.
      const woke = await elm.unblock(1500);
      if (woke) {
        consoleLog.sys('Chien de garde : boîtier débloqué, on reprend');
        lastActivity = Date.now();
        healing = false;
        return;
      }
    } catch { /* on passe à la suite */ }

    consoleLog.err('Chien de garde : déblocage sans effet, reconnexion demandée');
    healing = false;
    cb.onStalled();
  }, WATCHDOG_PERIOD_MS);

  return {
    stop() {
      stopped = true;
      clearInterval(heartbeat);
      clearInterval(watchdog);
    },
    noteActivity() {
      lastActivity = Date.now();
    },
  };
}

/**
 * Calcule le délai avant la prochaine tentative de reconnexion.
 *
 * On double à chaque échec (0,5 s → 1 → 2 → 4 → 8), plafonné à 10 s. Pourquoi
 * ne pas réessayer toutes les 200 ms ? Parce qu'un boîtier débranché ne
 * reviendra pas plus vite, et qu'on viderait la batterie en allumant la radio
 * Bluetooth cinq fois par seconde.
 *
 * Il n'y a AUCUNE limite au nombre de tentatives : tant que l'utilisateur n'a
 * pas appuyé sur « Déconnecter », on continue. C'est exactement ce qu'on veut
 * quand le boîtier a été arraché par un dos-d'âne au milieu d'une session.
 */
export function backoffDelay(attempt: number): number {
  const base = 500 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(10000, base);
}
