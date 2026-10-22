/**
 * components.tsx — les pièces détachées de l'interface.
 *
 * Même logique qu'une caisse à outils de garage : on ne refabrique pas une clé
 * à chaque fois qu'on ouvre le capot. Chaque écran assemble ces pièces, il n'y
 * a jamais de style « maison » dans un écran.
 *
 * Deux règles de la charte sont codées en dur ici et pas laissées à la bonne
 * volonté de chaque écran :
 *   1. un seul `PrimaryButton` (vert) par écran ;
 *   2. toute cible tactile fait au moins 44 px de haut.
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius, space, tap, motion } from './tokens';
import { spring, ease, PulseDot } from './motion';

/* ────────────────────────── Textes ────────────────────────── */

type TxtProps = TextProps & { style?: StyleProp<TextStyle> };

/** Texte courant. */
export const Txt = ({ style, ...p }: TxtProps) => <Text {...p} style={[st.txt, style]} />;
/** Libellé secondaire gris. */
export const Dim = ({ style, ...p }: TxtProps) => <Text {...p} style={[st.txt, st.dim, style]} />;
/** Titre d'écran. */
export const H1 = ({ style, ...p }: TxtProps) => <Text {...p} style={[st.h1, style]} />;
/** Sur-titre de section, en capitales espacées. */
export const Section = ({ style, ...p }: TxtProps) => <Text {...p} style={[st.section, style]} />;
/**
 * Texte chiffré : Barlow Condensed + chiffres tabulaires. À utiliser pour
 * tout ce qui est une mesure, jamais pour une phrase.
 */
export const Num = ({ style, ...p }: TxtProps) => <Text {...p} style={[st.num, style]} />;

/* ────────────────────────── Structure ────────────────────────── */

/**
 * Cadre d'écran : fond asphalte + encoche respectée. `scroll` quand le contenu
 * peut dépasser ; sinon on garde un View pour éviter un ScrollView inutile
 * (un ScrollView coûte du travail de mesure à chaque image).
 */
