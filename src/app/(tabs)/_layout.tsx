/**
 * (tabs)/_layout.tsx — la barre de navigation principale.
 *
 * Quatre onglets, comme dans la maquette : Lancer, Analyses, Santé,
 * Classement. L'onglet actif passe au vert, et l'icône est doublée de son
 * libellé — règle de la charte : jamais la couleur seule pour porter le sens.
 *
 * La barre est reconstruite à la main plutôt que laissée au style par défaut :
 * on veut la hauteur de cible tactile de la charte (52 px) et le fond
 * « carbone clair » du bas d'écran.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, space, tap } from '@/ui/tokens';
import { TabCharts, TabHealth, TabLaunch, TabRanking, type IconProps } from '@/ui/icons';

const ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  index: TabLaunch,
  historique: TabCharts,
  sante: TabHealth,
  classement: TabRanking,
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, descriptors, navigation }) => (
        <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const Icon = ICONS[route.name] ?? TabLaunch;
            const label = (options.title ?? route.name) as string;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={() => {
                  if (focused) return;
                  // Retour haptique léger : on sait qu'on a changé d'onglet
                  // sans avoir à regarder l'écran.
                  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate(route.name);
                }}
                style={tb.item}
              >
                <Icon size={22} color={focused ? colors.ok : colors.text2} />
                <Text style={[tb.label, focused && { color: colors.ok }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Lancer' }} />
      <Tabs.Screen name="historique" options={{ title: 'Analyses' }} />
      <Tabs.Screen name="sante" options={{ title: 'Santé' }} />
      <Tabs.Screen name="classement" options={{ title: 'Classement' }} />
    </Tabs>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgNav,
    paddingTop: 6,
    paddingHorizontal: space.sm,
  },
  item: {
    flex: 1,
    minHeight: tap.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { color: colors.text2, fontFamily: fonts.bodySemi, fontSize: 12 },
});
