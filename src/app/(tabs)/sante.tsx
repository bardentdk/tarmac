/**
 * (tabs)/sante.tsx — la santé du véhicule (maquette « Santé moteur »).
 *
 * Le score sur 100 n'est pas un gadget : c'est un raccourci pour « dois-je
 * m'inquiéter ? ». Il est volontairement sévère sur le cliquetis (12 points par
 * run concerné) et sur la dégradation des chronos, parce que ce sont les deux
 * signaux qui précèdent une casse.
 *
 * Ce que l'app ne fait PAS : poser un diagnostic. Elle dit « le régime monte
 * 4 % plus vite que la vitesse depuis trois semaines », pas « ton embrayage
 * est mort ». La nuance est importante : on envoie chez le garagiste avec une
 * mesure, pas avec un verdict.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Dim, Dot, GhostButton, Num, Row, Screen, Txt } from '@/ui/components';
import { AnimatedNumber, FadeInUp } from '@/ui/motion';
import { TrendBars } from '@/ui/charts';
import { Warning } from '@/ui/icons';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { buildHealthReport } from '@/health/healthScore';

const fr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export default function Sante() {
  const runs = useAppStore((s) => s.runs);
  const report = useMemo(() => buildHealthReport(runs), [runs]);

  const scoreColor = report.score >= 85 ? colors.ok : report.score >= 65 ? colors.warn : colors.danger;

  return (
    <Screen scroll edges={['top']} style={sa.screen}>
      <Dim style={sa.section}>Santé du véhicule</Dim>

      {/* Le score. */}
      <FadeInUp>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <AnimatedNumber value={report.score} duration={700} style={[sa.score, { color: scoreColor }]} />
            <Num style={sa.scoreMax}>/100</Num>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 18 }}>{report.verdict}</Txt>
            <Dim style={{ fontSize: 13, lineHeight: 18 }}>
              {report.watchCount === 0
                ? 'Rien à signaler.'
                : `${report.watchCount} point${report.watchCount > 1 ? 's' : ''} à surveiller.`}
              {'\n'}
              {report.runsAnalysed > 0 ? `Basé sur tes ${report.runsAnalysed} runs.` : 'En attente de tes premiers runs.'}
            </Dim>
          </View>
        </View>
      </FadeInUp>

      {/* Tendance des chronos corrigés. */}
      {report.trend.length >= 2 ? (
        <FadeInUp delay={70}>
          <Card style={{ gap: space.md, borderRadius: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>
                Chronos corrigés, {report.trend.length} semaines
              </Txt>
              {report.trendDeltaS !== null ? (
                <Text style={[sa.trendDelta, { color: report.trendDeltaS > 0 ? colors.warnText : colors.ok }]}>
                  {report.trendDeltaS > 0 ? '+' : '−'}{fr(Math.abs(report.trendDeltaS))} s
                </Text>
              ) : null}
            </View>
            <TrendBars
              values={report.trend.map((t) => t.averageS)}
              warnFrom={report.trendWarnFrom ?? undefined}
              label="Évolution des temps corrigés semaine par semaine"
            />
            <Dim style={{ fontSize: 12 }}>Barre plus haute = plus lent. Météo déjà neutralisée.</Dim>
          </Card>
        </FadeInUp>
      ) : (
        <FadeInUp delay={70}>
          <Card style={{ gap: 6 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>Pas encore de tendance</Txt>
            <Dim style={{ fontSize: 13, lineHeight: 18 }}>
              Il faut des runs sur plusieurs semaines pour qu'une dégradation soit visible. C'est justement
              l'intérêt : une voiture ralentit avant de tomber en panne.
            </Dim>
          </Card>
        </FadeInUp>
      )}

      {/* Points à surveiller. */}
      {report.alerts.map((a, i) => (
        <FadeInUp key={a.title} delay={130 + i * 60}>
          <Card
            tone={a.severity === 'danger' ? 'danger' : 'warn'}
            style={{ flexDirection: 'row', gap: space.md, borderRadius: radius.md, padding: 14 }}
          >
            <Warning size={24} color={a.severity === 'danger' ? colors.dangerRun : colors.warnText} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 15,
                  color: a.severity === 'danger' ? colors.dangerOn : colors.warnText,
                }}
              >
                {a.title}
              </Txt>
              <Txt style={{ fontSize: 13, lineHeight: 18, color: colors.text3 }}>{a.detail}</Txt>
            </View>
          </Card>
        </FadeInUp>
      ))}

      {/* La liste de contrôle. */}
      <FadeInUp delay={200}>
        <View>
          {report.checks.map((c, i) => (
            <Row key={c.key} first={i === 0}>
              <Dot color={c.status === 'ok' ? colors.ok : c.status === 'watch' ? colors.info : colors.danger} />
              <Txt style={{ flex: 1, fontFamily: fonts.bodySemi }}>{c.label}</Txt>
              <Dim style={{ fontSize: 13 }}>{c.value}</Dim>
            </Row>
          ))}
        </View>
      </FadeInUp>

      <View style={sa.actions}>
        <GhostButton title="Avant / après reprog" style={{ flex: 1 }} onPress={() => router.push('/comparatif')} />
        <GhostButton title="Dyno virtuel" style={{ flex: 1 }} onPress={() => router.push('/dyno')} />
      </View>
    </Screen>
  );
}

const sa = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl, gap: space.lg },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  score: { fontFamily: fonts.numBlack, fontSize: 88, lineHeight: 82, fontVariant: ['tabular-nums'] },
  scoreMax: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 28 },
  trendDelta: { fontFamily: fonts.bodySemi, fontSize: 13 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
