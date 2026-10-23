// Généré par scripts/sync-mobile.mjs depuis Tarmac/src/data/mappers.ts — ne pas modifier.
import type { RunConditions, ShiftEvent, Split } from '@/run/types';
import type { LogMarker, LogMeta } from '@/log/logFormat';

export interface LogRow {
  id: string;
  name: string;
  started_at: string;
  duration_ms: number;
  rows_count: number;
  rate_hz: string | number;
  keys: string[];
  trigger: string;
  markers: LogMarker[];
  stats: LogMeta['stats'];
  bytes: number;
  prep: string;
  dongle: string | null;
  truncated: boolean;
  vehicle_id?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface RunRow {
  id: string;
  number: number;
  mode: string;
  started_at: string;
  time_s: string | number | null;
  corrected_s: string | number | null;
  trap_kph: number | null;
  aborted_reason: string | null;
  conditions: RunConditions;
  splits: Split[];
  shifts: ShiftEvent[];
  launch_slip_pct: string | number;
  prep: string;
  is_record: boolean;
  speed_source: string | null;
  sample_hz: string | number | null;
  gps_accuracy_m: string | number | null;
  altitude_delta_m: string | number | null;
  reaction_s: string | number | null;
  vehicle_id?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface VehicleRow {
  id: string;
  label: string;
  details: string;
  vin: string | null;
  prep: string;
  mass_kg: number;
  tyres: string;
  tuner_email: string;
  dongle_name: string | null;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface MaintenanceRow {
  id: string;
  item_id: string;
  done_at: string;
  odometer_km: number | null;
  note: string;
  updated_at?: string;
  deleted_at?: string | null;
}
