/**
 * (tabs)/classement.tsx — le classement (maquette « Classement »).
 *
 * ⚠️ Honnêteté technique : le classement COMMUNAUTAIRE demande un serveur et
 * un compte client, prévus dans une phase ultérieure. Il n'existe pas encore.
 *
 * Plutôt que de remplir l'écran de faux pilotes — ce qui donnerait l'illusion
 * d'une fonctionnalité qui n'est pas là, et fausserait les tests — on affiche
 * le classement RÉEL : celui des propres runs de l'utilisateur, épreuve par
 * épreuve, avec son meilleur temps mis en avant. La mise en page, les filtres
 * et la ligne « Toi » épinglée sont déjà en place : le jour où le serveur
 * existe, seule la source de données change.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Chip, Dim, Num, Screen, Tappable, Txt } from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { ChevronDown, InfoCircle, Shield } from '@/ui/icons';
import { colors, fonts, radius, space, tap } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { RUN_MODES, type RunMode, type RunRecord } from '@/run/types';

/** Les trois portées prévues. Seule « Mes runs » est alimentée aujourd'hui. */
type Scope = 'mine' | 'region' | 'world';

const SCOPES: { value: Scope; label: string; ready: boolean }[] = [
  { value: 'mine', label: 'Mes runs', ready: true },
  { value: 'region', label: 'Ma région', ready: false },
  { value: 'world', label: 'Monde', ready: false },
];

const fr = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Entry {
  rank: number;
  name: string;
  detail: string;
  timeS: number;
  /** C'est le meilleur temps de l'utilisateur. */
  isMine: boolean;
}

/**
 * Construit le classement depuis les runs locaux.
 *
 * On ne garde qu'UN run par séance (le meilleur du jour) : sinon une bonne
 * journée occuperait les cinq premières places et le classement ne dirait plus
 * rien sur la progression.
 */
function buildLocalLeaderboard(runs: RunRecord[], mode: RunMode, pseudo: string): Entry[] {
  const valid = runs.filter((r) => r.mode === mode && r.timeS !== null);
  const bestByDay = new Map<string, RunRecord>();
  for (const r of valid) {
    const day = new Date(r.startedAt).toDateString();
    const cur = bestByDay.get(day);
    if (!cur || r.timeS! < cur.timeS!) bestByDay.set(day, r);
  }

  const sorted = [...bestByDay.values()].sort((a, b) => a.timeS! - b.timeS!);
  const bestOverall = sorted[0]?.id;

  return sorted.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    name:
      r.id === bestOverall
        ? pseudo || 'Toi'
        : new Date(r.startedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    detail: `${r.prep === 'stage1' ? 'Stage 1' : r.prep === 'stage2' ? 'Stage 2' : r.prep === 'origine' ? 'Origine' : 'Autre'} · corrigé ${fr(r.correctedS ?? r.timeS!)} s`,
    timeS: r.timeS!,
    isMine: r.id === bestOverall,
  }));
}

