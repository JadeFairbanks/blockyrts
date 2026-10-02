// Browser look at the sim gap fixes, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/gap-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, builds the debug Hill east of the camp, selects the four
// workers, presses Dig on the hill's south side (above its 45 cm ledge) and
// marks a tunnel, then runs at x16 until the tunnel is finished and saves
// gap-*.png screenshots.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const shot = (name) => page.screenshot({ path: join(out, `gap-${name}.png`) });
const press = (id) => page.click(`[data-btn="${id}"]`);
const jump = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a, b), [x, z]);
const COLUMN = 0.45;
const UNIT = 0.1125;

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120000 });
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
const hx = home.x + 14;
await jump(hx, home.z);
await press('dbg-reveal');
await page.waitForTimeout(600);
const c = await page.evaluate(() => {
  const f = window.shell.cam.focus;
  return { x: Math.floor(f.x / 0.45), z: Math.floor(f.z / 0.45), y: Math.round((window.world.heightAt(f.x, f.z) ?? 0) / 0.1125) };
});
await press('dbg-hill');
// The land redraws once the edit is stepped and meshed.
await page.waitForFunction((q) => (window.world.heightAt((q.x + 0.5) * 0.45, (q.z + 0.5) * 0.45) ?? 0) > 3, c, { timeout: 60000 });
await page.waitForTimeout(500);
await shot('hill');
// The four workers.
await page.evaluate(() => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === 'worker')));
await page.evaluate(() => window.shell.commands.startArea('dig', 0));
// A point on the hill's south face, 1 m above the ledge, then along the face 2 columns.
const facePoint = (dx) => ({ x: (c.x + dx + 0.5) * COLUMN, y: (c.y + 4) * UNIT + 1, z: (c.z + 6) * COLUMN - 0.001 });
const screen = (p) => page.evaluate((q) => {
  const o = { x: 0, y: 0 };
  window.shell.cam.project(q, o);
  return o;
}, p);
const a = await screen(facePoint(0));
const b = await screen(facePoint(2));
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 5 });
await page.mouse.up();
const plan = await page.evaluate(() => window.shell.commands.areaPlan());
console.log('plan:', JSON.stringify(plan), 'hill at', JSON.stringify(c));
await shot('marked');
await page.evaluate(() => window.shell.commands.confirmArea());
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction(() => /tunnel is finished/.test(document.querySelector('.message-list')?.textContent ?? ''), null, { timeout: 240000 }).catch(() => console.log('tunnel not finished in time'));
await jump(hx, home.z + 4);
await page.waitForTimeout(800);
await shot('tunnel');
const messages = await page.locator('.message-list').first().textContent();
console.log('messages:', messages);
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
