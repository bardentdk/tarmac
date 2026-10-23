/**
 * dtcLibrary.ts — traduire un code défaut en français.
 *
 * « P0301 » ne veut rien dire pour personne. « Ratés d'allumage sur le
 * cylindre 1 — bougie, bobine ou injecteur » permet d'agir.
 *
 * ⚠️ PÉRIMÈTRE ASSUMÉ. Ce fichier ne contient que des codes **génériques**,
 * ceux que la norme SAE J2012 définit à l'identique pour tous les
 * constructeurs. Les codes propriétaires (`P1xxx`, `P2xxx` hauts, `P3xxx`)
 * ne sont pas publiés : les inventer serait pire que ne rien dire, parce que
 * quelqu'un changerait une pièce sur la foi d'une devinette.
 *
 * Pour ceux-là, `explainDtc` se rabat sur le **sous-système**, que la norme
 * définit par tranches de numéros. On dit alors honnêtement « code
 * constructeur, famille mélange air/essence — fais-le lire par un outil
 * spécialisé ». C'est moins satisfaisant et beaucoup plus honnête.
 *
 * Les conseils sont des pistes, dans l'ordre de probabilité et du moins cher
 * au plus cher. Ce ne sont pas des diagnostics : un code dit où regarder, pas
 * quoi remplacer.
 */

export type DtcSeverity =
  /** On peut rouler, à faire vérifier au prochain entretien. */
  | 'info'
  /** À traiter rapidement : consommation, pollution, perte de performance. */
  | 'warn'
  /** Risque d'abîmer le moteur ou le catalyseur. On ne fait pas de run. */
  | 'danger';

export interface DtcInfo {
  code: string;
  /** Intitulé court. */
  title: string;
  /** Ce que ça veut dire, en langage de tous les jours. */
  plain: string;
  /** Pistes à explorer, du plus probable et moins cher au plus lourd. */
  leads: string[];
  severity: DtcSeverity;
  /** Peut-on faire un run avec ce défaut ? */
  blocksRun: boolean;
  /** Vrai quand l'explication vient du repli par sous-système. */
  generic: boolean;
}

/** Entrée de la table, sans le code (qui sert de clé). */
type Entry = Omit<DtcInfo, 'code' | 'generic'>;

/**
 * Codes génériques OBD-II (SAE J2012).
 *
 * Choisis parce qu'ils représentent l'immense majorité de ce qu'on voit sur un
 * moteur essence suralimenté moderne, et parce qu'ils sont tous normalisés.
 */
