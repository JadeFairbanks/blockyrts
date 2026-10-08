// Browser look at How to Play and the patch notes (Patch 5), run by hand (not part of `pnpm test`):
//
//   pnpm --filter @blockyrts/client exec vite --port 5198
//   node packages/client/test-e2e/how-to-play-look.mjs http://localhost:5198 /tmp/shots
//
// Opens the main menu (the Patch notes row with its "New update" mark), How
// to Play's front page, the Zombie and Big House pages, a search for "bone",
// the premise guide and a section page; follows a link and comes back with
// the browser's Back button; returns to the menu; then opens the patch
// notes, and How to Play once more in a phone-sized window. Saves
// how-to-play-*.png and prints what it checked.
/* global document, location -- used inside page.evaluate callbacks */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const base = process.argv[2] ?? 'http://localhost:5198';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION|api\//.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
const shot = (name) => page.screenshot({ path: join(out, `how-to-play-${name}.png`) });
const wait = (ms = 400) => page.waitForTimeout(ms);

await page.goto(base);
await page.waitForSelector('.main-menu button');
await wait(800);
check('menu shows the newest update', (await page.textContent('.update-mark'))?.startsWith('New update: Patch '));
check('the mark is bright until the notes are read', await page.$eval('.update-mark', (e) => e.classList.contains('unread')));
await shot('menu');

await page.click('text=How to play');
await page.waitForSelector('.book .hero');
await wait(600);
check('front page opens at #how-to-play', (await page.evaluate(() => location.hash)) === '#how-to-play');
check('sidebar lists sections', (await page.$$('.side-section')).length >= 10);
await shot('front');

await page.evaluate(() => (location.hash = '#how-to-play/monsters/zombie'));
await page.waitForSelector('.book-page .tiles');
await wait();
check('the Zombie page has tiles', (await page.$$('.tile')).length >= 3);
await shot('zombie');

await page.evaluate(() => (location.hash = '#how-to-play/buildings/big-house'));
await page.waitForSelector('.book-page .page-head');
await wait();
await shot('big-house');
await page.evaluate(() => document.querySelector('.book-main').scrollTo(0, 900));
await wait();
await shot('big-house-levels');

await page.fill('.book-search input', 'bone');
await wait();
const found = await page.$$eval('.side-list .side-link span', (s) => s.map((x) => x.textContent));
check('a search for bone finds the Zombie', found.includes('Zombie'), found.slice(0, 6).join(', '));
await page.press('.book-search input', 'Enter');
await wait();
check('Enter opens the first result', (await page.textContent('.book-page h1')) === 'Bone', await page.textContent('.book-page h1'));
await shot('bone');
await page.fill('.book-search input', '');

await page.evaluate(() => (location.hash = '#how-to-play/guides/premise'));
await wait();
await shot('premise');
await page.evaluate(() => (location.hash = '#how-to-play/section/monsters'));
await wait();
await shot('section-monsters');
await page.click('.cards.small .card >> nth=3');
await wait();
const opened = await page.textContent('.book-page h1');
await page.goBack();
await wait();
check('Back returns to the section page', (await page.textContent('.book-page h1')) === 'Monsters', `opened ${opened}`);

await page.click('.book-back');
await wait();
check('Return goes back to the menu', (await page.$('.book')) === null && (await page.$('.main-menu button')) !== null);

await page.click('.update-row button');
await page.waitForSelector('.book .patch');
await wait();
await shot('patch-notes');
await page.click('.book-back');
await wait();
check('the mark dims once the notes are read', !(await page.$eval('.update-mark', (e) => e.classList.contains('unread'))));

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => (location.hash = '#how-to-play/monsters/zombie'));
await page.reload();
await page.waitForSelector('.book-page .tiles');
await wait(600);
check('a link opens How to Play straight from outside the game', (await page.textContent('.book-page h1')) === 'Zombie');
await shot('phone');

console.log(results.join('\n'));
if (problems.length) console.log(`problems:\n${problems.join('\n')}`);
await browser.close();
