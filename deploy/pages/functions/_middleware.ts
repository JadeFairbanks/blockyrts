// Cloudflare Pages middleware: the browser's own user name and password box in
// front of the whole site (switched off for now, see SIGN_IN_ON below) (the play domain and the pages.dev mirror), so
// passers-by do not reach the game or its server. It is a deterrent, not
// security. The game's files (/assets/, /models/, /audio/), the icon, the
// preview picture, robots.txt, sitemap.xml and the installable app's
// manifest, service worker and icons skip it, see
// deploy/pages/static/_routes.json; deploy/README.md has the whole picture.
//
// The login is the user name below and the password in the Pages project's
// SITE_PASSWORD secret, which the Deploy workflow copies from the Actions
// secret, so the password is not in the repository. Checking it is a plain
// comparison, well inside the free plan's 10 ms of CPU a request. After a
// right answer a signed cookie keeps the browser signed in for COOKIE_DAYS,
// so the box does not come back each time the browser restarts.

/** The user name, in any capitals. */
export const SITE_USER = 'Admin';
export const COOKIE = 'sac_login';
export const COOKIE_DAYS = 30;
const REALM = 'Survive and Conquer';

// How the box's page describes the site to visitors, search engines and link
// previews: packages/client/site.ts has the same words for index.html.
const TITLE = 'Survive and Conquer';
const HEADLINE = 'Survive and Conquer: Co-op Survival Open World RTS';
const DESCRIPTION =
  'A co-op survival open world RTS in your browser for 1 to 8 players. Gather, craft and build a base with friends, then hold it as every night grows deadlier.';
const ABOUT =
  'Survive and Conquer is a co-op survival open world real-time strategy game you play in your browser. Gather wood, stone and food, craft gear, raise a base and train your people, then push out into wild lands that grow more dangerous the farther you go. When night falls, monsters come for your walls, and every night brings stronger ones. The nights never end: play alone or with up to 7 friends and see how long you last.';
const IMAGE = '/og-image.jpg';

interface Env {
  SITE_PASSWORD?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

/** The password, without spaces at either end, or null when there is none. */
export function readPassword(raw: string | undefined): string | null {
  return raw?.trim() || null;
}

const enc = new TextEncoder();

/** Compares two strings without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Compares the two passwords' SHA-256, so neither the time taken nor an early stop tells anything about the password. */
async function samePassword(typed: string, password: string): Promise<boolean> {
  const [a, b] = await Promise.all([typed, password].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return same(hex(a!), hex(b!));
}

/** True when an Authorization header carries the user name and password the box asks for. */
export async function loginOk(header: string | null, password: string): Promise<boolean> {
  const m = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header ?? '');
  if (!m || m[1]!.length > 1000) return false;
  let pair: string;
  try {
    pair = new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const colon = pair.indexOf(':');
  if (colon < 0) return false;
  const userOk = pair.slice(0, colon).trim().toLowerCase() === SITE_USER.toLowerCase();
  return (await samePassword(pair.slice(colon + 1).trim(), password)) && userOk;
}

async function sign(key: string, expires: number): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`${COOKIE}:${expires}`)));
}

/** True when the request carries an unexpired sign-in cookie made with this password. */
export async function cookieOk(header: string | null, password: string, nowS: number): Promise<boolean> {
  const m = new RegExp(`(?:^|;)\\s*${COOKIE}=(\\d{1,12})\\.([0-9a-f]{64})\\s*(?:;|$)`).exec(header ?? '');
  if (!m) return false;
  const expires = Number(m[1]);
  if (expires <= nowS) return false;
  return same(m[2]!, await sign(password, expires));
}

async function signedCookie(password: string, nowS: number): Promise<string> {
  const expires = nowS + COOKIE_DAYS * 86400;
  return `${COOKIE}=${expires}.${await sign(password, expires)}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The page behind the box: what a visitor sees after closing it, and what search engines and link previews read. */
export function signInPage(origin: string): string {
  const title = HEADLINE;
  const site = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: TITLE,
    description: DESCRIPTION,
    url: `${origin}/`,
    genre: ['Survival', 'Real-time strategy', 'Open world'],
    playMode: ['SinglePlayer', 'CoOp'],
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 8 },
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
  };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="theme-color" content="#1b1f24" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${attr(origin)}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${TITLE}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${attr(origin)}/" />
    <meta property="og:image" content="${attr(origin)}${IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${attr(origin)}${IMAGE}" />
    <script type="application/ld+json">${JSON.stringify(site).replace(/</g, '\\u003c')}</script>
    <style>
      html, body { margin: 0; min-height: 100%; background: #1b1f24; color: #e8e2d4; font: 16px/1.5 system-ui, sans-serif; }
      main { max-width: 34em; margin: 12vh auto 0; padding: 0 16px; }
      h1 { margin: 0; font-size: 1.6em; }
      p { margin: 0.5em 0; color: #b9b2a3; }
      p.sign-in { margin-top: 1.5em; color: #e8e2d4; }
    </style>
  </head>
  <body>
    <main>
      <h1>${TITLE}</h1>
      <p>${ABOUT}</p>
      <p class="sign-in">Reload the page to sign in.</p>
    </main>
  </body>
</html>
`;
}

function plain(status: number, text: string): Response {
  return new Response(`${text}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

/**
 * Whether the sign-in box stands in front of the site. Switched off for
 * Patch 7, so anyone with the address goes straight to the game; set it back
 * to true to bring the box back exactly as it was (the password secret, the
 * check and the cookie are all still in place).
 */
export const SIGN_IN_ON = false;

export function onRequest(context: PagesContext): Promise<Response> {
  return serve(context, SIGN_IN_ON);
}

/** Answers a request, behind the sign-in box when signIn is true. */
export async function serve({ request, env, next }: PagesContext, signIn: boolean): Promise<Response> {
  const url = new URL(request.url);
  const res = signIn ? await gate(url, request, env, next) : await next();
  // _headers does not reach answers from Functions, so the mirror's
  // delisting is repeated here (deploy/pages/static/_headers).
  if (!url.hostname.endsWith('.pages.dev')) return res;
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex');
  return out;
}

async function gate(url: URL, request: Request, env: Env, next: () => Promise<Response>): Promise<Response> {
  const password = readPassword(env.SITE_PASSWORD);
  // Without a password set up, nothing is served (the Deploy workflow checks first).
  if (!password) return plain(503, 'This site is not set up yet.');
  const nowS = Math.floor(Date.now() / 1000);
  if (await cookieOk(request.headers.get('cookie'), password, nowS)) return next();
  if (await loginOk(request.headers.get('authorization'), password)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.append('set-cookie', await signedCookie(password, nowS));
    return out;
  }
  return new Response(request.method === 'HEAD' ? null : signInPage(url.origin), {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'cache-control': 'no-store',
    },
  });
}
