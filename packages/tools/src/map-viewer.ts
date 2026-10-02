// Map viewer: draws a seed's generated land from above to a PNG, using the
// sim's own world generation, so what it shows is what players get
// (technical decision 11). Colours come from the land's materials, shaded by
// height, with water in blue; cell edges show where their barriers are.
//
//   pnpm map-viewer --seed 1 --players 1 --size 2000 --metres-per-pixel 2 --out map.png
//
// --centre-x and --centre-z (metres) move the window; --edges outlines the cells.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { deflateSync } from 'node:zlib';
import { COLUMNS_PER_CHUNK, MATERIALS, NO_WATER, WATER_PER_UNIT, WorldGen, WorldLayout } from '@blockyrts/sim';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    players: { type: 'string', default: '1' },
    size: { type: 'string', default: '2000' },
    'metres-per-pixel': { type: 'string', default: '2' },
    'centre-x': { type: 'string', default: '0' },
    'centre-z': { type: 'string', default: '0' },
    edges: { type: 'boolean', default: false },
    out: { type: 'string', default: 'map.png' },
  },
});

const seed = Number(values.seed) >>> 0;
const players = Number(values.players);
const sizeM = Number(values.size);
const mpp = Number(values['metres-per-pixel']);
const layout = new WorldLayout(seed, players);
const gen = new WorldGen(layout);

// Sample step in columns: the largest power of two not above the pixel size.
const colsPerPixel = (mpp * 20) / 9;
let step = 1;
while (step * 2 <= colsPerPixel && step < 16) step *= 2;
const px = Math.round(sizeM / mpp);
const img = new Uint8Array(px * px * 3);
const cxM = Number(values['centre-x']);
const czM = Number(values['centre-z']);
const x0 = (cxM - sizeM / 2) * (20 / 9);
const z0 = (czM - sizeM / 2) * (20 / 9);
const chunkCols = COLUMNS_PER_CHUNK;
const started = Date.now();
const cache = new Map<string, ReturnType<WorldGen['lowRes']>>();
let chunks = 0;
function sample(col: number, row: number): { top: number; mat: number; water: number } {
  const cx = Math.floor(col / chunkCols);
  const cz = Math.floor(row / chunkCols);
  const key = `${cx},${cz}`;
  let c = cache.get(key);
  if (!c) {
    c = gen.lowRes(cx, cz, step);
    cache.set(key, c);
    chunks++;
  }
  const i = Math.floor((col - cx * chunkCols) / step);
  const j = Math.floor((row - cz * chunkCols) / step);
  const k = j * c.size + i;
  return { top: c.top[k]!, mat: c.material[k]!, water: c.water[k]! };
}

for (let y = 0; y < px; y++) {
  const row = Math.floor(z0 + y * colsPerPixel);
  for (let x = 0; x < px; x++) {
    const col = Math.floor(x0 + x * colsPerPixel);
    const s = sample(col, row);
    const w = sample(col - step, row - step);
    let r: number;
    let g: number;
    let b: number;
    if (s.water !== NO_WATER && s.water / WATER_PER_UNIT > s.top) {
      const depth = s.water / WATER_PER_UNIT - s.top;
      const k = Math.max(0.35, 1 - depth / 30);
      [r, g, b] = [40 * k, 90 * k, 170 * k + 30];
    } else {
      const c = MATERIALS[s.mat]!.colour;
      const shade = Math.max(0.55, Math.min(1.35, 1 + (s.top - w.top) * 0.05 + s.top * 0.0015));
      r = ((c >> 16) & 255) * shade;
      g = ((c >> 8) & 255) * shade;
      b = (c & 255) * shade;
    }
    if (values.edges) {
      const a = layout.nearest(col, row);
      if (layout.nearest(col + colsPerPixel, row) !== a || layout.nearest(col, row + colsPerPixel) !== a) [r, g, b] = [255, 255, 255];
    }
    const o = (y * px + x) * 3;
    img[o] = Math.min(255, r);
    img[o + 1] = Math.min(255, g);
    img[o + 2] = Math.min(255, b);
  }
}
// Mark the pockets.
for (const p of gen.start.pockets) {
  const cx = Math.round((p.x - x0) / colsPerPixel);
  const cz = Math.round((p.z - z0) / colsPerPixel);
  for (let d = -3; d <= 3; d++) {
    for (const [ax, az] of [[cx + d, cz], [cx, cz + d]] as const) {
      if (ax >= 0 && az >= 0 && ax < px && az < px) img.set([255, 40, 40], (az * px + ax) * 3);
    }
  }
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'ascii'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const raw = new Uint8Array(px * (px * 3 + 1));
for (let y = 0; y < px; y++) raw.set(img.subarray(y * px * 3, (y + 1) * px * 3), y * (px * 3 + 1) + 1);
const ihdr = new Uint8Array(13);
new DataView(ihdr.buffer).setUint32(0, px);
new DataView(ihdr.buffer).setUint32(4, px);
ihdr.set([8, 2, 0, 0, 0], 8);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', new Uint8Array(0)),
]);
const cwd = process.env.INIT_CWD ?? process.cwd();
const path = resolve(cwd, values.out);
writeFileSync(path, png);
console.log(`seed ${seed}, ${players} players: ${px} x ${px} px at ${mpp} m per pixel, ${chunks} chunks sampled every ${step} columns in ${Date.now() - started} ms -> ${path}`);
console.log(`bands start at rings: Fringe 1, Deepwoods ${layout.bands.deepwoods}, Barrens ${layout.bands.barrens}, Deadlands ${layout.bands.deadlands}`);
