// Takes the screenshots of the game that How to Play and the patch notes
// show (QV-8: the quest menu and a leader's offer, and a picture for every
// guide): a dev build of the game in Chromium, set up with the dev build's
// debugger buttons, captured and saved as JPEG under
// packages/assets/src/shots/<name>.jpg. Run by hand, not part of `pnpm test`:
//
//   pnpm --filter @blockyrts/tools models:build      (once: the model catalogue)
//   pnpm --filter @blockyrts/client shots [name ...]
//
// Software drawing is slow: each shot takes a minute or so.
//
// Screenshots are only for the guides and the patch notes: a page about a
// thing shows its kit icon or draws its model (how-to-play/model-view.ts),
// and nothing gets a picture made for it. When an update changes something
// so that a screenshot no longer shows the game as it is, remove the
// screenshot (and its entry here) rather than retaking it, and point the
// guide at the thing's model ("model:<id>") or kit picture instead.
/* global window, document */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '../assets/src/shots');

const wait = (page, ms) => page.waitForTimeout(ms);
const press = (page, id) => page.evaluate((b) => window.shell.buttons.get(b)?.def.onPress?.({ shift: false, ctrl: false }), id);
/** Moves the camera: a point in metres, a distance and a turn (radians), or what is not given stays. */
const look = (page, v) =>
  page.evaluate((v) => {
    const c = window.shell.cam;
    const x = v.x ?? c.focus.x + (v.dx ?? 0);
    const z = v.z ?? c.focus.z + (v.dz ?? 0);
    c.setView({ x, z, distance: v.distance ?? c.view().distance });
    if (v.yaw !== undefined) c.yaw = v.yaw;
  }, v);
/** The newest-met people's leader, metres, or null. */
const leader = (page) =>
  page.evaluate(() => {
    const g = window.shell.game;
    const f = [...(g.info?.peoples ?? [])].filter((p) => p.leader).at(-1);
    const u = f ? g.unit(f.leader) : null;
    return u ? { x: u.x / 8000, z: u.z / 8000 } : null;
  });
/** Sends an order through the game, as a click would. */
const order = (page, o) => page.evaluate((o) => window.shell.opts.issueOrder(o), o);
/** Walks the player's troops (or `kind` units) to a point in metres and waits until the first is within `near` metres. */
async function bring(page, at, near = 8, kind = 1) {
  const ids = await page.evaluate((k) => {
    const g = window.shell.game;
    return g.unitIds().filter((id) => g.unit(id)?.owner === 0 && g.unit(id)?.kind === k);
  }, kind);
  await order(page, { kind: 'move', player: 0, units: ids, x: Math.round(at.x * 8000), z: Math.round(at.z * 8000) });
  await page.waitForFunction(
    ([ids, x, z, near]) => ids.some((id) => {
      const u = window.shell.game.unit(id);
      return u && Math.hypot(u.x / 8000 - x, u.z / 8000 - z) < near;
    }),
    [ids, at.x, at.z, near],
    { timeout: 90_000 },
  );
}
/** Keeps the camera on the newest leader until its question bubble shows (he wanders, in and out of houses). */
async function followLeader(page, distance) {
  for (let i = 0; i < 180; i++) {
    const at = await leader(page);
    if (at) await look(page, { x: at.x, z: at.z - 1, distance });
    await wait(page, 500);
    if (await page.locator('.bubble.question.mine:not([hidden])').count()) {
      await wait(page, 400);
      return;
    }
  }
  throw new Error('the leader never showed his question');
}
/** A clip of the window centred on an element, w x h px, kept inside the window. */
async function clipAround(page, selector, w, h, above = 0.25) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) return null;
  const x = Math.max(0, Math.min(1280 - w, b.x + b.width / 2 - w / 2));
  const y = Math.max(0, Math.min(720 - h, b.y - h * above));
  return { x, y, width: w, height: h };
}
/** Waits until no model has finished loading for `quietMs` (a model not loaded yet is drawn as a block, or not at all). */
async function settleModels(page, quietMs = 6000, maxMs = 150_000) {
  const started = Date.now();
  let last = -1;
  let since = Date.now();
  while (Date.now() - started < maxMs) {
    const n = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('.glb')).length);
    if (n !== last) {
      last = n;
      since = Date.now();
    } else if (Date.now() - since > quietMs) break;
    await wait(page, 500);
  }
  await wait(page, 2000);
}
async function newGame(page, base, seed) {
  await page.goto(`${base}?seed=${seed}`);
  await page.waitForFunction(() => window.shell && window.shell.game.info, null, { timeout: 120_000 });
  await wait(page, 2500);
}

