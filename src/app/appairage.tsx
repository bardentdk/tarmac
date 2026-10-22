/**
 * appairage.tsx — l'écran de connexion au boîtier.
 *
 * C'est l'écran le plus critique de l'app : si l'utilisateur échoue ici, rien
 * d'autre n'existe. Il reprend la maquette « Branche ton boîtier » et y ajoute
 * ce que la vraie vie exige : quatre familles de boîtiers, une liste triée, et
 * des messages qui disent QUOI FAIRE et pas seulement « erreur ».
 *
 * Choix d'ergonomie assumés :
 *   · les boîtiers qui ressemblent à de l'OBD sont remontés en tête, les
 *     autres (montres, enceintes, voitures) sont repliés plus bas ;
 *   · l'onglet « Bluetooth classique » est masqué sur iPhone, avec
 *     l'explication — Apple l'interdit, autant le dire franchement ;
 *   · l'onglet « Démo » existe en permanence, y compris en production : c'est
 *     ce qui permet de montrer l'app à quelqu'un sans voiture.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import {
  Card,
  Chip,
  Dim,
  GhostButton,
  Header,
  Num,
  PrimaryButton,
  Screen,
  SignalBars,
  StatusPill,
  Tappable,
  Txt,
} from '@/ui/components';
import { FadeInUp, PulseDot } from '@/ui/motion';
import { Bluetooth, Check, ChevronDown, Dongle, Flask, InfoCircle, ObdSocket, Wifi } from '@/ui/icons';
import { colors, fonts, radius, space, tap } from '@/ui/tokens';
import { connection } from '@/connection/ConnectionManager';
import { useConnection } from '@/store/useConnection';
import { rssiToBars, type DiscoveredDevice, type TransportKind } from '@/transport/types';
import { classicAvailability } from '@/transport/ClassicTransport';
import { setOnboarded } from '@/store/storage';
import { useAppStore } from '@/store/appStore';

type Tab = Extract<TransportKind, 'ble' | 'classic' | 'wifi' | 'mock'>;

const TABS: { kind: Tab; label: string; Icon: typeof Bluetooth }[] = [
  { kind: 'ble', label: 'Bluetooth (BLE)', Icon: Bluetooth },
  { kind: 'classic', label: 'Bluetooth classique', Icon: Bluetooth },
  { kind: 'wifi', label: 'Wi-Fi', Icon: Wifi },
  { kind: 'mock', label: 'Démo', Icon: Flask },
];

export default function Appairage() {
  const conn = useConnection();
  const vehicle = useAppStore((s) => s.vehicle);
  const setVehicle = useAppStore((s) => s.setVehicle);

  const [tab, setTab] = useState<Tab>('ble');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const stopScan = useRef<(() => void) | null>(null);

  const classic = classicAvailability();
  const visibleTabs = TABS.filter((t) => t.kind !== 'classic' || Platform.OS === 'android');

  /* ─────────────────────────── Recherche ─────────────────────────── */

  const startScan = useCallback(async (kind: Tab) => {
    stopScan.current?.();
    stopScan.current = null;
    setDevices([]);
    setScanError(null);
    setSelected(null);

    if (kind === 'classic' && !classic.usable) {
      setScanError(classic.reason ?? null);
      return;
    }

    setScanning(true);
    try {
      const stop = await connection.scan(
        kind,
        (d) => {
          setDevices((prev) => {
            const i = prev.findIndex((x) => x.id === d.id);
            // Un boîtier BLE est revu plusieurs fois par seconde : on met à
            // jour son signal au lieu d'empiler des doublons.
            if (i >= 0) {
              const next = [...prev];
              next[i] = { ...next[i], ...d };
              return next;
            }
            return [...prev, d];
          });
        },
        (e) => setScanError(e.message),
      );
      stopScan.current = stop;
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
      setScanning(false);
    }
  }, [classic.usable, classic.reason]);

  useEffect(() => {
    void startScan(tab);
    return () => {
      stopScan.current?.();
      stopScan.current = null;
      setScanning(false);
    };
  }, [tab, startScan]);

  /* ─────────────────────────── Connexion ─────────────────────────── */

  const connect = async () => {
    const target = devices.find((d) => d.id === selected);
    if (!target) return;
    // On arrête IMPÉRATIVEMENT la recherche avant de connecter : scanner
    // pendant une connexion BLE est la première cause d'échec aléatoire.
    stopScan.current?.();
    stopScan.current = null;
    setScanning(false);
    try {
      await connection.connect(target);
      setVehicle({ dongleName: target.name });
    } catch {
      // Le message détaillé est déjà dans `conn.lastError`, affiché plus bas.
    }
  };

  const connected = conn.phase === 'ready' || conn.phase === 'polling';
  const busy = ['connecting', 'discovering', 'initializing'].includes(conn.phase);

  const obdLike = devices.filter((d) => d.likelyObd || d.paired);
  const others = devices.filter((d) => !d.likelyObd && !d.paired);

  return (
    <Screen scroll style={ap.screen}>
      <Header
        onBack={() => router.back()}
        right={<Dim style={{ fontFamily: fonts.bodySemi, fontSize: 13 }}>Étape 1 sur 2</Dim>}
      />

      <FadeInUp>
        <View style={{ gap: space.sm }}>
          <Text style={ap.h1}>Branche ton boîtier</Text>
          <Dim style={ap.lede}>
            La prise OBD est sous le volant, à gauche des pédales. Mets le contact, moteur coupé.
          </Dim>
        </View>
      </FadeInUp>

      {/* Illustration de la prise : la première fois, on ne sait pas où elle est. */}
      <FadeInUp delay={80}>
        <View style={ap.illu}>
          <ObdSocket />
          <Dim style={ap.illuCaption}>Vert : CAN (6 et 14) · Bleu : alimentation (16)</Dim>
        </View>
      </FadeInUp>

      {/* Choix du type de liaison. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {visibleTabs.map((t) => (
          <Chip key={t.kind} label={t.label} active={tab === t.kind} onPress={() => setTab(t.kind)} />
        ))}
      </ScrollView>

      {/* iPhone + Bluetooth classique : on explique au lieu de masquer en silence. */}
      {Platform.OS === 'ios' ? (
        <Card tone="info" style={{ flexDirection: 'row', gap: space.md }}>
          <InfoCircle size={22} color={colors.info} />
          <Txt style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.text3 }}>
            Sur iPhone, les boîtiers « Bluetooth classique » (ceux qui demandent un code PIN) ne sont pas
            utilisables : Apple réserve ce mode aux accessoires certifiés. Il faut un boîtier BLE ou Wi-Fi.
          </Txt>
        </Card>
      ) : null}

      {tab === 'wifi' ? (
        <Card tone="info" style={{ flexDirection: 'row', gap: space.md }}>
          <Wifi size={22} color={colors.info} />
          <Txt style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.text3 }}>
            Connecte d'abord ton téléphone au Wi-Fi du boîtier dans les réglages du système. Pendant ce
            temps, tu n'auras plus Internet : c'est normal, le boîtier ne route rien.
          </Txt>
        </Card>
      ) : null}

      {/* État de la connexion, toujours visible. */}
      <ConnectionCard />

      {/* Liste des boîtiers trouvés. */}
      <View style={{ gap: space.sm }}>
        <View style={ap.listHead}>
          <Dim style={ap.section}>Boîtiers trouvés</Dim>
          {scanning ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PulseDot color={colors.info} size={7} />
              <Dim style={{ fontSize: 12 }}>Recherche…</Dim>
            </View>
          ) : (
            <Tappable onPress={() => void startScan(tab)} label="Relancer la recherche" haptic={false}>
              <Text style={ap.link}>Relancer</Text>
            </Tappable>
          )}
        </View>

        {scanError ? (
          <Card tone="warn" style={{ gap: 6 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, color: colors.warnText }}>Recherche impossible</Txt>
            <Txt style={{ fontSize: 13, lineHeight: 18, color: colors.text3 }}>{scanError}</Txt>
          </Card>
        ) : null}

        {obdLike.length === 0 && !scanError ? (
          <Card style={{ gap: space.sm }}>
            <Txt style={{ fontFamily: fonts.bodyBold }}>Aucun boîtier OBD repéré</Txt>
            <Dim style={{ fontSize: 13, lineHeight: 18 }}>
              Contact mis ? Boîtier bien enfoncé dans la prise ? Sa petite lumière est allumée ?
            </Dim>
            <GhostButton title="Mon boîtier n'apparaît pas" onPress={() => router.push('/aide-boitier')} />
          </Card>
        ) : null}

        {obdLike.map((d) => (
          <DeviceRow
            key={d.id}
            device={d}
            selected={selected === d.id}
            onPress={() => setSelected(d.id)}
          />
        ))}

        {others.length > 0 ? (
          <Tappable onPress={() => setShowOthers((v) => !v)} label="Afficher les autres appareils" haptic={false}>
            <View style={ap.moreRow}>
              <Dim style={{ fontSize: 13 }}>
                {showOthers ? 'Masquer' : 'Afficher'} les {others.length} autres appareils
              </Dim>
              <ChevronDown size={16} color={colors.text2} />
            </View>
          </Tappable>
        ) : null}

        {showOthers
          ? others.map((d) => (
              <DeviceRow key={d.id} device={d} selected={selected === d.id} onPress={() => setSelected(d.id)} />
            ))
          : null}
      </View>

      {/* Bilan après connexion, comme dans la maquette. */}
      {connected ? <ReadyChecklist /> : null}

      <View style={{ gap: space.md, marginTop: space.lg }}>
        {connected ? (
          <>
            <PrimaryButton
              title="Continuer"
              onPress={() => {
                setOnboarded(true);
                router.push('/garage');
              }}
            />
            <GhostButton title="Changer de boîtier" onPress={() => void connection.disconnect()} />
          </>
        ) : (
          <PrimaryButton
            title={busy ? 'Connexion…' : 'Se connecter'}
            busy={busy}
            disabled={!selected}
            onPress={() => void connect()}
          />
        )}
        {vehicle.dongleName && !connected ? (
          <Dim style={{ textAlign: 'center', fontSize: 12 }}>Dernier boîtier utilisé : {vehicle.dongleName}</Dim>
        ) : null}
      </View>
    </Screen>
  );
}

