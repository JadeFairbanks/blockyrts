// Sound-effect generators. Each one takes the render context (sample rate and
// a seeded stream that differs per variant) and its parameters from the
// manifest, and returns a mono buffer. Peak level is set afterwards by the
// renderer, so generators only care about shape and balance.
import {
  Biquad,
  OnePole,
  PinkNoise,
  Saw,
  TAU,
  bump,
  jitter,
  midiToHz,
  percEnv,
  range,
  samples,
  white,
  type Rng,
} from '../dsp/core.ts';

export interface GenContext {
  readonly sr: number;
  readonly rng: Rng;
  /** Which variant of the sound this is, from 0. */
  readonly variant: number;
}

// ---------------------------------------------------------------- pieces

export interface Modes {
  /** Mode frequencies in Hz. */
  readonly freqs: readonly number[];
  /** Decay time constant of each mode in seconds. */
  readonly decays: readonly number[];
  readonly amps: readonly number[];
}

/** Adds a bank of damped sines (a struck object's ring) starting at `at` seconds. */
export function addModes(ctx: GenContext, out: Float32Array, at: number, m: Modes, gain: number, pitch = 1): void {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  m.freqs.forEach((f0, k) => {
    const f = jitter(rng, f0 * pitch, 0.02);
    const tau = m.decays[k] ?? 0.05;
    const amp = (m.amps[k] ?? 0.5) * gain;
    if (f >= sr * 0.48) return;
    const n = Math.min(out.length - start, samples(tau * 6, sr));
    // A damped sine as a rotating complex number: four multiplies a sample.
    const r = Math.exp(-1 / (tau * sr));
    const c = Math.cos((TAU * f) / sr) * r;
    const s = Math.sin((TAU * f) / sr) * r;
    const ph = rng() * TAU;
    let re = Math.cos(ph) * amp;
    let im = Math.sin(ph) * amp;
    const fadeFrom = n - Math.min(n, samples(0.01, sr));
    for (let i = 0; i < n; i++) {
      const edge = i < 8 ? i / 8 : i > fadeFrom ? (n - i) / (n - fadeFrom) : 1;
      out[start + i] = out[start + i]! + im * edge;
      const nr = re * c - im * s;
      im = re * s + im * c;
      re = nr;
    }
  });
}

/** Adds a sine whose pitch glides exponentially from f0 to f1 (a body thump). */
export function addThud(ctx: GenContext, out: Float32Array, at: number, f0: number, f1: number, decay: number, gain: number): void {
  const { sr } = ctx;
  const start = Math.round(at * sr);
  const attack = samples(0.0015, sr);
  const n = Math.min(out.length - start, attack + samples(decay * 6, sr));
  const fadeFrom = n - Math.min(n, samples(0.01, sr));
  const kEnv = Math.exp(-1 / (decay * sr));
  const kGlide = Math.exp(-1 / (decay * 0.6 * sr));
  let glide = 1;
  let env = 1;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (TAU * (f1 + (f0 - f1) * glide)) / sr;
    glide *= kGlide;
    let e = 1;
    if (i < attack) e = i / attack;
    else {
      e = env;
      env *= kEnv;
    }
    if (i > fadeFrom) e *= (n - i) / (n - fadeFrom);
    out[start + i] = out[start + i]! + Math.sin(ph) * e * gain;
  }
}

/** Adds filtered noise with a percussive envelope. */
export function addNoise(
  ctx: GenContext,
  out: Float32Array,
  at: number,
  opts: { lp?: number; hp?: number; bp?: number; q?: number; attack?: number; decay: number; gain: number },
): void {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const n = Math.min(out.length - start, samples((opts.attack ?? 0.001) + opts.decay * 7, sr));
  const lp = opts.lp ? new Biquad('lowpass', opts.lp, 0.7, sr) : null;
  const hp = opts.hp ? new Biquad('highpass', opts.hp, 0.7, sr) : null;
  const bp = opts.bp ? new Biquad('bandpass', opts.bp, opts.q ?? 1, sr) : null;
  for (let i = 0; i < n; i++) {
    let x = white(rng);
    if (lp) x = lp.process(x);
    if (hp) x = hp.process(x);
    if (bp) x = bp.process(x) * 2;
    out[start + i] = out[start + i]! + x * percEnv(i / sr, opts.attack ?? 0.001, opts.decay) * opts.gain;
  }
}

