/**
 * api.ts — ce que le site lit et écrit, table par table.
 *
 * Les types de lignes sont ceux de l'app mobile (Tarmac/src/data/mappers.ts,
 * recopiés dans src/shared/data/rows.ts) :
 * le site et l'app parlent exactement la même langue à la base. Ce que le site
 * modifie (véhicule, profil) redescend sur le téléphone à sa prochaine
 * synchronisation, puisque celle-ci suit `updated_at`, fixé par la base.
 */
import type { LogRow, MaintenanceRow, RunRow, VehicleRow } from '@/data/rows';
import { auth } from '~/auth/session';
import { callFunction, DataError, request, select } from './client';

export type { LogRow, MaintenanceRow, RunRow, VehicleRow };

export interface ProfileRow {
  owner_id: string;
  pseudo: string;
  show_in_ranking: boolean;
  is_mapper: boolean;
  shop_name: string;
}

export type ShareStatus = 'envoye' | 'vu' | 'en-cours' | 'traite';

export interface ShareRow {
  id: string;
  owner_id: string;
  log_id: string;
  mapper_email: string;
  message: string;
  client_email: string;
  client_name: string;
  status: ShareStatus;
  reply: string;
  created_at: string;
  updated_at: string;
}

export type SharedLog = LogRow & { vehicle: VehicleRow | null };
export type InboxRow = ShareRow & { log: SharedLog | null };

const LOG_FIELDS =
  'id,name,started_at,duration_ms,rows_count,rate_hz,keys,trigger,markers,stats,bytes,prep,dongle,truncated,vehicle_id,updated_at';
const VEHICLE_FIELDS = 'id,label,details,vin,prep,mass_kg,tyres,tuner_email,dongle_name,updated_at';

async function me(): Promise<string> {
  const id = await auth.userId();
  if (!id) throw new DataError('auth', 'Connecte-toi pour accéder à tes données.');
  return id;
}

/* ─────────────────────────── Profil ─────────────────────────── */

export async function getProfile(): Promise<ProfileRow | null> {
  const id = await me();
  const rows = await select<ProfileRow>('profiles', {
    owner_id: `eq.${id}`,
    select: 'owner_id,pseudo,show_in_ranking,is_mapper,shop_name',
  });
  return rows[0] ?? null;
}

export async function saveProfile(patch: Partial<Omit<ProfileRow, 'owner_id'>>): Promise<void> {
  // `profiles` n'a pas de déclencheur de propriétaire (sa clé EST le
  // propriétaire) : on envoie `owner_id`, et la politique d'insertion vérifie
  // qu'il est bien celui du jeton.
  const owner_id = await me();
  await request('profiles', { method: 'POST', body: [{ owner_id, ...patch }], upsert: true });
}

/* ─────────────────────────── Logs ─────────────────────────── */

export async function listMyLogs(): Promise<LogRow[]> {
  const id = await me();
  return select<LogRow>('logs', {
    owner_id: `eq.${id}`,
    deleted_at: 'is.null',
    select: LOG_FIELDS,
    order: 'started_at.desc',
    limit: '500',
  });
}

/** Un log — le mien, ou un log qu'on m'a partagé (la RLS tranche). */
export async function getLog(id: string): Promise<SharedLog | null> {
  const rows = await select<SharedLog>('logs', {
    id: `eq.${id}`,
    deleted_at: 'is.null',
    select: `${LOG_FIELDS},vehicle:vehicles(${VEHICLE_FIELDS})`,
  });
  return rows[0] ?? null;
}

export async function getLogCsv(id: string): Promise<string | null> {
  const rows = await select<{ csv: string }>('log_payloads', { log_id: `eq.${id}`, select: 'csv' });
  return rows[0]?.csv ?? null;
}

/* ─────────────────────────── Runs, véhicules ─────────────────────────── */

export async function listMyRuns(): Promise<RunRow[]> {
  const id = await me();
  return select<RunRow>('runs', {
    owner_id: `eq.${id}`,
    deleted_at: 'is.null',
    select: 'id,number,mode,started_at,time_s,corrected_s,trap_kph,aborted_reason,conditions,splits,shifts,launch_slip_pct,prep,is_record,speed_source,sample_hz,gps_accuracy_m,altitude_delta_m,reaction_s,vehicle_id',
    order: 'started_at.desc',
    limit: '500',
  });
}

export async function listMyVehicles(): Promise<VehicleRow[]> {
  const id = await me();
  return select<VehicleRow>('vehicles', {
    owner_id: `eq.${id}`,
    deleted_at: 'is.null',
    select: VEHICLE_FIELDS,
    order: 'updated_at.desc',
  });
}

export async function saveVehicle(row: Omit<VehicleRow, 'updated_at' | 'deleted_at'>): Promise<void> {
  await request('vehicles', { method: 'POST', body: [row], upsert: true });
}

export interface TelemetryRow {
  ms: number[];
  speed_kph: number[];
  wheel_speed_kph: number[] | null;
  distance_m: number[];
  rpm: number[] | null;
  boost_bar: number[] | null;
  advance_deg: number[] | null;
  iat_c: number[] | null;
  gear: number[] | null;
  throttle_pct: number[] | null;
}

