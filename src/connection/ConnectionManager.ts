/**
 * ConnectionManager.ts — le chef d'orchestre de la connexion.
 *
 * C'est LA pièce qui répond à l'objectif numéro un du projet : ne jamais
 * décrocher. Elle est unique dans toute l'app (singleton) et vit EN DEHORS de
 * React. Ce point n'est pas négociable : si elle vivait dans un composant,
 * changer d'écran la démonterait et couperait la connexion. C'est très
 * exactement le bug qui faisait que l'ancienne version ne tenait pas.
 *
 * Machine à états :
 *
 *   idle → scanning → connecting → discovering → initializing → ready ⇄ polling
 *                          ↑                                        │
 *                          └──── reconnecting (délai croissant) ←───┘
 *
 * Trois verrous protègent la machine :
 *   · `busy` : aucune action utilisateur ne peut lancer deux connexions ;
 *   · `userWantsConnection` : distingue un décrochage d'un « Déconnecter » ;
 *   · `generation` : un numéro de session. Une réponse tardive d'une connexion
 *     abandonnée ne peut pas polluer la connexion suivante.
 */
import { ElmProtocol } from '@/elm/ElmProtocol';
import { initializeElm, InitAbortedError, type ProtocolChoice } from '@/elm/ElmInit';
import { UNKNOWN_CAPS, type ElmCapabilities } from '@/elm/capabilities';
import { PollingScheduler, type PollMode } from '@/obd/PollingScheduler';
import { BleTransport } from '@/transport/BleTransport';
import { ClassicTransport } from '@/transport/ClassicTransport';
import { WifiTransport } from '@/transport/WifiTransport';
import { MockTransport } from '@/transport/MockTransport';
import type { DiscoveredDevice, ObdTransport, TransportKind } from '@/transport/types';
import { live } from '@/store/liveStore';
import { consoleLog } from '@/debug/ConsoleLog';
import {
  loadSettings,
  recallCaps,
  recallLastDevice,
  rememberCaps,
  rememberLastDevice,
} from '@/store/storage';
import { backoffDelay, startKeepAlive, type KeepAliveHandle } from './keepAlive';
import {
  startForegroundService,
  stopForegroundService,
  updateForegroundStatus,
} from './foregroundService';

export type ConnPhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'discovering'
  | 'initializing'
  | 'ready'
  | 'polling'
  | 'reconnecting'
  | 'error';

export interface ConnSnapshot {
  phase: ConnPhase;
  /** Texte prêt à afficher, en français, toujours doublé de la phase. */
  message: string;
  device: { id: string; name: string | null; kind: TransportKind } | null
  caps: ElmCapabilities;
  /** Numéro de la tentative de reconnexion en cours (0 = aucune). */
  attempt: number;
  /** Dernière erreur rencontrée, pour l'afficher sans la perdre. */
  lastError: string | null;
}

type Listener = (s: ConnSnapshot) => void;

/** Phases pendant lesquelles les données arrivent réellement. */
const LIVE_PHASES: ConnPhase[] = ['ready', 'polling'];

class ConnectionManager {
  private transport: ObdTransport | null = null;
  private elm: ElmProtocol | null = null;
  private scheduler: PollingScheduler | null = null;
  private keepAlive: KeepAliveHandle | null = null;
  private unsubTransport: (() => void) | null = null;

  private phase: ConnPhase = 'idle';
  private message = 'Aucun boîtier';
  private device: ConnSnapshot['device'] = null;
  private caps: ElmCapabilities = { ...UNKNOWN_CAPS };
  private attempt = 0;
  private lastError: string | null = null;

  /** Verrou d'action : empêche deux connexions simultanées. */
  private busy = false;
  /** L'utilisateur veut-il être connecté ? Faux après « Déconnecter ». */
  private userWantsConnection = false;
  /** Numéro de session : invalide les opérations d'une connexion abandonnée. */
  private generation = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private abortSignal = { aborted: false };

  private listeners = new Set<Listener>();
  private snapshotCache: ConnSnapshot = this.buildSnapshot();

