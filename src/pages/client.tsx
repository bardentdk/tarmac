/**
 * client.tsx — l'espace pilote : logs, runs, garage, compte.
 *
 * Les données viennent de l'app : le téléphone enregistre et synchronise, le
 * site relit. On ne crée ni log ni run ici — ils naissent sur la voiture.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { humanBytes, humanDuration } from '@/log/logFormat';
import { RUN_MODES } from '@/run/types';
import { auth, useAuth } from '~/auth/session';
import {
  findMapper, listMyLogs, listMyRuns, listMyVehicles, mySentShares, saveProfile, saveVehicle, shareLog, sharesOfLog, unshare,
  type LogRow, type ShareRow, type VehicleRow,
} from '~/data/api';
import { useQuery } from '~/data/useQuery';
import {
  Card, Chip, ErrorBanner, Field, GhostButton, Header, Loading, PrimaryButton, Segmented, Stat, StatusPill, Switch,
} from '~/ui/components';
import { frDate, frDateTime, frNum, frTime, modeLabel, PREP_LABELS, prepLabel, sinceLabel, toNum, triggerLabel } from '~/ui/format';
import { ChevronRight, Share, Trash } from '~/ui/icons';
import { useSpace } from '~/ui/layouts';
import { LogViewer } from '~/ui/LogViewer';
import { downloadCsv, useLog } from './useLog';

export const STATUS: Record<ShareRow['status'], { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' }> = {
  envoye: { label: 'ENVOYÉ', tone: 'neutral' },
  vu: { label: 'VU', tone: 'info' },
  'en-cours': { label: 'EN COURS', tone: 'warn' },
  traite: { label: 'TRAITÉ', tone: 'ok' },
};

/* ═════════════════════════════ Logs ═════════════════════════════ */

type TriggerFilter = 'all' | 'pleine-charge' | 'run' | 'manuel';

/** Fiche d'un log dans une liste : ce qui permet de le reconnaître sans l'ouvrir. */
export function LogCard({ log, to, extra }: { log: LogRow; to: string; extra?: React.ReactNode }) {
  const boost = log.stats?.boost?.max;
  const rpm = log.stats?.rpm?.max;
  return (
    <Card to={to}>
      <div className="row12">
        <div className="grow stack-sm" style={{ gap: 4 }}>
          <div className="row8">
            <span className="bold ellipsis">{log.name}</span>
            <span className={`pill ${log.trigger === 'pleine-charge' ? 'ok' : 'neutral'}`} style={{ padding: '2px 8px', fontSize: 11 }}>
              {triggerLabel(log.trigger).toUpperCase()}
            </span>
          </div>
          <span className="dim small">
            {frDateTime(log.started_at)} · {humanDuration(log.duration_ms)} · {log.rows_count} lignes · {frNum(toNum(log.rate_hz) ?? 0)} Hz · {humanBytes(log.bytes)}
          </span>
          {extra}
        </div>
        {rpm !== undefined ? <div className="hide-sm" style={{ textAlign: 'right' }}><div className="dim tiny">Régime max</div><div className="num" style={{ fontSize: 20 }}>{frNum(rpm)}</div></div> : null}
        {boost !== undefined ? <div style={{ textAlign: 'right' }}><div className="dim tiny">Boost max</div><div className="num ok" style={{ fontSize: 20 }}>{frNum(boost, 2)}</div></div> : null}
        <ChevronRight size={18} color="var(--text2)" />
      </div>
    </Card>
  );
}

