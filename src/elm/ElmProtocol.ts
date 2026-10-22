/**
 * ElmProtocol.ts — le guichet à file unique.
 *
 * L'ELM327 est un guichet avec UN SEUL agent. On pose une question, on attend
 * qu'il réponde et qu'il dise « au suivant » (le caractère `>`), et seulement
 * alors on pose la question suivante.
 *
 * Envoyer deux commandes en même temps est LA cause numéro un des réponses
 * mélangées et des boîtiers qui se figent. Tout ce fichier existe pour rendre
 * cette faute impossible : il n'y a qu'un seul chemin pour parler au boîtier,
 * et ce chemin est une file d'attente stricte.
 *
 * Trois protections s'empilent :
 *   1. la file (une commande en vol, jamais deux) ;
 *   2. un délai maximum par commande, avec déblocage et une seule reprise ;
 *   3. la liste blanche de sécurité, franchie AVANT l'écriture.
 */
import { ObdTransport, toBytes, fromBytes } from '@/transport/types';
import { assertAllowed } from '@/obd/safety';
import { consoleLog } from '@/debug/ConsoleLog';
import { cleanResponse, detectElmError, ElmError } from './sanitize';

/** Le caractère que l'ELM327 envoie quand il a fini de parler. */
export const PROMPT = '>';

export interface SendOptions {
  /** Délai maximum d'attente de la réponse. */
  timeoutMs?: number;
  /** Nombre de reprises après un dépassement de délai. 1 par défaut. */
  retries?: number;
  /** Ne pas journaliser : réservé au battement de cœur, sinon il noie la console. */
  quiet?: boolean;
  /**
   * Accepter une réponse d'erreur sans lever d'exception. Utilisé pendant
   * l'initialisation : un `?` sur `ATL0` n'est pas grave, on note et on continue.
   */
  tolerateErrors?: boolean;
}

export interface ElmReply {
  /** Réponse nettoyée (sans écho, ni bruit, ni `>`). */
  clean: string;
  /** Réponse brute, telle qu'arrivée du boîtier. Pour la console. */
  raw: string;
  /** Durée de l'aller-retour en millisecondes. */
  ms: number;
  /** Code d'erreur détecté, si `tolerateErrors` était vrai. */
  error: ReturnType<typeof detectElmError>;
}

interface QueueItem {
  cmd: string;
  opts: Required<Pick<SendOptions, 'timeoutMs' | 'retries' | 'quiet' | 'tolerateErrors'>>;
  resolve: (r: ElmReply) => void;
  reject: (e: Error) => void;
  attempt: number;
  queuedAt: number;
}

/** Statistiques de débit, lues par la console de diagnostic. */
export interface ElmStats {
  /** Commandes terminées depuis le démarrage. */
  commands: number;
  timeouts: number;
  errors: number;
  /** Moyenne glissante de la durée d'un aller-retour (ms). */
  avgMs: number;
  /** Commandes par seconde, sur la dernière seconde glissante. */
  cps: number;
  /** Horodatage de la dernière réponse reçue. Le chien de garde le surveille. */
  lastReplyAt: number;
  /** Taille actuelle de la file. */
  queued: number;
}

const DEFAULTS = { timeoutMs: 2000, retries: 1, quiet: false, tolerateErrors: false };

export class ElmProtocol {
  private queue: QueueItem[] = [];
  private current: QueueItem | null = null;
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private unsubscribe: () => void;
  private disposed = false;

  private durations: number[] = [];
  private replyTimes: number[] = [];
  private _stats: ElmStats = {
    commands: 0, timeouts: 0, errors: 0, avgMs: 0, cps: 0, lastReplyAt: 0, queued: 0,
  };

  constructor(private transport: ObdTransport) {
    this.unsubscribe = transport.onData((chunk) => this.onChunk(chunk));
  }

  get stats(): ElmStats {
    const now = Date.now();
    this.replyTimes = this.replyTimes.filter((t) => now - t < 1000);
    return { ...this._stats, cps: this.replyTimes.length, queued: this.queue.length };
  }

  /** Y a-t-il une commande en vol ? Les tests s'en servent pour vérifier la file. */
  get inFlight(): string | null {
    return this.current?.cmd ?? null;
  }

  /**
   * Envoie une commande et attend sa réponse.
   *
   * Pourquoi retourner une promesse plutôt qu'un rappel ? Parce que tout le
   * code appelant (init, planificateur) est séquentiel par nature : on lit une
   * valeur, puis la suivante. `await` rend ce code lisible.
   */
  send(cmd: string, opts: SendOptions = {}): Promise<ElmReply> {
    if (this.disposed) return Promise.reject(new Error('Protocole fermé'));

    // La liste blanche AVANT la file : une commande interdite ne doit même pas
    // occuper une place dans la file, et sûrement pas atteindre le transport.
    assertAllowed(cmd);

    return new Promise<ElmReply>((resolve, reject) => {
      this.queue.push({
        cmd: cmd.trim(),
        opts: { ...DEFAULTS, ...opts },
        resolve,
        reject,
        attempt: 0,
        queuedAt: Date.now(),
      });
      this.pump();
    });
  }

