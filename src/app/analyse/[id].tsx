/**
 * analyse/[id].tsx — le résultat et son explication (maquette « Analyse du run »).
 *
 * L'écran est bâti autour d'une idée : le chrono seul n'apprend rien. On le
 * montre en grand parce que c'est ce qu'on vient chercher, puis on enchaîne
 * immédiatement sur « pourquoi », poste par poste, avec une barre dont la
 * longueur est proportionnelle au temps perdu.
 *
 * Le conseil final est volontairement en UNE phrase actionnable. « Optimisez
 * votre départ » ne sert à rien ; « baisse le régime de 300 tr/min » si.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Card,
  Dim,
  GhostButton,
  Num,
  PrimaryButton,
  RoundButton,
  Screen,
  Tappable,
  Txt,
} from '@/ui/components';
import { FadeInUp, ProgressBar } from '@/ui/motion';
import { Bulb, Share } from '@/ui/icons';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { analyseRun } from '@/run/analysis';
import { runModeDef } from '@/run/types';
import { runToSummary, shareText } from '@/debug/share';

/** « 6,84 » plutôt que « 6.84 ». */
const fr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export default function Analyse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useAppStore((s) => s.runs.find((r) => r.id === id));
  const bestRun = useAppStore((s) => s.bestRun);
  const vehicle = useAppStore((s) => s.vehicle);

  const reference = useMemo(() => {
    if (!run) return null;
    const best = bestRun(run.mode);
    // Se comparer à soi-même n'a aucun intérêt : si ce run EST le record, on
    // prend le deuxième meilleur comme référence.
    return best && best.id !== run.id ? best : null;
  }, [run, bestRun]);

  const analysis = useMemo(() => (run ? analyseRun(run, reference) : null), [run, reference]);

  if (!run || !analysis) {
    return (
      <Screen style={an.screen}>
        <RoundButton onPress={() => router.back()} label="Retour">{null}</RoundButton>
        <Txt>Ce run n'existe plus.</Txt>
      </Screen>
    );
  }

  const def = runModeDef(run.mode);
  const time = new Date(run.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const aborted = run.timeS === null;

  return (
    <Screen scroll edges={['top', 'bottom']} style={an.screen}>
      <View style={an.head}>
        <Dim style={an.section}>
          Run #{run.number} · {def.label} · {time}
        </Dim>
        <RoundButton
          label="Partager ce run"
          onPress={() => void shareText(runToSummary(run, `Véhicule : ${vehicle.label} (${run.prep})`), 'tarmac-run', 'txt')}
        >
          <Share size={20} color={colors.text} />
        </RoundButton>
      </View>

      {/* Le résultat. */}
      <FadeInUp>
        <View style={an.result}>
          <View style={{ flex: 1 }}>
            {aborted ? (
              <>
                <Num style={an.timeAborted}>—</Num>
                <Txt style={{ color: colors.dangerRun, fontSize: 14 }}>{run.abortedReason}</Txt>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Num style={an.time}>{fr(run.timeS!)}</Num>
                  <Text style={an.timeUnit}> s</Text>
                </View>
                <Dim style={{ fontSize: 14 }}>
                  Corrigé météo : <Text style={{ color: colors.text, fontFamily: fonts.bodyBold }}>{fr(run.correctedS ?? run.timeS!)} s</Text>
                </Dim>
              </>
            )}
          </View>

          {analysis.deltaS !== null && reference?.timeS != null ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Num style={[an.delta, { color: analysis.deltaS > 0 ? colors.warnText : colors.ok }]}>
                {analysis.deltaS > 0 ? '+' : '−'}{fr(Math.abs(analysis.deltaS))} s
              </Num>
              <Dim style={{ fontSize: 12 }}>vs ton record {fr(reference.timeS)} s</Dim>
            </View>
          ) : run.isRecord ? (
            <View style={an.recordBadge}>
              <Text style={an.recordTxt}>RECORD</Text>
            </View>
          ) : null}
        </View>
      </FadeInUp>

      {run.trapKph !== null ? (
        <Dim style={{ fontSize: 13 }}>Vitesse de sortie : {run.trapKph} km/h</Dim>
      ) : null}

      {/* Le « pourquoi ». */}
      {analysis.causes.length > 0 ? (
        <FadeInUp delay={80}>
          <Card style={{ gap: 14, borderRadius: radius.lg, padding: 18 }}>
            <View style={{ gap: 2 }}>
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>
                {analysis.deltaS !== null && analysis.deltaS > 0
                  ? `Pourquoi tu as perdu ${fr(analysis.deltaS)} s`
                  : 'Ce qui a joué sur ce run'}
              </Txt>
              <Dim style={{ fontSize: 13 }}>
                {reference ? 'Comparé à ton record · ' : ''}
                <Tappable onPress={() => router.push(`/courbes/${run.id}`)} label="Voir les courbes" haptic={false}>
                  <Text style={an.link}>voir les courbes</Text>
                </Tappable>
              </Dim>
            </View>

            {analysis.causes.map((c, i) => (
              <FadeInUp key={c.title} delay={140 + i * 60}>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>
                      {c.rank}. {c.title}
                    </Txt>
                    <Num style={{ fontSize: 18 }}>{fr(c.costS)} s</Num>
                  </View>
                  <ProgressBar
                    ratio={c.share}
                    height={8}
                    color={c.tone === 'warn' ? colors.warn : colors.info}
                    duration={520}
                  />
                  <Dim style={{ fontSize: 13, lineHeight: 18 }}>{c.explanation}</Dim>
                </View>
              </FadeInUp>
            ))}
          </Card>
        </FadeInUp>
      ) : null}

      {/* Le conseil. */}
      <FadeInUp delay={300}>
        <Card tone="ok" style={{ flexDirection: 'row', gap: space.md, borderRadius: radius.md, padding: 14 }}>
          <Bulb size={24} color={colors.ok} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ok }}>Ton prochain run</Txt>
            <Txt style={{ fontSize: 14, lineHeight: 19, color: colors.text3 }}>{analysis.advice}</Txt>
          </View>
        </Card>
      </FadeInUp>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
        <PrimaryButton title="Relancer" style={{ flex: 1 }} onPress={() => router.replace('/run')} />
        <GhostButton
          title="Envoyer au mappeur"
          style={{ flex: 1 }}
          onPress={() =>
            void shareText(
              runToSummary(run, vehicle.tunerEmail ? `À transmettre à ${vehicle.tunerEmail}` : undefined),
              'tarmac-run',
              'txt',
            )
          }
        />
      </View>
    </Screen>
  );
}

const an = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxl, gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  result: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  time: { color: colors.text, fontFamily: fonts.numBlack, fontSize: 76, lineHeight: 74 },
  timeAborted: { color: colors.text2, fontFamily: fonts.numBlack, fontSize: 76, lineHeight: 74 },
  timeUnit: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 30 },
  delta: { fontFamily: fonts.numBold, fontSize: 28 },
  recordBadge: { backgroundColor: colors.ok, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  recordTxt: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.5 },
  link: { color: colors.ok, fontFamily: fonts.bodySemi, fontSize: 13 },
});
