// Browser look at marked digs (Jade's Patch 4), run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/dig-outline-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 and gives three workers a job each south of the camp: a dig
// 1 m deep, a tunnel chain underground (east, then south) and an earth bank.
// Then it looks with nothing selected (every site a dotted line), with each
// worker selected in turn (its site in full, the others dotted), and with all
// of them selected (every site in full); last a fourth worker joins the dig
// and shows it in full. Saves dig-outline-*.png and prints what it checked.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `dig-outline-${name}.png`) });
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120_000 });
await page.waitForTimeout(2000);

const home = await page.evaluate(() => ({ x: Math.floor(window.shell.cam.focus.x / 0.45), z: Math.floor(window.shell.cam.focus.z / 0.45) }));
const g = await page.evaluate(([x, z]) => Math.round((window.world.heightAt((x + 0.5) * 0.45, (z + 0.5) * 0.45) ?? 0) / 0.1125), [home.x, home.z + 16]);
const workers = await page.evaluate(() => window.world.units.filter((u) => u.owner === 0 && u.typeKey === 'worker').map((u) => Number(u.key.slice(2))));
check('three workers or more', workers.length >= 3, String(workers.length));
const [a, b, c] = workers;

// A dig 8 by 6 columns, 1 m deep; a tunnel 2 m 70 under the ground, east 10 columns then south 8; a bank 1 m high.
await order({ kind: 'dig', player: 0, units: [a], x0: home.x - 4, z0: home.z + 14, x1: home.x + 3, z1: home.z + 19, level: g - 9, level2: 0, tunnel: 0 });
await order({ kind: 'tunnelStretch', player: 0, units: [b], x: home.x + 8, z: home.z + 12, dir: 0, length: 10, level: g - 24, level2: g - 4 });
await order({ kind: 'tunnelStretch', player: 0, units: [b], x: home.x + 18, z: home.z + 12, dir: 2, length: 8, level: g - 24, level2: g - 4, queued: true });
await order({ kind: 'earthwork', player: 0, units: [c], variant: 0, x0: home.x - 14, z0: home.z + 14, x1: home.x - 9, z1: home.z + 16, level: g + 9, level2: 0, axis: 0 });
await page.waitForFunction(() => (window.shell.game.info?.sites.length ?? 0) >= 3, null, { timeout: 30_000 }).catch(() => undefined);
const sites = await page.evaluate(() => window.shell.game.info.sites.map((s) => ({ id: s.id, kind: s.kind })));
check('the dig, both tunnel stretches and the bank are marked', sites.length === 4, JSON.stringify(sites));
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [(home.x + 2) * 0.45, (home.z + 16) * 0.45]);
await page.waitForTimeout(2500);

const vertices = () => page.evaluate(() => window.shell.extras.overlay.n);
const select = async (ids) => {
  await page.evaluate((keys) => window.shell.selection.set(window.world.units.filter((u) => keys.includes(u.key))), ids.map((id) => `e:${id}`));
  await page.waitForTimeout(1500);
};

await select([]);
const none = await vertices();
await shot('none-selected');
await select([a]);
const digOnly = await vertices();
await shot('dig-worker');
await select([b]);
const tunnelOnly = await vertices();
await shot('tunnel-worker');
await select([c]);
const bankOnly = await vertices();
await shot('bank-worker');
await select([a, b, c]);
const all = await vertices();
await shot('all-workers');
// A fourth worker joins the dig, as a right click on it does: the same site, so it shows in full with that worker selected.
const d = workers[3];
const dig = { kind: 'dig', player: 0, x0: home.x - 4, z0: home.z + 14, x1: home.x + 3, z1: home.z + 19, level: g - 9, level2: 0, tunnel: 0 };
await order({ ...dig, units: [d] });
await page.waitForTimeout(1500);
const joined = await page.evaluate((id) => ({ sites: window.shell.game.info.sites.length, orders: window.shell.game.queues.get(id) }), d);
await select([d]);
const helper = await vertices();
await select([]);
const again = await vertices();
check('nothing selected: every site a dotted line', none > 0, `${none} vertices`);
check('the dig worker selected: its dig in full', digOnly !== none, `${digOnly} vertices`);
check('the tunnel worker selected: both stretches in full', tunnelOnly !== none, `${tunnelOnly} vertices`);
check('the bank worker selected: its bank in full', bankOnly !== none, `${bankOnly} vertices`);
check('every worker selected: no dotted line left', all !== none, `${all} vertices`);
check('back to dotted lines once the selection is cleared', Math.abs(again - none) <= 16, `${again} against ${none}`);
check('a worker joining the dig takes the same site', joined.sites === 4 && joined.orders?.[0]?.t === 'dig', JSON.stringify(joined));
check('the joining worker selected: the dig in full', helper === digOnly, `${helper} against ${digOnly}`);
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [(home.x + 2) * 0.45, (home.z + 16) * 0.45]);
await page.evaluate(() => window.shell.cam.zoomBy(0.5, null));
await page.waitForTimeout(1500);
await shot('none-close');

console.log(results.join('\n'));
if (problems.length) console.log(`problems:\n${problems.join('\n')}`);
await browser.close();
