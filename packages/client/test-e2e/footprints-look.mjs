// Browser look at footprints, picking and manning (patch notes 1), run by hand
// (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/footprints-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 and looks at the finished Big House (no scaffold); places a
// softwood tower with the workers (only the footprint tiles show) and runs at
// x4 until it stands; right-clicks it with the warriors, who go up and are
// drawn on its top; makes the main base a Citadel with the debug button, sends
// the workers up its walls with E and a click, and lets them down with U; then
// runs on into night 0 until a man up top says one of his lines.
// Saves footprints-*.png and prints what it checked.
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
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `footprints-${name}.png`) });
const press = (id) => page.click(`[data-btn="${id}"]`);
const jump = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a, b), [x, z]);
const screen = (p) =>
  page.evaluate((q) => {
    const o = { x: 0, y: 0 };
    window.shell.cam.project(q, o);
    return o;
  }, p);
/** The middle of a column on the ground, as the land is drawn. */
const ground = (x, z) => page.evaluate(([a, b]) => ({ x: (a + 0.5) * 0.45, y: window.world.heightAt((a + 0.5) * 0.45, (b + 0.5) * 0.45) ?? 0, z: (b + 0.5) * 0.45 }), [x, z]);
/** A building's click box centre, as the picker sees it. */
const centreOf = (id) => page.evaluate((k) => {
  for (const s of window.world.buildings.selectables()) if (s.key === k) return { x: s.centre.x, y: s.centre.y, z: s.centre.z };
  return null;
}, `b:${id}`);
const hover = async (p) => {
  const s = await screen(p);
  await page.mouse.move(s.x, s.y, { steps: 4 });
  // Software rendering draws about 2 frames a second: give the frame time.
  await page.waitForTimeout(1100);
  return s;
};
const click = async (p, button = 'left') => {
  const s = await hover(p);
  await page.mouse.click(s.x, s.y, { button });
  await page.waitForTimeout(300);
};
const select = (typeKey) => page.evaluate((t) => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === t && u.owner === window.shell.game.player)), typeKey);
/** Ids of the player's units of a type drawn up top (the OnTop flag, 4096). */
const upTop = (typeKey) => page.evaluate((t) => window.world.units.filter((u) => u.typeKey === t && u.owner === window.shell.game.player).map((u) => Number(u.key.slice(2))).filter((id) => ((window.shell.game.unit(id)?.flags ?? 0) & 4096) !== 0), typeKey);
const panel = () => page.evaluate(() => document.body.innerText.split('\n').filter((l) => /Up top|inside/i.test(l)).join(' | '));
const OWN_MAIN = () => page.evaluate(() => [...window.shell.game.buildings.values()].find((b) => b.kind === 0 && b.owner === window.shell.game.player)?.id ?? 0);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120000 });
await page.waitForTimeout(1000);

// ---- The Big House: finished, with no scaffold drawn round it. ----
const main = await OWN_MAIN();
const house = await centreOf(main);
await jump(house.x, house.z + 6);
await page.waitForTimeout(1500);
await shot('big-house');

// ---- A softwood tower placed by the workers: only its footprint tiles show. ----
await select('worker');
await page.evaluate(() => window.shell.commands.startPlacing(14, 0));
const spot = { x: Math.floor(house.x / 0.45) + 14, z: Math.floor(house.z / 0.45) + 4 };
await jump(spot.x * 0.45, spot.z * 0.45 + 4);
await page.waitForTimeout(1500);
await hover(await ground(spot.x, spot.z));
await shot('placing-tower');
await click(await ground(spot.x, spot.z));
await page.keyboard.press('Escape');
const towerId = () => page.evaluate(() => [...window.shell.game.buildings.values()].find((b) => b.kind === 14 && b.owner === window.shell.game.player)?.id ?? 0);
await page.waitForFunction(() => [...window.shell.game.buildings.values()].some((b) => b.kind === 14), null, { timeout: 10000 }).catch(() => undefined);
check('the tower is placed', (await towerId()) > 0);
await press('dbg-speed');
await page.waitForFunction(() => [...window.shell.game.buildings.values()].some((b) => b.kind === 14 && b.complete), null, { timeout: 120000 }).catch(() => undefined);
// x4 -> x16 -> x1.
await press('dbg-speed');
await press('dbg-speed');
const tower = await towerId();
check('the tower stands', await page.evaluate((id) => window.shell.game.buildings.get(id)?.complete === true, tower));

// ---- Right click on the tower with the warriors: they go up. ----
await select('warrior');
const tc = await centreOf(tower);
await jump(tc.x, tc.z + 2);
await page.waitForTimeout(800);
await click(tc, 'right');
await page.waitForFunction(() => window.world.units.filter((u) => u.typeKey === 'warrior').some((u) => ((window.shell.game.unit(Number(u.key.slice(2)))?.flags ?? 0) & 4096) !== 0), null, { timeout: 60000 }).catch(() => undefined);
await page.waitForTimeout(3000);
const onTower = await upTop('warrior');
check('the warriors stand on the tower, drawn there', onTower.length === 3, onTower.join(','));
await page.evaluate((k) => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.key === k)), `b:${tower}`);
await page.waitForTimeout(800);
const towerPanel = await panel();
check('the tower panel lists them', /Up top: 3 of 4/.test(towerPanel), towerPanel);
await shot('tower-manned');

// ---- The Citadel: E and a click sends the workers up its walls. ----
await press('dbg-citadel');
await page.waitForFunction((id) => window.shell.game.buildings.get(id)?.level === 10, main, { timeout: 30000 });
await select('worker');
await page.waitForTimeout(500);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const cc = await centreOf(main);
await jump(cc.x, cc.z);
await page.waitForTimeout(1500);
await click(cc);
await page.waitForFunction(() => window.world.units.filter((u) => u.typeKey === 'worker').filter((u) => ((window.shell.game.unit(Number(u.key.slice(2)))?.flags ?? 0) & 4096) !== 0).length >= 4, null, { timeout: 60000 }).catch(() => undefined);
await page.waitForTimeout(3000);
const onWalls = await upTop('worker');
check('the four workers stand on the Citadel\'s walls', onWalls.length === 4, onWalls.join(','));
await page.evaluate((k) => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.key === k)), `b:${main}`);
await page.waitForTimeout(800);
const citadelPanel = await panel();
check('the Citadel panel lists them', /Up top: 4 of 8/.test(citadelPanel), citadelPanel);
await shot('citadel-manned');
// U on the Citadel lets them all down again.
await page.keyboard.press('KeyU');
await page.waitForFunction(() => window.world.units.filter((u) => u.typeKey === 'worker').every((u) => ((window.shell.game.unit(Number(u.key.slice(2)))?.flags ?? 0) & 4096) === 0), null, { timeout: 30000 }).catch(() => undefined);
check('U lets them down', (await upTop('worker')).length === 0);
await page.evaluate(() => window.shell.selection.set([]));

// ---- Night 0: a man up top with no bow says one of his lines. ----
await jump(tc.x, tc.z + 2);
await press('dbg-speed');
await press('dbg-speed');
const line = await page
  .waitForFunction(() => [...document.querySelectorAll('.bubbles > *')].map((e) => e.textContent).find((t) => /not much help up here|get down there to fight/.test(t ?? '')) ?? false, null, { timeout: 240000, polling: 200 })
  .then((h) => h.jsonValue())
  .catch(() => '');
check('a man up top says his line when monsters come', line !== '', line);
await press('dbg-speed');
await page.waitForTimeout(500);
await shot('night-remark');

for (const r of results) console.log(r);
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
