/**
 * console.tsx — la console de diagnostic (jalon 7 du cahier des charges).
 *
 * Quand un clone ELM327 se comporte bizarrement, il n'y a qu'une façon de
 * comprendre : lire ce qui est parti et ce qui est revenu, dans l'ordre, avec
 * les durées. C'est exactement ce que fait cet écran.
 *
 * Il est écrit pour être utile EN SITUATION, c'est-à-dire assis dans la
 * voiture, avec un boîtier qui déconne :
 *   · les lignes sont colorées par direction (envoi, réception, système,
 *     erreur) et préfixées par leur type, pour rester lisibles en plein soleil ;
 *   · le temps est relatif au début du journal, pas en heure absolue : ce qui
 *     compte c'est « 43 ms après la requête », pas « à 14 h 07 » ;
 *   · deux boutons seulement : copier, exporter. Le journal exporté se rejoue
 *     dans le simulateur, ce qui permet de corriger un bug sans la voiture.
 */
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, Dim, GhostButton, Header, Num, Screen, Txt } from '@/ui/components';
import { colors, fonts, radius, space } from '@/ui/tokens';
import { consoleLog, type LogDir, type LogEntry } from '@/debug/ConsoleLog';
import { copyText, shareText } from '@/debug/share';
import { useConnection } from '@/store/useConnection';
import { useThroughput } from '@/store/liveStore';
import { safetyInfo } from '@/obd/safety';
import { useSyncExternalStore } from 'react';

type DirFilter = 'all' | 'exchange' | 'errors';

const DIR_STYLE: Record<LogDir, { color: string; tag: string }> = {
  tx: { color: colors.info, tag: 'TX' },
  rx: { color: colors.ok, tag: 'RX' },
  sys: { color: colors.text2, tag: 'SYS' },
  err: { color: colors.dangerRun, tag: 'ERR' },
};

