// Where a frame's time goes in a busy mid-game scene, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/frame-profile.mjs http://localhost:5198 <out dir> [label] [--gpu] [--profile] [--no-draw]
//
// Seed 1 alone at 1920 by 1080: the main base made a Citadel, a Barn and the
// siege kit beside it, and godmode sets down a few dozen of the player's own
// units round the base (workers, every troop type, mages), then godmode goes
// off and the debugger closes. It reads the day scene, runs the clock to
// nightfall reading every frame through dusk (the nightfall hitch), sets 80
// night mobs on a ring round the town and reads the night scene while they
// fight. For each scene it prints the time between frames, the main thread's
// time a frame (all of it: script, style, layout and the browser's own work,
// from the DevTools protocol's metrics), the WebGL calls a frame (draws,
// buffer and texture uploads in kB, program switches, shader compiles), the
// draw calls and triangles from the debug readout, and with --profile the
// functions that took the most main-thread time and allocated the most.
// Headless Chromium draws with SwiftShader (software) unless --gpu is given,
// so the frames a second say little about a real graphics card, and the
// software drawing holds up the main thread too; --no-draw counts the draws
// without making them, so the main thread's own time a frame stands alone.
/* global window, document, requestAnimationFrame, WebGL2RenderingContext -- used inside page callbacks */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const label = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : 'run';
const gpu = process.argv.includes('--gpu');
const profile = process.argv.includes('--profile');
const noDraw = process.argv.includes('--no-draw');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript((noDraw) => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false, hints: false, touchAsked: true }));
  // WebGL calls counted per frame: draws, bytes uploaded to buffers and textures, program switches and compiles.
  const gl = { draws: 0, instances: 0, bufferKb: 0, textureKb: 0, programs: 0, compiles: 0, uniforms: 0, calls: 0 };
  window.glCount = gl;
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, f, skip = false) => {
    const orig = P[name];
    P[name] = function (...a) {
      gl.calls++;
      f(a);
      return skip ? undefined : orig.apply(this, a);
    };
  };
  // Bytes a texture upload carries: width by height by the texel's size (the source array may be bigger than the part sent).
  const texel = (format, type) => {
    const n = { 0x1903: 1, 0x8227: 2, 0x1907: 3, 0x1908: 4, 0x8d94: 1, 0x8228: 2, 0x8d98: 3, 0x8d99: 4 }[format] ?? 4;
    const b = { 0x1401: 1, 0x1406: 4, 0x140b: 2, 0x8d61: 2, 0x1405: 4, 0x1404: 4 }[type] ?? 1;
    return n * b;
  };
  const sized = (w, h, d, format, type, src) => (typeof w === 'number' && typeof h === 'number' ? w * h * d * texel(format, type) : (src?.width ?? 0) * (src?.height ?? 0) * 4);
  // With --no-draw the draws are counted but not made: the software renderer then does no drawing, and the main thread's own time stands alone.
  wrap('drawElements', () => gl.draws++, noDraw);
  wrap('drawArrays', () => gl.draws++, noDraw);
  wrap('drawElementsInstanced', (a) => {
    gl.draws++;
    gl.instances += a[4];
  }, noDraw);
  wrap('drawArraysInstanced', (a) => {
    gl.draws++;
    gl.instances += a[3];
  }, noDraw);
  const bufBytes = (v) => (v && typeof v.byteLength === 'number' ? v.byteLength : typeof v === 'number' ? v : 0);
  wrap('bufferData', (a) => (gl.bufferKb += bufBytes(a[1]) / 1024));
  wrap('bufferSubData', (a) => (gl.bufferKb += (a[4] ? a[4] * (a[2]?.BYTES_PER_ELEMENT ?? 1) : bufBytes(a[2]) - (a[3] ?? 0) * (a[2]?.BYTES_PER_ELEMENT ?? 1)) / 1024));
  // texImage2D(target, level, internal, w, h, border, format, type, src) or (target, level, internal, format, type, source).
  wrap('texImage2D', (a) => (gl.textureKb += (a.length >= 9 ? sized(a[3], a[4], 1, a[6], a[7]) : sized(null, null, 1, 0, 0, a[5])) / 1024));
  // texSubImage2D(target, level, x, y, w, h, format, type, src) or (target, level, x, y, format, type, source).
  wrap('texSubImage2D', (a) => (gl.textureKb += (a.length >= 9 ? sized(a[4], a[5], 1, a[6], a[7]) : sized(null, null, 1, 0, 0, a[6])) / 1024));
  wrap('texImage3D', (a) => (gl.textureKb += sized(a[3], a[4], a[5], a[7], a[8]) / 1024));
  wrap('texSubImage3D', (a) => (gl.textureKb += sized(a[5], a[6], a[7], a[8], a[9]) / 1024));
  wrap('useProgram', () => gl.programs++);
  wrap('compileShader', () => gl.compiles++);
  for (const n of Object.getOwnPropertyNames(P)) if (/^uniform/.test(n)) wrap(n, () => gl.uniforms++);
}, noDraw);

