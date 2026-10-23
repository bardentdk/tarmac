/**
 * mappeur.tsx — l'espace préparateur.
 *
 * Tout part de `log_shares` : un partage = un log adressé à l'e-mail vérifié
 * du mappeur. La base ne lui laisse lire que ces logs-là (et la fiche du
 * véhicule concerné), en lecture seule ; il ne peut écrire que le statut du
 * dossier et sa réponse.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { humanBytes, humanDuration } from '@/log/logFormat';
import { useAuth } from '~/auth/session';
import { mapperInbox, mapperShare, updateShare, type InboxRow, type ShareStatus } from '~/data/api';
import { useQuery } from '~/data/useQuery';
import { Card, Chip, ErrorBanner, Field, Header, Loading, PrimaryButton, Segmented, Stat, StatusPill } from '~/ui/components';
import { frDate, frDateTime, frNum, prepLabel, sinceLabel, toNum, triggerLabel } from '~/ui/format';
import { ChevronRight, Magnifier } from '~/ui/icons';
import { LogViewer } from '~/ui/LogViewer';
import { CompareChips, STATUS } from './client';
import { downloadCsv, useLog } from './useLog';

const clientName = (s: InboxRow) => s.client_name || s.client_email || 'Client';

function useInbox() {
  const { user } = useAuth();
  return useQuery(() => (user ? mapperInbox(user.email) : Promise.resolve([])), [user?.email]);
}

function InboxItem({ s }: { s: InboxRow }) {
  const v = s.log?.vehicle;
  return (
    <Card to={`/mappeur/dossiers/${s.id}`}>
      <div className="row12">
        {s.status === 'envoye' ? <span className="dot" style={{ background: 'var(--ok)' }} aria-label="Nouveau" /> : <span className="dot" />}
        <div className="grow stack-sm" style={{ gap: 2 }}>
          <div className="between">
            <span className={`ellipsis ${s.status === 'envoye' ? 'bold' : 'semi'}`}>{clientName(s)}</span>
            <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{sinceLabel(s.created_at)}</span>
          </div>
          <span className="ellipsis">
            {s.log?.name ?? 'Log supprimé'}
            <span className="dim"> · {v ? `${v.label} (${prepLabel(v.prep)})` : 'véhicule non renseigné'}</span>
          </span>
          {s.message ? <span className="dim small ellipsis">« {s.message} »</span> : null}
        </div>
        <StatusPill tone={STATUS[s.status].tone} label={STATUS[s.status].label} />
        <ChevronRight size={18} color="var(--text2)" />
      </div>
    </Card>
  );
}

function matches(s: InboxRow, q: string): boolean {
  if (!q) return true;
  const hay = [s.client_name, s.client_email, s.message, s.log?.name, s.log?.vehicle?.label, s.log?.vehicle?.details, s.log?.vehicle?.vin]
    .join(' ')
    .toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function MapperInbox() {
  const inbox = useInbox();
  const [status, setStatus] = useState<ShareStatus | 'all' | 'open'>('open');
  const [q, setQ] = useState('');
  const all = inbox.data ?? [];
  const count = (st: ShareStatus) => all.filter((s) => s.status === st).length;
  const list = all.filter((s) => (status === 'all' ? true : status === 'open' ? s.status !== 'traite' : s.status === status) && matches(s, q));

  return (
    <>
      <Header title="Logs reçus" subtitle="Les logs que tes clients t’ont adressés." />
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Stat label="Nouveaux" value={count('envoye')} tone={count('envoye') ? 'ok' : undefined} />
        <Stat label="Vus" value={count('vu')} />
        <Stat label="En cours" value={count('en-cours')} tone={count('en-cours') ? 'warn' : undefined} />
        <Stat label="Traités" value={count('traite')} />
      </div>
      <div className="row12" style={{ flexWrap: 'wrap' }}>
        <div className="chips grow">
          <Chip label="À traiter" active={status === 'open'} onClick={() => setStatus('open')} />
          {(['envoye', 'vu', 'en-cours', 'traite'] as const).map((st) => (
            <Chip key={st} label={STATUS[st].label.charAt(0) + STATUS[st].label.slice(1).toLowerCase()} active={status === st} onClick={() => setStatus(st)} />
          ))}
          <Chip label="Tous" active={status === 'all'} onClick={() => setStatus('all')} />
        </div>
        <label className="row8" style={{ position: 'relative', minWidth: 240 }}>
          <span style={{ position: 'absolute', left: 12, color: 'var(--text2)' }}><Magnifier size={18} /></span>
          <input className="input" style={{ paddingLeft: 40, minHeight: 44 }} placeholder="Client, véhicule, VIN…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </label>
      </div>
      <ErrorBanner error={inbox.error} />
      {inbox.loading ? <Loading /> : list.length ? (
        <div className="stack-md">{list.map((s) => <InboxItem key={s.id} s={s} />)}</div>
      ) : (
        <Card>
          <div className="empty">
            {all.length ? 'Rien dans ce filtre.' : 'Aucun log reçu pour l’instant. Donne ton adresse e-mail à tes clients : ils la renseignent dans la fiche de leur véhicule, puis t’envoient leurs logs depuis l’app ou le site.'}
          </div>
        </Card>
      )}
    </>
  );
}

export function MapperDossier() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const share = useQuery(() => mapperShare(id), [id]);
  const inbox = useInbox();
  const s = share.data;
  const log = useLog(s?.log_id ?? null);
  const compareId = params.get('comparer');
  const other = useLog(compareId);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<ShareStatus>('vu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  // Ouvrir un dossier neuf le marque « vu » : le client le voit sur son log.
  useEffect(() => {
    if (!s) return;
    setReply(s.reply);
    if (s.status === 'envoye') {
      setStatus('vu');
      updateShare(s.id, { status: 'vu' }).catch(() => { /* le statut se corrigera au prochain envoi */ });
    } else {
      setStatus(s.status);
    }
  }, [s]);

  const sameClient = useMemo(
    () => (inbox.data ?? []).filter((x) => s && x.owner_id === s.owner_id && x.log && x.log_id !== s.log_id),
    [inbox.data, s],
  );

  if (share.loading) return <Loading />;
  if (share.error || !s) return <><Header title="Dossier" back="/mappeur" />{share.error ? <ErrorBanner error={share.error} /> : <p className="dim">Ce partage a été retiré par le client.</p>}</>;

  const v = s.log?.vehicle;
  const save = async (st: ShareStatus) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateShare(s.id, { status: st, reply: reply.trim() });
      setStatus(st);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header
        title={s.log?.name ?? 'Log supprimé'}
        back="/mappeur"
        subtitle={s.log ? `${frDateTime(s.log.started_at)} · ${humanDuration(s.log.duration_ms)} · ${s.log.rows_count} lignes · ${frNum(toNum(s.log.rate_hz) ?? 0)} Hz · ${humanBytes(s.log.bytes)} · ${triggerLabel(s.log.trigger)}` : undefined}
        right={<StatusPill tone={STATUS[status].tone} label={STATUS[status].label} />}
      />

      <div className="grid2">
        <Card>
          <div className="stack-sm">
            <p className="section">Client</p>
            <span className="bold" style={{ fontSize: 17 }}>{clientName(s)}</span>
            {s.client_email ? <a className="ok small" href={`mailto:${s.client_email}?subject=${encodeURIComponent(`Ton log « ${s.log?.name ?? ''} »`)}`}>{s.client_email}</a> : null}
            <span className="dim small">Envoyé {sinceLabel(s.created_at)} · <Link to={`/mappeur/clients/${encodeURIComponent(s.owner_id)}`} className="ok">tous ses logs</Link></span>
            {s.message ? <div className="message">{s.message}</div> : <span className="dim small">Pas de message.</span>}
          </div>
        </Card>
        <Card>
          <div className="stack-sm">
            <p className="section">Véhicule</p>
            {v ? (
              <>
                <span className="bold" style={{ fontSize: 17 }}>{v.label}</span>
                {v.details ? <span className="dim small">{v.details}</span> : null}
                <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <Stat label="Prépa" value={prepLabel(v.prep)} />
                  <Stat label="Poids" value={v.mass_kg || '—'} unit={v.mass_kg ? 'kg' : undefined} />
                  <Stat label="Pneus" value={<span style={{ fontSize: 16 }}>{v.tyres || '—'}</span>} />
                </div>
                <span className="dim small">VIN {v.vin ?? 'non renseigné'}{s.log?.dongle ? ` · boîtier ${s.log.dongle}` : ''}</span>
              </>
            ) : <span className="dim small">Le client n’a pas rattaché ce log à un véhicule.</span>}
          </div>
        </Card>
      </div>

      {log.loading ? <Loading label="Chargement du log…" /> : log.error ? <ErrorBanner error={log.error} /> : log.data ? (
        <>
          <CompareChips
            candidates={sameClient.map((x) => x.log!)}
            value={compareId}
            onChange={(c) => setParams(c ? { comparer: c } : {})}
          />
          <LogViewer
            log={log.data.parsed}
            compare={other.data?.parsed}
            compareLabel={other.data?.row.name}
            onExport={() => downloadCsv(`${clientName(s)}-${log.data!.row.name}`, log.data!.csv)}
          />
        </>
      ) : null}

      <Card>
        <div className="stack">
          <h2 className="h2" style={{ fontSize: 18 }}>Ta réponse</h2>
          <Segmented<ShareStatus>
            value={status}
            onChange={(st) => { setSaved(false); setStatus(st); }}
            options={[{ value: 'vu', label: 'Vu' }, { value: 'en-cours', label: 'En cours' }, { value: 'traite', label: 'Traité' }]}
          />
          <Field
            label="Message au client"
            multiline
            maxLength={8000}
            value={reply}
            onChange={(e) => { setSaved(false); setReply(e.target.value); }}
            placeholder="Ce que tu vois dans le log, ce que tu changes dans la carto, ce qu’il doit refaire comme log."
            hint="Le client lit ta réponse sur son log, dans l’espace pilote."
          />
          <ErrorBanner error={error} />
          {saved ? <div className="banner ok">Réponse enregistrée.</div> : null}
          <PrimaryButton title="Enregistrer la réponse" onClick={() => void save(status)} busy={busy} />
        </div>
      </Card>
    </>
  );
}

