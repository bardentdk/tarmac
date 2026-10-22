/**
 * comparatif.tsx — avant / après reprogrammation (maquette « Avant et après reprog »).
 *
 * L'intérêt de cet écran est de répondre à une question qui coûte cher : « ma
 * reprog a-t-elle vraiment servi ? ». Beaucoup d'automobilistes paient une
 * cartographie et n'ont aucune mesure, juste une impression.
 *
 * Point méthodologique : on compare des temps CORRIGÉS de la météo. Comparer
 * un run d'avant fait un matin frais avec un run d'après fait à 32 °C
 * donnerait un résultat faux, parfois même négatif.
 *
 * Les lignes affichées se construisent uniquement à partir de runs réels.
 * S'il n'y a pas de runs dans l'une des deux configurations, on le dit au lieu
 * d'inventer un gain.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Dim, GhostButton, Header, Num, PrimaryButton, Screen, Tappable, Txt } from '@/ui/components';
import { FadeInUp, ProgressBar } from '@/ui/motion';
import { Swap } from '@/ui/icons';
import { colors, fonts, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import type { RunRecord } from '@/run/types';
import type { PrepLevel } from '@/store/storage';
import { computeDyno } from '@/run/dyno';
import { IBIZA_STAGE1 } from '@/transport/vehicleSim';
import { copyText, shareText } from '@/debug/share';

const PREP_LABELS: Record<PrepLevel, string> = {
  origine: 'Origine',
  stage1: 'Stage 1',
  stage2: 'Stage 2',
  autre: 'Autre',
};

const fr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface Metric {
  label: string;
  before: number | null;
  after: number | null;
  unit: string;
  decimals: number;
  /** Pour ces mesures, plus petit = mieux (un chrono). */
  lowerIsBetter: boolean;
  note?: string;
}

/** Meilleur temps corrigé d'une épreuve, dans une configuration donnée. */
function bestCorrected(runs: RunRecord[], prep: PrepLevel, mode: string): number | null {
  const list = runs.filter((r) => r.prep === prep && r.mode === mode && r.correctedS !== null);
  if (list.length === 0) return null;
  return Math.min(...list.map((r) => r.correctedS!));
}

/** Puissance estimée maximale observée dans une configuration. */
function bestPower(runs: RunRecord[], prep: PrepLevel, massKg: number): number | null {
  const results = runs
    .filter((r) => r.prep === prep)
    .map((r) => computeDyno(r.samples, massKg, IBIZA_STAGE1))
    .filter((d): d is NonNullable<typeof d> => d !== null);
  if (results.length === 0) return null;
  return Math.max(...results.map((d) => d.peakPower.hp));
}

