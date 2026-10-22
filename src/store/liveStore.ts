/**
 * liveStore.ts — le tableau de bord qui tourne hors de React.
 *
 * Problème à résoudre : le planificateur produit jusqu'à 60 valeurs par
 * seconde. Si chacune déclenchait un rendu React, l'écran live tomberait à
 * 15 images par seconde et le chrono saccaderait.
 *
 * Solution, en deux temps :
 *   · l'écriture est libre et immédiate — le planificateur pousse ses valeurs
 *     dans des tampons circulaires, sans jamais toucher à React ;
 *   · la lecture est cadencée — toutes les 60 ms, on incrémente un numéro de
 *     version et on réveille les écrans abonnés. Soit environ 16 rendus par
 *     seconde, quel que soit le débit réel du boîtier.
 *
 * Un tampon circulaire, c'est un carnet à spirale de taille fixe : quand on
 * arrive à la dernière page, on recommence à la première en écrasant. On garde
 * donc toujours les N dernières mesures, sans jamais allouer de mémoire.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { MetricKey } from '@/obd/pids';

export interface Sample {
  /** Horodatage de RÉCEPTION en millisecondes. C'est lui qui fait foi. */
  t: number;
  v: number;
}

/** 25 Hz pendant 40 s : largement de quoi couvrir un 0-400 m et son analyse. */
const RING_CAPACITY = 1024;

export class RingBuffer {
  private ts = new Float64Array(RING_CAPACITY);
  private vs = new Float64Array(RING_CAPACITY);
  private head = 0;
  private count = 0;

  push(t: number, v: number): void {
    this.ts[this.head] = t;
    this.vs[this.head] = v;
    this.head = (this.head + 1) % RING_CAPACITY;
    if (this.count < RING_CAPACITY) this.count++;
  }

  get size(): number {
    return this.count;
  }

  /** La dernière valeur écrite, ou null si le tampon est vide. */
  last(): Sample | null {
    if (this.count === 0) return null;
    const i = (this.head - 1 + RING_CAPACITY) % RING_CAPACITY;
    return { t: this.ts[i], v: this.vs[i] };
  }

  /** Les échantillons des `ms` dernières millisecondes, du plus ancien au plus récent. */
  recent(ms: number, now = Date.now()): Sample[] {
    const out: Sample[] = [];
    const start = this.count < RING_CAPACITY ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % RING_CAPACITY;
      if (now - this.ts[idx] <= ms) out.push({ t: this.ts[idx], v: this.vs[idx] });
    }
    return out;
  }

  /** Tout le tampon, ordonné. Utilisé pour archiver un run terminé. */
  toArray(): Sample[] {
    const out: Sample[] = [];
    const start = this.count < RING_CAPACITY ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % RING_CAPACITY;
      out.push({ t: this.ts[idx], v: this.vs[idx] });
    }
    return out;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

/** Débit mesuré, affiché dans la console de diagnostic. */
export interface Throughput {
  /** Valeurs décodées par seconde (toutes grandeurs confondues). */
  valuesPerSec: number;
  /** Requêtes envoyées au boîtier par seconde. */
  requestsPerSec: number;
  /** Durée moyenne d'un aller-retour (ms). */
  avgMs: number;
}

class LiveBus {
  private buffers = new Map<MetricKey, RingBuffer>();
  private latest = new Map<MetricKey, number>();
  private listeners = new Set<() => void>();
  private version = 0;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private valueStamps: number[] = [];
  private requestStamps: number[] = [];
  private _avgMs = 0;

  /** Cadence de réveil de l'interface. 60 ms ≈ 16 rendus par seconde. */
  private static readonly FLUSH_MS = 60;

  private buffer(key: MetricKey): RingBuffer {
    let b = this.buffers.get(key);
    if (!b) {
      b = new RingBuffer();
      this.buffers.set(key, b);
    }
    return b;
  }