/** Scatters `count` tiny grains (pebbles, splinters, sparks) between `from` and `to` seconds. */
export function addGrains(
  ctx: GenContext,
  out: Float32Array,
  from: number,
  to: number,
  count: number,
  opts: { lo: number; hi: number; decay: number; gain: number; fadeOut?: boolean },
): void {
  const { rng } = ctx;
  for (let g = 0; g < count; g++) {
    const t = range(rng, from, to);
    const fade = opts.fadeOut === false ? 1 : 1 - (t - from) / (to - from);
    addNoise(ctx, out, t, { bp: range(rng, opts.lo, opts.hi), q: 3, decay: opts.decay * range(rng, 0.6, 1.4), gain: opts.gain * fade * range(rng, 0.4, 1) });
  }
}

/** Band-passed noise whose centre sweeps from `from` to `to` Hz under a smooth bump. */
export function addSweep(ctx: GenContext, out: Float32Array, at: number, dur: number, from: number, to: number, q: number, gain: number): void {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const n = Math.min(out.length - start, samples(dur, sr));
  const bp = new Biquad('bandpass', from, q, sr);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    if ((i & 15) === 0) bp.set(from * Math.pow(to / from, x), q);
    out[start + i] = out[start + i]! + bp.process(white(rng)) * Math.sin(Math.PI * x) * gain * 2;
  }
}

/** A Karplus-Strong plucked string (bow strings, lute notes). */
export function pluckString(ctx: GenContext, freq: number, dur: number, opts: { decay: number; bright: number; gain: number }): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(dur, sr));
  const period = Math.max(2, sr / freq);
  const len = Math.floor(period);
  const frac = period - len;
  const line = new Float32Array(len + 2);
  const lp = new OnePole(700 + opts.bright * 4000, sr);
  for (let i = 0; i < line.length; i++) line[i] = lp.process(white(rng)) * 2;
  // Loss per round trip so the note falls by 60 dB over `decay` seconds.
  const loss = Math.pow(0.001, 1 / (opts.decay * freq));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const a = line[idx]!;
    const b = line[(idx + 1) % line.length]!;
    const y = a + (b - a) * frac;
    const w = 0.5 + opts.bright * 0.3;
    const filtered = (y * w + prev * (1 - w)) * loss;
    prev = y;
    line[idx] = filtered;
    idx = (idx + 1) % len;
    out[i] = y * opts.gain * Math.min(1, i / (0.002 * sr));
  }
  return out;
}

// ---------------------------------------------------------------- generators

export interface ImpactParams {
  readonly dur: number;
  /** Seconds of lead-in before the strike (for swooshes). */
  readonly at?: number;
  readonly thud?: { f0: number; f1: number; decay: number; gain: number };
  readonly noise?: { lp?: number; hp?: number; bp?: number; q?: number; attack?: number; decay: number; gain: number };
  readonly modes?: Modes & { gain: number };
  /** Noise-excited resonances: a body that thuds or cracks without a pitch. */
  readonly bands?: readonly { f: number; q: number; decay: number; gain: number }[];
  readonly swoosh?: { from: number; to: number; dur: number; gain: number };
  readonly grains?: { count: number; from: number; to: number; lo: number; hi: number; decay: number; gain: number };
  /** Random pitch spread across variants (0.05 = 5%). */
  readonly spread?: number;
}

/** A strike: thump, crack, ringing modes, a swoosh before it and debris after. */
function impact(ctx: GenContext, p: ImpactParams): Float32Array {
  const out = new Float32Array(samples(p.dur, ctx.sr));
  const pitch = jitter(ctx.rng, 1, p.spread ?? 0.06);
  const at = p.at ?? 0;
  if (p.swoosh) addSweep(ctx, out, Math.max(0, at - p.swoosh.dur * 0.85), p.swoosh.dur, p.swoosh.from * pitch, p.swoosh.to * pitch, 2.5, p.swoosh.gain);
  if (p.thud) addThud(ctx, out, at, p.thud.f0 * pitch, p.thud.f1 * pitch, p.thud.decay, p.thud.gain);
  if (p.noise) addNoise(ctx, out, at, p.noise);
  if (p.modes) addModes(ctx, out, at, p.modes, p.modes.gain, pitch);
  for (const b of p.bands ?? []) addNoise(ctx, out, at, { bp: b.f * pitch, q: b.q, attack: 0.001, decay: b.decay, gain: b.gain });
  if (p.grains) addGrains(ctx, out, at + p.grains.from, at + p.grains.to, p.grains.count, p.grains);
  return out;
}

