/**
 * run.tsx — le run en direct (maquette « Run en direct »).
 *
 * C'est l'écran qu'on regarde à 120 km/h, du coin de l'œil. Tout est dessiné
 * pour ça :
 *   · un seul chiffre immense, la vitesse, lisible sans accommoder ;
 *   · le chrono juste en dessous, en chiffres tabulaires pour qu'il ne danse pas ;
 *   · le reste en tuiles, sans libellé long ;
 *   · aucune interaction nécessaire : le run démarre et s'arrête tout seul.
 *
 * Côté technique, c'est le seul écran où l'on vise strictement 60 images par
 * seconde. Le `RunDetector` tourne à 25 Hz hors de React, et on ne remonte
 * dans React que les valeurs affichées — les chiffres, eux, sont animés sur le
 * thread graphique par `AnimatedNumber`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import {
  Card,
  Dim,
  GhostButton,
  Num,
  RoundButton,
  Screen,
  StatusPill,
  Txt,
} from '@/ui/components';
import { AnimatedNumber, ProgressBar, Shake } from '@/ui/motion';
import { Close, Warning } from '@/ui/icons';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { RunDetector, type RunProgress } from '@/run/RunDetector';
import { runModeDef, type RunIncident } from '@/run/types';
import { gps } from '@/run/gps';
import { useAppStore } from '@/store/appStore';
import { connection } from '@/connection/ConnectionManager';
import { IBIZA_STAGE1, IBIZA_STOCK } from '@/transport/vehicleSim';

export default function Run() {
  // L'écran ne doit JAMAIS s'éteindre pendant un run : on perdrait la mesure
  // et l'utilisateur regarderait un écran noir à 100 km/h.
  useKeepAwake();

  const mode = useAppStore((s) => s.selectedMode);
  const vehicle = useAppStore((s) => s.vehicle);
  const addRun = useAppStore((s) => s.addRun);

  const [p, setP] = useState<RunProgress | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const detector = useRef<RunDetector | null>(null);
  /** Dernier incident affiché : évite de secouer l'écran deux fois pour le même. */
  const shownIncident = useRef<RunIncident | null>(null);

  useEffect(() => {
    // Le GPS est la référence du chrono : on le démarre avant tout.
    void gps.start();

    const spec = vehicle.prep === 'origine' ? IBIZA_STOCK : IBIZA_STAGE1;
    const d = new RunDetector(
      {
        onProgress: setP,
        onFinish: (partial) => {
          const record = addRun(partial);
          // Retour à la cadence confortable : le run est fini.
          connection.setPollMode('live');
          if (record.timeS !== null) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace(`/analyse/${record.id}`);
          }
        },
        onCritical: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          router.replace('/alerte');
        },
      },
      { ...spec, massKg: vehicle.massKg || spec.massKg },
    );

    detector.current = d;
    d.arm(mode);

    return () => {
      d.cancel('Écran quitté');
      gps.stop();
      connection.setPollMode('live');
    };
    // Volontairement monté une seule fois : un run ne se « réarme » pas au
    // milieu parce qu'une dépendance a changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une secousse quand un incident arrive : l'information passe même si on
  // regarde la route.
  useEffect(() => {
    const inc = p?.lastIncident;
    if (!inc || inc === shownIncident.current) return;
    shownIncident.current = inc;
    setShakeKey((k) => k + 1);
    if (inc.severity !== 'info') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [p?.lastIncident]);

  const def = runModeDef(mode);
  const armed = p?.phase === 'armed';
  const running = p?.phase === 'running';

  return (
    <Screen style={rn.screen}>
      {/* Statut + sortie de secours. */}
      <View style={rn.head}>
        <StatusPill
          text={armed ? `ARMÉ · ${def.label}` : `ENREGISTREMENT · ${def.label}`}
          tone={armed ? 'info' : 'warn'}
          pulsing
        />
        <RoundButton
          onPress={() => {
            detector.current?.cancel('Annulé par l\'utilisateur');
            router.back();
          }}
          label="Annuler le run"
        >
          <Close size={18} color={colors.text} />
        </RoundButton>
      </View>

      {/* Vitesse : le chiffre le plus gros de toute l'app. */}
      <View style={rn.speedBlock}>
        <AnimatedNumber
          value={p?.speedKph ?? 0}
          // Lissage très court : à cette taille, un saut de 3 km/h se voit.
          duration={90}
          style={rn.speed}
        />
        <Text style={rn.speedUnit}>KM/H</Text>

        <View style={{ width: '100%', marginTop: 18 }}>
          <ProgressBar ratio={p?.ratio ?? 0} height={8} duration={120} />
          <View style={rn.progressLabels}>
            <Dim style={{ fontSize: 12 }}>{def.fromKph === 0 ? '0' : `${def.fromKph}`}</Dim>
            <Dim style={{ fontSize: 12 }}>
              {def.kind === 'speed' ? `Objectif ${def.toKph} km/h` : `Objectif ${Math.round(def.distanceM ?? 0)} m`}
            </Dim>
          </View>
        </View>
      </View>

      {/* Chrono. */}
      <View style={rn.chrono}>
        <Dim style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Chrono</Dim>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedNumber value={p?.elapsedS ?? 0} decimals={2} duration={60} style={rn.chronoValue} />
          <Text style={rn.chronoUnit}> s</Text>
        </View>
      </View>

      {/* Trois tuiles moteur. */}
      <View style={rn.tiles}>
        <LiveTile label="Rapport" value={p?.gear ?? null} big />
        <LiveTile label="Régime" value={p?.rpm ?? null} group />
        <LiveTile label="Boost" value={p?.boostBar ?? null} decimals={1} unit=" bar" />
      </View>

      {/* Patinage, en segments : lisible sans lire un chiffre. */}
      <Card style={{ gap: space.md, borderRadius: radius.md, padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Patinage au départ</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <AnimatedNumber
              value={p?.slipPct ?? 0}
              style={[rn.slipValue, (p?.slipPct ?? 0) > 6 && { color: colors.warnText }]}
            />
            <Text style={[rn.slipValue, (p?.slipPct ?? 0) > 6 && { color: colors.warnText }]}> %</Text>
          </View>
        </View>
        <SlipBars pct={p?.slipPct ?? 0} />
        <Dim style={{ fontSize: 12 }}>
          {p?.speedSource === 'gps'
            ? 'Vitesse roues (OBD) contre vitesse réelle (GPS)'
            : 'GPS indisponible : patinage non mesurable, chrono basé sur l\'OBD'}
        </Dim>
      </Card>

      {/* Alerte en direct. */}
      <View style={rn.alertSlot}>
        {p?.lastIncident ? (
          <Shake trigger={shakeKey}>
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)}>
              <Card
                tone={p.lastIncident.severity === 'danger' ? 'danger' : 'warn'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: 14 }}
              >
                <Warning size={24} color={colors.warnText} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.warnText }}>
                    {p.lastIncident.message}
                  </Txt>
                  <Dim style={{ fontSize: 12, color: colors.text3 }}>
                    {p.lastIncident.kind === 'retard'
                      ? 'Le calculateur se protège. Noté pour l\'analyse.'
                      : 'Noté pour l\'analyse d\'après-run.'}
                  </Dim>
                </View>
              </Card>
            </Animated.View>
          </Shake>
        ) : armed && p?.hint ? (
          <Card style={{ borderRadius: radius.md, padding: 14 }}>
            <Txt style={{ fontSize: 14, color: colors.text3 }}>{p.hint}</Txt>
          </Card>
        ) : null}
      </View>

      <GhostButton
        title={running ? 'Arrêter et voir le résultat' : 'Annuler'}
        onPress={() => {
          detector.current?.cancel(running ? 'Arrêté par l\'utilisateur' : 'Annulé');
          router.back();
        }}
      />
    </Screen>
  );
}

