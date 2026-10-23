/**
 * config.ts — les réglages publics du site, lus une fois au démarrage.
 *
 * Même règle que l'app mobile (Tarmac/src/data/config.ts) : ce qui est ici est
 * embarqué en clair dans le JavaScript servi au navigateur. Seules l'URL de la
 * Data API et la clé publiable y ont leur place — la sécurité repose sur la
 * RLS de la base, pas sur le secret de ces valeurs.
 */

const trim = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
};

const looksLikeAdminKey = (v: string) => /^napi_/i.test(v);
const rawKey = trim(import.meta.env.VITE_TARMAC_PUBLISHABLE_KEY);
const timeout = Number(trim(import.meta.env.VITE_TARMAC_API_TIMEOUT_MS) ?? '15000');

export const config = {
  apiUrl: trim(import.meta.env.VITE_TARMAC_API_URL)?.replace(/\/+$/, '') ?? null,
  // Une clé d'administration Neon n'a rien à faire dans un navigateur : ignorée.
  publishableKey: rawKey !== null && !looksLikeAdminKey(rawKey) ? rawKey : null,
  /** Relais du même domaine vers Neon Auth (proxy Vite en dev). */
  authUrl: '/auth',
  schema: trim(import.meta.env.VITE_TARMAC_DB_SCHEMA) ?? 'app',
  timeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? Math.min(60000, timeout) : 15000,
  androidUrl: trim(import.meta.env.VITE_ANDROID_DOWNLOAD_URL),
  iosUrl: trim(import.meta.env.VITE_IOS_DOWNLOAD_URL),
  appVersion: trim(import.meta.env.VITE_APP_VERSION),
} as const;
