/**
 * vagDids.ts — fichier de configuration des identifiants constructeur VAG.
 *
 * Le mode 01 est normalisé : tout le monde répond pareil. Mais il ne donne pas
 * la température de boîte DSG, ni la pression de rampe, ni les corrections de
 * cliquetis par cylindre. Ces données existent, mais derrière le service UDS
 * `22`, avec des identifiants (DID) propres à chaque constructeur et jamais
 * publiés.
 *
 * ⚠️ AUCUNE valeur de ce fichier n'a été vérifiée sur la voiture d'essai.
 * Elles sont toutes marquées « À VÉRIFIER » et désactivées par défaut
 * (`enabled: false`). Le cahier des charges interdit d'inventer une valeur
 * technique : on les isole donc ici, visibles, plutôt que de les semer dans
 * le code en faisant comme si elles étaient sûres.
 *
 * Mode opératoire pour en valider une :
 *   1. activer le DID dans les réglages développeur ;
 *   2. ouvrir la console de diagnostic ;
 *   3. comparer la valeur obtenue avec VCDS / OBDeleven sur la même voiture ;
 *   4. si ça correspond, passer `enabled: true` et retirer la mention.
 */

export interface VagDid {
  /** L'identifiant sur 4 caractères hexadécimaux, sans le service 22. */
  did: string;
  label: string;
  unit: string;
  /** En-tête CAN du calculateur visé (7E0 = moteur, 7E1 = boîte). */
  header: string;
  /** Conversion des octets de données en valeur physique. */
  decode: (d: number[]) => number;
  /**
   * `false` tant que la valeur n'a pas été confirmée sur une vraie voiture.
   * Le planificateur ignore les DID désactivés.
   */
  enabled: boolean;
  /** Raison de la prudence, affichée dans l'écran de réglages. */
  note: string;
}

export const VAG_DIDS: VagDid[] = [
  {
    did: '2039', // À VÉRIFIER
    label: 'Température huile de boîte DSG',
    unit: '°C',
    header: '7E1',
    decode: (d) => (d.length >= 1 ? d[0] - 40 : NaN),
    enabled: false,
    note: 'À VÉRIFIER — identifiant non confirmé sur DQ200. Comparer avec VCDS avant activation.',
  },
  {
    did: '1128', // À VÉRIFIER
    label: 'Corrections de cliquetis cylindre 1',
    unit: '°',
    header: '7E0',
    decode: (d) => (d.length >= 1 ? d[0] / 10 : NaN),
    enabled: false,
    note: 'À VÉRIFIER — le facteur d\'échelle est une hypothèse.',
  },
  {
    did: '1129', // À VÉRIFIER
    label: 'Corrections de cliquetis cylindre 2',
    unit: '°',
    header: '7E0',
    decode: (d) => (d.length >= 1 ? d[0] / 10 : NaN),
    enabled: false,
    note: 'À VÉRIFIER — le facteur d\'échelle est une hypothèse.',
  },
  {
    did: '112A', // À VÉRIFIER
    label: 'Corrections de cliquetis cylindre 3',
    unit: '°',
    header: '7E0',
    decode: (d) => (d.length >= 1 ? d[0] / 10 : NaN),
    enabled: false,
    note: 'À VÉRIFIER — le facteur d\'échelle est une hypothèse.',
  },
  {
    did: '2026', // À VÉRIFIER
    label: 'Pression de rampe d\'injection',
    unit: 'bar',
    header: '7E0',
    decode: (d) => (d.length >= 2 ? (d[0] * 256 + d[1]) / 10 : NaN),
    enabled: false,
    note: 'À VÉRIFIER — ordre des octets et échelle non confirmés.',
  },
];

/** Les DID effectivement interrogeables (confirmés et activés). */
export function activeDids(): VagDid[] {
  return VAG_DIDS.filter((d) => d.enabled);
}

/** Construit la requête UDS correspondante : `221128`. */
export function udsRequest(did: string): string {
  return '22' + did.toUpperCase();
}
