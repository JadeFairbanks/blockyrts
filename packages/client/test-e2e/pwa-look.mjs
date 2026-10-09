// The installable app, checked by hand in Chromium (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client build
//   node packages/client/test-e2e/pwa-look.mjs [--no-play]
//
// Serves the build (packages/client/dist) on localhost the way Cloudflare
// Pages does: unknown paths get index.html, and a stand-in for the site's
// sign-in gate asks for a cookie on every path except those
// deploy/pages/static/_routes.json lets past it (with no such file, nothing
// is gated). Then it checks, and prints each result:
//
// - the manifest has no errors and Chromium finds nothing stopping an install;
// - the service worker registers for the whole site, keeps only the build's
//   files under /assets/ (never a page, never a page sent in a file's place),
//   and answers those from its store after the first load, while the page,
//   models and sounds still come from the site;
// - without the sign-in cookie the site's sign-in page opens, never the game,
//   even with the worker installed; the manifest, icons and worker still
//   load; and offline the worker opens no game page;
// - the Install app button: shown for the browser's install offer (opening
//   it once), hidden after an install; the steps for an iPhone, Safari on a
//   Mac, and Firefox on Windows and Android; hidden for Firefox on a Mac and
//   when opened from the home screen;
// - unless --no-play, a match on seed 1 with the worker against one with
//   service workers blocked: the frame times, and how many of the match's
//   requests the worker answers once it is under way (none).
/* global window, document, caches, createImageBitmap, requestAnimationFrame -- used inside page.evaluate callbacks */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist');
const routesFile = join(here, '../../../deploy/pages/static/_routes.json');
if (!existsSync(join(dist, 'sw.js'))) {
  console.error('No client build with a service worker. Run: pnpm --filter @blockyrts/client build');
  process.exit(1);
}
const play = !process.argv.includes('--no-play');

// ---- The stand-in site ----
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};
const excluded = existsSync(routesFile) ? JSON.parse(readFileSync(routesFile, 'utf8')).exclude : null;
const skipsGate = (path) => excluded === null || excluded.some((p) => (p.endsWith('/*') ? path.startsWith(p.slice(0, -1)) : path === p));
const COOKIE = 'sac_login=yes';
const SIGN_IN = '<!doctype html><title>Sign in</title><main id="sign-in">A learning project. Sign in to continue.</main>';
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!skipsGate(path) && !(req.headers.cookie ?? '').includes(COOKIE)) {
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
    return res.end(SIGN_IN);
  }
  let file = join(dist, normalize(path));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://localhost:${server.address().port}`;

// ---- Results ----
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SETTINGS = 'survive-and-conquer.settings.v1';
const signedIn = async (context) => context.addCookies([{ name: 'sac_login', value: 'yes', url: base }]);
const newContext = async (opts = {}, settings = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  await context.addInitScript(
    ([key, s]) => {
      try {
        localStorage.setItem(key, JSON.stringify({ cursorLock: false, touchAsked: true, ...s }));
      } catch {
        // The browser's own offline page has no storage.
      }
    },
    [SETTINGS, settings],
  );
  return context;
};
const menuUp = (page) => page.waitForSelector('.dialog.main-menu button.primary', { timeout: 60_000 });
const buttonShown = (page) => page.evaluate(() => {
  const b = document.querySelector('.fullscreen-row button.install');
  return b !== null && !b.hidden && b.getBoundingClientRect().height > 0;
});

