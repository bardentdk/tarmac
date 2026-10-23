/**
 * Classement.tsx — le classement public (vue `app.leaderboard`).
 *
 * Un seul temps par pilote, épreuve et préparation : le meilleur. Seuls les
 * pilotes qui ont accepté d'apparaître sont listés, sous leur pseudo.
 */
import { useState } from 'react';
import { RUN_MODES } from '@/run/types';
import { useAuth } from '~/auth/session';
import { leaderboard, myRank } from '~/data/api';
import { useQuery } from '~/data/useQuery';
import { Card, Chip, ErrorBanner, Loading, Segmented } from '~/ui/components';
import { frDate, frTime, PREP_LABELS, toNum } from '~/ui/format';

type Prep = 'toutes' | 'origine' | 'stage1' | 'stage2' | 'autre';

export default function Classement({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [mode, setMode] = useState('0-100');
  const [prep, setPrep] = useState<Prep>('toutes');
  const p = prep === 'toutes' ? null : prep;
  const board = useQuery(() => leaderboard(mode, p), [mode, p]);
  const rank = useQuery(() => (user ? myRank(mode, p) : Promise.resolve(null)), [mode, p, user?.id]);

  return (
    <div className={embedded ? 'stack' : 'wrap stack'} style={embedded ? undefined : { paddingTop: 40, maxWidth: 900 }}>
      <h1 className="h1">Classement</h1>
      <div className="chips">
        {RUN_MODES.map((m) => <Chip key={m.mode} label={m.label} active={m.mode === mode} onClick={() => setMode(m.mode)} />)}
      </div>
      <Segmented
        value={prep}
        onChange={setPrep}
        options={[{ value: 'toutes', label: 'Toutes' }, ...(['origine', 'stage1', 'stage2', 'autre'] as const).map((v) => ({ value: v, label: PREP_LABELS[v] }))]}
      />

      {rank.data ? (
        <Card tone="ok">
          <div className="between">
            <span>Ta position</span>
            <span className="num" style={{ fontSize: 28 }}>
              {rank.data.rank}<span className="dim" style={{ fontSize: 16 }}> / {rank.data.total}</span>
            </span>
          </div>
          <div className="dim small">
            Ton meilleur temps : {frTime(rank.data.time_s)} s
            {toNum(rank.data.gap_to_leader) ? ` · ${frTime(rank.data.gap_to_leader)} s derrière le premier` : ' · tu es en tête'}
          </div>
        </Card>
      ) : null}

      <Card>
        {board.loading ? <Loading /> : board.error ? <ErrorBanner error={board.error} /> : board.data?.length ? (
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Pilote</th><th>Prépa</th><th style={{ textAlign: 'right' }}>Temps</th><th style={{ textAlign: 'right' }} className="hide-sm">Corrigé</th><th className="hide-sm">Date</th></tr>
            </thead>
            <tbody>
              {board.data.map((r, i) => (
                <tr key={`${r.entrant}-${r.prep}`}>
                  <td className="num" style={{ fontSize: 18, color: i < 3 ? 'var(--ok)' : undefined }}>{i + 1}</td>
                  <td className="semi">{r.pseudo}</td>
                  <td className="dim">{PREP_LABELS[r.prep] ?? r.prep}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 18 }}>{frTime(r.time_s)} s</td>
                  <td className="dim" style={{ textAlign: 'right' }}>{r.corrected_s ? `${frTime(r.corrected_s)} s` : '—'}</td>
                  <td className="dim small">{frDate(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            Personne n’est encore classé sur cette épreuve. Le classement se remplit avec les vrais runs des pilotes qui
            acceptent d’y apparaître — aucun faux pilote ici.
          </div>
        )}
      </Card>
    </div>
  );
}
