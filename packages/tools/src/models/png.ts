// Minimal PNG reading and writing for the model converter: enough to read the
// size of an embedded texture, decode 8-bit non-interlaced images to RGBA and
// encode RGBA back to PNG (for the texture atlas). Uses only node:zlib.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export interface RgbaImage {
  width: number;
  height: number;
  /** width * height * 4 bytes, rows top to bottom. */
  data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 33 && SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Width and height from the IHDR chunk, or null if the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isPng(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes a non-interlaced PNG (grey, grey+alpha, RGB, RGBA or palette; 8-bit, or palette at 1 to 8 bits). */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (!isPng(bytes)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      bitDepth = body[8] ?? 0;
      colourType = body[9] ?? 0;
      if ((body[12] ?? 0) !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType];
  if (channels === undefined) throw new Error(`unsupported PNG colour type ${colourType}`);
  if (colourType === 3 ? ![1, 2, 4, 8].includes(bitDepth) : bitDepth !== 8) {
    throw new Error(`unsupported PNG bit depth ${bitDepth} for colour type ${colourType}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const rows = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (out[x - bpp] ?? 0) : 0;
      const b = prev[x] ?? 0;
      const c = x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      const v = line[x] ?? 0;
      let r: number;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      out[x] = r & 0xff;
    }
    prev = out;
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const row = y * stride;
      if (colourType === 3) {
        const bit = x * bitDepth;
        const byte = rows[row + (bit >> 3)] ?? 0;
        const index = (byte >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
        data[o] = palette?.[index * 3] ?? 0;
        data[o + 1] = palette?.[index * 3 + 1] ?? 0;
        data[o + 2] = palette?.[index * 3 + 2] ?? 0;
        data[o + 3] = transparency?.[index] ?? 255;
        continue;
      }
      const i = row + x * channels;
      const g = rows[i] ?? 0;
      if (colourType === 0 || colourType === 4) {
        data[o] = g;
        data[o + 1] = g;
        data[o + 2] = g;
        data[o + 3] = colourType === 4 ? (rows[i + 1] ?? 255) : 255;
      } else {
        data[o] = g;
        data[o + 1] = rows[i + 1] ?? 0;
        data[o + 2] = rows[i + 2] ?? 0;
        data[o + 3] = colourType === 6 ? (rows[i + 3] ?? 255) : 255;
      }
    }
  }
  return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  out.set(body, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** Encodes an RGBA image as an 8-bit RGBA PNG (filter 0 on every row). */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
