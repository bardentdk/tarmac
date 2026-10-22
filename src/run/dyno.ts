/**
 * dyno.ts — le banc de puissance virtuel.
 *
 * Un banc de puissance mesure la force du moteur en la freinant. On ne peut
 * pas faire ça avec un téléphone. Mais on peut faire l'inverse : regarder à
 * quelle vitesse la voiture accélère, et en déduire la force qui la pousse.
 *
 * C'est la deuxième loi de Newton, celle de la classe de seconde :
 *
 *     force = masse × accélération
 *
 * On connaît la masse (l'utilisateur l'a saisie). On mesure l'accélération
 * (dérivée de la vitesse GPS). Il reste à ajouter les forces qui FREINENT la
 * voiture et que le moteur doit vaincre en plus : la résistance de l'air et le
 * roulement. Puis on remonte de la roue au moteur par les rapports de boîte.
 *
 * Précision réelle : environ ±5 %, et elle dépend surtout de la justesse de la
 * masse saisie. L'écran le dit à l'utilisateur, parce qu'un chiffre sans sa
 * marge d'erreur est un mensonge.
 */
import type { RunSample } from './types';
import { IBIZA_STAGE1, powerHp, type VehicleSpec } from '@/transport/vehicleSim';

export interface DynoPoint {
  rpm: number;
  /** Puissance à la roue ramenée au vilebrequin (ch). */
  powerHp: number;
  /** Couple moteur (Nm). */
  torqueNm: number;
}

export interface DynoResult {
  points: DynoPoint[];
  peakPower: { hp: number; rpm: number };
  peakTorque: { nm: number; rpm: number };
  /** Rapport utilisé pour la mesure. */
  gear: number;
  /** Marge d'erreur estimée (%). */
  accuracyPct: number;
  /** Explication de ce qui limite la précision, à afficher. */
  caveat: string;
}

/**
 * Lisse une série par moyenne glissante. Indispensable : la dérivée d'un
 * signal GPS bruité est inutilisable telle quelle (un bruit de 0,3 km/h sur
 * 40 ms donne 20 ch de variation).
 */
