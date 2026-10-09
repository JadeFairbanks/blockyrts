// Cloudflare Pages middleware: a sign-in page in front of the whole site (the
// play domain and the pages.dev mirror), so passers-by do not reach the game
// or its server. It is a deterrent, not security. The game's files (/assets/,
// /models/, /audio/), the sign-in page's script (/gate/), the icon, the
// preview picture, robots.txt, sitemap.xml and the installable app's
// manifest, service worker and icons skip it, see
// deploy/pages/static/_routes.json; deploy/README.md has the whole picture.
//
// The login is the user name below and a bcrypt hash of the password, which
// the Deploy workflow copies from the SITE_LOGIN_HASH Actions secret into the
// Pages project, so neither the hash nor the password is in the repository.
// The browser works out the bcrypt hash of what was typed (the hash's salt is
// in the page) and sends that, because one bcrypt check costs several times
// the free plan's 10 ms of CPU a request; this side only compares. A signed
// cookie then keeps the browser signed in for COOKIE_DAYS.

/** The user name, in any capitals. */
export const SITE_USER = 'Admin';
export const COOKIE = 'sac_login';
export const COOKIE_DAYS = 30;
/** Where the sign-in page posts what was typed. */
export const LOGIN_PATH = '/login';
/** The sign-in page's copy of bcryptjs, which the client build writes (packages/client/site.ts). */
export const GATE_SCRIPT = '/gate/bcrypt.js';

// How the sign-in page describes the site to visitors, search engines and
// link previews: packages/client/site.ts has the same words for index.html.
const TITLE = 'Survive and Conquer';
const DESCRIPTION = 'Survive and Conquer is a learning project.';
const IMAGE = '/og-image.jpg';

interface Env {
  SITE_LOGIN_HASH?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

/** A bcrypt hash's parts: the salt the browser hashes with, and the 31-character result to match. */
export interface Login {
  salt: string;
  check: string;
  key: string;
}

const B64 = '[./A-Za-z0-9]';

/**
 * Reads a bcrypt hash. $2y$ (PHP's name) and $2a$ are the same algorithm as
 * $2b$, which the sign-in page's bcryptjs is given; $2x$ (PHP's old, broken
 * variant) is not accepted.
 */
export function readLogin(hash: string | undefined): Login | null {
  const key = hash?.trim() ?? '';
  const m = new RegExp(`^\\$2[aby]\\$(\\d\\d)\\$(${B64}{22})(${B64}{31})$`).exec(key);
  return m ? { salt: `$2b$${m[1]}$${m[2]}`, check: m[3]!, key } : null;
}

/** Compares two strings without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(key: string, expires: number): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, enc.encode(`${COOKIE}:${expires}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the request carries an unexpired sign-in cookie made with this login. */
export async function cookieOk(header: string | null, login: Login, nowS: number): Promise<boolean> {
  const m = new RegExp(`(?:^|;)\\s*${COOKIE}=(\\d{1,12})\\.([0-9a-f]{64})\\s*(?:;|$)`).exec(header ?? '');
  if (!m) return false;
  const expires = Number(m[1]);
  if (expires <= nowS) return false;
  return same(m[2]!, await sign(login.key, expires));
}

/** The answer to the sign-in page's post: a cookie for the right user name and bcrypt result. */
export async function signIn(request: Request, login: Login, nowS: number): Promise<Response> {
  const text = await request.text();
  let body: { username?: unknown; proof?: unknown } = {};
  try {
    const parsed: unknown = text.length < 1000 ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') body = parsed;
  } catch {
    // Not JSON: no match.
  }
  const user = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const proof = typeof body.proof === 'string' ? body.proof : '';
  const ok = user === SITE_USER.toLowerCase() && new RegExp(`^\\$2[aby]\\$\\d\\d\\$${B64}{53}$`).test(proof) && same(proof.slice(-31), login.check);
  if (!ok) return plain(401, 'That user name and password do not match.');
  const expires = nowS + COOKIE_DAYS * 86400;
  return new Response(null, {
    status: 204,
    headers: {
      'set-cookie': `${COOKIE}=${expires}.${await sign(login.key, expires)}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
      'cache-control': 'no-store',
    },
  });
}

function plain(status: number, text: string): Response {
  return new Response(`${text}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The sign-in page, which is also what search engines and link previews read. */
export function loginPage(origin: string, salt: string): string {
  const title = `${TITLE}: a learning project`;
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: TITLE, description: DESCRIPTION, url: `${origin}/` };
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
      main { max-width: 22em; margin: 12vh auto 0; padding: 0 16px; }
      h1 { margin: 0; font-size: 1.6em; }
      p { margin: 0.25em 0 1.25em; color: #b9b2a3; }
      label { display: block; margin-bottom: 0.9em; }
      input { box-sizing: border-box; width: 100%; margin-top: 0.25em; padding: 0.5em 0.6em; border: 1px solid #4a515b; border-radius: 4px; background: #262b32; color: inherit; font: inherit; }
      button { padding: 0.5em 1.4em; border: 0; border-radius: 4px; background: #c9a24b; color: #1b1f24; font: inherit; font-weight: 600; cursor: pointer; }
      button:disabled { opacity: 0.6; cursor: wait; }
      #note { min-height: 1.5em; margin-top: 1em; }
    </style>
  </head>
  <body>
    <main>
      <h1>${TITLE}</h1>
      <p>A learning project. Sign in to continue.</p>
      <form id="login" data-salt="${attr(salt)}">
        <label>User name <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required /></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
        <button>Sign in</button>
        <p id="note" role="status"></p>
      </form>
      <noscript><p>Signing in needs JavaScript.</p></noscript>
    </main>
    <script src="${GATE_SCRIPT}"></script>
    <script>
      const form = document.getElementById('login');
      const note = document.getElementById('note');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        note.textContent = 'Checking...';
        try {
          const proof = await bcrypt.hash(form.elements.password.value, form.dataset.salt);
          const res = await fetch('${LOGIN_PATH}', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: form.elements.username.value, proof }),
          });
          if (res.ok) return location.reload();
          note.textContent = res.status === 401 ? 'That user name and password do not match.' : 'Signing in did not work. Try again.';
        } catch {
          note.textContent = 'Signing in did not work. Try again.';
        }
        button.disabled = false;
      });
    </script>
  </body>
</html>
`;
}

export async function onRequest({ request, env, next }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const res = await gate(url, request, env, next);
  // _headers does not reach answers from Functions, so the mirror's
  // delisting is repeated here (deploy/pages/static/_headers).
  if (!url.hostname.endsWith('.pages.dev')) return res;
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex');
  return out;
}

async function gate(url: URL, request: Request, env: Env, next: () => Promise<Response>): Promise<Response> {
  const login = readLogin(env.SITE_LOGIN_HASH);
  // Without a login set up, nothing is served (the Deploy workflow checks first).
  if (!login) return plain(503, 'This site is not set up yet.');
  const nowS = Math.floor(Date.now() / 1000);
  if (url.pathname === LOGIN_PATH && request.method === 'POST') return signIn(request, login, nowS);
  if (await cookieOk(request.headers.get('cookie'), login, nowS)) return next();
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(401, 'Sign in first.');
  return new Response(loginPage(url.origin, login.salt), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
