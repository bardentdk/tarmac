/**
 * (tabs)/index.tsx — « Prêt à lancer » (maquette « Accueil prêt à lancer »).
 *
 * L'écran répond à une seule question : est-ce que je peux faire un run
 * maintenant ? D'où le gros disque vert au centre, visible d'un coup d'œil
 * depuis le siège conducteur.
 *
 * Toutes les tuiles de température sont alimentées en direct par le tampon
 * circulaire. Elles se redessinent au plus 16 fois par seconde, et les chiffres
 * « roulent » vers leur nouvelle valeur au lieu de sauter — c'est ce qui donne
 * l'impression que l'app est branchée sur quelque chose de vivant.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import {
  Card,
  Chip,
  Dim,
  Num,
  PrimaryButton,
  RoundButton,
  Screen,
  Tappable,
  Txt,
} from '@/ui/components';
import { AnimatedNumber, FadeInUp, PulseDot, ease } from '@/ui/motion';
import { Car, ChevronDown, Gear, Play, Terminal, Weather } from '@/ui/icons';
import { colors, fonts, motion, radius, space, tap } from '@/ui/tokens';
import { useMetrics } from '@/store/liveStore';
import { phasePresentation, useConnection } from '@/store/useConnection';
import { useAppStore } from '@/store/appStore';
import { buildReadiness } from '@/health/healthScore';
import { buildConditions, describeConditions } from '@/run/weather';
import { RUN_MODES } from '@/run/types';
import { connection } from '@/connection/ConnectionManager';

/** Cercle SVG animable : sert à faire avancer l'anneau de l'indicateur. */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function Home() {
  const conn = useConnection();
  const vehicle = useAppStore((s) => s.vehicle);
  const selectedMode = useAppStore((s) => s.selectedMode);
  const setSelectedMode = useAppStore((s) => s.setSelectedMode);

  // Une seule lecture groupée : un abonnement, pas cinq.
  const m = useMetrics(['oil', 'dsgTemp', 'iat', 'coolant', 'baro']);

  const readiness = buildReadiness({
    oil: m.oil ?? null,
    dsg: m.dsgTemp ?? null,
    iat: m.iat ?? null,
    coolant: m.coolant ?? null,
  });

  const conditions = useMemo(
    () => buildConditions({ iatC: m.iat ?? null, baroKpa: m.baro ?? null, warmedUp: true }),
    [m.iat, m.baro],
  );
  const weather = describeConditions(conditions);

  const status = phasePresentation(conn.phase, conn.message);
  const live = conn.phase === 'ready' || conn.phase === 'polling';
  const modeDef = RUN_MODES.find((r) => r.mode === selectedMode) ?? RUN_MODES[0];

  return (
    <Screen scroll edges={['top']} style={hm.screen}>
      {/* En-tête : véhicule à gauche, état de la liaison à droite. */}
      <View style={hm.head}>
        <Tappable onPress={() => router.push('/garage')} label="Changer de véhicule" style={hm.vehicle} scaleTo={0.98}>
          <Car size={22} color={colors.ok} />
          <View>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>{vehicle.label}</Txt>
            <Dim style={{ fontSize: 12 }}>
              {vehicle.prep === 'origine' ? 'Origine' : vehicle.prep === 'stage1' ? 'Stage 1' : vehicle.prep === 'stage2' ? 'Stage 2' : 'Autre'} · DSG7
            </Dim>
          </View>
          <ChevronDown size={16} color={colors.text2} />
        </Tappable>

        <Tappable
          onPress={() => router.push(live ? '/live' : '/appairage')}
          label={status.label}
          haptic={false}
          style={hm.status}
        >
          <PulseDot color={status.color} active={status.pulsing} />
          <Dim style={{ fontSize: 13 }} numberOfLines={1}>{status.label}</Dim>
        </Tappable>

        <RoundButton onPress={() => router.push('/reglages')} label="Réglages">
          <Gear size={20} color={colors.text} />
        </RoundButton>
      </View>

      {/* Le bloc principal : feu vert + températures. */}
      <FadeInUp>
        <Card style={{ gap: 18, borderRadius: radius.xl, padding: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <ReadinessRing
              label={readiness.label}
              ok={readiness.okCount}
              total={readiness.total}
              verdict={readiness.verdict}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Dim style={hm.section}>
                {readiness.verdict === 'ready' ? 'Feu vert' : readiness.verdict === 'almost' ? 'Presque' : 'Patience'}
              </Dim>
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 23 }}>
                {readiness.headline}
              </Txt>
            </View>
          </View>

          <View style={hm.tiles}>
            {readiness.checks.map((c) => (
              <TempTile
                key={c.key}
                label={c.label}
                value={c.value}
                status={c.status}
                advice={c.advice}
              />
            ))}
          </View>
        </Card>
      </FadeInUp>

      {/* Correction météo : on dit ce qu'on corrige et pourquoi. */}
      <FadeInUp delay={70}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: 14 }}>
          <Weather size={26} color={colors.info} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{weather.headline}</Txt>
            <Dim style={{ fontSize: 12 }}>{weather.detail}</Dim>
          </View>
        </Card>
      </FadeInUp>

      {/* Choix de l'épreuve. */}
      <FadeInUp delay={120}>
        <View style={{ gap: space.md }}>
          <Dim style={hm.section}>Type de run</Dim>
          <View style={hm.chips}>
            {RUN_MODES.map((r) => (
              <Chip
                key={r.mode}
                label={r.label}
                active={selectedMode === r.mode}
                onPress={() => setSelectedMode(r.mode)}
              />
            ))}
          </View>
          <Dim style={{ fontSize: 12 }}>{modeDef.hint}</Dim>
        </View>
      </FadeInUp>

      {/* L'action principale : le seul bouton vert de l'écran. */}
      <View style={{ gap: space.md, marginTop: space.lg }}>
        <PrimaryButton
          title={`Armer le run ${modeDef.label}`}
          icon={<Play size={22} color={colors.bg} />}
          disabled={!live}
          onPress={() => {
            // Pendant un run, on pousse le planificateur à sa cadence maximale :
            // c'est le seul moment où ça compte vraiment.
            connection.setPollMode('run');
            router.push('/run');
          }}
        />
        {!live ? (
          <Tappable onPress={() => router.push('/appairage')} label="Connecter un boîtier" haptic={false}>
            <Dim style={{ textAlign: 'center', fontSize: 13 }}>
              {conn.phase === 'reconnecting' ? conn.message : 'Connecte un boîtier pour armer un run →'}
            </Dim>
          </Tappable>
        ) : (
          <Tappable onPress={() => router.push('/console')} label="Console de diagnostic" haptic={false} style={hm.consoleLink}>
            <Terminal size={16} color={colors.text2} />
            <Dim style={{ fontSize: 13 }}>Console de diagnostic</Dim>
          </Tappable>
        )}
      </View>
    </Screen>
  );
}

