// Browser look at Patch 7's gun smoke and muzzle flashes, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/gun-smoke-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 and, on open ground past the main base, fires a cannon, a
// musket and the brawler's pistol in a row, all pointing the same way (left
// to right on screen) in slow motion, straight through the units view's own gun effect,
// and saves a burst of frames as the smoke blows out along the line and hangs:
// guns-day-*.png, then guns-night-*.png with the view's darkness forced to 1.
// (`pnpm dev` builds the models first; started with vite alone, run the tools' models:build once.)
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 180000 });
await page.waitForTimeout(6000);
const spot = await page.evaluate(() => {
  const f = window.shell.cam.focus;
  const x = f.x + 14;
  const z = f.z;
  const r = window.shell.cam.right();
  // The guns sit in the upper half of the view, clear of the HUD.
  window.shell.cam.jumpTo(x + r.z * 4, z - r.x * 4);
  window.shell.cam.distance = 10;
  window.shell.cam.targetDistance = 10;
  return { x, z };
});
await page.waitForTimeout(1500);

// Slow motion on the frame clock (window.slow of real time: 3%, and 0.1% for the first frame so it catches the flash), as the screenshots are slow under a software renderer.
await page.evaluate(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let real = performance.now();
  let clock = real;
  window.slow = 0.03;
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      clock += (t - real) * window.slow;
      real = t;
      cb(clock);
    });
});

async function round(name, night) {
  if (night) await page.evaluate(() => { window.world.darkness = () => 1; });
  await page.evaluate(({ x, z }) => {
    window.slow = 0.001;
    const v = window.world.unitsView;
    // Pointing to the right on screen, the guns in a row up the screen through the middle.
    const r = window.shell.cam.right();
    const dir = { x: r.x, y: 0, z: r.z };
    // The units view's GUN looks (units-view.ts).
    const guns = [
      { smoke: 5, size: 0.7, burst: 12, push: 12, glow: 16, sparks: 40, sparkSpeed: 9, flash: 'cannonMuzzle' },
      { smoke: 4, size: 0.4, burst: 8, push: 10, glow: 10, sparks: 24, sparkSpeed: 8, flash: 'musket' },
      { smoke: 3, size: 0.3, burst: 5, push: 7, glow: 7, sparks: 14, sparkSpeed: 6, flash: 'pistol' },
    ];
    guns.forEach((g, k) => {
      const gx = x - r.x * 2 + r.z * (k - 1) * 3;
      const gz = z - r.z * 2 - r.x * (k - 1) * 3;
      const y = window.world.groundAt(gx, gz) + (k === 0 ? 1 : 1.3);
      v.gunFire(gx, y, gz, dir, g);
    });
  }, spot);
  const t0 = Date.now();
  for (let k = 0; k < 16; k++) {
    await page.waitForTimeout(120);
    console.log(`${name} ${k}: ${Date.now() - t0} ms real`);
    await page.locator('canvas').first().screenshot({ path: join(out, `guns-${name}-${String(k).padStart(2, '0')}.png`) });
    if (k === 0) await page.evaluate(() => { window.slow = 0.03; });
  }
  // Until this round's smoke is gone (about 7 s of slowed time).
  if (!night) await page.waitForTimeout(240000);
}
await round('day', false);
await round('night', true);
if (problems.length) console.log(`console problems:\n  ${problems.slice(0, 10).join('\n  ')}`);
await browser.close();
