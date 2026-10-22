/**
 * onboarding.tsx — l'écran d'accueil (maquette « Bienvenue »).
 *
 * Trois promesses, un bouton. L'objectif est qu'en six secondes l'utilisateur
 * sache si l'app est pour lui. Les blocs arrivent en cascade : l'œil suit la
 * construction au lieu de recevoir un mur de texte.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, PrimaryButton, Tappable, Num, Dim } from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { Logo, Magnifier, Stopwatch, TabHealth } from '@/ui/icons';
import { colors, fonts, radius, space, tap } from '@/ui/tokens';
import { setOnboarded } from '@/store/storage';

/** Les trois arguments de vente, dans l'ordre d'importance. */
const FEATURES = [
  { Icon: Stopwatch, title: 'Chrono GPS 25 Hz', detail: '0-100, 100-200, 402 m, 60 ft' },
  { Icon: Magnifier, title: 'Analyse « Pourquoi ? »', detail: 'Chaque dixième perdu, expliqué' },
  { Icon: TabHealth, title: 'Garde du corps moteur', detail: 'Cliquetis, températures, usure' },
];

export default function Onboarding() {
  return (
    <Screen style={ob.screen} edges={['top', 'bottom']}>
      <FadeInUp delay={0}>
        <View style={ob.brand}>
          <Logo size={48} />
          <Num style={ob.wordmark}>TARMAC</Num>
        </View>
      </FadeInUp>

      <FadeInUp delay={90}>
        <View style={{ gap: space.md, marginTop: space.xxl }}>
          <Text style={ob.h1}>
            Ton chrono.{'\n'}Ton coach.{'\n'}
            <Text style={{ color: colors.ok }}>Ton moteur.</Text>
          </Text>
          <Text style={ob.lede}>
            Mesure tes runs, comprends chaque dixième perdu, et garde un œil sur la santé de ta voiture.
          </Text>
        </View>
      </FadeInUp>

      <View style={{ gap: 14 }}>
        {FEATURES.map((f, i) => (
          <FadeInUp key={f.title} delay={200 + i * 70}>
            <View style={ob.feature}>
              <View style={ob.featureIcon}>
                <f.Icon size={22} color={colors.ok} />
              </View>
              <Text style={ob.featureTxt}>
                <Text style={{ fontFamily: fonts.bodyBold }}>{f.title}</Text>
                {'\n'}
                <Text style={{ color: colors.text2 }}>{f.detail}</Text>
              </Text>
            </View>
          </FadeInUp>
        ))}
      </View>

      <FadeInUp delay={450} style={ob.footer}>
        <PrimaryButton title="Commencer" onPress={() => router.push('/appairage')} />
        <Tappable
          onPress={() => {
            // « J'ai déjà un compte » : on considère le parcours d'accueil fait
            // et on va directement à l'écran principal. L'appairage reste
            // accessible depuis les réglages.
            setOnboarded(true);
            router.replace('/(tabs)');
          }}
          label="J'ai déjà un compte"
          style={ob.secondary}
        >
          <Text style={ob.secondaryTxt}>J'ai déjà un compte</Text>
        </Tappable>
        <Dim style={ob.legal}>À utiliser uniquement sur circuit ou piste fermée.</Dim>
      </FadeInUp>
    </Screen>
  );
}

const ob = StyleSheet.create({
  screen: { paddingHorizontal: space.xxl, paddingTop: 56, paddingBottom: space.xxl, gap: space.xxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wordmark: { fontFamily: fonts.numBlack, fontSize: 34, letterSpacing: 2.7 },
  h1: {
    color: colors.text,
    fontFamily: fonts.numBlack,
    fontSize: 54,
    lineHeight: 52,
    textTransform: 'uppercase',
  },
  lede: { color: colors.text2, fontFamily: fonts.body, fontSize: 17, lineHeight: 24 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: {
    width: tap.min,
    height: tap.min,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTxt: { color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 },
  footer: { marginTop: 'auto', gap: space.md },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryTxt: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
  legal: { textAlign: 'center', fontSize: 12 },
});
