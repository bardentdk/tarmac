/**
 * courbes/[id].tsx — les courbes du run (maquette « Courbes du run »).
 *
 * C'est l'écran des gens qui veulent comprendre. Deux courbes superposées — le
 * run et le record —, les passages de rapport repérés, et les zones où le
 * calculateur a retiré de l'avance surlignées en orange. Superposer, c'est la
 * seule façon de voir OÙ l'écart se creuse : un chrono global ne le dit pas.
 *
 * Le curseur en bas déplace une lecture instantanée des quatre grandeurs. On
 * l'a mis en bas, sous le pouce, parce qu'on le manipule d'une main.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Chip, Dim, GhostButton, Header, Num, PrimaryButton, Screen, Txt } from '@/ui/components';
import { FadeInUp, ProgressBar } from '@/ui/motion';
import { RunChart } from '@/ui/charts';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { buildChartSeries, deltaAt, sampleAt } from '@/run/analysis';
import { runModeDef } from '@/run/types';
import { runToCsv, runToSummary, shareText } from '@/debug/share';

type Metric = 'speed' | 'boost' | 'rpm' | 'advance';

const METRICS: { key: Metric; label: string; unit: string; tone?: 'warn' }[] = [
  { key: 'speed', label: 'Vitesse', unit: 'km/h' },
  { key: 'boost', label: 'Boost', unit: 'bar' },
  { key: 'rpm', label: 'Régime', unit: 'tr/min' },
  { key: 'advance', label: 'Avance', unit: '°', tone: 'warn' },
];

const fr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export default function Courbes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useAppStore((s) => s.runs.find((r) => r.id === id));
  const bestRun = useAppStore((s) => s.bestRun);
  const vehicle = useAppStore((s) => s.vehicle);

  const [metric, setMetric] = useState<Metric>('speed');
  /** Position du curseur, en secondes depuis le départ. */
  const [cursor, setCursor] = useState<number | null>(null);
  /** Largeur mesurée du rail : sert à convertir un toucher en seconde. */
  const [railWidth, setRailWidth] = useState(0);

  const reference = useMemo(() => {
    if (!run) return null;
    const best = bestRun(run.mode);
    return best && best.id !== run.id ? best : null;
  }, [run, bestRun]);

  const series = useMemo(() => (run ? buildChartSeries(run, reference, metric) : null), [run, reference, metric]);

  if (!run || !series) {
    return (
      <Screen style={cb.screen}>
        <Header title="Courbes" onBack={() => router.back()} />
        <Txt>Ce run n'existe plus.</Txt>
      </Screen>
    );
  }

  const def = runModeDef(run.mode);
  const duration = (run.samples.at(-1)?.ms ?? 1000) / 1000;
  const at = cursor ?? duration * 0.7;
  const s = sampleAt(run, at);
  const delta = deltaAt(run, reference, at);
  const info = METRICS.find((m) => m.key === metric)!;

  /** Convertit l'abscisse du doigt en instant du run. */
  const moveCursor = (x: number) => {
    if (railWidth <= 0) return;
    setCursor(Math.max(0, Math.min(duration, (x / railWidth) * duration)));
  };

  // Graduations de l'axe des ordonnées, adaptées à la grandeur affichée.
  const maxV = Math.max(...series.run.map((p) => p.v), 1);
  const yTicks =
    metric === 'speed' ? [25, 50, 75, 100].filter((v) => v <= maxV * 1.1)
    : metric === 'rpm' ? [2000, 3500, 5000, 6500].filter((v) => v <= maxV * 1.1)
    : metric === 'boost' ? [0.5, 1, 1.5].filter((v) => v <= maxV * 1.2)
    : [0, 10, 20, 30].filter((v) => v <= maxV * 1.2);

  const xTicks = [0, Math.round(duration / 3), Math.round((2 * duration) / 3), Math.round(duration)];

  return (
    <Screen scroll style={cb.screen}>
      <Header
        title={reference ? `Run #${run.number} vs record` : `Run #${run.number}`}
        subtitle={
          reference?.timeS != null && run.timeS !== null
            ? `${def.label} · ${fr(run.timeS)} s contre ${fr(reference.timeS)} s`
            : `${def.label} · ${run.timeS !== null ? `${fr(run.timeS)} s` : 'interrompu'}`
        }
        onBack={() => router.back()}
      />

      <View style={cb.chips}>
        {METRICS.map((m) => (
          <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} tone={m.tone} />
        ))}
      </View>

      <FadeInUp>
        <RunChart
          run={series.run}
          reference={series.reference}
          yTicks={yTicks}
          xTicks={xTicks}
          shifts={series.shifts}
          retardZones={series.retardZones}
          unit={info.unit}
        />
      </FadeInUp>

      {/* Lecture instantanée. */}
      <FadeInUp delay={80}>
        <Card style={{ gap: space.md, borderRadius: 18, padding: space.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Dim style={{ fontSize: 14 }}>
              À <Text style={{ color: colors.text, fontFamily: fonts.bodyBold }}>{fr(at, 1)} s</Text>
            </Dim>
            {delta !== null ? (
              <Text style={[cb.delta, { color: delta > 0 ? colors.warnText : colors.ok }]}>
                {delta > 0 ? '−' : '+'}{fr(Math.abs(delta))} s vs record
              </Text>
            ) : null}
          </View>

          <View style={cb.readouts}>
            <Readout label="Vitesse" value={s?.speedKph ?? null} decimals={0} />
            <Readout label="Régime" value={s?.rpm ?? null} decimals={0} />
            <Readout label="Boost" value={s?.boostBar ?? null} decimals={2} />
            <Readout label="Avance" value={s?.advanceDeg ?? null} decimals={1} warn={(s?.advanceDeg ?? 99) < 6} />
          </View>

          {/* Curseur temporel : un rail que l'on balaie au pouce. On gère le
              geste à la main plutôt qu'avec un Slider natif, pour garder
              exactement les couleurs de la charte sur les deux plateformes. */}
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Position dans le run"
            accessibilityValue={{ min: 0, max: Math.round(duration * 100), now: Math.round(at * 100) }}
            style={cb.rail}
            onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => moveCursor(e.nativeEvent.locationX)}
            onResponderMove={(e) => moveCursor(e.nativeEvent.locationX)}
          >
            <ProgressBar ratio={at / duration} height={10} duration={70} />
          </View>
        </Card>
      </FadeInUp>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
        <GhostButton
          title="Exporter CSV"
          style={{ flex: 1 }}
          onPress={() => void shareText(runToCsv(run), `tarmac-run-${run.number}`, 'csv')}
        />
        <PrimaryButton
          title="Envoyer au mappeur"
          style={{ flex: 1 }}
          onPress={() =>
            void shareText(
              `${runToSummary(run, `Véhicule : ${vehicle.label} (${run.prep})`)}\n\n${runToCsv(run)}`,
              `tarmac-run-${run.number}`,
              'csv',
            )
          }
        />
      </View>
    </Screen>
  );
}

function Readout({
  label,
  value,
  decimals,
  warn,
}: {
  label: string;
  value: number | null;
  decimals: number;
  warn?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Dim style={{ fontSize: 11 }}>{label}</Dim>
      <Num style={[cb.readoutValue, warn && { color: colors.warnText }]}>
        {value === null ? '—' : fr(value, decimals)}
      </Num>
    </View>
  );
}

const cb = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  delta: { fontFamily: fonts.bodySemi, fontSize: 13 },
  readouts: { flexDirection: 'row', gap: space.sm },
  readoutValue: { fontSize: 22, fontFamily: fonts.numBold },
  // Hauteur généreuse : la cible tactile fait 32 px même si la barre en fait 10.
  rail: { paddingVertical: 11 },
});
