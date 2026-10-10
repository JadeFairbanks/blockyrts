// One combined browser check of mini patch 7.3, run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/tools models:build
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/mini73-look.mjs http://localhost:5198 /tmp/shots
//
// Starts seed 1 alone and checks, in one pass: the loading screen and its
// bar; the start units (4 workers, 2 clubmen, a spearman); the Worker button
// greyed with what is short once the stock has no hardwood lumber; fetching
// copper ore by dragging it onto a unit (no bar, "Got N copper ore."),
// handing it in by dragging it onto the stock ("Handed in ..."), and Give
// ("Here, take ..." and "Got ..."); a Fluted Gothic harness at 50%; a battle
// mage's bolt landing in full on a hobgoblin's shield; the attack pings (one
// for a fight the player did not start, one more for a second fight far
// off, none for an Attack order); the yellow auto rings on Gather and Hunt;
// and a pine seen side on. Saves mini73-*.png in the output folder and
// prints what it checked.
/* global window, document -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const WU = 8000;
const STICKS = 29;
const COPPER_ORE = 9;
const GOTHIC = 144;
/** GOD_SPAWNS (sim debug/god.ts): a Champion, a battle mage, a hobgoblin, a giant rat. */
const PLACE_TROOP = 1;
const PLACE_BATTLE_MAGE = 9;
const PLACE_HOBGOBLIN = 61;
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
/** Every line the player's units said since the hook went in (shell.onSpeech), as [speaker, text]. */
const said = () => page.evaluate(() => window.__said ?? []);
const saidBy = async (n, re) => (await said()).filter(([id, t]) => id === n && re.test(t)).map(([, t]) => t);
const ids = () => page.evaluate(() => window.world.units.map((u) => Number(u.key.slice(2))));
const select = (list) =>
  page.evaluate((l) => {
    window.shell.selection.set(window.world.units.filter((u) => l.includes(Number(u.key.slice(2)))));
  }, list);
const look = (x, z, d = 0) =>
  page.evaluate(
    ([a, b, c]) => {
      window.shell.cam.jumpTo(a / 8000, b / 8000);
      if (c) window.shell.cam.targetDistance = c;
    },
    [x, z, d],
  );
/** Places a godmode spawn and returns the new unit's id. */
async function place(what, x, z) {
  const before = new Set(await ids());
  await order({ kind: 'debugPlace', player: 0, what, x, z });
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(250);
    const now = (await ids()).filter((n) => !before.has(n));
    if (now.length) return now[0];
  }
  return -1;
}
async function spawnRats(x, z, n) {
  const before = new Set(await ids());
  for (let k = 0; k < n; k++) await order({ kind: 'debugSpawn', player: 0, mob: GIANT_RAT, x: x + k * 3000, z });
  await page.waitForTimeout(1500);
  return (await ids()).filter((i) => !before.has(i));
}
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
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.locator('[data-btn="inv-down"]').first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}
const centre = (b) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null);
const onScreen = (n) =>
  page.evaluate((id) => {
    const it = window.shell.items.find((i) => i.item.key === `e:${id}`);
    return it ? { x: it.x, y: it.y } : null;
  }, n);

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
  .waitForFunction(() => !document.querySelector('[data-page="loading"]'), null, { timeout: 900000 })
  .then(() => true)
  .catch(() => false);
check('the screen goes once everything is in', gone, `${Math.round((Date.now() - t0) / 1000)} s here (software drawing)`);
const firstStep = await page.evaluate(() => window.shell.game.step ?? -1);
check('no game time passed behind the screen', firstStep >= 0 && firstStep < 40, `step ${firstStep} when it went`);
await page.waitForTimeout(4000);
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
const home = await page.evaluate(() => {
  const b = [...window.world.buildings.selectables()].find((x) => x.typeKey.startsWith('building:0:'));
  return { x: Math.round(b.centre.x * 8000), z: Math.round(b.centre.z * 8000) };
});

// Yellow auto rings on Gather (workers) and Hunt (the spearman).
await select(start.workers);
await page.waitForTimeout(800);
await page.locator('.hud-btn[aria-label="Gather"]').first().click({ button: 'right' }).catch(() => {});
await page.waitForTimeout(1500);
const gatherRing = await page.locator('.hud-btn.autoloop[aria-label="Gather"]').count();
await shot('gather-ring');
check('auto Gather shows the yellow ring', gatherRing > 0);
await select([start.troops[2]]);
await page.waitForTimeout(800);
await page.locator('.hud-btn[aria-label*="Hunt"]').first().click({ button: 'right' }).catch(() => {});
await page.waitForTimeout(1500);
const huntRing = await page.locator('.hud-btn.autoloop[aria-label*="Hunt"]').count();
await shot('hunt-ring');
check('auto Hunt shows the yellow ring', huntRing > 0);