export interface ChopParams {
  readonly dur: number;
  /** Centre of the dull wooden body in Hz; lower is a thicker trunk. */
  readonly body: number;
  /** Fibres tearing after the bite, 0 to 1. */
  readonly splinter: number;
}

/**
 * An axe biting into a trunk. The wood's body is noise through broad
 * filters with a very short decay, never tuned sines, so it thuds instead
 * of ringing like a xylophone bar.
 */
function chop(ctx: GenContext, p: ChopParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const body = jitter(rng, p.body, 0.12);
  // The edge hitting: a very short bright crack.
  addNoise(ctx, out, 0, { hp: 1800, decay: 0.004, gain: 1 });
  // The trunk taking the blow: two broad noise bands that die in a few tens of milliseconds.
  addNoise(ctx, out, 0, { bp: body, q: 0.9, attack: 0.0015, decay: 0.028, gain: 1.6 });
  addNoise(ctx, out, 0.002, { bp: body * 2.6, q: 0.8, decay: 0.016, gain: 0.8 });
  // Weight behind the axe.
  addThud(ctx, out, 0, 105, 60, 0.035, 0.75);
  // Fibres tearing as the blade wedges in.
  addGrains(ctx, out, 0.012, 0.11, Math.round(7 * p.splinter), { lo: 900, hi: 3200, decay: 0.005, gain: 0.45 });
  return out;
}

export interface DigParams {
  readonly dur: number;
  /** Low-pass corner of the scrape; lower is wetter earth. */
  readonly tone: number;
  readonly dirt: number;
}

/** A shovel biting into earth: a gritty scrape, a dull thud, then falling dirt. */
function dig(ctx: GenContext, p: DigParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const pitch = jitter(rng, 1, 0.08);
  const lp = new Biquad('lowpass', p.tone * pitch, 0.9, sr);
  const grit = new OnePole(70, sr);
  const scrapeLen = samples(0.2, sr);
  for (let i = 0; i < scrapeLen; i++) {
    const rough = 0.4 + 2.5 * Math.abs(grit.process(white(rng)));
    out[i] = out[i]! + lp.process(white(rng)) * rough * bump(i / sr, 0, 0.2) * 0.9;
  }
  addThud(ctx, out, 0.16, 95 * pitch, 50 * pitch, 0.05, 0.9);
  addNoise(ctx, out, 0.16, { lp: 900, decay: 0.03, gain: 0.5 });
  addGrains(ctx, out, 0.22, Math.min(p.dur - 0.05, 0.62), Math.round(18 * p.dirt), { lo: 300, hi: 1400, decay: 0.012, gain: 0.35 });
  return out;
}

export interface ChimeParams {
  /** MIDI note numbers, played one after the other. */
  readonly notes: readonly number[];
  readonly spacing: number;
  /** Partial ratios and their relative decays: marimba, bell or glass. */
  readonly partials: readonly number[];
  readonly decays: readonly number[];
  readonly decay: number;
  readonly dur: number;
  /** Seconds between echoes and how many (map pings). */
  readonly echo?: { delay: number; count: number; feedback: number };
}