export default function Classement() {
  const runs = useAppStore((s) => s.runs);
  const pseudo = useAppStore((s) => s.pseudo);
  const vehicle = useAppStore((s) => s.vehicle);
  const settings = useAppStore((s) => s.settings);

  const [mode, setMode] = useState<RunMode>('0-100');
  const [scope, setScope] = useState<Scope>('mine');

  const entries = useMemo(() => buildLocalLeaderboard(runs, mode, pseudo), [runs, mode, pseudo]);
  const mine = entries.find((e) => e.isMine) ?? null;
  const prepLabel =
    vehicle.prep === 'stage1' ? 'Stage 1' : vehicle.prep === 'stage2' ? 'Stage 2' : vehicle.prep === 'origine' ? 'Origine' : 'Autre';

  return (
    <Screen scroll edges={['top']} style={cl.screen}>
      <View style={cl.head}>
        <Text style={cl.h1}>Classement</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Shield size={16} color={colors.info} width={2} />
          <Text style={cl.verified}>Validé GPS + OBD</Text>
        </View>
      </View>

      {/* Sélecteur d'épreuve + catégorie. */}
      <Tappable
        onPress={() => {
          // Faire défiler les épreuves : plus rapide qu'un menu déroulant pour
          // quatre valeurs, et ça fonctionne au pouce.
          const i = RUN_MODES.findIndex((m) => m.mode === mode);
          setMode(RUN_MODES[(i + 1) % RUN_MODES.length].mode);
        }}
        label="Changer d'épreuve"
        style={cl.picker}
        scaleTo={0.99}
      >
        <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>
          {mode} · {vehicle.label.replace(/^Seat /, '')} · {prepLabel}
        </Txt>
        <ChevronDown size={16} color={colors.text2} />
      </Tappable>

      <View style={cl.chips}>
        {SCOPES.map((s) => (
          <Chip key={s.value} label={s.label} active={scope === s.value} onPress={() => setScope(s.value)} />
        ))}
      </View>

      {/* Les portées non branchées le disent franchement. */}
      {scope !== 'mine' ? (
        <FadeInUp>
          <Card tone="info" style={{ flexDirection: 'row', gap: space.md }}>
            <InfoCircle size={22} color={colors.info} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>Pas encore branché</Txt>
              <Txt style={{ fontSize: 13, lineHeight: 18, color: colors.text3 }}>
                Le classement entre pilotes demande un compte et un serveur, prévus dans une prochaine étape.
                En attendant, « Mes runs » te classe contre toi-même, séance par séance — c'est déjà la
                comparaison la plus utile.
              </Txt>
            </View>
          </Card>
        </FadeInUp>
      ) : entries.length === 0 ? (
        <FadeInUp>
          <Card style={{ gap: 6 }}>
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>Aucun temps en {mode}</Txt>
            <Dim style={{ fontSize: 13, lineHeight: 18 }}>
              Fais au moins un run dans cette épreuve pour apparaître ici.
            </Dim>
          </Card>
        </FadeInUp>
      ) : (
        <View>
          {entries.map((e, i) => (
            <FadeInUp key={`${e.rank}-${e.name}`} delay={i * 50}>
              <View style={cl.row}>
                <Num style={[cl.pos, e.rank === 1 && { color: colors.ok }]}>{e.rank}</Num>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={{ fontFamily: fonts.bodyBold }} numberOfLines={1}>{e.name}</Txt>
                  <Dim style={{ fontSize: 12 }} numberOfLines={1}>{e.detail}</Dim>
                </View>
                <Num style={{ fontSize: 24 }}>{fr(e.timeS)}</Num>
              </View>
            </FadeInUp>
          ))}
        </View>
      )}

      {/* Ma position, toujours visible. */}
      {scope === 'mine' && mine ? (
        <Card tone="ok" style={cl.mine}>
          <Num style={[cl.pos, { color: colors.ok }]}>{mine.rank}</Num>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontFamily: fonts.bodyBold }}>{pseudo || 'Toi'}</Txt>
            <Dim style={{ fontSize: 12 }}>Ton meilleur temps en {mode}</Dim>
          </View>
          <Num style={{ fontSize: 24, color: colors.ok, fontFamily: fonts.numBlack }}>{fr(mine.timeS)}</Num>
        </Card>
      ) : null}

      {!settings.showInRanking ? (
        <Dim style={{ fontSize: 12, textAlign: 'center' }}>
          Tu as désactivé « Apparaître au classement » dans les réglages : tes temps resteront privés quand
          le classement en ligne arrivera.
        </Dim>
      ) : null}
    </Screen>
  );
}

const cl = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28 },
  verified: { color: colors.info, fontFamily: fonts.bodyBold, fontSize: 12 },
  picker: {
    minHeight: tap.row,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  pos: { width: 28, fontFamily: fonts.numBlack, fontSize: 22, color: colors.text2 },
  mine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    marginTop: space.sm,
  },
});