const GENERIC: Record<string, Entry> = {
  /* ── Distribution variable ── */
  P0011: {
    title: "Calage d'arbre à cames trop avancé (admission)",
    plain:
      "Le moteur peut décaler ses soupapes pour mieux respirer selon le régime. Ce décalage ne va pas là où le calculateur le demande.",
    leads: ['Niveau et propreté de l\'huile (le système est piloté par la pression d\'huile)', 'Électrovanne de déphaseur', 'Capteur d\'arbre à cames', 'Chaîne ou courroie de distribution détendue'],
    severity: 'warn',
    blocksRun: true,
  },
  P0014: {
    title: "Calage d'arbre à cames trop avancé (échappement)",
    plain: "Même mécanisme que P0011, mais côté échappement.",
    leads: ["Niveau et propreté de l'huile", 'Électrovanne de déphaseur', "Capteur d'arbre à cames"],
    severity: 'warn',
    blocksRun: true,
  },

  /* ── Mélange air/essence ── */
  P0087: {
    title: 'Pression de carburant trop basse',
    plain:
      "La rampe d'injection n'est pas assez pressurisée. À pleine charge, le moteur manque d'essence — c'est le chemin direct vers la casse.",
    leads: ['Filtre à carburant colmaté', 'Pompe basse pression fatiguée', 'Pompe haute pression', 'Capteur de pression de rampe'],
    severity: 'danger',
    blocksRun: true,
  },
  P0088: {
    title: 'Pression de carburant trop haute',
    plain: "La rampe est trop pressurisée : l'injection devient imprécise.",
    leads: ['Régulateur de pression', 'Capteur de pression de rampe', 'Cartographie de pression inadaptée'],
    severity: 'warn',
    blocksRun: true,
  },
  P0101: {
    title: "Débitmètre d'air hors plage",
    plain:
      "Le capteur qui mesure l'air entrant annonce une valeur incohérente. Le calculateur ne sait plus combien d'essence envoyer.",
    leads: ['Filtre à air sale ou mal monté', 'Débitmètre encrassé (nettoyage spécifique, pas de produit au hasard)', 'Fuite d\'air entre le débitmètre et le turbo', 'Débitmètre à remplacer'],
    severity: 'warn',
    blocksRun: true,
  },
  P0102: {
    title: "Signal du débitmètre trop faible",
    plain: "Le débitmètre annonce presque pas d'air, ce qui est impossible moteur tournant.",
    leads: ['Connecteur débranché ou oxydé', 'Faisceau coupé', 'Débitmètre mort'],
    severity: 'warn',
    blocksRun: true,
  },
  P0103: {
    title: 'Signal du débitmètre trop élevé',
    plain: "Le débitmètre annonce plus d'air que le moteur ne peut en avaler.",
    leads: ['Débitmètre défaillant', 'Faisceau en court-circuit'],
    severity: 'warn',
    blocksRun: true,
  },
  P0106: {
    title: "Capteur de pression d'admission hors plage",
    plain:
      "La pression mesurée dans le collecteur ne correspond pas à ce que la position du papillon laisse attendre. C'est le capteur qui sert à réguler le turbo.",
    leads: ["Fuite d'air dans l'admission (durite, collier)", 'Capteur encrassé', 'Capteur à remplacer'],
    severity: 'warn',
    blocksRun: true,
  },
  P0107: {
    title: "Pression d'admission : signal trop faible",
    plain: 'Le capteur annonce le vide absolu, ce qui est impossible.',
    leads: ['Connecteur', 'Faisceau', 'Capteur mort'],
    severity: 'warn',
    blocksRun: true,
  },
  P0108: {
    title: "Pression d'admission : signal trop élevé",
    plain: 'Le capteur annonce une pression invraisemblable.',
    leads: ['Capteur défaillant', 'Faisceau en court-circuit'],
    severity: 'warn',
    blocksRun: true,
  },
  P0112: {
    title: "Capteur d'air d'admission : signal trop faible",
    plain: "La température d'air annoncée est absurde. Elle sert à corriger l'avance : le moteur roule sur une valeur fausse.",
    leads: ['Connecteur du capteur', 'Faisceau', 'Capteur à remplacer'],
    severity: 'warn',
    blocksRun: false,
  },
  P0113: {
    title: "Capteur d'air d'admission : signal trop élevé",
    plain: "Même problème que P0112, dans l'autre sens.",
    leads: ['Connecteur du capteur', 'Faisceau coupé', 'Capteur à remplacer'],
    severity: 'warn',
    blocksRun: false,
  },
  P0117: {
    title: 'Capteur de température de liquide : signal trop faible',
    plain:
      "Le moteur ne sait plus s'il est chaud. Il enrichit par précaution, consomme plus, et le ventilateur peut ne pas se déclencher.",
    leads: ['Connecteur', 'Capteur à remplacer (pièce peu chère)'],
    severity: 'warn',
    blocksRun: true,
  },
  P0118: {
    title: 'Capteur de température de liquide : signal trop élevé',
    plain: "Même problème que P0117. Attention : peut masquer une vraie surchauffe.",
    leads: ['Connecteur débranché', 'Capteur à remplacer', 'Vérifier le niveau de liquide avant tout'],
    severity: 'danger',
    blocksRun: true,
  },
  P0128: {
    title: 'Moteur trop long à chauffer',
    plain:
      "Le moteur met trop de temps à atteindre sa température. Le thermostat reste probablement ouvert : usure accélérée et consommation en hausse.",
    leads: ['Thermostat bloqué ouvert', 'Capteur de température', 'Niveau de liquide'],
    severity: 'warn',
    blocksRun: false,
  },
  P0131: {
    title: 'Sonde lambda amont : tension trop basse',
    plain: "La sonde qui mesure l'oxygène à la sortie du moteur annonce un mélange très pauvre en permanence.",
    leads: ["Fuite d'air à l'échappement avant la sonde", 'Sonde en fin de vie', 'Faisceau'],
    severity: 'warn',
    blocksRun: true,
  },
  P0132: {
    title: 'Sonde lambda amont : tension trop élevée',
    plain: 'La sonde annonce un mélange très riche en permanence.',
    leads: ['Injecteur qui fuit', 'Pression de carburant trop haute', 'Sonde en fin de vie'],
    severity: 'warn',
    blocksRun: true,
  },
  P0133: {
    title: 'Sonde lambda amont trop lente',
    plain:
      "La sonde réagit, mais trop mollement. Le calculateur ne peut plus réguler finement : la consommation monte et le catalyseur souffre.",
    leads: ['Sonde en fin de vie (usure normale vers 150 000 km)', 'Dépôts de calamine'],
    severity: 'warn',
    blocksRun: false,
  },
  P0134: {
    title: 'Sonde lambda amont : aucun signal',
    plain: 'La sonde ne répond plus du tout.',
    leads: ['Connecteur fondu (fréquent près de la ligne d\'échappement)', 'Faisceau coupé', 'Sonde morte'],
    severity: 'warn',
    blocksRun: true,
  },
  P0171: {
    title: 'Mélange trop pauvre',
    plain:
      "Trop d'air pour l'essence envoyée. À pleine charge, un mélange pauvre fait monter la température de combustion : c'est ce qui perce les pistons.",
    leads: ["Fuite d'air à l'admission (le suspect numéro un sur un moteur suralimenté)", 'Débitmètre encrassé', 'Pression de carburant insuffisante', 'Injecteurs encrassés'],
    severity: 'danger',
    blocksRun: true,
  },
  P0172: {
    title: 'Mélange trop riche',
    plain:
      "Trop d'essence. La consommation grimpe, les bougies se noient et le catalyseur se détruit à petit feu.",
    leads: ['Injecteur qui fuit', 'Pression de carburant trop haute', 'Débitmètre qui surestime', 'Filtre à air colmaté'],
    severity: 'warn',
    blocksRun: true,
  },

  /* ── Injection et allumage ── */
  P0201: { title: 'Circuit injecteur cylindre 1', plain: "Le calculateur ne pilote plus correctement l'injecteur du cylindre 1.", leads: ['Connecteur de l\'injecteur', 'Faisceau', 'Injecteur'], severity: 'warn', blocksRun: true },
  P0202: { title: 'Circuit injecteur cylindre 2', plain: "Le calculateur ne pilote plus correctement l'injecteur du cylindre 2.", leads: ['Connecteur de l\'injecteur', 'Faisceau', 'Injecteur'], severity: 'warn', blocksRun: true },
  P0203: { title: 'Circuit injecteur cylindre 3', plain: "Le calculateur ne pilote plus correctement l'injecteur du cylindre 3.", leads: ['Connecteur de l\'injecteur', 'Faisceau', 'Injecteur'], severity: 'warn', blocksRun: true },
  P0204: { title: 'Circuit injecteur cylindre 4', plain: "Le calculateur ne pilote plus correctement l'injecteur du cylindre 4.", leads: ['Connecteur de l\'injecteur', 'Faisceau', 'Injecteur'], severity: 'warn', blocksRun: true },

  P0234: {
    title: 'Surpression de suralimentation',
    plain:
      "Le turbo pousse plus que prévu. Le calculateur coupe les gaz pour se protéger, et la pression excessive fatigue joints et pistons.",
    leads: ['Vanne de décharge (wastegate) grippée', 'Durite de commande percée', 'Cartographie trop agressive'],
    severity: 'danger',
    blocksRun: true,
  },
  P0299: {
    title: 'Sous-pression de suralimentation',
    plain: "Le turbo ne pousse pas assez. La voiture semble molle, et c'est souvent une simple fuite d'air.",
    leads: ["Fuite dans l'admission (durite, collier, échangeur)", 'Vanne de décharge qui reste ouverte', 'Capteur de pression', 'Turbo fatigué'],
    severity: 'warn',
    blocksRun: false,
  },

  P0300: {
    title: "Ratés d'allumage sur plusieurs cylindres",
    plain:
      "Des explosions n'ont pas lieu. L'essence imbrûlée part dans le catalyseur et le détruit en quelques dizaines de kilomètres.",
    leads: ['Bougies usées (à faire en premier : peu cher)', 'Bobines d\'allumage', 'Qualité du carburant', 'Fuite d\'air à l\'admission', 'Injecteurs'],
    severity: 'danger',
    blocksRun: true,
  },
  P0301: { title: "Ratés d'allumage cylindre 1", plain: "Le cylindre 1 n'explose pas à chaque cycle. À laisser courir, le catalyseur y passe.", leads: ['Bougie du cylindre 1', 'Bobine du cylindre 1 (permuter avec une autre pour confirmer)', 'Injecteur', 'Compression du cylindre'], severity: 'danger', blocksRun: true },
  P0302: { title: "Ratés d'allumage cylindre 2", plain: "Le cylindre 2 n'explose pas à chaque cycle.", leads: ['Bougie du cylindre 2', 'Bobine du cylindre 2', 'Injecteur', 'Compression du cylindre'], severity: 'danger', blocksRun: true },
  P0303: { title: "Ratés d'allumage cylindre 3", plain: "Le cylindre 3 n'explose pas à chaque cycle.", leads: ['Bougie du cylindre 3', 'Bobine du cylindre 3', 'Injecteur', 'Compression du cylindre'], severity: 'danger', blocksRun: true },
  P0304: { title: "Ratés d'allumage cylindre 4", plain: "Le cylindre 4 n'explose pas à chaque cycle.", leads: ['Bougie du cylindre 4', 'Bobine du cylindre 4', 'Injecteur', 'Compression du cylindre'], severity: 'danger', blocksRun: true },

  P0327: {
    title: 'Capteur de cliquetis : signal trop faible',
    plain:
      "Le micro qui écoute les détonations ne fonctionne plus. Le moteur roule sans sa principale protection : c'est précisément ce que Tarmac surveille.",
    leads: ['Connecteur du capteur', 'Couple de serrage du capteur (il doit être serré au couple exact)', 'Capteur à remplacer'],
    severity: 'danger',
    blocksRun: true,
  },
  P0328: {
    title: 'Capteur de cliquetis : signal trop élevé',
    plain: 'Même conséquence que P0327 : la protection anti-cliquetis est hors service.',
    leads: ['Connecteur', 'Serrage du capteur', 'Capteur à remplacer'],
    severity: 'danger',
    blocksRun: true,
  },
  P0335: {
    title: 'Capteur de position vilebrequin',
    plain:
      "Le capteur qui dit au calculateur où en est le moteur dans son cycle est muet ou incohérent. La voiture peut caler sans prévenir.",
    leads: ['Connecteur', 'Capteur à remplacer', 'Jeu ou dent cassée sur la cible'],
    severity: 'danger',
    blocksRun: true,
  },
  P0340: {
    title: "Capteur de position d'arbre à cames",
    plain: 'Le calculateur ne sait plus où sont les soupapes. Démarrage difficile, perte de puissance.',
    leads: ['Connecteur', 'Capteur à remplacer', 'Distribution décalée'],
    severity: 'warn',
    blocksRun: true,
  },

  /* ── Dépollution ── */
  P0420: {
    title: 'Rendement du catalyseur insuffisant',
    plain:
      "Le catalyseur ne traite plus assez les gaz. Souvent la conséquence d'un autre défaut (ratés d'allumage, mélange riche) plutôt qu'une panne du catalyseur lui-même.",
    leads: ['Traiter d\'abord les autres codes présents', 'Sonde lambda aval en fin de vie', 'Fuite à l\'échappement', 'Catalyseur en fin de vie'],
    severity: 'warn',
    blocksRun: false,
  },
  P0430: {
    title: 'Rendement du catalyseur insuffisant (banc 2)',
    plain: 'Même diagnostic que P0420, sur la seconde rangée de cylindres.',
    leads: ['Traiter les autres codes', 'Sonde lambda aval', 'Catalyseur'],
    severity: 'warn',
    blocksRun: false,
  },
  P0442: {
    title: 'Petite fuite du circuit de vapeurs d\'essence',
    plain:
      "Le circuit qui récupère les vapeurs du réservoir n'est pas étanche. Aucune conséquence mécanique, mais le contrôle technique le refusera.",
    leads: ['Bouchon de réservoir mal serré ou joint sec (à vérifier en premier)', 'Durites du circuit', 'Électrovanne de purge'],
    severity: 'info',
    blocksRun: false,
  },
  P0455: {
    title: 'Grosse fuite du circuit de vapeurs d\'essence',
    plain: 'Même circuit que P0442, fuite franche.',
    leads: ['Bouchon de réservoir absent ou cassé', 'Durite débranchée', 'Canister fissuré'],
    severity: 'info',
    blocksRun: false,
  },

  /* ── Ralenti et électricité ── */
  P0506: {
    title: 'Ralenti trop bas',
    plain: 'Le moteur tourne moins vite au ralenti que ce que le calculateur demande.',
    leads: ['Corps de papillon encrassé', 'Fuite d\'air', 'Charge électrique anormale'],
    severity: 'info',
    blocksRun: false,
  },
  P0507: {
    title: 'Ralenti trop haut',
    plain: 'Le moteur tourne plus vite au ralenti que demandé. Presque toujours une prise d\'air.',
    leads: ['Fuite d\'air à l\'admission', 'Corps de papillon', 'Électrovanne de purge bloquée ouverte'],
    severity: 'info',
    blocksRun: false,
  },
  P0562: {
    title: 'Tension de bord trop basse',
    plain:
      "Le réseau électrique est sous-alimenté. L'alternateur ne charge pas assez, ou la batterie ne tient plus.",
    leads: ['Tension de la courroie d\'accessoires', 'Batterie en fin de vie', 'Alternateur', 'Masses oxydées'],
    severity: 'warn',
    blocksRun: true,
  },
  P0563: {
    title: 'Tension de bord trop élevée',
    plain: "Le régulateur de l'alternateur laisse passer trop de tension : les calculateurs n'aiment pas ça du tout.",
    leads: ['Régulateur de l\'alternateur', 'Alternateur à remplacer'],
    severity: 'danger',
    blocksRun: true,
  },

  /* ── Corrections de richesse ── */
  P2177: {
    title: 'Mélange pauvre hors ralenti',
    plain: "En roulant, le moteur manque d'essence par rapport à l'air qu'il avale. Typique d'une prise d'air après le débitmètre.",
    leads: ['Fuite d\'air à l\'admission', 'Débitmètre', 'Pression de carburant'],
    severity: 'warn',
    blocksRun: true,
  },
  P2178: {
    title: 'Mélange riche hors ralenti',
    plain: "En roulant, trop d'essence par rapport à l'air.",
    leads: ['Injecteur qui fuit', 'Pression de carburant trop haute', 'Débitmètre'],
    severity: 'warn',
    blocksRun: true,
  },
  P2187: {
    title: 'Mélange pauvre au ralenti',
    plain: 'Au ralenti seulement, le mélange est trop pauvre. La prise d\'air est le suspect évident.',
    leads: ['Fuite d\'air (test au fumigène chez un pro)', 'Électrovanne de purge', 'Joint de collecteur'],
    severity: 'warn',
    blocksRun: false,
  },
  P2188: {
    title: 'Mélange riche au ralenti',
    plain: 'Au ralenti seulement, le mélange est trop riche.',
    leads: ['Injecteur qui fuit', 'Capteur de pression d\'admission', 'Canister saturé'],
    severity: 'warn',
    blocksRun: false,
  },
  P2096: {
    title: 'Mélange pauvre après catalyseur',
    plain: "La sonde située après le catalyseur voit un mélange pauvre. Souvent une fuite à l'échappement.",
    leads: ['Fuite à l\'échappement', 'Sonde aval', 'Traiter les autres codes d\'abord'],
    severity: 'info',
    blocksRun: false,
  },
  P2097: {
    title: 'Mélange riche après catalyseur',
    plain: 'La sonde après catalyseur voit un mélange riche.',
    leads: ['Traiter les autres codes', 'Sonde aval', 'Catalyseur'],
    severity: 'info',
    blocksRun: false,
  },
};