function smooth(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

/**
 * Calcule les courbes depuis une montée en régime pied au plancher.
 *
 * @param samples  Les échantillons du run (vitesse GPS + régime).
 * @param massKg   Masse en ordre de marche, conducteur inclus.
 * @param spec     Caractéristiques mécaniques (aéro, pneus, rapports).
 */
export function computeDyno(samples: RunSample[], massKg: number, spec: VehicleSpec = IBIZA_STAGE1): DynoResult | null {
  // On ne garde que la partie exploitable : pied au plancher, un seul rapport,
  // régime en montée. Mesurer pendant un changement de rapport n'a aucun sens.
  const usable = samples.filter(
    (s) => s.rpm !== null && s.rpm > 1800 && s.speedKph > 20 && (s.throttlePct ?? 100) > 80 && s.gear !== null,
  );
  if (usable.length < 12) return null;

  // Le rapport le plus représenté : c'est celui sur lequel la mesure a été faite.
  const counts = new Map<number, number>();
  for (const s of usable) counts.set(s.gear!, (counts.get(s.gear!) ?? 0) + 1);
  const gear = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const pull = usable.filter((s) => s.gear === gear);
  if (pull.length < 10) return null;

  const times = pull.map((s) => s.ms / 1000);
  const speedsMs = smooth(pull.map((s) => s.speedKph / 3.6), 5);
  const rpms = smooth(pull.map((s) => s.rpm!), 3);

  const ratio = spec.gearRatios[gear - 1] * (spec.finalDrives[gear - 1] ?? spec.finalDrives[0]);
  const points: DynoPoint[] = [];

  for (let i = 1; i < pull.length - 1; i++) {
    const dt = times[i + 1] - times[i - 1];
    if (dt <= 0) continue;

    // Accélération par différence centrée : moins sensible au bruit qu'une
    // différence avant, et c'est gratuit.
    const accel = (speedsMs[i + 1] - speedsMs[i - 1]) / dt;
    if (accel <= 0) continue;

    const v = speedsMs[i];

    // Force qui pousse réellement la voiture.
    const fInertia = massKg * accel;
    // Les masses tournantes (roues, volant moteur, embrayage) doivent elles
    // aussi être accélérées. On les compte comme un supplément de masse de
    // 6 % — valeur usuelle pour une traction à boîte double embrayage.
    const fRotational = massKg * 0.06 * accel;
    // Résistance de l'air : proportionnelle au CARRÉ de la vitesse. À 150 km/h
    // elle représente déjà la moitié de la puissance consommée.
    const fDrag = 0.5 * 1.2 * spec.cdA * v * v;
    // Résistance au roulement des pneus.
    const fRoll = spec.crr * massKg * 9.81;

    const fTotal = fInertia + fRotational + fDrag + fRoll;

    // De la roue au moteur : on remonte par le rayon de roue, les rapports, et
    // le rendement de la transmission.
    const wheelNm = fTotal * spec.wheelRadiusM;
    const engineNm = wheelNm / (ratio * spec.drivelineEff);
    const rpm = rpms[i];
    const hp = powerHp(engineNm, rpm);

    if (engineNm > 0 && engineNm < 900 && hp > 0 && hp < 1200) {
      points.push({ rpm: Math.round(rpm), powerHp: Math.round(hp), torqueNm: Math.round(engineNm) });
    }
  }

  if (points.length < 6) return null;

  // Regroupement par paliers de 250 tr/min : lisse les derniers soubresauts et
  // donne une courbe lisible.
  const buckets = new Map<number, DynoPoint[]>();
  for (const p of points) {
    const k = Math.round(p.rpm / 250) * 250;
    const list = buckets.get(k) ?? [];
    list.push(p);
    buckets.set(k, list);
  }
  const curve: DynoPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rpm, list]) => ({
      rpm,
      powerHp: Math.round(list.reduce((a, p) => a + p.powerHp, 0) / list.length),
      torqueNm: Math.round(list.reduce((a, p) => a + p.torqueNm, 0) / list.length),
    }));

  const peakP = curve.reduce((a, p) => (p.powerHp > a.powerHp ? p : a), curve[0]);
  const peakT = curve.reduce((a, p) => (p.torqueNm > a.torqueNm ? p : a), curve[0]);

  return {
    points: curve,
    peakPower: { hp: peakP.powerHp, rpm: peakP.rpm },
    peakTorque: { nm: peakT.torqueNm, rpm: peakT.rpm },
    gear,
    accuracyPct: 5,
    caveat:
      'La précision dépend surtout du poids saisi et de la planéité de la piste. ' +
      'Une erreur de 50 kg décale la puissance d\'environ 4 %.',
  };
}

/** Transforme un résultat en séries pour le graphique. */
export function dynoSeries(result: DynoResult) {
  return {
    power: result.points.map((p) => ({ t: p.rpm, v: p.powerHp })),
    torque: result.points.map((p) => ({ t: p.rpm, v: p.torqueNm })),
    rpmTicks: [
      result.points[0].rpm,
      Math.round((result.points[0].rpm + result.points.at(-1)!.rpm) / 2 / 500) * 500,
      result.points.at(-1)!.rpm,
    ],
  };
}

/**
 * Courbe de puissance théorique d'origine, pour la superposer en pointillé.
 * Elle vient du modèle du véhicule, pas d'une mesure : c'est une référence
 * visuelle, et l'écran le présente comme telle.
 */
export function stockPowerCurve(spec: VehicleSpec, from = 2000, to = 6500): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let rpm = from; rpm <= to; rpm += 250) {
    const nm = spec.torqueCurve.reduce((best, _p, i, arr) => {
      if (i === 0) return best;
      const a = arr[i - 1];
      const b = arr[i];
      if (rpm >= a.rpm && rpm <= b.rpm) {
        const f = (rpm - a.rpm) / (b.rpm - a.rpm);
        return a.nm + f * (b.nm - a.nm);
      }
      return best;
    }, 0);
    out.push({ t: rpm, v: Math.round(powerHp(nm, rpm)) });
  }
  return out;
}
