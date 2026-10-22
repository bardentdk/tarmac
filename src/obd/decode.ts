/**
 * decode.ts — le décodeur de réponses OBD.
 *
 * Une réponse de mode 01 ressemble à ça : `410C1AF8410D3C`.
 *   41   = « je réponds au service 01 »
 *   0C   = le PID demandé
 *   1AF8 = ses deux octets de données
 *   41 0D 3C = et voilà le PID suivant, dans la même trame
 *
 * Le décodeur doit donc avancer dans la chaîne en se servant du dictionnaire
 * de PID pour savoir combien d'octets lire à chaque fois. C'est ça qui permet
 * le multi-PID (6 valeurs d'un coup au lieu de 6 allers-retours).
 */
import { hexToBytes, PID_BY_ID, type MetricKey } from './pids';
import { hexLines, joinMultiFrame } from '@/elm/sanitize';

export interface DecodedValue {
  pid: string;
  key: MetricKey;
  value: number;
  unit: string;
}

/**
 * Décode une réponse de mode 01 (ou 02, image figée) en valeurs physiques.
 *
 * Tolérant par construction : si un PID inconnu apparaît au milieu, on
 * s'arrête proprement au lieu de tout jeter. Un clone qui bafouille ne doit
 * pas faire perdre les valeurs correctes de la même trame.
 */
export function decodeMode01(clean: string, expectService = '41'): DecodedValue[] {
  const out: DecodedValue[] = [];

  // Une trame par ligne quand plusieurs calculateurs répondent : on les traite
  // toutes, les doublons sont écrasés par la dernière valeur lue.
  const lines = hexLines(clean);
  const candidates = lines.length > 0 ? lines : [clean.replace(/\s/g, '').toUpperCase()];

  for (const line of candidates) {
    let i = line.indexOf(expectService);
    if (i < 0) continue;

    while (i >= 0 && i + 4 <= line.length) {
      const pid = line.slice(i + 2, i + 4);
      const def = PID_BY_ID[pid];
      if (!def) break; // PID hors dictionnaire : on ne sait pas où est le suivant.

      const dataHex = line.slice(i + 4, i + 4 + def.bytes * 2);
      if (dataHex.length < def.bytes * 2) break; // Trame tronquée.

      const bytes = hexToBytes(dataHex);
      const value = def.decode(bytes);

      // Garde-fou : une valeur hors bornes physiques vient d'une trame abîmée.
      if (Number.isFinite(value) && value >= def.min && value <= def.max) {
        out.push({ pid, key: def.key, value, unit: def.unit });
      }

      // On saute au service suivant dans la même trame.
      i = i + 4 + def.bytes * 2;
      if (line.slice(i, i + 2) !== expectService) break;
    }
  }

  return out;
}

/**
 * Décode la réponse à `0100` / `0120` / `0140` / `0160` : la liste des PID que
 * ce calculateur sait fournir.
 */
export function decodeSupported(clean: string, baseHex: string): string[] {
  const line = hexLines(clean).find((l) => l.includes('41' + baseHex)) ?? clean.replace(/\s/g, '').toUpperCase();
  const at = line.indexOf('41' + baseHex);
  if (at < 0) return [];
  const data = line.slice(at + 4, at + 12);
  if (data.length < 8) return [];
  const base = parseInt(baseHex, 16);
  const bytes = hexToBytes(data);
  const supported: string[] = [];
  for (let b = 0; b < 4; b++) {
    for (let bit = 0; bit < 8; bit++) {
      if (bytes[b] & (0x80 >> bit)) {
        const pid = base + b * 8 + bit + 1;
        supported.push(pid.toString(16).toUpperCase().padStart(2, '0'));
      }
    }
  }
  return supported;
}

/* ─────────────────────────── Codes défaut ─────────────────────────── */

export interface Dtc {
  /** Le code lisible, par exemple « P0301 ». */
  code: string;
  /** Lettre de famille : P moteur, C châssis, B carrosserie, U réseau. */
  family: 'P' | 'C' | 'B' | 'U';
}

/**
 * Décode une réponse de mode 03 (défauts actifs) ou 07 (défauts en attente).
 *
 * Chaque code tient sur deux octets. Les deux bits de poids fort du premier
 * octet donnent la famille, les deux suivants le premier chiffre, puis les
 * trois chiffres restants sont lus directement en hexadécimal.
 * `0143` donne donc « P0143 ».
 */
export function decodeDtcs(clean: string, expectService = '43'): Dtc[] {
  const joined = joinMultiFrame(clean);
  const at = joined.indexOf(expectService);
  if (at < 0) return [];

  // Le mode 03 fait précéder les codes du nombre de codes (1 octet) sur CAN.
  let body = joined.slice(at + 2);
  if (body.length >= 2 && body.length % 4 === 2) body = body.slice(2);

  const families: Dtc['family'][] = ['P', 'C', 'B', 'U'];
  const out: Dtc[] = [];
  for (let i = 0; i + 4 <= body.length; i += 4) {
    const word = body.slice(i, i + 4);
    if (word === '0000') continue; // Case de remplissage.
    const first = parseInt(word.slice(0, 1), 16);
    const family = families[(first >> 2) & 0b11];
    const digit1 = first & 0b11;
    out.push({ code: `${family}${digit1}${word.slice(1)}`, family });
  }
  return out;
}

/**
 * Décode le VIN (réponse au service `0902`). Le VIN arrive en multi-trames,
 * chaque octet étant un caractère ASCII.
 */
export function decodeVin(clean: string): string | null {
  const joined = joinMultiFrame(clean);
  const at = joined.indexOf('4902');
  if (at < 0) return null;
  // Après `4902`, un octet de numéro de message (01), puis 17 caractères.
  let hex = joined.slice(at + 4);
  if (hex.startsWith('01')) hex = hex.slice(2);
  const bytes = hexToBytes(hex);
  const vin = bytes
    .filter((b) => b >= 0x20 && b <= 0x7e)
    .map((b) => String.fromCharCode(b))
    .join('')
    .trim();
  return vin.length >= 11 ? vin.slice(0, 17) : null;
}

/**
 * Décode une réponse UDS au service 22 (lecture d'identifiant constructeur).
 * Renvoie les octets de données brutes : la conversion dépend du DID, qui est
 * décrit dans `vagDids.ts`.
 */
export function decodeUds22(clean: string, did: string): number[] | null {
  const joined = joinMultiFrame(clean);
  const marker = '62' + did.toUpperCase();
  const at = joined.indexOf(marker);
  if (at < 0) return null;
  return hexToBytes(joined.slice(at + marker.length));
}