  /* ───────────────────────────── Abonnement ───────────────────────────── */

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): ConnSnapshot => this.snapshotCache;

  private buildSnapshot(): ConnSnapshot {
    return {
      phase: this.phase,
      message: this.message,
      device: this.device,
      caps: this.caps,
      attempt: this.attempt,
      lastError: this.lastError,
    };
  }

  private emit(phase: ConnPhase, message: string): void {
    this.phase = phase;
    this.message = message;
    this.snapshotCache = this.buildSnapshot();
    consoleLog.sys(`État : ${phase} — ${message}`);
    this.listeners.forEach((l) => l(this.snapshotCache));
    if (LIVE_PHASES.includes(phase) || phase === 'reconnecting') {
      void updateForegroundStatus(message);
    }
  }

  /** Les données arrivent-elles en ce moment ? */
  get isLive(): boolean {
    return LIVE_PHASES.includes(this.phase);
  }

  get protocol(): ElmProtocol | null {
    return this.elm;
  }

  /** Accès à la voiture simulée, uniquement en mode démo. */
  get mockVehicle() {
    return this.transport instanceof MockTransport ? this.transport.vehicle : null;
  }

  /* ───────────────────────────── Recherche ───────────────────────────── */

  /**
   * Lance une recherche de boîtiers du type demandé. Renvoie la fonction
   * d'arrêt. La recherche est volontairement séparée de la connexion : on ne
   * scanne JAMAIS pendant qu'on se connecte (cause classique d'échec en BLE).
   */
  async scan(
    kind: TransportKind,
    onFound: (d: DiscoveredDevice) => void,
    onError?: (e: Error) => void,
  ): Promise<() => void> {
    if (this.busy) throw new Error('Une connexion est déjà en cours.');
    this.emit('scanning', 'Recherche de boîtiers…');

    const scanner =
      kind === 'ble' ? new BleTransport()
      : kind === 'classic' ? new ClassicTransport()
      : kind === 'wifi' ? new WifiTransport()
      : new MockTransport();

    const stop = await scanner.scan(onFound, onError);
    return () => {
      stop();
      if (this.phase === 'scanning') this.emit('idle', 'Aucun boîtier');
    };
  }

  /* ───────────────────────────── Connexion ───────────────────────────── */

  /** Reprend le dernier boîtier utilisé, si les réglages l'autorisent. */
  async autoReconnectOnStart(): Promise<void> {
    const settings = loadSettings();
    if (!settings.autoReconnect) return;
    const last = recallLastDevice();
    if (!last) return;
    consoleLog.sys(`Reconnexion automatique au dernier boîtier : ${last.name ?? last.id}`);
    try {
      await this.connect({ id: last.id, name: last.name, kind: last.kind, likelyObd: true });
    } catch {
      // Échec silencieux : l'utilisateur verra l'état sur l'écran de connexion.
    }
  }

  /**
   * Connexion complète : transport, puis initialisation, puis interrogation.
   * Une seule à la fois, garantie par le verrou `busy`.
   */
  async connect(target: DiscoveredDevice): Promise<void> {
    if (this.busy) throw new Error('Une connexion est déjà en cours.');
    this.busy = true;
    this.userWantsConnection = true;
    this.attempt = 0;
    this.lastError = null;
    this.abortSignal = { aborted: false };
    const gen = ++this.generation;

    try {
      await this.teardown({ keepUserIntent: true });
      await this.openAndInit(target, gen);
    } finally {
      this.busy = false;
    }
  }

  /** Déconnexion volontaire : c'est la SEULE façon d'arrêter la reconnexion. */
  async disconnect(): Promise<void> {
    this.userWantsConnection = false;
    this.abortSignal.aborted = true;
    this.generation++;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    await this.teardown({ keepUserIntent: false });
    await stopForegroundService();
    this.device = null;
    this.caps = { ...UNKNOWN_CAPS };
    this.attempt = 0;
    this.emit('idle', 'Déconnecté');
  }

  /** Change la cadence d'interrogation (accueil, run, arrière-plan). */
  setPollMode(mode: PollMode): void {
    this.scheduler?.setMode(mode);
  }

  /* ─────────────────────── Mécanique de connexion ─────────────────────── */

  private async openAndInit(target: DiscoveredDevice, gen: number): Promise<void> {
    const settings = loadSettings();
    this.device = { id: target.id, name: target.name, kind: target.kind };

    const transport = this.makeTransport(target, settings.mockProfile);
    this.transport = transport;

    // On surveille le transport AVANT de connecter : un décrochage pendant
    // l'initialisation doit déclencher la reconnexion comme un autre.
    this.unsubTransport = transport.onStateChange((state, err) => {
      if (gen !== this.generation) return; // Session abandonnée : on ignore.
      if (state === 'disconnected' || state === 'error') {
        if (!this.userWantsConnection) return;
        this.lastError = err?.message ?? null;
        this.scheduleReconnect(target, err?.message);
      }
    });

    this.emit('connecting', `Connexion à ${target.name ?? target.id}…`);
    await transport.connect(target.id, { timeoutMs: 12000 });
    if (gen !== this.generation) return;

    this.emit('discovering', 'Boîtier trouvé, ouverture du dialogue…');

    const elm = new ElmProtocol(transport);
    this.elm = elm;

    this.emit('initializing', 'Réglage du boîtier…');
    const known = recallCaps<ElmCapabilities>(target.id);
    let caps: ElmCapabilities;
    try {
      caps = await initializeElm(elm, {
        protocol: settings.protocol as ProtocolChoice,
        knownCaps: known,
        signal: this.abortSignal,
      });
    } catch (e) {
      if (e instanceof InitAbortedError || gen !== this.generation) return;
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      // Un échec d'initialisation n'est pas forcément définitif : le contact
      // vient peut-être d'être mis. On réessaie, comme pour un décrochage.
      this.scheduleReconnect(target, msg);
      throw e;
    }
    if (gen !== this.generation) return;

    this.caps = caps;
    rememberCaps(target.id, caps);
    rememberLastDevice({ id: target.id, name: target.name, kind: target.kind });

    this.emit('ready', 'Connecté');
    this.attempt = 0;

    // Interrogation en continu.
    const scheduler = new PollingScheduler(elm, caps, settings.enabledPids);
    this.scheduler = scheduler;
    scheduler.start();
    this.emit('polling', 'Connecté');

    // Battement de cœur + chien de garde.
    this.keepAlive = startKeepAlive(
      elm,
      () => scheduler.isRunning,
      {
        onStalled: () => {
          if (gen !== this.generation || !this.userWantsConnection) return;
          this.scheduleReconnect(target, 'Le boîtier ne répondait plus');
        },
        onVoltage: (v) => live.set('voltage', v),
      },
    );

    // Service au premier plan : à partir de maintenant, l'écran peut s'éteindre.
    if (settings.foregroundService) {
      await startForegroundService(`Connecté à ${target.name ?? target.id}`);
    }
  }

  private makeTransport(target: DiscoveredDevice, mockProfile: string): ObdTransport {
    switch (target.kind) {
      case 'ble': return new BleTransport();
      case 'classic': return new ClassicTransport();
      case 'wifi': return new WifiTransport();
      case 'mock': return new MockTransport({ profile: mockProfile as 'sage' | 'clone' | 'cauchemar' });
    }
  }

  /* ──────────────────────── Reconnexion automatique ──────────────────────── */

  /**
   * Programme une nouvelle tentative, avec un délai qui double à chaque échec.
   *
   * Point important du cahier des charges : après chaque reconnexion, on REFAIT
   * l'initialisation complète. Le boîtier a pu redémarrer entre-temps (c'est
   * même le cas le plus fréquent : il a été débranché). Reprendre
   * l'interrogation sans réinitialiser donnerait des réponses incohérentes.
   */
  private scheduleReconnect(target: DiscoveredDevice, reason?: string): void {
    if (!this.userWantsConnection) return;
    if (this.reconnectTimer) return; // Une tentative est déjà programmée.

    this.generation++;
    const gen = this.generation;
    this.attempt++;
    const delay = backoffDelay(this.attempt);

    void this.teardown({ keepUserIntent: true });

    const why = reason ? ` (${reason})` : '';
    this.emit('reconnecting', `Reconnexion… (essai ${this.attempt})${why}`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (gen !== this.generation || !this.userWantsConnection) return;
      if (this.busy) return;

      this.busy = true;
      try {
        this.abortSignal = { aborted: false };
        await this.openAndInit(target, gen);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.lastError = msg;
        // Message utile plutôt qu'un code : l'utilisateur est sous son volant.
        const human =
          this.attempt >= 3
            ? 'Boîtier introuvable : est-il branché et le contact mis ?'
            : `Reconnexion… (essai ${this.attempt})`;
        this.emit('reconnecting', human);
        this.scheduleReconnect(target, undefined);
      } finally {
        this.busy = false;
      }
    }, delay);
  }

  /** Ferme proprement tout ce qui est ouvert, sans toucher à l'intention. */
  private async teardown(opts: { keepUserIntent: boolean }): Promise<void> {
    this.keepAlive?.stop();
    this.keepAlive = null;

    if (this.scheduler) {
      await this.scheduler.stop();
      this.scheduler = null;
    }

    this.elm?.dispose();
    this.elm = null;

    this.unsubTransport?.();
    this.unsubTransport = null;

    const t = this.transport;
    this.transport = null;
    if (t) {
      try {
        await t.disconnect();
      } catch { /* déjà fermé */ }
    }

    if (!opts.keepUserIntent) live.reset();
  }
}

/** L'instance unique. Tout passe par elle. */
export const connection = new ConnectionManager();
