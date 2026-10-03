// Browser look at the catalogue models on mobs, animals and peoples, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/models-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, shows the start (wild animals nearby), then puts down night
// mobs, creatures, a lair, a goblin village and a people with the debug
// buttons, and saves models-*.png screenshots. Every one of them should be
// drawn with its model, not as a coloured block.
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
const shot = (name) => page.screenshot({ path: join(out, `models-${name}.png`) });
const press = (id) => page.click(`[data-btn="${id}"]`);
/** S.mob in messages.ts. */
const MOB_AT = 16;
const jump = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a, b), [x, z]);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45);
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
await page.waitForTimeout(3000);
await shot('start');
await press('dbg-all');
const close = () => page.evaluate(() => {
  const c = window.shell.cam;
  c.distance = 18;
  c.targetDistance = 18;
});
const spots = [
  ['late', 'dbg-late', 5],
  ['creature', 'dbg-creature', 6],
  ['lair', 'dbg-lair', 1],
  ['village', 'dbg-village', 1],
  ['tribe', 'dbg-tribe', 3],
  ['people', 'dbg-people', 1],
];
let k = 0;
for (const [name, btn, presses] of spots) {
  k++;
  const x = home.x + 30 * Math.cos(k * 1.1), z = home.z + 30 * Math.sin(k * 1.1);
  await jump(x, z);
  await press('dbg-reveal');
  for (let p = 0; p < presses; p++) {
    await jump(x + p * 3 - presses * 1.5, z);
    await press(btn);
  }
  await jump(x, z);
  await close();
  await page.mouse.move(1270, 300);
  await page.waitForTimeout(3000);
  await shot(name);
}
// Wild animals: the nearest of each of a few species (S.kind 2, S.mob MOB, Animal kind 4), the geese and pheasants among them.
const animals = await page.evaluate(([mobAt]) => {
  const c = window.world.curr;
  const out = {};
  const f = window.shell.cam.focus;
  for (let i = 0; i < c.count; i++) {
    const o = i * 52;
    if (c.data[o + 2] !== 4) continue;
    const sp = c.data[o + mobAt];
    const x = c.data[o + 3] / 8000, z = c.data[o + 5] / 8000;
    const d = Math.hypot(x - f.x, z - f.z);
    if (!out[sp] || out[sp].d > d) out[sp] = { x, z, d };
  }
  return out;
}, [MOB_AT]);
console.log('animal species near:', Object.keys(animals).join(' '));
for (const sp of ['20', '21', '4', '5', '6', '7']) {
  const a = animals[sp];
  if (!a) continue;
  await jump(a.x, a.z + 3);
  await close();
  await page.waitForTimeout(2500);
  await shot(`animal-${sp}`);
}
// Night 0's mobs come in a crowd at the town.
await jump(home.x, home.z);
await press('dbg-crowd');
await page.waitForTimeout(4000);
await shot('crowd');
// What is still drawn as a block: unit stand-ins, and items hanging from slots without a model.
const left = await page.evaluate(() => {
  const u = window.world.unitsView;
  const lib = window.world.models;
  return {
    blocks: u.blocks.count,
    unitModelsAwaited: [...u.asked].filter((id) => !lib.models.has(id)),
    itemStandIns: [...u.attach.meshes].filter(([, e]) => e.standIn).map(([id]) => id),
  };
});
console.log('stand-in blocks now:', JSON.stringify(left));
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
