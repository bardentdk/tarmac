/**
 * alerte.tsx — l'alerte moteur critique (maquette « Lève le pied »).
 *
 * C'est le seul écran rouge de l'app, et le seul qui prend tout l'écran sans
 * possibilité de le balayer. Le rouge est réservé au danger mécanique : s'il
 * servait aussi aux erreurs de connexion, il ne voudrait plus rien dire.
 *
 * La structure du message suit l'ordre dans lequel un conducteur en a besoin :
 *   1. l'ordre (« lève le pied ») ;
 *   2. le fait (« cliquetis, cylindre 2, 6 corrections en 2 s ») ;
 *   3. l'explication en français courant, sans jargon ;
 *   4. les causes probables ;
 *   5. et seulement là, les boutons.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { GhostButton, PrimaryButton, Screen, Txt } from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { Warning } from '@/ui/icons';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { connection } from '@/connection/ConnectionManager';

export default function Alerte() {
  const runs = useAppStore((s) => s.runs);
  // Le run qui vient d'être interrompu est forcément le plus récent.
  const last = runs[0];
  const knock = last?.incidents.filter((i) => i.kind === 'knock').at(-1);

  // Dès que l'alerte s'affiche, on redescend la cadence d'interrogation :
  // le run est fini, inutile de continuer à saturer le boîtier.
  useEffect(() => {
    connection.setPollMode('live');
  }, []);

  const rpm = last?.samples.at(-1)?.rpm ?? null;
  const iat = last ? Math.max(...last.samples.map((s) => s.iatC ?? 0)) : 0;
  const count = knock?.value ?? 0;

  return (
    <Screen bg={colors.dangerBg} style={al.screen}>
      <View accessibilityRole="alert" style={{ gap: 22 }}>
        <PulsingBadge />

        <Text style={al.h1}>Lève{'\n'}le pied</Text>

        <FadeInUp delay={120}>
          <View style={{ gap: 6 }}>
            <Text style={al.fact}>{knock ? 'Cliquetis répété détecté' : 'Anomalie moteur détectée'}</Text>
            <Text style={al.factDetail}>
              {[
                count ? `${count} corrections en 2 secondes` : null,
                rpm ? `${Math.round(rpm).toLocaleString('fr-FR')} tr/min` : null,
                iat ? `admission ${Math.round(iat)} °C` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </FadeInUp>

        <FadeInUp delay={180}>
          <View style={al.plain}>
            <Text style={al.plainLabel}>En clair</Text>
            <Text style={al.plainTxt}>
              L'essence explose trop tôt dans le cylindre, comme un coup de marteau sur le piston. Répété,
              ça peut l'abîmer. Le run est arrêté.
            </Text>
          </View>
        </FadeInUp>

        <FadeInUp delay={240}>
          <View style={{ gap: space.sm }}>
            <Text style={al.plainLabel}>Causes probables</Text>
            {[
              'Carburant de mauvaise qualité ou indice trop bas',
              iat > 45 ? `Moteur trop chaud (admission à ${Math.round(iat)} °C)` : 'Moteur trop chaud',
              'Cartographie trop agressive',
            ].map((c) => (
              <Text key={c} style={al.cause}>· {c}</Text>
            ))}
          </View>
        </FadeInUp>
      </View>

      <View style={{ marginTop: 'auto', gap: space.md }}>
        <PrimaryButton tone="light" title="J'ai compris" onPress={() => router.replace('/(tabs)')} />
        {last ? (
          <GhostButton
            tone="danger"
            title="Voir les données et prévenir le mappeur"
            onPress={() => router.replace(`/courbes/${last.id}`)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * Le disque rouge qui bat.
 *
 * Deux battements rapides puis une pause, comme un cœur : c'est beaucoup plus
 * alarmant qu'un clignotement régulier, qui finit par se fondre dans le décor.
 */
function PulsingBadge() {
  const s = useSharedValue(1);

  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 180 }),
        withTiming(1.12, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 180 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
    );
  }, [s]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View style={[al.badge, anim]}>
      <Warning size={44} color={colors.dangerBg} width={2.6} />
    </Animated.View>
  );
}

const al = StyleSheet.create({
  screen: { paddingHorizontal: space.xxl, paddingTop: 56, paddingBottom: space.xxl },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    color: colors.dangerOn,
    fontFamily: fonts.numBlack,
    fontSize: 72,
    lineHeight: 65,
    textTransform: 'uppercase',
  },
  fact: { color: colors.dangerOn, fontFamily: fonts.bodyBold, fontSize: 20 },
  factDetail: { color: colors.dangerText, fontFamily: fonts.body, fontSize: 15 },
  plain: {
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 18,
    padding: space.lg,
    gap: space.sm,
  },
  plainLabel: {
    color: colors.dangerTextStrong,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  plainTxt: { color: colors.dangerOn, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  cause: { color: colors.dangerText, fontFamily: fonts.body, fontSize: 14 },
});
