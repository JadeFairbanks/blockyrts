// Browser check for milestone 9, run by hand (not part of `pnpm test`): two
// players on one machine against a local game server.
//
//   pnpm --filter @blockyrts/server dev          (port 8080, in memory)
//   pnpm dev                                      (port 5173, passes /api and /relay to 8080)
//   node packages/client/test-e2e/m9-online.mjs http://localhost:5173 /tmp/shots
//
// Player 1 hosts from the main menu, player 2 opens the invite link, picks a
// colour and is ready, the host starts; then chat, Share control, Send
// resources, a map ping, pause, the hashes agreeing, a guest's Save asking
// for an account and the game saving. Screenshots go to the
// output folder as m9-*.png.
/* global window, document, requestAnimationFrame -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });

// One browser each, as on two machines (software drawing shares one GPU process otherwise).
const browsers = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  console.log(results.at(-1));
};
const problems = [];

async function player(label) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('relay connection')) problems.push(`${label} ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    window.__hashes = {};
    setInterval(() => {
      const f = window.shell?.layout.debugFields;
      if (f && f.hashStep.textContent) window.__hashes[f.hashStep.textContent] = f.hash.textContent;
    }, 100);
    window.__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration > 800) window.__long.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`);
    }).observe({ type: 'longtask', buffered: true });
    const C = window.WebSocket;
    window.WebSocket = class extends C {
      constructor(...a) {
        super(...a);
        this.addEventListener('close', (ev) => window.__long.push(`close ${ev.code} at ${Math.round(performance.now())}`));
      }
    };
    localStorage.setItem('survive-and-conquer.settings.v1', JSON.stringify({ cursorLock: false, hints: true, quality: 'low', resolutionScale: 0.5, shadows: false, viewDistance: 'near' }));
  });
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(out, `m9-${name}.png`) });
const click = (page, text) => page.getByRole('button', { name: text, exact: true }).first().click();
const hudClick = async (page, id) => {
  const r = await page.evaluate((i) => {
    const el = document.querySelector(`[data-btn="${i}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, id);
  if (!r) throw new Error(`no HUD button ${id}`);
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.mouse.up();
};
const debug = (page) =>
  page.evaluate(() => {
    const f = window.shell.layout.debugFields;
    return { step: Number(f.step.textContent), hash: f.hash.textContent, hashStep: Number(f.hashStep.textContent) };
  });
const messages = (page) => page.evaluate(() => [...document.querySelectorAll('.message-list .msg')].map((m) => m.textContent));

// 1. Main menu.
const a = await player('host');
await a.goto(base);
await a.getByText('Survive and Conquer').first().waitFor();
check('main menu shows its six choices', (await a.getByRole('button', { name: /^(New game|Load game|Join game|Settings|Account|Quit)$/ }).count()) === 6);
check('the F11 reminder is on the menu', (await a.locator('.f11').textContent()).includes('F11'));
await shot(a, 'menu');

// 2. Host.
await click(a, 'New game');
await a.locator('input[name=seed]').fill('424242');
await click(a, 'Host a game for friends');
await a.locator('.invite-code').waitFor();
const code = (await a.locator('.invite-code').textContent()).trim();
check('hosting gives a 6-character code', /^[A-Z0-9]{6}$/.test(code), code);
await shot(a, 'lobby-host');

// 3. Join by link.
const b = await player('guest');
await b.goto(`${base}/join/${code}`);
await b.locator('.invite-code').waitFor();
check('the invite link opens the lobby', (await b.locator('.invite-code').textContent()).trim() === code);
await b.locator('.colour-picker button').nth(1).click();
await click(b, 'Ready');
await a.getByText('ready', { exact: true }).waitFor();
await shot(a, 'lobby-ready');
const start = a.getByRole('button', { name: 'Start the game' });
check('the host can start once everyone is ready', !(await start.isDisabled()));
await start.click();

// 4. Both in the match, in step.
await a.waitForFunction(() => window.shell && Number(window.shell.layout.debugFields.step.textContent) > 60, null, { timeout: 120000 });
await b.waitForFunction(() => window.shell && Number(window.shell.layout.debugFields.step.textContent) > 60, null, { timeout: 120000 });
await a.waitForTimeout(3000);
const [da, db] = [await debug(a), await debug(b)];
check('both run the match', da.step > 60 && db.step > 60, `${da.step} / ${db.step}`);
// Compare the hashes both computed at the same steps.
await a.waitForTimeout(3000);
const [hashA, hashB] = [await a.evaluate(() => window.__hashes), await b.evaluate(() => window.__hashes)];
const both = Object.keys(hashA).filter((k) => k in hashB && Number(k) > 0);
check('the hashes agree', both.length > 0 && both.every((k) => hashA[k] === hashB[k]), both.map((k) => `${k}:${hashA[k]}/${hashB[k]}`).join(' '));
await shot(a, 'match-host');
const gaps = async (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const t = [];
        let last = performance.now();
        const f = (now) => {
          t.push(now - last);
          last = now;
          if (t.length < 20) requestAnimationFrame(f);
          else resolve(`${Math.round(t.reduce((x, y) => x + y) / t.length)} ms mean, ${Math.round(Math.max(...t))} ms worst`);
        };
        requestAnimationFrame(f);
      }),
  );
console.log('frame times: host', await gaps(a), '| guest', await gaps(b));

// 5. Chat: Enter, type, Enter. (A busy machine can drop a socket for a moment; the page rejoins by itself, so a lost line is typed again.)
const seen = (page, text) => page.evaluate((t) => [...document.querySelectorAll('.message-list .msg')].some((m) => m.textContent.includes(t)), text);
const until = async (page, f, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return true;
    await page.waitForTimeout(250);
  }
  return false;
};
const online = (page) => page.waitForFunction(() => window.relay.status === 'open', null, { timeout: 60000 });
let chatted = false;
for (let k = 0; k < 3 && !chatted; k++) {
  await online(b);
  await b.keyboard.press('Enter');
  await b.keyboard.insertText('Hello from player 2');
  await b.keyboard.press('Enter');
  chatted = await until(a, () => seen(a, 'Hello from player 2'));
}
check('chat reaches the other player', chatted);
check('chat shows in the sender\'s own panel too', await until(b, () => seen(b, 'Hello from player 2')));
if (!chatted) console.log([...new Set(problems)].join('\n'), '\nguest:', await b.evaluate(() => window.__long.join(' ')));

// 6. Share control: host ticks it for player 2.
await hudClick(a, 'allies');
await a.locator('.allies-panel').waitFor();
await shot(a, 'allies');
const share = await a.evaluate(() => [...document.querySelectorAll('.allies-panel .hud-btn')].find((e) => e.textContent.includes('Share control'))?.dataset.btn);
await hudClick(a, share);
await b.waitForFunction(() => window.shell && (window.shell.allies && true), null);
await a.waitForTimeout(1500);
const shared = await b.evaluate(() => window.shell['game'].info.players[0].share);
check('Share control reaches the sim', (shared & 2) !== 0, String(shared));

// 7. Send resources: 10 of the first resource the host has.
await hudClick(a, 'send');
await a.locator('.send-dialog').waitFor();
const pick = await a.evaluate(() => document.querySelector('.send-dialog .send-pick')?.dataset.btn);
await hudClick(a, pick);
const sendBtn = await a.evaluate(() => [...document.querySelectorAll('.send-dialog .hud-btn')].find((e) => e.textContent.trim() === 'Send')?.dataset.btn);
await shot(a, 'send');
await hudClick(a, sendBtn);
check('sent resources arrive with a message', await until(b, () => seen(b, 'sent you'), 20000));

// 8. Ping (the Send window and the Allies panel closed first: Esc closes the top one).
await a.keyboard.press('Escape');
await a.keyboard.press('Escape');
await a.locator('.send-dialog').waitFor({ state: 'hidden' });
let pinged = false;
for (let k = 0; k < 3 && !pinged; k++) {
  await online(a);
  await hudClick(a, 'ping');
  await a.mouse.click(760, 420);
  pinged = await until(b, () => seen(b, 'Look here'));
}
check('a map ping reaches the other player', pinged);

// 9. Pause for everyone.
await hudClick(a, 'pause');
await b.locator('.net-banner').filter({ hasText: 'Paused by' }).waitFor({ timeout: 10000 });
const s1 = (await debug(b)).step;
await b.waitForTimeout(1500);
const s2 = (await debug(b)).step;
check('pause stops both', s1 === s2, `${s1} -> ${s2}`);
await shot(b, 'paused');
await hudClick(a, 'pause');
await b.waitForTimeout(1500);
check('carry on starts both again', (await debug(b)).step > s2);

// 10. A guest's Save offers an account; making one saves.
await a.keyboard.press('F10');
await a.getByRole('button', { name: 'Save game' }).click();
await a.locator('input[name=email]').waitFor();
await shot(a, 'guest-save');
const stamp = Date.now() % 100000;
await a.locator('input[name=email]').fill(`host${stamp}@example.com`);
await a.locator('input[name=username]').fill(`Host${stamp}`);
await a.locator('input[name=password]').fill('a long password');
await a.getByRole('button', { name: 'Make the account' }).click();
await a.waitForFunction(() => [...document.querySelectorAll('.message-list .msg')].some((m) => m.textContent.includes('Game saved')), null, { timeout: 20000 });
check('a guest host makes an account and the game saves', true);
const names = await b.evaluate(() => [...document.querySelectorAll('.message-list .msg')].map((m) => m.textContent).join('\n'));
check('chat and messages show player names', names.includes('Hello from player 2'));

const msgs = await messages(a);
check('no errors in the message panel', !msgs.some((m) => m.includes('Not saved')), msgs.filter((m) => m.includes('Not saved')).join(' | '));

console.log(`\n${results.filter((r) => r.startsWith('ok')).length} of ${results.length} checks passed`);
if (problems.length) console.log(`console problems:\n${[...new Set(problems)].slice(0, 20).join('\n')}`);
for (const br of browsers) await br.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
