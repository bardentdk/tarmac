// Généré par scripts/sync-mobile.mjs depuis Tarmac/src/store/storage.ts — ne pas modifier.
// Seul le type utilisé par health/maintenance.ts : le reste du fichier dépend du téléphone.

export interface MaintenanceEntry {
  /** Identifiant de l'opération (voir `src/health/maintenance.ts`). */
  itemId: string;
  /** Date de la dernière réalisation. */
  doneAt: number;
  /** Kilométrage relevé au compteur ce jour-là, saisi à la main. */
  odometerKm: number | null;
  note: string;
}
