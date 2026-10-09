// The installable app: the manifest and its icons, the service worker's
// rules (only the build's files are kept; pages, models, sounds and the game
// server pass straight through), and which browsers get the Install app
// button and which the steps. test-e2e/pwa-look.mjs checks the same in
// Chromium, with the sign-in gate.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildId, serviceWorker } from '../pwa.ts';
import { INSTALL_STEPS, installWay, type InstallFacts } from '../src/ui/install.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/** A PNG's width and height, from its header. */
function pngSize(path: string): string {
  const png = readFileSync(new URL(path, import.meta.url));
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe('manifest', () => {
  const manifest = JSON.parse(read('../public/manifest.webmanifest')) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose: string }[] };
  const html = read('../index.html');

  it('names the game and opens it full screen and landscape from the site root', () => {
    expect(manifest).toMatchObject({ id: '/', name: 'Survive and Conquer', start_url: '/', scope: '/', display: 'fullscreen', orientation: 'landscape' });
  });

  it("matches the page's colours", () => {
    const theme = /<meta name="theme-color" content="(#[0-9a-f]{6})"/.exec(html)?.[1];
    expect(manifest.theme_color).toBe(theme);
    expect(manifest.background_color).toBe(theme);
  });

  it('calls it a learning project, not a game', () => {
    expect(String(manifest.description)).toContain('a learning project');
    expect(JSON.stringify(manifest)).not.toMatch(/\bgame\b/i);
  });

  it('has the 192 and 512 icons and a maskable one, each the size it says', () => {
    expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of manifest.icons) expect(pngSize(`../public${icon.src}`)).toBe(icon.sizes);
    expect(pngSize('../public/icons/apple-touch-icon.png')).toBe('180x180');
  });

  it('loads past the sign-in page, as Chrome fetches it without cookies and the worker updates while signed out', () => {
    const routes = JSON.parse(read('../../../deploy/pages/static/_routes.json')) as { exclude: string[] };
    for (const path of ['/manifest.webmanifest', '/sw.js', '/icons/*']) expect(routes.exclude).toContain(path);
  });

  it('is linked from the page, with the iPhone icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
  });
});

// ---- The service worker, run against stand-ins for the browser's pieces ----

interface FakeResponse {
  status: number;
  type: string;
  headers: Headers;
  body: string;
  clone(): FakeResponse;
}
const answer = (body: string, contentType = 'text/javascript', status = 200): FakeResponse => ({
  status,
  type: 'basic',
  headers: new Headers({ 'content-type': contentType }),
  body,
  clone() {
    return this;
  },
});

interface FetchEvent {
  request: { url: string; method: string; mode: string; cache: string };
  answered?: Promise<FakeResponse>;
  waits: Promise<unknown>[];
  respondWith(p: Promise<FakeResponse>): void;
  waitUntil(p: Promise<unknown>): void;
}
const fetchEvent = (url: string, method = 'GET', mode = 'cors'): FetchEvent => ({
  request: { url, method, mode, cache: 'default' },
  waits: [],
  respondWith(p) {
    this.answered = p;
  },
  waitUntil(p) {
    this.waits.push(p);
  },
});

const ORIGIN = 'https://play.example';

function worker(build = 'b1') {
  const stores = new Map<string, Map<string, FakeResponse>>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { match: async (r: { url: string }) => store.get(r.url), put: async (r: { url: string }, res: FakeResponse) => void store.set(r.url, res) };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const site = new Map<string, FakeResponse>();
  const fetch = vi.fn(async (r: { url: string }) => site.get(r.url) ?? answer('<!doctype html>', 'text/html'));
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, h: (e: unknown) => void) => void (handlers[type] = h),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
    location: { origin: ORIGIN },
  };
  class URLPattern {
    constructor(readonly init: object) {}
  }
  new Function('self', 'caches', 'fetch', 'URLPattern', serviceWorker(build, '/assets/'))(self, caches, fetch, URLPattern);
  const run = async (e: FetchEvent): Promise<FakeResponse | undefined> => {
    handlers.fetch!(e);
    const res = await e.answered;
    await Promise.all(e.waits);
    return res;
  };
  return { handlers, self, stores, site, fetch, run };
}