export function Logs() {
  const logs = useQuery(listMyLogs, []);
  const shares = useQuery(mySentShares, []);
  const [filter, setFilter] = useState<TriggerFilter>('all');
  const replies = useMemo(() => {
    const m = new Map<string, ShareRow[]>();
    for (const s of shares.data ?? []) m.set(s.log_id, [...(m.get(s.log_id) ?? []), s]);
    return m;
  }, [shares.data]);
  const list = (logs.data ?? []).filter((l) => filter === 'all' || l.trigger === filter);

  return (
    <>
      <Header title="Mes logs" subtitle="Enregistrés avec l’app, synchronisés avec ton compte." />
      <div className="chips">
        {([['all', 'Tous'], ['pleine-charge', 'Pleine charge'], ['run', 'Runs'], ['manuel', 'Manuels']] as const).map(([v, l]) => (
          <Chip key={v} label={l} active={filter === v} onClick={() => setFilter(v)} />
        ))}
      </div>
      <ErrorBanner error={logs.error} />
      {logs.loading ? <Loading /> : list.length ? (
        <div className="stack-md">
          {list.map((l) => {
            const s = replies.get(l.id) ?? [];
            return (
              <LogCard
                key={l.id}
                log={l}
                to={`/app/logs/${l.id}`}
                extra={s.length ? (
                  <div className="wrap-row" style={{ marginTop: 4 }}>
                    {s.map((x) => <StatusPill key={x.id} tone={STATUS[x.status].tone} label={`${STATUS[x.status].label} · ${x.mapper_email}`} />)}
                  </div>
                ) : null}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="empty">
            Aucun log en ligne pour l’instant. Dans l’app, lance un enregistrement depuis le moniteur, connecte-toi à ton
            compte, et il apparaîtra ici après la synchronisation.
          </div>
        </Card>
      )}
    </>
  );
}

function SharePanel({ logId, defaultEmail }: { logId: string; defaultEmail: string }) {
  const shares = useQuery(() => sharesOfLog(logId), [logId]);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mapper, setMapper] = useState<{ email: string; found: { shop_name: string; pseudo: string } | null } | null>(null);

  useEffect(() => setEmail(defaultEmail), [defaultEmail]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  useEffect(() => {
    if (!valid) return;
    const e = email.trim().toLowerCase();
    const t = setTimeout(() => {
      findMapper(e).then((found) => setMapper({ email: e, found })).catch(() => setMapper(null));
    }, 400);
    return () => clearTimeout(t);
  }, [email, valid]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareLog(logId, email, message);
      setMessage('');
      shares.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const known = mapper && mapper.email === email.trim().toLowerCase() ? mapper.found : undefined;

  return (
    <Card>
      <div className="stack">
        <div className="row8"><Share size={20} color="var(--ok)" /><h2 className="h2" style={{ fontSize: 18 }}>Envoyer au mappeur</h2></div>
        <Field
          label="E-mail du préparateur"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email du mappeur"
          hint={
            !valid ? 'Pré-rempli depuis la fiche du véhicule quand elle le contient.'
            : known ? `✓ ${known.shop_name || known.pseudo || 'Mappeur'} est inscrit sur Tarmac.`
            : known === null ? 'Cette adresse n’a pas encore de compte mappeur : le log l’attendra jusqu’à son inscription.'
            : undefined
          }
        />
        <Field
          label="Message (facultatif)"
          multiline
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex. : trou à 4 200 tr/min en 3e, admission chaude après deux runs."
          maxLength={4000}
        />
        <ErrorBanner error={error} />
        <PrimaryButton title="Envoyer ce log" onClick={() => void send()} busy={busy} disabled={!valid} />

        {shares.data?.length ? (
          <div className="stack-md">
            <p className="section">Déjà envoyé à</p>
            {shares.data.map((s) => (
              <div key={s.id} className="stack-sm" style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
                <div className="between">
                  <span className="semi ellipsis">{s.mapper_email}</span>
                  <div className="row8">
                    <StatusPill tone={STATUS[s.status].tone} label={STATUS[s.status].label} />
                    <button
                      type="button"
                      className="btn-round"
                      aria-label={`Retirer le partage avec ${s.mapper_email}`}
                      title="Retirer le partage"
                      onClick={() => { if (confirm(`Retirer l’accès de ${s.mapper_email} à ce log ?`)) void unshare(s.id).then(shares.reload); }}
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                </div>
                {s.message ? <div className="message mine">{s.message}</div> : null}
                {s.reply ? (
                  <div className="stack-sm" style={{ gap: 4 }}>
                    <span className="dim tiny">Réponse du mappeur · {sinceLabel(s.updated_at)}</span>
                    <div className="message">{s.reply}</div>
                  </div>
                ) : <span className="dim tiny">Envoyé {sinceLabel(s.created_at)}</span>}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function LogDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const compareId = params.get('comparer');
  const log = useLog(id);
  const other = useLog(compareId && compareId !== id ? compareId : null);
  const all = useQuery(listMyLogs, []);

  if (log.loading) return <Loading />;
  if (log.error) return <><Header title="Log" back="/app" /><ErrorBanner error={log.error} /></>;
  if (!log.data) return <><Header title="Log introuvable" back="/app" /><p className="dim">Ce log a été supprimé.</p></>;

  const { row, csv, parsed } = log.data;
  const candidates = (all.data ?? []).filter((l) => l.id !== id);

  return (
    <>
      <Header
        title={row.name}
        back="/app"
        subtitle={`${frDateTime(row.started_at)} · ${humanDuration(row.duration_ms)} · ${row.rows_count} lignes · ${frNum(toNum(row.rate_hz) ?? 0)} Hz · ${humanBytes(row.bytes)}`}
      />
      {row.truncated ? <div className="banner info">Log tronqué : la limite de taille a été atteinte pendant l’enregistrement.</div> : null}
      <CompareChips candidates={candidates} value={compareId} onChange={(v) => setParams(v ? { comparer: v } : {})} />
      <LogViewer
        log={parsed}
        compare={other.data?.parsed}
        compareLabel={other.data ? other.data.row.name : undefined}
        onExport={() => downloadCsv(`tarmac-log-${row.name}`, csv)}
      />
      <SharePanel logId={id} defaultEmail={row.vehicle?.tuner_email ?? ''} />
    </>
  );
}

/** Choix du log de comparaison (avant / après carto). */
export function CompareChips({ candidates, value, onChange }: { candidates: LogRow[]; value: string | null; onChange: (id: string | null) => void }) {
  if (!candidates.length) return null;
  return (
    <div className="row8" style={{ flexWrap: 'wrap' }}>
      <span className="dim small semi">Comparer avec</span>
      <select className="select" style={{ width: 'auto', minWidth: 220, minHeight: 40 }} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Aucun log</option>
        {candidates.map((l) => <option key={l.id} value={l.id}>{l.name} — {frDate(l.started_at)}</option>)}
      </select>
    </div>
  );
}

/* ═════════════════════════════ Runs ═════════════════════════════ */

export function Runs() {
  const runs = useQuery(listMyRuns, []);
  const [mode, setMode] = useState<string>('all');
  const all = runs.data ?? [];
  const list = all.filter((r) => mode === 'all' || r.mode === mode);
  const timed = list.map((r) => toNum(r.time_s)).filter((t): t is number => t !== null);
  const modes = RUN_MODES.filter((m) => all.some((r) => r.mode === m.mode));

  const byDay = useMemo(() => {
    const groups: { day: string; runs: typeof list }[] = [];
    for (const r of list) {
      const day = frDate(r.started_at);
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.runs.push(r);
      else groups.push({ day, runs: [r] });
    }
    return groups;
  }, [list]);

  return (
    <>
      <Header title="Mes runs" />
      <div className="chips">
        <Chip label="Tous" active={mode === 'all'} onClick={() => setMode('all')} />
        {modes.map((m) => <Chip key={m.mode} label={m.label} active={mode === m.mode} onClick={() => setMode(m.mode)} />)}
      </div>
      {mode !== 'all' && timed.length ? (
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Stat label="Record" value={frNum(Math.min(...timed), 2)} unit="s" tone="ok" />
          <Stat label="Moyenne" value={frNum(timed.reduce((a, b) => a + b, 0) / timed.length, 2)} unit="s" />
          <Stat label="Runs" value={list.length} />
        </div>
      ) : null}
      <ErrorBanner error={runs.error} />
      {runs.loading ? <Loading /> : byDay.length ? byDay.map((g) => (
        <div key={g.day} className="stack-sm">
          <p className="section">{g.day}</p>
          <Card>
            {g.runs.map((r) => (
              <div key={r.id} className="list-row">
                <span className="num dim" style={{ width: 34 }}>#{r.number}</span>
                <span className="semi" style={{ width: 70 }}>{modeLabel(r.mode)}</span>
                <span className="dim small grow">{prepLabel(r.prep)}{r.trap_kph ? ` · ${r.trap_kph} km/h` : ''}{toNum(r.launch_slip_pct) ? ` · patinage ${frNum(toNum(r.launch_slip_pct)!, 0)} %` : ''}</span>
                {r.aborted_reason ? <StatusPill tone="danger" label="INTERROMPU" /> : r.is_record ? <StatusPill tone="ok" label="RECORD" /> : null}
                <span className="num" style={{ fontSize: 22, width: 76, textAlign: 'right' }}>{r.time_s ? frTime(r.time_s) : '—'}</span>
              </div>
            ))}
          </Card>
        </div>
      )) : <Card><div className="empty">Aucun run synchronisé. Les runs se mesurent dans l’app, sur la route ou la piste.</div></Card>}
    </>
  );
}

/* ═════════════════════════════ Garage ═════════════════════════════ */

const PREP_OPTIONS = (['origine', 'stage1', 'stage2', 'autre'] as const).map((v) => ({ value: v, label: PREP_LABELS[v] }));

function VehicleForm({ vehicle, onSaved }: { vehicle: VehicleRow; onSaved: () => void }) {
  const [v, setV] = useState(vehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof VehicleRow>(k: K, val: VehicleRow[K]) => { setSaved(false); setV((x) => ({ ...x, [k]: val })); };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const vin = v.vin?.trim() ? v.vin.trim().toUpperCase() : null;
      await saveVehicle({
        id: v.id, label: v.label.trim(), details: v.details.trim(), vin, prep: v.prep, mass_kg: Math.round(Number(v.mass_kg) || 0),
        tyres: v.tyres.trim(), tuner_email: v.tuner_email.trim().toLowerCase(), dongle_name: v.dongle_name,
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="stack">
        <Field label="Nom du véhicule" value={v.label} onChange={(e) => set('label', e.target.value)} />
        <Field label="Détails" value={v.details} onChange={(e) => set('details', e.target.value)} placeholder="Moteur, boîte, année" />
        <div className="stack-sm">
          <span className="dim small semi">Préparation</span>
          <Segmented value={v.prep as (typeof PREP_OPTIONS)[number]['value']} options={PREP_OPTIONS} onChange={(p) => set('prep', p)} />
          <span className="dim small">Elle sépare les classements : un Stage 2 ne se mesure pas à une voiture d’origine.</span>
        </div>
        <div className="grid2">
          <Field
            label="Poids avec pilote (kg)"
            type="number"
            min={0}
            max={4999}
            value={v.mass_kg || ''}
            onChange={(e) => set('mass_kg', Number(e.target.value))}
            hint="Il pilote le dyno virtuel : 50 kg d’erreur décalent la puissance estimée d’environ 4 %."
          />
          <Field label="Pneus" value={v.tyres} onChange={(e) => set('tyres', e.target.value)} placeholder="225/40 R18" />
        </div>
        <Field label="VIN (facultatif)" value={v.vin ?? ''} maxLength={17} onChange={(e) => set('vin', e.target.value)} />
        <Field
          label="Ton préparateur (facultatif)"
          type="email"
          placeholder="email du mappeur"
          value={v.tuner_email}
          onChange={(e) => set('tuner_email', e.target.value)}
          hint="Pré-remplit l’envoi des logs de ce véhicule."
        />
        <ErrorBanner error={error} />
        {saved ? <div className="banner ok">Enregistré. Le téléphone le récupérera à sa prochaine synchronisation.</div> : null}
        <PrimaryButton title="Enregistrer" onClick={() => void save()} busy={busy} disabled={!v.label.trim()} />
      </div>
    </Card>
  );
}

export function Garage() {
  const vehicles = useQuery(listMyVehicles, []);
  return (
    <>
      <Header title="Mon véhicule" />
      <ErrorBanner error={vehicles.error} />
      {vehicles.loading ? <Loading /> : vehicles.data?.length ? (
        vehicles.data.map((v) => <VehicleForm key={v.id} vehicle={v} onSaved={vehicles.reload} />)
      ) : (
        <Card><div className="empty">Aucun véhicule synchronisé. La fiche se crée dans l’app, à l’appairage du boîtier.</div></Card>
      )}
    </>
  );
}

/* ═════════════════════════════ Compte ═════════════════════════════ */

export function Compte() {
  const { user } = useAuth();
  const { profile } = useSpace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pseudo, setPseudo] = useState('');
  const [ranking, setRanking] = useState(true);
  const [isMapper, setIsMapper] = useState(params.get('mappeur') === '1');
  const [shop, setShop] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setPseudo(p.pseudo);
    setRanking(p.show_in_ranking);
    setIsMapper(p.is_mapper || params.get('mappeur') === '1');
    setShop(p.shop_name);
  }, [profile.data, params]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const patch = { pseudo: pseudo.trim(), show_in_ranking: ranking, is_mapper: isMapper, shop_name: isMapper ? shop.trim() : '' };
      await saveProfile(patch);
      profile.set({ owner_id: profile.data?.owner_id ?? '', ...patch });
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title="Compte" subtitle={user?.email} />
      {profile.loading ? <Loading /> : (
        <Card>
          <div className="stack">
            <Field label="Pseudo" value={pseudo} onChange={(e) => { setSaved(false); setPseudo(e.target.value); }} hint="C’est le nom affiché au classement." />
            <Switch value={ranking} onChange={(v) => { setSaved(false); setRanking(v); }} label="Apparaître au classement" hint="Ton meilleur temps par épreuve, sous ton pseudo. Jamais ta position ni ton VIN." />
            <Switch value={isMapper} onChange={(v) => { setSaved(false); setIsMapper(v); }} label="Je suis mappeur" hint="Ouvre l’espace où tu reçois les logs adressés à ton e-mail." />
            {isMapper ? <Field label="Nom de l’atelier" value={shop} onChange={(e) => { setSaved(false); setShop(e.target.value); }} /> : null}
            <ErrorBanner error={error ?? profile.error} />
            {saved ? <div className="banner ok">Profil enregistré.</div> : null}
            <PrimaryButton title="Enregistrer" onClick={() => void save()} busy={busy} />
            {saved && isMapper ? <GhostButton title="Ouvrir l’espace mappeur" to="/mappeur" /> : null}
          </div>
        </Card>
      )}
      <Card>
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <span className="dim">Le même compte fonctionne dans l’app. <Link to="/telecharger" className="ok">Télécharger l’app</Link></span>
          <GhostButton small title="Se déconnecter" onClick={() => void auth.signOut().then(() => navigate('/'))} />
        </div>
      </Card>
    </>
  );
}
