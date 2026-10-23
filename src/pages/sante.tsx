/**
 * sante.tsx — santé du véhicule : codes défaut expliqués et carnet d'entretien.
 *
 * Les relevés et l'entretien viennent du téléphone (tables dtc_reads et
 * maintenance_entries). Les explications et les échéances sont calculées par
 * le code de l'app (obd/dtcLibrary, health/maintenance) : le site dit
 * exactement ce que dit l'app.
 */
import { explainDtc, type DtcInfo } from '@/obd/dtcLibrary';
import { evaluateMaintenance, type DueLevel } from '@/health/maintenance';
import { healthContext, listDtcReads, listMaintenance, type DtcReadRow } from '~/data/api';
import { useQuery } from '~/data/useQuery';
import { Card, ErrorBanner, Header, Loading, Stat, StatusPill } from '~/ui/components';
import { frDate, frDateTime, frNum } from '~/ui/format';
import { Shield, Warning } from '~/ui/icons';

const SEVERITY: Record<DtcInfo['severity'], { label: string; tone: 'info' | 'warn' | 'danger' }> = {
  info: { label: 'À SURVEILLER', tone: 'info' },
  warn: { label: 'À TRAITER', tone: 'warn' },
  danger: { label: 'CRITIQUE', tone: 'danger' },
};

const DUE: Record<DueLevel, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  due: { label: 'À FAIRE', tone: 'danger' },
  soon: { label: 'BIENTÔT', tone: 'warn' },
  unknown: { label: 'NON RENSEIGNÉ', tone: 'neutral' },
  ok: { label: 'À JOUR', tone: 'ok' },
};

function DtcCard({ code, state }: { code: string; state: 'actif' | 'en attente' | 'permanent' }) {
  const d = explainDtc(code);
  const sev = SEVERITY[d.severity];
  return (
    <Card tone={d.severity === 'danger' ? 'danger' : d.severity === 'warn' ? 'warn' : undefined}>
      <div className="stack-sm">
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <div className="row8">
            <span className="num" style={{ fontSize: 22 }}>{d.code}</span>
            <span className="dim small">{state}</span>
          </div>
          <StatusPill tone={sev.tone} label={sev.label} />
        </div>
        <span className="bold">{d.title}</span>
        <p style={{ margin: 0, color: 'var(--text3)' }}>{d.plain}</p>
        {d.leads.length ? (
          <div className="stack-sm" style={{ gap: 4 }}>
            <span className="section" style={{ fontSize: 12 }}>Pistes, de la plus simple à la plus lourde</span>
            <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text3)' }}>
              {d.leads.map((l) => <li key={l}>{l}</li>)}
            </ol>
          </div>
        ) : null}
        {d.blocksRun ? <div className="row8 danger small semi"><Warning size={16} />Pas de run tant que ce défaut est présent.</div> : null}
        {d.generic ? <span className="dim tiny">Explication par famille de codes : ce code n’est pas encore documenté précisément.</span> : null}
      </div>
    </Card>
  );
}

function LastRead({ read }: { read: DtcReadRow }) {
  const codes = [
    ...read.active.map((c) => ({ c, s: 'actif' as const })),
    ...read.permanent.map((c) => ({ c, s: 'permanent' as const })),
    ...read.pending.map((c) => ({ c, s: 'en attente' as const })),
  ];
  return (
    <div className="stack-md">
      <div className="between">
        <p className="section">Dernier relevé · {frDateTime(read.read_at)}</p>
        <StatusPill tone={read.mil_on ? 'danger' : 'ok'} label={read.mil_on ? 'VOYANT ALLUMÉ' : 'VOYANT ÉTEINT'} />
      </div>
      {codes.length ? codes.map(({ c, s }) => <DtcCard key={`${s}-${c}`} code={c} state={s} />) : (
        <Card tone="ok">
          <div className="row8"><Shield color="var(--ok)" /><span className="semi">Aucun code défaut lors de ce relevé.</span></div>
        </Card>
      )}
    </div>
  );
}

export default function Sante() {
  const reads = useQuery(listDtcReads, []);
  const entries = useQuery(listMaintenance, []);
  const ctx = useQuery(healthContext, []);

  const statuses = entries.data && ctx.data
    ? evaluateMaintenance(
        entries.data.map((e) => ({ itemId: e.item_id, doneAt: new Date(e.done_at).getTime(), odometerKm: e.odometer_km, note: e.note })),
        ctx.data.odometerKm,
        ctx.data.runCount,
      )
    : [];
  const due = statuses.filter((s) => s.level === 'due').length;
  const soon = statuses.filter((s) => s.level === 'soon').length;
  const last = reads.data?.[0];

  return (
    <>
      <Header title="Santé du véhicule" subtitle="Codes défaut et entretien, relevés par l’app." />
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Stat label="Codes actifs" value={last ? last.active.length + last.permanent.length : '—'} tone={last && last.active.length + last.permanent.length ? 'warn' : 'ok'} />
        <Stat label="Entretiens à faire" value={entries.data ? due : '—'} tone={due ? 'warn' : undefined} />
        <Stat label="Bientôt" value={entries.data ? soon : '—'} />
        <Stat label="Kilométrage" value={ctx.data?.odometerKm != null ? frNum(ctx.data.odometerKm) : '—'} unit={ctx.data?.odometerKm != null ? 'km' : undefined} />
      </div>

      <ErrorBanner error={reads.error ?? entries.error ?? ctx.error} />

      <h2 className="h2" style={{ marginTop: 8 }}>Codes défaut</h2>
      {reads.loading ? <Loading /> : last ? (
        <>
          <LastRead read={last} />
          {reads.data!.length > 1 ? (
            <Card>
              <p className="section" style={{ marginBottom: 8 }}>Relevés précédents</p>
              {reads.data!.slice(1).map((r) => (
                <div key={r.id} className="list-row">
                  <span className="dim small" style={{ width: 150 }}>{frDateTime(r.read_at)}</span>
                  <span className="grow small">
                    {[...r.active, ...r.permanent, ...r.pending].join(', ') || 'Aucun code'}
                  </span>
                  {r.cleared ? <StatusPill tone="neutral" label="EFFACÉS" /> : null}
                </div>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        <Card><div className="empty">Aucun relevé synchronisé. Dans l’app, ouvre « Codes défaut » avec le boîtier branché.</div></Card>
      )}

      <h2 className="h2" style={{ marginTop: 8 }}>Carnet d’entretien</h2>
      <p className="dim small" style={{ margin: 0 }}>
        Intervalles renforcés pour un usage sportif : au-delà d’un certain nombre de runs, l’app avance les échéances.
        {ctx.data ? ` ${ctx.data.runCount} run${ctx.data.runCount > 1 ? 's' : ''} pris en compte.` : ''}
      </p>
      {entries.loading || ctx.loading ? <Loading /> : (
        <div className="grid2">
          {statuses.map((s) => (
            <Card key={s.item.id} tone={s.level === 'due' && s.item.critical ? 'danger' : undefined}>
              <div className="stack-sm">
                <div className="between">
                  <span className="bold">{s.item.label}</span>
                  <StatusPill tone={DUE[s.level].tone} label={DUE[s.level].label} />
                </div>
                <span style={{ color: 'var(--text3)' }} className="small">{s.summary}</span>
                {s.doneAt ? <span className="dim tiny">Dernière fois : {frDate(s.doneAt)}{s.doneAtKm != null ? ` à ${frNum(s.doneAtKm)} km` : ''}</span> : null}
                <span className="dim tiny">{s.item.why}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
