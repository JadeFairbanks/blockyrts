// One combined browser check of mini patch 7.3, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/tools models:build
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/mini73-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 alone and checks, in one pass and inside the first day: the
// loading screen and its bar; the start units (4 workers, 2 clubmen, a
// spearman); the yellow auto rings on Gather and Hunt; fetching copper ore by
// dragging it onto a clubman (no bar, "Got 3 copper ore."), Give ("Here,
// take ..." and "Got ..."), and handing a bag good in by dragging it onto
// the stock ("Handed in ..."); the attack pings (one minimap ping and one
// ground ring for a fight in view that the player did not start, one more
// minimap ping for a second fight far off, none for an Attack order); a
// Fluted Gothic harness at 50%; and the Worker button greyed, naming what is
// short, once the stock has no sticks. Saves mini73-*.png in the output
// folder and prints what it checked. The rules behind poison, magic and
// shields, the spell cut and fish placement are checked by the unit tests.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const WU = 8000;
const STICKS = 29;
const COPPER_ORE = 9;
const GOTHIC = 144;
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
const shot = (name) => page.screenshot({ path: join(out, `mini73-${name}.png`) });
const results = [];
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`;
  results.push(line);
  console.log(line);
};
const order = (o) => page.evaluate((x) => window.shell.opts.issueOrder(x), o);
const unit = (n) => page.evaluate((id) => window.shell.game.unit(id), n);
const bag = (n) => page.evaluate((id) => window.shell.game.info?.bags.find(([x]) => x === id)?.[1] ?? [], n);
const pool = (r) => page.evaluate((x) => window.shell.game.pool()[x], r);
/** What one unit said since the hook went in (shell.onSpeech), matching a pattern. */
const saidBy = (n, re) => page.evaluate(([id, src]) => window.__said.filter(([s, t]) => s === id && new RegExp(src).test(t)).map(([, t]) => t), [n, re.source]);
const pings = () => page.evaluate(() => ({ minimap: window.__pings.length, ground: window.__rings }));
/** Minimap pings since the n-th within 20 m of (x, z) metres: a hunting spearman or a worker elsewhere may be in a fight of its own. */
const pingsNear = (n, x, z) => page.evaluate(([k, px, pz]) => window.__pings.slice(k).filter(([a, b]) => Math.hypot(a - px, b - pz) <= 20).length, [n, x, z]);
const select = (list) =>
  page.evaluate((l) => {
    window.shell.selection.set(window.world.units.filter((u) => l.includes(Number(u.key.slice(2)))));
  }, list);
const look = (x, z) => page.evaluate(([a, b]) => window.shell.cam.jumpTo(a / 8000, b / 8000), [x, z]);
const onScreen = (n) =>
  page.evaluate((id) => {
    const it = window.shell.items.find((i) => i.item.key === `e:${id}`);
    return it ? { x: it.x, y: it.y } : null;
  }, n);
const centre = (b) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null);
async function drag(from, to, name) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12);
  await page.waitForTimeout(300);
  const word = await page.locator('.gear-ghost-word').first().textContent().catch(() => '');
  await shot(name);
  await page.mouse.up();
  return word ?? '';
}
/** Scrolls the stock until a good's slot shows, and returns its centre. */
async function stockSlot(name) {
  for (let k = 0; k < 30; k++) {
    const box = await page.locator(`.inv-slot[aria-label="${name}"]:not([hidden])`).first().boundingBox().catch(() => null);
    if (box) return centre(box);
    await page.locator('[data-btn="inv-down"]').first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}
async function until(test, tries = 120, ms = 500) {
  for (let k = 0; k < tries; k++) {
    if (await test()) return true;
    await page.waitForTimeout(ms);
  }
  return false;
}
/** Spawns a giant rat and returns its id. */
async function rat(x, z) {
  await order({ kind: 'debugSpawn', player: 0, mob: GIANT_RAT, x, z });
  let id = -1;
  await until(
    async () => {
      id = await page.evaluate(
        ([px, pz]) => {
          for (const u of window.world.units) {
            const i = window.shell.game.unit(Number(u.key.slice(2)));
            if (i && i.mob === 2 && Math.abs(i.x - px) < 32000 && Math.abs(i.z - pz) < 32000) return i.id;
          }
          return -1;
        },
        [x, z],
      );
      return id >= 0;
    },
    20,
    100,
  );
  return id;
}

// 1. The loading screen.
const t0 = Date.now();
await page.goto(`${base}/?seed=1&players=1`);
const sawScreen = await page
  .waitForSelector('[data-page="loading"] .loading-bar', { timeout: 60000 })
  .then(() => true)
  .catch(() => false);
check('the loading screen shows with its bar', sawScreen);
await page.waitForFunction(() => Number(document.querySelector('.loading-bar')?.getAttribute('aria-valuenow') ?? 0) >= 30, null, { timeout: 300000 }).catch(() => {});
const midway = await page.evaluate(() => [document.querySelector('.loading-line')?.textContent ?? '', document.querySelector('.loading-count')?.textContent ?? '']);
await shot('loading');
check('it says what it loads and counts models and pictures', /models and pictures/.test(midway[1]), midway.join(' | '));
const gone = await page
  .waitForFunction(() => window.shell && !document.querySelector('[data-page="loading"]'), null, { timeout: 900000 })
  .then(() => true)
  .catch(() => false);
check('the screen goes once everything is in', gone, `${Math.round((Date.now() - t0) / 1000)} s here (software drawing)`);
await page.evaluate(() => {
  const s = window.shell;
  window.__said = [];
  const speech = s.onSpeech.bind(s);
  s.onSpeech = (ev, at) => {
    window.__said.push([ev.speaker, ev.text]);
    return speech(ev, at);
  };
  window.__pings = [];
  window.__rings = 0;
  const ping = s.minimap.ping.bind(s.minimap);
  s.minimap.ping = (x, z, k) => {
    if (k === 'attack') window.__pings.push([Math.round(x), Math.round(z)]);
    return ping(x, z, k);
  };
  const ring = s.visuals.attackPing.bind(s.visuals);
  s.visuals.attackPing = (v) => {
    window.__rings++;
    return ring(v);
  };
});
await page.waitForTimeout(2000);
await shot('first-sight');

// 2. Start units.
const start = await page.evaluate(() => {
  const own = window.world.units.filter((u) => u.owner === 0);
  const info = own.map((u) => window.shell.game.unit(Number(u.key.slice(2))));
  return {
    workers: own.filter((u) => u.typeKey === 'worker').map((u) => Number(u.key.slice(2))),
    troops: own.filter((u) => u.typeKey === 'warrior').map((u) => Number(u.key.slice(2))),
    kinds: info.filter((i) => i && i.troop).map((i) => i.troop),
  };
});
check('the start has 4 workers and 3 troops (2 clubmen and the spearman)', start.workers.length === 4 && start.troops.length === 3, `troop types ${JSON.stringify(start.kinds)}`);
const [clubA, clubB, spear] = start.troops;

// 3. Yellow auto rings: Gather on the workers, Hunt on the spearman.
await select(start.workers);
await page.waitForTimeout(800);
await page.locator('.hud-btn.cmd[aria-label="Gather"]').first().click({ button: 'right' }).catch(() => {});
await page.waitForTimeout(1200);
check('auto Gather shows the yellow ring', (await page.locator('.hud-btn.autoloop[aria-label="Gather"]').count()) > 0);
await shot('gather-ring');
await select([spear]);
await page.waitForTimeout(800);
await page.locator('.hud-btn.cmd[aria-label="Hunt"]').first().click({ button: 'right' }).catch(() => {});
await page.waitForTimeout(1200);
check('auto Hunt shows the yellow ring', (await page.locator('.hud-btn.autoloop[aria-label="Hunt"]').count()) > 0);
await shot('hunt-ring');

// 4. Fetch by drag, Give, and hand in by drag. The clubmen stand 25 m from the main base first, out of reach of its
// automatic hand-in (5 m).
await order({ kind: 'move', player: 0, units: [clubA], x: 0, z: 25 * WU });
await order({ kind: 'move', player: 0, units: [clubB], x: 3 * WU, z: 25 * WU });
await order({ kind: 'debugGive', player: 0, res: COPPER_ORE, count: 30 });
await until(async () => Math.abs((await unit(clubA)).z - 25 * WU) < 2 * WU, 60);
await select([clubA]);
await look(0, 25 * WU);
await page.waitForTimeout(1200);
const oreAt = await stockSlot('Copper ore');
const clubAt = await onScreen(clubA);
const word1 = oreAt && clubAt ? await drag(oreAt, clubAt, 'fetch-drag') : '';
check('dragging copper ore onto a clubman says it will be fetched', /^Fetch \d+ from a store point$/.test(word1), word1);
let barSeen = false;
const fetched = await until(async () => {
  if ((await unit(clubA))?.order === TINKER) barSeen = true;
  return (await bag(clubA)).some(([r]) => r === COPPER_ORE);
}, 240);
check('he fetched the ore into his bag', fetched, JSON.stringify(await bag(clubA)));
check('no bar while fetching', !barSeen);
check('he says what he got', (await saidBy(clubA, /^Got \d+ copper ore\.$/)).length > 0, (await saidBy(clubA, /copper/)).join(' | '));
await shot('fetched');

await order({ kind: 'move', player: 0, units: [clubA], x: 0, z: 25 * WU });
await until(async () => Math.abs((await unit(clubA)).z - 25 * WU) < 2 * WU, 60);
await order({ kind: 'giveItem', player: 0, units: [clubA], res: COPPER_ORE, target: clubB });
const gave = await until(async () => (await saidBy(clubA, /^Here, take \d+ copper ore\.$/)).length > 0 && (await saidBy(clubB, /^Got \d+ copper ore\.$/)).length > 0, 60);
check('Give hands the ore over and both say so', gave, [...(await saidBy(clubA, /Here/)), ...(await saidBy(clubB, /Got/))].join(' | '));
await shot('give');

// Hand in a kept bag good by dragging it onto the stock: the clubman fetches ore again and hands it in.
await order({ kind: 'fetchFood', player: 0, units: [clubA], res: COPPER_ORE });
await until(async () => (await bag(clubA)).some(([r]) => r === COPPER_ORE), 240);
await select([clubA]);
const a = await unit(clubA);
await look(a.x, a.z);
await page.waitForTimeout(1200);
const before = await pool(COPPER_ORE);
const slot = centre(await page.locator('.unit-inv .unit-slot[aria-label="Copper ore"]').first().boundingBox().catch(() => null));
const stock = await page.evaluate(() => {
  const r = window.shell.layout.stockpile.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const word2 = slot ? await drag(slot, stock, 'handin-drag') : '';
check('dragging a bag good onto the stock says hand in', word2 === 'Hand in at a store point', word2);
const handed = await until(async () => (await saidBy(clubA, /^Handed in .*copper ore\.$/)).length > 0, 120);
check('he hands it in and says so', handed && (await pool(COPPER_ORE)) > before, `${(await saidBy(clubA, /Handed/)).join(' | ')}; stock ${before} to ${await pool(COPPER_ORE)}`);

// 5. Armour cap: a Fluted Gothic harness put on a clubman shows 50%.
await order({ kind: 'debugGive', player: 0, res: GOTHIC, count: 1 });
await page.waitForTimeout(800);
await order({ kind: 'equip', player: 0, units: [clubA], res: GOTHIC });
const worn = await until(async () => (await saidBy(clubA, /gothic harness/i)).length > 0, 120);
await select([clubA]);
await page.waitForTimeout(1200);
await page.locator('.selection-panel [aria-label^="Fluted Gothic harness"]').first().hover().catch(() => {});
await page.waitForTimeout(800);
const tip = await page.evaluate(() => [...document.querySelectorAll('.tt-body')].map((x) => x.textContent).join(' '));
await shot('harness');
check('a Fluted Gothic harness goes on and shows 50% protection', worn && /Protection 50%/.test(tip), tip.slice(0, 120));
await page.mouse.move(640, 300);

// 6. Attack pings. The clubmen go 30 m south and 40 m east, the camera with the first.
await order({ kind: 'move', player: 0, units: [clubA], x: 0, z: 30 * WU });
await order({ kind: 'move', player: 0, units: [clubB], x: 40 * WU, z: -10 * WU });
await until(async () => Math.abs((await unit(clubB)).x - 40 * WU) < 3 * WU && Math.abs((await unit(clubA)).z - 30 * WU) < 3 * WU, 60);
await look(0, 30 * WU);
await page.waitForTimeout(1000);
const p0 = await pings();
await rat(6 * WU, 30 * WU);
await until(async () => (await pings()).ground > p0.ground, 40, 250);
await shot('ping-in-view');
await page.waitForTimeout(8000);
const p1 = await pings();
check('a fight in view the player did not start pings once (minimap and ground)', (await pingsNear(p0.minimap, 3, 30)) === 1 && p1.ground - p0.ground === 1, JSON.stringify(p1));
await rat(46 * WU, -10 * WU);
await until(async () => (await pings()).minimap > p1.minimap, 40, 250);
await shot('ping-minimap');
await page.waitForTimeout(8000);
const p2 = await pings();
check('a second fight far off pings the minimap once more, not the ground', (await pingsNear(p1.minimap, 43, -10)) === 1 && p2.ground === p1.ground, JSON.stringify(p2));
const c = await unit(clubA);
const target = await rat(c.x + 25 * WU, c.z);
await order({ kind: 'attack', player: 0, units: [clubA], target });
await page.waitForTimeout(10000);
check('a fight started with Attack does not ping', (await pingsNear(p2.minimap, (c.x + 12 * WU) / WU, c.z / WU)) === 0, JSON.stringify(await page.evaluate((n) => window.__pings.slice(n), p2.minimap)));

// 7. The Worker button greyed once the stock has no sticks (its tool kit's cost): the workers fetch them all.
await order({ kind: 'fetchFood', player: 0, units: start.workers, res: STICKS });
await until(async () => (await pool(STICKS)) === 0, 240);
await page.evaluate(() => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith('building:0:'))));
await page.waitForTimeout(1000);
const workerBtn = page.locator('.hud-btn.cmd[aria-label="Worker"]').first();
const greyed = await workerBtn.evaluate((b) => b.classList.contains('disabled')).catch(() => null);
await workerBtn.hover().catch(() => {});
await page.waitForTimeout(700);
const reason = await page.locator('.tt-reason').first().textContent().catch(() => '');
await shot('worker-greyed');
check('with no sticks the Worker button is grey and says what is short', (await pool(STICKS)) === 0 && greyed === true && /Short/.test(reason ?? ''), `grey ${greyed}, "${reason}"`);

console.log('\n' + results.join('\n'));
if (problems.length) console.log(`console problems:\n${problems.slice(0, 10).join('\n')}`);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