// 3. Fetch, hand in, give: any good, no bar, bubbles.
const [clubA, clubB] = start.troops;
await order({ kind: 'debugGive', player: 0, res: COPPER_ORE, count: 30 });
await select([clubA]);
let a = await unit(clubA);
await look(a.x, a.z, 14);
await page.waitForTimeout(1200);
const oreAt = await stockSlot('Copper ore');
const word1 = oreAt ? await drag(oreAt, await onScreen(clubA), 'fetch-drag') : '';
check('dragging copper ore onto a clubman says it will be fetched', /^Fetch \d+ from a store point$/.test(word1), word1);
let barSeen = false;
const fetched = await (async () => {
  for (let k = 0; k < 240; k++) {
    const u = await unit(clubA);
    if (u?.order === TINKER) barSeen = true;
    if ((await bag(clubA)).some(([r]) => r === COPPER_ORE)) return true;
    await page.waitForTimeout(500);
  }
  return false;
})();
await page.waitForTimeout(1000);
const gotLine = (await saidBy(clubA, /^Got \d+ copper ore\.$/))[0] ?? '';
check('he fetched the ore into his bag', fetched, JSON.stringify(await bag(clubA)));
check('no bar while fetching', !barSeen);
check('his bubble says what he got', gotLine !== '', gotLine || JSON.stringify(await said()));
await shot('fetched');

// Give: half of it... all of a good goes; the other clubman is the taker.
await order({ kind: 'giveItem', player: 0, units: [clubA], res: COPPER_ORE, target: clubB });
let giveLines = [];
for (let k = 0; k < 120 && giveLines.length < 2; k++) {
  await page.waitForTimeout(500);
  giveLines = [...(await saidBy(clubA, /^Here, take \d+ copper ore\.$/)), ...(await saidBy(clubB, /^Got \d+ copper ore\.$/))];
}
const bBag = await bag(clubB);
check('Give hands the ore over with both bubbles', bBag.some(([r]) => r === COPPER_ORE) && giveLines.length === 2, `${JSON.stringify(giveLines)} taker bag ${JSON.stringify(bBag)}`);
await shot('give');

// Hand in by dragging it from the taker's inventory onto the stock.
const takerLog = [];
for (let k = 0; k < 6; k++) {
  takerLog.push(JSON.stringify(await bag(clubB)));
  await page.waitForTimeout(500);
}
console.log(`  taker's bag over 3 s: ${takerLog.join(' ')}; said ${JSON.stringify(await saidBy(clubB, /./))}`);
await select([clubB]);
await page.waitForTimeout(800);
const poolBefore = await page.evaluate((r) => window.shell.game.pool()[r], COPPER_ORE);
const slot0 = centre(await page.locator('.unit-inv .unit-slot[aria-label="Copper ore"]').first().boundingBox().catch(() => null));
const stockBox = centre(await page.evaluate(() => {
  const r = window.shell.layout.stockpile.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}));
const word2 = slot0 ? await drag(slot0, stockBox, 'handin-drag') : '';
if (!slot0) {
  await shot('handin-no-slot');
  await order({ kind: 'unloadItem', player: 0, units: [clubB], res: COPPER_ORE });
}
check('dragging a bag good onto the stock says hand in', word2 === 'Hand in at a store point', word2);
let handLine = '';
for (let k = 0; k < 240 && !handLine; k++) {
  await page.waitForTimeout(500);
  handLine = (await saidBy(clubB, /^Handed in .*copper ore\.$/))[0] ?? '';
}
const poolAfter = await page.evaluate((r) => window.shell.game.pool()[r], COPPER_ORE);
check('he hands it in and says so', handLine !== '' && poolAfter > poolBefore, `${handLine} stock ${poolBefore} to ${poolAfter}`);

// 4. Greyed Worker button once the stock has no sticks (its tool kit's cost): the clubmen and workers fetch sticks into their bags.
await order({ kind: 'fetchFood', player: 0, units: [...start.troops.slice(0, 2), ...start.workers], res: STICKS });
for (let k = 0; k < 240; k++) {
  if ((await page.evaluate((r) => window.shell.game.pool()[r], STICKS)) === 0) break;
  await page.waitForTimeout(500);
}
const hwNow = await page.evaluate((r) => window.shell.game.pool()[r], STICKS);
await page.evaluate(() => window.shell.selection.set([...window.world.buildings.selectables()].filter((s) => s.typeKey.startsWith('building:0:'))));
await page.waitForTimeout(1000);
const workerBtn = page.locator('.hud-btn[aria-label*="Worker"]').first();
const greyed = await workerBtn.evaluate((b) => b.classList.contains('disabled')).catch(() => null);
await workerBtn.hover().catch(() => {});
await page.waitForTimeout(700);
const reason = await page.locator('.tt-reason').first().textContent().catch(() => '');
await shot('worker-greyed');
check('with no sticks the Worker button is grey and says what is short', hwNow === 0 && greyed === true && /Short/.test(reason ?? ''), `sticks ${hwNow}, grey ${greyed}, "${reason}"`);
await page.mouse.move(640, 300);

