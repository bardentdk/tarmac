/**
 * ConsoleLog.ts — la boîte noire de l'app.
 *
 * Avec des clones ELM327, 90 % du temps de débogage se passe à lire ce qui est
 * réellement parti sur le fil et ce qui est revenu. Sans ce journal, on devine.
 * Avec, on sait.
 *
 * Le journal vit HORS de React (module singleton) : la connexion et le
 * planificateur écrivent dedans en permanence, même quand aucun écran n'est
 * monté. L'écran Console s'y abonne quand il s'affiche, et se désabonne quand
 * il part — il n'est jamais la source de vérité.
 */

export type LogDir = 'tx' | 'rx' | 'sys' | 'err';

export interface LogEntry {
  /** Horodatage de réception en millisecondes (Date.now()). */
  t: number;
  dir: LogDir;
  text: string;
  /** Durée de l'échange, pour une ligne `rx` qui répond à un `tx`. */
  ms?: number;
}

/** 2 000 lignes : environ 2 minutes à plein débit, et ~200 ko en mémoire. */
const CAPACITY = 2000;

type Listener = () => void;

class Journal {
  private buf: (LogEntry | undefined)[] = new Array(CAPACITY);
  private head = 0;
  private count = 0;
  private listeners = new Set<Listener>();
  /** Incrémenté à chaque écriture : c'est le « numéro de version » que lit React. */
  private version = 0;
  /** Les notifications sont regroupées : à 50 lignes/s, on ne réveille React que 10×/s. */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  push(dir: LogDir, text: string, ms?: number): void {
    this.buf[this.head] = { t: Date.now(), dir, text, ms };
    this.head = (this.head + 1) % CAPACITY;
    if (this.count < CAPACITY) this.count++;
    this.version++;
    this.scheduleFlush();
  }

  tx(cmd: string) { this.push('tx', cmd); }
  rx(raw: string, ms?: number) { this.push('rx', raw, ms); }
  sys(msg: string) { this.push('sys', msg); }
  err(msg: string) { this.push('err', msg); }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.listeners.forEach((l) => l());
    }, 100);
  }

  /** Les lignes dans l'ordre chronologique. Coût O(n), appelé au plus 10×/s. */
  entries(): LogEntry[] {
    const out: LogEntry[] = [];
    const start = this.count < CAPACITY ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const e = this.buf[(start + i) % CAPACITY];
      if (e) out.push(e);
    }
    return out;
  }

  getVersion = (): number => this.version;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  clear(): void {
    this.buf = new Array(CAPACITY);
    this.head = 0;
    this.count = 0;
    this.version++;
    this.scheduleFlush();
  }

  /**
   * Rend le journal sous forme de texte, prêt à être partagé ou rejoué dans le
   * MockTransport. Le format est volontairement simple à relire à la machine :
   *   `12.345 TX 010C`
   *   `12.391 RX 410C1AF8 (46ms)`
   */
  toText(header?: Record<string, string | number | boolean | undefined>): string {
    const lines: string[] = ['# Tarmac — journal de diagnostic', `# ${new Date().toISOString()}`];
    if (header) {
      for (const [k, v] of Object.entries(header)) {
        if (v !== undefined) lines.push(`# ${k}: ${v}`);
      }
    }
    lines.push('');
    const list = this.entries();
    const t0 = list[0]?.t ?? Date.now();
    for (const e of list) {
      const rel = ((e.t - t0) / 1000).toFixed(3).padStart(8, ' ');
      lines.push(`${rel} ${e.dir.toUpperCase().padEnd(3)} ${e.text}${e.ms !== undefined ? ` (${e.ms}ms)` : ''}`);
    }
    return lines.join('\n');
  }

  /**
   * Relit un journal exporté et en extrait les couples commande → réponse.
   * Permet de rejouer une session réelle dans le simulateur (§9.4 du cahier
   * des charges) : on reproduit un bug de clone sans la voiture.
   */
  static parseText(text: string): { cmd: string; reply: string }[] {
    const pairs: { cmd: string; reply: string }[] = [];
    let pending: string | null = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^[\d.]+\s+(TX|RX|SYS|ERR)\s+(.*?)(?:\s+\(\d+ms\))?$/.exec(line);
      if (!m) continue;
      const [, dir, payload] = m;
      if (dir === 'TX') pending = payload;
      else if (dir === 'RX' && pending !== null) {
        pairs.push({ cmd: pending, reply: payload });
        pending = null;
      }
    }
    return pairs;
  }
}

export const consoleLog = new Journal();
export const parseLogText = Journal.parseText;
