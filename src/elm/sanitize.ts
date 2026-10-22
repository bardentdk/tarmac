/**
 * sanitize.ts — le passage au tamis.
 *
 * Un ELM327 ne répond jamais proprement. Il renvoie l'écho de la question,
 * des sauts de ligne, des espaces, parfois « SEARCHING... » pendant qu'il
 * cherche le protocole, et toujours un `>` final qui veut dire « au suivant ».
 * Sur un clone, ajoute des caractères parasites.
 *
 * Tout le reste de l'app travaille sur du propre. C'est ici qu'on tamise.
 */

/** Les réponses d'erreur que l'ELM327 sait produire, en erreurs typées. */
export type ElmErrorCode =
  | 'NO_DATA'
  | 'UNKNOWN_COMMAND'
  | 'UNABLE_TO_CONNECT'
  | 'CAN_ERROR'
  | 'BUS_ERROR'
  | 'BUS_BUSY'
  | 'BUFFER_FULL'
  | 'STOPPED'
  | 'FB_ERROR'
  | 'DATA_ERROR'
  | 'ERROR'
  | 'TIMEOUT';

export class ElmError extends Error {
  constructor(
    readonly code: ElmErrorCode,
    /** La commande qui a provoqué l'erreur. */
    readonly command: string,
    /** La réponse brute, utile dans la console de diagnostic. */
    readonly raw?: string,
  ) {
    super(`${code} (après « ${command} »)`);
    this.name = 'ElmError';
  }
}

/** Message en français, affichable tel quel à l'utilisateur. */
export function explainElmError(code: ElmErrorCode): string {
  switch (code) {
    case 'NO_DATA':
      return "Le calculateur n'a pas répondu à cette demande. Souvent : la donnée n'existe pas sur ce moteur.";
    case 'UNKNOWN_COMMAND':
      return "Le boîtier ne connaît pas cette commande. C'est fréquent sur les clones bas de gamme.";
    case 'UNABLE_TO_CONNECT':
      return 'Impossible de joindre le calculateur. Vérifie que le contact est mis.';
    case 'CAN_ERROR':
      return 'Erreur sur le bus CAN. Débranche et rebranche le boîtier.';
    case 'BUS_ERROR':
    case 'BUS_BUSY':
      return 'Le bus de la voiture est occupé ou perturbé. Nouvelle tentative en cours.';
    case 'BUFFER_FULL':
      return 'Le boîtier a été noyé de données. On réduit la cadence.';
    case 'STOPPED':
      return 'Le boîtier a interrompu la requête.';
    case 'TIMEOUT':
      return 'Pas de réponse dans le temps imparti. Le boîtier est peut-être en veille.';
    default:
      return 'Erreur du boîtier.';
  }
}

/** Lignes de « bruit » que l'ELM327 intercale et qui ne sont jamais des données. */
const NOISE_LINES = [
  /^SEARCHING\.{0,3}$/i,
  /^BUS\s*INIT\s*[:.]*\s*(OK|\.{0,6}OK)?$/i,
  /^BUS\s*INIT\s*\.{0,6}$/i,
  /^OBDII?\s*to\s*RS232.*$/i,
  /^AT[A-Z0-9@]*$/i, // Écho d'une commande AT quand ATE0 n'a pas pris.
];

/** Caractères de contrôle ASCII, hors retours chariot déjà traités. */
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f]/g;

/**
 * Nettoie une réponse brute.
 *
 * @param raw     Ce qui est arrivé du boîtier, `>` final inclus.
 * @param command La commande envoyée, pour retirer son écho.
 */
export function cleanResponse(raw: string, command: string): string {
  // 1. On coupe au `>` : tout ce qui suit appartient au tour suivant.
  const promptAt = raw.indexOf('>');
  let body = promptAt >= 0 ? raw.slice(0, promptAt) : raw;

  // 2. Les clones mélangent les retours chariot. On normalise en lignes.
  const cmdNorm = command.replace(/\s/g, '').toUpperCase();
  const lines = body
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const kept: string[] = [];
  for (const line of lines) {
    const compact = line.replace(/\s/g, '').toUpperCase();
    // 3. L'écho de la commande : première ligne quand ATE0 n'a pas pris.
    if (compact === cmdNorm) continue;
    // 4. Les lignes de bruit connues.
    if (NOISE_LINES.some((re) => re.test(line))) continue;
    kept.push(line);
  }

  body = kept.join('\n');
  // 5. Les caractères de contrôle restants.
  return body.replace(CONTROL_CHARS, '').trim();
}

/** Repère une réponse d'erreur. Appelé sur la sortie de `cleanResponse`. */
export function detectElmError(clean: string): ElmErrorCode | null {
  const u = clean.toUpperCase().replace(/\s/g, '');
  if (u.length === 0) return null;
  if (u === '?') return 'UNKNOWN_COMMAND';
  if (u.includes('NODATA')) return 'NO_DATA';
  if (u.includes('UNABLETOCONNECT')) return 'UNABLE_TO_CONNECT';
  if (u.includes('CANERROR')) return 'CAN_ERROR';
  if (u.includes('BUSBUSY')) return 'BUS_BUSY';
  if (u.includes('BUSERROR')) return 'BUS_ERROR';
  if (u.includes('BUFFERFULL')) return 'BUFFER_FULL';
  if (u.includes('STOPPED')) return 'STOPPED';
  if (u.includes('FBERROR')) return 'FB_ERROR';
  if (u.includes('DATAERROR')) return 'DATA_ERROR';
  // « ERROR » seul, en dernier : ne doit pas attraper « CAN ERROR ».
  if (/^ERROR$/.test(u)) return 'ERROR';
  return null;
}

/**
 * Recolle une réponse multi-trames.
 *
 * Quand la réponse dépasse 7 octets, l'ELM327 la découpe et préfixe chaque
 * morceau de son numéro en hexadécimal, comme les pages d'un fax :
 *
 *   014          <- longueur totale, parfois présente
 *   0: 49 02 01 56 53 53
 *   1: 5A 5A 5A 37 36 35 34
 *   2: 33 32 31 00 00 00 00
 *
 * On trie par numéro de page, on jette les préfixes, et on recolle.
 */
export function joinMultiFrame(clean: string): string {
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const framed: { idx: number; data: string }[] = [];
  const plain: string[] = [];

  for (const line of lines) {
    const m = /^([0-9A-F]):\s*(.*)$/i.exec(line);
    if (m) {
      framed.push({ idx: parseInt(m[1], 16), data: m[2].replace(/\s/g, '') });
      continue;
    }
    // Une ligne de longueur totale seule (3 chiffres hexa) n'est pas de la donnée.
    if (/^[0-9A-F]{3}$/i.test(line) && lines.length > 1) continue;
    plain.push(line.replace(/\s/g, ''));
  }

  if (framed.length > 0) {
    framed.sort((a, b) => a.idx - b.idx);
    return framed.map((f) => f.data).join('').toUpperCase();
  }
  return plain.join('').toUpperCase();
}

/**
 * Découpe une réponse en lignes de données hexadécimales utilisables.
 * Utile pour le mode 01 quand plusieurs calculateurs répondent (ATH1) ou
 * quand la réponse tient sur plusieurs lignes non numérotées.
 */
export function hexLines(clean: string): string[] {
  return clean
    .split('\n')
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => /^[0-9A-F]+$/.test(l) && l.length >= 2);
}