// 5. Armour cap: a Fluted Gothic harness dragged onto a Champion.
const champ = await place(PLACE_TROOP, home.x + 6 * WU, home.z);
await order({ kind: 'debugGive', player: 0, res: GOTHIC, count: 1 });
await select([champ]);
let c = await unit(champ);
await look(c.x, c.z, 14);
await page.waitForTimeout(1200);
const harnessAt = await stockSlot('Fluted Gothic harness');
let champAt = null;
for (let k = 0; k < 40 && !champAt; k++) {
  champAt = await onScreen(champ);
  if (!champAt) await page.waitForTimeout(250);
}
console.log(`  champion ${champ} at ${JSON.stringify(champAt)}, harness slot ${JSON.stringify(harnessAt)}`);
if (harnessAt && champAt) await drag(harnessAt, champAt, 'harness-drag');
else await order({ kind: 'equip', player: 0, units: [champ], res: GOTHIC });
let worn = null;
for (let k = 0; k < 240; k++) {
  c = await unit(champ);
  if (c.armour === GOTHIC) {
    worn = c;
    break;
  }
  await page.waitForTimeout(500);
}
await select([champ]);
await page.waitForTimeout(800);
const panel = await page.locator('.selection-panel, .sel-panel, .unit-card').first().textContent().catch(() => '');
await shot('harness');
check('a Fluted Gothic harness goes on and shows 50%', worn !== null && /50%/.test(panel ?? ''), (panel ?? '').replace(/\s+/g, ' ').slice(0, 200));

// 6. Magic past a shield: a battle mage's bolts on a hobgoblin land in full.
const mx = home.x - 40 * WU;
const mage = await place(PLACE_BATTLE_MAGE, mx, home.z);
const hob = await place(PLACE_HOBGOBLIN, mx + 9 * WU, home.z);
await look(mx + 4 * WU, home.z, 18);
await order({ kind: 'attack', player: 0, units: [mage], target: hob });
const hits = [];
let last = (await unit(hob))?.hp ?? 0;
for (let k = 0; k < 120 && hits.length < 4; k++) {
  await page.waitForTimeout(250);
  const h = await unit(hob);
  if (!h) break;
  if (h.hp < last) hits.push(last - h.hp);
  last = h.hp;
}
await shot('mage-hobgoblin');
check('the mage’s bolts land in full on the shielded hobgoblin (16, rolls 3%)', hits.length > 0 && hits.every((d) => d >= 15 && d <= 17), JSON.stringify(hits));
await order({ kind: 'debugTool', player: 0, tool: 2, x: mx, z: home.z });

// 7. Attack pings.
const pings = () => page.evaluate(() => ({ minimap: window.__pings.length, ground: window.__rings }));
// a) A fight the player did not start, in view: one minimap ping and one ground ring, however long it goes on.
const p1 = await place(PLACE_TROOP, home.x + 60 * WU, home.z);
await look(home.x + 60 * WU, home.z, 18);
await page.waitForTimeout(1000);
await spawnRats(home.x + 64 * WU, home.z, 3);
await page.waitForTimeout(2500);
await shot('ping-in-view');
await page.waitForTimeout(8000);
const after1 = await pings();
check('a fight the player did not start pings once (minimap and ground)', after1.minimap === 1 && after1.ground === 1, JSON.stringify(after1));
// b) A second fight far off, out of view: one more minimap ping, no ground ring.
const p2 = await place(PLACE_TROOP, home.x, home.z + 70 * WU);
await page.waitForTimeout(500);
await spawnRats(home.x + 3 * WU, home.z + 70 * WU, 2);
await page.waitForTimeout(9000);
const after2 = await pings();
check('a second fight far off pings the minimap once more, not the ground', after2.minimap === 2 && after2.ground === 1, JSON.stringify(after2));
await shot('ping-minimap');
// c) A fight the player starts with Attack: no ping.
const p3 = await place(PLACE_TROOP, home.x - 70 * WU, home.z + 70 * WU);
await page.waitForTimeout(500);
const rats3 = await spawnRats(home.x - 64 * WU, home.z + 70 * WU, 1);
await order({ kind: 'attack', player: 0, units: [p3], target: rats3[0] });
await page.waitForTimeout(9000);
const after3 = await pings();
check('an ordered attack does not ping', after3.minimap === 2, JSON.stringify(after3));
void p1;
void p2;

// 9. A grown pine side on (look at the picture: the green starts just above a worker's head).
const pine = await page.evaluate(([hx, hz]) => {
  let best = null;
  for (const c of window.world.chunks.values()) {
    for (const p of c.props ?? []) {
      if (p.typeKey !== 'node:pine') continue;
      const d = Math.hypot(p.centre.x - hx, p.centre.z - hz);
      if (!best || d < best.d) best = { d, x: p.centre.x, z: p.centre.z };
    }
  }
  return best;
}, [home.x / WU, home.z / WU]);
check('a pine near the start to look at', pine !== null, pine ? `${Math.round(pine.d)} m away` : '');
if (pine) await look(pine.x * WU, (pine.z + 3) * WU, 9);
await page.waitForTimeout(2500);
await shot('pine');

console.log('\n' + results.join('\n'));
if (problems.length) console.log(`console problems:\n${problems.slice(0, 10).join('\n')}`);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
