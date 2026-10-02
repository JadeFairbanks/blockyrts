// Screenshots of the generated world for a look by eye, run by hand:
//
//   pnpm --filter @blockyrts/client exec vite --port 5199
//   node packages/client/test-e2e/world-look.mjs http://localhost:5199 /tmp/shots
/* global window */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5199';
const out = process.argv[3] ?? '.';
const seed = process.argv[4] ?? '1';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  else if (m.text().startsWith('[look]')) console.log(m.text());
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});
const shot = (name) => page.screenshot({ path: join(out, `world-${name}.png`) });
const settle = async (ms) => {
  await page.waitForTimeout(ms);
};
await page.goto(`${base}/?seed=${seed}&players=1`);
await settle(9000);
const info = () => page.evaluate(() => {
  const w = window.world;
  let full = 0, lod = 0, pending = 0;
  for (const c of w.chunks.values()) { if (c.lod === 1) full++; else if (c.lod > 1) lod++; if (c.pending) pending++; }
  return { full, lod, pending, mesh: w.lastMeshMs.toFixed(1), focus: window.shell.cam.focus.toArray().map((v) => v.toFixed(1)) };
});
console.log('start', JSON.stringify(await info()));
await shot('start');
await page.evaluate(() => { window.shell.cam.targetDistance = 80; });
await settle(3000);
await shot('far');
await page.evaluate(() => window.shell.buttons.get('dbg-all').def.onPress({ shift: false, ctrl: false }));
await settle(8000);
console.log('show all', JSON.stringify(await info()));
await shot('show-all');
for (const [name, dx, dz] of [['east', 120, 0], ['south', 0, 140], ['far-ne', 300, -300]]) {
  await page.evaluate(([x, z]) => window.shell.cam.panBy(x, z), [dx, dz]);
  await settle(8000);
  console.log(name, JSON.stringify(await info()));
  await shot(name);
}
await page.evaluate(() => { window.shell.cam.jumpTo(0, 0); window.shell.cam.targetDistance = 25; });
await page.evaluate(() => window.shell.buttons.get('dbg-all').def.onPress({ shift: false, ctrl: false }));
await settle(5000);
await shot('close');
await page.evaluate(() => window.shell.buttons.get('dbg-reveal').def.onPress({ shift: false, ctrl: false }));
await settle(6000);
await page.evaluate(() => { window.shell.cam.targetDistance = 80; });
await settle(3000);
await shot('revealed');
console.log(problems.slice(0, 20).join('\n'));
await browser.close();
