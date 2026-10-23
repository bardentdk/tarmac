/**
 * public.tsx — la vitrine : accueil, téléchargement, page mappeurs.
 *
 * Même ton que l'app : on dit ce que ça fait, franchement, sans inventer de
 * chiffres. La maquette de téléphone de l'accueil est marquée « exemple ».
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { config } from '~/config';
import { Card, GhostButton, PrimaryButton, StatusPill } from '~/ui/components';
import { Download, Dongle, Inbox, Shield, Stopwatch, TabCharts, TabHealth, TabRanking, Users, Warning } from '~/ui/icons';

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="stack-md feature">
        <div className="icon">{icon}</div>
        <h3 className="h2" style={{ fontSize: 18 }}>{title}</h3>
        <p className="dim" style={{ margin: 0 }}>{children}</p>
      </div>
    </Card>
  );
}

function PhoneMock() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="between">
        <span className="section">0-100 km/h</span>
        <StatusPill tone="ok" label="RECORD" />
      </div>
      <div className="big-time">6,84<span className="dim" style={{ fontSize: 28, marginLeft: 6 }}>s</span></div>
      <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="tile"><div className="dim tiny">0-50</div><div className="num" style={{ fontSize: 22 }}>2,41</div></div>
        <div className="tile"><div className="dim tiny">60 ft</div><div className="num" style={{ fontSize: 22 }}>2,03</div></div>
        <div className="tile"><div className="dim tiny">Patinage</div><div className="num warn" style={{ fontSize: 22 }}>8 %</div></div>
      </div>
      <svg viewBox="0 0 260 90" width="100%" height="90">
        <g stroke="#262930">{[15, 45, 75].map((y) => <line key={y} x1="0" x2="260" y1={y} y2={y} />)}</g>
        <path d="M0 85 Q40 80 70 58 T140 30 T260 10" fill="none" stroke="#A3A7AE" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M0 85 Q35 76 62 50 T130 22 T260 6" fill="none" stroke="#C6F432" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="card tone-warn" style={{ padding: 12 }}>
        <div className="row8 warn small semi"><Warning size={16} />Avance réduite à 4,2 s</div>
        <div className="small" style={{ color: 'var(--text3)' }}>Admission à 54 °C : montre ce log à ton préparateur.</div>
      </div>
      <div className="dim tiny" style={{ textAlign: 'center' }}>Exemple d’écran</div>
    </div>
  );
}

export function Home() {
  return (
    <main>
      <section className="wrap hero">
        <div className="stack" style={{ gap: 20 }}>
          <span className="kicker">Prise OBD · Bluetooth · Wi-Fi</span>
          <h1 className="h-display">Le chrono ne suffit pas. <span className="ok">Tarmac</span> te dit pourquoi.</h1>
          <p className="lead" style={{ margin: 0 }}>
            Branche un boîtier ELM327, lance un run : 0-100, 402 m, reprises. Tarmac mesure, corrige de la météo,
            enregistre tes logs moteur et les envoie à ton mappeur en un clic.
          </p>
          <div className="wrap-row" style={{ gap: 12 }}>
            <PrimaryButton title="Télécharger l’app" icon={<Download />} href="/telecharger" />
            <GhostButton title="Je suis mappeur" to="/mappeurs" />
          </div>
        </div>
        <PhoneMock />
      </section>

      <section className="wrap stack" style={{ gap: 20, paddingTop: 24 }}>
        <p className="section">Ce que fait l’app</p>
        <div className="grid3">
          <Feature icon={<Stopwatch />} title="Runs mesurés">
            Départ détecté tout seul, temps corrigés de la température et de la pression, intermédiaires et passages de rapport.
          </Feature>
          <Feature icon={<TabCharts />} title="Logs moteur">
            Régime, boost, avance, richesse, températures : un CSV lisible chez n’importe quel préparateur, sans mode d’emploi.
          </Feature>
          <Feature icon={<TabHealth />} title="Santé moteur">
            Un score sur 100, volontairement sévère sur le cliquetis et la dérive des chronos — les deux signaux qui précèdent une casse.
          </Feature>
          <Feature icon={<Warning />} title="Codes défaut expliqués">
            Traduits en français, hiérarchisés, avec ce qu’il faut faire. Pas un code brut « P0171 » qui n’aide personne.
          </Feature>
          <Feature icon={<TabRanking />} title="Classement">
            Ton meilleur temps par épreuve et par niveau de préparation. Facultatif : tu choisis d’y apparaître.
          </Feature>
          <Feature icon={<Shield />} title="Sûr par construction">
            L’app ne lit que des grandeurs normalisées. Aucune écriture dans le calculateur, liste blanche testée.
          </Feature>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 56 }}>
        <Card tone="ok">
          <div className="grid2" style={{ alignItems: 'center' }}>
            <div className="stack-md">
              <span className="kicker">Pour les préparateurs</span>
              <h2 className="h1">Tes clients t’envoient leurs logs. Tu les lis ici.</h2>
              <p style={{ margin: 0, color: 'var(--text3)' }}>
                Fini les CSV par WhatsApp. Chaque log arrive avec la fiche du véhicule et le message du client. Tu traces,
                tu compares avant / après, tu réponds.
              </p>
            </div>
            <div className="row12" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <GhostButton title="Découvrir l’espace mappeur" to="/mappeurs" />
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

export function Telecharger() {
  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 20, maxWidth: 820 }}>
      <span className="kicker">Version de test{config.appVersion ? ` · ${config.appVersion}` : ''}</span>
      <h1 className="h-display" style={{ fontSize: 44 }}>Télécharger Tarmac</h1>
      <p className="dim" style={{ margin: 0, fontSize: 17 }}>
        L’app n’est pas encore sur les stores. Elle se distribue directement, par Expo.
      </p>

      <div className="grid2">
        <Card>
          <div className="stack">
            <div className="between">
              <h2 className="h2">Android</h2>
              <StatusPill tone={config.androidUrl ? 'ok' : 'neutral'} label={config.androidUrl ? 'DISPONIBLE' : 'BIENTÔT'} />
            </div>
            <ol className="steps" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              <li className="step"><span>Télécharge le fichier <span className="bold">.apk</span> depuis ton téléphone.</span></li>
              <li className="step"><span>Ouvre-le. Android demande d’autoriser l’installation depuis ton navigateur : accepte pour cette fois.</span></li>
              <li className="step"><span>Lance Tarmac et branche ton boîtier OBD.</span></li>
            </ol>
            {config.androidUrl ? (
              <PrimaryButton title="Télécharger l’APK" icon={<Download />} href={config.androidUrl} />
            ) : (
              <div className="banner info">Le lien de téléchargement n’est pas encore publié.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="stack">
            <div className="between">
              <h2 className="h2">iPhone</h2>
              <StatusPill tone={config.iosUrl ? 'ok' : 'neutral'} label={config.iosUrl ? 'DISPONIBLE' : 'BIENTÔT'} />
            </div>
            <p className="dim" style={{ margin: 0 }}>
              Sur iPhone, une app hors App Store s’installe par invitation (TestFlight ou appareil enregistré).
              Demande l’accès : on t’envoie le lien.
            </p>
            {config.iosUrl ? <GhostButton title="Installer sur iPhone" onClick={() => { window.location.href = config.iosUrl!; }} /> : null}
          </div>
        </Card>
      </div>

      <Card>
        <div className="row12" style={{ alignItems: 'flex-start' }}>
          <div className="feature"><div className="icon"><Dongle /></div></div>
          <div className="stack-sm">
            <h3 className="h2" style={{ fontSize: 18 }}>Quel boîtier ?</h3>
            <p className="dim" style={{ margin: 0 }}>
              Un ELM327 en Bluetooth Low Energy, Bluetooth classique ou Wi-Fi. Les clones bon marché fonctionnent : l’app
              teste ce que ton boîtier sait faire et n’active que ce qui marche.
            </p>
          </div>
        </div>
      </Card>

      <p className="dim small" style={{ margin: 0 }}>
        Déjà inscrit dans l’app ? Le même compte fonctionne ici : <Link to="/connexion" className="ok">connecte-toi</Link> pour retrouver tes logs et tes runs.
      </p>
    </main>
  );
}

export function Mappeurs() {
  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 24, maxWidth: 980 }}>
      <span className="kicker">Espace mappeur</span>
      <h1 className="h-display" style={{ fontSize: 48 }}>Les logs de tes clients, prêts à lire.</h1>
      <p className="dim" style={{ margin: 0, fontSize: 17, maxWidth: 680 }}>
        Tes clients enregistrent avec l’app et t’envoient leurs logs à ton adresse e-mail. Tu les retrouves ici, rangés,
        avec tout ce qu’il faut pour juger une cartographie.
      </p>
      <div className="grid3">
        <Card><div className="stack-md feature"><div className="icon"><Inbox /></div><h3 className="h2" style={{ fontSize: 18 }}>Boîte de réception</h3><p className="dim" style={{ margin: 0 }}>Chaque log arrive avec le message du client, son véhicule, sa préparation et son boîtier. Statuts : reçu, vu, en cours, traité.</p></div></Card>
        <Card><div className="stack-md feature"><div className="icon"><TabCharts /></div><h3 className="h2" style={{ fontSize: 18 }}>Visionneuse complète</h3><p className="dim" style={{ margin: 0 }}>Zoom sur une plage, deux grandeurs superposées sur deux axes, curseur qui lit toutes les valeurs d’un instant.</p></div></Card>
        <Card><div className="stack-md feature"><div className="icon"><Users /></div><h3 className="h2" style={{ fontSize: 18 }}>Avant / après</h3><p className="dim" style={{ margin: 0 }}>Superpose deux logs d’un même client pour voir ce que la nouvelle carto a changé, grandeur par grandeur.</p></div></Card>
      </div>
      <Card>
        <div className="stack">
          <h2 className="h2">Comment ça marche</h2>
          <ol className="steps" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            <li className="step"><span>Crée ton compte mappeur avec l’adresse e-mail que tes clients connaissent, et confirme-la par le code reçu.</span></li>
            <li className="step"><span>Ton client renseigne cette adresse dans la fiche de son véhicule (« Ton préparateur »), puis envoie un log depuis l’app ou le site.</span></li>
            <li className="step"><span>Le log apparaît dans ta boîte de réception. Tu l’analyses et tu réponds : ton client voit ta réponse sur son log.</span></li>
          </ol>
          <div className="wrap-row" style={{ gap: 12 }}>
            <PrimaryButton title="Créer mon compte mappeur" href="/connexion?mode=inscription&role=mappeur" />
            <GhostButton title="J’ai déjà un compte" to="/connexion?suite=/mappeur" />
          </div>
        </div>
      </Card>
      <p className="dim small" style={{ margin: 0 }}>
        Sécurité : seul le titulaire vérifié d’une adresse voit les logs qui lui sont adressés, en lecture seule. Le client
        peut retirer un partage à tout moment.
      </p>
    </main>
  );
}
