// Browser look at Jade's Patch 3 fog look and hidden-unit outlines, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/outline-look.mjs http://localhost:5198 /tmp/shots [--gpu]
//
// Starts seed 1 at 1920 by 1080, walks a warrior out of the camp and back so
// the land it saw is remembered (darkened, still in colour), then walks a
// worker round behind the Big House (north of it, away from the camera) and
// checks it gets an outline once it is hidden and loses it when it walks out
// again; last it reads the main thread's frame time with the camp full of
// units, and what the outline measurements and outlines cost. Saves
// outline-*.png. Headless Chromium draws with SwiftShader (software) unless
// --gpu is given, so the frame time there says little about a real card; the
// main-thread milliseconds of the outline work are what to compare.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const gpu = process.argv.includes('--gpu');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `outline-${name}.png`) });
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);
const WU = 8000;

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120_000 });
await page.waitForTimeout(3000);

const own = () =>
  page.evaluate(() =>
    window.world.units
      .filter((u) => u.owner === 0 && u.key.startsWith('e:'))
      .map((u) => ({ id: Number(u.key.slice(2)), type: u.typeKey, x: u.centre.x, z: u.centre.z })),
  );
const house = await page.evaluate(() => {
  const b = window.shell.items.find((i) => i.item.key.startsWith('b:') && i.item.owner === 0)?.item;
  return b ? { x: b.centre.x, z: b.centre.z, hx: b.halfSize.x, hz: b.halfSize.z, hy: b.halfSize.y } : null;
});
check('found the Big House', house !== null, JSON.stringify(house));
const units = await own();
const worker = units.find((u) => u.type === 'worker');
const warrior = units.find((u) => u.type === 'warrior');
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x, house.z]);
await page.waitForTimeout(1500);
await shot('start');

// 1. Remembered land: a warrior walks 45 m east and back; the land it saw out there stays explored, darkened, in colour.
await order({ kind: 'move', player: 0, units: [warrior.id], x: Math.round((house.x + 45) * WU), z: Math.round(house.z * WU) });
await page.waitForFunction(([id, x]) => (window.world.units.find((u) => u.key === `e:${id}`)?.centre.x ?? 0) > x, [warrior.id, house.x + 40], { timeout: 120_000 }).catch(() => undefined);
await order({ kind: 'move', player: 0, units: [warrior.id], x: Math.round((house.x + 6) * WU), z: Math.round((house.z + 8) * WU) });
await page.waitForFunction(([id, x]) => (window.world.units.find((u) => u.key === `e:${id}`)?.centre.x ?? 99) < x, [warrior.id, house.x + 10], { timeout: 120_000 }).catch(() => undefined);
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x + 26, house.z]);
await page.waitForTimeout(2500);
const remembered = await page.evaluate(([x, z]) => ({ explored: window.world.exploredNow(x, z), seen: window.world.seenNow(x, z) }), [house.x + 40, house.z]);
check('land 40 m east is explored and out of sight', remembered.explored && !remembered.seen, JSON.stringify(remembered));
await shot('remembered');

// 2. The main base made a Citadel; a worker walks round behind it (north, away from the camera): an outline once it is hidden.
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x, house.z + 4]);
await page.evaluate(() => window.shell.buttons.get('dbg-citadel').def.onPress({ shift: false, ctrl: false }));
await page.waitForFunction(() => window.shell.items.some((i) => i.item.key.startsWith('b:') && i.item.label === 'Citadel'), null, { timeout: 60_000 });
const keep = await page.evaluate(() => {
  const b = window.shell.items.find((i) => i.item.key.startsWith('b:') && i.item.label === 'Citadel')?.item;
  return b ? { x: b.centre.x, z: b.centre.z, hx: b.halfSize.x, hz: b.halfSize.z, hy: b.halfSize.y } : null;
});
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [keep.x, keep.z + 4]);
const behind = { x: keep.x + 1, z: keep.z - keep.hz - 1 };
const hiddenOf = (id) => page.evaluate((u) => {
  const t = window.world.outlines.tallies.get(u);
  return t ? `${t.seen} of ${t.all} seen` : 'not measured';
}, id);
await order({ kind: 'move', player: 0, units: [worker.id], x: Math.round(behind.x * WU), z: Math.round(behind.z * WU) });
const outlined = await page
  .waitForFunction((id) => window.world.outlines.outlined.has(id), worker.id, { timeout: 90_000, polling: 250 })
  .then(() => true)
  .catch(() => false);
