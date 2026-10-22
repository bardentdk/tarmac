/**
 * aide-boitier.tsx — « Mon boîtier n'apparaît pas ».
 *
 * Cet écran n'est pas de la documentation : c'est du dépannage. Il est écrit
 * dans l'ordre réel des causes, de la plus fréquente à la plus rare, parce
 * qu'un utilisateur bloqué lit la première ligne et s'arrête.
 *
 * Il est volontairement bavard. C'est le seul écran de l'app où la densité de
 * texte est un service rendu.
 */
import React from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Dim, GhostButton, Header, Screen, Txt } from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { colors, fonts, space } from '@/ui/tokens';

interface HelpSection {
  title: string;
  steps: string[];
  /** Ne concerne qu'une plateforme. */
  only?: 'ios' | 'android';
}

const SECTIONS: HelpSection[] = [
  {
    title: '1. Le boîtier est-il alimenté ?',
    steps: [
      'Mets le contact (pas besoin de démarrer le moteur).',
      'Une petite lumière doit s\'allumer sur le boîtier. Si elle reste éteinte, la prise OBD n\'est pas alimentée : vérifie le fusible de la prise diagnostic.',
      'Enfonce le boîtier à fond. Un boîtier à moitié branché s\'allume mais ne dialogue pas.',
    ],
  },
  {
    title: '2. BLE ou Bluetooth classique ?',
    steps: [
      'Si ton boîtier demande un code PIN dans les réglages Bluetooth du téléphone : c\'est du Bluetooth CLASSIQUE.',
      'S\'il n\'apparaît pas du tout dans les réglages du système mais seulement dans les apps : c\'est du BLE.',
      'Ce ne sont pas les mêmes onglets dans Tarmac. Un boîtier classique ne sera JAMAIS trouvé par l\'onglet BLE, et inversement.',
    ],
  },
  {
    title: '3. Appairage préalable (Bluetooth classique)',
    only: 'android',
    steps: [
      'Ouvre les réglages Android > Bluetooth, et appaire le boîtier UNE FOIS.',
      'Les codes PIN habituels sont 1234, 0000 ou 6789.',
      'Reviens dans Tarmac : il apparaîtra en tête de liste, marqué « Déjà appairé ». C\'est beaucoup plus fiable qu\'une recherche à chaud.',
    ],
  },
  {
    title: '3. Les boîtiers à code PIN ne marchent pas sur iPhone',
    only: 'ios',
    steps: [
      'Apple réserve le Bluetooth classique aux accessoires qu\'elle a certifiés (programme MFi). Aucun clone ELM327 ne l\'est.',
      'Ce n\'est pas une limite de Tarmac : aucune app iPhone ne peut parler à ces boîtiers.',
      'Il te faut un boîtier BLE (souvent vendu comme « compatible iOS ») ou un boîtier Wi-Fi.',
    ],
  },
  {
    title: '4. Autorisations',
    steps: [
      Platform.OS === 'android'
        ? 'Android 12 et plus demandent l\'autorisation « Appareils à proximité ». Sans elle, la recherche ne renvoie rien du tout — sans message d\'erreur.'
        : 'iOS demande l\'autorisation Bluetooth au premier scan. Si tu as refusé, la recherche reste vide en silence.',
      'Vérifie aussi que le Bluetooth du téléphone est bien allumé (et pas seulement l\'icône de la barre d\'état).',
    ],
  },
  {
    title: '5. Le boîtier est déjà pris',
    steps: [
      'Un ELM327 n\'accepte QU\'UNE connexion à la fois. S\'il est encore connecté à une autre app (ou à un autre téléphone), il devient invisible.',
      'Ferme les autres apps OBD, ou débranche et rebranche le boîtier pour couper net.',
    ],
  },
  {
    title: '6. Boîtier Wi-Fi',
    steps: [
      'Connecte le téléphone au réseau Wi-Fi créé par le boîtier, dans les réglages du système.',
      'L\'adresse habituelle est 192.168.0.10, port 35000. Tarmac propose aussi les variantes connues.',
      'Pendant que tu es sur ce Wi-Fi, le téléphone n\'a plus Internet. C\'est normal.',
    ],
  },
  {
    title: '7. Tester sans voiture',
    steps: [
      'L\'onglet « Démo » simule un vrai ELM327, y compris ses défauts. Il permet de vérifier que l\'app fonctionne et que le problème vient bien du matériel.',
      'Le profil « clone instable » décroche volontairement toutes les 25 secondes : c\'est ainsi qu\'on teste la reconnexion automatique.',
    ],
  },
];

export default function AideBoitier() {
  const sections = SECTIONS.filter((s) => !s.only || s.only === Platform.OS);

  return (
    <Screen scroll style={ah.screen}>
      <Header title="Mon boîtier n'apparaît pas" onBack={() => router.back()} />

      <Dim style={{ fontSize: 15, lineHeight: 21 }}>
        Dans l'ordre, de la cause la plus fréquente à la plus rare. Dans 9 cas sur 10, c'est le point 1 ou le point 2.
      </Dim>

      {sections.map((s, i) => (
        <FadeInUp key={s.title} delay={i * 60}>
          <Card style={{ gap: space.sm }}>
            <Text style={ah.title}>{s.title}</Text>
            {s.steps.map((step) => (
              <View key={step} style={ah.step}>
                <Text style={ah.bullet}>·</Text>
                <Txt style={ah.stepTxt}>{step}</Txt>
              </View>
            ))}
          </Card>
        </FadeInUp>
      ))}

      <View style={{ gap: space.md, marginTop: space.lg }}>
        <GhostButton title="Ouvrir les réglages du téléphone" onPress={() => void Linking.openSettings()} />
        <GhostButton title="Voir la console de diagnostic" onPress={() => router.push('/console')} />
      </View>
    </Screen>
  );
}

const ah = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 },
  step: { flexDirection: 'row', gap: space.sm },
  bullet: { color: colors.ok, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  stepTxt: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text3 },
});
