/**
 * appUpdate.ts — les mises à jour de l'app, sans passer par les stores.
 *
 * Expo Updates permet de remplacer le JavaScript et les images de l'app sans
 * nouvelle version sur l'App Store. L'image à avoir en tête : le moteur
 * (le code natif, Bluetooth compris) reste le même, on change la carrosserie
 * et la cartographie.
 *
 * Pourquoi c'est important ICI plus qu'ailleurs : le gros du travail de ce
 * projet consiste à s'adapter aux caprices des clones ELM327. Chaque nouveau
 * clone découvert demande un ajustement de la séquence d'initialisation ou de
 * la table de profils BLE. Avec les mises à jour à la volée, le correctif
 * arrive dans la journée au lieu d'attendre une semaine de validation Apple.
 *
 * Deux règles de sécurité, codées ici :
 *
 *   1. **On ne recharge JAMAIS l'app pendant une connexion active.** Recharger
 *      détruit le contexte JavaScript : la connexion au boîtier tombe, et un
 *      run en cours est perdu. On attend donc que l'utilisateur soit au repos,
 *      ou on lui demande explicitement.
 *
 *   2. **Une mise à jour ne change jamais le code natif.** Si un correctif
 *      demande une nouvelle version de react-native-ble-plx, il faut un
 *      nouveau build : `runtimeVersion` empêche l'app de charger un bundle
 *      incompatible, et on l'affiche dans les réglages pour le diagnostic.
 */
import { useCallback, useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { consoleLog } from '@/debug/ConsoleLog';
import { connection } from '@/connection/ConnectionManager';

export interface UpdateState {
  /** Les mises à jour sont-elles actives ? Faux en développement. */
  enabled: boolean;
  /** Une version plus récente existe sur le serveur. */
  available: boolean;
  /** Elle est téléchargée et attend un redémarrage. */
  pending: boolean;
  checking: boolean;
  downloading: boolean;
  /** Dernière erreur, en français. */
  error: string | null;
  /** Version du code natif en cours (impose la compatibilité des bundles). */
  runtimeVersion: string;
  /** Identifiant court de la version JavaScript en cours. */
  currentId: string;
  /** Date de publication de la version en cours. */
  publishedAt: Date | null;
  /** Canal de diffusion (production, preview…). */
  channel: string;
  /** La version en cours est-elle celle livrée avec le build ? */
  embedded: boolean;
  /** Une connexion au boîtier est en cours : redémarrer la couperait. */
  blockedByConnection: boolean;
}

/** Texte à afficher dans le bandeau et les réglages. */
export function describeUpdate(s: UpdateState): { title: string; detail: string; action: string | null } {
  if (!s.enabled) {
    return {
      title: 'Mises à jour désactivées',
      detail: 'En développement, l\'app se recharge depuis Metro. Les mises à jour à la volée ne servent qu\'aux versions distribuées.',
      action: null,
    };
  }
  if (s.pending) {
    return {
      title: 'Mise à jour prête',
      detail: s.blockedByConnection
        ? 'Elle s\'appliquera à la prochaine ouverture : on ne redémarre pas pendant une connexion au boîtier.'
        : 'Redémarre l\'app pour l\'appliquer. Ça prend deux secondes.',
      action: s.blockedByConnection ? null : 'Redémarrer maintenant',
    };
  }
  if (s.downloading) return { title: 'Téléchargement…', detail: 'La mise à jour arrive.', action: null };
  if (s.available) return { title: 'Mise à jour disponible', detail: 'Une version plus récente de Tarmac est en ligne.', action: 'Télécharger' };
  if (s.checking) return { title: 'Vérification…', detail: 'On regarde s\'il y a du nouveau.', action: null };
  if (s.error) return { title: 'Vérification impossible', detail: s.error, action: 'Réessayer' };
  return {
    title: 'Tarmac est à jour',
    detail: `Version ${s.currentId} · socle natif ${s.runtimeVersion}`,
    action: 'Vérifier maintenant',
  };
}

/** Raccourcit un identifiant de mise à jour pour l'affichage. */
function shortId(id: string | null | undefined): string {
  if (!id) return 'intégrée au build';
  return id.slice(0, 8);
}

/**
 * Suit l'état des mises à jour et expose les deux actions utiles.
 *
 * `useUpdates()` d'expo-updates fait déjà le suivi natif ; on l'habille pour
 * ajouter ce qui nous est propre : les messages en français et le verrou de
 * connexion.
 */
export function useAppUpdate() {
  const u = Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = Updates.isEnabled;

  const state: UpdateState = {
    enabled,
    available: u.isUpdateAvailable,
    pending: u.isUpdatePending,
    checking: u.isChecking,
    downloading: u.isDownloading || busy,
    error: error ?? u.checkError?.message ?? u.downloadError?.message ?? null,
    runtimeVersion: Updates.runtimeVersion ?? '—',
    currentId: shortId(u.currentlyRunning.updateId),
    publishedAt: u.currentlyRunning.createdAt ?? null,
    channel: u.currentlyRunning.channel ?? 'développement',
    embedded: u.currentlyRunning.isEmbeddedLaunch,
    // On interroge le gestionnaire de connexion, pas un état React : il est la
    // seule source de vérité sur l'état réel de la liaison au boîtier.
    blockedByConnection: connection.isLive,
  };

  /** Vérifie s'il y a du nouveau. Sans effet en développement. */
  const check = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      const res = await Updates.checkForUpdateAsync();
      consoleLog.sys(res.isAvailable ? 'Mise à jour disponible' : 'App à jour');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled]);

  /** Télécharge la mise à jour, sans l'appliquer. */
  const download = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      await Updates.fetchUpdateAsync();
      consoleLog.sys('Mise à jour téléchargée, en attente de redémarrage');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  /**
   * Applique la mise à jour en redémarrant le JavaScript.
   *
   * Refus net si le boîtier est connecté : recharger couperait la liaison et,
   * s'il y a un run en cours, on perdrait la mesure. C'est une règle, pas une
   * préférence.
   */
  const apply = useCallback(async (force = false) => {
    if (!enabled) return;
    if (connection.isLive && !force) {
      setError('Déconnecte le boîtier avant de redémarrer : la mise à jour couperait la liaison.');
      return;
    }
    try {
      await Updates.reloadAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled]);

  /**
   * Vérification automatique à l'ouverture, puis toutes les 30 minutes.
   *
   * Le téléchargement est lancé tout seul (c'est quelques dizaines de ko), mais
   * JAMAIS le redémarrage : c'est l'utilisateur qui décide quand l'app se
   * recharge, parce que lui seul sait s'il est en train de rouler.
   */
  useEffect(() => {
    if (!enabled) return;
    void check();
    const t = setInterval(() => void check(), 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [enabled, check]);

  useEffect(() => {
    if (enabled && u.isUpdateAvailable && !u.isUpdatePending && !u.isDownloading) {
      void download();
    }
  }, [enabled, u.isUpdateAvailable, u.isUpdatePending, u.isDownloading, download]);

  return { state, check, download, apply };
}