/** Température d'admission moyenne en run. */
function avgIat(runs: RunRecord[], prep: PrepLevel): number | null {
  const samples = runs.filter((r) => r.prep === prep).flatMap((r) => r.samples.map((s) => s.iatC)).filter((v): v is number => v !== null);
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

export default function Comparatif() {
  const runs = useAppStore((s) => s.runs);
  const vehicle = useAppStore((s) => s.vehicle);

  // Les deux configurations comparées. Par défaut : origine contre la
  // préparation actuelle du véhicule.
  const [before, setBefore] = useState<PrepLevel>('origine');
  const [after, setAfter] = useState<PrepLevel>(vehicle.prep === 'origine' ? 'stage1' : vehicle.prep);

  const metrics: Metric[] = useMemo(() => {
    const mass = vehicle.massKg || IBIZA_STAGE1.massKg;
    const iatBefore = avgIat(runs, before);
    const iatAfter = avgIat(runs, after);
    return [
      {
        label: '0-100 km/h',
        before: bestCorrected(runs, before, '0-100'),
        after: bestCorrected(runs, after, '0-100'),
        unit: 's',
        decimals: 2,
        lowerIsBetter: true,
      },
      {
        label: '100-200 km/h',
        before: bestCorrected(runs, before, '100-200'),
        after: bestCorrected(runs, after, '100-200'),
        unit: 's',
        decimals: 1,
        lowerIsBetter: true,
      },
      {
        label: '402 m',
        before: bestCorrected(runs, before, '402m'),
        after: bestCorrected(runs, after, '402m'),
        unit: 's',
        decimals: 2,
        lowerIsBetter: true,
      },
      {
        label: 'Puissance estimée',
        before: bestPower(runs, before, mass),
        after: bestPower(runs, after, mass),
        unit: 'ch',
        decimals: 0,
        lowerIsBetter: false,
      },
      {
        label: 'Admission moyenne en run',
        before: iatBefore,
        after: iatAfter,
        unit: '°C',
        decimals: 0,
        lowerIsBetter: true,
        note:
          iatAfter !== null && iatBefore !== null && iatAfter > iatBefore + 4
            ? 'Plus de chaleur : un échangeur plus gros aiderait pour aller plus loin.'
            : undefined,
      },
    ];
  }, [runs, before, after, vehicle.massKg]);

  // Le gain principal, affiché en grand : celui du 0-100 s'il existe.
  const headline = useMemo(() => {
    const m = metrics.find((x) => x.label === '0-100 km/h' && x.before !== null && x.after !== null);
    if (!m) return null;
    const pct = ((m.after! - m.before!) / m.before!) * 100;
    return { pct, improved: pct < 0 };
  }, [metrics]);

  const comparable = metrics.filter((m) => m.before !== null && m.after !== null);

  const summary = () =>
    [
      `Tarmac — comparatif ${PREP_LABELS[before]} → ${PREP_LABELS[after]}`,
      `Véhicule : ${vehicle.label} · ${vehicle.massKg} kg`,
      '',
      ...metrics.map(
        (m) =>
          `${m.label} : ${m.before !== null ? fr(m.before, m.decimals) : '—'} → ${m.after !== null ? fr(m.after, m.decimals) : '—'} ${m.unit}`,
      ),
      '',
      'Temps corrigés de la densité de l\'air (norme SAE J1349 simplifiée).',
    ].join('\n');

  return (
    <Screen scroll style={cp.screen}>
      <Header title="Avant / après reprog" onBack={() => router.back()} />

      {/* Les deux configurations. */}
      <View style={cp.selector}>
        <ConfigButton
          caption="Avant"
          value={before}
          onPress={() => setBefore(nextPrep(before, after))}
        />
        <Swap size={22} color={colors.text2} width={2} />
        <ConfigButton
          caption="Après"
          value={after}
          highlight
          onPress={() => setAfter(nextPrep(after, before))}
        />
      </View>

      {headline ? (
        <FadeInUp>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Num style={[cp.headline, { color: headline.improved ? colors.ok : colors.warnText }]}>
              {headline.improved ? '−' : '+'}{Math.abs(headline.pct).toFixed(0)} %
            </Num>
            <Dim style={{ fontSize: 14, lineHeight: 18 }}>sur le 0-100,{'\n'}à météo égale</Dim>
          </View>
        </FadeInUp>
      ) : (
        <Card style={{ gap: 6 }}>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>Comparaison impossible pour l'instant</Txt>
          <Dim style={{ fontSize: 13, lineHeight: 18 }}>
            Il faut au moins un run en « {PREP_LABELS[before]} » et un en « {PREP_LABELS[after]} ». Pense à
            changer le niveau de préparation dans la fiche véhicule après chaque reprogrammation : c'est ce
            qui permet de séparer les deux séries.
          </Dim>
        </Card>
      )}

      {comparable.length > 0 ? (
        <View style={cp.legend}>
          <LegendDot color={colors.neutralBar} label={PREP_LABELS[before]} />
          <LegendDot color={colors.ok} label={PREP_LABELS[after]} />
        </View>
      ) : null}

      <View>
        {metrics.map((m, i) => (
          <FadeInUp key={m.label} delay={i * 60}>
            <MetricRow metric={m} />
          </FadeInUp>
        ))}
      </View>

      <Dim style={{ fontSize: 12, lineHeight: 17 }}>
        Tous les chronos sont corrigés de la densité de l'air. Sans cette correction, un même moteur paraît
        gagner ou perdre 5 % selon la météo du jour.
      </Dim>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
        <GhostButton title="Copier" style={{ flex: 1 }} onPress={() => copyText(summary())} />
        <PrimaryButton
          title="Partager le bilan"
          style={{ flex: 1 }}
          onPress={() => void shareText(summary(), 'tarmac-comparatif', 'txt')}
        />
      </View>
    </Screen>
  );
}

/** Fait tourner la configuration, en évitant de choisir la même des deux côtés. */
function nextPrep(current: PrepLevel, other: PrepLevel): PrepLevel {
  const order: PrepLevel[] = ['origine', 'stage1', 'stage2', 'autre'];
  let i = order.indexOf(current);
  for (let n = 0; n < order.length; n++) {
    i = (i + 1) % order.length;
    if (order[i] !== other) return order[i];
  }
  return current;
}

function ConfigButton({
  caption,
  value,
  onPress,
  highlight,
}: {
  caption: string;
  value: PrepLevel;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      label={`${caption} : ${PREP_LABELS[value]}`}
      style={[cp.config, highlight && { borderColor: colors.ok, backgroundColor: colors.okBg }]}
      scaleTo={0.97}
    >
      <Text style={[cp.configCaption, highlight && { color: colors.ok }]}>{caption}</Text>
      <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16 }}>{PREP_LABELS[value]}</Txt>
    </Tappable>
  );
}

/** Une mesure, avec ses deux barres proportionnelles. */
function MetricRow({ metric: m }: { metric: Metric }) {
  const both = m.before !== null && m.after !== null;
  const max = Math.max(m.before ?? 0, m.after ?? 0) || 1;
  const better = both ? (m.lowerIsBetter ? m.after! < m.before! : m.after! > m.before!) : null;

  return (
    <View style={cp.metric}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt style={{ fontFamily: fonts.bodySemi, flex: 1 }}>{m.label}</Txt>
        <Num style={{ fontSize: 18 }}>
          <Text style={{ color: colors.text2 }}>{m.before !== null ? fr(m.before, m.decimals) : '—'}</Text>
          {' → '}
          <Text
            style={{
              fontFamily: fonts.numBlack,
              color: better === null ? colors.text : better ? colors.text : colors.warnText,
            }}
          >
            {m.after !== null ? `${fr(m.after, m.decimals)} ${m.unit}` : '—'}
          </Text>
        </Num>
      </View>

      {both ? (
        <View style={{ gap: 4 }}>
          <ProgressBar ratio={(m.before! / max)} height={10} color={colors.neutralBar} duration={500} />
          <ProgressBar ratio={(m.after! / max)} height={10} color={colors.ok} duration={620} />
        </View>
      ) : (
        <Dim style={{ fontSize: 13 }}>Pas assez de runs dans l'une des deux configurations.</Dim>
      )}

      {m.note ? <Dim style={{ fontSize: 13, lineHeight: 18 }}>{m.note}</Dim> : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Dim style={{ fontSize: 12 }}>{label}</Dim>
    </View>
  );
}

const cp = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  selector: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  config: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configCaption: { color: colors.text2, fontFamily: fonts.body, fontSize: 12 },
  headline: { fontFamily: fonts.numBlack, fontSize: 64, lineHeight: 64 },
  legend: { flexDirection: 'row', gap: space.lg },
  metric: {
    gap: space.sm,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
