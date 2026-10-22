/**
 * icons.tsx — le jeu de pictogrammes de Tarmac.
 *
 * Tous les icônes sont dessinés au trait (pas de remplissage), sur une grille
 * de 24×24, avec la même épaisseur de ligne. C'est ce qui leur donne l'air
 * d'appartenir à la même famille, comme les panneaux d'une même signalétique.
 *
 * On passe par react-native-svg plutôt que par une police d'icônes : on garde
 * la couleur `currentColor` sous contrôle, et rien à charger au démarrage.
 */
import React from 'react';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';
import { colors } from './tokens';

export interface IconProps {
  size?: number;
  color?: string;
  /** Épaisseur du trait. Les petits icônes ont besoin d'un trait plus épais. */
  width?: number;
}

/** Enveloppe commune : évite de répéter viewBox et les réglages de trait. */
function Base({ size = 22, color = colors.text, width = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export const ChevronLeft = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M15 6l-6 6 6 6" /></Base>
);

export const ChevronDown = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M6 9l6 6 6-6" /></Base>
);

export const Close = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2.2}><Path d="M6 6l12 12M18 6L6 18" /></Base>
);

export const Check = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2.4}><Path d="M5 12l5 5 9-10" /></Base>
);

export const Gear = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Base>
);

/** Voiture vue de face, très simplifiée : sert de pastille « véhicule ». */
export const Car = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3 15l2-6h14l2 6" />
    <Path d="M3 15h18v3H3z" />
    <Circle cx={7} cy={18} r={1.6} />
    <Circle cx={17} cy={18} r={1.6} />
  </Base>
);

/** Onglet « Lancer » : un chronomètre. */
export const TabLaunch = (p: IconProps) => (
  <Base {...p}><Circle cx={12} cy={12} r={8} /><Path d="M12 12l4-3" /></Base>
);

/** Onglet « Analyses » : un histogramme. */
export const TabCharts = (p: IconProps) => (
  <Base {...p}><Path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Base>
);

/** Onglet « Santé » : un tracé d'électrocardiogramme. */
export const TabHealth = (p: IconProps) => (
  <Base {...p}><Path d="M3 12h4l2-5 4 10 2-5h6" /></Base>
);

/** Onglet « Classement » : une coupe. */
export const TabRanking = (p: IconProps) => (
  <Base {...p}><Path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /></Base>
);

export const Share = (p: IconProps) => (
  <Base {...p}><Path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" /></Base>
);

/** Triangle d'alerte. Toujours accompagné d'un texte : jamais la couleur seule. */
export const Warning = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M12 3l10 18H2z" /><Path d="M12 10v5M12 18v.01" /></Base>
);

/** Ampoule : un conseil, pas une alerte. */
export const Bulb = (p: IconProps) => (
  <Base {...p}><Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></Base>
);

/** Bouclier coché : mesure certifiée GPS + OBD. */
export const Shield = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><Path d="M8.5 12l2.5 2.5 4.5-5" /></Base>
);

/** Thermomètre + traits de chaleur : la correction météo. */
export const Weather = (p: IconProps) => (
  <Base {...p}><Path d="M12 3v10" /><Circle cx={12} cy={17} r={4} /><Path d="M16 5h4M16 9h3" /></Base>
);

/** Le boîtier OBD lui-même. */
export const Dongle = (p: IconProps) => (
  <Base {...p}><Rect x={5} y={3} width={14} height={18} rx={3} /><Path d="M9 8h6M9 12h6" /></Base>
);

export const InfoCircle = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Circle cx={12} cy={12} r={8} /><Path d="M12 8v5" /></Base>
);

export const Stopwatch = (p: IconProps) => (
  <Base {...p}><Circle cx={12} cy={13} r={8} /><Path d="M12 13V9M10 2h4" /></Base>
);

export const Magnifier = (p: IconProps) => (
  <Base {...p}><Circle cx={11} cy={11} r={7} /><Path d="M20 20l-4-4M11 8v3l2 2" /></Base>
);

/** Triangle « lecture » plein : armer le run. */
export const Play = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2.2}><Path d="M6 4l14 8-14 8z" /></Base>
);

/** Deux flèches opposées : comparer avant / après. */
export const Swap = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M4 9h16l-4-4M20 15H4l4 4" /></Base>
);

export const Bluetooth = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M7 7l10 10M7 17L17 7M12 2v20l5-5-5-4 5-4-5-5" /></Base>
);

export const Wifi = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M2 8a15 15 0 0 1 20 0M5.5 11.5a10 10 0 0 1 13 0M9 15a5 5 0 0 1 6 0M12 19v.01" /></Base>
);

export const Flask = (p: IconProps) => (
  <Base {...p}><Path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><Path d="M7 15h10" /></Base>
);

export const Terminal = (p: IconProps) => (
  <Base {...p}><Rect x={3} y={4} width={18} height={16} rx={3} /><Path d="M7 10l3 2-3 2M13 14h4" /></Base>
);

export const Refresh = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><Path d="M20 12a8 8 0 1 1-2.3-5.6" /><Path d="M20 4v4h-4" /></Base>
);

export const Trash = (p: IconProps) => (
  <Base {...p}><Path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /></Base>
);

/**
 * Illustration de la prise OBD à 16 broches, avec les broches CAN et
 * l'alimentation mises en couleur. Elle sert à l'utilisateur qui cherche la
 * prise sous son volant pour la première fois.
 */
export function ObdSocket({ width = 220, height = 110 }: { width?: number; height?: number }) {
  const topPins = [50, 66, 82, 98, 114, 130, 146, 162];
  const bottomPins = [58, 74, 90, 106, 122, 138, 154, 170];
  return (
    <Svg width={width} height={height} viewBox="0 0 220 110">
      <Path d="M20 20h180l-14 70H34z" fill={colors.bg} stroke={colors.border2} strokeWidth={2} />
      <G fill={colors.border2}>
        {topPins.map((x) => <Circle key={`t${x}`} cx={x} cy={42} r={5} />)}
        {bottomPins.map((x) => <Circle key={`b${x}`} cx={x} cy={68} r={5} />)}
      </G>
      {/* Broches 6 et 14 : CAN High / CAN Low. C'est par là que tout passe. */}
      <Circle cx={130} cy={42} r={6} fill={colors.ok} />
      <Circle cx={138} cy={68} r={6} fill={colors.ok} />
      {/* Broche 16 : le + batterie permanent qui alimente le boîtier. */}
      <Circle cx={170} cy={68} r={6} fill={colors.info} />
    </Svg>
  );
}

/** Logo Tarmac : un T dont la barre verticale descend vers deux feux de départ. */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={12} fill={colors.ok} />
      <Path d="M12 14h24M24 14v22" stroke={colors.bg} strokeWidth={5} strokeLinecap="round" />
      <Circle cx={36} cy={26} r={2.6} fill={colors.bg} />
      <Circle cx={36} cy={33} r={2.6} fill={colors.bg} />
    </Svg>
  );
}
