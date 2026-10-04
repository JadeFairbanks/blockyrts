// Turns a folder of finished WAV sounds (the outside sound service's
// delivery, kept under the project's audio/originals) into the small MP3s
// the game ships, plus the index the engine reads:
//
//   pnpm --filter @blockyrts/audio sounds:build <folder with the WAVs>
//
// Needs ffmpeg with libmp3lame on the PATH. Writes
// packages/client/public/audio/<name>.mp3 and
// packages/client/src/audio/sound-files.json, and checks the folder against
// the sound list first: every sound, take and music stem the game plays must
// be there. Run it again whenever new WAVs arrive; the MP3s are committed,
// the WAVs never are.
//
// MP3 encoders put a short silence at the start and pad the end, and
// browsers differ in whether they cut it off, so the index records how long
// each sound is and how much the encoder added; the engine trims to the
// exact length after decoding. Loops (music and ambience) are encoded with a
// second of their own end before them and of their start after them, so the
// seam sounds the same as the middle, and the engine keeps only the loop.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileEntry, SoundFileIndex } from '../src/engine/files.ts';
import { AMBIENCES, EXTRA_SOUNDS, SOUNDS } from '../src/manifest.ts';
import { MUSIC_STATES } from '../src/music/score.ts';

const src = process.argv[2];
if (!src) {
  console.error('usage: sounds:build <folder with the WAVs>');
  process.exit(1);
}
const root = fileURLToPath(new URL('../../..', import.meta.url));
const outDir = join(root, 'packages/client/public/audio');
const indexPath = join(root, 'packages/client/src/audio/sound-files.json');

/** Seconds of wrap-around encoded either side of a loop. */
const WRAP_S = 1;
/** LAME VBR quality: 3 for stereo loops, 4 for the short mono sounds. */
const LOOP_Q = '3';
const SHOT_Q = '4';

interface Wav {
  readonly channels: number;
  readonly rate: number;
  readonly bits: number;
  readonly frames: number;
  readonly data: Buffer;
}

function readWav(path: string): Wav {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`);
  let o = 12;
  let fmt: { channels: number; rate: number; bits: number; format: number } | null = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') {
      if (!fmt) throw new Error(`${path}: data before fmt`);
      if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`${path}: expected 16-bit PCM`);
      const data = b.subarray(o + 8, o + 8 + size);
      return { channels: fmt.channels, rate: fmt.rate, bits: fmt.bits, frames: data.length / (2 * fmt.channels), data };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error(`${path}: no data chunk`);
}

function writeWav(path: string, w: Omit<Wav, 'frames'>): void {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + w.data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(w.channels, 22);
  h.writeUInt32LE(w.rate, 24);
  h.writeUInt32LE(w.rate * w.channels * 2, 28);
  h.writeUInt16LE(w.channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(w.data.length, 40);
  writeFileSync(path, Buffer.concat([h, w.data]));
}

/**
 * The silence a decoder that ignores the gapless tag gives before and after
 * the sound: the LAME tag's encoder delay and padding (written by any LAME
 * build, whatever its version string says), with the MP3 decoder's own 529
 * frames moved from the end to the start.
 */
function lameGap(mp3: Buffer): { delay: number; padding: number } {
  let x = mp3.indexOf('Xing', 0, 'ascii');
  if (x < 0 || x > 600) x = mp3.indexOf('Info', 0, 'ascii');
  if (x < 0 || x > 600) throw new Error('no Xing or Info header');
  const flags = mp3.readUInt32BE(x + 4);
  let o = x + 8;
  if (flags & 1) o += 4;
  if (flags & 2) o += 4;
  if (flags & 4) o += 100;
  if (flags & 8) o += 4;
  // o is the 9-byte encoder name; delay and padding are 12 bits each at +21.
  const p = o + 21;
  const delay = (mp3[p]! << 4) | (mp3[p + 1]! >> 4);
  const padding = ((mp3[p + 1]! & 0x0f) << 8) | mp3[p + 2]!;
  if (delay === 0 && padding === 0) throw new Error('no encoder delay in the tag');
  return { delay: delay + DECODER_DELAY, padding: Math.max(0, padding - DECODER_DELAY) };
}
/** Frames every MP3 decoder lags its input by. */
const DECODER_DELAY = 529;

// ---- What the game expects

const isLoop = (name: string): boolean => name.startsWith('music.') || name.startsWith('ambience.');
const required: string[] = [
  ...SOUNDS.flatMap((d) => Array.from({ length: d.variants }, (_, v) => `${d.id}.${v}`)),
  ...MUSIC_STATES.flatMap((s) => [`music.${s}.base`, `music.${s}.tension`]),
];
const optional: string[] = [
  ...EXTRA_SOUNDS.flatMap((d) => Array.from({ length: d.variants }, (_, v) => `${d.id}.${v}`)),
  ...AMBIENCES.map((a) => `ambience.${a}.0`),
  'music.menu.base',
];

// The service's folder has the main set at the top and the extras in extras/.
const found = new Map<string, string>();
for (const dir of [src, join(src, 'extras')]) {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    continue;
  }
  for (const n of names) if (n.endsWith('.wav')) found.set(basename(n, '.wav'), join(dir, n));
}
const missing = required.filter((n) => !found.has(n));
const unknown = [...found.keys()].filter((n) => !required.includes(n) && !optional.includes(n));
if (missing.length) {
  console.error(`Missing ${missing.length} required sounds:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
if (unknown.length) console.warn(`Ignoring ${unknown.length} files the game does not use: ${unknown.join(', ')}`);

// ---- Encode

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'sounds-'));
const entries: Record<string, FileEntry> = {};
let bytes = 0;
for (const name of [...required, ...optional.filter((n) => found.has(n))]) {
  const wav = readWav(found.get(name)!);
  const loop = isLoop(name);
  const pre = loop ? Math.min(wav.frames, Math.round(WRAP_S * wav.rate)) : 0;
  let input = found.get(name)!;
  if (loop) {
    const fb = 2 * wav.channels;
    const tail = wav.data.subarray((wav.frames - pre) * fb);
    const head = wav.data.subarray(0, pre * fb);
    input = join(tmp, `${name}.wav`);
    writeWav(input, { channels: wav.channels, rate: wav.rate, bits: 16, data: Buffer.concat([tail, wav.data, head]) });
  }
  const out = join(outDir, `${name}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-c:a', 'libmp3lame', '-q:a', loop ? LOOP_Q : SHOT_Q, '-map_metadata', '-1', out]);
  const mp3 = readFileSync(out);
  bytes += mp3.length;
  const gap = lameGap(mp3);
  entries[name] = { rate: wav.rate, channels: wav.channels, frames: wav.frames, pre, total: wav.frames + 2 * pre, delay: gap.delay, padding: gap.padding };
}
rmSync(tmp, { recursive: true, force: true });

const index: SoundFileIndex = { format: 'mp3', entries };
writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
console.log(`Wrote ${Object.keys(entries).length} sounds (${(bytes / 1048576).toFixed(1)} MB) to ${outDir}`);