try {
  console.log(excluded ? `gate stand-in on: ${excluded.length} paths skip it` : 'no _routes.json: nothing gated');

  // ---- Manifest, worker and store, signed in ----
  const context = await newContext();
  await signedIn(context);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(base);
  await menuUp(page);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  const parsed = JSON.parse(manifest.data || '{}');
  check('manifest parses with no errors', manifest.errors.length === 0 && parsed.name === 'Survive and Conquer', manifest.errors.map((e) => e.message).join('; ') || `${parsed.name}, ${parsed.display}, ${parsed.orientation}`);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, script: reg.active?.scriptURL ?? '', controlled: navigator.serviceWorker.controller !== null };
  });
  check('service worker active for the whole site', sw.scope === `${base}/` && sw.script === `${base}/sw.js`, `${sw.scope} ${sw.script}`);
  const installable = await cdp.send('Page.getInstallabilityErrors');
  check('Chromium finds nothing stopping an install', installable.installabilityErrors.length === 0, installable.installabilityErrors.map((e) => e.errorId).join(', ') || 'no errors');
  const icons = await page.evaluate(
    async (list) =>
      Promise.all(
        list.map(async (i) => {
          const img = await createImageBitmap(await (await fetch(i.src)).blob());
          return { src: i.src, purpose: i.purpose, sizes: i.sizes, actual: `${img.width}x${img.height}` };
        }),
      ),
    parsed.icons ?? [],
  );
  check('icons load at their stated sizes', icons.length === 3 && icons.every((i) => i.sizes === i.actual), icons.map((i) => `${i.src} ${i.actual} ${i.purpose}`).join(', '));

  // A reload: the build's files from the store, the rest from the site.
  const answers = [];
  page.on('response', (r) => answers.push({ url: r.url(), sw: r.fromServiceWorker(), type: r.request().resourceType() }));
  await page.reload();
  await menuUp(page);
  await page.waitForTimeout(1500);
  const doc = answers.find((a) => a.type === 'document');
  const builds = answers.filter((a) => new URL(a.url).pathname.startsWith('/assets/'));
  const others = answers.filter((a) => a.url.startsWith(base) && !new URL(a.url).pathname.startsWith('/assets/'));
  check('the page itself comes from the site', doc && !doc.sw, doc?.url);
  check('build files come from the store after the first load', builds.length > 0 && builds.every((a) => a.sw), `${builds.filter((a) => a.sw).length} of ${builds.length}`);
  check('models, sounds and the rest come from the site', others.length > 0 && others.every((a) => !a.sw), `${others.length} answered by the site, e.g. ${others.slice(0, 3).map((a) => new URL(a.url).pathname).join(', ')}`);
  await page.evaluate(() => fetch('/assets/no-such-file.js').then((r) => r.text()));
  const store = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names) for (const k of await (await caches.open(n)).keys()) urls.push(new URL(k.url).pathname);
    return { names, urls };
  });
  check('one store, named for this build', store.names.length === 1 && store.names[0].startsWith('sac-assets-'), store.names.join(', '));
  check('the store holds only build files, no page', store.urls.length > 0 && store.urls.every((u) => u.startsWith('/assets/') && !u.endsWith('.html')) && !store.urls.includes('/assets/no-such-file.js'), `${store.urls.length} files`);

  // ---- The sign-in gate, with the worker installed ----
  await context.clearCookies();
  await page.goto(base);
  const gated = await page.evaluate(() => ({ signIn: document.getElementById('sign-in') !== null, game: document.getElementById('view') !== null }));
  if (excluded) {
    check('signed out, the sign-in page opens, not the game', gated.signIn && !gated.game);
    const open = await page.evaluate(async () => {
      const m = await fetch('/manifest.webmanifest');
      const w = await fetch('/sw.js');
      const i = await fetch('/icons/icon-192.png');
      return { manifest: m.headers.get('content-type'), worker: w.headers.get('content-type'), icon: i.headers.get('content-type') };
    });
    check('signed out, the manifest, worker and icons still load', open.manifest?.includes('manifest') && open.worker?.includes('javascript') && open.icon === 'image/png', JSON.stringify(open));
    const updated = await page.evaluate(async () => {
      try {
        await (await navigator.serviceWorker.getRegistration('/'))?.update();
        return 'updated';
      } catch (e) {
        return String(e);
      }
    });
    check('signed out, the worker can still update itself', updated === 'updated', updated);
    const after = await page.evaluate(async () => {
      const urls = [];
      for (const n of await caches.keys()) for (const k of await (await caches.open(n)).keys()) urls.push(new URL(k.url).pathname);
      return urls;
    });
    check('the sign-in page is not stored', after.every((u) => u.startsWith('/assets/')), `${after.length} files, all under /assets/`);
  } else {
    check('no gate yet: the game opens', gated.game);
  }
  await signedIn(context);
  await context.setOffline(true);
  const offline = await page.goto(base).then(() => page.evaluate(() => document.getElementById('view') !== null), () => false);
  check('offline, the worker opens no game page', !offline);
  await context.setOffline(false);

  // ---- The Install app button ----
  await page.goto(base);
  await menuUp(page);
  const realOffer = await buttonShown(page);
  console.log(`     (headless Chromium ${realOffer ? 'made' : 'did not make'} an install offer of its own)`);
  await page.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = async () => void (window.prompted = (window.prompted ?? 0) + 1);
    offer.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(offer);
  });
  check('an install offer shows the button', await buttonShown(page));
  await page.getByRole('button', { name: 'Install app' }).click();
  await page.waitForTimeout(200);
  check('pressing it opens the browser\'s install box once', (await page.evaluate(() => window.prompted)) === 1);
  check('a refused offer hides the button until the next', !(await buttonShown(page)));
  await page.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = async () => undefined;
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(offer);
  });
  check('the next offer shows it again', await buttonShown(page));
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  check('installed, the button hides', !(await buttonShown(page)));
  check('no page errors', problems.length === 0, problems.join('; '));
  await page.screenshot({ path: join(here, '../dist/pwa-menu.png') }).catch(() => undefined);
  await context.close();

  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
    androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  };
  const steps = async (name, opts, settings, words) => {
    const c = await newContext(opts, settings);
    await signedIn(c);
    const p = await c.newPage();
    await p.goto(base);
    await menuUp(p);
    const shown = await buttonShown(p);
    check(`${name}: the button shows`, shown);
    if (!shown) return c.close();
    await p.getByRole('button', { name: 'Install app' }).click();
    const page2 = await p.evaluate(() => ({ title: document.querySelector('.dialog h2')?.textContent, steps: [...document.querySelectorAll('.install-steps li')].map((li) => li.textContent) }));
    check(`${name}: pressing it shows the steps`, page2.title === 'Install the game' && page2.steps.length === 3 && page2.steps.join(' ').includes(words), page2.steps[0]);
    if (name === 'iPhone') await p.screenshot({ path: join(here, '../dist/pwa-iphone-steps.png') }).catch(() => undefined);
    await p.getByRole('button', { name: 'Back' }).click();
    check(`${name}: Back returns to the menu`, await buttonShown(p));
    await c.close();
  };
  const phone = { userAgent: UA.iphone, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true };
  await steps('iPhone', phone, { touch: true }, 'Add to Home Screen');
  await steps('Safari on a Mac', { userAgent: UA.macSafari }, {}, 'Add to Dock');
  await steps('Firefox on Windows', { userAgent: UA.firefox }, {}, 'web apps button');
  await steps('Firefox on Android', { userAgent: UA.androidFirefox, viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true }, { touch: true }, 'Add app to Home screen');
  for (const [name, opts, settings, init] of [
    ['Firefox on a Mac', { userAgent: UA.firefoxMac }, {}, null],
    ['iPhone, opened from the home screen', phone, { touch: true }, () => Object.defineProperty(navigator, 'standalone', { get: () => true })],
  ]) {
    const c = await newContext(opts, settings);
    await signedIn(c);
    if (init) await c.addInitScript(init);
    const p = await c.newPage();
    await p.goto(base);
    await menuUp(p);
    check(`${name}: the button is hidden`, !(await buttonShown(p)));
    await c.close();
  }

  // ---- A match with and without the worker ----
  if (play) {
    const match = async (serviceWorkers) => {
      const c = await newContext({ serviceWorkers });
      await signedIn(c);
      const p = await c.newPage();
      if (serviceWorkers === 'allow') {
        // First load fills the store; the measured load is the second.
        await p.goto(`${base}/?seed=1`);
        await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 });
      }
      await p.goto(`${base}/?seed=1`);
      await p.waitForFunction(() => document.getElementById('view') && !document.querySelector('.start-overlay'), null, { timeout: 180_000 });
      await p.waitForTimeout(8000);
      const seen = [];
      p.on('response', (r) => seen.push(r.fromServiceWorker()));
      const frames = await p.evaluate(
        () =>
          new Promise((done) => {
            const times = [];
            const end = performance.now() + 10_000;
            const tick = (t) => {
              times.push(t);
              if (t < end) requestAnimationFrame(tick);
              else done(times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b));
            };
            requestAnimationFrame(tick);
          }),
      );
      const controlled = await p.evaluate(() => Boolean(navigator.serviceWorker?.controller));
      await c.close();
      const at = (q) => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))].toFixed(1);
      return { frames: frames.length, median: at(0.5), p95: at(0.95), requests: seen.length, bySw: seen.filter(Boolean).length, controlled };
    };
    const withSw = await match('allow');
    const without = await match('block');
    console.log(`     with the worker:    ${withSw.frames} frames in 10 s, median ${withSw.median} ms, 95% under ${withSw.p95} ms, ${withSw.requests} requests (${withSw.bySw} by the worker)`);
    console.log(`     workers blocked:    ${without.frames} frames in 10 s, median ${without.median} ms, 95% under ${without.p95} ms, ${without.requests} requests`);
    check('the match ran with the worker in control', withSw.controlled && !without.controlled);
    check('the worker answers nothing while the match plays', withSw.bySw === 0, `${withSw.requests} requests in 10 s of play`);
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
