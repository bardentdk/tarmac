/**
 * index.tsx — l'aiguillage du démarrage.
 *
 * Premier lancement : on envoie l'utilisateur sur l'accueil puis l'appairage.
 * Lancements suivants : on va droit au but, l'écran « prêt à lancer ».
 *
 * Un composant de redirection plutôt qu'une condition dans le layout : avec
 * expo-router, c'est la façon de ne pas garder dans la pile un écran que
 * l'utilisateur ne doit plus jamais revoir.
 */
import { Redirect } from 'expo-router';
import { isOnboarded } from '@/store/storage';

export default function Index() {
  return <Redirect href={isOnboarded() ? '/(tabs)' : '/onboarding'} />;
}
