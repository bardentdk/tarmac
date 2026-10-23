/**
 * run.tsx — le détail d'un run : chrono, intermédiaires, conditions,
 * incidents et courbes.
 *
 * La télémétrie du run (table run_telemetry) est convertie au format d'un log
 * pour passer dans la même visionneuse : mêmes grandeurs, même curseur, et
 * les passages de rapport deviennent des repères.
 */
import { useParams } from 'react-router';
import type { LogData, ParsedLog } from '@/log/logFormat';
import type { MetricKey } from '@/obd/pids';
import type { RunConditions, ShiftEvent, Split } from '@/run/types';
import { getRun, type IncidentRow, type TelemetryRow } from '~/data/api';
import { useQuery } from '~/data/useQuery';
import { Card, ErrorBanner, Header, Loading, Stat, StatusPill } from '~/ui/components';
import { frDateTime, frNum, frTime, modeLabel, prepLabel, toNum } from '~/ui/format';
import { LogViewer } from '~/ui/LogViewer';

/** Colonnes de run_telemetry → grandeurs de l'app. La vitesse du run est celle du GPS. */
const COLUMNS: [keyof TelemetryRow, MetricKey][] = [
  ['speed_kph', 'gpsSpeed'],
  ['wheel_speed_kph', 'speed'],
  ['rpm', 'rpm'],
  ['boost_bar', 'boost'],
  ['advance_deg', 'advance'],
  ['iat_c', 'iat'],
  ['throttle_pct', 'throttle'],
  ['gear', 'gear'],
];

function telemetryAsLog(t: TelemetryRow, name: string, startedAt: number, shifts: ShiftEvent[], prep: string): ParsedLog {
  const columns: LogData['columns'] = {};
  const keys: MetricKey[] = [];
  for (const [col, key] of COLUMNS) {
    const v = t[col] as number[] | null;
    if (v && v.length === t.ms.length) {
      columns[key] = v.map((x) => (x === null ? NaN : Number(x)));
      keys.push(key);
    }
  }
  const durationMs = t.ms[t.ms.length - 1] ?? 0;
  return {
    meta: {
      name, startedAt, durationMs, rows: t.ms.length, rateHz: (t.ms.length / Math.max(1, durationMs)) * 1000, keys,
      trigger: 'run', markers: shifts.map((s) => ({ ms: s.ms, label: `${s.from}→${s.to}`, source: 'auto' as const })),
      vehicleLabel: '', prep, dongle: null, truncated: false,
    },
    data: { ms: t.ms, columns },
  };
}

const INCIDENT: Record<IncidentRow['kind'], string> = {
  knock: 'Cliquetis',
  retard: 'Avance retirée',
  slip: 'Patinage',
  lean: 'Mélange pauvre',
  overheat: 'Surchauffe',
};

function Conditions({ c }: { c: RunConditions }) {
  if (!c || c.airC === undefined) return null;
  return (
    <Card>
      <div className="stack-sm">
        <p className="section">Conditions</p>
        <div className="tiles">
          <Stat label="Air" value={frNum(c.airC)} unit="°C" />
          <Stat label="Pression" value={frNum(c.baroKpa * 10)} unit="hPa" />
          <Stat label="Humidité" value={frNum(c.humidityPct)} unit="%" />
          <Stat label="Altitude" value={frNum(c.altitudeM)} unit="m" />
          <Stat label="Densité de l’air" value={`${c.densityDeltaPct > 0 ? '+' : ''}${frNum(c.densityDeltaPct, 1)}`} unit="%" />
        </div>
        <span className="dim tiny">
          Le temps corrigé ramène le run aux conditions standard (facteur {frNum(c.correctionFactor, 3)}) : c’est lui qu’il faut comparer d’un jour à l’autre.
        </span>
      </div>
    </Card>
  );
}

export default function RunDetail() {
  const { id = '' } = useParams();
  const q = useQuery(() => getRun(id), [id]);

  if (q.loading) return <Loading />;
  if (q.error) return <><Header title="Run" back="/app/runs" /><ErrorBanner error={q.error} /></>;
  if (!q.data) return <><Header title="Run introuvable" back="/app/runs" /><p className="dim">Ce run a été supprimé.</p></>;

  const { run, telemetry, incidents } = q.data;
  const splits = (run.splits ?? []) as Split[];
  const time = toNum(run.time_s);
  const corrected = toNum(run.corrected_s);
  const title = `${modeLabel(run.mode)} · run #${run.number}`;

  return (
    <>
      <Header
        title={title}
        back="/app/runs"
        subtitle={`${frDateTime(run.started_at)} · ${prepLabel(run.prep)}${run.speed_source ? ` · vitesse ${run.speed_source === 'gps' ? 'GPS' : 'OBD'}` : ''}${toNum(run.sample_hz) ? ` · ${frNum(toNum(run.sample_hz)!)} Hz` : ''}`}
        right={run.aborted_reason ? <StatusPill tone="danger" label="INTERROMPU" /> : run.is_record ? <StatusPill tone="ok" label="RECORD" /> : undefined}
      />

      {run.aborted_reason ? <div className="banner danger">Run interrompu : {run.aborted_reason}</div> : null}

      <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Stat label="Temps" value={time !== null ? frTime(time) : '—'} unit={time !== null ? 's' : undefined} tone="ok" />
        <Stat label="Temps corrigé" value={corrected !== null ? frTime(corrected) : '—'} unit={corrected !== null ? 's' : undefined} />
        <Stat label="Vitesse de sortie" value={run.trap_kph ?? '—'} unit={run.trap_kph ? 'km/h' : undefined} />
        <Stat label="Patinage au départ" value={frNum(toNum(run.launch_slip_pct) ?? 0)} unit="%" tone={(toNum(run.launch_slip_pct) ?? 0) > 10 ? 'warn' : undefined} />
        {toNum(run.reaction_s) !== null ? <Stat label="Réaction" value={frTime(run.reaction_s)} unit="s" /> : null}
      </div>

      {splits.length ? (
        <Card>
          <p className="section" style={{ marginBottom: 6 }}>Intermédiaires</p>
          {splits.map((s) => (
            <div key={s.label} className="list-row">
              <span className="semi grow">{s.label}</span>
              {s.trapKph ? <span className="dim small">{frNum(s.trapKph)} km/h</span> : null}
              <span className="num" style={{ fontSize: 20, width: 80, textAlign: 'right' }}>{frTime(s.timeS)} s</span>
            </div>
          ))}
        </Card>
      ) : null}

      {incidents.length ? (
        <Card tone="warn">
          <div className="stack-sm">
            <p className="section">Ce que l’app a relevé</p>
            {incidents.map((i, n) => (
              <div key={n} className="list-row">
                <span className="num dim" style={{ width: 56 }}>{frNum(i.ms / 1000, 2)} s</span>
                <span className={`semi ${i.severity === 'danger' ? 'danger' : 'warn'}`} style={{ width: 120 }}>{INCIDENT[i.kind]}</span>
                <span className="grow small" style={{ color: 'var(--text3)' }}>{i.message}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Conditions c={run.conditions} />

      {telemetry ? (
        <>
          <h2 className="h2" style={{ marginTop: 8 }}>Courbes</h2>
          <LogViewer log={telemetryAsLog(telemetry, title, new Date(run.started_at).getTime(), (run.shifts ?? []) as ShiftEvent[], run.prep)} />
        </>
      ) : (
        <Card><div className="empty">La télémétrie de ce run n’est pas en ligne : le téléphone ne l’a pas encore synchronisée.</div></Card>
      )}
    </>
  );
}