/** Struck tuned bars or bells: idle alert, urgent alert, map ping, building done. */
function chime(ctx: GenContext, p: ChimeParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const detune = jitter(rng, 1, 0.004);
  p.notes.forEach((note, k) => {
    const f = midiToHz(note) * detune;
    const at = k * p.spacing;
    addModes(ctx, out, at, {
      freqs: p.partials.map((r) => r * f),
      decays: p.decays.map((d) => d * p.decay),
      amps: p.partials.map((_, j) => 1 / (1 + j * 0.9)),
    }, 0.8 - k * 0.04);
    addNoise(ctx, out, at, { hp: 2500, decay: 0.004, gain: 0.15 });
  });
  if (p.echo) {
    const d = samples(p.echo.delay, sr);
    const dry = out.slice();
    let g = p.echo.feedback;
    for (let e = 1; e <= p.echo.count; e++, g *= p.echo.feedback) {
      for (let i = 0; i + e * d < out.length; i++) out[i + e * d] = out[i + e * d]! + dry[i]! * g;
    }
  }
  return out;
}

export interface BuzzParams {
  /** Frequency of each pulse in Hz. */
  readonly pulses: readonly number[];
  readonly length: number;
  readonly gap: number;
  readonly tone: number;
}

/** The error sound: short low buzzy pulses, falling. */
function buzz(ctx: GenContext, p: BuzzParams): Float32Array {
  const { sr } = ctx;
  const out = new Float32Array(samples(p.pulses.length * (p.length + p.gap) + 0.05, sr));
  p.pulses.forEach((f, k) => {
    const start = Math.round(k * (p.length + p.gap) * sr);
    const a = new Saw(0);
    const b = new Saw(0.5);
    const lp = new Biquad('lowpass', p.tone, 1.2, sr);
    const n = samples(p.length, sr);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.004) * Math.min(1, (p.length - t) / 0.02);
      const x = a.next(f, sr) - b.next(f * 1.005, sr) * 0.8;
      out[start + i] = out[start + i]! + lp.process(x) * env;
    }
  });
  return out;
}

export interface ExplosionParams {
  readonly dur: number;
  /** 1 is a powder keg; 0.3 is a bomber's pop. */
  readonly size: number;
  readonly crackle: number;
  /** Extra sharp crack at the start (gunshots). */
  readonly crack?: number;
}

/** Explosions, cannon and musket fire: a crack, a falling boom, a rumble and debris. */
function explosion(ctx: GenContext, p: ExplosionParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const s = p.size;
  const pitch = jitter(rng, 1, 0.08);
  addNoise(ctx, out, 0, { hp: 700, decay: 0.012 + 0.01 * s, gain: 0.8 + (p.crack ?? 0) });
  addThud(ctx, out, 0, 85 * pitch, 32 * pitch, 0.18 + 0.35 * s, 1.1);
  // The body: noise through a low-pass that closes as the blast dies.
  const lp = new Biquad('lowpass', 4000, 0.8, sr);
  const pink = new PinkNoise(rng);
  const body = samples(Math.min(p.dur, 0.2 + 1.6 * s), sr);
  for (let i = 0; i < body; i++) {
    const t = i / sr;
    if ((i & 15) === 0) lp.set(150 + 3800 * Math.exp(-t / (0.08 + 0.25 * s)), 0.8);
    out[i] = out[i]! + lp.process(pink.next() * 3) * percEnv(t, 0.003, 0.12 + 0.45 * s);
  }
  // Rumble tail.
  const rumble = new Biquad('lowpass', 110, 0.7, sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = out[i]! + rumble.process(white(rng)) * percEnv(t, 0.05, 0.25 + 0.9 * s) * 2.2 * s;
  }
  addGrains(ctx, out, 0.08, 0.15 + 1.1 * s, Math.round(40 * p.crackle * s), { lo: 1500, hi: 6000, decay: 0.006, gain: 0.25 });
  return out;
}

export interface WhooshParams {
  readonly from: number;
  readonly to: number;
  readonly length: number;
  readonly crackle: number;
  readonly crackleLength: number;
  readonly dur: number;
}

/** A torch catching: a rising whoosh of flame, then crackles as it takes. */
function whoosh(ctx: GenContext, p: WhooshParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  addSweep(ctx, out, 0, p.length, p.from, p.to, 1.2, 0.9);
  // A soft roar under the whoosh.
  const roar = new Biquad('lowpass', 500, 0.7, sr);
  const n = samples(p.length + p.crackleLength, sr);
  for (let i = 0; i < n && i < out.length; i++) {
    const t = i / sr;
    out[i] = out[i]! + roar.process(white(rng)) * bump(t, 0, p.length + p.crackleLength) * 0.5;
  }
  addGrains(ctx, out, p.length * 0.6, p.length + p.crackleLength, Math.round(p.crackle), { lo: 1800, hi: 7000, decay: 0.004, gain: 0.5, fadeOut: true });
  return out;
}