/** Une ligne de la liste des boîtiers. */
function DeviceRow({
  device,
  selected,
  onPress,
}: {
  device: DiscoveredDevice;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} layout={Layout.springify()}>
      <Tappable onPress={onPress} label={device.name ?? device.id} scaleTo={0.985}>
        <View style={[ap.device, selected && ap.deviceOn]}>
          <Dongle size={28} color={selected ? colors.ok : colors.text2} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16 }} numberOfLines={1}>
              {device.name ?? 'Appareil sans nom'}
            </Txt>
            <Dim style={{ fontSize: 13 }}>
              {device.paired ? 'Déjà appairé · ' : ''}
              {device.kind === 'wifi' ? device.id : device.id.slice(0, 17)}
            </Dim>
          </View>
          {device.kind === 'ble' ? <SignalBars level={rssiToBars(device.rssi)} color={selected ? colors.ok : colors.text2} /> : null}
          {selected ? <Check size={20} color={colors.ok} /> : null}
        </View>
      </Tappable>
    </Animated.View>
  );
}

/** La carte d'état : connecté, en cours, en reconnexion, ou en erreur. */
function ConnectionCard() {
  const conn = useConnection();
  if (conn.phase === 'idle' || conn.phase === 'scanning') return null;

  const connected = conn.phase === 'ready' || conn.phase === 'polling';
  const failing = conn.phase === 'error' || conn.phase === 'reconnecting';

  return (
    <Card tone={connected ? 'ok' : failing ? 'warn' : 'info'} style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Dongle size={28} color={connected ? colors.ok : failing ? colors.warnText : colors.info} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16 }}>{conn.device?.name ?? 'Boîtier'}</Txt>
          <Txt style={{ fontSize: 13, color: connected ? colors.ok : failing ? colors.warnText : colors.info }}>
            {conn.message}
          </Txt>
        </View>
        <PulseDot color={connected ? colors.ok : failing ? colors.warn : colors.info} active={!connected} />
      </View>
      {conn.lastError && !connected ? (
        <Dim style={{ fontSize: 12, lineHeight: 17 }}>{conn.lastError}</Dim>
      ) : null}
    </Card>
  );
}

