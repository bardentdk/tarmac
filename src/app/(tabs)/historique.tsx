/**
 * (tabs)/historique.tsx — « Mes runs » (maquette « Historique des runs »).
 *
 * Trois chiffres en haut (record, moyenne, total), des filtres par épreuve, et
 * la liste groupée par jour. Un run interrompu reste dans la liste, bordé de
 * rouge : effacer un échec reviendrait à effacer l'information la plus utile.
 *
 * La liste est une FlatList sectionnée à la main plutôt qu'une SectionList :
 * on a besoin d'en-têtes libres (« Aujourd'hui », « Samedi 10 oct. ») et de
 * cartes animées à l'entrée.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { Layout } from 'react-native-reanimated';
import { Chip, Dim, Num, Screen, Tappable, Txt } from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { colors, fonts, radius, space, tap } from '@/ui/tokens';
import { runStats, useAppStore } from '@/store/appStore';
import { RUN_MODES, type RunMode, type RunRecord } from '@/run/types';

type Filter = RunMode | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  ...RUN_MODES.map((m) => ({ value: m.mode as Filter, label: m.label })),
];

const fr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

/** « Aujourd'hui », « Hier », sinon « samedi 10 oct. ». */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return "Aujourd'hui";
  const yesterday = new Date(today.getTime() - 86400000);
  if (isSameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function Historique() {
  const runs = useAppStore((s) => s.runs);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? runs : runs.filter((r) => r.mode === filter)),
    [runs, filter],
  );

  const stats = useMemo(() => runStats(runs, filter), [runs, filter]);

  // Regroupement par jour, en conservant l'ordre (les runs sont déjà du plus
  // récent au plus ancien).
  const groups = useMemo(() => {
    const out: { label: string; items: RunRecord[] }[] = [];
    for (const r of filtered) {
      const label = dayLabel(r.startedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [filtered]);

  return (
    <Screen scroll edges={['top']} style={hi.screen}>
      <Text style={hi.h1}>Mes runs</Text>

      <View style={hi.stats}>
        <StatTile label={`Record ${filter === 'all' ? '' : FILTERS.find((f) => f.value === filter)?.label ?? ''}`.trim()} value={stats.best !== null ? `${fr(stats.best)} s` : '—'} highlight />
        <StatTile label="Moyenne" value={stats.average !== null ? `${fr(stats.average)} s` : '—'} />
        <StatTile label="Runs" value={String(filtered.length)} />
      </View>

      <View style={hi.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>

      {groups.length === 0 ? (
        <View style={hi.empty}>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16 }}>Aucun run pour l'instant</Txt>
          <Dim style={{ fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            Connecte ton boîtier, va sur l'onglet « Lancer » et arme ton premier chrono.
          </Dim>
          <Tappable onPress={() => router.push('/(tabs)')} label="Aller à l'écran de lancement" haptic={false}>
            <Text style={hi.link}>Aller lancer un run →</Text>
          </Tappable>
        </View>
      ) : null}

      {groups.map((g, gi) => (
        <View key={g.label + gi} style={{ gap: space.sm }}>
          <Dim style={hi.section}>{g.label}</Dim>
          {g.items.map((r, i) => (
            <FadeInUp key={r.id} delay={Math.min(300, (gi * 3 + i) * 45)}>
              <RunRow run={r} />
            </FadeInUp>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={hi.statTile}>
      <Dim style={{ fontSize: 12 }} numberOfLines={1}>{label}</Dim>
      <Num style={[hi.statValue, highlight && { color: colors.ok, fontFamily: fonts.numBlack }]}>{value}</Num>
    </View>
  );
}

function RunRow({ run }: { run: RunRecord }) {
  const aborted = run.timeS === null;
  const time = new Date(run.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Animated.View layout={Layout.springify()}>
      <Tappable
        onPress={() => router.push(aborted ? `/courbes/${run.id}` : `/analyse/${run.id}`)}
        label={`Run ${run.number}`}
        scaleTo={0.985}
      >
        <View style={[hi.run, aborted && { borderWidth: 1, borderColor: colors.dangerBorder }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>
                {run.mode} · Run #{run.number}
              </Txt>
              {run.isRecord ? (
                <View style={hi.badge}>
                  <Text style={hi.badgeTxt}>RECORD</Text>
                </View>
              ) : null}
            </View>
            <Text style={[hi.runMeta, aborted && { color: colors.dangerRun }]} numberOfLines={1}>
              {aborted
                ? run.abortedReason
                : `${time} · corrigé ${fr(run.correctedS ?? run.timeS!)} s${run.trapKph ? ` · ${run.trapKph} km/h en sortie` : ''}`}
            </Text>
          </View>
          <Num style={[hi.runTime, aborted && { color: colors.text2 }, run.isRecord && { color: colors.ok }]}>
            {aborted ? '—' : fr(run.timeS!)}
          </Num>
        </View>
      </Tappable>
    </Animated.View>
  );
}

const hi = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl, gap: space.lg },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  stats: { flexDirection: 'row', gap: space.sm },
  statTile: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: space.md, gap: 2 },
  statValue: { fontSize: 26, fontFamily: fonts.numBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  runMeta: { color: colors.text2, fontFamily: fonts.body, fontSize: 13 },
  runTime: { fontSize: 26, fontFamily: fonts.numBold },
  badge: { backgroundColor: colors.ok, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  badgeTxt: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 11 },
  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl * 2,
    paddingHorizontal: space.lg,
  },
  link: { color: colors.ok, fontFamily: fonts.bodySemi, fontSize: 15, minHeight: tap.min },
});