export interface SnuffParams {
  readonly hiss: number;
  readonly dur: number;
}

/** A light going out: a soft puff, then a hiss that dies away. */
function snuff(ctx: GenContext, p: SnuffParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  addNoise(ctx, out, 0, { lp: 700, attack: 0.01, decay: 0.06, gain: 1.2 });
  const hp = new Biquad('highpass', 3200, 0.7, sr);
  const flutter = new OnePole(30, sr);
  const n = samples(p.dur - 0.02, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const sizzle = 0.5 + 3 * Math.abs(flutter.process(white(rng)));
    out[i] = out[i]! + hp.process(white(rng)) * percEnv(t - 0.02, 0.02, p.dur * 0.3) * p.hiss * sizzle * 0.5;
  }
  return out;
}

export interface HornParams {
  /** Notes as [midi, seconds]; a zero midi is a rest. */
  readonly notes: readonly (readonly [number, number])[];
  readonly bright: number;
  readonly dur: number;
}

/** A war horn or signal horn: brassy saws, a lip bend up into the note, vibrato. */
function horn(ctx: GenContext, p: HornParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  let at = 0;
  const detune = jitter(rng, 1, 0.006);
  for (const [note, len] of p.notes) {
    if (note > 0) renderBrass(ctx, out, at, midiToHz(note) * detune, len, p.bright, 0.9);
    at += len;
  }
  return out;
}

/** One brass note into `out`; shared with the music. */
export function renderBrass(ctx: GenContext, out: Float32Array, at: number, freq: number, len: number, bright: number, gain: number): void {
  const { sr, rng } = ctx;
  const start = Math.round(at * sr);
  const release = 0.35;
  const n = Math.min(out.length - start, samples(len + release, sr));
  const a = new Saw(rng());
  const b = new Saw(rng());
  const lp = new Biquad('lowpass', freq * 2, 1.4, sr);
  const breath = new Biquad('bandpass', freq * 3, 2, sr);
  const attack = Math.min(0.12, len * 0.4);
  const vibPh = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < attack ? Math.pow(t / attack, 1.5) : t < len ? 1 - 0.15 * Math.min(1, (t - attack) / 1.5) : 0.85 * Math.max(0, 1 - (t - len) / release);
    const bend = 1 - 0.06 * Math.exp(-t / 0.05);
    const vib = 1 + 0.004 * Math.min(1, Math.max(0, t - 0.3) / 0.4) * Math.sin(vibPh + TAU * 5.2 * t);
    const f = freq * bend * vib;
    if ((i & 15) === 0) lp.set(freq * (1.2 + bright * 5 * env), 1.4);
    const x = a.next(f, sr) + b.next(f * 1.0021, sr) * 0.35;
    out[start + i] = out[start + i]! + (lp.process(x) * 0.6 + breath.process(white(rng)) * 0.08) * env * gain;
  }
}

export interface TwangParams {
  readonly freq: number;
  readonly decay: number;
  readonly whoosh: number;
  readonly dur: number;
}

/** A bowstring or sling release: a low string twang and the shot flying off. */
function twang(ctx: GenContext, p: TwangParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const s = pluckString(ctx, jitter(rng, p.freq, 0.05), p.dur, { decay: p.decay, bright: 0.3, gain: 1 });
  for (let i = 0; i < s.length && i < out.length; i++) out[i] = out[i]! + s[i]!;
  addThud(ctx, out, 0, 160, 90, 0.03, 0.4);
  if (p.whoosh > 0) addSweep(ctx, out, 0.01, 0.22, 2500, 900, 1.5, p.whoosh);
  return out;
}

export interface SparkleParams {
  readonly base: number;
  readonly rise: number;
  readonly grains: number;
  readonly dur: number;
}

