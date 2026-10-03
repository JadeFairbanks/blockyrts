// Browser check for the M1 controls shell, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/hud-check.mjs http://localhost:5198 /tmp/shots
//
// Drives panning, zoom, the drag box (including onto the
// HUD), HUD buttons, the menu and orders, saves screenshots as hud-*.png in
// the output folder and prints what it checked. Pointer lock does not work
// headless, so this exercises the unlocked path.
/* global window, document, KeyboardEvent, MouseEvent -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const W = 1280;
const H = 720;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
// Pointer lock cannot be driven headless (synthetic events carry no real movement): check the unlocked path.
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});

const shot = (name) => page.screenshot({ path: join(out, `hud-${name}.png`) });
const text = (sel) => page.locator(sel).first().textContent();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const focus = () => page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z, d: window.shell.cam.distance }));
const screenOf = (key) =>
  page.evaluate((k) => {
    const s = window.shell.items.find((i) => i.item.key === k);
    return s ? { x: s.x, y: s.y } : null;
  }, key);
const itemKeys = () => page.evaluate(() => window.shell.items.map((i) => i.item.key));
const selected = () => page.evaluate(() => window.shell.selection.list().map((t) => t.key));
const centreOf = (sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);

// 1. The tester route: ?seed=N&players=K skips the main menu (milestone 9's menu has its own check, m9-online.mjs).
await page.goto(`${base}/?seed=1&players=3`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45);
check('URL keeps the seed', page.url().includes('seed=1&players=3'), page.url());
check('greeting message', (await text('.message-list')).includes('World seed 1.'));
await page.mouse.move(W / 2, H / 2);
await page.waitForTimeout(300);
await shot('game');
// The camera starts over the player's own units in their pocket; the checks below come back here.
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
const goHome = () => page.evaluate((h) => window.shell.cam.jumpTo(h.x, h.z), home);

// 2. Arrow keys pan.
let f0 = await focus();
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1000); // long enough for a few frames on a software renderer
await page.keyboard.up('ArrowRight');
let f1 = await focus();
check('ArrowRight pans east', f1.x > f0.x + 5, `${f0.x.toFixed(1)} -> ${f1.x.toFixed(1)}`);
await page.keyboard.down('ArrowLeft');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(300);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');
let f2 = await focus();
check('two arrows pan diagonally', f2.x < f1.x && f2.z < f1.z);
await goHome();

// 3. Edge panning: the right edge pans after 0.1 s, the bottom edge along the minimap does not.
f0 = await focus();
await page.mouse.move(W - 1, 200);
await page.waitForTimeout(60);
f1 = await focus();
check('edge pan waits 0.1 s', Math.abs(f1.x - f0.x) < 0.01);
await page.waitForTimeout(400);
f1 = await focus();
check('right edge pans', f1.x > f0.x + 3, `${f0.x.toFixed(1)} -> ${f1.x.toFixed(1)}`);
check('pan arrow cursor', (await page.getAttribute('#cursor', 'data-shape')) === 'pan');
await shot('edge-pan');
// Over the minimap the pan zone thins to the outermost 2 px (Camera: edge panning), so 3 px in never pans.
await page.mouse.move(150, H - 3);
await page.waitForTimeout(300);
f0 = await focus();
await page.waitForTimeout(300);
f1 = await focus();
check('no edge pan along the minimap', Math.abs(f1.z - f0.z) < 0.01 && Math.abs(f1.x - f0.x) < 0.01);
// The corner over the minimap: both sides there are thinned to the outermost 2 px.
await page.mouse.move(1, H - 1);
// A software renderer can draw as few as 2 frames a second: wait for the pan rather than a fixed time.
for (let k = 0; k < 30; k++) {
  await page.waitForTimeout(100);
  f2 = await focus();
  if (f2.x < f1.x && f2.z > f1.z) break;
}
check('corner pans diagonally', f2.x < f1.x && f2.z > f1.z);
await page.mouse.move(W / 2, H / 2);
await goHome();

// 4. Wheel zoom towards the cursor, limits, Home.
f0 = await focus();
await page.mouse.move(W / 2 + 300, H / 2 - 100);
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(700);
f1 = await focus();
check('wheel zooms in', f1.d < f0.d - 5, `${f0.d.toFixed(1)} -> ${f1.d.toFixed(1)}`);
check('zoom moves towards the cursor', f1.x > f0.x + 1 && f1.z < f0.z, `focus ${f1.x.toFixed(1)}, ${f1.z.toFixed(1)}`);
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(800);
check('closest zoom limit', Math.abs((await focus()).d - 12) < 0.05, String((await focus()).d));
for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
await page.waitForTimeout(900);
check('farthest zoom limit', Math.abs((await focus()).d - 80) < 0.05, String((await focus()).d));
await shot('zoomed-out');
await page.keyboard.press('Home');
for (let k = 0; k < 30 && Math.abs((await focus()).d - 40) >= 0.05; k++) await page.waitForTimeout(100);
check('Home resets zoom', Math.abs((await focus()).d - 40) < 0.05, String((await focus()).d));
await page.keyboard.press('PageUp');
await page.waitForTimeout(500);
check('Page Up zooms in', (await focus()).d < 39);
await page.keyboard.press('Home');
await goHome();
await page.waitForTimeout(700);

// 5. Middle drag grabs the ground.
f0 = await focus();
await page.mouse.move(700, 400);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(600, 400, { steps: 5 });
await page.mouse.up({ button: 'middle' });
f1 = await focus();
check('middle drag moves the camera with the ground', f1.x > f0.x + 2, `${f0.x.toFixed(1)} -> ${f1.x.toFixed(1)}`);
await goHome();
await page.waitForTimeout(200);

// 6. Click select, empty ground keeps it, drag box.
const own = (await itemKeys()).filter((k) => k.startsWith('e:'));
check('own units on screen', own.length >= 3, own.join(' '));
// The units mill about and stand close: aim at the one with the most room round it, again if the click caught a neighbour.
const loner = (among) =>
  page.evaluate((keys) => {
    const at = window.shell.items.map((i) => ({ k: i.item.key, x: i.x, y: i.y }));
    const room = (k) => {
      const me = at.find((a) => a.k === k);
      return Math.min(...at.filter((a) => a.k !== k).map((a) => Math.hypot(a.x - me.x, a.y - me.y)));
    };
    // First the ones a click 8 px above their middle picks (not a building behind them), then by room.
    const picks = (k) => {
      const me = at.find((a) => a.k === k);
      return window.shell.under({ x: me.x, y: me.y - 8 }).item?.key === k ? 1 : 0;
    };
    return [...keys].sort((p, q) => picks(q) - picks(p) || room(q) - room(p))[0];
  }, among);
own.unshift(...own.splice(own.indexOf(await loner(own)), 1));
for (let k = 0; k < 3; k++) {
  const u0 = await screenOf(own[0]);
  await page.mouse.click(u0.x, u0.y - 8);
  if (JSON.stringify(await selected()) === JSON.stringify([own[0]])) break;
  await page.waitForTimeout(350);
}
check('click selects one unit', JSON.stringify(await selected()) === JSON.stringify([own[0]]), (await selected()).join(' '));
await page.mouse.click(40, 200);
check('click on empty ground keeps the selection', (await selected()).length === 1);
await page.mouse.move(W / 2 - 330, H / 2 - 230);
await page.mouse.down();
await page.mouse.move(W / 2 + 330, H / 2 + 160, { steps: 8 });
await page.waitForTimeout(100);
await shot('drag-box');
// Arrow keys still pan during a drag, and the start corner stays on its world point.
const boxBefore = await page.evaluate(() => document.querySelector('.drag-box').getBoundingClientRect().toJSON());
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(250);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(50);
const boxAfter = await page.evaluate(() => document.querySelector('.drag-box').getBoundingClientRect().toJSON());
check('arrows pan during a drag, start corner pinned', boxAfter.left < boxBefore.left - 20, `${boxBefore.left} -> ${boxAfter.left}`);
await page.mouse.up();
const sel = await selected();
// Patch notes 1: a box takes units and buildings together (the Big House here); wall pieces and lights stay out.
check('box selects own units and buildings', sel.filter((k) => k.startsWith('e:')).length >= 3 && sel.every((k) => k.startsWith('e:') || k.startsWith('b:')), sel.join(' '));
check('selection panel shows the count', (await text('.sel-title')).includes('selected'), await text('.sel-title'));
await shot('selected');

// 7. Drag onto the HUD: the box stops at the selection panel and releasing there presses nothing.
await page.keyboard.press('F3');
check('F3 clears', (await selected()).length === 0);
const stop = await centreOf('.command-card');
await page.mouse.move(W / 2 - 100, H / 2 - 50);
await page.mouse.down();
await page.mouse.move(W / 2 + 20, H - 40, { steps: 8 });
await page.waitForTimeout(100);
const box = await page.evaluate(() => document.querySelector('.drag-box').getBoundingClientRect().toJSON());
const selTop = await page.evaluate(() => document.querySelector('.selection-panel').getBoundingClientRect().top);
check('box clamped to the HUD border', Math.abs(box.bottom - selTop) < 1.5, `box bottom ${box.bottom}, panel top ${selTop}`);
await shot('drag-onto-hud');
await page.mouse.move(stop.x, stop.y, { steps: 4 });
await page.mouse.up();
check('release over the HUD completes the selection', (await selected()).length >= 1);
check('release over the HUD presses nothing', !(await text('.message-list')).includes('Stop is not'));

// 8. A box can not start on the HUD.
const before = await selected();
const mm = await centreOf('.minimap');
await page.mouse.move(mm.x + 100, mm.y - 10);
await page.mouse.down();
await page.mouse.move(W / 2, H / 2, { steps: 6 });
check('no box from the HUD', await page.locator('.drag-box').isHidden());
await page.mouse.up();
check('selection unchanged', JSON.stringify(await selected()) === JSON.stringify(before));
await goHome();

// 9. Double click and Ctrl + click on resource nodes; Shift toggles.
// The commonest kind of node near the pocket (pines, spruces, hazel...), once the land there is drawn.
await page.waitForFunction(() => [...window.shell.world.selectables.candidates()].some((t) => t.kind === 'node'), null, { timeout: 20000 });
const nodeType = await page.evaluate(() => {
  const counts = new Map();
  for (const t of window.shell.world.selectables.candidates()) if (t.kind === 'node') counts.set(t.typeKey, (counts.get(t.typeKey) ?? 0) + 1);
  const type = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const first = [...window.shell.world.selectables.candidates()].find((t) => t.typeKey === type);
  window.shell.cam.jumpTo(first.centre.x, first.centre.z);
  return type;
});
await page.mouse.move(W / 2, H / 2);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
await page.waitForTimeout(900);
const pines = await page.evaluate((type) => window.shell.items.filter((i) => i.item.typeKey === type).map((i) => i.item.key), nodeType);
check(`${nodeType} nodes on screen`, pines.length > 1, pines.join(' '));
if (pines.length > 1) {
  const p = await screenOf(pines[0]);
  await page.mouse.click(p.x, p.y);
  const one = await selected();
  // Trees stand close together: the one nearest the camera under the click wins.
  check('click a node inspects it', one.length === 1 && one[0].startsWith('p:'), one.join(' '));
  await page.waitForTimeout(350);
  await page.mouse.dblclick(p.x, p.y);
  const s = await selected();
  check(`double click selects every ${nodeType} in view`, s.length === pines.length && s.every((k) => k.startsWith('p:')), s.join(' '));
  await shot('nodes');
}
await page.keyboard.press('Escape');
check('Esc clears the selection', (await selected()).length === 0);
await page.keyboard.press('Home');
await goHome();
await page.waitForTimeout(700);
const own2 = await page.evaluate(() => window.shell.items.filter((i) => i.item.typeKey === 'worker').map((i) => i.item.key));
// A worker standing in front of the Big House would be clicked through to it: aim at the one with the most room.
const a = await screenOf(await loner(own2));
// (page.mouse ignores the modifiers option: hold the keys instead.)
await page.keyboard.down('Control');
await page.mouse.click(a.x, a.y - 8);
await page.keyboard.up('Control');
const ctrlSel = await selected();
// Workers walking in or out at the screen's edge change the count between frames: count again as of the click.
const inView = await page.evaluate(() => window.shell.items.filter((i) => i.item.typeKey === 'worker').length);
check('Ctrl + click selects every own worker in view', ctrlSel.length >= 2 && (ctrlSel.length === own2.length || ctrlSel.length === inView), `${ctrlSel.join(' ')} of ${own2.join(' ')} (${inView} now)`);
await page.waitForTimeout(350); // not a double click
await page.keyboard.down('Shift');
await page.mouse.click(a.x, a.y - 8);
await page.keyboard.up('Shift');
check('Shift + click removes one', (await selected()).length === ctrlSel.length - 1);

// 10. Orders: right click moves; Move (M) targets, Esc cancels, the minimap confirms.
const orders = [];
await page.exposeFunction('noteOrder', (o) => orders.push(o));
await page.evaluate(() => {
  const opts = window.shell.opts;
  const orig = opts.issueOrder;
  opts.issueOrder = (o, q) => {
    window.noteOrder(o);
    orig(o, q);
  };
});
await page.mouse.click(W / 2 + 200, H / 2 + 50, { button: 'right' });
await page.waitForTimeout(50);
check('right click gives a move order', orders.at(-1)?.kind === 'move', JSON.stringify(orders.at(-1)));
await page.keyboard.press('m');
check('M enters targeting', (await page.getAttribute('#cursor', 'data-shape')) === 'target');
check('Cancel is in the bottom right slot', await page.locator('.slot:nth-child(15) .hud-btn').isVisible());
await shot('targeting');
await page.keyboard.press('Escape');
check('Esc cancels targeting first', (await selected()).length > 0 && (await page.getAttribute('#cursor', 'data-shape')) !== 'target');
const moveBtn = await centreOf('[data-btn=card4]');
await page.mouse.click(moveBtn.x, moveBtn.y);
check('the Move button enters targeting', (await page.getAttribute('#cursor', 'data-shape')) === 'arrow' && (await page.getAttribute('[data-btn=card4]', 'class')).includes('lit'));
const n = orders.length;
await page.mouse.click(mm.x + 30, mm.y + 20);
check('minimap click confirms the move', orders.length === n + 1 && orders.at(-1).kind === 'move', JSON.stringify(orders.slice(n)));
await page.keyboard.press('s');
check('S gives a stop order', orders.at(-1)?.kind === 'stop');

// 11. Minimap jump and drag.
await page.mouse.click(mm.x - 60, mm.y - 40);
f0 = await focus();
check('minimap click jumps', f0.x < -20 && f0.z < -15, `${f0.x.toFixed(1)}, ${f0.z.toFixed(1)}`);
await page.mouse.move(mm.x - 60, mm.y - 40);
await page.mouse.down();
await page.mouse.move(mm.x + 40, mm.y + 30, { steps: 5 });
await page.mouse.up();
f1 = await focus();
check('minimap drag slides', f1.x > f0.x + 20 && f1.z > f0.z + 15);
await shot('minimap');

// 12. HUD buttons: tooltips, camera locations, follow, queue mode, resources.
await goHome();
const cam1 = await centreOf('[data-btn=cam0]');
await page.mouse.click(cam1.x, cam1.y, { button: 'right' });
check('right click saves a camera location', (await page.getAttribute('[data-btn=cam0]', 'class')).includes('saved'));
await page.evaluate(() => window.shell.cam.jumpTo(40, 40));
await page.keyboard.press('F5');
f0 = await focus();
check('F5 jumps to the saved view', Math.abs(f0.x - home.x) < 0.01 && Math.abs(f0.z - home.z) < 0.01);
await page.evaluate(() => window.shell.cam.jumpTo(10, 10));
await page.keyboard.down('Backquote');
await page.keyboard.press('F6');
await page.keyboard.up('Backquote');
check('group key + F6 saves', (await page.getAttribute('[data-btn=cam1]', 'class')).includes('saved'));
const q = await centreOf('[data-btn=queue]');
await page.mouse.click(q.x, q.y);
check('Queue Mode lights up', (await page.getAttribute('[data-btn=queue]', 'class')).includes('lit'));
await page.mouse.click(a.x, a.y - 8);
await page.keyboard.press('F3');
check('Queue Mode turns off when the selection changes', !(await page.getAttribute('[data-btn=queue]', 'class')).includes('lit'));
// The units walked off during the order checks: look at them again.
await page.evaluate(() => {
  const u = [...window.shell.world.selectables.candidates()].find((t) => t.key.startsWith('e:') && t.owner === 0);
  window.shell.cam.jumpTo(u.centre.x, u.centre.z);
});
await page.waitForTimeout(400);
const own3 = (await itemKeys()).filter((k) => k.startsWith('e:'));
if (own3[0]) {
  const u = await screenOf(own3[0]);
  await page.mouse.click(u.x, u.y - 8);
}
await page.keyboard.press('l');
check('L follows', (await page.getAttribute('[data-btn=follow]', 'class')).includes('lit'), `own on screen: ${own3.length}, selected: ${(await selected()).join(' ')}`);
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(100);
await page.keyboard.up('ArrowDown');
check('panning ends follow', !(await page.getAttribute('[data-btn=follow]', 'class')).includes('lit'));
const idle = await centreOf('[data-btn=idle]');
await page.mouse.move(idle.x, idle.y);
await page.waitForTimeout(100);
check('a button shows its tooltip', (await text('#tooltip')).includes('Idle Gatherer'), await text('#tooltip'));
await shot('tooltip');
// The stockpile's inventory grid: 16 slots, the goods held so far with their pictures, a tooltip on each.
check('inventory has 16 slots', (await page.locator('.inv-cell').count()) === 16);
const held = await page.locator('.inv-slot:not([hidden])').count();
check('inventory shows the starting goods', held > 0, `${held} slots filled`);
const slot = await centreOf('.inv-slot:not([hidden])');
await page.mouse.move(slot.x, slot.y);
await page.waitForTimeout(100);
check('a slot names its good', (await text('#tooltip')).includes('in the pool'), await text('#tooltip'));
check('nothing to scroll yet', (await page.getAttribute('[data-btn=inv-down]', 'class')).includes('disabled'));
await shot('resources');

// 13. Space centres the camera on the selection (patch notes 1).
await page.evaluate(() => {
  const u = [...window.shell.world.selectables.candidates()].find((t) => t.key.startsWith('e:') && t.owner === 0);
  window.shell.selection.set([u]);
  window.shell.cam.jumpTo(u.centre.x + 60, u.centre.z + 45);
});
await page.waitForTimeout(200);
await page.keyboard.press('Space');
await page.waitForTimeout(100);
const centred = await page.evaluate(() => {
  const u = window.shell.selection.list()[0];
  return { dx: window.shell.cam.focus.x - u.centre.x, dz: window.shell.cam.focus.z - u.centre.z };
});
check('Space centres the camera on the selection', Math.hypot(centred.dx, centred.dz) < 3, `${centred.dx.toFixed(1)}, ${centred.dz.toFixed(1)} m off`);
await page.keyboard.press('F3');
await goHome();

// 14. Menu. Alone it is the pause: no Pause or Resume button, the game waits while it is open (patch notes 1).
const simStep = () => page.evaluate(() => Number(window.shell.layout.debugFields.step.textContent));
await page.keyboard.press('F10');
check('F10 opens the menu', await page.locator('.menu').isVisible());
check('real cursor in the menu', !(await page.evaluate(() => document.body.classList.contains('playing'))));
const menuButtons = await page.locator('.menu > button, .menu-head button').allTextContents();
check('no Pause or Resume button alone', !menuButtons.some((t) => /pause|resume|carry on/i.test(t)), menuButtons.join(' | '));
check('the menu says it holds the game', (await text('.menu')).includes('paused while this menu is open'));
await page.waitForTimeout(300);
const held1 = await simStep();
await page.waitForTimeout(1200);
const held2 = await simStep();
check('the game waits while the menu is open', held1 === held2, `${held1} -> ${held2}`);
await shot('menu');
await page.keyboard.press('Escape');
check('Esc closes the menu', await page.locator('.menu-overlay').isHidden());
await page.waitForTimeout(1200);
check('closing it carries on', (await simStep()) > held2);
const menuBtn = await centreOf('[data-btn=menu]');
await page.mouse.click(menuBtn.x, menuBtn.y);
check('Menu button opens the menu', await page.locator('.menu').isVisible());
await page.click('.menu button.menu-close');
check('the ✕ closes it', await page.locator('.menu-overlay').isHidden());
const pauseBtn = await centreOf('[data-btn=pause]');
await page.mouse.click(pauseBtn.x, pauseBtn.y);
check('❚❚ opens the menu alone', await page.locator('.menu').isVisible());
await page.keyboard.press('F10');
check('F10 closes it again', await page.locator('.menu-overlay').isHidden());

// 15. Key blocking and the context menu.
const blocked = await page.evaluate(() => {
  const ev = new KeyboardEvent('keydown', { key: 'F5', code: 'F5', cancelable: true, bubbles: true });
  window.dispatchEvent(ev);
  const f11 = new KeyboardEvent('keydown', { key: 'F11', code: 'F11', cancelable: true, bubbles: true });
  window.dispatchEvent(f11);
  const ctx = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
  document.querySelector('#view').dispatchEvent(ctx);
  return { f5: ev.defaultPrevented, f11: f11.defaultPrevented, ctx: ctx.defaultPrevented };
});
check('F5 blocked, F11 not, no context menu', blocked.f5 && !blocked.f11 && blocked.ctx, JSON.stringify(blocked));

await page.mouse.move(W / 2, H / 2);
await page.waitForTimeout(200);
await shot('final');
console.log(results.join('\n'));
console.log(problems.length ? `console problems:\n${problems.join('\n')}` : 'no console errors');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
