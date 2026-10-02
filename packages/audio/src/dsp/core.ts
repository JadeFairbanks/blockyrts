// Small DSP toolkit shared by every generator. Everything here is plain
// arithmetic on Float32Arrays, so the same code renders in a browser worker
// and in Node tests. Audio never feeds the simulation, so floats are fine;
// all randomness comes from seeded streams so every render is repeatable.

export const TAU = Math.PI * 2;

/** A seeded random stream returning numbers in [0, 1). Mulberry32. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, used to turn sound ids into seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A value in [lo, hi) from the stream. */
export function range(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Multiplies a value by up to plus or minus `amount` (0.1 = 10%). */
export function jitter(rng: Rng, value: number, amount: number): number {
  return value * (1 + (rng() * 2 - 1) * amount);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function samples(seconds: number, sr: number): number {
  return Math.max(1, Math.round(seconds * sr));
}

// ---------------------------------------------------------------- filters

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'notch';

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(
    private readonly type: BiquadType,
    freq: number,
    q: number,
    private readonly sr: number,
    private readonly gainDb = 0,
  ) {
    this.set(freq, q);
  }

  set(freq: number, q: number): void {
    const f = clamp(freq, 10, this.sr * 0.45);
    const w = (TAU * f) / this.sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(q, 0.05));
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (this.type) {
      case 'lowpass':
        b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
        a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
        a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'bandpass': // constant 0 dB peak gain
        b0 = alpha; b1 = 0; b2 = -alpha;
        a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cos; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'peak': {
        const A = Math.pow(10, this.gainDb / 40);
        b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
        break;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** One-pole lowpass: cheap smoothing and tone darkening. */
export class OnePole {
  private y = 0;
  private a: number;
  constructor(freq: number, private readonly sr: number) {
    this.a = OnePole.coef(freq, sr);
  }
  static coef(freq: number, sr: number): number {
    return 1 - Math.exp((-TAU * freq) / sr);
  }
  set(freq: number): void {
    this.a = OnePole.coef(freq, this.sr);
  }
  process(x: number): number {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

/** DC blocker, run on anything that might drift (noise integrators, rasp). */
export class DcBlock {
  private x1 = 0;
  private y1 = 0;
  process(x: number): number {
    const y = x - this.x1 + 0.995 * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

// ---------------------------------------------------------------- sources

/** PolyBLEP sawtooth with its own phase. */
export class Saw {
  phase: number;
  constructor(phase = 0) {
    this.phase = phase;
  }
  next(freq: number, sr: number): number {
    const dt = freq / sr;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    const t = this.phase;
    let v = 2 * t - 1;
    if (t < dt) {
      const x = t / dt;
      v -= x + x - x * x - 1;
    } else if (t > 1 - dt) {
      const x = (t - 1) / dt;
      v -= x * x + x + x + 1;
    }
    return v;
  }
}

/** Pink noise (Paul Kellet's economy filter) driven by a seeded stream. */
export class PinkNoise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  constructor(private readonly rng: Rng) {}
  next(): number {
    const w = this.rng() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
}

export function white(rng: Rng): number {
  return rng() * 2 - 1;
}

// ---------------------------------------------------------------- envelopes

/** Linear attack then exponential decay with time constant `tau` (seconds). */
export function percEnv(t: number, attack: number, tau: number): number {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / tau);
}

/** Attack, hold at 1, then a linear release to 0. Times in seconds. */
export function arEnv(t: number, attack: number, hold: number, release: number): number {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + hold) return 1;
  const r = (t - attack - hold) / release;
  return r >= 1 ? 0 : 1 - r;
}

/** Smooth 0 to 1 to 0 bump over [start, start + length]. */
export function bump(t: number, start: number, length: number): number {
  const x = (t - start) / length;
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(Math.PI * x);
}

// ---------------------------------------------------------------- reverb

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];

/** Freeverb-style mono reverb. `spread` offsets the delay lines for a second channel. */
export class Reverb {
  private readonly combs: { buf: Float32Array; i: number; store: number }[];
  private readonly alls: { buf: Float32Array; i: number }[];
  constructor(
    sr: number,
    private readonly room = 0.8,
    private readonly damp = 0.3,
    spread = 0,
  ) {
    const k = sr / 44100;
    this.combs = COMBS.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0, store: 0 }));
    this.alls = ALLPASSES.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0 }));
  }
  process(x: number): number {
    const input = x * 0.015;
    let out = 0;
    for (const c of this.combs) {
      const y = c.buf[c.i]!;
      c.store = y * (1 - this.damp) + c.store * this.damp;
      c.buf[c.i] = input + c.store * this.room;
      c.i = c.i + 1 === c.buf.length ? 0 : c.i + 1;
      out += y;
    }
    for (const a of this.alls) {
      const y = a.buf[a.i]!;
      a.buf[a.i] = out + y * 0.5;
      a.i = a.i + 1 === a.buf.length ? 0 : a.i + 1;
      out = y - out;
    }
    return out;
  }
}

// ---------------------------------------------------------------- buffers

export function peak(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]!);
    if (a > p) p = a;
  }
  return p;
}

export function rms(buf: Float32Array, from = 0, to = buf.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Adds `src` into `dst` at `offset` samples with a gain. */
export function mixInto(dst: Float32Array, src: Float32Array, offset: number, gain = 1): void {
  const end = Math.min(dst.length, offset + src.length);
  for (let i = Math.max(0, offset); i < end; i++) dst[i] = dst[i]! + src[i - offset]! * gain;
}

/** Soft clipper for drive; keeps peaks under 1. */
export function softClip(x: number): number {
  return Math.tanh(x);
}

/**
 * Finishes a one-shot: removes DC, trims silence off the end, adds tiny
 * fades so nothing clicks, and scales the peak to `target`.
 */
export function finishOneShot(buf: Float32Array, sr: number, target: number): Float32Array {
  const dc = new DcBlock();
  for (let i = 0; i < buf.length; i++) buf[i] = dc.process(buf[i]!);
  const p = peak(buf);
  if (p === 0) return buf;
  // Trim the tail below -60 dB of the peak, keeping 20 ms after the last loud sample.
  const floor = p * 0.001;
  let last = buf.length - 1;
  while (last > 0 && Math.abs(buf[last]!) < floor) last--;
  const end = Math.min(buf.length, last + Math.round(0.02 * sr));
  const out = buf.slice(0, Math.max(end, Math.round(0.03 * sr)));
  const fadeIn = Math.min(out.length, Math.round(0.001 * sr));
  for (let i = 0; i < fadeIn; i++) out[i] = out[i]! * (i / fadeIn);
  const fadeOut = Math.min(out.length, Math.round(0.01 * sr));
  for (let i = 0; i < fadeOut; i++) {
    const j = out.length - 1 - i;
    out[j] = out[j]! * (i / fadeOut);
  }
  const k = target / peak(out);
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * k;
  return out;
}
