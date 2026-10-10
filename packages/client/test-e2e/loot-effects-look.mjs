// Browser look at Patch 7's loot effects, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/loot-effects-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 and checks the build menu has no Trophies until a bog
// guardian's club is in the stock, then opens Trophies (P) and plants the Bog
// trophy (B) in godmode, with its ring on the ghost and on the planted
// trophy, and Victor's trophy beside it. For the Deathless Shroud it needs a
// mage wearing one: until the equip orders are in, run it with a local
// change that dresses godmode's mages in the Shroud. It places a battle mage
// and three zombies round her; their blows raise a skeleton archer in the
// player's colour, whose panel and card are read, and which falls after 25 s.
// Saves effects-*.png and prints what it checked. (`pnpm dev` builds the
// models first; started with vite alone, run the tools' models:build once.)
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
/** The godmode spawn list, looked up by name in the page. */
const GOD_TS = fileURLToPath(new URL('../../sim/src/debug/god.ts', import.meta.url));
/** Res.BogGuardianClub and Res.MorvathStaff at Patch 7. */
const CLUB = 200;
const STAFF = 209;
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
const shot = (name) => page.screenshot({ path: join(out, `effects-${name}.png`) });
const key = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(300);
};
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);
const badges = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.hud-btn.cmd')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => b.querySelector('.key')?.textContent?.trim() ?? '')
      .join(' '),
  );
const selectWorkers = async () => {
  await page.evaluate(() => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === 'worker')));
  await page.waitForTimeout(300);
};

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 180000 });
// The tester tools (godmode needs them open), and time for the models to load.
await page.evaluate(() => window.shell.toggleTesterTools());
await page.waitForTimeout(8000);

// No trophy in the stock: the build menu keeps its fourteen buttons.
await selectWorkers();
await key('b');
const before = await badges();
check('no Trophies button without a trophy in the stock', !before.split(' ').includes('P'), before);
await key('Escape');
await key('Escape');
await order({ kind: 'debugGive', player: 0, res: CLUB, count: 1 });
await order({ kind: 'debugGive', player: 0, res: STAFF, count: 1 });
await page.waitForTimeout(600);
await selectWorkers();
await key('b');
const after = await badges();
check('a Trophies button on P once a club is in the stock', after.split(' ').includes('P'), after);
await key('p');
const trophies = await badges();
check('Trophies holds the Bog trophy on B and Victor\'s trophy on V', trophies === 'B V Esc', trophies);
await shot('trophies-menu');
await key('Escape');
await key('Escape');

// The workers plant them: 2 s of work each.
await selectWorkers();
await key('b');
await key('p');
await key('b');
const placing = await page.evaluate(() => window.shell.commands.placing?.kind ?? null);
check('B P B picks up the Bog trophy', placing === 25, String(placing));
await page.mouse.move(820, 450);
await page.waitForTimeout(500);
await shot('ghost');
await page.mouse.click(820, 450);
await page.waitForTimeout(500);
await key('Escape');
await key('Escape');
await selectWorkers();
await key('b');
await key('p');
await key('v');
const placingV = await page.evaluate(() => window.shell.commands.placing?.kind ?? null);
check("B P V picks up Victor's trophy", placingV === 26, String(placingV));
await page.mouse.move(790, 525);
await page.waitForTimeout(500);
await shot('ghost-victor');
await page.mouse.click(790, 525);
await page.waitForTimeout(400);
await key('Escape');
await page.waitForTimeout(15000);
const planted = await page.evaluate(() => [...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith('building:25:')).length);
check('the Bog trophy planted', planted === 1, String(planted));
await page.evaluate(() => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith('building:25:'))));
await page.waitForTimeout(800);
const bogPanel = await page.evaluate(() => window.shell.selection.list()[0]?.details?.join(' | ') ?? '');
check('the selected trophy names its effect', /slower/.test(bogPanel), bogPanel);
const bogCard = await page.evaluate(() => window.shell.commands.card().filter((c) => c).map((c) => c.action));
check('the selected trophy can be picked up', bogCard.includes('cancelBuild') || bogCard.some((a) => /cancel|pick/i.test(a)), bogCard.join(' '));
await shot('bog-trophy');
await key('Escape');
const victor = await page.evaluate(() => [...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith('building:26:')).length);
check("Victor's trophy planted", victor === 1, String(victor));
await page.evaluate(() => window.shell.selection.set([]));
await page.waitForTimeout(600);
await shot('both-trophies');

