/**
 * safety.ts — le garde-barrière.
 *
 * On est branché sur le bus d'une voiture réelle. Certaines commandes OBD ne
 * lisent pas : elles ÉCRIVENT dans un calculateur, redémarrent un module ou
 * ouvrent une session de programmation. Au mieux elles coupent le moteur en
 * roulant, au pire elles transforment le calculateur en brique.
 *
 * Ce fichier contient une liste blanche : tout ce qui n'y est pas est refusé
 * avant même d'atteindre le boîtier. On ne fait pas de liste noire, parce
 * qu'une liste noire oublie toujours quelque chose.
 *
 * Il n'y a qu'un seul chemin vers le boîtier (ElmProtocol.send) et il appelle
 * `assertAllowed`. Il n'existe donc aucun moyen de contourner cette barrière
 * sans modifier ce fichier — et c'est testé.
 */

export class SafetyError extends Error {
  constructor(readonly command: string, readonly why: string) {
    super(`Commande refusée « ${command} » : ${why}`);
    this.name = 'SafetyError';
  }
}

/**
 * Services OBD / UDS autorisés, en lecture seule.
 *   01 données en direct · 02 image figée · 03 codes défaut
 *   07 défauts en attente · 09 informations véhicule (VIN)
 *   0A défauts permanents  · 22 lecture d'identifiant constructeur (UDS)
 */
const ALLOWED_SERVICES = new Set(['01', '02', '03', '07', '09', '0A', '22']);

/**
 * `04` efface les codes défaut. Ce n'est pas dangereux pour le moteur, mais
 * c'est irréversible : on perd l'historique du diagnostic. Autorisé uniquement
 * depuis l'écran dédié, après confirmation explicite, et jamais par le
 * planificateur. D'où le jeton, qui doit être passé à la main.
 */
const CLEAR_DTC_SERVICE = '04';
export const CLEAR_DTC_TOKEN = 'effacement-confirme-par-utilisateur';

/**
 * Services formellement interdits, quelles que soient les circonstances.
 * Documentés ici pour que personne ne les « rouvre juste pour essayer ».
 */
const FORBIDDEN_SERVICES: Record<string, string> = {
  '10': 'changement de session de diagnostic',
  '11': 'redémarrage du calculateur',
  '27': 'déverrouillage de sécurité',
  '2E': 'écriture dans le calculateur',
  '2F': 'pilotage direct d\'actionneur',
  '31': 'lancement de routine interne',
  '34': 'début de téléchargement de firmware',
  '35': 'début d\'envoi de firmware',
  '36': 'transfert de firmware',
  '37': 'fin de transfert de firmware',
  '3B': 'écriture de données constructeur',
  '3D': 'écriture mémoire',
  '85': 'désactivation de l\'enregistrement des défauts',
};

/**
 * Commandes `AT` interdites.
 * `ATMA` met le boîtier en écoute permanente du bus : sur un clone, le tampon
 * sature en une seconde (`BUFFER FULL`) et il faut le débrancher. Aucun intérêt
 * pour nous, et un risque de blocage certain.
 */
const FORBIDDEN_AT = [/^ATMA/i, /^ATM[AR]/i, /^ATCS/i, /^ATPC$/i];

/** Est-ce une commande de configuration du boîtier (et non du véhicule) ? */
export function isAtCommand(cmd: string): boolean {
  return /^(AT|ST)/i.test(cmd.trim());
}

/**
 * Vérifie une commande. Lève `SafetyError` si elle n'est pas autorisée.
 *
 * @param raw   La commande telle qu'elle partirait, sans le retour chariot.
 * @param token Jeton obligatoire pour le service 04 (effacement des défauts).
 */
export function assertAllowed(raw: string, token?: string): void {
  const cmd = raw.trim();

  // Un retour chariot seul : c'est notre commande de déblocage, toujours permise.
  if (cmd.length === 0) return;

  if (isAtCommand(cmd)) {
    const bad = FORBIDDEN_AT.find((re) => re.test(cmd));
    if (bad) {
      throw new SafetyError(cmd, 'commande AT interdite (risque de saturation du boîtier)');
    }
    return;
  }

  const compact = cmd.replace(/\s/g, '').toUpperCase();
  if (!/^[0-9A-F]+$/.test(compact)) {
    throw new SafetyError(cmd, 'ce n\'est ni une commande AT ni une requête hexadécimale');
  }
  if (compact.length < 2) {
    throw new SafetyError(cmd, 'requête trop courte pour porter un numéro de service');
  }

  const service = compact.slice(0, 2);

  if (FORBIDDEN_SERVICES[service]) {
    throw new SafetyError(cmd, `service ${service} interdit (${FORBIDDEN_SERVICES[service]})`);
  }

  if (service === CLEAR_DTC_SERVICE) {
    if (token !== CLEAR_DTC_TOKEN) {
      throw new SafetyError(cmd, 'l\'effacement des codes défaut exige une confirmation explicite de l\'utilisateur');
    }
    return;
  }

  if (!ALLOWED_SERVICES.has(service)) {
    throw new SafetyError(cmd, `service ${service} hors de la liste blanche (lecture seule)`);
  }
}

/** Variante sans exception, pratique pour griser un bouton dans l'interface. */
export function isAllowed(cmd: string, token?: string): boolean {
  try {
    assertAllowed(cmd, token);
    return true;
  } catch {
    return false;
  }
}

/** Expose la liste blanche pour l'écran de diagnostic. */
export const safetyInfo = {
  allowedServices: [...ALLOWED_SERVICES],
  forbiddenServices: FORBIDDEN_SERVICES,
  clearDtcService: CLEAR_DTC_SERVICE,
};
