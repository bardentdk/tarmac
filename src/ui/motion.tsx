/**
 * motion.tsx — la boîte à ressorts.
 *
 * Toutes les animations de l'app partent d'ici, pour une raison simple : une
 * app de chrono doit avoir un « toucher » cohérent. Si un bouton rebondit
 * comme un trampoline et un autre glisse comme un tiroir, l'app paraît
 * bricolée.
 *
 * Règle de performance : on anime sur le thread graphique (Reanimated), jamais
 * en remontant les valeurs dans le state React. À 20 valeurs par seconde,
 * passer par React ferait tomber l'écran live à 15 fps.
 */
import React, { useEffect } from 'react';
import { StyleProp, TextInput, TextStyle, ViewStyle, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, motion } from './tokens';

/** Ressort « matériel » : réagit vite, s'arrête net, ne rebondit presque pas. */
export const spring = { damping: 18, stiffness: 220, mass: 0.7 } as const;
/** Courbe de glissement standard : départ franc, arrivée douce. */
export const ease = Easing.bezier(0.22, 1, 0.36, 1);

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Nombre qui « roule » vers sa nouvelle valeur au lieu de sauter.
 *
 * Pourquoi un TextInput en lecture seule et pas un <Text> ? Parce qu'on écrit
 * le texte depuis le thread graphique via `animatedProps`. Un <Text> obligerait
 * à repasser par un rendu React à chaque image, soit 60 rendus par seconde.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  style,
  duration = motion.value,
  /** Sépare les milliers par une espace fine, comme « 4 950 tr/min ». */
  group = false,
  suffix = '',
}: {
  value: number;
  decimals?: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
  group?: boolean;
  suffix?: string;
}) {
  const sv = useSharedValue(value);

  useEffect(() => {
    sv.value = withTiming(value, { duration, easing: ease });
  }, [value, duration, sv]);

  const text = useDerivedValue(() => {
    'worklet';
    let s = sv.value.toFixed(decimals);
    if (group) {
      const [int, dec] = s.split('.');
      // Insertion d'une espace tous les 3 chiffres, en partant de la droite.
      s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
    } else if (decimals > 0) {
      s = s.replace('.', ','); // Virgule décimale : on est en français.
    }
    return s + suffix;
  }, [decimals, group, suffix]);

  const animatedProps = useAnimatedProps(() => ({ text: text.value, defaultValue: text.value }) as never);

  return (
    <AnimatedTextInput
      editable={false}
      // Le clavier ne doit jamais s'ouvrir : ce champ n'est qu'un afficheur.
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[{ padding: 0, margin: 0, includeFontPadding: false }, style]}
      animatedProps={animatedProps}
    />
  );
}

/**
 * Pastille qui respire. Sert à dire « ça vit » : connexion en cours,
 * enregistrement, recherche de boîtier. Jamais utilisée pour un état figé,
 * sinon le signal perd son sens.
 */
export function PulseDot({ color = colors.ok, size = 8, active = true }: { color?: string; size?: number; active?: boolean }) {
  const p = useSharedValue(active ? 0 : 1);

  useEffect(() => {
    if (!active) {
      p.value = withTiming(1, { duration: motion.fast });
      return;
    }
    p.value = withRepeat(withTiming(1, { duration: motion.pulse, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [active, p]);

  const halo = useAnimatedStyle(() => ({
    opacity: active ? 0.45 * (1 - p.value) : 0,
    transform: [{ scale: 1 + p.value * 1.8 }],
  }));
  const core = useAnimatedStyle(() => ({ opacity: active ? 0.7 + 0.3 * p.value : 1 }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, halo]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, core]} />
    </View>
  );
}

/**
 * Barre de progression animée. `ratio` entre 0 et 1.
 * Le changement de couleur passe par `interpolateColor` sur le thread
 * graphique : pas de re-rendu quand la jauge entre en zone orange.
 */
export function ProgressBar({
  ratio,
  height = 8,
  color = colors.ok,
  warnAbove,
  track = colors.track,
  duration = motion.base,
}: {
  ratio: number;
  height?: number;
  color?: string;
  /** Au-delà de ce ratio, la barre vire à l'orange. */
  warnAbove?: number;
  track?: string;
  duration?: number;
}) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withTiming(Math.max(0, Math.min(1, ratio)), { duration, easing: ease });
  }, [ratio, duration, r]);

  const bar = useAnimatedStyle(() => {
    const w = `${r.value * 100}%` as const;
    if (warnAbove === undefined) return { width: w, backgroundColor: color };
    return {
      width: w,
      backgroundColor: interpolateColor(r.value, [warnAbove - 0.08, warnAbove + 0.08], [color, colors.warn]),
    };
  });

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2 }, bar]} />
    </View>
  );
}

/**
 * Apparition en cascade. On monte un écran, chaque bloc arrive 50 ms après le
 * précédent : l'œil suit la construction au lieu de recevoir tout d'un coup.
 */
export function FadeInUp({
  children,
  delay = 0,
  distance = 14,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: motion.slow, easing: ease }));
  }, [delay, p]);

  const s = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));

  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/**
 * Secousse horizontale courte : une alerte vient d'arriver, un run est refusé.
 * Déclenchée en incrémentant `trigger`.
 */
export function Shake({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    x.value = withSequence(
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(-4, { duration: 55 }),
      withSpring(0, spring),
    );
  }, [trigger, x]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={s}>{children}</Animated.View>;
}

/** Petit utilitaire : une valeur partagée qui suit une valeur React. */
export function useFollow(value: number, duration = motion.value): SharedValue<number> {
  const sv = useSharedValue(value);
  useEffect(() => {
    sv.value = withTiming(value, { duration, easing: ease });
  }, [value, duration, sv]);
  return sv;
}
