// Browser look at the milestone 11 troop panel, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/m11-look.mjs http://localhost:5198 /tmp/shots
//
// Presses the debug Troop kit, selects the Barracks it puts down, and saves
// m11-*.png of the troop panel, an open tier dropdown, the Barracks card and
// a warrior's card with its upgrade buttons. Prints what it checked.
/* global window */
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
await page.addInitScript(() => {
  localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
});
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `m11-${name}.png`) });
const press = (id) => page.evaluate((b) => window.shell.buttons.get(b)?.def.onPress?.({ shift: false, ctrl: false }), id);

await page.goto(`${base}/?seed=1`);
await page.waitForFunction(() => window.shell && window.shell.game.info, null, { timeout: 60000 });
await page.waitForTimeout(1500);

// The start: three close-melee warriors with cudgels.
const start = await page.evaluate(() => {
  const g = window.shell.game;
  const units = g.unitIds().map((id) => g.unit(id)).filter((u) => u.owner === 0);
  return { workers: units.filter((u) => u.kind === 0).length, troops: units.filter((u) => u.kind === 1).map((u) => [u.troop, u.wTier, u.aTier]) };
});
check('start: 4 workers', start.workers === 4, String(start.workers));
check('start: 3 close melee, weapon tier 1, no armour', start.troops.length === 3 && start.troops.every(([t, w, a]) => t === 1 && w === 1 && a === 0), JSON.stringify(start.troops));

await press('dbg-troops');
await press('dbg-citadel');
await page.waitForTimeout(1500);
const picked = await page.evaluate(() => {
  const s = window.shell;
  const b = [...s.world.selectables.candidates()].find((t) => t.typeKey.startsWith('building:24:') && t.owner === 0);
  if (!b) return false;
  s.cam.jumpTo(b.centre.x, b.centre.z);
  s.selection.set([b]);
  return true;
});
check('a Barracks to select', picked);
await page.waitForTimeout(1200);
const rows = await page.locator('.troop-row').count();
check('four troop rows at the Barracks', rows === 4, String(rows));
const card = await page.evaluate(() => window.shell.commands.card().map((c) => (c ? `${c.action}:${c.enabled ? 'on' : 'off'}` : '')));
check('Barracks card has the four troop buttons', ['trainClose', 'trainLong', 'trainRanger', 'trainBrawler'].every((a) => card.some((c) => c.startsWith(a))), card.filter((c) => c).join(' '));
await shot('barracks');
await page.evaluate(() => window.shell.buttons.get('troopw-2')?.def.onPress?.({ shift: false, ctrl: false }));
await page.waitForTimeout(600);
const opts = await page.locator('.troop-opt').count();
check('the long-melee weapon list has Best affordable, 8 tiers and Back', opts === 10, String(opts));
await shot('dropdown');
await page.evaluate(() => window.shell.buttons.get('tier-6')?.def.onPress?.({ shift: false, ctrl: false }));
await page.waitForTimeout(600);
await page.evaluate(() => window.shell.buttons.get('troop-2')?.def.onPress?.({ shift: false, ctrl: false }));
await page.waitForTimeout(800);
const queued = await page.evaluate(() => {
  const s = window.shell;
  const b = s.commands.buildings()[0];
  return b ? b.queue.map((q) => q.product) : [];
});
check('the picture button queues the picked kit (long melee, iron pike)', queued.some((p) => p >= 4096 && Math.floor((p - 4096) / 100) === 2 && Math.floor(((p - 4096) % 100) / 10) === 6), JSON.stringify(queued));
await shot('queued');

// A warrior's card: Upgrade weapon and armour, and the Max twins with the stock for every tier.
await page.evaluate(() => {
  const s = window.shell;
  const w = [...s.world.selectables.candidates()].filter((t) => t.typeKey === 'warrior' && t.owner === 0);
  s.selection.set(w);
});
await page.waitForTimeout(800);
const wcard = await page.evaluate(() => window.shell.commands.card().map((c) => (c ? `${c.action}:${c.enabled ? 'on' : 'off'}` : '')));
check('warriors have Upgrade weapon and armour', wcard.some((c) => c === 'upgradeWeapon:on') && wcard.some((c) => c === 'upgradeArmour:on'), wcard.filter((c) => c).join(' '));
check('and the Max twins, which go further', wcard.some((c) => c.startsWith('upgradeWeaponMax')) && wcard.some((c) => c.startsWith('upgradeArmourMax')));
await shot('warriors');

console.log(results.join('\n'));
if (problems.length) console.log(`page problems:\n${problems.join('\n')}`);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
