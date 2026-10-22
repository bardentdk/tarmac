/**
 * ElmInit.ts — la mise en route du boîtier, étape par étape.
 *
 * C'est la séquence la plus délicate de toute l'app. Un ELM327 qui démarre est
 * comme un vieux moteur un matin d'hiver : il faut le réveiller dans le bon
 * ordre, et chaque modèle a ses caprices.
 *
 * Deux principes gouvernent ce fichier :
 *
 *   1. **Peu d'étapes sont bloquantes.** Si `ATL0` échoue, on s'en fiche : le
 *      nettoyage gère les sauts de ligne. Si `ATE0` échoue, en revanche, on
 *      s'arrête : sans ça, chaque réponse sera polluée par l'écho et plus rien
 *      ne sera décodable de façon fiable.
 *
 *   2. **Toute étape optionnelle qui échoue est notée dans la fiche de
 *      capacités**, pas ignorée en silence. C'est ce qui permet au
 *      planificateur de s'adapter au lieu de répéter une commande refusée.
 */
import { ElmProtocol } from './ElmProtocol';
import { probeCapabilities, UNKNOWN_CAPS, type ElmCapabilities } from './capabilities';
import { consoleLog } from '@/debug/ConsoleLog';

/** Protocole visé. `vw-can` évite une recherche automatique lente. */
export type ProtocolChoice = 'auto' | 'vw-can';

export interface InitOptions {
  protocol?: ProtocolChoice;
  /** Réutiliser une fiche de capacités déjà connue pour ce boîtier. */
  knownCaps?: ElmCapabilities | null;
  /** Permet d'arrêter l'init en cours de route (l'utilisateur annule). */
  signal?: { aborted: boolean };
}

export class InitAbortedError extends Error {
  constructor() { super('Initialisation interrompue'); this.name = 'InitAbortedError'; }
}

export class InitFailedError extends Error {
  constructor(readonly step: string, readonly reason: string) {
    super(`Initialisation échouée à l'étape « ${step} » : ${reason}`);
    this.name = 'InitFailedError';
  }
}

/** Petite aide : exécute une commande et dit simplement si elle a réussi. */
async function tryStep(elm: ElmProtocol, cmd: string, timeoutMs = 2000): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await elm.send(cmd, { timeoutMs, tolerateErrors: true, retries: 1 });
    return { ok: !r.error, text: r.clean };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Initialise le boîtier et renvoie sa fiche de capacités.
 *
 * @throws InitFailedError quand une étape bloquante échoue.
 */
