// The browser's sign-in box in front of the site
// (deploy/pages/functions/_middleware.ts, deploy/README.md). The password here
// is made up; the real one lives only in the SITE_PASSWORD secrets.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COOKIE, COOKIE_DAYS, cookieOk, loginOk, onRequest, readPassword, signInPage, SITE_USER } from '../../../deploy/pages/functions/_middleware.ts';
import { SITE_DESCRIPTION, SITE_IMAGE } from '../site.ts';

// A made-up password that looks like a bcrypt hash: it is still just the password.
const PASSWORD = '$2y$10$madeUpMadeUpMadeUpMadeUpMadeUpMadeUpMadeUpMadeUp1234';

type Call = { path?: string; init?: RequestInit; env?: { SITE_PASSWORD?: string }; host?: string };
const call = ({ path = '/', init = {}, env = { SITE_PASSWORD: PASSWORD }, host = 'play.example.com' }: Call = {}): Promise<Response> =>
  onRequest({
    request: new Request(`https://${host}${path}`, init),
    env,
    next: async () => new Response('the game', { headers: { 'content-type': 'text/html' } }),
  });

/** What a browser sends after the box: Basic and the base64 of "user:password" in UTF-8. */
const basic = (user: string, password: string): string => `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
const withAuth = (authorization: string): Call => ({ init: { headers: { authorization } } });

describe('site login', () => {
  it('reads the password without spaces at either end, and nothing blank', () => {
    expect(readPassword(` ${PASSWORD}\n`)).toBe(PASSWORD);
    for (const bad of [undefined, '', ' \n']) expect(readPassword(bad)).toBeNull();
  });

  it('opens the site for the right password, exactly as typed, in any capitals of the user name', async () => {
    for (const username of [SITE_USER, SITE_USER.toLowerCase(), ` ${SITE_USER.toUpperCase()} `]) {
      const res = await call(withAuth(basic(username, PASSWORD)));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('the game');
      expect(res.headers.get('set-cookie')).toMatch(new RegExp(`^${COOKIE}=\\d+\\.[0-9a-f]{64}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax$`));
    }
    expect(await loginOk(basic(SITE_USER, `${PASSWORD} `), PASSWORD)).toBe(true);
    expect(await loginOk(basic(SITE_USER, 'pässwörd'), 'pässwörd')).toBe(true);
    expect(await loginOk(`basic  ${basic(SITE_USER, PASSWORD).slice(6)} `, PASSWORD)).toBe(true);
  });

  it('asks again with the box for a wrong password, user name or header, with no cookie', async () => {
    const wrong = [
      basic(SITE_USER, PASSWORD.toLowerCase()),
      basic(SITE_USER, PASSWORD.slice(0, -1)),
      basic(SITE_USER, ''),
      basic('someone', PASSWORD),
      basic(`${SITE_USER}:${PASSWORD}`, ''),
      `Basic ${Buffer.from(`${SITE_USER}${PASSWORD}`).toString('base64')}`,
      `Bearer ${PASSWORD}`,
      'Basic !!!',
    ];
    for (const auth of wrong) {
      const res = await call(withAuth(auth));
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Basic realm="Survive and Conquer", charset="UTF-8"');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('set-cookie')).toBeNull();
      const html = await res.text();
      expect(html).not.toContain('the game');
      expect(html).not.toContain(PASSWORD);
    }
    expect((await call()).status).toBe(401);
    expect((await call({ path: '/x', init: { method: 'POST' } })).status).toBe(401);
    expect(await (await call({ init: { method: 'HEAD' } })).text()).toBe('');
  });

  it('keeps a browser signed in with its cookie, and only with a good one', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const good = (await call(withAuth(basic(SITE_USER, PASSWORD)))).headers.get('set-cookie')!.split(';')[0]!;
    const [, value] = good.split('=');
    const [expires, mac] = value!.split('.');
    expect(await cookieOk(good, PASSWORD, nowS)).toBe(true);
    expect(await cookieOk(good, 'another password', nowS)).toBe(false);
    expect(await cookieOk(good, PASSWORD, Number(expires))).toBe(false);
    const signedIn = await call({ init: { headers: { cookie: `other=1; ${good}` } } });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.text()).toBe('the game');
    expect(signedIn.headers.get('set-cookie')).toBeNull();
    for (const cookie of [`${COOKIE}=${expires}.${mac!.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}`, `${COOKIE}=${Number(expires) + 1}.${mac}`, `x${good}`]) {
      expect((await call({ init: { headers: { cookie } } })).status).toBe(401);
    }
  });

  it('serves nothing when the password is not set up', async () => {
    for (const env of [{}, { SITE_PASSWORD: ' ' }]) {
      for (const auth of [undefined, basic(SITE_USER, ''), basic(SITE_USER, ' ')]) {
        expect((await call({ env, ...(auth ? withAuth(auth) : {}) })).status).toBe(503);
      }
    }
  });

  it('keeps the pages.dev addresses out of search results, signed in or not', async () => {
    expect((await call({ host: 'blockyrts.pages.dev' })).headers.get('x-robots-tag')).toBe('noindex');
    expect((await call({ host: 'abc123.blockyrts.pages.dev', ...withAuth(basic(SITE_USER, PASSWORD)) })).headers.get('x-robots-tag')).toBe('noindex');
    expect((await call()).headers.get('x-robots-tag')).toBeNull();
  });
});

describe('the page behind the sign-in box, for search engines and link previews', () => {
  const html = signInPage('https://play.example.com');

  it('calls the site a learning project, and nowhere a game', () => {
    expect(html).toContain('<title>Survive and Conquer: a learning project</title>');
    for (const name of ['description', 'og:description', 'twitter:description']) expect(html).toContain(`"${name}" content="${SITE_DESCRIPTION}"`);
    expect(html).toContain(`content="https://play.example.com${SITE_IMAGE}"`);
    expect(html).toContain('Reload the page to sign in.');
    expect(html).not.toMatch(/game|<script src|<form/i);
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(html)?.[1];
    expect(JSON.parse(json ?? '')).toEqual({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Survive and Conquer', description: SITE_DESCRIPTION, url: 'https://play.example.com/' });
  });
});

describe('sign-in routes', () => {
  const routes = JSON.parse(readFileSync(new URL('../../../deploy/pages/static/_routes.json', import.meta.url), 'utf8')) as { include: string[]; exclude: string[] };

  it('lets the game\'s files and the crawler files skip the middleware', () => {
    expect(routes.include).toEqual(['/*']);
    // Everything the client serves from public/, plus what the build adds beside index.html.
    const pub = readdirSync(new URL('../public/', import.meta.url), { withFileTypes: true }).map((d) => (d.isDirectory() ? `/${d.name}/*` : `/${d.name}`));
    for (const path of [...pub, '/assets/*', '/models/*', '/robots.txt', '/sitemap.xml']) expect(routes.exclude).toContain(path);
    for (const path of ['/', '/*', '/index.html']) expect(routes.exclude).not.toContain(path);
  });
});