  /** Raccourci : la réponse nettoyée, ou une exception. */
  async ask(cmd: string, opts: SendOptions = {}): Promise<string> {
    const r = await this.send(cmd, opts);
    return r.clean;
  }

  /**
   * Débloque un boîtier figé : un retour chariot seul, puis on attend le `>`.
   * Un clone qui ne répond plus se réveille très souvent comme ça, ce qui
   * évite une reconnexion complète (3 à 5 secondes perdues).
   */
  async unblock(timeoutMs = 1200): Promise<boolean> {
    if (this.disposed) return false;
    consoleLog.sys('Déblocage : envoi d\'un retour chariot seul');
    this.buffer = '';
    try {
      await this.transport.write(toBytes('\r'));
    } catch {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      const started = Date.now();
      const check = setInterval(() => {
        if (this.buffer.includes(PROMPT)) {
          clearInterval(check);
          this.buffer = '';
          resolve(true);
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(check);
          resolve(false);
        }
      }, 40);
    });
  }

  /** Vide la file en rejetant tout. Appelé sur déconnexion. */
  flush(reason: string): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const err = new Error(reason);
    const pending = this.current ? [this.current, ...this.queue] : [...this.queue];
    this.current = null;
    this.queue = [];
    this.buffer = '';
    pending.forEach((it) => it.reject(err));
  }

  dispose(): void {
    this.disposed = true;
    this.flush('Protocole fermé');
    this.unsubscribe();
  }

  /* ───────────────────────── Mécanique interne ───────────────────────── */

  private pump(): void {
    if (this.current || this.queue.length === 0 || this.disposed) return;

    const item = this.queue.shift()!;
    this.current = item;
    this.buffer = '';
    this.startedAt = Date.now();

    if (!item.opts.quiet) consoleLog.tx(item.cmd + (item.attempt > 0 ? ` (reprise ${item.attempt})` : ''));

    // Le `\r` final est obligatoire : c'est lui qui valide la commande.
    this.transport
      .write(toBytes(item.cmd + '\r'))
      .catch((e: Error) => this.fail(e));

    this.timer = setTimeout(() => this.onTimeout(), item.opts.timeoutMs);
  }

  private onChunk(chunk: Uint8Array): void {
    const text = fromBytes(chunk);
    // Hors commande : des octets arrivent sans qu'on ait rien demandé. On les
    // garde quand même dans le tampon, `unblock` s'en sert pour voir le `>`.
    this.buffer += text;
    if (!this.current) return;
    if (!this.buffer.includes(PROMPT)) return; // Réponse incomplète : on attend la suite.

    const item = this.current;
    const raw = this.buffer;
    const ms = Date.now() - this.startedAt;

    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.current = null;
    this.buffer = '';

    const clean = cleanResponse(raw, item.cmd);
    const error = detectElmError(clean);

    if (!item.opts.quiet) consoleLog.rx(clean.length ? clean : '(vide)', ms);

    this.durations.push(ms);
    if (this.durations.length > 50) this.durations.shift();
    this._stats.commands++;
    this._stats.avgMs = Math.round(this.durations.reduce((a, b) => a + b, 0) / this.durations.length);
    this._stats.lastReplyAt = Date.now();
    this.replyTimes.push(this._stats.lastReplyAt);

    if (error && !item.opts.tolerateErrors) {
      this._stats.errors++;
      consoleLog.err(`${error} sur « ${item.cmd} »`);
      item.reject(new ElmError(error, item.cmd, raw));
    } else {
      if (error) this._stats.errors++;
      item.resolve({ clean, raw, ms, error });
    }

    this.pump();
  }

  private onTimeout(): void {
    const item = this.current;
    if (!item) return;
    this.timer = null;
    this._stats.timeouts++;
    consoleLog.err(`Dépassement de délai (${item.opts.timeoutMs} ms) sur « ${item.cmd} »`);

    // Procédure imposée par le cahier des charges : vider le tampon, envoyer un
    // retour chariot seul pour réveiller le boîtier, attendre le `>`, réessayer
    // UNE fois. Au-delà, c'est au ConnectionManager de reprendre la main.
    this.current = null;
    this.buffer = '';

    if (item.attempt < item.opts.retries) {
      this.unblock().then(() => {
        item.attempt++;
        // On la remet en tête de file : son tour n'est pas passé.
        this.queue.unshift(item);
        this.pump();
      });
      return;
    }

    item.reject(new ElmError('TIMEOUT', item.cmd));
    this.pump();
  }

  private fail(e: Error): void {
    const item = this.current;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.current = null;
    consoleLog.err(`Écriture impossible : ${e.message}`);
    item?.reject(e);
  }
}
