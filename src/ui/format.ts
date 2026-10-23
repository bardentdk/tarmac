/** format.ts — chiffres et dates à la française, comme dans l'app. */
import { runModeDef, type RunMode } from '@/run/types';

export const frNum = (v: number, decimals = 0): string => v.toFixed(decimals).replace('.', ',');

export const toNum = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const frTime = (s: string | number | null): string => {
  const n = toNum(s);
  return n === null ? '—' : frNum(n, 2);
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const frDate = (iso: string | number): string => dateFmt.format(new Date(iso));
export const frDateTime = (iso: string | number): string => dateTimeFmt.format(new Date(iso));

/** « il y a 3 h », pour une boîte de réception. */
export function sinceLabel(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`;
  return frDate(iso);
}

export const PREP_LABELS: Record<string, string> = {
  origine: 'Origine',
  stage1: 'Stage 1',
  stage2: 'Stage 2',
  autre: 'Autre',
};

export const prepLabel = (p: string): string => PREP_LABELS[p] ?? (p || '—');

export const modeLabel = (m: string): string => runModeDef(m as RunMode).label;

export const triggerLabel = (t: string): string =>
  t === 'pleine-charge' ? 'Pleine charge' : t === 'run' ? 'Run' : 'Manuel';
