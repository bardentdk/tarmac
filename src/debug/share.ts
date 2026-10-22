/**
 * share.ts — sortir une donnée de l'app.
 *
 * Trois besoins, un seul mécanisme : écrire un fichier dans le dossier
 * temporaire, puis ouvrir la feuille de partage du système. C'est la façon la
 * plus simple d'envoyer un log à son préparateur par WhatsApp, par mail ou de
 * l'enregistrer dans ses fichiers — sans que l'app ait besoin du moindre
 * compte ni de la moindre permission.
 *
 * On écrit dans le cache et pas dans les documents : ces fichiers sont des
 * copies jetables, le système peut les effacer quand il manque de place.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Clipboard, Platform } from 'react-native';
import { consoleLog } from './ConsoleLog';
import type { RunRecord } from '@/run/types';

/** Nom de fichier sûr : pas d'espace, pas d'accent, horodaté. */
function safeName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}.${ext}`;
}

/**
 * Écrit du texte dans un fichier temporaire et ouvre le partage natif.
 * Renvoie `false` si le partage n'est pas disponible (web, émulateur nu).
 */
export async function shareText(content: string, prefix: string, ext: 'txt' | 'csv'): Promise<boolean> {
  try {
    const file = new File(Paths.cache, safeName(prefix, ext));
    if (file.exists) file.delete();
    file.create();
    file.write(content);

    if (!(await Sharing.isAvailableAsync())) {
      consoleLog.err('Partage indisponible sur cet appareil');
      return false;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: ext === 'csv' ? 'text/csv' : 'text/plain',
      dialogTitle: ext === 'csv' ? 'Envoyer les données du run' : 'Envoyer le journal de diagnostic',
      UTI: ext === 'csv' ? 'public.comma-separated-values-text' : 'public.plain-text',
    });
    return true;
  } catch (e) {
    consoleLog.err(`Partage impossible : ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Copie dans le presse-papiers. Utile quand le partage n'est pas dispo. */
export function copyText(content: string): void {
  // `Clipboard` de react-native est déprécié mais toujours fonctionnel, et
  // évite une dépendance supplémentaire pour un seul appel.
  if (Platform.OS === 'web') return;
  Clipboard.setString(content);
}

/**
 * Transforme un run en CSV, une ligne par échantillon.
 *
 * Format choisi pour être lisible dans un tableur ET par un script : séparateur
 * point-virgule (les tableurs français l'attendent), décimales avec un point
 * (les outils d'analyse l'attendent).
 */
export function runToCsv(run: RunRecord): string {
  const head = [
    'ms',
    'vitesse_gps_kmh',
    'vitesse_roues_kmh',
    'distance_m',
    'regime_trmin',
    'boost_bar',
    'avance_deg',
    'admission_c',
    'rapport',
    'papillon_pct',
  ].join(';');

  const rows = run.samples.map((s) =>
    [
      s.ms,
      s.speedKph.toFixed(2),
      s.wheelSpeedKph?.toFixed(2) ?? '',
      s.distanceM.toFixed(2),
      s.rpm?.toFixed(0) ?? '',
      s.boostBar?.toFixed(3) ?? '',
      s.advanceDeg?.toFixed(1) ?? '',
      s.iatC?.toFixed(0) ?? '',
      s.gear ?? '',
      s.throttlePct?.toFixed(0) ?? '',
    ].join(';'),
  );

  // Un en-tête de commentaires : le préparateur doit pouvoir lire le contexte
  // sans ouvrir l'app.
  const meta = [
    `# Tarmac - run #${run.number} (${run.mode})`,
    `# depart: ${new Date(run.startedAt).toISOString()}`,
    `# chrono: ${run.timeS ?? 'interrompu'} s`,
    `# chrono corrige: ${run.correctedS ?? '-'} s`,
    `# conditions: ${run.conditions.airC} C, ${run.conditions.baroKpa} kPa, ${run.conditions.humidityPct} %HR, densite ${run.conditions.densityDeltaPct} %`,
    `# patinage depart: ${run.launchSlipPct} %`,
    `# preparation: ${run.prep}`,
    run.abortedReason ? `# interrompu: ${run.abortedReason}` : null,
  ].filter(Boolean);

  return [...meta, '', head, ...rows].join('\n');
}

/** Résumé texte d'un run, à coller dans un message au préparateur. */
export function runToSummary(run: RunRecord, extra?: string): string {
  const lines = [
    `Tarmac — Run #${run.number} · ${run.mode}`,
    `Chrono : ${run.timeS !== null ? `${run.timeS.toFixed(2).replace('.', ',')} s` : 'interrompu'}`,
    run.correctedS !== null ? `Corrigé météo : ${run.correctedS.toFixed(2).replace('.', ',')} s` : null,
    run.trapKph !== null ? `Vitesse de sortie : ${run.trapKph} km/h` : null,
    `Conditions : ${Math.round(run.conditions.airC)} °C · ${run.conditions.baroKpa} kPa · densité ${run.conditions.densityDeltaPct} %`,
    `Patinage au départ : ${run.launchSlipPct} %`,
    run.shifts.length
      ? `Passages : ${run.shifts.map((s) => `${s.from}→${s.to} en ${Math.round(s.durationMs)} ms`).join(', ')}`
      : null,
    run.incidents.length
      ? `Incidents : ${[...new Set(run.incidents.map((i) => i.message))].slice(0, 4).join(' | ')}`
      : 'Aucun incident',
    extra ?? null,
  ].filter(Boolean);
  return lines.join('\n');
}
