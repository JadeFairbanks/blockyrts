// Browser look at a farm's harvest bar (patch notes 1), run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/farm-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, has the four workers build a wheat field beside the Big
// House at x16, then puts one farmer on it, selects it and saves farm-*.png
// of the panel with one farmer, two farmers and none; checks the line, the
// bar filling and that it halves its time with a second farmer. Prints what
// it checked.
/* global window, document */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`error: ${m.text()}`);
});
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `farm-${name}.png`) });
const press = (id) => page.evaluate((b) => window.shell.buttons.get(b)?.def.onPress?.({ shift: false, ctrl: false }), id);
const CROP_FIELD = 1;
const field = () => page.evaluate((k) => [...window.shell.game.buildings.values()].find((b) => b.kind === k && b.owner === 0) ?? null, CROP_FIELD);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => window.shell && window.shell.game.info, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const workers = await page.evaluate(() => {
  const g = window.shell.game;
  return g.unitIds().filter((id) => g.unit(id).owner === 0 && g.unit(id).kind === 0);
});
// A wheat field east of the Big House: try spots outwards until one takes.
for (let k = 0; k < 16 && !(await field()); k++) {
  await page.evaluate(
    ([units, k2, kind]) => {
      const home = [...window.shell.game.buildings.values()].find((b) => b.kind === 0 && b.owner === 0);
      const dx = 16 + (k2 % 8) * 3;
      const dz = Math.floor(k2 / 8) * 14 - 28;
      window.shell.opts.issueOrder({ kind: 'build', player: 0, units, building: kind, variant: 0, x: home.x + dx, z: home.z + dz });
    },
    [workers, k, CROP_FIELD],
  );
  // The site goes down when the first worker gets there.
  await page.waitForFunction((kind) => [...window.shell.game.buildings.values()].some((b) => b.kind === kind && b.owner === 0), CROP_FIELD, { timeout: 15000 }).catch(() => undefined);
}
check('a wheat field placed', (await field()) !== null);
await press('dbg-speed');
await press('dbg-speed');
await page.waitForFunction((k) => [...window.shell.game.buildings.values()].some((b) => b.kind === k && b.owner === 0 && b.complete), CROP_FIELD, { timeout: 120000 }).catch(() => undefined);
await press('dbg-speed');
const f0 = await field();
check('the field is finished', f0?.complete === true);
check('no fallow line', !(f0?.status ?? '').includes('fallow'), f0?.status);

await page.evaluate(([units, id]) => window.shell.opts.issueOrder({ kind: 'assign', player: 0, units, building: id }), [[workers[0]], f0.id]);
await page.waitForFunction((k) => [...window.shell.game.buildings.values()].some((b) => b.kind === k && b.owner === 0 && b.working === 1), CROP_FIELD, { timeout: 60000 });
await page.evaluate((k) => {
  const s = window.shell;
  const b = [...s.world.selectables.candidates()].find((t) => t.typeKey.startsWith(`building:${k}:`) && t.owner === 0);
  s.cam.jumpTo(b.centre.x, b.centre.z);
  s.selection.set([b]);
}, CROP_FIELD);
await page.waitForTimeout(1200);
const read = () =>
  page.evaluate(() => ({
    line: document.querySelector('.farm-harvest')?.textContent ?? '',
    band: document.querySelector('.farm-band')?.textContent ?? '',
    width: parseFloat(document.querySelector('.farm-bar > span')?.style.width ?? '0'),
    still: document.querySelector('.farm-bar')?.classList.contains('still') ?? false,
  }));
const one = await read();
check('one farmer: the harvest line', /^In \d+ minutes? (\d+ seconds? )?|^In 7 minutes/.test(one.line) && one.line.includes('6 wheat will be produced, giving a food value of 12.'), one.line);
check('the band line', one.band.startsWith('Full yield in the Heartland'), one.band);
await shot('one-farmer');
await page.waitForTimeout(2500);
const later = await read();
check('the bar keeps filling', later.width > one.width, `${one.width}% -> ${later.width}%`);

const secs = (line) => {
  const m = /^In (?:(\d+) minutes?)? ?(?:(\d+) seconds?)?,/.exec(line);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : NaN;
};
await page.evaluate(([units, id]) => window.shell.opts.issueOrder({ kind: 'assign', player: 0, units, building: id }), [[workers[1]], f0.id]);
await page.waitForFunction((k) => [...window.shell.game.buildings.values()].some((b) => b.kind === k && b.owner === 0 && b.working === 2), CROP_FIELD, { timeout: 60000 });
await page.waitForTimeout(800);
const before = secs(later.line);
const two = await read();
check('two farmers: about half the time left, the same 6 wheat', secs(two.line) <= before / 2 + 3 && two.line.includes('6 wheat'), `${before} s -> ${secs(two.line)} s: ${two.line}`);
await shot('two-farmers');

await press('dbg-speed');
await press('dbg-speed');
const wheat0 = await page.evaluate(() => window.shell.game.info.pool[36]);
await page.waitForFunction((w) => window.shell.game.info.pool[36] >= w + 6, wheat0, { timeout: 120000 }).catch(() => undefined);
const wheat1 = await page.evaluate(() => window.shell.game.info.pool[36]);
check('a harvest brings in 6 wheat', wheat1 - wheat0 >= 6, `${wheat0} -> ${wheat1}`);
await press('dbg-speed');

await page.evaluate(([units]) => window.shell.opts.issueOrder({ kind: 'stop', player: 0, units }), [[workers[0], workers[1]]]);
await page.waitForFunction((k) => [...window.shell.game.buildings.values()].some((b) => b.kind === k && b.owner === 0 && b.working === 0), CROP_FIELD, { timeout: 60000 });
await page.waitForTimeout(800);
const none = await read();
check('no farmers: the bar stands still', none.still && none.line.startsWith('No farmer at work'), none.line);
await shot('no-farmers');

console.log(results.join('\n'));
if (problems.length) console.log(`problems:\n${problems.join('\n')}`);
await browser.close();