export async function initializeElm(elm: ElmProtocol, opts: InitOptions = {}): Promise<ElmCapabilities> {
  const protocol = opts.protocol ?? 'vw-can';
  const check = () => { if (opts.signal?.aborted) throw new InitAbortedError(); };
  const caps: ElmCapabilities = { ...UNKNOWN_CAPS };

  consoleLog.sys('── Initialisation du boîtier ──');

  /* ── Étape 1 : réveiller et purger ───────────────────────────────────
     Un boîtier qui vient d'être branché, ou qui garde une réponse en
     travers de la gorge, doit d'abord rendre la main. On envoie un retour
     chariot nu et on attend le `>`. Tout ce qui arrive avant est jeté. */
  check();
  await elm.unblock(2000);

  /* ── Étape 2 : remise à zéro ─────────────────────────────────────────
     `ATZ` est un redémarrage complet : il peut prendre jusqu'à 5 secondes et,
     sur certains clones, il coupe carrément le lien Bluetooth. Si `ATZ` ne
     répond pas, on tente la voie douce : `ATD` (réglages par défaut) suivi de
     `ATWS` (redémarrage logiciel, qui ne touche pas à la liaison). */
  check();
  const atz = await tryStep(elm, 'ATZ', 5000);
  if (atz.ok) {
    caps.version = atz.text.replace(/[^\x20-\x7e]/g, '').trim() || '?';
  } else {
    consoleLog.sys('ATZ sans réponse : repli sur ATD + ATWS (clone susceptible)');
    await tryStep(elm, 'ATD', 2500);
    const ws = await tryStep(elm, 'ATWS', 3000);
    if (!ws.ok) throw new InitFailedError('ATZ/ATWS', 'le boîtier ne répond pas à la remise à zéro');
    caps.version = ws.text.trim() || '?';
  }

  /* ── Étape 3 : couper l'écho — BLOQUANTE ─────────────────────────────
     Sans `ATE0`, chaque réponse commence par la répétition de la question.
     Le nettoyage sait l'enlever, mais au prix d'une ambiguïté : une réponse
     vide devient indistinguable d'un écho. On refuse de travailler comme ça. */
  check();
  const e0 = await tryStep(elm, 'ATE0', 2000);
  if (!e0.ok) {
    // Deuxième chance : certains clones ratent la toute première commande
    // après ATZ, mais acceptent la même une demi-seconde plus tard.
    const retry = await tryStep(elm, 'ATE0', 2000);
    if (!retry.ok) throw new InitFailedError('ATE0', 'impossible de couper l\'écho des commandes');
  }

  /* ── Étapes 4 à 6 : alléger les réponses — non bloquantes ──────────── */
  check();
  await tryStep(elm, 'ATL0'); // Pas de saut de ligne.
  await tryStep(elm, 'ATS0'); // Pas d'espaces : réponses plus courtes, donc plus rapides.
  await tryStep(elm, 'ATH0'); // Pas d'en-têtes : on ne veut que la donnée.

  /* ── Étape 7 : lire l'identité annoncée ──────────────────────────────
     Purement informatif : les clones affichent « v1.5 » ou « v2.1 » sans
     aucun rapport avec leur silicium. On le journalise pour le support. */
  check();
  const ati = await tryStep(elm, 'ATI', 2000);
  if (ati.ok && ati.text) caps.version = ati.text.trim();
  const at1 = await tryStep(elm, 'AT@1', 2000);
  if (at1.ok) caps.description = at1.text.trim();

  /* ── Étape 8 : choisir le protocole ──────────────────────────────────
     `ATSP6` = ISO 15765-4 CAN, 11 bits, 500 kbit/s : c'est celui des VW
     récentes. L'imposer évite la recherche automatique, qui peut coûter
     plusieurs secondes et qui, sur un clone, finit parfois en `UNABLE TO
     CONNECT` alors que la voiture répondait très bien. */
  check();
  let wanted = protocol === 'vw-can' ? 'ATSP6' : 'ATSP0';
  let sp = await tryStep(elm, wanted, 2500);
  if (!sp.ok && wanted !== 'ATSP0') {
    consoleLog.sys('ATSP6 refusé : retour à la recherche automatique (ATSP0)');
    wanted = 'ATSP0';
    sp = await tryStep(elm, 'ATSP0', 2500);
  }
  if (!sp.ok) throw new InitFailedError(wanted, 'le boîtier refuse tout choix de protocole');

  /* ── Étape 9 : délai adaptatif ───────────────────────────────────────
     Avec `ATAT1`, le boîtier apprend le temps de réponse réel du calculateur
     et n'attend plus inutilement. Gain net sur le débit. S'il refuse, on le
     note : le planificateur saura qu'il ne faut pas pousser la cadence. */
  check();
  const at1t = await tryStep(elm, 'ATAT1');
  caps.adaptiveTiming = at1t.ok;

  /* ── Étape 10 : viser le calculateur moteur ──────────────────────────
     `ATSH7E0` adresse directement le moteur plutôt que de diffuser la
     question à tous les calculateurs (7DF). Sur une VW avec passerelle, ça
     divise le nombre de trames de réponse. */
  check();
  const sh = await tryStep(elm, 'ATSH7E0');
  caps.headerSet = sh.ok;
  if (!sh.ok) consoleLog.sys('ATSH7E0 refusé : on interrogera en diffusion (7DF), plus lent');

  /* ── Étape 11 : le premier VRAI échange OBD ──────────────────────────
     C'est ici que le boîtier parle enfin à la voiture. Première requête =
     recherche de protocole côté bus, d'où le délai généreux de 6 secondes.
     Si ça échoue, la cause est presque toujours « contact non mis ». */
  check();
  let first = await tryStep(elm, '0100', 6000);
  if (!first.ok) {
    consoleLog.sys('0100 sans réponse : nouvelle tentative en recherche automatique');
    await tryStep(elm, 'ATSP0', 2500);
    first = await tryStep(elm, '0100', 8000);
    if (!first.ok) {
      throw new InitFailedError(
        '0100',
        'le calculateur ne répond pas — contact mis ? boîtier bien enfoncé dans la prise ?',
      );
    }
  }

  /* ── Protocole réellement retenu ─────────────────────────────────────── */
  check();
  const dp = await tryStep(elm, 'ATDP', 2000);
  caps.protocol = dp.ok && dp.text ? dp.text.trim() : (wanted === 'ATSP6' ? 'ISO 15765-4 CAN 11/500' : 'auto');

  /* ── Étape 12 : tension batterie lue par le boîtier ──────────────────── */
  const rv = await tryStep(elm, 'ATRV', 2000);
  if (rv.ok) consoleLog.sys(`Tension au boîtier : ${rv.text}`);

  consoleLog.sys('── Boîtier prêt ──');

  /* ── Examen de capacités ─────────────────────────────────────────────
     Si on connaît déjà ce boîtier et que sa fiche est récente (moins de 30
     jours), on la reprend : on économise environ une seconde de connexion. */
  check();
  const known = opts.knownCaps;
  const fresh = known && Date.now() - known.testedAt < 30 * 24 * 3600 * 1000;
  if (fresh) {
    consoleLog.sys('Fiche de capacités reprise de la mémoire (boîtier déjà connu)');
    return { ...known, version: caps.version, protocol: caps.protocol, headerSet: caps.headerSet, adaptiveTiming: caps.adaptiveTiming };
  }

  return probeCapabilities(elm, caps);
}
