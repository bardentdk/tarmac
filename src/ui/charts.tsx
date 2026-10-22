/**
 * charts.tsx — les graphiques de Tarmac.
 *
 * Pourquoi des SVG faits main plutôt qu'une lib de charts ? Parce qu'on affiche
 * toujours la même chose : deux ou trois courbes temporelles sur fond sombre,
 * avec des repères de passage de rapport. Une lib générique coûterait 200 ko et
 * se battrait avec notre charte. Ici on maîtrise tout, et le tracé s'anime.
 *
 * L'animation de tracé utilise l'astuce du pointillé : on met un tiret aussi
 * long que la courbe, et on fait glisser son décalage de 100 % à 0 %. Visuellement
 * la ligne « se dessine », comme un traceur sur papier millimétré.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, fonts, radius, space } from './tokens';
import { ease } from './motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface Series {
  /** Points déjà ramenés dans l'espace du graphique (pixels SVG). */
  points: { x: number; y: number }[];
  color: string;
  width?: number;
  /** Trait pointillé : la référence (record, courbe d'origine). */
  dashed?: boolean;
  label: string;
}

/** Transforme une liste de points en commande SVG lissée (courbe de Bézier). */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return `M${pts.map((p) => `${p.x} ${p.y}`).join(' L')}`;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const n = pts[i + 1];
    // Point de contrôle à mi-chemin : lissage simple, sans dépassement.
    const cx = (p.x + n.x) / 2;
    d += ` Q${p.x} ${p.y} ${cx} ${(p.y + n.y) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x} ${last.y}`;
  return d;
}

/** Projette des valeurs métier dans le rectangle de tracé. */
export function project(
  values: { t: number; v: number }[],
  box: { x: number; y: number; w: number; h: number },
  domain: { t0: number; t1: number; v0: number; v1: number },
): { x: number; y: number }[] {
  const dt = domain.t1 - domain.t0 || 1;
  const dv = domain.v1 - domain.v0 || 1;
  return values.map((p) => ({
    x: box.x + ((p.t - domain.t0) / dt) * box.w,
    y: box.y + box.h - ((p.v - domain.v0) / dv) * box.h,
  }));
}

/** Une courbe qui se dessine toute seule à l'affichage. */
function DrawnPath({ d, color, width = 3, dashed, delay = 0 }: { d: string; color: string; width?: number; dashed?: boolean; delay?: number }) {
  // Longueur réelle inconnue côté JS : on prend une borne large, le dépassement
  // est invisible puisque le décalage finit à 0.
  const LEN = 2000;
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withTiming(1, { duration: 900, easing: ease })); }, [d, delay, p]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashed ? 0 : LEN * (1 - p.value),
    opacity: dashed ? p.value : 1,
  }));

  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dashed ? '5 5' : `${LEN} ${LEN}`}
      animatedProps={animatedProps}
    />
  );
}

/**
 * Graphique temporel du run : la courbe du run en vert, le record en pointillé,
 * les passages de rapport en bleu, et les zones où le calculateur a retiré de
 * l'avance surlignées en orange.
 */
