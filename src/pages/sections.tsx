/**
 * sections.tsx — les blocs de la vitrine : réassurance, chiffres, parcours,
 * compatibilité, données, FAQ, appel final.
 *
 * Règle de l'app reprise ici : aucun chiffre ni promesse inventés. Les
 * nombres viennent du code de l'app (épreuves, grandeurs, codes documentés,
 * opérations d'entretien), les affirmations techniques de son fonctionnement
 * réel (lecture seule, sécurité par ligne, hébergement à Francfort).
 */
import type { ReactNode } from 'react';
import { DEFAULT_LOG_KEYS } from '@/log/logFormat';
import { DOCUMENTED_CODE_COUNT } from '@/obd/dtcLibrary';
import { MAINTENANCE_ITEMS } from '@/health/maintenance';
import { RUN_MODES } from '@/run/types';
import { Card, GhostButton, PrimaryButton } from '~/ui/components';
import { Check, Close, Download, Dongle, Shield, Users } from '~/ui/icons';

/* ─────────────────────────── Réassurance ─────────────────────────── */

export function TrustStrip() {
  return (
    <div className="trust">
      <span><Shield size={16} />Lecture seule, jamais la carto</span>
      <span><Check size={16} />Compte facultatif</span>
      <span><Check size={16} />Fonctionne hors réseau</span>
      <span><Check size={16} />Données hébergées en Europe</span>
    </div>
  );
}

