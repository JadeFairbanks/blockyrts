// Browser look at milestone 5's threats, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/m5-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, places a barrow, a goblin village and a gnoll band with the
// debug buttons, calls fog, and saves m5-*.png screenshots.
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
const shot = (name) => page.screenshot({ path: join(out, `m5-${name}.png`) });
const press = (id) => page.click(`[data-btn="${id}"]`);
const jump = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a, b), [x, z]);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45);
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
await jump(home.x + 25, home.z);
await press('dbg-reveal');
await press('dbg-lair');
await page.waitForTimeout(800);
await jump(home.x + 25, home.z - 6);
await page.waitForTimeout(800);
await shot('barrow');
await jump(home.x, home.z - 45);
await press('dbg-reveal');
await press('dbg-village');
await page.waitForTimeout(1000);
await shot('village');
await jump(home.x - 20, home.z + 25);
await press('dbg-tribe');
await jump(home.x, home.z);
await press('dbg-fog');
await page.waitForTimeout(5000);
await shot('fog');
const clock = await page.locator('.clock').first().textContent();
const messages = await page.locator('.message-list').first().textContent();
console.log('clock:', clock);
console.log('messages:', messages);
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
