/**
 * useLog.ts — charge un log (fiche + CSV) et le décode avec le parseur de
 * l'app mobile. Le CSV n'est téléchargé qu'à l'ouverture : la liste n'en a
 * pas besoin.
 */
import { parseLogCsv, type ParsedLog } from '@/log/logFormat';
import { getLog, getLogCsv, type SharedLog } from '~/data/api';
import { useQuery } from '~/data/useQuery';

export interface LoadedLog {
  row: SharedLog;
  csv: string;
  parsed: ParsedLog;
}

export async function loadLog(id: string): Promise<LoadedLog | null> {
  const [row, csv] = await Promise.all([getLog(id), getLogCsv(id)]);
  if (!row) return null;
  if (!csv) throw new Error('Le contenu de ce log n’est pas encore en ligne : le téléphone ne l’a pas synchronisé.');
  return { row, csv, parsed: parseLogCsv(csv) };
}

export const useLog = (id: string | null) => useQuery(() => (id ? loadLog(id) : Promise.resolve(null)), [id]);

export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'log'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
