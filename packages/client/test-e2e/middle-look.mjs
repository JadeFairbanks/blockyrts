// Browser look at the middle of the bottom strip (Patch 3: the title row's
// HP and XP bars, the queue under it, the content filling the section), run
// by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/middle-look.mjs http://localhost:5198 /tmp/shots
//
// Selects nothing, a worker, a warrior, a mage, a Big House and a Barracks
// with their queues, several units and an animal, at a desktop, laptop,
// small and phone screen, and saves middle-<screen>-<what>.png of the middle
// (a whole-screen shot too for each screen). Prints what it checked.
/* global window, document */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
const only = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });

const SCREENS = [
  ['1920x1080', 1920, 1080],
  ['1280x720', 1280, 720],
  ['1024x768', 1024, 768],
  ['phone', 844, 390],
].filter(([n]) => !only || only.split(',').includes(n));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);

for (const [label, width, height] of SCREENS) {
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`error: ${m.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false, tips: false }));
  });
  await page.goto(`${base}/?seed=1`);
  await page.waitForFunction(() => window.shell && window.shell.game.info, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const phone = label === 'phone';
  // A phone shows the selection unfolded at the start; unfold it if not.
  if (phone) await page.evaluate(() => document.querySelector('.selection-panel').hidden && window.shell.buttons.get('fold-info')?.def.onPress?.({ shift: false, ctrl: false }));
  const press = (id) => page.evaluate((b) => window.shell.buttons.get(b)?.def.onPress?.({ shift: false, ctrl: false }), id);
  for (const id of ['dbg-troops', 'dbg-sanctum', 'dbg-magekit', 'dbg-barn']) await press(id);
  await page.waitForTimeout(1500);
  // A support mage at the Sanctum and a cavalryman at the Barracks, trained at 16 times speed: the title rows with three bars.
  await page.evaluate(() => {
    const s = window.shell;
    for (const v of s.game.buildings.values()) {
      if (v.owner !== 0) continue;
      if (v.name.startsWith('Magi Sanctum')) s.commands.trainCard([v.id], 6, 1);
      if (v.name.startsWith('Barracks')) s.commands.trainCard([v.id], 5, 1);
    }
  });
  await press('dbg-speed');
  await press('dbg-speed');
  await page
    .waitForFunction(() => {
      const g = window.shell.game;
      const us = g.unitIds().map((id) => g.unit(id)).filter((u) => u.owner === 0);
      return us.some((u) => u.kind === 2) && us.some((u) => u.mount > 0);
    }, null, { timeout: 60000 })
    .catch(() => undefined);
  await press('dbg-speed');

  const shotMiddle = async (what) => {
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const el = document.querySelector('.selection-panel');
      if (!el || el.hidden) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height };
    });
    if (!r) {
      check(`${label} ${what}: the middle is shown`, false);
      return;
    }
    await page.screenshot({ path: join(out, `middle-${label}-${what}.png`), clip: { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(width, r.width + 8), height: Math.min(height, r.height + 8) } });
    // Nothing in the middle may spill past its frame (the content fills it, it does not overflow it).
    const spill = await page.evaluate(() => {
      const panel = document.querySelector('.selection-panel').getBoundingClientRect();
      const bad = [];
      for (const el of document.querySelectorAll('.selection-panel .hud-btn, .selection-panel .sel-row, .selection-panel .sel-title')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (el.closest('.kit-cards') && el.closest('.kit-cards').scrollWidth > el.closest('.kit-cards').clientWidth) continue;
        if (b.right > panel.right + 1 || b.bottom > panel.bottom + 1 || b.left < panel.left - 1 || b.top < panel.top - 1) bad.push(`${el.className} ${Math.round(b.right - panel.right)},${Math.round(b.bottom - panel.bottom)}`);
      }
      return bad;
    });
    check(`${label} ${what}: nothing spills past the middle's frame`, spill.length === 0, spill.slice(0, 3).join('; '));
  };

  const select = (pick) =>
    page.evaluate((p) => {
      const s = window.shell;
      const all = [...s.world.selectables.candidates()];
      const g = s.game;
      let list = [];
      if (p === 'worker' || p === 'warrior' || p === 'mage') list = all.filter((t) => t.kind === 'unit' && t.owner === 0 && t.typeKey.startsWith(p === 'mage' ? 'mage:' : p) && t.typeKey !== 'warrior:crew').slice(0, 1);
      else if (p === 'cavalry') list = all.filter((t) => t.kind === 'unit' && t.owner === 0 && g.unit(Number(t.key.slice(2)))?.mount > 0).slice(0, 1);
      else if (p === 'bighouse') list = all.filter((t) => t.kind === 'building' && t.owner === 0 && g.buildings.get(Number(t.key.slice(2)))?.kind === 0).slice(0, 1);
      else if (p === 'barracks') list = all.filter((t) => t.kind === 'building' && t.owner === 0 && /^Barracks/.test(t.label)).slice(0, 1);
      else if (p === 'several') list = all.filter((t) => t.kind === 'unit' && t.owner === 0).slice(0, 12);
      else if (p === 'animal') list = all.filter((t) => t.kind === 'unit' && t.owner !== 0 && t.typeKey.startsWith('animal')).slice(0, 1);
      s.selection.set(list);
      if (list[0]) s.cam.jumpTo(list[0].centre.x, list[0].centre.z);
      return list.map((t) => t.label).join(', ');
    }, pick);

  const trainAll = (action, n) =>
    page.evaluate(
      ([a, k]) => {
        const s = window.shell;
        for (let i = 0; i < k; i++) {
          const e = s.commands.card().find((c) => c && c.action === a);
          e?.run?.({ shift: false, ctrl: false });
        }
      },
      [action, n],
    );

  await select('');
  await shotMiddle('nothing');
  check(`${label} worker selected`, (await select('worker')) !== '');
  await shotMiddle('worker');
  const bars = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    return { hp: q('.sel-bar.hp'), xp: q('.sel-bar.xp'), title: q('.sel-title'), clear: q('.hud-btn.clear'), badge: q('.hud-btn.chip.badge') };
  });
  check(`${label} worker: no rank badge after the name`, bars.badge === null);
  if (bars.hp && bars.clear) check(`${label} worker: the HP bar runs to the clear button`, Math.abs(bars.clear.left - bars.hp.right) < 12, `${Math.round(bars.clear.left - bars.hp.right)} px short`);
  if (bars.hp && bars.xp) check(`${label} worker: HP and XP bars are as long and as tall as each other`, Math.abs(bars.hp.width - bars.xp.width) < 1 && Math.abs(bars.hp.height - bars.xp.height) < 1, `${bars.hp.width}x${bars.hp.height} ${bars.xp.width}x${bars.xp.height}`);
  check(`${label} warrior selected`, (await select('warrior')) !== '');
  await shotMiddle('warrior');
  // The XP bar's tooltip: the rank now, the points and the next rank.
  if (!phone) {
    const xp = await page.evaluate(() => {
      const b = document.querySelector('.sel-bar.xp')?.getBoundingClientRect();
      return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
    });
    if (xp) {
      await page.mouse.move(xp.x, xp.y);
      await page.waitForTimeout(900);
      const tip = await page.evaluate(() => document.querySelector('#tooltip')?.textContent ?? '');
      check(`${label} warrior: the XP bar's tooltip gives the points and the next rank`, /Recruit: \d+ of 50 XP to Soldier\./.test(tip), tip);
      await page.mouse.move(5, 5);
    }
  }
  if ((await select('mage')) !== '') await shotMiddle('mage');
  else check(`${label} a mage trained`, false);
  if ((await select('cavalry')) !== '') await shotMiddle('cavalry');
  else check(`${label} a cavalryman trained`, false);
  check(`${label} Big House selected`, (await select('bighouse')) !== '');
  await trainAll('trainWorker', 4);
  await shotMiddle('bighouse');
  check(`${label} Barracks selected`, (await select('barracks')) !== '');
  await page.evaluate(() => {
    const s = window.shell;
    const b = s.commands.buildings()[0];
    if (b) for (let i = 0; i < 4; i++) s.commands.trainCard([b.id], 1 + (i % 3), 1);
  });
  await shotMiddle('barracks');
  // A card's weapon slot opens the tier strip just above the middle, pointing at the slot.
  await page.evaluate(() => window.shell.buttons.get('card-1-w')?.def.onPress?.({ shift: false, ctrl: false }));
  await page.waitForTimeout(600);
  const strip = await page.evaluate(() => {
    const t = document.querySelector('.tier-strip');
    const p = document.querySelector('.selection-panel');
    if (!t || t.hidden) return null;
    return { bottom: t.getBoundingClientRect().bottom, top: p.getBoundingClientRect().top };
  });
  check(`${label} barracks: the tier strip opens just above the middle`, strip !== null && strip.bottom <= strip.top && strip.top - strip.bottom < 16, JSON.stringify(strip));
  await page.screenshot({ path: join(out, `middle-${label}-strip.png`) });
  await page.keyboard.press('Escape');
  check(`${label} several selected`, (await select('several')) !== '');
  await shotMiddle('several');
  if ((await select('animal')) !== '') await shotMiddle('animal');
  await page.screenshot({ path: join(out, `middle-${label}-screen.png`) });
  check(`${label}: no page errors`, problems.length === 0, problems.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
console.log(results.join('\n'));
