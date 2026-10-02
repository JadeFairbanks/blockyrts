// Writes every sound and music stem as WAV files for listening outside the
// browser: `pnpm --filter @blockyrts/audio render <out dir>`. Not committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS } from '../src/manifest.ts';
import { renderMusic } from '../src/music/render.ts';
import { MUSIC_STATES } from '../src/music/score.ts';
import { renderDef } from '../src/render.ts';

const outDir = process.argv[2] ?? 'audio-out';
mkdirSync(outDir, { recursive: true });

function wav(channels: Float32Array[], sr: number): Buffer {
  const n = channels[0]!.length;
  const buf = Buffer.alloc(44 + n * channels.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * channels.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels.length, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * channels.length * 2, 28);
  buf.writeUInt16LE(channels.length * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * channels.length * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of channels) {
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[i]!)) * 32767), o);
      o += 2;
    }
  }
  return buf;
}

const SR = 44100;
for (const def of SOUNDS) {
  for (let v = 0; v < def.variants; v++) {
    writeFileSync(join(outDir, `${def.id}.${v}.wav`), wav([renderDef(def, v, SR)], SR));
  }
}
for (const state of MUSIC_STATES) {
  const m = renderMusic(state);
  for (const stem of ['base', 'tension'] as const) {
    writeFileSync(join(outDir, `music.${state}.${stem}.wav`), wav([m.stems[stem].left, m.stems[stem].right], m.sampleRate));
  }
}
console.log(`Wrote ${SOUNDS.reduce((n, d) => n + d.variants, 0)} sounds and ${MUSIC_STATES.length * 2} music stems to ${outDir}`);
