/**
 * layouts.tsx — le chrome du site : vitrine publique, espace client, espace
 * mappeur. Sur ordinateur une barre latérale, sur téléphone la barre
 * d'onglets du bas, comme dans l'app.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { auth, useAuth } from '~/auth/session';
import { getProfile, mapperInbox, type ProfileRow } from '~/data/api';
import { useQuery, type Query } from '~/data/useQuery';
import { Loading } from './components';
import { Car, Inbox, Logo, Logout, Stopwatch, TabCharts, TabRanking, Users, Gear } from './icons';

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Tarmac, accueil">
      <Logo size={26} />
      <span>Tarmac</span>
    </Link>
  );
}

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Brand />
          <nav className="nav">
            <NavLink to="/telecharger">Télécharger</NavLink>
            <NavLink to="/classement" className="hide-sm">Classement</NavLink>
            <NavLink to="/mappeurs" className="hide-sm">Mappeurs</NavLink>
            {user ? <NavLink to="/app">Mon espace</NavLink> : <NavLink to="/connexion">Connexion</NavLink>}
          </nav>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="wrap between" style={{ flexWrap: 'wrap' }}>
          <div className="row8"><Logo size={18} /><span>Tarmac — chronos, logs et santé moteur depuis la prise OBD.</span></div>
          <div className="row12">
            <Link to="/telecharger">Télécharger</Link>
            <Link to="/classement">Classement</Link>
            <Link to="/mappeurs">Mappeurs</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

/** Redirige vers la connexion, en gardant la page demandée pour y revenir. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!user && !ready) return <Loading />;
  if (!user) return <Navigate to={`/connexion?suite=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

interface Space {
  profile: Query<ProfileRow | null>;
}

const SpaceContext = createContext<Space | null>(null);

export function useSpace(): Space {
  const s = useContext(SpaceContext);
  if (!s) throw new Error('useSpace hors de AppLayout');
  return s;
}

interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number }

export function AppLayout({ mode }: { mode: 'client' | 'mappeur' }) {
  const { user } = useAuth();
  const profile = useQuery(getProfile, [user?.id]);
  const isMapper = profile.data?.is_mapper ?? false;
  const inbox = useQuery(
    () => (isMapper && user ? mapperInbox(user.email) : Promise.resolve([])),
    [isMapper, user?.email],
  );
  const unread = (inbox.data ?? []).filter((s) => s.status === 'envoye').length;

  if (mode === 'mappeur' && profile.data && !isMapper) return <Navigate to="/app/compte?mappeur=1" replace />;

  const client: NavItem[] = [
    { to: '/app', label: 'Logs', icon: <TabCharts />, end: true },
    { to: '/app/runs', label: 'Runs', icon: <Stopwatch /> },
    { to: '/app/garage', label: 'Garage', icon: <Car /> },
    { to: '/classement', label: 'Classement', icon: <TabRanking /> },
    { to: '/app/compte', label: 'Compte', icon: <Gear /> },
  ];
  const mapper: NavItem[] = [
    { to: '/mappeur', label: 'Reçus', icon: <Inbox />, end: true, badge: unread },
    { to: '/mappeur/clients', label: 'Clients', icon: <Users /> },
    { to: '/app/compte', label: 'Compte', icon: <Gear /> },
  ];
  const items = mode === 'mappeur' ? mapper : client;

  return (
    <SpaceContext.Provider value={{ profile }}>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          {isMapper ? (
            <div className="segmented" style={{ marginBottom: 12 }}>
              <NavLink to="/app" className={() => (mode === 'client' ? 'active' : '')} style={segLink(mode === 'client')}>Pilote</NavLink>
              <NavLink to="/mappeur" className={() => (mode === 'mappeur' ? 'active' : '')} style={segLink(mode === 'mappeur')}>Mappeur</NavLink>
            </div>
          ) : null}
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="side-link">
              {i.icon}
              {i.label}
              {i.badge ? <span className="badge">{i.badge}</span> : null}
            </NavLink>
          ))}
          <div className="side-foot">
            <div className="dim small ellipsis" title={user?.email}>{user?.email}</div>
            <button type="button" className="side-link" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => void auth.signOut()}>
              <Logout />Déconnexion
            </button>
          </div>
        </aside>
        <main className="main">
          <div className="main-inner">
            <Outlet />
          </div>
        </main>
        <nav className="bottom-nav">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              {i.icon}
              {i.label}
            </NavLink>
          ))}
          {isMapper ? (
            <NavLink to={mode === 'mappeur' ? '/app' : '/mappeur'}>
              {mode === 'mappeur' ? <TabCharts /> : <Inbox />}
              {mode === 'mappeur' ? 'Pilote' : 'Mappeur'}
            </NavLink>
          ) : null}
        </nav>
      </div>
    </SpaceContext.Provider>
  );
}

const segLink = (active: boolean): React.CSSProperties => ({
  flex: 1,
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 14,
  background: active ? 'var(--text)' : 'transparent',
  color: active ? 'var(--bg)' : 'var(--text2)',
});
