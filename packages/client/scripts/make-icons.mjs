// Renders the installed app's icons from the site icon (public/favicon.svg,
// the castle and torch drawn on a 16 by 16 grid) into public/icons/, at whole
// multiples of the grid so the pixels stay sharp: no new artwork. The web
// app manifest (public/manifest.webmanifest) and index.html point at them.
//
//   pnpm --filter @blockyrts/client icons
//
// - icon-192.png, icon-512.png: the site icon as it is (rounded, clear corners).
// - icon-maskable-512.png: the castle on a full square, inside the middle
//   circle that Android keeps when it shapes icons (the outer 10% may be cut).
// - apple-touch-icon.png (180): a full square, since iPhones round it themselves.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../tools/node_modules/playwright/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
const background = /<rect[^>]*fill="(#[0-9a-f]{6})"/i.exec(svg)?.[1];
const paths = svg.match(/<path [^>]*\/>/g) ?? [];
if (!background || paths.length === 0) throw new Error('public/favicon.svg is not the 16 by 16 site icon this script knows');

/** The whole site icon at `size` pixels. */
const whole = (size) => svg.replace('<svg ', `<svg width="${size}" height="${size}" `);

/** The castle alone, `cell` pixels to a grid square, centred on a full square of the icon's background. */
const onSquare = (size, cell) => {
  const at = (size - 16 * cell) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="${background}"/>`,
    `<svg x="${at}" y="${at}" width="${16 * cell}" height="${16 * cell}" viewBox="0 0 16 16">${paths.join('')}</svg>`,
    '</svg>',
  ].join('');
};

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: whole(192) },
  { file: 'icon-512.png', size: 512, svg: whole(512) },
  // 24 pixels a square keeps every corner of the castle within 40% of the middle.
  { file: 'icon-maskable-512.png', size: 512, svg: onSquare(512, 24) },
  { file: 'apple-touch-icon.png', size: 180, svg: onSquare(180, 11) },
];

const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${icon.svg}`);
    writeFileSync(join(out, icon.file), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } }));
    console.log(`public/icons/${icon.file} (${icon.size} by ${icon.size})`);
  }
} finally {
  await browser.close();
}
