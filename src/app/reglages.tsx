/**
 * reglages.tsx — profil et réglages (maquette « Profil et réglages »).
 *
 * Les réglages sont regroupés par intention, pas par mécanisme : « Garage &
 * boîtier », « Alertes moteur », « Communauté », « Unités ». Un utilisateur ne
 * cherche pas « la configuration du transport BLE », il cherche « mon
 * boîtier ».
 *
 * Deux sections s'ajoutent à la maquette parce que la réalité technique les
 * impose :
 *   · **Connexion** : protocole, reconnexion automatique, service au premier
 *     plan — ce sont les trois réglages qui décident si la liaison tient ;
 *   · **Mise à jour** : l'app se met à jour à la volée, l'utilisateur doit
 *     pouvoir voir sa version et déclencher la vérification à la main.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Card,
  Dim,
  Field,
  GhostButton,
  Header,
  Num,
  Row,
  Screen,
  Segmented,
  Switch,
  Tappable,
  Txt,
} from '@/ui/components';
import { FadeInUp } from '@/ui/motion';
import { ChevronDown, Refresh, Terminal, Trash } from '@/ui/icons';
import { colors, fonts, space } from '@/ui/tokens';
import { useAppStore } from '@/store/appStore';
import { useConnection } from '@/store/useConnection';
import { connection } from '@/connection/ConnectionManager';
import { forgetLastDevice } from '@/store/storage';
import { describeUpdate, useAppUpdate } from '@/update/appUpdate';
import { PIDS } from '@/obd/pids';
import { VAG_DIDS } from '@/obd/vagDids';

export default function Reglages() {
  const { settings, setSettings, pseudo, setPseudo, vehicle, runs } = useAppStore();
  const conn = useConnection();
  const update = useAppUpdate();
  const updateInfo = describeUpdate(update.state);

  const initials = (pseudo || 'TU').slice(0, 2).toUpperCase();
  const connected = conn.phase === 'ready' || conn.phase === 'polling';

  return (
    <Screen scroll style={rg.screen}>
      <Header title="Réglages" onBack={() => router.back()} />

      {/* Profil. */}
      <View style={rg.profile}>
        <Num style={rg.avatar}>{initials}</Num>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 18 }}>{pseudo || 'Sans pseudo'}</Txt>
          <Dim style={{ fontSize: 13 }}>
            {runs.length} run{runs.length > 1 ? 's' : ''} ·{' '}
            {runs.length > 0
              ? `depuis ${new Date(runs[runs.length - 1].startedAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`
              : 'aucun run enregistré'}
          </Dim>
        </View>
      </View>

      <Field
        label="Pseudo (affiché au classement)"
        value={pseudo}
        onChangeText={setPseudo}
        placeholder="ex. 974_Launch"
      />

      {/* Garage & boîtier. */}
      <Section title="Garage & boîtier">
        <Row first onPress={() => router.push('/garage')}>
          <Txt style={{ flex: 1 }}>{vehicle.label}</Txt>
          <Dim style={{ fontSize: 13 }}>
            {vehicle.prep === 'stage1' ? 'Stage 1' : vehicle.prep === 'stage2' ? 'Stage 2' : vehicle.prep === 'origine' ? 'Origine' : 'Autre'}
          </Dim>
          <ChevronDown size={16} color={colors.text2} />
        </Row>
        <Row onPress={() => router.push('/appairage')}>
          <Txt style={{ flex: 1 }}>{conn.device?.name ?? vehicle.dongleName ?? 'Aucun boîtier'}</Txt>
          <Dim style={{ fontSize: 13, color: connected ? colors.ok : colors.text2 }}>{conn.message}</Dim>
        </Row>
        {conn.caps.version !== '?' ? (
          <Row>
            <Txt style={{ flex: 1 }}>Version annoncée</Txt>
            <Dim style={{ fontSize: 13 }}>{conn.caps.version}</Dim>
          </Row>
        ) : null}
      </Section>

      {/* Connexion : les trois réglages qui font la fiabilité. */}
      <Section title="Connexion">
        <View style={{ gap: space.sm, paddingVertical: space.md }}>
          <Dim style={rg.lbl}>Protocole du bus</Dim>
          <Segmented
            label="Protocole du bus"
            options={[
              { value: 'vw-can', label: 'VW CAN 500k' },
              { value: 'auto', label: 'Automatique' },
            ]}
            value={settings.protocol}
            onChange={(protocol) => setSettings({ protocol })}
          />
          <Dim style={{ fontSize: 12, lineHeight: 17 }}>
            « VW CAN 500k » impose ISO 15765-4 (CAN 11 bits, 500 kbit/s) : c'est le bus des VW récentes, et
            l'imposer évite une recherche automatique qui peut prendre plusieurs secondes. Passe en
            « Automatique » pour une autre voiture.
          </Dim>
        </View>

        <Row>
          <View style={{ flex: 1 }}>
            <Txt>Reconnexion automatique</Txt>
            <Dim style={{ fontSize: 12 }}>Reprend le dernier boîtier à l'ouverture de l'app.</Dim>
          </View>
          <Switch
            label="Reconnexion automatique"
            value={settings.autoReconnect}
            onChange={(autoReconnect) => setSettings({ autoReconnect })}
          />
        </Row>

        {Platform.OS === 'android' ? (
          <Row>
            <View style={{ flex: 1 }}>
              <Txt>Garder la liaison écran éteint</Txt>
              <Dim style={{ fontSize: 12 }}>
                Affiche une notification permanente. Sans elle, Android coupe le Bluetooth dès que l'écran
                s'éteint.
              </Dim>
            </View>
            <Switch
              label="Garder la liaison écran éteint"
              value={settings.foregroundService}
              onChange={(foregroundService) => setSettings({ foregroundService })}
            />
          </Row>
        ) : null}

        <Row>
          <View style={{ flex: 1 }}>
            <Txt>Boîtier simulé (mode démo)</Txt>
            <Dim style={{ fontSize: 12 }}>
              « Sage » imite la future Tarmac Box, « clone » un boîtier du commerce, « cauchemar » un clone
              qui décroche toutes les 25 s — c'est ainsi qu'on teste la reconnexion.
            </Dim>
          </View>
        </Row>
        <View style={{ paddingBottom: space.md }}>
          <Segmented
            label="Profil du boîtier simulé"
            options={[
              { value: 'sage', label: 'Sage' },
              { value: 'clone', label: 'Clone' },
              { value: 'cauchemar', label: 'Cauchemar' },
            ]}
            value={settings.mockProfile}
            onChange={(mockProfile) => setSettings({ mockProfile })}
          />
        </View>
      </Section>

      {/* Alertes moteur. */}
      <Section title="Alertes moteur">
        <Row first>
          <Txt style={{ flex: 1 }}>Cliquetis</Txt>
          <Switch label="Alerte cliquetis" value={settings.alertKnock} onChange={(alertKnock) => setSettings({ alertKnock })} />
        </Row>
        <Row>
          <Txt style={{ flex: 1 }}>Températures</Txt>
          <Switch label="Alerte températures" value={settings.alertTemps} onChange={(alertTemps) => setSettings({ alertTemps })} />
        </Row>
        <Row>
          <Txt style={{ flex: 1 }}>Mélange trop pauvre</Txt>
          <Switch label="Alerte mélange pauvre" value={settings.alertLean} onChange={(alertLean) => setSettings({ alertLean })} />
        </Row>
      </Section>

      {/* Grandeurs interrogées. */}
      <Section title="Grandeurs interrogées">
        <Row first>
          <View style={{ flex: 1 }}>
            <Txt>Tout interroger</Txt>
            <Dim style={{ fontSize: 12 }}>
              {settings.enabledPids.length === 0
                ? `Les ${PIDS.length} grandeurs standard, filtrées par ce que ton moteur sait fournir.`
                : `${settings.enabledPids.length} grandeurs sélectionnées.`}
            </Dim>
          </View>
          <Switch
            label="Tout interroger"
            value={settings.enabledPids.length === 0}
            onChange={(all) => setSettings({ enabledPids: all ? [] : PIDS.filter((p) => p.rate === 'fast').map((p) => p.pid) })}
          />
        </Row>
        {settings.enabledPids.length > 0
          ? PIDS.map((p) => (
              <Row key={p.pid}>
                <Txt style={{ flex: 1 }}>{p.label}</Txt>
                <Dim style={{ fontSize: 12 }}>{p.unit}</Dim>
                <Switch
                  label={p.label}
                  value={settings.enabledPids.includes(p.pid)}
                  onChange={(on) =>
                    setSettings({
                      enabledPids: on
                        ? [...settings.enabledPids, p.pid]
                        : settings.enabledPids.filter((x) => x !== p.pid),
                    })
                  }
                />
              </Row>
            ))
          : null}
        <Row>
          <View style={{ flex: 1 }}>
            <Txt>Grandeurs constructeur VAG</Txt>
            <Dim style={{ fontSize: 12, lineHeight: 17 }}>
              {VAG_DIDS.filter((d) => d.enabled).length} sur {VAG_DIDS.length} activées. Les autres portent
              des identifiants non vérifiés sur la voiture d'essai : ils restent désactivés jusqu'à
              confirmation (température de boîte DSG, cliquetis par cylindre…).
            </Dim>
          </View>
        </Row>
      </Section>

      {/* Communauté. */}
      <Section title="Communauté">
        <Row first>
          <Txt style={{ flex: 1 }}>Apparaître au classement</Txt>
          <Switch
            label="Apparaître au classement"
            value={settings.showInRanking}
            onChange={(showInRanking) => setSettings({ showInRanking })}
          />
        </Row>
        <Row>
          <Txt style={{ flex: 1 }}>Masquer le lieu de mes runs</Txt>
          <Switch
            label="Masquer le lieu de mes runs"
            value={settings.hideRunLocation}
            onChange={(hideRunLocation) => setSettings({ hideRunLocation })}
          />
        </Row>
      </Section>

      {/* Unités : une seule ligne, parce qu'on n'en change jamais ici. */}
      <Section title="Unités">
        <Row first>
          <Txt style={{ flex: 1 }}>Vitesse · Température · Pression</Txt>
          <Dim style={{ fontSize: 13 }}>km/h · °C · bar</Dim>
        </Row>
      </Section>

      {/* Mise à jour de l'app. */}
      <Section title="Mise à jour">
        <Row first onPress={() => void update.check()}>
          <Refresh size={20} color={update.state.pending ? colors.info : colors.text2} />
          <View style={{ flex: 1 }}>
            <Txt>{updateInfo.title}</Txt>
            <Dim style={{ fontSize: 12, lineHeight: 17 }}>{updateInfo.detail}</Dim>
          </View>
        </Row>
        {update.state.pending ? (
          <View style={{ paddingVertical: space.md }}>
            <GhostButton
              title={update.state.blockedByConnection ? 'Déconnecte le boîtier pour appliquer' : 'Redémarrer et appliquer'}
              disabled={update.state.blockedByConnection}
              onPress={() => void update.apply()}
            />
          </View>
        ) : null}
        <Row>
          <Txt style={{ flex: 1 }}>Canal</Txt>
          <Dim style={{ fontSize: 13 }}>{update.state.channel}</Dim>
        </Row>
        <Row>
          <Txt style={{ flex: 1 }}>Socle natif</Txt>
          <Dim style={{ fontSize: 13 }}>{update.state.runtimeVersion}</Dim>
        </Row>
      </Section>

      {/* Diagnostic. */}
      <Section title="Diagnostic">
        <Row first onPress={() => router.push('/console')}>
          <Terminal size={20} color={colors.text2} />
          <Txt style={{ flex: 1 }}>Console de diagnostic</Txt>
          <ChevronDown size={16} color={colors.text2} />
        </Row>
        <Row onPress={() => router.push('/live')}>
          <Txt style={{ flex: 1 }}>Données en direct</Txt>
          <ChevronDown size={16} color={colors.text2} />
        </Row>
        <Row onPress={() => router.push('/aide-boitier')}>
          <Txt style={{ flex: 1 }}>Mon boîtier n'apparaît pas</Txt>
          <ChevronDown size={16} color={colors.text2} />
        </Row>
        <Row
          onPress={() => {
            // On oublie le boîtier mémorisé : utile quand on change de voiture
            // ou quand un profil BLE mémorisé est devenu faux.
            forgetLastDevice();
            void connection.disconnect();
          }}
        >
          <Trash size={20} color={colors.warnText} />
          <Txt style={{ flex: 1, color: colors.warnText }}>Oublier le boîtier mémorisé</Txt>
        </Row>
      </Section>

      <Dim style={{ fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: space.lg }}>
        Tarmac · version {update.state.currentId}
        {'\n'}À utiliser uniquement sur circuit ou piste fermée.
      </Dim>
    </Screen>
  );
}

/** Un groupe de réglages avec son sur-titre. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <FadeInUp>
      <View style={{ gap: space.sm }}>
        <Dim style={rg.section}>{title}</Dim>
        <Card style={{ paddingVertical: 0, paddingHorizontal: space.lg }}>{children}</Card>
      </View>
    </FadeInUp>
  );
}

const rg = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ok,
    color: colors.bg,
    fontFamily: fonts.numBlack,
    fontSize: 24,
    textAlign: 'center',
    lineHeight: 56,
  },
  section: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  lbl: { fontFamily: fonts.bodySemi, fontSize: 13 },
});
