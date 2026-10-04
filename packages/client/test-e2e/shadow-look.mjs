// Browser look at the sun's shadows (Jade's shadow flicker report), run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/shadow-look.mjs http://localhost:5198 /tmp/shots [--gpu]
//
// Starts seed 1 with shadows on (the medium preset) and watches every frame
// the world is drawn: a mesh drawn without its shadow flags (an opaque one
// that casts none, or any one that takes none) is a frame where shadows
// blink out. It watches with the camera still and nobody working, with the
// workers felling trees round the Big House (each felled tree redraws land),
// across a growth redraw (every 20 s), and with the camera panning; then it
// checks the shadow box: that it moves in whole shadow-map texels as the
// camera pans (so shadow edges hold still) and covers the ground on screen
// at every zoom. Saves shadow-*.png. Headless Chromium draws with SwiftShader
// (software) unless --gpu is given.
/* global window, document, requestAnimationFrame -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const gpu = process.argv.includes('--gpu');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false, quality: 'medium', shadows: true })));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `shadow-${name}.png`) });
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 120_000 });
await page.waitForTimeout(3000);

const house = await page.evaluate(() => {
  const b = window.shell.items.find((i) => i.item.key.startsWith('b:') && i.item.owner === 0)?.item;
  return b ? { x: b.centre.x, z: b.centre.z } : null;
});
check('found the Big House', house !== null, JSON.stringify(house));
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x, house.z]);
await page.waitForTimeout(2000);

// Every frame of the world: the meshes drawn without their shadow flags, by what they are.
await page.evaluate(() => {
  const w = window.world;
  const probe = { frames: 0, gapFrames: 0, land: 0, buildings: 0, other: 0, worst: 0, installs: 0 };
  window.shadowProbe = probe;
  w.scene.onBeforeRender = (renderer, _scene, _camera, target) => {
    if (target !== null || !renderer.shadowMap.enabled) return;
    probe.frames++;
    let gaps = 0;
    w.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!(o.receiveShadow && (o.castShadow || m.transparent))) {
        gaps++;
        if (m === w.terrainMat) probe.land++;
        else if (m === w.buildings.material) probe.buildings++;
        else probe.other++;
      }
    });
    if (gaps > 0) probe.gapFrames++;
    probe.worst = Math.max(probe.worst, gaps);
  };
  const install = w.install.bind(w);
  w.install = (c, m) => {
    probe.installs++;
    install(c, m);
  };
});
const phase = async (name, ms, during) => {
  await page.evaluate(() => Object.assign(window.shadowProbe, { frames: 0, gapFrames: 0, land: 0, buildings: 0, other: 0, worst: 0, installs: 0 }));
  const until = Date.now() + ms;
  if (during) await during(until);
  else await page.waitForTimeout(ms);
  const p = await page.evaluate(() => ({ ...window.shadowProbe }));
  const line = `${p.frames} frames, ${p.gapFrames} with meshes lacking shadows (worst ${p.worst}; land ${p.land}, buildings ${p.buildings}, other ${p.other} mesh-frames), ${p.installs} land redraws`;
  console.log(`${name}: ${line}`);
  check(`${name}: every frame drew every mesh with its shadows`, p.frames > 0 && p.gapFrames === 0, line);
};

// 1. Camera still, nobody told to do anything, across a growth redraw.
await phase('still', 24_000);
await shot('still');

// 2. Workers fell the trees nearest the Big House: each felled tree redraws its land and its neighbours'.
const trees = await page.evaluate(([hx, hz]) =>
  [...window.world.hooks.selectables.candidates()]
    .filter((t) => t.key.startsWith('p:') && t.resource && t.halfSize.y > 1.5)
    .map((t) => ({ key: t.key, d: Math.hypot(t.centre.x - hx, t.centre.z - hz) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12)
    .map((t) => t.key),
[house.x, house.z]);
const workers = await page.evaluate(() => window.world.units.filter((u) => u.owner === 0 && u.typeKey === 'worker').map((u) => Number(u.key.slice(2))));
for (let k = 0; k < workers.length; k++) {
  const m = /^p:(-?\d+),(-?\d+):(\d+)$/.exec(trees[k % trees.length] ?? '');
  if (m) await order({ kind: 'gather', player: 0, units: [workers[k]], cx: Number(m[1]), cz: Number(m[2]), index: Number(m[3]), queued: false });
}
check('workers sent to fell trees', workers.length > 0 && trees.length > 0, `${workers.length} workers, ${trees.length} trees`);
await phase('felling', 40_000);
await shot('felling');

// 3. The camera pans round the camp.
await phase('panning', 15_000, async (until) => {
  let t = 0;
  while (Date.now() < until) {
    t += 0.25;
    await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x + Math.cos(t) * 18, house.z + Math.sin(t) * 18]);
    await page.waitForTimeout(120);
  }
});
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [house.x, house.z]);

// 4. The shadow box: whole texels as the camera pans, and the ground on screen inside it at every zoom.
const box = await page.evaluate(async () => {
  const w = window.world;
  const cam = window.shell.cam;
  const sun = w.sun;
  const sc = sun.shadow.camera;
  const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // The shadow camera's centre in light space, in texels: whole numbers when it is snapped.
  const offGrid = () => {
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const p = sun.position.clone();
    const dir = p.clone().sub(sun.target.position).normalize();
    const x = new (p.constructor)(0, 1, 0).cross(dir).normalize();
    const y = dir.clone().cross(x);
    const tx = p.dot(x) / texel;
    const ty = p.dot(y) / texel;
    return Math.max(Math.abs(tx - Math.round(tx)), Math.abs(ty - Math.round(ty)));
  };
  let worstOff = 0;
  const start = cam.view();
  for (let k = 0; k < 20; k++) {
    cam.panBy(0.37, 0.21);
    await frame();
    worstOff = Math.max(worstOff, offGrid());
  }
  // At each zoom: the screen's corners on the ground, in the shadow camera's view, inside its box.
  const outside = [];
  for (const distance of [12, 24, 36, 48, 64]) {
    cam.setView({ x: start.x, z: start.z, distance });
    await frame();
    await frame();
    sc.updateMatrixWorld();
    const inv = sc.matrixWorldInverse;
    for (const v of cam.footprint() ?? []) {
      const l = v.clone().applyMatrix4(inv);
      const over = Math.max(sc.left - l.x, l.x - sc.right, sc.bottom - l.y, l.y - sc.top);
      if (over > 0) outside.push(`${distance} m zoom: a corner ${over.toFixed(1)} m outside`);
    }
  }
  cam.setView(start);
  return { texelCm: texel * 100, worstOff, outside, half: [sc.left, sc.right, sc.bottom, sc.top].map((n) => Math.round(n * 10) / 10) };
});
console.log(`shadow box: ${JSON.stringify(box)}`);
check('the shadow box moves in whole texels', box.worstOff < 0.01, `${box.worstOff.toFixed(3)} texel off the grid at worst, ${box.texelCm.toFixed(1)} cm texels`);
check('the ground on screen is inside the shadow box at every zoom', box.outside.length === 0, box.outside.join('; ') || 'all corners inside');
await page.waitForTimeout(1500);
await shot('end');

await browser.close();
for (const line of results) console.log(line);
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'no console errors');
