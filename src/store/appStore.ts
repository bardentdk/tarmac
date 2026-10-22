/**
 * appStore.ts — l'état « froid » de l'app.
 *
 * À distinguer absolument de `liveStore` :
 *   · `liveStore` porte les données qui changent 50 fois par seconde et ne
 *     passent JAMAIS par React ;
 *   · `appStore` porte ce qui change quand l'utilisateur agit — le véhicule,
 *     les réglages, l'historique des runs. Là, un rendu React est exactement
 *     ce qu'on veut.
 *
 * On utilise zustand pour une raison précise : son état est lisible HORS de
 * React (`useAppStore.getState()`). Le détecteur de run a besoin du poids du
 * véhicule, et il ne vit pas dans un composant.
 */
import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  DEFAULT_VEHICLE,
  loadPseudo,
  loadSettings,
  loadVehicle,
  readRuns,
  savePseudo,
  saveSettings,
  saveVehicle,
  writeRuns,
  type AppSettings,
  type VehicleProfile,
} from './storage';
import type { RunMode, RunRecord } from '@/run/types';

interface AppState {
  settings: AppSettings;
  vehicle: VehicleProfile;
  pseudo: string;
  runs: RunRecord[];
  /** Épreuve sélectionnée sur l'écran d'accueil. */
  selectedMode: RunMode;

  setSettings(patch: Partial<AppSettings>): void;
  setVehicle(patch: Partial<VehicleProfile>): void;
  setPseudo(v: string): void;
  setSelectedMode(m: RunMode): void;

  /** Archive un run terminé et renvoie la fiche complète (numéro, record…). */
  addRun(run: Omit<RunRecord, 'id' | 'number' | 'isRecord' | 'prep'>): RunRecord;
  getRun(id: string): RunRecord | undefined;
  /** Le meilleur run d'une épreuve (chrono brut le plus court). */
  bestRun(mode: RunMode): RunRecord | null;
  deleteRun(id: string): void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: loadSettings(),
  vehicle: loadVehicle(),
  pseudo: loadPseudo(),
  runs: readRuns<RunRecord>(),
  selectedMode: '0-100',

  setSettings(patch) {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },

  setVehicle(patch) {
    const next = { ...get().vehicle, ...patch };
    saveVehicle(next);
    set({ vehicle: next });
  },

  setPseudo(v) {
    savePseudo(v);
    set({ pseudo: v });
  },

  setSelectedMode(m) {
    set({ selectedMode: m });
  },

  addRun(partial) {
    const { runs, vehicle } = get();
    // Les numéros sont croissants et ne sont jamais réutilisés, même après une
    // suppression : « Run #48 » doit rester « Run #48 » dans une discussion.
    const number = (runs[0]?.number ?? 0) + 1;

    const record: RunRecord = {
      ...partial,
      id: `${partial.startedAt}-${partial.mode}`,
      number,
      prep: vehicle.prep,
      isRecord: false,
    };

    // Un run arrêté ne peut pas être un record.
    if (record.timeS !== null) {
      const previousBest = runs
        .filter((r) => r.mode === record.mode && r.timeS !== null)
        .reduce<number | null>((best, r) => (best === null || r.timeS! < best ? r.timeS! : best), null);
      record.isRecord = previousBest === null || record.timeS < previousBest;
    }

    const next = [record, ...runs];
    // Le record change de main : l'ancien détenteur perd son badge.
    if (record.isRecord) {
      for (const r of next) {
        if (r !== record && r.mode === record.mode) r.isRecord = false;
      }
    }

    writeRuns(next);
    set({ runs: next });
    return record;
  },

  getRun(id) {
    return get().runs.find((r) => r.id === id);
  },

  bestRun(mode) {
    const list = get().runs.filter((r) => r.mode === mode && r.timeS !== null);
    if (list.length === 0) return null;
    return list.reduce((a, b) => (b.timeS! < a.timeS! ? b : a));
  },

  deleteRun(id) {
    const next = get().runs.filter((r) => r.id !== id);
    writeRuns(next);
    set({ runs: next });
  },
}));

/* ───────────────────────── Sélecteurs utilitaires ───────────────────────── */

/** Statistiques affichées en tête de l'historique. */
export function runStats(runs: RunRecord[], mode: RunMode | 'all') {
  const list = runs.filter((r) => (mode === 'all' || r.mode === mode) && r.timeS !== null);
  if (list.length === 0) return { best: null, average: null, count: runs.length };
  const times = list.map((r) => r.timeS!);
  return {
    best: Math.min(...times),
    average: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
    count: runs.length,
  };
}

/** Lecture hors React, pour le détecteur de run et les alertes. */
export const appState = () => useAppStore.getState();
