/**
 * _layout.tsx — la racine de l'app.
 *
 * Trois responsabilités, et seulement trois :
 *   1. charger les polices de la charte avant d'afficher quoi que ce soit
 *      (sinon le premier rendu se fait en police système et « saute ») ;
 *   2. démarrer la plomberie qui doit vivre aussi longtemps que l'app :
 *      service au premier plan, reconnexion automatique au dernier boîtier ;
 *   3. déclarer la pile de navigation.
 *
 * Point important : la connexion au boîtier n'est PAS gérée ici. Elle vit dans
 * `ConnectionManager`, hors de React. Ce fichier ne fait que lui donner le
 * coup d'envoi — si la connexion dépendait de ce composant, chaque
 * rechargement à chaud la couperait.
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { useTarmacFonts } from '@/ui/fonts';
import { colors } from '@/ui/tokens';
import { UpdateBanner } from '@/ui/UpdateBanner';
import { connection } from '@/connection/ConnectionManager';
import { registerForegroundTask } from '@/connection/foregroundService';
import { consoleLog } from '@/debug/ConsoleLog';

// On garde l'écran de démarrage tant que les polices ne sont pas là.
void SplashScreen.preventAutoHideAsync();

// La tâche du service au premier plan doit être enregistrée au niveau module,
// avant tout rendu : Notifee l'exige, sinon Android refuse de la démarrer.
registerForegroundTask();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useTarmacFonts();

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync();
    if (fontError) consoleLog.err(`Polices non chargées : ${fontError.message}`);
  }, [fontsLoaded, fontError]);

  // Reprise du dernier boîtier, une seule fois au lancement.
  useEffect(() => {
    void connection.autoReconnectOnStart();
  }, []);

  // Une police manquante ne doit pas empêcher l'app de s'ouvrir : on affiche
  // quand même, en police système, plutôt qu'un écran noir définitif.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            // Glissement latéral : c'est le geste attendu sur une pile.
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="appairage" />
          <Stack.Screen name="aide-boitier" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="garage" />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          {/* Le run prend tout l'écran et arrive du bas : on entre en piste. */}
          <Stack.Screen name="run" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="alerte" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="analyse/[id]" />
          <Stack.Screen name="courbes/[id]" />
          <Stack.Screen name="comparatif" />
          <Stack.Screen name="dyno" />
          <Stack.Screen name="reglages" />
          <Stack.Screen name="live" />
          <Stack.Screen name="console" />
        </Stack>
        <UpdateBanner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