/** A spell being cast: a rising tone, a shimmer of glassy grains and a breath of air. */
function sparkle(ctx: GenContext, p: SparkleParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  let ph = 0;
  let ph2 = 0;
  const len = p.dur * 0.6;
  for (let i = 0; i < samples(len, sr); i++) {
    const t = i / sr;
    const f = p.base * Math.pow(p.rise, t / len);
    ph += (TAU * f) / sr;
    ph2 += (TAU * f * 1.5) / sr;
    out[i] = out[i]! + (Math.sin(ph + 1.5 * Math.sin(ph2)) * 0.35) * bump(t, 0, len);
  }
  for (let g = 0; g < p.grains; g++) {
    const t = range(rng, 0.02, p.dur * 0.75);
    addModes(ctx, out, t, { freqs: [range(rng, 2200, 6500)], decays: [0.08], amps: [1] }, 0.25 * (1 - t / p.dur));
  }
  addSweep(ctx, out, 0, p.dur * 0.7, 600, 5000, 1, 0.35);
  return out;
}

export interface SquelchParams {
  readonly from: number;
  readonly to: number;
  readonly length: number;
  readonly dur: number;
}

/** A monster's body going down: a wet, falling formant gurgle and a thump. */
function squelch(ctx: GenContext, p: SquelchParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const bp = new Biquad('bandpass', p.from, 4, sr);
  const wob = rng() * TAU;
  const n = samples(p.length, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = t / p.length;
    if ((i & 15) === 0) bp.set(p.from * Math.pow(p.to / p.from, x) * (1 + 0.25 * Math.sin(wob + TAU * 9 * t)), 4);
    out[i] = out[i]! + bp.process(white(rng)) * 2.5 * bump(t, 0, p.length);
  }
  addThud(ctx, out, p.length * 0.7, 110, 45, 0.08, 0.9);
  addGrains(ctx, out, 0.02, p.length, 10, { lo: 300, hi: 1100, decay: 0.01, gain: 0.3 });
  return out;
}

export interface CollapseParams {
  readonly dur: number;
  readonly pieces: number;
}

/** A building coming down: a rush of timber and stone impacts over a rumble. */
function collapse(ctx: GenContext, p: CollapseParams): Float32Array {
  const { sr, rng } = ctx;
  const out = new Float32Array(samples(p.dur, sr));
  const rumble = new Biquad('lowpass', 160, 0.7, sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = out[i]! + rumble.process(white(rng)) * percEnv(t, 0.15, p.dur * 0.35) * 2;
  }
  for (let k = 0; k < p.pieces; k++) {
    const t = Math.pow(rng(), 1.6) * p.dur * 0.7;
    const g = 0.7 * (1 - t / p.dur);
    addNoise(ctx, out, t, { bp: range(rng, 180, 320), q: 0.8, decay: 0.04, gain: g * 1.4 });
    addNoise(ctx, out, t, { bp: range(rng, 600, 1100), q: 0.9, decay: 0.02, gain: g * 0.8 });
    addNoise(ctx, out, t, { lp: 2500, decay: 0.02, gain: g * 0.5 });
  }
  addThud(ctx, out, 0.05, 70, 35, 0.35, 1);
  return out;
}

export interface ClickParams {
  readonly freq: number;
  readonly decay: number;
  readonly dur: number;
}

/** A small interface tick. */
function click(ctx: GenContext, p: ClickParams): Float32Array {
  const out = new Float32Array(samples(p.dur, ctx.sr));
  addModes(ctx, out, 0, { freqs: [p.freq, p.freq * 2.4], decays: [p.decay, p.decay * 0.5], amps: [1, 0.4] }, 1);
  addNoise(ctx, out, 0, { hp: 3000, decay: 0.002, gain: 0.4 });
  return out;
}

// ---------------------------------------------------------------- registry

export const GENERATORS = {
  impact,
  chop,
  dig,
  chime,
  buzz,
  explosion,
  whoosh,
  snuff,
  horn,
  twang,
  sparkle,
  squelch,
  collapse,
  click,
} as const;

export type GeneratorName = keyof typeof GENERATORS;
export type ParamsOf<G extends GeneratorName> = Parameters<(typeof GENERATORS)[G]>[1];
