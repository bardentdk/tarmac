/**
 * icons.tsx — les pictogrammes de l'app mobile (Tarmac/src/ui/icons.tsx),
 * mêmes tracés, en SVG du navigateur. Trait de 1,8 px, bouts arrondis.
 */
import type { ReactNode } from 'react';

export interface IconProps {
  size?: number;
  color?: string;
  width?: number;
}

function Base({ size = 22, color = 'currentColor', width = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => <Base {...p} width={p.width ?? 2}><path d="M15 6l-6 6 6 6" /></Base>;
export const ChevronRight = (p: IconProps) => <Base {...p} width={p.width ?? 2}><path d="M9 6l6 6-6 6" /></Base>;
export const Close = (p: IconProps) => <Base {...p} width={p.width ?? 2.2}><path d="M6 6l12 12M18 6L6 18" /></Base>;
export const Check = (p: IconProps) => <Base {...p} width={p.width ?? 2.4}><path d="M5 12l5 5 9-10" /></Base>;
export const Gear = (p: IconProps) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={3} />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Base>
);
export const Car = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 15l2-6h14l2 6" />
    <path d="M3 15h18v3H3z" />
    <circle cx={7} cy={18} r={1.6} />
    <circle cx={17} cy={18} r={1.6} />
  </Base>
);
export const TabLaunch = (p: IconProps) => <Base {...p}><circle cx={12} cy={12} r={8} /><path d="M12 12l4-3" /></Base>;
export const TabCharts = (p: IconProps) => <Base {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Base>;
export const TabHealth = (p: IconProps) => <Base {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></Base>;
export const TabRanking = (p: IconProps) => <Base {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /></Base>;
export const Share = (p: IconProps) => <Base {...p}><path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" /></Base>;
export const Download = (p: IconProps) => <Base {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Base>;
export const Warning = (p: IconProps) => <Base {...p} width={p.width ?? 2}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></Base>;
export const Shield = (p: IconProps) => (
  <Base {...p} width={p.width ?? 2}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></Base>
);
export const Dongle = (p: IconProps) => <Base {...p}><rect x={5} y={3} width={14} height={18} rx={3} /><path d="M9 8h6M9 12h6" /></Base>;
export const InfoCircle = (p: IconProps) => <Base {...p} width={p.width ?? 2}><circle cx={12} cy={12} r={8} /><path d="M12 8v5" /></Base>;
export const Stopwatch = (p: IconProps) => <Base {...p}><circle cx={12} cy={13} r={8} /><path d="M12 13V9M10 2h4" /></Base>;
export const Magnifier = (p: IconProps) => <Base {...p}><circle cx={11} cy={11} r={7} /><path d="M20 20l-4-4M11 8v3l2 2" /></Base>;
export const Swap = (p: IconProps) => <Base {...p} width={p.width ?? 2}><path d="M4 9h16l-4-4M20 15H4l4 4" /></Base>;
export const Trash = (p: IconProps) => <Base {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /></Base>;
export const Inbox = (p: IconProps) => <Base {...p}><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></Base>;
export const Users = (p: IconProps) => (
  <Base {...p}><circle cx={9} cy={8} r={3.5} /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Base>
);
export const Logout = (p: IconProps) => <Base {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Base>;

/** Le « T » de la marque : le même fichier que l'icône de l'app. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 343 345" fill="none" aria-hidden="true">
      <path d="M76.892 307.568C76.892 328.241 60.133 345 39.4598 345C18.7865 345 2.02759 328.241 2.02759 307.568C2.02759 286.895 18.7865 270.136 39.4598 270.136C60.133 270.136 76.892 286.895 76.892 307.568Z" fill="#C6F432" />
      <path d="M342.037 307.568C342.037 328.241 325.278 345 304.604 345C283.931 345 267.172 328.241 267.172 307.568C267.172 286.895 283.931 270.136 304.604 270.136C325.278 270.136 342.037 286.895 342.037 307.568Z" fill="#C6F432" />
      <path d="M342.037 123.058C342.037 132.104 340.165 140.527 336.422 148.325C332.679 155.812 327.064 159.555 319.577 159.555L65.5064 159.555L65.5064 224.125C65.5064 230.988 62.231 236.447 55.6804 240.502C48.8178 244.245 41.0195 246.117 32.2853 246.117C24.4869 246.117 17.1564 244.401 10.2939 240.97C3.43131 237.538 2.98972e-05 231.924 2.95563e-05 224.125L2.07208e-05 21.9914C2.03799e-05 14.1931 3.4313 8.57825 10.2939 5.14697C17.1564 1.71568 24.4869 1.41884e-05 32.2853 1.38476e-05C41.0194 1.34658e-05 48.8178 1.87163 55.6804 5.61485C62.231 9.35806 65.5063 14.8169 65.5063 21.9914L65.5063 86.562L319.577 86.562C327.064 86.562 332.679 90.4612 336.422 98.2595C340.165 105.746 342.037 114.012 342.037 123.058Z" fill="#C6F432" />
    </svg>
  );
}