/** Une tuile de donnée moteur. */
function LiveTile({
  label,
  value,
  decimals = 0,
  unit,
  group = false,
  big = false,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  unit?: string;
  group?: boolean;
  big?: boolean;
}) {
  return (
    <View style={rn.tile}>
      <Dim style={{ fontSize: 12 }}>{label}</Dim>
      {value === null ? (
        <Num style={{ fontSize: 36, color: colors.text2 }}>—</Num>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedNumber
            value={value}
            decimals={decimals}
            group={group}
            duration={big ? 140 : 110}
            style={[rn.tileValue, big && { fontFamily: fonts.numBlack }]}
          />
          {unit ? <Text style={rn.tileUnit}>{unit}</Text> : null}
        </View>
      )}
    </View>
  );
}

/**
 * Cinq segments qui s'allument avec le patinage.
 *
 * Pourquoi des segments plutôt qu'une barre continue ? Parce qu'on les compte
 * du coin de l'œil sans lire. Deux verts : bon départ. Trois oranges : on
 * gâche de la gomme.
 */
function SlipBars({ pct }: { pct: number }) {
  // 0-3 % = 2 segments (normal), puis un segment tous les 4 %.
  const lit = pct <= 3 ? 2 : Math.min(5, 2 + Math.ceil((pct - 3) / 4));
  return (
    <View style={{ flexDirection: 'row', gap: 4, height: 10 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            flex: 1,
            borderRadius: 3,
            backgroundColor: i >= lit ? colors.trackDim : i < 2 ? colors.ok : colors.warn,
          }}
        />
      ))}
    </View>
  );
}

const rn = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedBlock: { alignItems: 'center', paddingTop: space.sm },
  speed: {
    color: colors.text,
    fontFamily: fonts.numBlack,
    fontSize: 150,
    lineHeight: 150,
    letterSpacing: -3,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  speedUnit: { color: colors.text2, fontFamily: fonts.bodySemi, fontSize: 16, letterSpacing: 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chrono: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
  chronoValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 52, fontVariant: ['tabular-nums'] },
  chronoUnit: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 24 },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 36, fontVariant: ['tabular-nums'] },
  tileUnit: { color: colors.text2, fontFamily: fonts.numBold, fontSize: 16 },
  slipValue: { color: colors.text, fontFamily: fonts.numBold, fontSize: 22, fontVariant: ['tabular-nums'] },
  // Place réservée pour l'alerte : sans elle, l'écran sauterait à chaque
  // apparition d'incident, exactement au moment où il faut rester lisible.
  alertSlot: { minHeight: 76, marginTop: 'auto', justifyContent: 'flex-end' },
});