/**
 * Sous-systèmes définis par la norme, par tranche de numéros.
 * C'est le repli honnête quand le code précis n'est pas documenté.
 */
const SUBSYSTEMS: { from: number; to: number; label: string; hint: string }[] = [
  { from: 0x0, to: 0x99, label: 'mesure et dosage air/essence', hint: "capteurs d'air, de pression, sondes lambda, pression de carburant" },
  { from: 0x100, to: 0x199, label: 'mesure et dosage air/essence', hint: "débitmètre, pression d'admission, températures, richesse" },
  { from: 0x200, to: 0x299, label: 'injecteurs et suralimentation', hint: 'circuits injecteurs, pression de turbo' },
  { from: 0x300, to: 0x399, label: 'allumage et ratés de combustion', hint: 'bougies, bobines, capteurs de régime' },
  { from: 0x400, to: 0x499, label: 'dépollution', hint: 'catalyseur, recyclage des gaz, vapeurs d\'essence' },
  { from: 0x500, to: 0x599, label: 'régime, vitesse et commandes auxiliaires', hint: 'ralenti, capteur de vitesse, régulateur' },
  { from: 0x600, to: 0x699, label: 'calculateur et réseau interne', hint: 'mémoire, communication entre calculateurs' },
  { from: 0x700, to: 0x999, label: 'boîte de vitesses', hint: 'capteurs de boîte, embrayages, pression hydraulique' },
];

