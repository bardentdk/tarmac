/**
 * live.tsx — les données moteur en direct (jalon 1 du cahier des charges).
 *
 * C'est l'écran qui prouve que toute la chaîne fonctionne : transport, ELM327,
 * décodage, planificateur, tampon circulaire, interface. S'il affiche un régime
 * qui bouge au millième de seconde près, le socle est bon.
 *
 * C'est aussi l'écran où l'exigence de performance est la plus visible. Trois
 * décisions l'y tiennent :
 *   · aucune valeur ne traverse le state React : les tuiles lisent le tampon
 *     circulaire via un abonnement cadencé à 16 Hz ;
 *   · les chiffres sont animés sur le thread graphique ;
 *   · les mini-courbes sont redessinées à la même cadence, pas à chaque valeur.
 *
 * Le débit réel (valeurs/s et requêtes/s) est affiché en permanence : c'est la
 * seule façon de savoir si une optimisation a servi à quelque chose.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Card, Dim, GhostButton, Header, Num, Screen, StatusPill, Txt } from '@/ui/components';
import { AnimatedNumber } from '@/ui/motion';
import { Sparkline } from '@/ui/charts';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { live, useLiveVersion, useThroughput } from '@/store/liveStore';
import { phasePresentation, useConnection } from '@/store/useConnection';
import { metricInfo, type MetricKey } from '@/obd/pids';

/** Les grandeurs affichées, dans l'ordre d'intérêt pour un run. */
const BIG: MetricKey[] = ['rpm', 'speed'];
const MEDIUM: MetricKey[] = ['boost', 'throttle', 'load', 'advance'];
const SMALL: MetricKey[] = ['coolant', 'iat', 'oil', 'baro', 'voltage', 'maf'];

export default function Live() {
  // L'écran de données live est souvent regardé posé sur le tableau de bord :
  // il ne doit pas s'éteindre au bout de 30 secondes.
  useKeepAwake();

  const conn = useConnection();
  const status = phasePresentation(conn.phase, conn.message);
  const t = useThroughput();
  // Un seul abonnement pour tout l'écran : les tuiles lisent le tampon
  // directement, ce qui évite un abonnement par valeur.
  useLiveVersion();

  const connected = conn.phase === 'ready' || conn.phase === 'polling';

  return (
    <Screen scroll style={lv.screen}>
      <Header title="Données en direct" onBack={() => router.back()} />

      {/* Bandeau d'état + débit réel. */}
      <View style={lv.statusRow}>
        <StatusPill text={status.label} tone={status.tone} pulsing={status.pulsing} />
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AnimatedNumber value={t.valuesPerSec} duration={200} style={lv.rate} />
            <Text style={lv.rateUnit}>valeurs/s</Text>
          </View>
          <Dim style={{ fontSize: 11 }}>
            {t.requestsPerSec} req/s · {t.avgMs} ms par échange
          </Dim>
        </View>
      </View>

      {!connected ? (
        <Card tone="warn" style={{ gap: 6 }}>
          <Txt style={{ fontFamily: fonts.bodyBold, color: colors.warnText }}>Aucune donnée</Txt>
          <Txt style={{ fontSize: 13, lineHeight: 18, color: colors.text3 }}>{conn.message}</Txt>
          <GhostButton title="Aller à la connexion" onPress={() => router.push('/appairage')} />
        </Card>
      ) : null}

      {/* Les deux grandeurs reines. */}
      <View style={lv.bigRow}>
        {BIG.map((k) => (
          <BigTile key={k} metric={k} />
        ))}
      </View>

      {/* Les grandeurs de charge. */}
      <View style={lv.grid}>
        {MEDIUM.map((k) => (
          <MediumTile key={k} metric={k} />
        ))}
      </View>

      {/* Les grandeurs lentes. */}
      <Card style={{ paddingVertical: 0, paddingHorizontal: space.lg }}>
        {SMALL.map((k, i) => (
          <SmallRow key={k} metric={k} first={i === 0} />
        ))}
      </Card>

      {/* Ce que le boîtier sait faire : utile pour comprendre un débit faible. */}
      <Card style={{ gap: space.sm }}>
        <Dim style={lv.section}>Ce boîtier</Dim>
        <CapRow label="Version annoncée" value={conn.caps.version} />
        <CapRow label="Protocole" value={conn.caps.protocol} />
        <CapRow
          label="Multi-PID"
          value={conn.caps.multiPid ? `oui, ${conn.caps.maxPidsPerRequest} par requête` : 'non'}
        />
        <CapRow label="Suffixe de comptage" value={conn.caps.responseCountHint ? 'accepté' : 'non supporté'} />
        <CapRow label="Délai adaptatif (ATAT1)" value={conn.caps.adaptiveTiming ? 'oui' : 'non'} />
        <CapRow label="En-tête moteur (ATSH7E0)" value={conn.caps.headerSet ? 'oui' : 'non (diffusion)'} />
        <CapRow label="PID déclarés" value={`${conn.caps.supportedPids.length}`} />
      </Card>

      <GhostButton title="Console de diagnostic" onPress={() => router.push('/console')} />
    </Screen>
  );
}