export function RunChart({
  width = 326,
  height = 230,
  run,
  reference,
  yTicks,
  xTicks,
  shifts = [],
  retardZones = [],
  unit,
}: {
  width?: number;
  height?: number;
  run: { t: number; v: number }[];
  reference?: { t: number; v: number }[];
  yTicks: number[];
  xTicks: number[];
  /** Instants des passages de rapport, en secondes, avec leur libellé. */
  shifts?: { t: number; label: string }[];
  /** Plages temporelles où l'avance a été réduite. */
  retardZones?: { from: number; to: number }[];
  unit?: string;
}) {
  const box = { x: 30, y: 20, w: width - 36, h: height - 40 };
  const all = [...run, ...(reference ?? [])];
  const domain = useMemo(() => {
    const t1 = Math.max(1, ...all.map((p) => p.t));
    const v1 = Math.max(1, ...all.map((p) => p.v));
    return { t0: 0, t1, v0: Math.min(0, ...all.map((p) => p.v)), v1: v1 * 1.05 };
  }, [all]);

  const toX = (t: number) => box.x + ((t - domain.t0) / (domain.t1 - domain.t0 || 1)) * box.w;
  const toY = (v: number) => box.y + box.h - ((v - domain.v0) / (domain.v1 - domain.v0 || 1)) * box.h;

  const runD = smoothPath(project(run, box, domain));
  const refD = reference?.length ? smoothPath(project(reference, box, domain)) : null;

  return (
    <View style={ch.wrap}>
      <Svg width={width} height={height}>
        {/* Grille horizontale : des repères, pas un quadrillage de cahier. */}
        <G stroke={colors.border} strokeWidth={1}>
          {yTicks.map((v) => <Line key={v} x1={box.x} y1={toY(v)} x2={box.x + box.w} y2={toY(v)} />)}
        </G>

        {/* Zones de retard d'avance, derrière les courbes. */}
        {retardZones.map((z, i) => (
          <Rect key={i} x={toX(z.from)} y={box.y} width={Math.max(2, toX(z.to) - toX(z.from))} height={box.h} fill={colors.warn} opacity={0.12} />
        ))}

        <G fill={colors.text2} fontSize={11} fontFamily={fonts.body}>
          {yTicks.map((v) => <SvgText key={v} x={0} y={toY(v) + 4}>{String(v)}</SvgText>)}
          {xTicks.map((t, i) => <SvgText key={t} x={toX(t) - (i === 0 ? 0 : 4)} y={height - 4}>{i === 0 ? `${t} s` : String(t)}</SvgText>)}
        </G>

        {refD ? <DrawnPath d={refD} color={colors.text2} width={2} dashed /> : null}
        <DrawnPath d={runD} color={colors.ok} width={3} delay={120} />

        {/* Repères de passage de rapport. */}
        <G stroke={colors.info} strokeWidth={1.5} strokeDasharray="2 3">
          {shifts.map((s) => <Line key={s.label} x1={toX(s.t)} y1={box.y} x2={toX(s.t)} y2={box.y + box.h} />)}
        </G>
        <G fill={colors.info} fontSize={11} fontFamily={fonts.bodySemi}>
          {shifts.map((s) => <SvgText key={s.label} x={toX(s.t) + 4} y={box.y + 14}>{s.label}</SvgText>)}
        </G>
      </Svg>
      <Legend
        items={[
          { label: 'Ce run' + (unit ? ` (${unit})` : ''), color: colors.ok },
          ...(refD ? [{ label: 'Record', color: colors.text2, dashed: true }] : []),
          ...(retardZones.length ? [{ label: 'Avance réduite', color: colors.warnZone, block: true }] : []),
        ]}
      />
    </View>
  );
}

