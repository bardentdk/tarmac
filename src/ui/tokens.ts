/**
 * tokens.ts — la boîte à peinture de Tarmac.
 *
 * Un seul endroit décide des couleurs, des tailles et des arrondis. Si demain
 * on change le vert, on le change ici et toute l'app suit. Interdiction
 * d'écrire une couleur « en dur » dans un écran.
 *
 * Métaphore de la charte : on est au bord d'une piste la nuit. Le fond est de
 * l'asphalte, les cartes sont en carbone, et une seule chose est fluo : le feu
 * vert du sapin de départ. C'est pour ça qu'il n'y a qu'UN bouton vert par écran.
 */

export const colors = {
  bg: '#0E0F11', // Asphalte : fond d'écran
  bgNav: '#121316', // Fond de la barre d'onglets, un cheveu plus clair
  surface: '#17191D', // Carbone : cartes
  surfaceDeep: '#0E0F11', // Tuile posée DANS une carte (effet creusé)
  border: '#262930', // Graphite
  border2: '#33363E',
  divider: '#23262C', // Filet entre deux lignes de liste
  track: '#1F2227', // Rail vide d'une barre de progression
  trackDim: '#2A2D33',
  text: '#F2F2F0', // Craie
  text2: '#A3A7AE', // Gris piste : libellés secondaires
  text3: '#D6D8DC', // Texte de paragraphe dans un encadré coloré
  ok: '#C6F432', // Feu vert : OK, prêt, action principale
  okBg: '#1A2310',
  okBorder: '#4A5C1C',
  okDim: '#3A4A14', // Barre d'histogramme « dans la norme »
  okBright: '#E2FF7A',
  warn: '#FF8A3D', // Signal : attention
  warnText: '#FF9F5C',
  warnBg: '#2A1A0E',
  warnZone: '#3A2614', // Zone surlignée dans un graphique
  info: '#5AA9FF', // Télémétrie
  danger: '#FF4D3D', // Critique : danger moteur uniquement
  dangerBg: '#2A0F0C',
  dangerSurface: '#3D1712',
  dangerBorder: '#6B2A22',
  dangerText: '#F2C9C3',
  dangerTextStrong: '#FF9A8F',
  dangerOn: '#FFF4F2', // Texte sur fond rouge critique
  dangerRun: '#FF7A6B',
  neutralBar: '#5C6068', // Série « avant / origine » dans un comparatif
} as const;

/**
 * Noms de familles chargées par `useTarmacFonts`. Barlow pour lire,
 * Barlow Condensed pour les chiffres (plus étroit : un gros chrono tient
 * dans la largeur de l'écran) avec chiffres tabulaires pour que « 1 » et
 * « 8 » occupent la même place et que le chrono ne tremble pas.
 */
export const fonts = {
  body: 'Barlow',
  bodyMedium: 'BarlowMedium',
  bodySemi: 'BarlowSemiBold',
  bodyBold: 'BarlowBold',
  num: 'BarlowCondensedSemiBold',
  numBold: 'BarlowCondensedBold',
  numBlack: 'BarlowCondensedExtraBold',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 24, pill: 999 } as const;

/** Cibles tactiles : 44 px minimum partout, 60 px pour l'action principale. */
export const tap = { min: 44, main: 60, row: 52 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 28 } as const;

/**
 * Durées d'animation. Volontairement courtes : une app qu'on regarde pied au
 * plancher ne doit jamais « attendre » son interface.
 */
export const motion = {
  fast: 120,
  base: 220,
  slow: 420,
  /** Rythme du halo qui respire (connexion en cours, enregistrement). */
  pulse: 1100,
  /** Lissage des valeurs live : assez long pour ne pas scintiller à 20 Hz. */
  value: 180,
} as const;

/** Police + variante tabulaire, à étaler dans un style de texte chiffré. */
export const numStyle = {
  fontFamily: fonts.numBold,
  fontVariant: ['tabular-nums' as const],
};