/**
 * Le bilan de connexion de la maquette : bus détecté, GPS, mise à jour.
 * Chaque ligne est renseignée par ce qu'on sait réellement, pas par un décor.
 */
function ReadyChecklist() {
  const conn = useConnection();
  return (
    <FadeInUp delay={60}>
      <View style={{ gap: 0 }}>
        <CheckRow
          ok
          label="Dialogue établi"
          value={conn.caps.protocol !== '?' ? conn.caps.protocol : 'protocole détecté'}
        />
        <CheckRow
          ok
          label="PID disponibles"
          value={`${conn.caps.supportedPids.length} grandeurs`}
        />
        <CheckRow
          ok={conn.caps.multiPid}
          label="Groupage multi-PID"
          value={conn.caps.multiPid ? `jusqu'à ${conn.caps.maxPidsPerRequest} d'un coup` : 'non supporté'}
        />
        <CheckRow ok label="Version annoncée" value={conn.caps.version} />
      </View>
    </FadeInUp>
  );
}

function CheckRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <View style={ap.chk}>
      {ok ? <Check size={20} color={colors.ok} /> : <InfoCircle size={20} color={colors.info} />}
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Dim style={{ fontSize: 13 }} numberOfLines={1}>{value}</Dim>
    </View>
  );
}

const ap = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.xl },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28, lineHeight: 32 },
  lede: { fontSize: 15, lineHeight: 21 },
  illu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illuCaption: { position: 'absolute', bottom: 14, fontSize: 12 },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.ok, fontFamily: fonts.bodySemi, fontSize: 13 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  deviceOn: { backgroundColor: colors.okBg, borderColor: colors.okBorder },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: tap.min,
  },
  chk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
