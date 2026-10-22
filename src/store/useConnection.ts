/**
 * useConnection.ts — le pont entre le chef d'orchestre et React.
 *
 * Le `ConnectionManager` vit hors de React pour ne jamais être démonté. Les
 * écrans, eux, ont besoin de se redessiner quand l'état change. Ce fichier est
 * le seul endroit où les deux mondes se rencontrent, via
 * `useSyncExternalStore` : React s'abonne, il ne possède rien.
 */
import { useSyncExternalStore } from 'react';
import { connection, type ConnPhase, type ConnSnapshot } from '@/connection/ConnectionManager';
import { colors } from '@/ui/tokens';

export function useConnection(): ConnSnapshot {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot);
}

/**
 * Traduit une phase en couleur + texte + faut-il faire respirer la pastille.
 *
 * Règle de la charte respectée ici : la couleur n'est JAMAIS seule porteuse du
 * sens. Chaque état a son texte, lisible même en noir et blanc.
 */
export function phasePresentation(phase: ConnPhase, message: string): {
  color: string;
  label: string;
  pulsing: boolean;
  tone: 'ok' | 'warn' | 'info' | 'danger' | 'idle';
} {
  switch (phase) {
    case 'ready':
    case 'polling':
      return { color: colors.ok, label: 'Connecté', pulsing: false, tone: 'ok' };
    case 'scanning':
      return { color: colors.info, label: 'Recherche…', pulsing: true, tone: 'info' };
    case 'connecting':
    case 'discovering':
      return { color: colors.info, label: 'Connexion…', pulsing: true, tone: 'info' };
    case 'initializing':
      return { color: colors.info, label: 'Réglage du boîtier…', pulsing: true, tone: 'info' };
    case 'reconnecting':
      return { color: colors.warn, label: message, pulsing: true, tone: 'warn' };
    case 'error':
      return { color: colors.danger, label: message, pulsing: false, tone: 'danger' };
    default:
      return { color: colors.text2, label: 'Non connecté', pulsing: false, tone: 'idle' };
  }
}
