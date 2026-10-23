/**
 * client.ts — les requêtes vers la Data API de Neon (PostgREST).
 *
 * Portage navigateur de Tarmac/src/data/client.ts : mêmes en-têtes, mêmes
 * messages d'erreur, même règle — la clé publiable n'ouvre rien, c'est le
 * jeton JWT et la RLS qui décident de ce qui sort.
 */
import { auth } from '~/auth/session';
import { config } from '~/config';

export type DataErrorKind = 'offline' | 'auth' | 'conflict' | 'server' | 'config' | 'timeout';

export class DataError extends Error {
  kind: DataErrorKind;
  status?: number;
  constructor(kind: DataErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | undefined>;
  body?: unknown;
  upsert?: boolean;
  returning?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${config.apiUrl}/${path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

function translateHttp(status: number, body: string): DataError {
  if (status === 401 || status === 403) {
    return new DataError(
      'auth',
      status === 401 ? 'Session expirée. Reconnecte-toi.' : "La base a refusé l'accès à ces données.",
      status,
    );
  }
  if (status === 409) return new DataError('conflict', 'Cette donnée existe déjà sur le serveur.', status);
  if (status === 404) {
    return new DataError('config', 'Table ou fonction absente de la base. Les migrations ont-elles été appliquées ?', status);
  }
  if (status >= 500) return new DataError('server', 'La base est momentanément indisponible.', status);
  return new DataError('server', `Requête refusée (${status}) : ${body.slice(0, 180)}`, status);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!config.apiUrl) throw new DataError('config', "La Data API n'est pas configurée (VITE_TARMAC_API_URL).");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), config.timeoutMs);
  try {
    const token = await auth.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept-Profile': config.schema,
      'Content-Profile': config.schema,
    };
    if (config.publishableKey) headers.apikey = config.publishableKey;
    if (token) headers.Authorization = `Bearer ${token}`;
    const prefer: string[] = [];
    if (opts.upsert) prefer.push('resolution=merge-duplicates');
    prefer.push(opts.returning ? 'return=representation' : 'return=minimal');
    headers.Prefer = prefer.join(',');

    const response = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: abort.signal,
    });
    if (!response.ok) throw translateHttp(response.status, await response.text().catch(() => ''));
    if (!opts.returning || response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (e) {
    if (e instanceof DataError) throw e;
    throw abort.signal.aborted
      ? new DataError('timeout', `Pas de réponse de la base après ${config.timeoutMs / 1000} s.`)
      : new DataError('offline', 'Pas de réseau.');
  } finally {
    clearTimeout(timer);
  }
}

export const select = <T>(table: string, query: Record<string, string | undefined> = {}): Promise<T[]> =>
  request<T[]>(table, { query, returning: true });

export const callFunction = <T>(name: string, args: Record<string, unknown> = {}): Promise<T> =>
  request<T>(`rpc/${name}`, { method: 'POST', body: args, returning: true });