export default function Console() {
  const conn = useConnection();
  const t = useThroughput();
  const [filter, setFilter] = useState<DirFilter>('all');
  const listRef = useRef<FlatList<LogEntry>>(null);
  /** Suivi automatique du bas de liste, désactivé dès qu'on remonte. */
  const [follow, setFollow] = useState(true);

  // Le journal vit hors de React : on s'abonne à son numéro de version.
  useSyncExternalStore(consoleLog.subscribe, consoleLog.getVersion, consoleLog.getVersion);
  const all = consoleLog.entries();

  const entries = useMemo(() => {
    if (filter === 'exchange') return all.filter((e) => e.dir === 'tx' || e.dir === 'rx');
    if (filter === 'errors') return all.filter((e) => e.dir === 'err');
    return all;
  }, [all, filter]);

  const t0 = all[0]?.t ?? Date.now();

  const header = () => ({
    boitier: conn.device?.name ?? '-',
    type: conn.device?.kind ?? '-',
    version: conn.caps.version,
    protocole: conn.caps.protocol,
    multiPid: conn.caps.multiPid,
    maxPidsParRequete: conn.caps.maxPidsPerRequest,
    suffixeComptage: conn.caps.responseCountHint,
    delaiAdaptatif: conn.caps.adaptiveTiming,
    enTeteMoteur: conn.caps.headerSet,
    pidDeclares: conn.caps.supportedPids.join(' '),
    debitValeursParSeconde: t.valuesPerSec,
    debitRequetesParSeconde: t.requestsPerSec,
    dureeMoyenneMs: t.avgMs,
  });

  return (
    <Screen style={cs.screen}>
      <Header title="Console de diagnostic" onBack={() => router.back()} />

      {/* La fiche du boîtier : ce qu'on envoie au support avec le journal. */}
      <Card style={{ gap: 4, borderRadius: radius.md, padding: 14 }}>
        <View style={cs.statRow}>
          <Stat label="Valeurs/s" value={String(t.valuesPerSec)} highlight />
          <Stat label="Requêtes/s" value={String(t.requestsPerSec)} />
          <Stat label="Aller-retour" value={`${t.avgMs} ms`} />
          <Stat label="Lignes" value={String(all.length)} />
        </View>
        <View style={cs.caps}>
          <Dim style={{ fontSize: 12 }} numberOfLines={2}>
            {conn.device?.name ?? 'Aucun boîtier'} · {conn.caps.version} · {conn.caps.protocol} ·{' '}
            multi-PID {conn.caps.multiPid ? `×${conn.caps.maxPidsPerRequest}` : 'non'} ·{' '}
            comptage {conn.caps.responseCountHint ? 'oui' : 'non'} ·{' '}
            {conn.caps.supportedPids.length} PID déclarés
          </Dim>
        </View>
      </Card>

      <View style={cs.chips}>
        <Chip label="Tout" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Échanges" active={filter === 'exchange'} onPress={() => setFilter('exchange')} />
        <Chip label="Erreurs" active={filter === 'errors'} onPress={() => setFilter('errors')} />
      </View>

      {/* Le journal. FlatList : le journal fait jusqu'à 2 000 lignes, on ne
          rend que ce qui est visible. */}
      <View style={cs.logBox}>
        {entries.length === 0 ? (
          <Dim style={{ padding: space.lg, fontSize: 13 }}>
            Rien pour l'instant. Connecte un boîtier : chaque commande et chaque réponse apparaîtront ici.
          </Dim>
        ) : (
          <FlatList
            ref={listRef}
            data={entries}
            keyExtractor={(e, i) => `${e.t}-${i}`}
            renderItem={({ item }) => <LogLine entry={item} t0={t0} />}
            // Les lignes sont de hauteur variable (une réponse peut être
            // longue) : on laisse FlatList mesurer, mais on limite le travail.
            initialNumToRender={30}
            maxToRenderPerBatch={30}
            windowSize={8}
            removeClippedSubviews
            onScrollBeginDrag={() => setFollow(false)}
            onContentSizeChange={() => {
              if (follow) listRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}
      </View>

      {!follow ? (
        <GhostButton
          title="Revenir en bas"
          onPress={() => {
            setFollow(true);
            listRef.current?.scrollToEnd({ animated: true });
          }}
        />
      ) : null}

      {/* La liste blanche, pour mémoire : aucune commande hors de cette liste
          ne peut partir vers le boîtier. */}
      <Dim style={{ fontSize: 11, lineHeight: 16 }}>
        Services autorisés : {safetyInfo.allowedServices.join(', ')} (lecture seule) · commandes AT de
        configuration. Tout le reste est refusé avant d'atteindre le boîtier.
      </Dim>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <GhostButton
          title="Copier"
          style={{ flex: 1 }}
          onPress={() => copyText(consoleLog.toText(header()))}
        />
        <GhostButton
          title="Exporter (.txt)"
          style={{ flex: 1 }}
          onPress={() => void shareText(consoleLog.toText(header()), 'tarmac-journal', 'txt')}
        />
        <GhostButton title="Vider" onPress={() => consoleLog.clear()} />
      </View>
    </Screen>
  );
}

/** Une ligne du journal. Mémoïsée : la liste se redessine 10 fois par seconde. */
const LogLine = React.memo(function LogLine({ entry, t0 }: { entry: LogEntry; t0: number }) {
  const s = DIR_STYLE[entry.dir];
  const rel = ((entry.t - t0) / 1000).toFixed(3);
  return (
    <View style={cs.line}>
      <Text style={cs.time}>{rel}</Text>
      <Text style={[cs.tag, { color: s.color }]}>{s.tag}</Text>
      <Text style={[cs.payload, entry.dir === 'err' && { color: colors.dangerRun }]} numberOfLines={3}>
        {entry.text}
      </Text>
      {entry.ms !== undefined ? <Text style={cs.ms}>{entry.ms}ms</Text> : null}
    </View>
  );
});

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Dim style={{ fontSize: 11 }}>{label}</Dim>
      <Num style={[cs.statValue, highlight && { color: colors.ok }]}>{value}</Num>
    </View>
  );
}

const cs = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl, gap: space.md },
  statRow: { flexDirection: 'row', gap: space.sm },
  statValue: { fontSize: 22, fontFamily: fonts.numBold },
  caps: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.sm, marginTop: 2 },
  chips: { flexDirection: 'row', gap: space.sm },
  logBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingVertical: 3,
    paddingHorizontal: space.md,
  },
  // Police à chasse fixe : les colonnes restent alignées, ce qui rend le
  // journal lisible d'un coup d'œil.
  time: { color: colors.text2, fontFamily: 'monospace', fontSize: 11, width: 52, textAlign: 'right' },
  tag: { fontFamily: 'monospace', fontSize: 11, width: 28, fontWeight: '700' },
  payload: { flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
  ms: { color: colors.text2, fontFamily: 'monospace', fontSize: 10 },
});
