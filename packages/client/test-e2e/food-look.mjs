// Browser check for patch 1's food, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/food-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1, checks the Food cell and that every meat and fish slot
// shows its icon, waits for a meal bubble, selects a worker to read its
// hunger line, then keeps every food back and waits for a unit to say it is
// starving. Saves screenshots as food-*.png in the output folder and prints
// what it checked. Takes about four minutes of game time.
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
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});
const shot = (name) => page.screenshot({ path: join(out, `food-${name}.png`) });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45);

// 1. The Food cell: food value in whole food (140 at the start, less what the first meals took).
const food = Number(await page.locator('[data-btn="stock-food"]').first().textContent().then((t) => t.replace(/\D/g, '')));
check('Food cell is the food value', food >= 135 && food <= 140, String(food));

// 2. Every meat and fish kind: give one of each and look at their slots' icons.
const kinds = [7, 8, ...Array.from({ length: 19 }, (_, k) => 107 + k)];
for (const res of kinds) await order({ kind: 'debugGive', player: 0, res, count: 3 });
await page.waitForTimeout(800);
const icons = [];
for (let row = 0; row < 8; row++) {
  icons.push(
    ...(await page.evaluate(() =>
      [...document.querySelectorAll('.inv-slot:not([hidden])')].map((b) => ({
        name: b.getAttribute('aria-label') ?? '',
        ok: b.querySelector('img')?.complete === true && b.querySelector('img')?.naturalWidth === 32,
        src: b.querySelector('img')?.getAttribute('src') ?? '',
      })),
    )),
  );
  if (row === 0) await shot('grid');
  await page.locator('[data-btn="inv-down"]').first().click().catch(() => {});
  await page.waitForTimeout(300);
}
const meatIcons = [...new Set(icons.filter((i) => /icon_(meat|fish)/.test(i.src)).map((i) => i.src.replace(/.*\/(icon_[a-z_]+).*/, '$1')))];
check('every meat and fish slot has its icon', meatIcons.length === 21, `${meatIcons.length}: ${meatIcons.join(' ')}`);
check('every shown icon loaded', icons.every((i) => i.ok), icons.filter((i) => !i.ok).map((i) => i.src).join(' '));

// 3. A meal bubble over a unit on screen.
const bubble = await page
  .waitForFunction(() => [...document.querySelectorAll('.bubble')].map((b) => b.textContent).find((t) => /food of/.test(t ?? '')), null, { timeout: 150_000 })
  .then((h) => h.jsonValue())
  .catch(() => '');
check('a unit says what it ate', bubble !== '', bubble);
await shot('meal-bubble');
const panelMeals = await page.evaluate(() => document.querySelector('.message-list')?.textContent ?? '');
check('meal lines stay out of the message panel', !/food of/.test(panelMeals));

// 4. The hunger line for one selected worker, and none for two.
const pick = (n) =>
  page.evaluate((count) => {
    const own = window.shell.items.filter((i) => i.item.key.startsWith('e:') && i.item.owner === 0 && /Worker/.test(i.item.label));
    window.shell.selection.set(own.slice(0, count).map((i) => i.item));
  }, n);
await pick(1);
await page.waitForTimeout(500);
const line = await page.locator('.sel-row.hunger').first().textContent().catch(() => '');
check('one worker shows its next meal', /^Next meal in \d+ (minute|second)/.test(line ?? ''), line ?? '');
await shot('hunger-line');
await pick(2);
await page.waitForTimeout(500);
check('two units show no hunger line', (await page.locator('.sel-row.hunger').count()) === 0);

// 5. Keep every food back: units say there was not enough, and the hunger line turns red.
// Every resource id: the sim keeps back the foods and ignores the rest.
for (let res = 0; res < 128; res++) await order({ kind: 'dontEat', player: 0, res, on: 1 });
const hungry = await page
  .waitForFunction(() => [...document.querySelectorAll('.bubble')].map((b) => b.textContent).find((t) => /starving|crumb|bare/i.test(t ?? '')), null, { timeout: 150_000 })
  .then((h) => h.jsonValue())
  .catch(() => '');
check('a unit complains there was no food', hungry !== '', hungry);
await shot('hungry-bubble');
await pick(1);
await page.waitForTimeout(500);
check('the Food cell is red', await page.locator('[data-btn="stock-food"].starving').count().then((n) => n > 0));

console.log(results.join('\n'));
if (problems.length) console.log(`console problems:\n${problems.slice(0, 10).join('\n')}`);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
