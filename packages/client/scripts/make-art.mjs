// Renders the pictures for the screens outside the match: the main menu's
// battle at the camp and the lobby's view of a generated world. Each is
// staged in the game's own renderer with the game's models and world
// generation (art.html and src/art/), rendered at twice the size in Chromium
// and saved as WebP under src/ui/art/.
//
//   pnpm --filter @blockyrts/tools models:build      (once: the model catalogue)
//   pnpm --filter @blockyrts/client art [battle] [map]
//
// Software drawing is slow: the battle takes about a minute and the map a few.
/* global window */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The pictures: scene, size, and where they go. */
const PICTURES = [
  { scene: 'battle', width: 2560, height: 1440, quality: 0.84, out: 'src/ui/art/menu-battle.webp' },
  { scene: 'map', width: 2560, height: 1440, quality: 0.74, out: 'src/ui/art/lobby-map.webp' },
];

const wanted = process.argv.slice(2);
const pictures = PICTURES.filter((p) => wanted.length === 0 || wanted.includes(p.scene));
if (pictures.length === 0) {
  console.error(`No such picture. Pictures: ${PICTURES.map((p) => p.scene).join(', ')}`);
  process.exit(1);
}
if (!existsSync(join(root, 'public/models/index.json'))) {
  console.error('The model catalogue is not built. Run: pnpm --filter @blockyrts/tools models:build');
  process.exit(1);
}

const server = await createServer({ root, logLevel: 'warn', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const p of pictures) {
    const started = performance.now();
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => console.error(`${p.scene}: ${e.message}`));
    await page.goto(`${base}art.html?scene=${p.scene}&w=${p.width}&h=${p.height}&ss=2`);
    await page.waitForFunction(() => window.artReady || window.artError, null, { timeout: 15 * 60_000 });
    const error = await page.evaluate(() => window.artError);
    if (error) throw new Error(`${p.scene}: ${error}`);
    const url = await page.evaluate(([q]) => window.artCapture('image/webp', q), [p.quality]);
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    writeFileSync(join(root, p.out), bytes);
    console.log(`${p.out}: ${p.width} x ${p.height}, ${Math.round(bytes.length / 1024)} KB, ${Math.round((performance.now() - started) / 1000)} s`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
