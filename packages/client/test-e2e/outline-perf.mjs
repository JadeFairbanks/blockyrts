// Frame time with and without Jade's Patch 3 outlines, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198    (this branch)
//   node packages/client/test-e2e/outline-perf.mjs http://localhost:5198 /tmp/shots after [--gpu]
//   (and the same on a checkout from before the patch, with `before`)
//
// A busy camp at 1920 by 1080: seed 1, the main base made a Citadel, the
// siege kit (three engines and their crews) and a Barn with its animals set
// down beside it, the trees of the pocket in view, five of the player's units
// walked round behind the Citadel where it hides them. Reads 20 s of frames:
// the main thread's milliseconds a frame (the debug readout) and the time
// between frames, then the same at night with 400 more monsters round the
// town. With this branch it also prints what the outline measurements and
// outlines cost. Headless Chromium draws with SwiftShader (software) unless
// --gpu is given: the main-thread time is what compares across machines.
/* global window, document, requestAnimationFrame -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const label = process.argv[4] ?? 'run';
const gpu = process.argv.includes('--gpu');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const press = (id) => page.evaluate((k) => window.shell.buttons.get(k).def.onPress({ shift: false, ctrl: false }), id);
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);
const step = () => page.evaluate(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent));
const WU = 8000;

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120_000 });
await page.evaluate(() => window.shell.cam.jumpTo(0, 4));
await page.waitForTimeout(1500);
await press('dbg-citadel');
await page.evaluate(() => window.shell.cam.jumpTo(9, 2));
await page.waitForTimeout(800);
await press('dbg-siege');
await page.evaluate(() => window.shell.cam.jumpTo(-10, 2));
await page.waitForTimeout(800);
await press('dbg-barn');
await page.waitForTimeout(3000);
// Five of the player's units round behind the Citadel (north of it, away from the camera).
const own = await page.evaluate(() => window.world.units.filter((u) => u.owner === 0 && u.key.startsWith('e:') && /worker|warrior/.test(u.typeKey)).map((u) => Number(u.key.slice(2))));
for (const [k, id] of own.slice(0, 5).entries()) await order({ kind: 'move', player: 0, units: [id], x: Math.round((-2 + k) * WU), z: Math.round(-4.2 * WU) });
await page.evaluate(() => window.shell.cam.jumpTo(0, -6));
await page.waitForTimeout(20_000);

const frames = (ms) =>
  page.evaluate(
    (span) =>
      new Promise((resolve) => {
        const gaps = [];
        const busy = [];
        let last = 0;
        const t0 = performance.now();
        const tick = (now) => {
          if (last) gaps.push(now - last);
          last = now;
          if (now - t0 < span) requestAnimationFrame(tick);
          else resolve({ gaps, busy });
        };
        const read = setInterval(() => {
          const t = document.querySelector('.debug .dbg-row:nth-child(7) .dbg-value')?.textContent ?? '';
          const m = /\(([\d.]+) ms\)/.exec(t);
          if (m) busy.push(Number(m[1]));
        }, 2000);
        requestAnimationFrame(tick);
        setTimeout(() => clearInterval(read), span);
      }),
    ms,
  );
const stats = () => page.evaluate(() => (window.world.outlineStats ? { ...window.world.outlineStats } : null));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const rows = [];
const measure = async (name) => {
  const s0 = await stats();
  const f = await frames(20_000);
  const s1 = await stats();
  const r = await page.evaluate(() => document.querySelector('.debug .dbg-row:nth-child(8) .dbg-value')?.textContent ?? '');
  let line = `${label} ${name}: main thread ${mean(f.busy).toFixed(2)} ms a frame, ${mean(f.gaps).toFixed(0)} ms between frames (${f.gaps.length} frames), draws ${r}`;
  if (s0 && s1) {
    const n = s1.samples - s0.samples;
    const o = s1.outlineFrames - s0.outlineFrames;
    line += `; outline measurements ${n} (${n ? ((s1.sampleMs - s0.sampleMs) / n).toFixed(2) : 0} ms each), outlines drawn on ${o} frames (${o ? ((s1.outlineMs - s0.outlineMs) / o).toFixed(2) : 0} ms each), ${s1.outlined} units outlined`;
  }
  rows.push(line);
  await page.screenshot({ path: join(out, `perf-${label}-${name}.png`) });
};
await measure('camp');
// Night: x4 to nightfall (step 4400), then 400 monsters round the town.
await press('dbg-speed');
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 4420, null, { timeout: 600_000, polling: 500 });
await press('dbg-speed');
await press('dbg-speed');
await page.evaluate(() => window.shell.cam.jumpTo(0, 0));
await press('dbg-crowd');
await press('dbg-crowd');
await page.evaluate(() => window.shell.cam.jumpTo(0, -6));
await page.waitForTimeout(8000);
await measure('night-400');
console.log(`step ${await step()}`);
await browser.close();
for (const r of rows) console.log(r);
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'no page errors');