describe('service worker', () => {
  it('leaves pages, models, sounds, other sites and anything but GET to the network', async () => {
    const w = worker();
    for (const e of [
      fetchEvent(`${ORIGIN}/`, 'GET', 'navigate'),
      fetchEvent(`${ORIGIN}/assets/index-abc.js`, 'GET', 'navigate'),
      fetchEvent(`${ORIGIN}/models/index.json`),
      fetchEvent(`${ORIGIN}/audio/chop.0.mp3`),
      fetchEvent(`${ORIGIN}/manifest.webmanifest`),
      fetchEvent(`https://api.example/assets/x.js`),
      fetchEvent(`https://api.example/api/me`),
      fetchEvent(`${ORIGIN}/assets/index-abc.js`, 'POST'),
      fetchEvent(`${ORIGIN}/login`, 'POST'),
    ]) {
      expect(await w.run(e)).toBeUndefined();
    }
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it("keeps a build file after its first load and answers from the store after that", async () => {
    const w = worker();
    const url = `${ORIGIN}/assets/index-abc.js`;
    w.site.set(url, answer('code'));
    expect((await w.run(fetchEvent(url)))?.body).toBe('code');
    expect((await w.run(fetchEvent(url)))?.body).toBe('code');
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect([...w.stores.keys()]).toEqual(['sac-assets-b1']);
  });

  it('never keeps a page sent in place of a file, an error or part of a file', async () => {
    const w = worker();
    w.site.set(`${ORIGIN}/assets/gone.js`, answer('<!doctype html>', 'text/html; charset=utf-8'));
    w.site.set(`${ORIGIN}/assets/missing.js`, answer('no', 'text/plain', 404));
    w.site.set(`${ORIGIN}/assets/part.webp`, answer('pa', 'image/webp', 206));
    for (const f of ['gone.js', 'missing.js', 'part.webp']) await w.run(fetchEvent(`${ORIGIN}/assets/${f}`));
    expect(w.stores.get('sac-assets-b1')?.size ?? 0).toBe(0);
  });

  it("empties older builds' stores when it starts, and takes over open pages", async () => {
    const w = worker('new');
    for (const name of ['sac-assets-old', 'sac-assets-new', 'something-else']) w.stores.set(name, new Map());
    const waits: Promise<unknown>[] = [];
    w.handlers.activate!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect([...w.stores.keys()].sort()).toEqual(['sac-assets-new', 'something-else']);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it("starts at once, and in Chromium routes everything but the build's files past itself", async () => {
    const w = worker();
    const addRoutes = vi.fn(async () => undefined);
    w.handlers.install!({ addRoutes, waitUntil: () => undefined });
    expect(w.self.skipWaiting).toHaveBeenCalled();
    expect(addRoutes).toHaveBeenCalledWith([
      { condition: { urlPattern: { init: { pathname: '/assets/*' } } }, source: 'fetch-event' },
      { condition: { urlPattern: { init: {} } }, source: 'network' },
    ]);
    // Browsers without static routes just use the fetch handler.
    expect(() => w.handlers.install!({ waitUntil: () => undefined })).not.toThrow();
  });

  it("is named for the build's files, in any order", () => {
    expect(buildId(['assets/a-1.js', 'assets/b-2.css'])).toBe(buildId(['assets/b-2.css', 'assets/a-1.js']));
    expect(buildId(['assets/a-1.js'])).not.toBe(buildId(['assets/a-2.js']));
    expect(buildId(['x'])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('Install app button', () => {
  const UA = {
    chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    edgeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
    safari18: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
    safari26: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    safari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
    firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
    firefoxWindows142: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
    firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  };
  const way = (userAgent: string, more: Partial<InstallFacts> = {}) => installWay({ offer: false, installed: false, userAgent, touchPoints: 0, ...more });

  it("opens Chrome's and Edge's install box when they offer one", () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.edgeMac, UA.chromeAndroid]) expect(way(ua, { offer: true })).toBe('offer');
  });

  it('is hidden in Chrome and Edge until they offer, and once installed', () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.edgeMac, UA.chromeAndroid]) expect(way(ua)).toBe('none');
    expect(way(UA.iphone, { installed: true })).toBe('none');
    expect(way(UA.safari18, { installed: true })).toBe('none');
  });

  it('shows the Add to Home Screen steps on an iPhone or iPad, in any browser there', () => {
    expect(way(UA.iphone, { touchPoints: 5 })).toBe('iphone');
    expect(way(UA.chromeIphone, { touchPoints: 5 })).toBe('iphone');
    expect(way(UA.ipad, { touchPoints: 5 })).toBe('iphone');
    expect(INSTALL_STEPS.iphone.join(' ')).toContain('Add to Home Screen');
  });

  it('shows the Add to Dock steps in Safari 17 or later on a Mac', () => {
    expect(way(UA.safari18)).toBe('mac-safari');
    expect(way(UA.safari26)).toBe('mac-safari');
    expect(way(UA.safari16)).toBe('none');
    expect(INSTALL_STEPS['mac-safari'].join(' ')).toContain('Add to Dock');
  });

  it("shows Firefox's web apps steps on Windows and its menu steps on Android", () => {
    expect(way(UA.firefoxWindows)).toBe('windows-firefox');
    expect(way(UA.firefoxWindows142)).toBe('none');
    expect(INSTALL_STEPS['windows-firefox'].join(' ')).toContain('web apps button');
    expect(way(UA.firefoxAndroid, { touchPoints: 5 })).toBe('android-menu');
  });

  it('is hidden in Firefox on a Mac or Linux, which cannot install web apps yet', () => {
    expect(way(UA.firefoxMac)).toBe('none');
    expect(way(UA.firefoxLinux)).toBe('none');
  });
});
