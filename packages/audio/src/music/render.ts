// Renders a music state into two seamless stereo loops (stems).
import { Reverb, hashString, makeRng, peak, samples } from '../dsp/core.ts';
import type { GenContext } from '../sfx/generators.ts';
import { DRUMS, INSTRUMENTS, highpassInPlace } from './instruments.ts';
import { MUSIC, loopSeconds, type Layer, type MusicStateDef, type MusicStateId, type Stem } from './score.ts';

export interface NoteEvent {
  /** Step the note starts on. */
  readonly step: number;
  /** Length in steps. */
  readonly steps: number;
  /** MIDI notes, or a drum letter. */
  readonly notes: readonly number[];
  readonly drum: string | null;
  readonly vel: number;
}

const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name: string): number {
  const m = NOTE_RE.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]!]! + acc;
}

/** Splits a pattern into step tokens, dropping bar lines. */
export function tokens(pattern: string): string[] {
  return pattern.split(/\s+/).filter((t) => t !== '' && t !== '|');
}

/** Parses a layer pattern into note events over `totalSteps`, repeating it to fill. */
export function parsePattern(pattern: string, isDrums: boolean, totalSteps: number): NoteEvent[] {
  const toks = tokens(pattern);
  if (toks.length === 0 || totalSteps % toks.length !== 0) {
    throw new Error(`Pattern of ${toks.length} steps does not divide a loop of ${totalSteps}`);
  }
  const events: NoteEvent[] = [];
  for (let rep = 0; rep < totalSteps / toks.length; rep++) {
    let current: { step: number; steps: number; notes: number[]; drum: string | null; vel: number } | null = null;
    const flush = (): void => {
      if (current) events.push(current);
      current = null;
    };
    toks.forEach((tok, i) => {
      const step = rep * toks.length + i;
      if (tok === '-') {
        if (current) current.steps++;
        return;
      }
      flush();
      if (tok === '.') return;
      let vel = 0.75;
      let body = tok;
      if (body.endsWith('!')) { vel = 1; body = body.slice(0, -1); }
      else if (body.endsWith('_')) { vel = 0.5; body = body.slice(0, -1); }
      if (isDrums) {
        if (!DRUMS[body]) throw new Error(`Unknown drum "${body}"`);
        current = { step, steps: 1, notes: [], drum: body, vel };
      } else {
        current = { step, steps: 1, notes: body.split('+').map(noteToMidi), drum: null, vel };
      }
    });
    flush();
  }
  return events;
}

export interface StereoBuffer {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

export interface RenderedMusic {
  readonly state: MusicStateId;
  readonly sampleRate: number;
  /** Exact loop length in samples; both stems are this long. */
  readonly length: number;
  readonly stems: Record<Stem, StereoBuffer>;
}

/** Seconds of release rendered past the loop end and folded back to its start. */
const TAIL = 3;

function renderLayer(def: MusicStateDef, layer: Layer, sr: number, loopLen: number, stepSec: number): Float32Array {
  const totalSteps = def.bars * def.beatsPerBar * def.stepsPerBeat;
  const rng = makeRng(hashString(`${def.id}/${layer.name}`));
  const ctx: GenContext = { sr, rng, variant: 0 };
  const buf = new Float32Array(loopLen + samples(TAIL, sr));
  const isDrums = layer.instrument === 'drums';
  for (const ev of parsePattern(layer.pattern, isDrums, totalSteps)) {
    // A touch of human timing and touch; the stream keeps it repeatable.
    const at = ev.step * stepSec + (ev.step === 0 ? 0 : (rng() - 0.5) * 0.012);
    const vel = ev.vel * (0.92 + rng() * 0.08);
    if (ev.drum) DRUMS[ev.drum]!(ctx, buf, at, vel);
    else {
      const fn = INSTRUMENTS[layer.instrument as keyof typeof INSTRUMENTS];
      for (const n of ev.notes) fn(ctx, buf, at, 440 * Math.pow(2, (n - 69) / 12), ev.steps * stepSec, vel / Math.sqrt(ev.notes.length));
    }
  }
  if (layer.instrument === 'pad' || layer.instrument === 'darkPad') highpassInPlace(buf, 90, sr);
  // Fold the tail onto the start so the loop has no seam.
  const out = buf.slice(0, loopLen);
  for (let i = loopLen; i < buf.length; i++) out[i % loopLen] = out[i % loopLen]! + buf[i]!;
  return out;
}

/** Renders one state's two stems at `sr` (32 kHz by default keeps memory modest). */
export function renderMusic(state: MusicStateId, sr = 32000): RenderedMusic {
  const def = MUSIC[state];
  const loopLen = Math.round(loopSeconds(def) * sr);
  const stepSec = 60 / def.bpm / def.stepsPerBeat;
  const stems = {} as Record<Stem, StereoBuffer>;
  for (const stem of ['base', 'tension'] as const) {
    const left = new Float32Array(loopLen);
    const right = new Float32Array(loopLen);
    const send = new Float32Array(loopLen);
    for (const layer of def.layers.filter((l) => l.stem === stem)) {
      const mono = renderLayer(def, layer, sr, loopLen, stepSec);
      // Equal-power pan.
      const angle = ((layer.pan + 1) * Math.PI) / 4;
      const gl = Math.cos(angle) * layer.gain * Math.SQRT2;
      const gr = Math.sin(angle) * layer.gain * Math.SQRT2;
      for (let i = 0; i < loopLen; i++) {
        const x = mono[i]!;
        left[i] = left[i]! + x * gl;
        right[i] = right[i]! + x * gr;
        send[i] = send[i]! + x * layer.gain * layer.reverb;
      }
    }
    // Run the reverb over two passes of the loop and keep the second, so its
    // tail at the end of the loop carries on into the start.
    const rl = new Reverb(sr, def.room, 0.35, 0);
    const rr = new Reverb(sr, def.room, 0.35, 23);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < loopLen; i++) {
        const wl = rl.process(send[i]!);
        const wr = rr.process(send[i]!);
        if (pass === 1) {
          left[i] = left[i]! + wl * 0.9;
          right[i] = right[i]! + wr * 0.9;
        }
      }
    }
    stems[stem] = { left, right };
  }
  // One gain for both stems so their balance holds: the full mix peaks at 0.8.
  let full = 0;
  for (let i = 0; i < loopLen; i++) {
    full = Math.max(full, Math.abs(stems.base.left[i]! + stems.tension.left[i]!), Math.abs(stems.base.right[i]! + stems.tension.right[i]!));
  }
  const k = full > 0 ? 0.8 / full : 1;
  for (const s of Object.values(stems)) {
    for (const ch of [s.left, s.right]) for (let i = 0; i < ch.length; i++) ch[i] = ch[i]! * k;
  }
  return { state, sampleRate: sr, length: loopLen, stems };
}

/** The highest sample of a stereo buffer. */
export function stereoPeak(b: StereoBuffer): number {
  return Math.max(peak(b.left), peak(b.right));
}
