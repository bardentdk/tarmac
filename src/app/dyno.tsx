/**
 * dyno.tsx — le dyno virtuel (maquette « Dyno virtuel »).
 *
 * L'écran affiche deux chiffres (puissance et couple maxi), deux courbes, et
 * surtout une explication de la méthode. Ce dernier point n'est pas du
 * remplissage : un chiffre de puissance sans sa méthode ni sa marge d'erreur
 * est le genre de chose qui se retrouve dans une annonce de vente. Autant dire
 * d'où il vient.
 *
 * La mesure se fait sur une montée en régime pied au plancher, sur un seul
 * rapport, sur piste plate. L'écran le rappelle sous le bouton.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Dim, GhostButton, Header, Num, PrimaryButton, Screen, Txt } from '@/ui/components';
import { AnimatedNumber, FadeInUp } from '@/ui/motion';
import { DynoChart } from '@/ui/charts';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { computeDyno, dynoSeries, stockPowerCurve } from '@/run/dyno';
import { IBIZA_STAGE1, IBIZA_STOCK } from '@/transport/vehicleSim';
import { copyText } from '@/debug/share';
import { connection } from '@/connection/ConnectionManager';

export default function Dyno() {
  const runs = useAppStore((s) => s.runs);
  const vehicle = useAppStore((s) => s.vehicle);

  /**
   * On prend le run le plus récent qui donne une mesure exploitable : il faut
   * une montée en régime continue, pied au plancher, sur un seul rapport.
   * Beaucoup de runs n'en contiennent pas (un 0-100 passe deux rapports), d'où
   * la recherche dans l'historique plutôt que « le dernier run ».
   */
  const measure = useMemo(() => {
    const mass = vehicle.massKg || IBIZA_STAGE1.massKg;
    for (const r of runs) {
      const d = computeDyno(r.samples, mass, IBIZA_STAGE1);
      if (d) return { run: r, dyno: d };
    }
    return null;
  }, [runs, vehicle.massKg]);

  const series = measure ? dynoSeries(measure.dyno) : null;
  const stock = useMemo(
    () => (series ? stockPowerCurve(IBIZA_STOCK, series.rpmTicks[0], series.rpmTicks[series.rpmTicks.length - 1]) : []),
    [series],
  );

  const summary = () =>
    measure
      ? [
          `Tarmac — dyno virtuel`,
          `Véhicule : ${vehicle.label} · ${vehicle.massKg} kg`,
          `Mesure du ${new Date(measure.run.startedAt).toLocaleDateString('fr-FR')} · ${measure.dyno.gear}e rapport`,
          `Puissance : ${measure.dyno.peakPower.hp} ch à ${measure.dyno.peakPower.rpm} tr/min`,
          `Couple : ${measure.dyno.peakTorque.nm} Nm à ${measure.dyno.peakTorque.rpm} tr/min`,
          `Marge d'erreur estimée : ±${measure.dyno.accuracyPct} %`,
          '',
          measure.dyno.caveat,
        ].join('\n')
      : '';

  return (
    <Screen scroll style={dy.screen}>
      <Header
        title="Dyno virtuel"
        subtitle={
          measure
            ? `Mesure du ${new Date(measure.run.startedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${measure.dyno.gear}e rapport`
            : 'Aucune mesure exploitable'
        }
        onBack={() => router.back()}
      />

      {measure && series ? (
        <>
          <FadeInUp>
            <View style={dy.peaks}>
              <PeakTile
                label="Puissance"
                value={measure.dyno.peakPower.hp}
                unit="ch"
                at={`à ${measure.dyno.peakPower.rpm.toLocaleString('fr-FR')} tr/min`}
                color={colors.ok}
              />
              <PeakTile
                label="Couple"
                value={measure.dyno.peakTorque.nm}
                unit="Nm"
                at={`à ${measure.dyno.peakTorque.rpm.toLocaleString('fr-FR')} tr/min`}
                color={colors.info}
              />
            </View>
          </FadeInUp>

          <FadeInUp delay={80}>
            <DynoChart
              power={series.power}
              torque={series.torque}
              stockPower={vehicle.prep === 'origine' ? undefined : stock}
              rpmTicks={series.rpmTicks}
            />
          </FadeInUp>
        </>
      ) : (
        <FadeInUp>
          <Card style={{ gap: space.sm }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16 }}>Pas encore de mesure</Txt>
            <Dim style={{ fontSize: 14, lineHeight: 20 }}>
              Il faut une montée en régime continue, pied au plancher, sur UN SEUL rapport, de 2 000 à
              6 500 tr/min. Un 0-100 ne suffit pas : il passe deux rapports et la mesure est coupée.
            </Dim>
            <Dim style={{ fontSize: 14, lineHeight: 20 }}>
              Le plus simple : lance un run « 100-200 », qui se fait en grande partie sur un seul rapport.
            </Dim>
          </Card>
        </FadeInUp>
      )}

      {/* La méthode, expliquée simplement. */}
      <FadeInUp delay={140}>
        <Card style={{ gap: 6, borderRadius: radius.md, padding: 14 }}>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 14 }}>Comment c'est calculé ?</Txt>
          <Txt style={{ fontSize: 14, lineHeight: 20, color: colors.text3 }}>
            Plus la voiture pousse fort, plus elle accélère vite. On mesure cette accélération au GPS, on
            connaît le poids, on en déduit la force du moteur — puis on remonte à la puissance par les
            rapports de boîte.
          </Txt>
          <Dim style={{ fontSize: 13, lineHeight: 18 }}>
            Précision : environ ±{measure?.dyno.accuracyPct ?? 5} %.{' '}
            {measure?.dyno.caveat ?? 'La valeur dépend surtout du poids saisi et de la planéité de la piste.'}
          </Dim>
          <Dim style={{ fontSize: 13 }}>Poids utilisé : {vehicle.massKg} kg (modifiable dans la fiche véhicule).</Dim>
        </Card>
      </FadeInUp>

      <View style={{ marginTop: 'auto', gap: space.sm }}>
        <PrimaryButton
          title="Nouvelle mesure"
          disabled={!connection.isLive}
          onPress={() => {
            useAppStore.getState().setSelectedMode('100-200');
            connection.setPollMode('run');
            router.push('/run');
          }}
        />
        {measure ? <GhostButton title="Copier le bilan" onPress={() => copyText(summary())} /> : null}
        <Dim style={{ textAlign: 'center', fontSize: 12, lineHeight: 17 }}>
          Pied au plancher de 2 000 à 6 500 tr/min, sur un seul rapport, sur piste plate et fermée.
        </Dim>
      </View>
    </Screen>
  );
}

function PeakTile({
  label,
  value,
  unit,
  at,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  at: string;
  color: string;
}) {
  return (
    <View style={dy.peak}>
      <Dim style={{ fontSize: 13 }}>{label}</Dim>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AnimatedNumber value={value} duration={760} style={[dy.peakValue, { color }]} />
        <Text style={dy.peakUnit}> {unit}</Text>
      </View>
      <Dim style={{ fontSize: 12 }}>{at}</Dim>
    </View>
  );
}

const dy = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  peaks: { flexDirection: 'row', gap: space.sm },
  peak: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  peakValue: { fontFamily: fonts.numBlack, fontSize: 48, lineHeight: 48, fontVariant: ['tabular-nums'] },
  peakUnit: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 20 },
});