/** The shots: name, what it shows, and how to set it up. Each returns the clip to save, or null for the whole window. */
/** The player's main base, metres. */
const base0 = (page) =>
  page.evaluate(() => {
    const b = [...window.shell.world.selectables.candidates()].find((t) => t.typeKey.startsWith('building:0:') && t.owner === 0);
    return b ? { x: b.centre.x, z: b.centre.z } : { x: window.shell.cam.focus.x, z: window.shell.cam.focus.z };
  });
/** Answers No to the starting units' questions and lets the main base's advice fade, so the picture is clear of bubbles. */
async function settle(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.bubble.question.mine .yes-no-btn.no')) window.shell.buttons.get(el.dataset.btn)?.def.onPress?.({ shift: false, ctrl: false });
  });
  await wait(page, 16_000);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.bubble.question.mine .yes-no-btn.no')) window.shell.buttons.get(el.dataset.btn)?.def.onPress?.({ shift: false, ctrl: false });
  });
}
/** A Halfling village found 34 m from the main base, on revealed land. */
async function village(page) {
  await look(page, { dx: 34, dz: 10, distance: 26 });
  await press(page, 'dbg-reveal');
  await wait(page, 800);
  await press(page, 'dbg-villages');
}

const SHOTS = [
  {
    name: 'shot_quest_offer',
    about: "A Halfling village elder's quest offer, with its Yes and No.",
    async stage(page) {
      await village(page);
      await page.waitForFunction(() => (window.shell.game.info?.peoples ?? []).some((p) => p.leader), null, { timeout: 60_000 });
      await followLeader(page, 14);
      return clipAround(page, '.bubble.question.mine:not([hidden])', 720, 320, 0.2);
    },
  },
  {
    name: 'shot_quest_menu',
    about: 'The quest menu open, with two quests taken.',
    async stage(page) {
      // Two peoples' quests taken: the Halflings' and a Dwarf colony's.
      for (const [what, dx] of [[0, 34], [4, -68]]) {
        await look(page, { dx, dz: what === 0 ? 10 : 0 });
        await press(page, 'dbg-reveal');
        await wait(page, 800);
        const f = await page.evaluate(() => window.shell.cam.focus);
        await order(page, { kind: 'debugPeoples', player: 0, what, x: Math.round(f.x * 8000), z: Math.round(f.z * 8000) });
        await page.waitForFunction((n) => (window.shell.game.info?.peoples ?? []).filter((p) => p.leader).length >= n, what === 0 ? 1 : 2, { timeout: 60_000 });
        const at = await leader(page);
        await bring(page, at, 8);
        await followLeader(page, 18);
        // Yes, pressed as a click on it would (the bubble moves with the elder, so no real click).
        await page.evaluate(() => {
          const id = document.querySelector('.bubble.question.mine:not([hidden]) .yes-no-btn.yes')?.dataset.btn;
          window.shell.buttons.get(id)?.def.onPress?.({ shift: false, ctrl: false });
        });
        await wait(page, 2500);
      }
      await press(page, 'quests-open');
      await wait(page, 2000);
      const b = await page.locator('.quests-panel').boundingBox();
      if (!b) return null;
      const x = Math.max(0, b.x - 20);
      const y = Math.max(0, b.y - 80);
      return { x, y, width: Math.min(1280 - x, b.width + 300), height: Math.min(720 - y, b.height + 120) };
    },
  },
  {
    name: 'shot_start',
    about: 'The start of a game: the Big House, four workers and three warriors.',
    async stage(page) {
      await settle(page);
      const b = await base0(page);
      await look(page, { x: b.x, z: b.z + 3, distance: 26, yaw: 0.45 });
      await wait(page, 3000);
      return null;
    },
  },
  {
    name: 'shot_citadel',
    about: 'A main base at its top tier, the Citadel, with its engine platform.',
    async stage(page) {
      await press(page, 'dbg-citadel');
      await settle(page);
      const b = await base0(page);
      await look(page, { x: b.x, z: b.z + 2, distance: 40, yaw: 0.45 });
      await wait(page, 6000);
      return null;
    },
  },
  {
    name: 'shot_barracks',
    about: "A Barracks selected, with the troop panel's four troops and their kits.",
    async stage(page) {
      await press(page, 'dbg-troops');
      await press(page, 'dbg-citadel');
      await settle(page);
      await page.evaluate(() => {
        const s = window.shell;
        const b = [...s.world.selectables.candidates()].find((t) => t.typeKey.startsWith('building:8:') && t.owner === 0);
        if (!b) return;
        s.cam.setView({ x: b.centre.x, z: b.centre.z + 2, distance: 24 });
        s.selection.set([b]);
      });
      await wait(page, 5000);
      return null;
    },
  },
  {
    name: 'shot_unit_card',
    about: "A warrior selected: his card's numbers, gear and orders.",
    async stage(page) {
      await settle(page);
      await page.evaluate(() => {
        const s = window.shell;
        const u = [...s.world.selectables.candidates()].find((t) => t.key.startsWith('e:') && t.owner === 0 && s.game.unit(Number(t.key.slice(2)))?.kind === 1);
        if (!u) return;
        s.cam.setView({ x: u.centre.x, z: u.centre.z - 3, distance: 12 });
        s.selection.set([u]);
      });
      await wait(page, 4000);
      return { x: 352, y: 474, width: 928, height: 246 };
    },
  },
  {
    name: 'shot_siege',
    about: 'A catapult, a ballista and a bronze cannon with their crews.',
    async stage(page) {
      await settle(page);
      const b = await base0(page);
      await look(page, { x: b.x + 24, z: b.z + 10 });
      await press(page, 'dbg-siege');
      await wait(page, 2000);
      await look(page, { x: b.x + 24, z: b.z + 8, distance: 22, yaw: Math.PI + 0.45 });
      await settleModels(page);
      return null;
    },
  },
  {
    name: 'shot_barn',
    about: 'A Barn with its animals.',
    async stage(page) {
      await settle(page);
      const b = await base0(page);
      await look(page, { x: b.x - 22, z: b.z + 8 });
      await press(page, 'dbg-barn');
      await wait(page, 2000);
      await look(page, { x: b.x - 22, z: b.z + 10, distance: 20, yaw: 0.45 });
      await wait(page, 12_000);
      return null;
    },
  },
];