/** Dit si un code appartient à la plage générique normalisée. */
export function isGenericCode(code: string): boolean {
  // Par convention, le deuxième caractère vaut 0 pour un code normalisé et 1
  // pour un code propre au constructeur.
  return /^[PCBU]0/.test(code.toUpperCase());
}

/** Traduit un code défaut. Ne renvoie jamais null : au pire, le sous-système. */
export function explainDtc(code: string): DtcInfo {
  const upper = code.toUpperCase();
  const known = GENERIC[upper];
  if (known) return { code: upper, ...known, generic: false };

  const family = upper[0];
  const number = parseInt(upper.slice(1), 16);
  const sub = SUBSYSTEMS.find((s) => number >= s.from && number <= s.to);
  const proprietary = !isGenericCode(upper);

  const familyLabel =
    family === 'P' ? 'moteur et boîte'
    : family === 'C' ? 'châssis (freinage, direction, suspension)'
    : family === 'B' ? 'carrosserie (airbags, confort)'
    : 'réseau de communication entre calculateurs';

  return {
    code: upper,
    title: proprietary ? 'Code constructeur non documenté' : 'Code générique non détaillé',
    plain: proprietary
      ? `Ce code est propre au constructeur : sa signification exacte n'est pas publiée, et Tarmac refuse de la deviner. ` +
        `Ce qu'on sait avec certitude : famille « ${familyLabel} »` +
        (sub ? `, sous-système « ${sub.label} »` : '') + '.'
      : `Ce code est normalisé mais absent de notre dictionnaire. Famille « ${familyLabel} »` +
        (sub ? `, sous-système « ${sub.label} »` : '') + '.',
    leads: [
      sub ? `Regarder du côté : ${sub.hint}` : 'Faire lire le code par un outil spécialisé',
      proprietary
        ? 'Un outil VAG (VCDS, OBDeleven) donnera le libellé exact de ce code'
        : 'Vérifier les autres codes présents : ils sont souvent liés',
    ],
    // On ne décrète pas une gravité qu'on ne connaît pas. Mais tant qu'un code
    // inconnu est actif, on évite de taper dedans : prudence par défaut.
    severity: 'warn',
    blocksRun: true,
    generic: true,
  };
}

/** Nombre de codes documentés précisément. Affiché dans les réglages. */
export const DOCUMENTED_CODE_COUNT = Object.keys(GENERIC).length;
