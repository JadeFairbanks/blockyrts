// Browser check for touch controls (patch notes 1), run by hand (not part of
// `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/touch-check.mjs http://localhost:5198 /tmp/shots
//
// With a phone (844 x 390) and a tablet (1024 x 768) page and a touchscreen:
// the first-load question and its Yes, then a tap selecting a worker, a tap on
// the ground moving it, a one-finger drag panning, a pinch zooming, a hold on
// a button showing its tooltip and the Box button drawing a selection box.
// Screenshots go to the output folder as touch-*.png.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const SETTINGS = 'survive-and-conquer.settings.v1';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  console.log(results.at(-1));
};
const problems = [];
const touchContext = (W, H) => browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const watch = (page) => {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
};

for (const [W, H] of [
  [844, 390],
  [1024, 768],
]) {
  const size = `${W}x${H}`;

  // 1. First load on a touchscreen: the question, once.
  {
    const ctx = await touchContext(W, H);
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${base}/?seed=1`);
    await page.waitForSelector('.dialog.touch-ask', { timeout: 30000 });
    await page.screenshot({ path: join(out, `touch-ask-${size}.png`) });
    check(`${size} question shows on first load`, true);
    await page.getByText('Yes, touch controls').tap();
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SETTINGS);
    check(`${size} Yes turns on touch controls`, saved.touch === true && saved.touchAsked === true);
    await ctx.close();
  }

  // 2. Playing by touch.
  const ctx = await touchContext(W, H);
  const page = await ctx.newPage();
  watch(page);
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ touch: true, touchAsked: true, cursorLock: true })), SETTINGS);
  await page.goto(`${base}/?seed=1`);
  await page.waitForFunction(() => window.shell && window.shell.game.step > 45, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const tap = async (x, y) => {
    await touch('touchStart', [[x, y]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(450);
  };
  const hold = async (x, y, ms = 700) => {
    await touch('touchStart', [[x, y]]);
    await page.waitForTimeout(ms);
    await touch('touchEnd', []);
    await page.waitForTimeout(200);
  };
  const drag = async (x0, y0, x1, y1, steps = 8) => {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
  };
  const worker = () =>
    page.evaluate(() => {
      const s = window.shell;
      const t = s.items.map((i) => i.item).find((x) => x.typeKey === 'worker');
      const p = { x: 0, y: 0 };
      s.cam.project(t.centre, p);
      return { key: t.key, x: p.x, y: p.y };
    });
  const state = () =>
    page.evaluate(() => {
      const s = window.shell;
      const tip = document.getElementById('tooltip');
      return {
        sel: s.selection.list().map((t) => t.key),
        focus: [s.cam.focus.x, s.cam.focus.z],
        dist: s.cam.camera.position.distanceTo(s.cam.focus),
        body: document.body.className,
        locked: document.pointerLockElement !== null,
        tip: tip.hidden ? '' : tip.textContent,
      };
    });

  let st = await state();
  check(`${size} touch mode, no cursor lock`, st.body.includes('touch') && !st.locked, st.body);
  const w = await worker();
  await tap(w.x, w.y);
  st = await state();
  check(`${size} tap selects a worker`, st.sel.length === 1 && st.sel[0].startsWith('e:'), st.sel.join(' '));
  const picked = st.sel[0];
  await page.screenshot({ path: join(out, `touch-select-${size}.png`) });
  // A tap on empty ground with the worker selected gives the right-click order: move there.
  await tap(w.x + 90, w.y - 40);
  const order = await page.evaluate((key) => window.shell.game.queues.get(Number(key.slice(2)))?.[0]?.t ?? 'none', picked);
  st = await state();
  check(`${size} tap on the ground moves the worker`, order === 'move' && st.sel.length === 1, `order ${order}`);
  // One finger drag pans and keeps the selection.
  const f0 = st.focus;
  await drag(W / 2, H / 3, W / 2 - 120, H / 3 + 30);
  st = await state();
  const moved = Math.hypot(st.focus[0] - f0[0], st.focus[1] - f0[1]);
  check(`${size} one-finger drag pans`, moved > 0.5, `moved ${moved.toFixed(2)} m`);
  check(`${size} the drag keeps the selection`, st.sel.length === 1);
  // Pinch out: closer.
  const d0 = st.dist;
  await touch('touchStart', [
    [W / 2 - 30, H / 3],
    [W / 2 + 30, H / 3],
  ]);
  for (let i = 1; i <= 8; i++)
    await touch('touchMove', [
      [W / 2 - 30 - i * 12, H / 3],
      [W / 2 + 30 + i * 12, H / 3],
    ]);
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  st = await state();
  check(`${size} pinch out zooms in`, st.dist < d0 - 0.2, `${d0.toFixed(1)} -> ${st.dist.toFixed(1)}`);
  // Hold on a command card button: its tooltip.
  const btn = await page.locator('.command-card .hud-btn.cmd:not([hidden])').first().boundingBox();
  await hold(btn.x + btn.width / 2, btn.y + btn.height / 2);
  st = await state();
  check(`${size} hold on a button shows its tooltip`, st.tip.length > 0, st.tip.slice(0, 60));
  await page.screenshot({ path: join(out, `touch-hold-${size}.png`) });
  // Box: light it, then drag round the start pocket.
  await tap(W / 2, 40);
  let b = await page.locator('[data-btn="fold-box"]').boundingBox();
  if (!b || b.width === 0) b = await page.locator('[data-btn="box"]').boundingBox();
  if (b) {
    await tap(b.x + b.width / 2, b.y + b.height / 2);
    const lit = await page.evaluate(() => ['fold-box', 'box'].some((k) => document.querySelector(`[data-btn="${k}"]`)?.classList.contains('lit')));
    check(`${size} Box lights up`, lit);
    await page.evaluate((f) => window.shell.cam.jumpTo(f[0], f[1]), f0);
    await page.waitForTimeout(500);
    await drag(W * 0.4, H * 0.37, W * 0.95, H * 0.55, 10);
    st = await state();
    check(`${size} a drag with Box selects several`, st.sel.length > 1, `${st.sel.length} selected`);
    await page.screenshot({ path: join(out, `touch-box-${size}.png`) });
  } else check(`${size} Box button shown`, false);
  await ctx.close();
}

// 3. A desktop page with a touch panel still gets mouse controls until Yes.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  watch(page);
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ cursorLock: false })), SETTINGS);
  await page.goto(`${base}/?seed=1`);
  await page.waitForFunction(() => window.shell && window.shell.game.step > 10, null, { timeout: 120000 });
  const body = await page.evaluate(() => document.body.className);
  check('desktop has no question and no touch mode', !body.includes('touch') && (await page.locator('.dialog.touch-ask').count()) === 0, body);
  await ctx.close();
}

await browser.close();
if (problems.length) console.log(`\nbrowser problems:\n${problems.join('\n')}`);
console.log(`\n${results.filter((r) => r.startsWith('ok')).length} of ${results.length} checks passed`);