interface ClientGroup {
  ownerId: string;
  name: string;
  email: string;
  shares: InboxRow[];
  vehicles: string[];
  last: string;
  open: number;
}

function groupClients(rows: InboxRow[]): ClientGroup[] {
  const m = new Map<string, ClientGroup>();
  for (const s of rows) {
    const g = m.get(s.owner_id) ?? { ownerId: s.owner_id, name: clientName(s), email: s.client_email, shares: [], vehicles: [], last: s.created_at, open: 0 };
    g.shares.push(s);
    const label = s.log?.vehicle?.label;
    if (label && !g.vehicles.includes(label)) g.vehicles.push(label);
    if (s.created_at > g.last) g.last = s.created_at;
    if (s.status !== 'traite') g.open++;
    m.set(s.owner_id, g);
  }
  return [...m.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export function MapperClients() {
  const inbox = useInbox();
  const navigate = useNavigate();
  const groups = groupClients(inbox.data ?? []);
  return (
    <>
      <Header title="Clients" subtitle="Les pilotes qui t’ont envoyé au moins un log." />
      <ErrorBanner error={inbox.error} />
      {inbox.loading ? <Loading /> : groups.length ? (
        <Card>
          <table className="tbl">
            <thead><tr><th>Client</th><th>Véhicules</th><th style={{ textAlign: 'right' }}>Logs</th><th style={{ textAlign: 'right' }}>À traiter</th><th>Dernier envoi</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.ownerId} className="click" onClick={() => navigate(`/mappeur/clients/${encodeURIComponent(g.ownerId)}`)}>
                  <td><Link to={`/mappeur/clients/${encodeURIComponent(g.ownerId)}`} className="semi">{g.name}</Link><div className="dim small">{g.email}</div></td>
                  <td className="dim">{g.vehicles.join(', ') || '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 18 }}>{g.shares.length}</td>
                  <td className={`num ${g.open ? 'ok' : 'dim'}`} style={{ textAlign: 'right', fontSize: 18 }}>{g.open}</td>
                  <td className="dim small">{frDate(g.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : <Card><div className="empty">Aucun client pour l’instant.</div></Card>}
    </>
  );
}

export function MapperClient() {
  const { ownerId = '' } = useParams();
  const inbox = useInbox();
  const g = groupClients(inbox.data ?? []).find((x) => x.ownerId === ownerId);
  if (inbox.loading) return <Loading />;
  if (!g) return <><Header title="Client" back="/mappeur/clients" /><p className="dim">Ce client ne t’a plus aucun log partagé.</p></>;
  return (
    <>
      <Header title={g.name} subtitle={g.email} back="/mappeur/clients" />
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Stat label="Logs reçus" value={g.shares.length} />
        <Stat label="À traiter" value={g.open} tone={g.open ? 'ok' : undefined} />
        <Stat label="Véhicules" value={g.vehicles.length} />
      </div>
      <div className="stack-md">{g.shares.map((s) => <InboxItem key={s.id} s={s} />)}</div>
    </>
  );
}
