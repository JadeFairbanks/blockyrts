// Screenshots of a bog for a look by eye (Patch 7, Jade: the bog by the main
// base "needs to look like a bog with the different textures, and also have
// shallow pools of water"), run by hand:
//
//   pnpm --filter @blockyrts/client exec vite --port 5199
//   node packages/client/test-e2e/bog-look.mjs http://localhost:5199 /tmp/shots [seed] [players] [bogX] [bogZ]
//
// bogX and bogZ are the bog's middle in columns (WorldGen.bogsNear); seed 1
// for one player has its base's bog at (-70, 97). Shows all the land (no fog)
// and explored round it, and saves bog-near.png and bog-far.png, looking down
// on the bog.
/* global window */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5199';
const out = process.argv[3] ?? '.';
const seed = process.argv[4] ?? '1';
const players = process.argv[5] ?? '1';
const bx = Number(process.argv[6] ?? -70) * 0.45;
const bz = Number(process.argv[7] ?? 97) * 0.45;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});
await page.goto(`${base}/?seed=${seed}&players=${players}`);
await page.waitForTimeout(9000);
await page.evaluate(() => window.shell.buttons.get('dbg-all').def.onPress({ shift: false, ctrl: false }));
await page.evaluate(([x, z]) => { window.shell.cam.jumpTo(x, z); window.shell.cam.targetDistance = 24; }, [bx, bz]);
await page.waitForTimeout(2000);
await page.evaluate(() => window.shell.buttons.get('dbg-reveal').def.onPress({ shift: false, ctrl: false }));
await page.mouse.move(1270, 300);
await page.waitForTimeout(15000);
await page.screenshot({ path: join(out, 'bog-near.png') });
await page.evaluate(() => { window.shell.cam.targetDistance = 45; });
await page.waitForTimeout(6000);
await page.screenshot({ path: join(out, 'bog-far.png') });
console.log(problems.length ? problems.join('\n') : 'no errors');
await browser.close();