export function Figures() {
  const items = [
    { v: RUN_MODES.length, l: 'épreuves chronométrées', ok: true },
    { v: DEFAULT_LOG_KEYS.length, l: 'grandeurs par log' },
    { v: DOCUMENTED_CODE_COUNT, l: 'codes défaut expliqués en français' },
    { v: MAINTENANCE_ITEMS.length, l: 'opérations d’entretien suivies' },
  ];
  return (
    <section className="band">
      <div className="wrap figures">
        {items.map((i) => (
          <div key={i.l} className="figure">
            <div className={`num-black${i.ok ? ' ok' : ''}`}>{i.v}</div>
            <div className="dim small">{i.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionHead({ kicker, title, children, id }: { kicker: string; title: string; children?: ReactNode; id?: string }) {
  return (
    <div className="section-head" id={id}>
      <span className="kicker">{kicker}</span>
      <h2 className="h1">{title}</h2>
      {children ? <p className="dim" style={{ margin: 0, fontSize: 17 }}>{children}</p> : null}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="wrap stack" style={{ gap: 20, paddingTop: 64 }}>
      <SectionHead kicker="En trois gestes" title="Du boîtier au diagnostic">
        Pas de câble, pas d’ordinateur dans la voiture. Le téléphone suffit.
      </SectionHead>
      <div className="flow">
        <Card>
          <div className="stack-sm">
            <h3 className="h2" style={{ fontSize: 18 }}>Branche le boîtier</h3>
            <p className="dim" style={{ margin: 0 }}>Sur la prise OBD, sous le volant. L’app le trouve, teste ce qu’il sait faire et retient ses réglages.</p>
          </div>
        </Card>
        <Card>
          <div className="stack-sm">
            <h3 className="h2" style={{ fontSize: 18 }}>Roule, mesure, enregistre</h3>
            <p className="dim" style={{ margin: 0 }}>Le départ est détecté seul. Chaque run et chaque log sont enregistrés sur le téléphone, même sans réseau.</p>
          </div>
        </Card>
        <Card>
          <div className="stack-sm">
            <h3 className="h2" style={{ fontSize: 18 }}>Comprends, partage</h3>
            <p className="dim" style={{ margin: 0 }}>Les pertes sont expliquées poste par poste. Un log intéressant ? Envoie-le à ton préparateur en un clic.</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function Compatibility() {
  return (
    <section className="wrap" style={{ paddingTop: 64 }}>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <SectionHead kicker="Compatibilité" title="Ta voiture a sûrement déjà la prise">
            La prise de diagnostic OBD-II (EOBD en Europe) est obligatoire sur les voitures essence vendues neuves depuis
            2001 et diesel depuis 2004.
          </SectionHead>
          <ul className="checklist">
            <li><Check size={18} />Essence depuis 2001, diesel depuis 2004 (Europe)</li>
            <li><Check size={18} />Boîtier ELM327 en Bluetooth Low Energy : Android et iPhone</li>
            <li><Check size={18} />Boîtier ELM327 en Wi-Fi : Android et iPhone</li>
            <li><Check size={18} />Boîtier ELM327 en Bluetooth classique : Android</li>
            <li className="no"><Close size={18} />Bluetooth classique sur iPhone : iOS ne l’autorise pas</li>
          </ul>
        </div>
        <Card>
          <div className="stack">
            <div className="feature"><div className="icon"><Dongle /></div></div>
            <h3 className="h2" style={{ fontSize: 18 }}>Les clones bon marché fonctionnent</h3>
            <p className="dim" style={{ margin: 0 }}>
              Deux boîtiers vendus sous la même étiquette peuvent se comporter très différemment. À la première connexion,
              l’app fait passer un petit examen au tien et n’active chaque optimisation que si elle fonctionne vraiment.
              Un boîtier lent mais stable vaut mieux qu’un boîtier rapide qui décroche.
            </p>
            <p className="dim small" style={{ margin: 0 }}>
              Les grandeurs disponibles dépendent aussi de la voiture : l’app n’affiche que ce que ton calculateur
              transmet réellement, sans valeur inventée.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function DataPromise() {
  const points = [
    { t: 'Lecture seule', d: 'L’app n’envoie au calculateur que des demandes de lecture normalisées. Seul l’effacement des codes défaut est possible, et uniquement après ta confirmation.' },
    { t: 'Tes données sont à toi', d: 'Chaque ligne de la base n’est lisible que par son propriétaire. La règle est appliquée par la base elle-même, pas par l’application.' },
    { t: 'Partage maîtrisé', d: 'Ton mappeur ne voit que les logs que tu lui envoies, en lecture seule. Tu retires l’accès quand tu veux.' },
    { t: 'Classement discret', d: 'Ton pseudo et ton temps, rien d’autre : ni VIN, ni position, ni identifiant de compte. Et seulement si tu l’acceptes.' },
    { t: 'Hébergé en Europe', d: 'Base de données à Francfort (Allemagne), échanges chiffrés en HTTPS.' },
    { t: 'Sans compte, aussi', d: 'Le compte sert à sauvegarder et à partager. Sans lui, tout fonctionne sur le téléphone.' },
  ];
  return (
    <section className="wrap stack" style={{ gap: 20, paddingTop: 64 }}>
      <SectionHead kicker="Confiance" title="Ta voiture et tes données, protégées par conception" />
      <div className="grid3">
        {points.map((p) => (
          <Card key={p.t}>
            <div className="stack-sm">
              <div className="row8"><Shield size={18} color="var(--ok)" /><span className="bold">{p.t}</span></div>
              <p className="dim small" style={{ margin: 0 }}>{p.d}</p>
            </div>
          </Card>
        ))}
      </div>
      <a href="/securite" className="ok semi">En savoir plus sur la sécurité →</a>
    </section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

export interface FaqItem { q: string; a: ReactNode }

export function Faq({ items, title = 'Questions fréquentes', kicker = 'FAQ', id = 'faq' }: { items: FaqItem[]; title?: string; kicker?: string; id?: string }) {
  return (
    <section className="wrap stack" style={{ gap: 20, paddingTop: 64, maxWidth: 860 }} id={id}>
      <SectionHead kicker={kicker} title={title} />
      <div className="faq">
        {items.map((i) => (
          <details key={i.q}>
            <summary>{i.q}</summary>
            <div className="answer">{i.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

export const FAQ_GENERAL: FaqItem[] = [
  {
    q: 'Tarmac peut-il modifier ou abîmer mon moteur ?',
    a: (
      <>
        <p>Non. L’app ne pose au calculateur que des questions de lecture normalisées : grandeurs moteur, codes défaut, numéro de série. Tout le reste est refusé avant même de partir vers la voiture.</p>
        <p>La seule action possible est l’effacement des codes défaut, et seulement après ta confirmation explicite. Tarmac ne touche jamais à la cartographie.</p>
      </>
    ),
  },
  {
    q: 'Ma voiture est-elle compatible ?',
    a: <p>En Europe, toutes les voitures essence vendues neuves depuis 2001 et diesel depuis 2004 ont la prise OBD-II. Certaines grandeurs (pression de turbo, avance, température de boîte) dépendent du modèle : l’app détecte ce que ta voiture transmet et n’affiche que ce qu’elle reçoit vraiment.</p>,
  },
  {
    q: 'Quel boîtier acheter ?',
    a: <p>Un boîtier ELM327 en Bluetooth Low Energy est le plus polyvalent : il fonctionne sur Android et sur iPhone. Le Wi-Fi marche aussi sur les deux. Le Bluetooth classique ne fonctionne que sur Android. Inutile de viser le plus cher : l’app s’adapte aux capacités réelles du tien.</p>,
  },
  {
    q: 'Les chronos sont-ils fiables ?',
    a: (
      <>
        <p>La vitesse vient du GPS du téléphone ou de la voiture, le départ est détecté automatiquement et les intermédiaires sont calculés par interpolation entre deux mesures, jamais arrondis à la plus proche. Chaque run garde la précision GPS, la fréquence de mesure et le dénivelé : l’app te dit quand une mesure est moins fiable.</p>
        <p>Le temps est aussi corrigé de la température, de la pression et de l’humidité, pour comparer honnêtement un run d’été et un run d’hiver.</p>
      </>
    ),
  },
  {
    q: 'Faut-il créer un compte ?',
    a: <p>Non. Tout fonctionne sur le téléphone sans compte. Le compte sert à sauvegarder tes runs et tes logs en ligne, à les retrouver sur ce site, à changer de téléphone, à apparaître au classement et à envoyer tes logs à ton préparateur.</p>,
  },
  {
    q: 'Et sans réseau, sur circuit ?',
    a: <p>Aucun problème : chaque mesure est enregistrée sur le téléphone. La synchronisation se fait toute seule au retour du réseau.</p>,
  },
  {
    q: 'Qui peut voir mes données ?',
    a: <p>Toi seul. La base de données n’autorise chaque ligne qu’à son propriétaire. Ton mappeur ne voit que les logs que tu lui envoies, en lecture seule. Le classement n’affiche que ton pseudo et ton temps, si tu as choisi d’y apparaître.</p>,
  },
  {
    q: 'Où sont hébergées mes données ?',
    a: <p>En Europe, à Francfort (Allemagne). Les échanges entre l’app, le site et la base sont chiffrés en HTTPS.</p>,
  },
  {
    q: 'Puis-je reprendre un log que j’ai envoyé ?',
    a: <p>Oui. Sur la page du log, « Retirer le partage » coupe l’accès du mappeur immédiatement.</p>,
  },
  {
    q: 'Pourquoi l’app n’est-elle pas sur les stores ?',
    a: <p>Tarmac est en phase de test. Sur Android, l’app s’installe directement depuis la page Télécharger. Sur iPhone, elle s’installe sur invitation. Les mises à jour arrivent ensuite directement dans l’app.</p>,
  },
  {
    q: 'Le classement est-il obligatoire ?',
    a: <p>Non. C’est un réglage de ton compte, que tu changes quand tu veux. Les runs restent dans ton historique dans tous les cas.</p>,
  },
  {
    q: 'Où faire mes runs ?',
    a: <p>Sur circuit ou sur un terrain fermé à la circulation. Sur route ouverte, le code de la route s’applique : l’app sert aussi à surveiller la santé de ton moteur au quotidien, sans jamais pousser la voiture.</p>,
  },
];

export const FAQ_MAPPER: FaqItem[] = [
  {
    q: 'Dois-je installer l’app ?',
    a: <p>Non. Tout l’espace mappeur est sur ce site : réception, visionneuse, comparaison, réponses. L’app ne te sert que si tu veux enregistrer ta propre voiture.</p>,
  },
  {
    q: 'Comment mes clients m’envoient-ils un log ?',
    a: <p>Ils renseignent ton adresse e-mail dans la fiche de leur véhicule, ou la saisissent au moment de l’envoi. Le log arrive dans ta boîte de réception dès que tu as un compte mappeur avec cette adresse, confirmée par code.</p>,
  },
  {
    q: 'Qu’est-ce que je reçois exactement ?',
    a: <p>Le log complet, avec toutes ses grandeurs et ses repères, le message du client, et la fiche du véhicule : préparation, poids, pneus, numéro de série s’il est renseigné, boîtier utilisé.</p>,
  },
  {
    q: 'Le CSV s’ouvre-t-il dans mes outils ?',
    a: <p>Oui. C’est un CSV séparé par des points-virgules, une colonne par grandeur avec son unité dans le nom, et un en-tête qui décrit le contexte. Il s’ouvre dans n’importe quel tableur.</p>,
  },
  {
    q: 'Puis-je modifier les données d’un client ?',
    a: <p>Non, tout est en lecture seule. Tu ne modifies que le statut du dossier et ta réponse, que ton client lit sur son log.</p>,
  },
  {
    q: 'Et si mon client retire le partage ?',
    a: <p>Le log disparaît de ta boîte de réception. Pense à exporter le CSV si tu as besoin de le garder pour ton suivi.</p>,
  },
];

export const FAQ_INSTALL: FaqItem[] = [
  {
    q: 'Android bloque l’installation',
    a: <p>Une app installée hors store demande une autorisation : Android propose d’autoriser ton navigateur à installer des applications. Accepte pour cette installation. Si une protection affiche un avertissement, c’est normal pour une app hors store : choisis d’installer quand même.</p>,
  },
  {
    q: 'Comment recevoir les mises à jour ?',
    a: <p>Elles arrivent directement dans l’app, qui te propose de redémarrer quand une nouvelle version est prête. Pas besoin de retélécharger l’APK pour les corrections courantes.</p>,
  },
  {
    q: 'Je n’ai pas encore de boîtier',
    a: <p>Dans les réglages de l’app, active le « boîtier simulé (mode démo) » : une voiture virtuelle te permet de découvrir tous les écrans, de lancer un run et d’enregistrer un log avant d’acheter quoi que ce soit.</p>,
  },
];

/* ─────────────────────────── Appel final ─────────────────────────── */

export function FinalCta() {
  return (
    <section className="wrap" style={{ paddingTop: 64 }}>
      <Card tone="ok">
        <div className="cta-final">
          <span className="kicker">Prêt pour le premier run</span>
          <h2 className="h1" style={{ maxWidth: 640 }}>Branche le boîtier. Tarmac s’occupe du reste.</h2>
          <p style={{ margin: 0, color: 'var(--text3)', maxWidth: 560 }}>Installation directe pendant la phase de test, sans compte obligatoire.</p>
          <div className="wrap-row" style={{ justifyContent: 'center', gap: 12 }}>
            <PrimaryButton title="Télécharger l’app" icon={<Download />} href="/telecharger" />
            <GhostButton title="Espace mappeur" icon={<Users size={18} />} to="/mappeurs" />
          </div>
        </div>
      </Card>
    </section>
  );
}
