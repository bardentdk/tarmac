/**
 * Relais /auth/* → Neon Auth, en fonction Vercel.
 *
 * Une réécriture Vercel simple ne suffit pas : elle ajoute `X-Forwarded-Host`,
 * que Neon Auth refuse (400 « Invalid hostname header »). Ici on choisit
 * exactement ce qui part : la requête du navigateur, sans les en-têtes de
 * proxy. Le cookie de session reste un cookie du site (même domaine), que les
 * navigateurs ne bloquent pas comme un cookie tiers.
 *
 * Variable requise côté Vercel : TARMAC_AUTH_URL (URL Neon Auth, publique).
 */

/** En-têtes du navigateur transmis tels quels. */
const FORWARD = ['accept', 'accept-language', 'authorization', 'content-type', 'cookie', 'origin', 'referer', 'user-agent'];
/** En-têtes de réponse recalculés par la plateforme. */
const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

async function relay(request: Request): Promise<Response> {
  const base = (process.env.TARMAC_AUTH_URL ?? '').replace(/\/+$/, '');
  if (!base) return Response.json({ message: 'TARMAC_AUTH_URL absent de la configuration Vercel.' }, { status: 500 });

  const url = new URL(request.url);
  const target = `${base}${url.pathname.replace(/^\/(api\/)?auth/, '')}${url.search}`;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });

  const out = new Headers();
  upstream.headers.forEach((v, k) => { if (!DROP.has(k)) out.set(k, v); });
  // Plusieurs cookies possibles ; on retire un éventuel Domain= pour qu'ils
  // s'attachent au domaine du site.
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c.replace(/;\s*Domain=[^;]*/i, ''));

  return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export const GET = relay;
export const POST = relay;
