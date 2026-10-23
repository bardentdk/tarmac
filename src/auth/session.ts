/**
 * session.ts — le compte, côté navigateur.
 *
 * Même parcours que l'app mobile (Tarmac/src/auth/session.ts) : inscription,
 * code de vérification par e-mail, connexion, puis un jeton JWT court pour la
 * Data API. La différence tient au cookie : un navigateur ne laisse pas lire
 * `set-cookie`, il le garde lui-même. On ne stocke donc ni cookie ni mot de
 * passe ; on garde l'utilisateur en cache pour afficher l'interface sans
 * attendre, et le jeton JWT en mémoire uniquement.
 */
import { useSyncExternalStore } from 'react';
import { config } from '~/config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSnapshot {
  user: AuthUser | null;
  /** Session vérifiée auprès du serveur depuis l'ouverture de la page. */
  ready: boolean;
  busy: boolean;
  error: string | null;
  pendingEmail: string | null;
}

export class AuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

class VerificationNeeded extends Error {}

/** Marge avant expiration : un jeton qui expire pendant la requête est refusé. */
const JWT_MARGIN_MS = 60 * 1000;
const USER_KEY = 'tarmac.user';

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou mot de passe incorrect.',
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cet e-mail. Connecte-toi.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Un compte existe déjà avec cet e-mail. Connecte-toi.',
  INVALID_EMAIL: 'Cette adresse e-mail n’est pas valide.',
  PASSWORD_TOO_SHORT: 'Mot de passe trop court : 8 caractères minimum.',
  PASSWORD_TOO_LONG: 'Mot de passe trop long.',
  EMAIL_NOT_VERIFIED: 'Confirme d’abord ton adresse : un code t’a été envoyé par e-mail.',
  INVALID_OTP: 'Code incorrect. Vérifie l’e-mail reçu.',
  OTP_EXPIRED: 'Code expiré : demandes-en un nouveau.',
  TOO_MANY_ATTEMPTS: 'Trop d’essais : demande un nouveau code.',
  INVALID_ORIGIN: 'Ce site n’est pas encore autorisé par le serveur de comptes (domaine de confiance Neon Auth manquant).',
  INVALID_HOSTNAME: 'Le relais vers le serveur de comptes est mal configuré (en-tête d’hôte refusé).',
};

function jwtPayload(jwt: string): { exp?: number; sub?: string } {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return {};
  }
}

const jwtExpiry = (jwt: string): number => {
  const exp = jwtPayload(jwt).exp;
  return typeof exp === 'number' ? exp * 1000 : Date.now() + 10 * 60 * 1000;
};

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* stockage indisponible : l'interface attendra le serveur */ }
}