  /**
   * Écrit une valeur. Appelé par le planificateur, parfois 60 fois par seconde.
   * Volontairement très peu coûteux : aucun objet alloué, aucun rendu déclenché.
   */
  set(key: MetricKey, value: number, t = Date.now()): void {
    if (!Number.isFinite(value)) return;
    this.buffer(key).push(t, value);
    this.latest.set(key, value);
    this.valueStamps.push(t);
    this.dirty = true;
    this.ensureTimer();
  }

  /** Signale une requête envoyée : sert au calcul du débit. */
  markRequest(avgMs?: number): void {
    this.requestStamps.push(Date.now());
    if (avgMs !== undefined) this._avgMs = avgMs;
    this.ensureTimer();
  }

  get(key: MetricKey): number | null {
    const v = this.latest.get(key);
    return v === undefined ? null : v;
  }

  /** Lecture hors React : le détecteur de run et les alertes passent par là. */
  snapshot(): Partial<Record<MetricKey, number>> {
    return Object.fromEntries(this.latest) as Partial<Record<MetricKey, number>>;
  }

  series(key: MetricKey, windowMs = 10000): Sample[] {
    return this.buffers.get(key)?.recent(windowMs) ?? [];
  }

  full(key: MetricKey): Sample[] {
    return this.buffers.get(key)?.toArray() ?? [];
  }

  throughput(): Throughput {
    const now = Date.now();
    this.valueStamps = this.valueStamps.filter((t) => now - t < 1000);
    this.requestStamps = this.requestStamps.filter((t) => now - t < 1000);
    return {
      valuesPerSec: this.valueStamps.length,
      requestsPerSec: this.requestStamps.length,
      avgMs: this._avgMs,
    };
  }

  /** Remet tout à zéro : nouveau boîtier, nouveau run. */
  reset(): void {
    this.buffers.forEach((b) => b.clear());
    this.latest.clear();
    this.valueStamps = [];
    this.requestStamps = [];
    this.bump();
  }

  /* ─────────────── Abonnement React (useSyncExternalStore) ─────────────── */

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    this.ensureTimer();
    return () => {
      this.listeners.delete(l);
      this.maybeStopTimer();
    };
  };

  getVersion = (): number => this.version;

  private bump(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /**
   * La minuterie ne tourne QUE s'il y a quelque chose à faire : au moins un
   * abonné ou des données fraîches. Sinon on laisse le processeur tranquille
   * (et la batterie).
   */
  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.bump();
      } else {
        // Même sans nouvelle valeur, on réveille une fois pour que le débit
        // affiché retombe à zéro quand le boîtier s'arrête de parler.
        this.bump();
        this.maybeStopTimer();
      }
    }, LiveBus.FLUSH_MS);
  }

  private maybeStopTimer(): void {
    if (this.listeners.size > 0 || this.dirty) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** Instance unique, hors React. Survit à tous les changements d'écran. */
export const live = new LiveBus();

/* ───────────────────────────── Hooks React ───────────────────────────── */

/**
 * Lit une grandeur live. Le composant se redessine au plus 16 fois par
 * seconde, quel que soit le débit du boîtier.
 */
export function useMetric(key: MetricKey): number | null {
  const getSnapshot = useCallback(() => live.get(key), [key]);
  return useSyncExternalStore(live.subscribe, getSnapshot, getSnapshot);
}

/**
 * Lit plusieurs grandeurs d'un coup.
 *
 * Attention : `useSyncExternalStore` compare les instantanés par identité. On
 * s'abonne donc au NUMÉRO DE VERSION (un nombre, donc stable) et on relit les
 * valeurs à la demande. Renvoyer un objet fraîchement construit provoquerait
 * une boucle de rendu infinie.
 */
export function useLiveVersion(): number {
  return useSyncExternalStore(live.subscribe, live.getVersion, live.getVersion);
}

export function useMetrics(keys: MetricKey[]): Partial<Record<MetricKey, number | null>> {
  useLiveVersion();
  const out: Partial<Record<MetricKey, number | null>> = {};
  for (const k of keys) out[k] = live.get(k);
  return out;
}

export function useThroughput(): Throughput {
  useLiveVersion();
  return live.throughput();
}

export function useSeries(key: MetricKey, windowMs = 10000): Sample[] {
  useLiveVersion();
  return live.series(key, windowMs);
}
