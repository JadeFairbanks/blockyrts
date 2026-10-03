// Browser performance look for milestone 10, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/perf-look.mjs http://localhost:5198 /tmp/shots [--gpu]
//
// Starts seed 1, runs the clock to nightfall, reveals the land round the town
// and turns the fog of war off, then reads the debug readout's fps, draws,
// units and memory lines with the night's own mobs, and with 400 and 800 more
// set down round the town by the Crowd debug button (the main base is made a
// Citadel first, so it stands while they are counted),
// and saves a screenshot of each. Headless Chromium draws
// with SwiftShader (software) unless --gpu is given, so its frames a second
// say little about a real graphics card; the draw calls, triangles, unit
// counts, main-thread frame time and memory are what to compare.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const gpu = process.argv.includes('--gpu');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});

const readout = () =>
  page.evaluate(() => {
    const out = {};
    for (const row of document.querySelectorAll('.debug .dbg-row')) out[row.querySelector('.dbg-label').textContent] = row.querySelector('.dbg-value').textContent;
    return out;
  });
const press = (id) => page.evaluate((k) => window.shell.buttons.get(k).def.onPress({ shift: false, ctrl: false }), id);
const settle = (ms) => page.waitForTimeout(ms);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120_000 });
// The crowd is night mobs: run the clock at x4 to nightfall (day 180 s and dusk 40 s: step 4400), then back to x1.
await press('dbg-speed');
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 4420, null, { timeout: 300_000, polling: 250 });
await press('dbg-speed');
await press('dbg-speed');
// Everything in view drawn: the land round the town explored and the fog of war off on this screen.
await press('dbg-reveal');
await press('dbg-all');
// A Citadel (7,500 health) so the town stands while the crowd is counted.
await press('dbg-citadel');
await settle(4000);
const rows = [];
const take = async (name) => {
  const r = await readout();
  rows.push(`${name}: fps ${r.fps}, draws ${r.draws}, units ${r.units}, memory ${r.memory}, steps/s ${r['steps/s']}`);
  await page.screenshot({ path: join(out, `perf-${name}.png`) });
};
await take('start');
await press('dbg-crowd');
await press('dbg-crowd');
await settle(8000);
await take('crowd-400');
await press('dbg-crowd');
await press('dbg-crowd');
await settle(8000);
await take('crowd-800');
await browser.close();
for (const r of rows) console.log(r);
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'no console errors');