const where = (await own()).find((u) => u.id === worker.id);
check('the worker behind the Citadel is outlined', outlined, `worker at ${where?.x.toFixed(1)}, ${where?.z.toFixed(1)}; keep ${JSON.stringify(keep)}; ${await hiddenOf(worker.id)}`);
await page.waitForTimeout(1500);
await shot('outlined-citadel');

// 3. It walks back out in front: the outline goes.
await order({ kind: 'move', player: 0, units: [worker.id], x: Math.round(keep.x * WU), z: Math.round((keep.z + keep.hz + 3) * WU) });
const gone = await page
  .waitForFunction((id) => !window.world.outlines.outlined.has(id), worker.id, { timeout: 90_000, polling: 250 })
  .then(() => true)
  .catch(() => false);
check('the outline goes once it walks out in front', gone, await hiddenOf(worker.id));
await page.waitForTimeout(1000);
await shot('in-front');

// 3b. Under a tall tree, just north of its trunk: its crown hides most of a worker from the camera.
const tree = await page.evaluate(([hx, hz]) => {
  const trees = [...window.world.hooks.selectables.candidates()]
    .filter((t) => t.key.startsWith('p:') && t.halfSize.y > 2 && Math.hypot(t.centre.x - hx, t.centre.z - hz) < 40)
    .sort((a, b) => b.halfSize.y - a.halfSize.y);
  const t = trees[0];
  return t ? { x: t.centre.x, z: t.centre.z, hy: t.halfSize.y, label: t.label, of: trees.length } : null;
}, [keep.x, keep.z]);
check('found a tall tree near the camp', tree !== null, JSON.stringify(tree));
const h2 = units.find((u) => u.type === 'worker' && u.id !== worker.id);
if (tree) {
  await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [tree.x, tree.z + 3]);
  await order({ kind: 'move', player: 0, units: [h2.id], x: Math.round(tree.x * WU), z: Math.round((tree.z - 0.9) * WU) });
  await page.waitForFunction(([id, x, z]) => {
    const u = window.world.units.find((v) => v.key === `e:${id}`);
    return u && Math.hypot(u.centre.x - x, u.centre.z - z) < 0.8;
  }, [h2.id, tree.x, tree.z - 0.9], { timeout: 90_000, polling: 250 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  const share = await page.evaluate((u) => {
    const t = window.world.outlines.tallies.get(u);
    return t && t.all > 0 ? 1 - t.seen / t.all : -1;
  }, h2.id);
  const lit = await page.evaluate((id) => window.world.outlines.outlined.has(id), h2.id);
  check('under the tree: outlined exactly when 80% or more is hidden', share >= 0 && lit === share >= 0.8, `${Math.round(share * 100)}% hidden, ${lit ? 'outlined' : 'no outline'}`);
  await shot('tree');
}
const stats = await page.evaluate(() => ({ ...window.world.outlineStats }));
check('outline measurements ran', stats.samples > 0, JSON.stringify(stats));
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [keep.x, keep.z + 4]);

// 4. Cost: frame time with the camp in view and the outline work on, from the debug readout and the outline stats.
const readout = () =>
  page.evaluate(() => {
    const o = {};
    for (const row of document.querySelectorAll('.debug .dbg-row')) o[row.querySelector('.dbg-label').textContent] = row.querySelector('.dbg-value').textContent;
    return o;
  });
await order({ kind: 'move', player: 0, units: [worker.id], x: Math.round(behind.x * WU), z: Math.round(behind.z * WU) });
await page.waitForFunction((id) => window.world.outlines.outlined.has(id), worker.id, { timeout: 90_000, polling: 250 }).catch(() => undefined);
const s0 = await page.evaluate(() => ({ ...window.world.outlineStats }));
await page.waitForTimeout(10_000);
const s1 = await page.evaluate(() => ({ ...window.world.outlineStats }));
const r = await readout();
const samples = s1.samples - s0.samples;
const frames = s1.outlineFrames - s0.outlineFrames;
console.log(`readout: ${JSON.stringify(r)}`);
console.log(`outline measurements: ${samples} in 10 s, ${(samples ? (s1.sampleMs - s0.sampleMs) / samples : 0).toFixed(2)} ms main thread each`);
console.log(`outlines drawn: ${frames} frames, ${(frames ? (s1.outlineMs - s0.outlineMs) / frames : 0).toFixed(2)} ms main thread each`);
await browser.close();
for (const line of results) console.log(line);
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'no console errors');