export function Screen({
  children,
  scroll = false,
  style,
  edges = ['top', 'bottom'],
  bg = colors.bg,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  bg?: string;
  padded?: boolean;
}) {
  const inner: StyleProp<ViewStyle> = [padded && st.screenPad, style];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={inner}
          showsVerticalScrollIndicator={false}
          // L'utilisateur a souvent des gants ou les doigts gras : on garde
          // un rebond doux et on ne coupe pas le geste au premier pixel.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Carte carbone. `deep` pour une tuile posée dans une carte (effet creusé). */
export function Card({
  children,
  style,
  deep = false,
  tone,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  deep?: boolean;
  /** Teinte d'état : encadre la carte sans jamais se passer de texte. */
  tone?: 'ok' | 'warn' | 'info' | 'danger';
}) {
  const toneStyle: ViewStyle | undefined =
    tone === 'ok' ? { backgroundColor: colors.okBg, borderColor: colors.okBorder, borderWidth: 1 }
    : tone === 'warn' ? { backgroundColor: colors.warnBg, borderColor: colors.warn, borderWidth: 1 }
    : tone === 'info' ? { backgroundColor: colors.surface, borderColor: colors.info, borderWidth: 1 }
    : tone === 'danger' ? { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder, borderWidth: 1 }
    : undefined;

  return <View style={[st.card, deep && st.cardDeep, toneStyle, style]}>{children}</View>;
}

/** Barre de titre avec flèche retour. */
export function Header({
  title,
  subtitle,
  onBack,
  right,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={st.header}>
      {onBack ? <RoundButton onPress={onBack} label="Retour">{null}</RoundButton> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text numberOfLines={1} style={st.headerTitle}>{title}</Text> : null}
        {subtitle ? <Dim style={{ fontSize: 13 }}>{subtitle}</Dim> : null}
      </View>
      {right}
    </View>
  );
}

/* ────────────────────────── Actions ────────────────────────── */

/** Retour haptique léger, mais jamais pendant un run (ça perturbe la conduite). */
function tapFeedback(strong?: boolean) {
  Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Enveloppe pressable qui s'enfonce légèrement. Base de tous les boutons. */
export function Tappable({
  children,
  onPress,
  style,
  disabled,
  label,
  scaleTo = 0.97,
  haptic = true,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  label?: string;
  scaleTo?: number;
  haptic?: boolean;
}) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => { s.value = withTiming(scaleTo, { duration: 90, easing: ease }); }}
      onPressOut={() => { s.value = withSpring(1, spring); }}
      onPress={() => { if (haptic) tapFeedback(); onPress?.(); }}
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * L'action principale : le seul bouton vert de l'écran. Si tu te surprends à
 * en mettre deux, l'un des deux n'est pas l'action principale.
 */
export function PrimaryButton({
  title,
  onPress,
  icon,
  disabled,
  style,
  tone = 'ok',
  busy = false,
}: {
  title: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** `light` : fond craie sur un écran rouge critique. */
  tone?: 'ok' | 'light';
  /** Affiche un halo qui respire pendant une opération en cours. */
  busy?: boolean;
}) {
  const bg = tone === 'ok' ? colors.ok : colors.dangerOn;
  const fg = tone === 'ok' ? colors.bg : colors.dangerBg;

  return (
    <Tappable onPress={onPress} disabled={disabled || busy} label={title} style={[st.primary, { backgroundColor: bg }, style]}>
      <View style={st.row8}>
        {busy ? <PulseDot color={fg} size={10} /> : icon}
        <Text style={[st.primaryTxt, { color: fg }]}>{title}</Text>
      </View>
    </Tappable>
  );
}

/** Action secondaire : contour seul, jamais de fond plein. */
export function GhostButton({
  title,
  onPress,
  style,
  tone,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'danger';
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      label={title}
      style={[st.ghost, tone === 'danger' && { borderColor: colors.dangerBorder }, style]}
    >
      <Text style={st.ghostTxt}>{title}</Text>
    </Tappable>
  );
}

/** Bouton rond de 44 px : retour, fermer, réglages. */
export function RoundButton({
  children,
  onPress,
  label,
  size = tap.min,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  label: string;
  size?: number;
}) {
  return (
    <Tappable
      onPress={onPress}
      label={label}
      scaleTo={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Tappable>
  );
}

/** Pastille filtrante (« Tous », « 0-100 »…). */
export function Chip({
  label,
  active,
  onPress,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'warn';
}) {
  const p = useSharedValue(active ? 1 : 0);
  React.useEffect(() => { p.value = withTiming(active ? 1 : 0, { duration: motion.fast }); }, [active, p]);
  const anim = useAnimatedStyle(() => ({
    backgroundColor: p.value > 0.5 ? colors.text : 'transparent',
    borderColor: p.value > 0.5 ? colors.text : tone === 'warn' ? colors.warn : colors.border2,
  }));

  return (
    <Tappable onPress={onPress} label={label} scaleTo={0.94} style={{ borderRadius: radius.pill }}>
      <Animated.View style={[st.chip, anim]}>
        <Text style={[st.chipTxt, active && { color: colors.bg, fontFamily: fonts.bodyBold }, !active && tone === 'warn' && { color: colors.warnText }]}>
          {label}
        </Text>
      </Animated.View>
    </Tappable>
  );
}

/**
 * Sélecteur segmenté (« Origine / Stage 1 / Stage 2 / Autre »).
 * Le curseur blanc glisse d'un segment à l'autre plutôt que de clignoter :
 * on voit d'où l'on vient.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const [w, setW] = React.useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const seg = w > 0 ? (w - 8) / options.length : 0;

  React.useEffect(() => { x.value = withSpring(index * seg, spring); }, [index, seg, x]);
  const cursor = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: seg }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={st.segment}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 ? <Animated.View style={[st.segCursor, cursor]} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => { tapFeedback(); onChange(o.value); }}
            style={st.segItem}
          >
            <Text style={[st.segTxt, on && { color: colors.bg, fontFamily: fonts.bodyBold }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Interrupteur. Le bouton glisse, la piste change de couleur en même temps. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const p = useSharedValue(value ? 1 : 0);
  React.useEffect(() => { p.value = withSpring(value ? 1 : 0, spring); }, [value, p]);

  const track = useAnimatedStyle(() => ({ backgroundColor: p.value > 0.5 ? colors.ok : colors.border2 }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * 20 }],
    backgroundColor: p.value > 0.5 ? colors.bg : colors.text2,
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => { tapFeedback(); onChange(!value); }}
    >
      <Animated.View style={[st.swTrack, track]}>
        <Animated.View style={[st.swKnob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

/** Champ de saisie. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Dim style={st.lbl}>{label}</Dim>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text2}
        keyboardType={keyboardType}
        autoCapitalize="none"
        accessibilityLabel={label}
      />
      {hint ? <Dim style={{ fontSize: 12 }}>{hint}</Dim> : null}
    </View>
  );
}

/** Ligne de liste séparée par un filet, comme dans les réglages iOS. */
export function Row({
  children,
  onPress,
  first = false,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[st.row, first && { borderTopWidth: 0 }, style]}>{children}</View>;
  return onPress ? <Tappable onPress={onPress} scaleTo={0.99} haptic={false}>{content}</Tappable> : content;
}

/** Pastille d'état + texte. La couleur n'est jamais seule porteuse du sens. */
export function StatusPill({
  text,
  tone = 'ok',
  pulsing = false,
}: {
  text: string;
  tone?: 'ok' | 'warn' | 'info' | 'danger' | 'idle';
  pulsing?: boolean;
}) {
  const map = {
    ok: [colors.okBg, colors.ok],
    warn: [colors.warnBg, colors.warnText],
    info: ['#101A26', colors.info],
    danger: [colors.dangerBg, colors.dangerRun],
    idle: [colors.surface, colors.text2],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[st.pill, { backgroundColor: bg }]}>
      <PulseDot color={fg} size={8} active={pulsing} />
      <Text style={[st.pillTxt, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** Quatre barres de signal, remplies selon le RSSI. */
export function SignalBars({ level, color = colors.ok }: { level: 0 | 1 | 2 | 3 | 4; color?: string }) {
  return (
    <View accessibilityLabel={`Signal ${level} sur 4`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 }}>
      {[6, 10, 14, 18].map((h, i) => (
        <View key={h} style={{ width: 4, height: h, borderRadius: 1, backgroundColor: i < level ? color : colors.trackDim }} />
      ))}
    </View>
  );
}

/** Puce colorée d'une checklist. */
export const Dot = ({ color }: { color: string }) => (
  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
);

/* ────────────────────────── Styles ────────────────────────── */

const st = StyleSheet.create({
  txt: { color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  dim: { color: colors.text2 },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  headerTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 24 },
  section: {
    color: colors.text2,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  num: { color: colors.text, fontFamily: fonts.numBold, fontVariant: ['tabular-nums'] },

  screenPad: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  cardDeep: { backgroundColor: colors.surfaceDeep, borderRadius: 14, borderWidth: 0, padding: space.md },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  primary: {
    minHeight: tap.main,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primaryTxt: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: 0.3 },

  ghost: {
    minHeight: tap.row,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  ghostTxt: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },

  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTxt: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 },

  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4 },
  segCursor: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.sm, backgroundColor: colors.text },
  segItem: { flex: 1, minHeight: tap.min, alignItems: 'center', justifyContent: 'center' },
  segTxt: { color: colors.text2, fontFamily: fonts.bodySemi, fontSize: 14 },

  swTrack: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  swKnob: { width: 24, height: 24, borderRadius: 12 },

  lbl: { fontFamily: fonts.bodySemi, fontSize: 13 },
  input: {
    minHeight: tap.row,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 14,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: tap.row,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  pillTxt: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5 },

  row8: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

export const uiStyles = st;