/** Courbes de puissance et de couple du dyno virtuel. */
export function DynoChart({
  width = 326,
  height = 210,
  power,
  torque,
  stockPower,
  rpmTicks,
}: {
  width?: number;
  height?: number;
  power: { t: number; v: number }[];
  torque: { t: number; v: number }[];
  stockPower?: { t: number; v: number }[];
  rpmTicks: number[];
}) {
  const box = { x: 28, y: 20, w: width - 36, h: height - 46 };
  const rpm0 = rpmTicks[0];
  const rpm1 = rpmTicks[rpmTicks.length - 1];
  const pMax = Math.max(1, ...power.map((p) => p.v), ...(stockPower ?? []).map((p) => p.v)) * 1.1;
  const tMax = Math.max(1, ...torque.map((p) => p.v)) * 1.1;

  const pD = smoothPath(project(power, box, { t0: rpm0, t1: rpm1, v0: 0, v1: pMax }));
  const tD = smoothPath(project(torque, box, { t0: rpm0, t1: rpm1, v0: 0, v1: tMax }));
  const sD = stockPower?.length ? smoothPath(project(stockPower, box, { t0: rpm0, t1: rpm1, v0: 0, v1: pMax })) : null;

  return (
    <View style={ch.wrap}>
      <Svg width={width} height={height}>
        <G stroke={colors.border} strokeWidth={1}>
          {[0.2, 0.45, 0.7, 0.95].map((f) => <Line key={f} x1={box.x} y1={box.y + box.h * f} x2={box.x + box.w} y2={box.y + box.h * f} />)}
        </G>
        <G fill={colors.text2} fontSize={11} fontFamily={fonts.body}>
          {rpmTicks.map((r, i) => (
            <SvgText key={r} x={box.x + ((r - rpm0) / (rpm1 - rpm0)) * box.w - (i === 0 ? 0 : 14)} y={height - 6}>{String(r)}</SvgText>
          ))}
        </G>
        {sD ? <DrawnPath d={sD} color={colors.neutralBar} width={2} dashed /> : null}
        <DrawnPath d={tD} color={colors.info} width={3} delay={80} />
        <DrawnPath d={pD} color={colors.ok} width={3} delay={160} />
      </Svg>
      <Legend
        items={[
          { label: 'Puissance', color: colors.ok },
          { label: 'Couple', color: colors.info },
          ...(sD ? [{ label: "Puissance d'origine", color: colors.neutralBar, dashed: true }] : []),
        ]}
      />
    </View>
  );
}

/**
 * Histogramme de tendance (temps 0-100 corrigés sur 8 semaines).
 * Les barres poussent du bas vers le haut à l'affichage : on lit la tendance
 * avant même d'avoir lu la légende.
 */
export function TrendBars({
  values,
  warnFrom,
  height = 90,
  label,
}: {
  values: number[];
  /** Index à partir duquel les barres passent en orange (dégradation). */
  warnFrom?: number;
  height?: number;
  label: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height }}>
      {values.map((v, i) => (
        <GrowBar key={i} ratio={v / max} height={height} delay={i * 55} color={warnFrom !== undefined && i >= warnFrom ? colors.warn : colors.okDim} />
      ))}
    </View>
  );
}

function GrowBar({ ratio, height, delay, color }: { ratio: number; height: number; delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withTiming(ratio, { duration: 520, easing: ease })); }, [ratio, delay, p]);
  // On anime la hauteur d'une View plutôt qu'un Rect SVG : moins de pont natif
  // traversé, et le résultat est identique pour une barre rectangulaire.
  const bar = useAnimatedStyle(() => ({ height: Math.max(3, p.value * height) }));
  return (
    <View style={{ flex: 1, height, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ borderRadius: 4, backgroundColor: color }, bar]} />
    </View>
  );
}

/** Légende horizontale commune à tous les graphiques. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; block?: boolean }[] }) {
  return (
    <View style={ch.legend}>
      {items.map((it) => (
        <View key={it.label} style={ch.legendItem}>
          {it.block ? (
            <View style={{ width: 12, height: 12, backgroundColor: it.color }} />
          ) : it.dashed ? (
            <View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: it.color }} />
          ) : (
            <View style={{ width: 16, height: 3, backgroundColor: it.color }} />
          )}
          <Text style={ch.legendTxt}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Petite courbe sans axes, posée dans une tuile. Sert à montrer la dernière
 * minute d'une mesure live sans voler de place.
 */
export function Sparkline({
  values,
  width = 90,
  height = 28,
  color = colors.ok,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - ((v - min) / span) * (height - 2) - 1,
  }));
  return (
    <Svg width={width} height={height}>
      <Path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
    </Svg>
  );
}

const ch = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.md, paddingTop: 14, paddingBottom: space.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingTop: space.xs, paddingHorizontal: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTxt: { color: colors.text2, fontFamily: fonts.body, fontSize: 12 },
});
