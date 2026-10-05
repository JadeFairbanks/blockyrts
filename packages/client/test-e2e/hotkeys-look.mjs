// Browser look at the menus' letters (Jade's Patch 4), run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/hotkeys-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, selects the four workers and drives the build menu from the
// keyboard alone: B opens it with a letter on every button, D opens Defences
// and Esc steps back out, B T B picks up a bonfire (the torch post is greyed
// out, with no resin at the start) and B F a Farm. Then the debug troop kit
// puts down a Forge: its K menu's letters are read and H queues Charcoal.
// Last the main base's K menu holds Rope on R. Saves hotkeys-*.png and prints
// what it checked.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `hotkeys-${name}.png`) });
const key = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(300);
};
/** The key badges of the card's shown buttons, in order. */
const badges = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.hud-btn.cmd')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => b.querySelector('.key')?.textContent?.trim() ?? '')
      .join(' '),
  );
const placing = () => page.evaluate(() => window.shell.commands.placing?.kind ?? null);
const selectWorkers = async () => {
  await page.evaluate(() => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === 'worker')));
  await page.waitForTimeout(300);
};
const selectBuilding = async (kind) => {
  await page.evaluate((k) => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith(`building:${k}:`))), kind);
  await page.waitForTimeout(400);
};

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 180000 });
await page.waitForTimeout(500);

await selectWorkers();
await key('b');
const build = await badges();
check('B: the build menu, a letter on every button', build === 'H F R S I W G A B M C N D T Esc', build);
await shot('build');
await key('d');
const defences = await badges();
check('D: Defences, a letter on every button', defences === 'W H S G F A D E U T R N K P I B M Esc', defences);
await shot('defences');
await key('Escape');
check('Esc: back to the build menu', (await badges()) === build);
await key('Escape');
check('Esc again: back to the workers', (await badges()).startsWith('M G C R D T B'), await badges());
await key('b');
await key('t');
const lights = await badges();
check('B T: Lights', lights === 'T B Esc', lights);
await key('b');
check('B: a bonfire picked up', (await placing()) === 18, String(await placing()));
await key('Escape');
await key('Escape');
await selectWorkers();
await key('b');
await key('f');
check('B F: a Farm picked up', (await placing()) === 1, String(await placing()));
await page.mouse.move(720, 450);
await page.waitForTimeout(400);
await shot('farm');
await key('Escape');
check('Esc: the Farm put back', (await placing()) === null);

// The debug troop kit: a finished Forge, Barracks and a level 7 main base, east of the camp.
await page.evaluate(() => window.shell.cam.jumpTo(window.shell.cam.focus.x + 16, window.shell.cam.focus.z + 4));
await page.waitForTimeout(500);
await page.evaluate(() => window.shell.buttons.get('dbg-troops').def.onPress({ shift: false, ctrl: false }));
await page.waitForFunction(() => [...window.world.buildings.selectables()].some((s) => s.typeKey.startsWith('building:6:')), null, { timeout: 30000 });
await selectBuilding(6);
const forge = await badges();
check("the Forge's K menu, opened straight away", forge === 'C T B W P I S A H R G U', forge);
const queued = () => page.evaluate(() => [...window.shell.commands.d.game.buildings.values()].filter((b) => b.kind === 6).reduce((n, b) => n + b.queue.length, 0));
const before = await queued();
await key('h');
await page.waitForTimeout(500);
check('H at the Forge: Charcoal queued', (await queued()) === before + 1, `${before} then ${await queued()}`);
await shot('forge');
await selectBuilding(0);
await key('k');
const main = await badges();
check("K at the main base: Rope on R, Back on Esc", main === 'R Esc', main);

console.log(results.join('\n'));
if (problems.length) console.log(`problems:\n${problems.join('\n')}`);
await browser.close();
