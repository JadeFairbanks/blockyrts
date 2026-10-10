// Browser check of Patch 7's food in a unit's bag, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/food-bag-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 with beef and blueberries in the stock, selects a swordsman,
// drags beef from the stock onto his inventory and blueberries onto him in
// the world, and waits for him to fetch both from the main base (kept in his
// bag). Then a few giant rats hurt him, and the beef's Eat in his own
// inventory sits him down where he stands with the bar over his head until
// he is healed. Saves food-bag-*.png in the output folder and prints what it
// checked. (`pnpm dev` builds the models first; started with vite alone, run
// the tools' models:build once.)
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const BEEF = 88;
const BLUEBERRIES = 175;
const GIANT_RAT = 2;
/** The sim's OrderKind.Tinker. */
const TINKER = 13;

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false })));
const shot = (name) => page.screenshot({ path: join(out, `food-bag-${name}.png`) });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);

await page.goto(`${base}/?seed=1&players=1`);
await page.waitForFunction(() => Number(document.querySelector('.debug .dbg-row:nth-child(3) .dbg-value')?.textContent) > 45, null, { timeout: 180000 });
await page.waitForTimeout(6000);
await order({ kind: 'debugGive', player: 0, res: BEEF, count: 5 });
await order({ kind: 'debugGive', player: 0, res: BLUEBERRIES, count: 8 });

// One swordsman, selected, the camera on him.
const id = await page.evaluate(() => {
  const u = window.world.units.find((x) => x.typeKey === 'warrior' && x.owner === 0);
  window.shell.selection.set([u]);
  const n = Number(u.key.slice(2));
  const info = window.shell.game.unit(n);
  window.shell.cam.jumpTo(info.x / 8000, info.z / 8000);
  return n;
});
await page.waitForTimeout(1200);
const unit = () => page.evaluate((n) => window.shell.game.unit(n), id);
const bag = () => page.evaluate((n) => window.shell.game.info?.bags.find(([x]) => x === n)?.[1] ?? [], id);

/** Scrolls the stock until a good's slot shows, and returns its centre. */
async function stockSlot(name) {
  for (let k = 0; k < 20; k++) {
    const box = await page.locator(`.inv-slot[aria-label="${name}"]:not([hidden])`).first().boundingBox().catch(() => null);
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.locator('[data-btn="inv-down"]').first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}

async function drag(from, to, name) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12);
  await page.waitForTimeout(250);
  const word = await page.locator('.gear-ghost-word').first().textContent().catch(() => '');
  await shot(name);
  await page.mouse.up();
  return word ?? '';
}

// 1. Beef from the stock onto his inventory.
const beefAt = await stockSlot('Beef');
const inv = await page.locator('.unit-inv').first().boundingBox();
const word1 = beefAt && inv ? await drag(beefAt, { x: inv.x + inv.width / 2, y: inv.y + inv.height / 2 }, 'drag-to-inventory') : '';
check('dragging beef onto his inventory says it will be fetched', word1 === 'Fetch 1 from a store point', word1);

// 2. Blueberries from the stock onto him in the world.
const berriesAt = await stockSlot('Blueberries');
const onScreen = await page.evaluate((n) => {
  const it = window.shell.items.find((i) => i.item.key === `e:${n}`);
  return it ? { x: it.x, y: it.y } : null;
}, id);
const word2 = berriesAt && onScreen ? await drag(berriesAt, onScreen, 'drag-to-unit') : '';
check('dragging blueberries onto him says it will be fetched', word2 === 'Fetch 4 from a store point', word2);

// 3. He walks to the main base and comes back with both, kept in his bag.
const fetched = await page
  .waitForFunction(
    (n) => {
      const b = window.shell.game.info?.bags.find(([x]) => x === n)?.[1] ?? [];
      return b.some(([r]) => r === 88) && b.some(([r]) => r === 175);
    },
    id,
    { timeout: 120000 },
  )
  .then(() => true)
  .catch(() => false);
check('he fetched 1 beef and 4 blueberries', fetched, JSON.stringify(await bag()));
await page.evaluate((n) => {
  const u = window.world.units.find((x) => x.key === `e:${n}`);
  window.shell.selection.set([u]);
}, id);
await page.waitForTimeout(800);
check('both show the Keep in bag padlock', (await page.locator('.unit-inv .unit-slot.kept').count()) >= 2);
await shot('fetched');

// 4. Eat is greyed while he is unhurt.
await page.locator('.unit-inv .unit-slot[aria-label="Beef"]').first().click({ button: 'right' });
await page.waitForTimeout(400);
const eatRow = page.locator('.pop-row[aria-label="Eat"]').first();
check('his beef opens Eat, greyed at full health', (await eatRow.locator('.pr-why').textContent().catch(() => '')) === 'It is at full health.');
await shot('menu-full-health');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 5. Rats hurt him.
const at = await unit();
for (let k = 0; k < 4; k++) await order({ kind: 'debugSpawn', player: 0, mob: GIANT_RAT, x: at.x + 8000, z: at.z + k * 4000 });
const hurt = await page
  .waitForFunction((n) => {
    const u = window.shell.game.unit(n);
    return u && u.hp < u.maxHp * 0.85;
  }, id, { timeout: 60000 })
  .then(() => true)
  .catch(() => false);
check('the rats hurt him', hurt, JSON.stringify(await unit().then((u) => [u.hp, u.maxHp])));
// Let him finish them off.
await page.waitForTimeout(8000);
const before = await unit();

// 6. Eat from his own inventory: he sits where he stands with the bar over his head.
await page.evaluate((n) => {
  const u = window.world.units.find((x) => x.key === `e:${n}`);
  window.shell.selection.set([u]);
}, id);
await page.waitForTimeout(500);
await page.locator('.unit-inv .unit-slot[aria-label="Beef"]').first().click({ button: 'right' });
await page.waitForTimeout(400);
await shot('menu-eat');
await page.locator('.pop-row[aria-label="Eat"]').first().click();
await page.waitForTimeout(1500);
const sitting = await unit();
check('he sits tinkering where he stands', sitting.order === TINKER && Math.hypot(sitting.x - before.x, sitting.z - before.z) < 8000, `order ${sitting.order}, moved ${Math.round(Math.hypot(sitting.x - before.x, sitting.z - before.z) / 80) / 100} m`);
const bubble = await page.evaluate(() => [...document.querySelectorAll('.bubble')].map((b) => b.textContent).find((t) => /from my bag/.test(t ?? '')) ?? '');
check('his bubble says what he eats', /I need \d food to heal.*beef from my bag/.test(bubble), bubble);
check('the beef left his bag', !(await bag()).some(([r]) => r === BEEF));
await page.evaluate((n) => {
  const u = window.shell.game.unit(n);
  window.shell.cam.jumpTo(u.x / 8000, u.z / 8000);
  window.shell.cam.targetDistance = 9;
}, id);
await page.waitForTimeout(1500);
await shot('eating');
await page.waitForTimeout(10000);
const after = await unit();
check('he healed fully', after.hp === after.maxHp, `${after.hp}/${after.maxHp}`);
await shot('healed');

console.log(results.join('\n'));
if (problems.length) console.log(`console problems:\n${problems.slice(0, 10).join('\n')}`);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