const wanted = process.argv.slice(2);
const shots = SHOTS.filter((s) => wanted.length === 0 || wanted.includes(s.name));
if (shots.length === 0) {
  console.error(`No such shot. Shots: ${SHOTS.map((s) => s.name).join(', ')}`);
  process.exit(1);
}
if (!existsSync(join(root, 'public/models/index.json'))) {
  console.error('The model catalogue is not built. Run: pnpm --filter @blockyrts/tools models:build');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, logLevel: 'warn', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const s of shots) {
    const started = performance.now();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error(`${s.name}: ${e.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false }));
      // Every model fetched is counted (settleModels), not only the first 250.
      performance.setResourceTimingBufferSize(100_000);
    });
    await newGame(page, base, s.seed ?? 3);
    // No cursor and no tips over the picture.
    await page.addStyleTag({ content: '#cursor, .tip-box { display: none !important; }' });
    // The pointer rests on the portrait's frame, so no tooltip or highlight shows.
    await page.mouse.move(882, 712);
    const clip = await s.stage(page).catch(async (e) => {
      await page.screenshot({ path: join(outDir, `failed-${s.name}.png`) });
      throw e;
    });
    const bytes = await page.screenshot({ type: 'jpeg', quality: 82, timeout: 180_000, ...(clip ? { clip } : {}) });
    writeFileSync(join(outDir, `${s.name}.jpg`), bytes);
    console.log(`${s.name}: ${Math.round(bytes.length / 1024)} KB, ${Math.round((performance.now() - started) / 1000)} s`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