export interface IncidentRow {
  ms: number;
  kind: 'knock' | 'retard' | 'slip' | 'lean' | 'overheat';
  severity: 'info' | 'warn' | 'danger';
  message: string;
  value: string | number | null;
}

/** Un run, sa télémétrie et ses incidents (trois tables, lues en parallèle). */
export async function getRun(id: string) {
  const [runs, tele, incidents] = await Promise.all([
    select<RunRow>('runs', { id: `eq.${id}`, deleted_at: 'is.null' }),
    select<TelemetryRow>('run_telemetry', { run_id: `eq.${id}` }),
    select<IncidentRow>('run_incidents', { run_id: `eq.${id}`, order: 'ms.asc' }),
  ]);
  return runs[0] ? { run: runs[0], telemetry: tele[0] ?? null, incidents } : null;
}

/* ─────────────────────────── Santé ─────────────────────────── */

export interface DtcReadRow {
  id: string;
  read_at: string;
  active: string[];
  pending: string[];
  permanent: string[];
  mil_on: boolean;
  cleared: boolean;
}

export async function listDtcReads(): Promise<DtcReadRow[]> {
  const id = await me();
  return select<DtcReadRow>('dtc_reads', {
    owner_id: `eq.${id}`,
    deleted_at: 'is.null',
    select: 'id,read_at,active,pending,permanent,mil_on,cleared',
    order: 'read_at.desc',
    limit: '50',
  });
}

export async function listMaintenance(): Promise<MaintenanceRow[]> {
  const id = await me();
  return select<MaintenanceRow>('maintenance_entries', {
    owner_id: `eq.${id}`,
    deleted_at: 'is.null',
    order: 'done_at.desc',
  });
}

export async function healthContext(): Promise<{ odometerKm: number | null; runCount: number }> {
  const id = await me();
  const [profile, stats] = await Promise.all([
    select<{ odometer_km: number | null }>('profiles', { owner_id: `eq.${id}`, select: 'odometer_km' }),
    callFunction<{ runs: number }[]>('my_run_stats'),
  ]);
  return {
    odometerKm: profile[0]?.odometer_km ?? null,
    runCount: stats.reduce((n, s) => n + Number(s.runs), 0),
  };
}

/* ─────────────────────────── Classement ─────────────────────────── */

export interface LeaderRow {
  entrant: string;
  pseudo: string;
  mode: string;
  prep: string;
  time_s: string;
  corrected_s: string | null;
  trap_kph: number | null;
  started_at: string;
  speed_source: string | null;
}

export const leaderboard = (mode: string, prep: string | null): Promise<LeaderRow[]> =>
  select<LeaderRow>('leaderboard', {
    mode: `eq.${mode}`,
    prep: prep ? `eq.${prep}` : undefined,
    order: 'time_s.asc',
    limit: '100',
  });

export async function myRank(mode: string, prep: string | null) {
  const rows = await callFunction<{ rank: number; total: number; time_s: string; gap_to_leader: string }[]>(
    'my_rank',
    { p_mode: mode, p_prep: prep },
  );
  return rows[0] ?? null;
}

/* ─────────────────────────── Partages (client) ─────────────────────────── */

export async function sharesOfLog(logId: string): Promise<ShareRow[]> {
  const id = await me();
  return select<ShareRow>('log_shares', { log_id: `eq.${logId}`, owner_id: `eq.${id}`, order: 'created_at.desc' });
}

export async function mySentShares(): Promise<ShareRow[]> {
  const id = await me();
  return select<ShareRow>('log_shares', { owner_id: `eq.${id}`, order: 'updated_at.desc', limit: '500' });
}

export async function shareLog(logId: string, mapperEmail: string, message: string): Promise<void> {
  await request('log_shares', {
    method: 'POST',
    body: { log_id: logId, mapper_email: mapperEmail.trim().toLowerCase(), message: message.trim() },
  });
}

export const unshare = (id: string): Promise<void> =>
  request('log_shares', { method: 'DELETE', query: { id: `eq.${id}` } });

export async function findMapper(email: string): Promise<{ shop_name: string; pseudo: string } | null> {
  const rows = await callFunction<{ shop_name: string; pseudo: string }[]>('find_mapper', { p_email: email });
  return rows[0] ?? null;
}

/* ─────────────────────────── Espace mappeur ─────────────────────────── */

const INBOX_SELECT = `*,log:logs(${LOG_FIELDS},vehicle:vehicles(${VEHICLE_FIELDS}))`;

export function mapperInbox(email: string): Promise<InboxRow[]> {
  return select<InboxRow>('log_shares', {
    mapper_email: `eq.${email.toLowerCase()}`,
    select: INBOX_SELECT,
    order: 'created_at.desc',
    limit: '1000',
  });
}

export async function mapperShare(id: string): Promise<InboxRow | null> {
  const rows = await select<InboxRow>('log_shares', { id: `eq.${id}`, select: INBOX_SELECT });
  return rows[0] ?? null;
}

export const updateShare = (id: string, patch: { status?: ShareStatus; reply?: string }): Promise<void> =>
  request('log_shares', { method: 'PATCH', query: { id: `eq.${id}` }, body: patch });