/**
 * Le disque « PRÊT ».
 *
 * L'anneau se remplit en proportion des contrôles réussis, et sa couleur suit
 * le verdict. On l'anime via `strokeDashoffset` : un seul attribut SVG à
 * animer, donc pas de recalcul de mise en page à chaque image.
 */
function ReadinessRing({
  label,
  ok,
  total,
  verdict,
}: {
  label: string;
  ok: number;
  total: number;
  verdict: 'ready' | 'almost' | 'wait';
}) {
  const SIZE = 104;
  const STROKE = 8;
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  const color = verdict === 'ready' ? colors.ok : verdict === 'almost' ? colors.warn : colors.text2;
  const ratio = total > 0 ? ok / total : 0;

  const p = useSharedValue(0);
  React.useEffect(() => {
    p.value = withTiming(ratio, { duration: motion.slow, easing: ease });
  }, [ratio, p]);

  // Le décalage du pointillé fait « avancer » l'anneau : un seul attribut SVG
  // animé, entièrement sur le thread graphique, aucun rendu React par image.
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute' }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={colors.border2} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            animatedProps={arc}
          />
        </Svg>
      </View>
      <Num style={{ fontFamily: fonts.numBlack, fontSize: 28, color, lineHeight: 30 }}>{label}</Num>
      <Dim style={{ fontSize: 11, marginTop: 2 }}>{total > 0 ? `${ok} / ${total} OK` : '—'}</Dim>
    </View>
  );
}

/** Une tuile de température, bordée d'orange quand elle sort de la fenêtre. */
function TempTile({
  label,
  value,
  status,
  advice,
}: {
  label: string;
  value: number | null;
  status: 'ok' | 'warn' | 'unknown';
  advice: string;
}) {
  const warn = status === 'warn';
  return (
    <View style={[hm.tile, warn && { borderWidth: 1, borderColor: colors.warn }]}>
      <Dim style={{ fontSize: 12 }}>{label}</Dim>
      {value === null ? (
        <Num style={{ fontSize: 26, color: colors.text2 }}>—</Num>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedNumber
            value={value}
            style={[hm.tileValue, warn && { color: colors.warnText }]}
          />
          <Text style={[hm.tileUnit, warn && { color: colors.warnText }]}> °C</Text>
        </View>
      )}
      <Text
        style={[
          hm.tileAdvice,
          { color: status === 'ok' ? colors.ok : warn ? colors.warnText : colors.text2 },
        ]}
        numberOfLines={2}
      >
        {advice}
      </Text>
    </View>
  );
}

const hm = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl, gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  vehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingLeft: space.sm,
    paddingRight: 14,
    minHeight: tap.min,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: tap.min, justifyContent: 'flex-end' },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceDeep,
    borderRadius: 14,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    gap: 2,
  },
  tileValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 26, fontVariant: ['tabular-nums'] },
  tileUnit: { color: colors.text, fontFamily: fonts.numBold, fontSize: 26 },
  tileAdvice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  consoleLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: tap.min },
});