/** Grande tuile avec mini-courbe des 20 dernières secondes. */
function BigTile({ metric }: { metric: MetricKey }) {
  const info = metricInfo(metric);
  const v = live.get(metric);
  const series = live.series(metric, 20000);

  return (
    <View style={lv.big}>
      <Dim style={{ fontSize: 12 }}>{info.label}</Dim>
      {v === null ? (
        <Num style={lv.bigValueEmpty}>—</Num>
      ) : (
        <AnimatedNumber value={v} decimals={info.decimals} group={metric === 'rpm'} duration={110} style={lv.bigValue} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Dim style={{ fontSize: 12 }}>{info.unit}</Dim>
        <Sparkline values={series.map((s) => s.v)} width={110} height={30} />
      </View>
    </View>
  );
}

function MediumTile({ metric }: { metric: MetricKey }) {
  const info = metricInfo(metric);
  const v = live.get(metric);
  return (
    <View style={lv.medium}>
      <Dim style={{ fontSize: 12 }} numberOfLines={1}>{info.label}</Dim>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {v === null ? (
          <Num style={{ fontSize: 28, color: colors.text2 }}>—</Num>
        ) : (
          <AnimatedNumber value={v} decimals={info.decimals} duration={130} style={lv.mediumValue} />
        )}
        <Text style={lv.unit}> {info.unit}</Text>
      </View>
    </View>
  );
}

function SmallRow({ metric, first }: { metric: MetricKey; first: boolean }) {
  const info = metricInfo(metric);
  const v = live.get(metric);
  return (
    <View style={[lv.row, first && { borderTopWidth: 0 }]}>
      <Txt style={{ flex: 1 }}>{info.label}</Txt>
      {v === null ? (
        <Dim style={{ fontFamily: fonts.numBold, fontSize: 16 }}>non fourni</Dim>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedNumber value={v} decimals={info.decimals} duration={250} style={lv.smallValue} />
          <Text style={lv.unit}> {info.unit}</Text>
        </View>
      )}
    </View>
  );
}

function CapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <Dim style={{ fontSize: 13 }}>{label}</Dim>
      <Txt style={{ fontSize: 13, fontFamily: fonts.bodySemi, flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

const lv = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rate: { color: colors.ok, fontFamily: fonts.numBlack, fontSize: 26, fontVariant: ['tabular-nums'] },
  rateUnit: { color: colors.text2, fontFamily: fonts.body, fontSize: 12 },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  bigRow: { flexDirection: 'row', gap: space.sm },
  big: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 2,
  },
  bigValue: { color: colors.text, fontFamily: fonts.numBlack, fontSize: 46, fontVariant: ['tabular-nums'] },
  bigValueEmpty: { color: colors.text2, fontFamily: fonts.numBlack, fontSize: 46 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  medium: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    gap: 2,
  },
  mediumValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 28, fontVariant: ['tabular-nums'] },
  smallValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 18, fontVariant: ['tabular-nums'] },
  unit: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
