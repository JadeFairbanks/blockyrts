// Music instruments. Each adds one note into a mono layer buffer.
import { Biquad, OnePole, Saw, TAU, samples, white } from '../dsp/core.ts';
import { addModes, addNoise, addThud, pluckString, renderBrass, type GenContext } from '../sfx/generators.ts';

export type NoteFn = (ctx: GenContext, out: Float32Array, at: number, freq: number, len: number, vel: number) => void;

/** A lute or harp: Karplus-Strong. */
const lute: NoteFn = (ctx, out, at, freq, len, vel) => {
  const s = pluckString(ctx, freq, Math.min(3, len + 1.6), { decay: 1.8, bright: 0.35, gain: vel });
  addAt(out, s, at, ctx.sr);
};

/** A warm string-and-reed pad: detuned saws through a soft low-pass. */
const pad: NoteFn = (ctx, out, at, freq, len, vel) => {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const release = 1.4;
  const attack = Math.min(0.7, len * 0.4);
  const n = Math.min(out.length - start, samples(len + release, sr));
  const saws = [new Saw(rng()), new Saw(rng()), new Saw(rng())];
  const det = [1, 1.0041, 0.9962];
  const lp = new Biquad('lowpass', Math.min(1400, freq * 4), 0.6, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < attack ? t / attack : t < len ? 1 : Math.max(0, 1 - (t - len) / release);
    let x = 0;
    for (let k = 0; k < 3; k++) x += saws[k]!.next(freq * det[k]!, sr);
    out[start + i] = out[start + i]! + lp.process(x) * env * env * vel * 0.25;
  }
};

/** A dark, slowly breathing drone pad for the night. */
const darkPad: NoteFn = (ctx, out, at, freq, len, vel) => {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const release = 2;
  const attack = Math.min(1.5, len * 0.5);
  const n = Math.min(out.length - start, samples(len + release, sr));
  const a = new Saw(rng());
  const b = new Saw(rng());
  const lp = new Biquad('lowpass', 500, 1.1, sr);
  const ph = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < attack ? t / attack : t < len ? 1 : Math.max(0, 1 - (t - len) / release);
    if ((i & 31) === 0) lp.set(Math.min(900, freq * 2.2) * (1 + 0.35 * Math.sin(ph + TAU * 0.11 * t)), 1.1);
    const x = a.next(freq, sr) + b.next(freq * 1.006, sr);
    out[start + i] = out[start + i]! + lp.process(x) * env * vel * 0.3;
  }
};

/** Soft round bass. */
const bass: NoteFn = (ctx, out, at, freq, len, vel) => {
  const { sr } = ctx;
  const start = Math.round(at * sr);
  const n = Math.min(out.length - start, samples(len + 0.12, sr));
  let ph = ctx.rng() * TAU;
  const lp = new OnePole(freq * 5, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.006) * (t < len ? 0.75 + 0.25 * Math.exp(-t / 0.15) : Math.max(0, 1 - (t - len) / 0.12) * 0.75);
    ph += (TAU * freq) / sr;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
    out[start + i] = out[start + i]! + lp.process(Math.sin(ph) + 0.35 * tri) * env * vel * 0.8;
  }
};

/** Bells and chimes: inharmonic struck partials. */
const bell: NoteFn = (ctx, out, at, freq, _len, vel) => {
  addModes(ctx, out, at, { freqs: [freq, freq * 2.01, freq * 3.02, freq * 4.17, freq * 5.43], decays: [1.2, 0.7, 0.4, 0.22, 0.12], amps: [1, 0.5, 0.3, 0.2, 0.1] }, vel * 0.5);
};

/** A wooden flute: near-sine with breath and late vibrato. */
const flute: NoteFn = (ctx, out, at, freq, len, vel) => {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const n = Math.min(out.length - start, samples(len + 0.15, sr));
  const breath = new Biquad('bandpass', freq * 2, 3, sr);
  let ph = rng() * TAU;
  const vibPh = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.07) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.15));
    const vib = 1 + 0.006 * Math.min(1, Math.max(0, t - 0.25) / 0.3) * Math.sin(vibPh + TAU * 5 * t);
    ph += (TAU * freq * vib) / sr;
    const tone = Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph);
    out[start + i] = out[start + i]! + (tone * 0.5 + breath.process(white(rng)) * 0.25) * env * vel;
  }
};

/** Brass, shared with the horns. */
const brass: NoteFn = (ctx, out, at, freq, len, vel) => renderBrass(ctx, out, at, freq, len, 0.45, vel * 0.5);

export const INSTRUMENTS = { lute, pad, darkPad, bass, bell, flute, brass } as const;
export type InstrumentId = keyof typeof INSTRUMENTS;

// ---------------------------------------------------------------- drums

export type DrumFn = (ctx: GenContext, out: Float32Array, at: number, vel: number) => void;

/** Drum letters used in the drum patterns. */
export const DRUMS: Record<string, DrumFn> = {
  // Taiko-like big drum.
  K: (ctx, out, at, vel) => {
    addThud(ctx, out, at, 115, 45, 0.28, vel);
    addNoise(ctx, out, at, { lp: 1200, decay: 0.025, gain: vel * 0.4 });
  },
  // Low and high toms.
  T: (ctx, out, at, vel) => {
    addThud(ctx, out, at, 140, 88, 0.2, vel * 0.8);
    addNoise(ctx, out, at, { bp: 600, q: 1, decay: 0.03, gain: vel * 0.25 });
  },
  t: (ctx, out, at, vel) => {
    addThud(ctx, out, at, 200, 145, 0.14, vel * 0.7);
    addNoise(ctx, out, at, { bp: 900, q: 1, decay: 0.025, gain: vel * 0.25 });
  },
  // Frame drum, open and slapped.
  H: (ctx, out, at, vel) => {
    addThud(ctx, out, at, 175, 125, 0.12, vel * 0.6);
    addNoise(ctx, out, at, { bp: 1000, q: 0.8, decay: 0.03, gain: vel * 0.35 });
  },
  h: (ctx, out, at, vel) => {
    addThud(ctx, out, at, 320, 260, 0.03, vel * 0.3);
    addNoise(ctx, out, at, { bp: 2200, q: 1, decay: 0.03, gain: vel * 0.4 });
  },
  // Shaker.
  s: (ctx, out, at, vel) => addNoise(ctx, out, at, { hp: 5000, attack: 0.012, decay: 0.035, gain: vel * 0.35 }),
};

function addAt(out: Float32Array, src: Float32Array, at: number, sr: number): void {
  const start = Math.round(at * sr);
  const end = Math.min(out.length, start + src.length);
  for (let i = start; i < end; i++) out[i] = out[i]! + src[i - start]!;
}

/** A gentle shelf so pads do not muddy the low end. */
export function highpassInPlace(buf: Float32Array, freq: number, sr: number): void {
  const hp = new Biquad('highpass', freq, 0.7, sr);
  for (let i = 0; i < buf.length; i++) buf[i] = hp.process(buf[i]!);
}
