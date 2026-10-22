/**
 * UpdateBanner.tsx — le bandeau de mise à jour.
 *
 * Il apparaît en glissant depuis le haut quand une version est prête, et
 * jamais autrement. Volontairement discret : la priorité d'un conducteur n'est
 * pas de mettre son app à jour, c'est de voir son chrono. On ne bloque donc
 * jamais l'écran, et on ne redémarre jamais tout seul.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from './tokens';
import { Tappable } from './components';
import { Refresh } from './icons';
import { describeUpdate, useAppUpdate } from '@/update/appUpdate';

export function UpdateBanner() {
  const { state, apply, download } = useAppUpdate();
  const insets = useSafeAreaInsets();

  // On ne montre le bandeau que lorsqu'il y a une décision à prendre.
  if (!state.enabled) return null;
  if (!state.pending && !state.available) return null;

  const { title, detail } = describeUpdate(state);
  const canRestart = state.pending && !state.blockedByConnection;

  return (
    <Animated.View
      entering={SlideInUp.duration(380)}
      exiting={SlideOutUp.duration(240)}
      style={[ub.wrap, { top: insets.top + 8 }]}
      accessibilityRole="alert"
    >
      <View style={ub.icon}>
        <Refresh size={18} color={colors.info} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ub.title}>{title}</Text>
        <Text style={ub.detail}>{detail}</Text>
      </View>
      {canRestart ? (
        <Tappable onPress={() => void apply()} label="Redémarrer pour appliquer la mise à jour" style={ub.action}>
          <Text style={ub.actionTxt}>Redémarrer</Text>
        </Tappable>
      ) : state.available && !state.downloading ? (
        <Tappable onPress={() => void download()} label="Télécharger la mise à jour" style={ub.action}>
          <Text style={ub.actionTxt}>Obtenir</Text>
        </Tappable>
      ) : null}
    </Animated.View>
  );
}

const ub = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  detail: { color: colors.text2, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  action: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 13 },
});
