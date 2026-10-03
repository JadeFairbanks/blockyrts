// Browser look at wall chains and tunnel chains, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/chains-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, selects the four workers and clicks out a softwood wall
// chain with the mouse south of the camp (east, south, south-west, west and
// north back to the anchor), right-clicks to end it and runs at x16 until the
// ring stands; then builds the debug Hill, clicks Dig on its south face,
// then into the hill and out of its east side, right-clicks, and runs until
// the tunnel is dug. Saves chains-*.png and prints what it checked.
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
const shot = (name) => page.screenshot({ path: join(out, `chains-${name}.png`) });
const press = (id) => page.click(`[data-btn="${id}"]`);
const jump = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a, b), [x, z]);
const COLUMN = 0.45;
const UNIT = 0.1125;
const screen = (p) =>
  page.evaluate((q) => {
    const o = { x: 0, y: 0 };
    window.shell.cam.project(q, o);
    return o;
  }, p);
/** The middle of a column on the ground, as the land is drawn. */
const ground = (x, z) => page.evaluate(([a, b]) => ({ x: (a + 0.5) * 0.45, y: window.world.heightAt((a + 0.5) * 0.45, (b + 0.5) * 0.45) ?? 0, z: (b + 0.5) * 0.45 }), [x, z]);
const hover = async (p) => {
  const s = await screen(p);
  await page.mouse.move(s.x, s.y, { steps: 4 });
  await page.waitForTimeout(250);
  return s;
};
const click = async (p) => {
  const s = await hover(p);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);
};
const label = () => page.evaluate(() => document.querySelector('.chain-label')?.textContent ?? '');
const selectWorkers = () => page.evaluate(() => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === 'worker')));

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120000 });
await page.waitForTimeout(1000);

// ---- A wall chain: the ring of the chain-walls order script, by mouse. ----
await jump(4.5 * COLUMN, 24 * COLUMN);
await page.waitForTimeout(800);
await selectWorkers();
await page.evaluate(() => window.shell.commands.startPlacing(12, 0));
await click(await ground(0, 20));
check('the first click places the anchor wall and keeps the ghost', await page.evaluate(() => window.shell.commands.placing?.chain?.x === 0 && window.shell.commands.placing?.chain?.z === 20));
await hover(await ground(9, 21));
const east = await label();
check('the label beside the cursor gives the stretch and its cost', /^9 walls: 9 softwood lumber/.test(east), east);
await shot('walls-east');
await click(await ground(9, 21));
await click(await ground(9, 25));
await hover(await ground(6, 28));
const diag = await label();
check('a diagonal stretch is a staircase: 6 walls for 3 steps', /^6 walls/.test(diag), diag);
await shot('walls-diagonal');
await click(await ground(6, 28));
await click(await ground(0, 28));
await hover(await ground(0, 20));
await shot('walls-closing');
await click(await ground(0, 20));
const at = await hover(await ground(0, 23));
await page.mouse.click(at.x, at.y, { button: 'right' });
await page.waitForTimeout(300);
check('right click ends the chain and the placement', await page.evaluate(() => window.shell.commands.placing === null));
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction(() => [...window.shell.game.buildings.values()].filter((b) => b.kind === 12 && b.complete).length >= 34, null, { timeout: 240000 }).catch(() => undefined);
const walls = await page.evaluate(() => [...window.shell.game.buildings.values()].filter((b) => b.kind === 12 && b.complete).length);
check('the ring of 34 walls stands', walls === 34, String(walls));
await press('dbg-speed');
await page.waitForTimeout(500);
await shot('walls-ring');

// ---- A tunnel chain into the debug Hill, by mouse. ----
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
const hx = home.x + 14;
const hz = home.z - 14;
await jump(hx, hz);
await press('dbg-reveal');
await page.waitForTimeout(600);
const c = await page.evaluate(() => {
  const f = window.shell.cam.focus;
  return { x: Math.floor(f.x / 0.45), z: Math.floor(f.z / 0.45), y: Math.round((window.world.heightAt(f.x, f.z) ?? 0) / 0.1125) };
});
await press('dbg-hill');
await page.waitForFunction((q) => (window.world.heightAt((q.x + 0.5) * 0.45, (q.z + 0.5) * 0.45) ?? 0) > 3, c, { timeout: 60000 });
await page.waitForTimeout(500);
await selectWorkers();
await page.evaluate(() => window.shell.commands.startArea('dig', 0));
// On the hill's south face, 1 m above its ledge: the anchor, floored at the ledge.
await click({ x: (c.x + 0.5) * COLUMN, y: (c.y + 4) * UNIT + 1, z: (c.z + 6) * COLUMN - 0.001 });
const anchor = await page.evaluate(() => window.shell.commands.area?.chain);
check('a click on the face anchors the tunnel at the ground in front', anchor?.x === c.x && anchor?.z === c.z + 5 && anchor?.floor === c.y + 4, JSON.stringify(anchor));
// North into the hill, the cursor on its top.
await hover({ x: (c.x + 0.5) * COLUMN, y: (c.y + 30) * UNIT, z: (c.z - 1.5) * COLUMN });
const north = await label();
check('the label gives the tunnel stretch', /m of tunnel, 2\.25 m tall$/.test(north), north);
await shot('tunnel-north');
await click({ x: (c.x + 0.5) * COLUMN, y: (c.y + 30) * UNIT, z: (c.z - 1.5) * COLUMN });
// Then east, out of the hill's side.
await hover(await ground(c.x + 8, c.z - 2));
await shot('tunnel-east');
await click(await ground(c.x + 8, c.z - 2));
const sent = await page.evaluate(() => (window.shell.game.info?.sites ?? []).filter((s) => s.kind === 6).length);
const tp = await hover(await ground(c.x + 10, c.z + 2));
await page.mouse.click(tp.x, tp.y, { button: 'right' });
await page.waitForTimeout(300);
check('two stretches marked, then right click ends the tunnel', sent === 2 && (await page.evaluate(() => window.shell.commands.area === null)), String(sent));
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction(() => (document.querySelector('.message-list')?.textContent?.match(/tunnel is finished/g) ?? []).length >= 2, null, { timeout: 300000 }).catch(() => undefined);
const done = await page.evaluate(() => (document.querySelector('.message-list')?.textContent?.match(/tunnel is finished/g) ?? []).length);
check('both stretches dug', done >= 2, String(done));
await press('dbg-speed');
await jump((c.x + 9) * COLUMN, (c.z - 2) * COLUMN);
await page.waitForTimeout(800);
await shot('tunnel-dug');

for (const r of results) console.log(r);
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