class AuthManager {
  private snapshot: AuthSnapshot = { user: readCachedUser(), ready: false, busy: false, error: null, pendingEmail: null };
  private listeners = new Set<() => void>();
  private jwt: { token: string; expiresAt: number } | null = null;
  private anonymous: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;
  private pendingPassword: string | null = null;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): AuthSnapshot => this.snapshot;

  private set(patch: Partial<AuthSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* ───────────────────────────── Requêtes ───────────────────────────── */

  private async call(
    path: string,
    opts: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<{ data: unknown; headers: Headers }> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${config.authUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: 'include',
        signal: abort.signal,
      });
    } catch {
      throw new AuthError(abort.signal.aborted ? 'Le serveur ne répond pas. Réessaie.' : 'Pas de réseau.');
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }

    if (!response.ok) {
      // Neon Auth répond selon les cas `message` ou `error` : on garde le code
      // dans le texte, c'est lui qui permet de diagnostiquer.
      const body = (data ?? {}) as { code?: string; message?: string; error?: string };
      const detail = body.message || body.error;
      throw new AuthError(
        (body.code && MESSAGES[body.code])
          || (detail ? `${detail}${body.code ? ` (${body.code})` : ''}` : `Refus du serveur (${response.status}).`),
        body.code,
      );
    }
    return { data, headers: response.headers };
  }

  /**
   * Adopte la session que le serveur vient d'ouvrir. Sans jeton de session
   * dans la réponse, c'est que l'adresse attend sa vérification.
   */
  private async adopt(res: { data: unknown }): Promise<void> {
    const body = (res.data ?? {}) as { token?: string | null; user?: Partial<AuthUser> };
    if (!body.token || !body.user?.id) throw new VerificationNeeded();
    const user: AuthUser = { id: body.user.id, email: body.user.email ?? '', name: body.user.name ?? '' };
    writeCachedUser(user);
    this.jwt = null;
    this.pendingPassword = null;
    this.set({ user, ready: true, error: null, pendingEmail: null });
    await this.getAccessToken();
  }

  /** Relit la session au chargement de la page : le cookie est-il toujours valable ? */
  async restore(): Promise<void> {
    try {
      const res = await this.call('/get-session');
      const body = res.data as { user?: Partial<AuthUser> } | null;
      if (body?.user?.id) {
        const user: AuthUser = { id: body.user.id, email: body.user.email ?? '', name: body.user.name ?? '' };
        writeCachedUser(user);
        this.keepJwt(res.headers);
        this.set({ user, ready: true });
      } else {
        writeCachedUser(null);
        this.set({ user: null, ready: true });
      }
    } catch {
      // Hors ligne : on garde l'utilisateur en cache, les requêtes diront le reste.
      this.set({ ready: true });
    }
  }

  /* ───────────────────────────── Actions ───────────────────────────── */

  private async run(task: () => Promise<void>, email?: string, password?: string): Promise<boolean> {
    this.set({ busy: true, error: null });
    try {
      await task();
      return true;
    } catch (e) {
      const needsCode = e instanceof VerificationNeeded || (e instanceof AuthError && e.code === 'EMAIL_NOT_VERIFIED');
      if (needsCode && email) {
        this.pendingPassword = password ?? null;
        this.set({ pendingEmail: email.trim().toLowerCase(), error: null });
        return false;
      }
      this.set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      this.set({ busy: false });
    }
  }

  signUp(name: string, email: string, password: string): Promise<boolean> {
    return this.run(async () => {
      await this.adopt(await this.call('/sign-up/email', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim().toLowerCase(), password },
      }));
    }, email, password);
  }

  signIn(email: string, password: string): Promise<boolean> {
    return this.run(async () => {
      await this.adopt(await this.call('/sign-in/email', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
      }));
    }, email, password);
  }

  verifyEmail(otp: string): Promise<boolean> {
    const email = this.snapshot.pendingEmail;
    const password = this.pendingPassword;
    return this.run(async () => {
      if (!email) throw new AuthError('Aucune adresse en attente de confirmation.');
      const res = await this.call('/email-otp/verify-email', { method: 'POST', body: { email, otp: otp.trim() } });
      const opened = (res.data as { token?: string | null } | null)?.token;
      if (opened) await this.adopt(res);
      else if (password) await this.adopt(await this.call('/sign-in/email', { method: 'POST', body: { email, password } }));
      else this.set({ pendingEmail: null, error: 'Adresse confirmée : connecte-toi.' });
    });
  }

  resendCode(): Promise<boolean> {
    const email = this.snapshot.pendingEmail;
    return this.run(async () => {
      if (!email) return;
      await this.call('/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'email-verification' } });
    });
  }

  cancelVerification(): void {
    this.pendingPassword = null;
    this.set({ pendingEmail: null, error: null });
  }

  async signOut(): Promise<void> {
    try { await this.call('/sign-out', { method: 'POST', body: {} }); } catch { /* sans effet local */ }
    writeCachedUser(null);
    this.jwt = null;
    this.set({ user: null, error: null, pendingEmail: null });
  }

  clearError(): void {
    if (this.snapshot.error) this.set({ error: null });
  }

  /* ─────────────────────────── Jeton pour la base ─────────────────────────── */

  private keepJwt(headers: Headers): void {
    const jwt = headers.get('set-auth-jwt');
    if (jwt) this.jwt = { token: jwt, expiresAt: jwtExpiry(jwt) };
  }

  /** Identifiant du compte tel que la base le lit (`sub` du jeton). */
  async userId(): Promise<string | null> {
    const t = await this.getAccessToken();
    return t ? jwtPayload(t).sub ?? null : null;
  }

  /**
   * Jeton à présenter à la Data API. Connecté : jeton du compte, renouvelé
   * une minute avant son expiration. Sinon : jeton anonyme (classement).
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.snapshot.user) return this.anonymousToken();
    if (this.jwt && this.jwt.expiresAt - JWT_MARGIN_MS > Date.now()) return this.jwt.token;
    this.refreshing ??= this.refresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async anonymousToken(): Promise<string | null> {
    if (this.anonymous && this.anonymous.expiresAt - JWT_MARGIN_MS > Date.now()) return this.anonymous.token;
    try {
      const res = await this.call('/token/anonymous');
      const token = (res.data as { token?: string } | null)?.token ?? null;
      this.anonymous = token ? { token, expiresAt: jwtExpiry(token) } : null;
      return token;
    } catch {
      return null;
    }
  }

  private async refresh(): Promise<string | null> {
    try {
      const res = await this.call('/get-session');
      if (res.data === null) {
        writeCachedUser(null);
        this.set({ user: null, error: 'Ta session a expiré : reconnecte-toi.' });
        return null;
      }
      this.keepJwt(res.headers);
      if (!this.jwt) {
        const t = await this.call('/token');
        const token = (t.data as { token?: string } | null)?.token ?? null;
        if (token) this.jwt = { token, expiresAt: jwtExpiry(token) };
      }
      return this.jwt?.token ?? null;
    } catch {
      return null;
    }
  }
}

export const auth = new AuthManager();

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(auth.subscribe, auth.getSnapshot);
}
