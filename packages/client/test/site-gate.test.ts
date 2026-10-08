// The indev site's version line and password gate (deploy/README.md).
import { describe, expect, it } from 'vitest';
import { LOGIN_SHA256, loginOk, NOINDEX, onRequest } from '../../../deploy/pages/functions/_middleware.ts';
import { deployVersion, fromTenths, toTenths } from '../../../deploy/scripts/game-version.ts';
import file from '../../../version.json';

const basic = (pair: string): string => `Basic ${btoa(pair)}`;
const call = (path: string, auth?: string): Promise<Response> =>
  onRequest({
    request: new Request(`https://play.example.com${path}`, auth ? { headers: { authorization: auth } } : {}),
    next: async () => new Response('the game', { headers: { 'content-type': 'text/html' } }),
  });

/** version.json as it first stood, before Patch 5 raised it to 1.0. */
const early = { stage: 'indev', next: '0.2' };

describe('game version', () => {
  it('starts at indev 0.2, the build live before the version line counting as 0.1', () => {
    expect(deployVersion(early, [], [])).toEqual({ label: 'indev 0.2', tag: 'live-0.2', fresh: true });
  });

  it('ships Patch 5 as indev 1.0, after indev 0.9', () => {
    expect(file).toEqual({ stage: 'indev', next: '1.0' });
    expect(deployVersion(file, ['live-0.8', 'live-0.9'], [])).toEqual({ label: 'indev 1.0', tag: 'live-1.0', fresh: true });
  });

  it('goes up by 0.1 each deploy, through whole numbers', () => {
    expect(deployVersion(early, ['live-0.1', 'live-0.2'], []).label).toBe('indev 0.3');
    expect(deployVersion(early, ['live-0.9'], []).tag).toBe('live-1.0');
    expect(deployVersion(early, ['live-0.1', 'live-0.10', 'other', 'live-x'], []).label).toBe('indev 0.2');
  });

  it('takes a bigger step or a new stage from version.json', () => {
    expect(deployVersion({ stage: 'alpha', next: '1.0' }, ['live-0.4'], []).label).toBe('alpha 1.0');
    expect(deployVersion({ stage: 'alpha', next: '1.0' }, ['live-1.3'], []).label).toBe('alpha 1.4');
  });

  it('keeps the version when the same commit is deployed again', () => {
    expect(deployVersion(early, ['live-0.1', 'live-0.2'], ['live-0.2'])).toEqual({ label: 'indev 0.2', tag: 'live-0.2', fresh: false });
  });

  it('reads and writes tenths', () => {
    expect(toTenths('0.1')).toBe(1);
    expect(toTenths('2')).toBe(20);
    expect(fromTenths(13)).toBe('1.3');
    expect(() => toTenths('0.15')).toThrow();
    expect(() => deployVersion({ stage: ' ', next: '0.1' }, [], [])).toThrow();
  });
});

describe('indev password gate', () => {
  it('stores only a hash of the login', () => {
    expect(LOGIN_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('asks for a login and hides the page without one', async () => {
    for (const auth of [undefined, basic('admin:wrong'), basic('someone:password1234'), 'Basic !!!', 'Bearer x']) {
      const res = await call('/', auth);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
      expect(res.headers.get('x-robots-tag')).toBe(NOINDEX);
      expect(await res.text()).not.toContain('the game');
    }
  });

  it('serves the page to the right login, still delisted', async () => {
    expect(await loginOk(basic('admin:password1234'))).toBe(true);
    const res = await call('/balance/', basic('admin:password1234'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('the game');
    expect(res.headers.get('x-robots-tag')).toBe(NOINDEX);
  });

  it('tells crawlers to stay out without a login', async () => {
    const res = await call('/robots.txt');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('indev gate routes', () => {
  it('lets every folder of game data files skip the gate', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const routes = JSON.parse(readFileSync(new URL('../../../deploy/pages/static/_routes.json', import.meta.url), 'utf8')) as { exclude: string[] };
    // Each folder the client serves from public/ is fetched file by file.
    const publicDirs = readdirSync(new URL('../public/', import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const dir of ['assets', ...publicDirs]) expect(routes.exclude).toContain(`/${dir}/*`);
  });
});
