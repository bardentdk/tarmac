/**
 * fonts.ts — le chargement des polices de la charte.
 *
 * Deux familles, deux rôles :
 *   · **Barlow** pour tout ce qui se lit (titres, phrases, libellés) ;
 *   · **Barlow Condensed** pour tout ce qui se mesure (chronos, régimes,
 *     températures). Elle est plus étroite, donc un « 168 » de chrono tient
 *     dans la largeur d'un téléphone, et ses chiffres tabulaires ont tous la
 *     même largeur : le chrono ne tremble pas quand il passe de 9 à 10.
 *
 * On importe chaque graisse par son chemin direct plutôt que depuis la racine
 * du paquet : importer la racine chargerait les 18 graisses de Barlow, soit
 * plusieurs mégaoctets pour en utiliser quatre.
 */
import { useFonts } from 'expo-font';
import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { fonts } from './tokens';

/**
 * Charge les polices. Les clés sont les noms utilisés dans `fonts` (tokens.ts) :
 * c'est ce qui permet d'écrire `fontFamily: fonts.numBold` partout sans jamais
 * citer un nom de fichier.
 */
export function useTarmacFonts(): [boolean, Error | null] {
  return useFonts({
    [fonts.body]: Barlow_400Regular,
    [fonts.bodyMedium]: Barlow_500Medium,
    [fonts.bodySemi]: Barlow_600SemiBold,
    [fonts.bodyBold]: Barlow_700Bold,
    [fonts.num]: BarlowCondensed_600SemiBold,
    [fonts.numBold]: BarlowCondensed_700Bold,
    [fonts.numBlack]: BarlowCondensed_800ExtraBold,
  });
}
