// Browser look at wall chains and tunnel chains, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/chains-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, selects the four workers and clicks out a softwood wall
// chain with the mouse south of the camp (east, south, south-west, west and
// north back to the anchor), right-clicks to end it, double-clicks a lone
// wall, and runs at x4 until they stand; then builds the debug Hill, clicks
// Dig on its south face, then into the hill and out of its east side, clicks
// the last point to finish, and runs at x16 until the first stretch is dug.
// Saves chains-*.png and prints what it checked.
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
  await hover(p);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);
};
const label = () => page.evaluate(() => [...(document.querySelector('.chain-label')?.children ?? [])].map((e) => e.textContent).join(' / '));
const selectWorkers = () => page.evaluate(() => window.shell.selection.set(window.world.units.filter((u) => u.typeKey === 'worker')));

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120000 });
await page.waitForTimeout(1000);

// ---- A wall chain: the ring of the chain-walls order script, by mouse. ----
await jump(4.5 * COLUMN, 24 * COLUMN);
await page.waitForTimeout(800);
await selectWorkers();
await page.evaluate(() => window.shell.commands.startPlacing(12, 0));
const before = await (async () => {
  await hover(await ground(0, 20));
  return label();
})();
check('before the first click the label says a click places one', /^1 softwood wall: 1 softwood lumber \/ Click to place it/.test(before), before);
await click(await ground(0, 20));
check('the first click places the anchor wall and keeps the ghost', await page.evaluate(() => window.shell.commands.placing?.chain?.x === 0 && window.shell.commands.placing?.chain?.z === 20));
const one = await label();
check('on the wall just placed the label says how to keep just this one', one.startsWith('Click again for just this one'), one);
await shot('walls-first');
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
// One wall on its own: a double click.
await page.evaluate(() => window.shell.commands.startPlacing(12, 0));
const lone = await screen(await ground(-2, 31));
await page.mouse.move(lone.x, lone.y, { steps: 4 });
await page.waitForTimeout(250);
await page.mouse.dblclick(lone.x, lone.y);
await page.waitForTimeout(300);
check('a double click places one wall and ends the placement', await page.evaluate(() => window.shell.commands.placing === null && window.shell.game.queues.get(1)?.some((o) => o.t === 'build' && o.x === -2 && o.z === 31)));
// At x4 the walls stand well before dusk.
await press('dbg-speed');
await page.waitForFunction(() => [...window.shell.game.buildings.values()].filter((b) => b.kind === 12 && b.complete).length >= 35, null, { timeout: 120000 }).catch(() => undefined);
const walls = await page.evaluate(() => [...window.shell.game.buildings.values()].filter((b) => b.kind === 12 && b.complete).length);
check('the ring of 34 walls and the lone wall stand', walls === 35, String(walls));
await press('dbg-speed');
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
const into = { x: (c.x + 0.5) * COLUMN, y: (c.y + 30) * UNIT, z: (c.z + 2.5) * COLUMN };
await hover(into);
const north = await label();
check('the label gives the tunnel stretch', /m of tunnel, 2\.25 m tall$/.test(north), north);
await shot('tunnel-north');
await click(into);
// Then east, out of the hill's side.
await hover(await ground(c.x + 7, c.z + 2));
await shot('tunnel-east');
await click(await ground(c.x + 7, c.z + 2));
await page.waitForTimeout(300);
const sent = await page.evaluate(() => (window.shell.game.info?.sites ?? []).filter((s) => s.kind === 6).length);
const last = await label();
check('on the tunnel\'s last point the label says a click finishes it', last.startsWith('Click here again to finish the tunnel'), last);
await click(await ground(c.x + 7, c.z + 2));
check('two stretches marked, then a click on the last point ends the tunnel', sent === 2 && (await page.evaluate(() => window.shell.commands.area === null)), String(sent));
// The first stretch is dug before night 0 at x16 (the order scripts and sim tests dig whole chains and walk them).
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction(() => /tunnel is finished/.test(document.querySelector('.message-list')?.textContent ?? ''), null, { timeout: 120000 }).catch(() => undefined);
await press('dbg-speed');
const done = await page.evaluate(() => (document.querySelector('.message-list')?.textContent?.match(/tunnel is finished/g) ?? []).length);
check('the first stretch dug', done >= 1, String(done));
await jump(c.x * COLUMN, (c.z + 9) * COLUMN);
await page.waitForTimeout(800);
await shot('tunnel-dug');

for (const r of results) console.log(r);
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