// The Deathless Shroud: godmode, a battle mage (dressed in it by the local godmode change) and three zombies round her.
const spawns = await page.evaluate((path) => import(/* @vite-ignore */ `/@fs${path}`).then((m) => m.GOD_SPAWNS.map((g) => g.name)), GOD_TS);
const BATTLE_MAGE = spawns.indexOf('Battle mage');
const ZOMBIE = spawns.indexOf('Zombie');
await page.evaluate(() => window.shell.toggleGod());
await page.waitForFunction(() => window.shell.game.info?.god === true, null, { timeout: 20000 });
const focus = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
const M = 8000;
const mx = Math.round((focus.x - 6) * M);
const mz = Math.round((focus.z + 4) * M);
await order({ kind: 'debugPlace', player: 0, what: BATTLE_MAGE, x: mx, z: mz });
await page.waitForTimeout(500);
for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5]]) await order({ kind: 'debugPlace', player: 0, what: ZOMBIE, x: mx + dx * M, z: mz + dz * M });
let risen = [];
for (let k = 0; k < 40 && risen.length === 0; k++) {
  await page.waitForTimeout(500);
  risen = await page.evaluate(() => window.world.units.filter((u) => u.typeKey.startsWith('risen:')).map((u) => ({ key: u.key, label: u.label, details: u.details, owner: u.owner })));
}
check('a skeleton archer rises when the Shroud\'s wearer is hurt', risen.length >= 1, JSON.stringify(risen[0] ?? null));
check('it is the player\'s, named Risen skeleton archer', risen[0]?.owner === 0 && risen[0]?.label === 'Risen skeleton archer', `${risen[0]?.owner} ${risen[0]?.label}`);
if (!risen.length) console.log('near the mage:', JSON.stringify(await page.evaluate(() => window.world.units.filter((u) => /^(mage|mob)/.test(u.typeKey)).map((u) => `${u.typeKey} ${u.details[0] ?? ''}`))));
await page.evaluate(([x, z]) => {
  window.shell.cam.jumpTo(x, z);
  window.shell.cam.distance = 9;
  window.shell.cam.targetDistance = 9;
}, [mx / M, mz / M]);
await page.waitForTimeout(1500);
await shot('risen');
await page.evaluate((k) => window.shell.selection.set(window.world.units.filter((u) => u.key === k)), risen[0]?.key ?? '');
await page.waitForTimeout(800);
const risenCard = await page.evaluate(() => window.shell.commands.card().filter((c) => c).map((c) => c.action));
check('its card is Attack, Patrol, Move and the pace', risenCard.slice(0, 3).join(' ') === 'attack patrol move' && risenCard.length === 4, risenCard.join(' '));
await shot('risen-selected');
// It falls 25 s after it rises (or sooner, in the fight).
const id = risen[0]?.key;
let gone = false;
for (let k = 0; k < 70 && !gone; k++) {
  await page.waitForTimeout(500);
  gone = await page.evaluate((key) => !window.world.units.some((u) => u.key === key), id);
}
check('it falls within 25 s', risen.length > 0 && gone);
await page.waitForTimeout(400);
await shot('risen-falls');

for (const r of results) console.log(r);
if (problems.length) console.log(`console problems:\n  ${problems.slice(0, 10).join('\n  ')}`);
await browser.close();
