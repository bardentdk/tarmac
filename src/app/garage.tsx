/**
 * garage.tsx — la fiche du véhicule (maquette « Mon véhicule »).
 *
 * Deux informations comptent vraiment ici, et une seule saute aux yeux :
 *   · **le poids**, parce que c'est lui qui pilote le dyno virtuel. Une erreur
 *     de 50 kg décale la puissance estimée d'environ 4 %. On l'explique sous
 *     le champ plutôt que de laisser l'utilisateur deviner ;
 *   · **le niveau de préparation**, parce qu'il sépare les classements et les
 *     comparatifs avant/après.
 *
 * Le VIN est lu automatiquement quand le boîtier et le calculateur veulent
 * bien répondre (service 09, PID 02). Quand ça marche, on ne demande rien à
 * l'utilisateur — c'est le meilleur formulaire : celui qu'on ne remplit pas.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Card,
  Dim,
  Field,
  Header,
  PrimaryButton,
  Screen,
  Segmented,
  Txt,
} from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { Check, Car } from '@/ui/icons';
import { colors, fonts, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { connection } from '@/connection/ConnectionManager';
import { decodeVin } from '@/obd/decode';
import { consoleLog } from '@/debug/ConsoleLog';
import { setOnboarded, type PrepLevel } from '@/store/storage';

const PREP_OPTIONS: { value: PrepLevel; label: string }[] = [
  { value: 'origine', label: 'Origine' },
  { value: 'stage1', label: 'Stage 1' },
  { value: 'stage2', label: 'Stage 2' },
  { value: 'autre', label: 'Autre' },
];

/**
 * Déduit un libellé de véhicule depuis le VIN.
 *
 * On ne décode que ce qui est fiable sans base de données : le constructeur
 * (les trois premiers caractères, le WMI) et l'année modèle (10e caractère).
 * Le reste demanderait une table propriétaire, donc on ne l'invente pas.
 */
function describeVin(vin: string): { label: string; details: string } | null {
  if (vin.length < 11) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  const makers: Record<string, string> = {
    VSS: 'Seat',
    WVW: 'Volkswagen',
    WVG: 'Volkswagen',
    WAU: 'Audi',
    TMB: 'Škoda',
  };
  const maker = makers[wmi];
  if (!maker) return null;

  // Code année modèle normalisé (ISO 3779), 10e caractère.
  const yearCodes = 'ABCDEFGHJKLMNPRSTVWXY123456789';
  const idx = yearCodes.indexOf(vin[9].toUpperCase());
  // Les codes se répètent tous les 30 ans : on choisit le cycle en cours.
  const year = idx >= 0 ? 2010 + ((idx - yearCodes.indexOf('A') + 30) % 30) : null;

  return {
    label: maker,
    details: [year ? `${year}` : null, `VIN ${vin}`].filter(Boolean).join(' · '),
  };
}

export default function Garage() {
  const vehicle = useAppStore((s) => s.vehicle);
  const setVehicle = useAppStore((s) => s.setVehicle);
  const [reading, setReading] = useState(false);

  /**
   * Tentative de lecture du VIN au montage de l'écran.
   *
   * Beaucoup de passerelles VW refusent le service 09 : l'échec est donc la
   * norme, pas l'exception. On ne montre aucune erreur, on laisse simplement
   * les champs à remplir à la main.
   */
  useEffect(() => {
    const elm = connection.protocol;
    if (!elm || vehicle.vin) return;
    let cancelled = false;

    (async () => {
      setReading(true);
      try {
        const r = await elm.send('0902', { timeoutMs: 4000, tolerateErrors: true });
        if (cancelled || r.error) return;
        const vin = decodeVin(r.clean);
        if (!vin) return;
        consoleLog.sys(`VIN lu : ${vin}`);
        const guess = describeVin(vin);
        setVehicle({ vin, ...(guess ? { details: guess.details } : {}) });
      } catch {
        // Service non supporté : silence, c'est attendu.
      } finally {
        if (!cancelled) setReading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [vehicle.vin, setVehicle]);

  return (
    <Screen scroll style={gr.screen}>
      <Header
        onBack={() => router.back()}
        right={<Dim style={{ fontFamily: fonts.bodySemi, fontSize: 13 }}>Étape 2 sur 2</Dim>}
      />

      <Text style={gr.h1}>Ton véhicule</Text>

      {/* Détection automatique : la carte n'apparaît que si on a vraiment lu
          quelque chose, pour ne pas promettre une magie qui n'a pas eu lieu. */}
      <FadeInUp>
        <Card style={{ gap: 6 }}>
          <View style={gr.autoTag}>
            {vehicle.vin ? <Check size={14} color={colors.ok} width={2.6} /> : <Car size={14} color={colors.text2} />}
            <Text style={[gr.autoTagTxt, !vehicle.vin && { color: colors.text2 }]}>
              {vehicle.vin ? 'Lu automatiquement' : reading ? 'Lecture du VIN…' : 'À compléter à la main'}
            </Text>
          </View>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>{vehicle.label}</Txt>
          <Dim style={{ fontSize: 14 }}>{vehicle.details}</Dim>
        </Card>
      </FadeInUp>

      <FadeInUp delay={60}>
        <View style={{ gap: space.sm }}>
          <Dim style={gr.lbl}>Niveau de préparation</Dim>
          <Segmented
            label="Niveau de préparation"
            options={PREP_OPTIONS}
            value={vehicle.prep}
            onChange={(prep) => setVehicle({ prep })}
          />
        </View>
      </FadeInUp>

      <FadeInUp delay={120}>
        <Field
          label="Poids en ordre de marche, avec toi (kg)"
          value={String(vehicle.massKg)}
          onChangeText={(v) => setVehicle({ massKg: Number(v.replace(/[^\d]/g, '')) || 0 })}
          keyboardType="numeric"
          hint="Sert à estimer la puissance (dyno virtuel). 50 kg d'erreur = environ 4 % de puissance."
        />
      </FadeInUp>

      <FadeInUp delay={170}>
        <Field
          label="Pneus"
          value={vehicle.tyres}
          onChangeText={(tyres) => setVehicle({ tyres })}
          placeholder="ex. 215/45 R18"
          hint="La taille de roue sert à estimer le rapport engagé pendant un run."
        />
      </FadeInUp>

      <FadeInUp delay={220}>
        <Field
          label="Ton préparateur (facultatif)"
          value={vehicle.tunerEmail}
          onChangeText={(tunerEmail) => setVehicle({ tunerEmail })}
          placeholder="email du mappeur"
          keyboardType="email-address"
          hint="Pour lui envoyer tes logs en un appui."
        />
      </FadeInUp>

      <View style={{ marginTop: space.xl }}>
        <PrimaryButton
          title="Terminer"
          onPress={() => {
            setOnboarded(true);
            router.replace('/(tabs)');
          }}
        />
      </View>
    </Screen>
  );
}

const gr = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  autoTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoTagTxt: {
    color: colors.ok,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  lbl: { fontFamily: fonts.bodySemi, fontSize: 13 },
});