const press = (id) => page.evaluate((k) => window.shell.buttons.get(k).def.onPress({ shift: false, ctrl: false }), id);
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);
const step = () => page.evaluate(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent));
const readout = () =>
  page.evaluate(() => {
    const r = {};
    for (const row of document.querySelectorAll('.debug .dbg-row')) r[row.querySelector('.dbg-label').textContent] = row.querySelector('.dbg-value').textContent;
    return r;
  });
const WU = 8000;

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 180_000 });
await page.waitForTimeout(2000);
const home = await page.evaluate(() => ({ x: window.shell.cam.focus.x, z: window.shell.cam.focus.z }));
// Godmode needs the debugger open (it ends when the debugger closes).
await page.evaluate(() => window.shell.toggleTesterTools());
await press('dbg-citadel');
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [home.x + 12, home.z + 4]);
await page.waitForTimeout(600);
await press('dbg-siege');
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [home.x - 12, home.z + 4]);
await page.waitForTimeout(600);
await press('dbg-barn');
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [home.x, home.z]);
await press('dbg-god');
await page.waitForFunction(() => window.shell.game?.info?.god === true || window.world !== undefined, null, { timeout: 10_000 });
await page.waitForTimeout(1500);
// 48 of the player's units round the base: 8 workers, 6 of each of the five troop types, 5 support and 5 battle mages (GOD_SPAWNS 0 to 9).
const spawns = [...Array(8).fill(0), ...[1, 2, 3, 4, 5].flatMap((t) => Array(6).fill(t)), ...Array(5).fill(8), ...Array(5).fill(9)];
for (const [k, what] of spawns.entries()) {
  const a = (k / spawns.length) * Math.PI * 2;
  const r = 9 + (k % 3) * 2.5;
  await order({ kind: 'debugPlace', player: 0, what, x: Math.round((home.x + Math.cos(a) * r) * WU), z: Math.round((home.z + 6 + Math.sin(a) * r) * WU) });
}
await page.waitForTimeout(1500);
await press('dbg-rank');
await press('dbg-god');
await page.evaluate(() => window.shell.toggleTesterTools());
await page.evaluate(([x, z]) => window.shell.cam.jumpTo(x, z), [home.x, home.z + 4]);
await page.waitForTimeout(8000);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
/** Frames over a span: gaps between frames, and the WebGL counts per frame. */
const frames = (ms) =>
  page.evaluate(
    (span) =>
      new Promise((resolve) => {
        const gaps = [];
        const g0 = { ...window.glCount };
        let last = 0;
        const t0 = performance.now();
        const tick = (now) => {
          if (last) gaps.push(now - last);
          last = now;
          if (now - t0 < span) requestAnimationFrame(tick);
          else {
            const g1 = window.glCount;
            const per = {};
            for (const k of Object.keys(g1)) per[k] = (g1[k] - g0[k]) / Math.max(1, gaps.length);
            resolve({ gaps, gl: per });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

const rows = [];
const results = {};
const measure = async (name, ms = 15_000) => {
  const m0 = await metrics();
  const f = await frames(ms);
  const m1 = await metrics();
  const r = await readout();
  const n = Math.max(1, f.gaps.length);
  const per = (k) => ((m1[k] - m0[k]) * 1000) / n;
  const res = {
    frames: f.gaps.length,
    gapMean: mean(f.gaps),
    gapP95: pct(f.gaps, 0.95),
    gapMax: Math.max(0, ...f.gaps),
    taskMs: per('TaskDuration'),
    scriptMs: per('ScriptDuration'),
    layoutMs: per('LayoutDuration'),
    styleMs: per('RecalcStyleDuration'),
    gl: f.gl,
    readout: r,
  };
  results[name] = res;
  const g = f.gl;
  rows.push(
    `${label} ${name}: ${res.frames} frames, between frames mean ${res.gapMean.toFixed(1)} ms p95 ${res.gapP95.toFixed(1)} max ${res.gapMax.toFixed(0)}; main thread ${res.taskMs.toFixed(2)} ms a frame (script ${res.scriptMs.toFixed(2)}, style ${res.styleMs.toFixed(2)}, layout ${res.layoutMs.toFixed(2)}); readout frame ${r.fps}, draws ${r.draws}, units ${r.units}, heap ${r.memory}; gl a frame: ${g.draws.toFixed(0)} draws, ${g.instances.toFixed(0)} instances, ${g.bufferKb.toFixed(0)} kB buffers, ${g.textureKb.toFixed(0)} kB textures, ${g.programs.toFixed(0)} program switches, ${g.uniforms.toFixed(0)} uniform calls, ${g.calls.toFixed(0)} calls, ${g.compiles.toFixed(2)} compiles`,
  );
  await page.screenshot({ path: join(out, `profile-${label}-${name}.png`) });
};

/** A CPU profile and an allocation sample over a span: the top functions by self time, by file, and by bytes allocated. */
const cpuProfile = async (name, ms = 8000) => {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192 });
  await page.waitForTimeout(ms);
  const { profile: prof } = await cdp.send('Profiler.stop');
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  writeFileSync(join(out, `profile-${label}-${name}.cpuprofile`), JSON.stringify(prof));
  const dt = new Map();
  for (let k = 0; k < prof.samples.length; k++) dt.set(prof.samples[k], (dt.get(prof.samples[k]) ?? 0) + (prof.timeDeltas[k] ?? 0));
  const self = new Map();
  const byFile = new Map();
  let total = 0;
  for (const node of prof.nodes) {
    const t = (dt.get(node.id) ?? 0) / 1000;
    if (!t) continue;
    total += t;
    const cf = node.callFrame;
    const file = cf.url ? cf.url.replace(/^.*\/src\//, '').replace(/\?.*$/, '').replace(/^.*node_modules\/\.vite\/deps\//, 'deps/') : cf.functionName || '(native)';
    const key = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + t);
    byFile.set(file, (byFile.get(file) ?? 0) + t);
  }
  const idle = [...self].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0);
  const lines = [`${label} ${name} profile: ${total.toFixed(0)} ms sampled, ${(total - idle).toFixed(0)} ms busy over ${ms} ms`];
  lines.push('  top self time:');
  for (const [k, v] of [...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 45)) lines.push(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
  lines.push('  by file:');
  for (const [k, v] of [...byFile].filter(([k]) => k !== '(idle)').sort((a, b) => b[1] - a[1]).slice(0, 30)) lines.push(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
  const alloc = new Map();
  const walk = (n) => {
    const cf = n.callFrame;
    const file = cf.url ? cf.url.replace(/^.*\/src\//, '').replace(/\?.*$/, '').replace(/^.*node_modules\/\.vite\/deps\//, 'deps/') : '(native)';
    const key = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    alloc.set(key, (alloc.get(key) ?? 0) + n.selfSize);
    for (const c of n.children) walk(c);
  };
  walk(heap.head);
  const allocTotal = [...alloc.values()].reduce((a, b) => a + b, 0);
  lines.push(`  allocated (sampled): ${(allocTotal / 1048576).toFixed(1)} MB over ${ms} ms; top:`);
  for (const [k, v] of [...alloc].sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`    ${(v / 1024).toFixed(0).padStart(7)} kB  ${k}`);
  rows.push(lines.join('\n'));
};

await measure('day');
if (profile) await cpuProfile('day');

// Nightfall: x16 to near the end of dusk (day 3600 steps and dusk 800), then x1 and every frame read across it.
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 4250, null, { timeout: 600_000, polling: 250 });
await press('dbg-speed');
console.log(`dusk at step ${await step()}`);
const fall = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const gaps = [];
      let last = 0;
      const t0 = performance.now();
      const tick = (now) => {
        if (last) gaps.push([Math.round(now - t0), Math.round(now - last), Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent)]);
        last = now;
        if (now - t0 < 14_000) requestAnimationFrame(tick);
        else resolve(gaps);
      };
      requestAnimationFrame(tick);
    }),
);
const slow = fall.filter(([, g]) => g > 60);
rows.push(`${label} nightfall: ${fall.length} frames over 14 s, mean ${mean(fall.map((x) => x[1])).toFixed(1)} ms, ${slow.length} over 60 ms: ${slow.map(([, g, s]) => `${g} ms at step ${s}`).join(', ')}`);
results.nightfall = { frames: fall.length, slow };
console.log(`night at step ${await step()}`);

// 80 night mobs (zombies, skeleton archers, giant rats, giant spiders) on a ring 22 to 30 m round the town, coming for it.
const mobs = [0, 6, 2, 3];
for (let k = 0; k < 80; k++) {
  const a = (k / 80) * Math.PI * 2;
  const r = 22 + (k % 5) * 2;
  await order({ kind: 'debugSpawn', player: 0, mob: mobs[k % 4], x: Math.round((home.x + Math.cos(a) * r) * WU), z: Math.round((home.z + 6 + Math.sin(a) * r) * WU) });
}
await page.waitForTimeout(6000);
await measure('night');
if (profile) await cpuProfile('night');
await browser.close();
for (const r of rows) console.log(r);
writeFileSync(join(out, `profile-${label}.json`), JSON.stringify(results, null, 1));
console.log(problems.length ? `problems:\n${problems.slice(0, 20).join('\n')}` : 'no console errors');
