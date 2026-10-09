// The sign-in page in front of the site (deploy/pages/functions/_middleware.ts,
// deploy/README.md). The login here is made up, in the same $2y$ bcrypt form
// as the real one, which lives only in the SITE_LOGIN_HASH secret.
import { readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { COOKIE, COOKIE_DAYS, cookieOk, GATE_SCRIPT, LOGIN_PATH, loginPage, onRequest, readLogin, SITE_USER } from '../../../deploy/pages/functions/_middleware.ts';
import { GATE_SCRIPT as BUILT_GATE_SCRIPT, gateScript, SITE_DESCRIPTION, SITE_IMAGE } from '../site.ts';

const PASSWORD = 'not the real password';
const HASH = bcrypt.hashSync(PASSWORD, 10).replace(/^\$2b\$/, '$2y$');
const login = readLogin(HASH)!;

type Call = { path?: string; init?: RequestInit; env?: { SITE_LOGIN_HASH?: string }; host?: string };
const call = ({ path = '/', init = {}, env = { SITE_LOGIN_HASH: HASH }, host = 'play.example.com' }: Call = {}): Promise<Response> =>
  onRequest({
    request: new Request(`https://${host}${path}`, init),
    env,
    next: async () => new Response('the game', { headers: { 'content-type': 'text/html' } }),
  });

/** What the sign-in page's browser script sends: bcrypt of the typed password, from the built bcryptjs file. */
async function browserProof(password: string): Promise<string> {
  // A page's globals: only what a browser has (bcryptjs takes setTimeout there).
  const page: { setTimeout: typeof setTimeout; bcrypt?: { hash: (p: string, s: string) => Promise<string> } } = { setTimeout };
  runInNewContext(gateScript(), page);
  return page.bcrypt!.hash(password, login.salt);
}

const post = (body: unknown): Promise<Response> =>
  call({ path: LOGIN_PATH, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } });

describe('site login', () => {
  it('reads a $2y$ bcrypt hash as $2b$, and nothing that is not bcrypt', () => {
    expect(HASH).toMatch(/^\$2y\$10\$/);
    expect(login.salt).toBe(`$2b$10$${HASH.slice(7, 29)}`);
    expect(login.check).toBe(HASH.slice(29));
    expect(readLogin(`${HASH}\n`)).toEqual(login);
    expect(readLogin(HASH.replace('$2y$', '$2a$'))?.salt).toBe(login.salt);
    for (const bad of [undefined, '', 'Admin', HASH.replace('$2y$', '$2x$'), HASH.slice(0, -1), `x${HASH}`]) expect(readLogin(bad)).toBeNull();
  });

  it('signs in with the browser\'s bcrypt of the right password, in any capitals of the user name', async () => {
    const proof = await browserProof(PASSWORD);
    expect(proof.slice(-31)).toBe(login.check);
    for (const username of [SITE_USER, SITE_USER.toLowerCase(), ` ${SITE_USER.toUpperCase()} `]) {
      const res = await post({ username, proof });
      expect(res.status).toBe(204);
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toMatch(new RegExp(`^${COOKIE}=\\d+\\.[0-9a-f]{64}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax$`));
      const page = await call({ init: { headers: { cookie: `other=1; ${cookie.split(';')[0]}` } } });
      expect(page.status).toBe(200);
      expect(await page.text()).toBe('the game');
    }
  });

  it('turns away a wrong password, user name or post, with no cookie', async () => {
    const proof = await browserProof(PASSWORD);
    const wrong = await browserProof('not the real passwore');
    for (const body of [{ username: SITE_USER, proof: wrong }, { username: 'someone', proof }, { username: SITE_USER, proof: PASSWORD }, { username: SITE_USER }, 'Admin', null]) {
      const res = await post(body);
      expect(res.status).toBe(401);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('shows the sign-in page without a good cookie, never the game or the hash', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const good = (await post({ username: SITE_USER, proof: await browserProof(PASSWORD) })).headers.get('set-cookie')!.split(';')[0]!;
    const [, value] = good.split('=');
    const [expires, mac] = value!.split('.');
    const otherLogin = readLogin(bcrypt.hashSync(PASSWORD, 4))!;
    expect(await cookieOk(good, login, nowS)).toBe(true);
    expect(await cookieOk(good, otherLogin, nowS)).toBe(false);
    expect(await cookieOk(good, login, Number(expires))).toBe(false);
    for (const cookie of [undefined, `${COOKIE}=${expires}.${mac!.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}`, `${COOKIE}=${Number(expires) + 1}.${mac}`, `x${good}`]) {
      const res = await call(cookie ? { init: { headers: { cookie } } } : {});
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const html = await res.text();
      expect(html).not.toContain('the game');
      expect(html).toContain(`data-salt="${login.salt}"`);
      expect(html).not.toContain(login.check);
      expect(html).toContain(`<script src="${GATE_SCRIPT}"></script>`);
      expect(html).toContain(`fetch('${LOGIN_PATH}'`);
    }
    expect((await call({ path: '/x', init: { method: 'POST' } })).status).toBe(401);
  });

  it('serves nothing when the login is not set up', async () => {
    for (const env of [{}, { SITE_LOGIN_HASH: 'not a hash' }]) {
      for (const path of ['/', LOGIN_PATH]) expect((await call({ path, env })).status).toBe(503);
    }
  });

  it('keeps the pages.dev addresses out of search results, signed in or not', async () => {
    expect((await call({ host: 'blockyrts.pages.dev' })).headers.get('x-robots-tag')).toBe('noindex');
    expect((await call({ host: 'abc123.blockyrts.pages.dev' })).headers.get('x-robots-tag')).toBe('noindex');
    expect((await call()).headers.get('x-robots-tag')).toBeNull();
  });
});

describe('sign-in page for search engines and link previews', () => {
  const html = loginPage('https://play.example.com', login.salt);

  it('calls the site a learning project, and nowhere a game', () => {
    expect(html).toContain('<title>Survive and Conquer: a learning project</title>');
    for (const name of ['description', 'og:description', 'twitter:description']) expect(html).toContain(`"${name}" content="${SITE_DESCRIPTION}"`);
    expect(html).toContain(`content="https://play.example.com${SITE_IMAGE}"`);
    expect(html).not.toMatch(/game/i);
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1];
    expect(JSON.parse(json ?? '')).toEqual({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Survive and Conquer', description: SITE_DESCRIPTION, url: 'https://play.example.com/' });
  });
});

describe('sign-in routes', () => {
  const routes = JSON.parse(readFileSync(new URL('../../../deploy/pages/static/_routes.json', import.meta.url), 'utf8')) as { include: string[]; exclude: string[] };

  it('lets the game\'s files, the sign-in script and the crawler files skip the middleware', () => {
    expect(routes.include).toEqual(['/*']);
    expect(GATE_SCRIPT).toBe(`/${BUILT_GATE_SCRIPT}`);
    // Everything the client serves from public/, plus what the build adds beside index.html.
    const pub = readdirSync(new URL('../public/', import.meta.url), { withFileTypes: true }).map((d) => (d.isDirectory() ? `/${d.name}/*` : `/${d.name}`));
    for (const path of [...pub, '/assets/*', '/models/*', '/gate/*', '/robots.txt', '/sitemap.xml']) expect(routes.exclude).toContain(path);
    for (const path of ['/', '/*', LOGIN_PATH, '/index.html']) expect(routes.exclude).not.toContain(path);
  });
});
