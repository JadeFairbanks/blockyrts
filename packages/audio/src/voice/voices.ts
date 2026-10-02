// Unit voice cues: short non-verbal grunts, calls and cries made by a
// formant synthesiser (a buzzing glottal source through three vowel
// resonances). Each unit family has its own pitch, size and roughness; each
// event (selected, ordered, hungry...) has a few alternative little scripts.
import { Biquad, OnePole, Saw, TAU, jitter, samples, white, type Rng } from '../dsp/core.ts';
import type { GenContext } from '../sfx/generators.ts';

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u' | 'm';

/** Adult male formants (Hz) and their relative levels. */
const FORMANTS: Record<Vowel, { f: readonly [number, number, number]; g: readonly [number, number, number] }> = {
  a: { f: [730, 1090, 2440], g: [1, 0.55, 0.25] },
  e: { f: [530, 1840, 2480], g: [1, 0.45, 0.3] },
  i: { f: [300, 2290, 3010], g: [1, 0.35, 0.3] },
  o: { f: [570, 840, 2410], g: [1, 0.6, 0.15] },
  u: { f: [320, 870, 2240], g: [1, 0.4, 0.1] },
  m: { f: [260, 1200, 2300], g: [1, 0.08, 0.04] },
};

export interface VoiceFamily {
  /** Speaking pitch in Hz. */
  readonly f0: number;
  /** Formant scale: above 1 is a smaller body, below 1 a bigger one. */
  readonly size: number;
  /** Breathiness, 0 to 1. */
  readonly breath: number;
  /** Roughness, 0 to 1: dwarves, hobgoblins and gnolls are rough. */
  readonly rasp: number;
  /** Subharmonic growl, 0 to 1. */
  readonly growl: number;
  /** Time scale of every cue: below 1 is quicker. */
  readonly pace: number;
  /** Vibrato depth (fraction of pitch). */
  readonly vibrato: number;
}

/**
 * The families. Pitches and sizes follow the doc's descriptions: mages are
 * all women, Halflings and goblins small, Dwarves short and broad, gnolls and
 * hobgoblins big brutes, kobolds small yappers. The values are picks.
 */
export const VOICE_FAMILIES = {
  worker: { f0: 125, size: 1.0, breath: 0.12, rasp: 0.08, growl: 0, pace: 1, vibrato: 0 },
  warrior: { f0: 102, size: 0.95, breath: 0.08, rasp: 0.2, growl: 0.05, pace: 0.95, vibrato: 0 },
  mage: { f0: 215, size: 1.17, breath: 0.28, rasp: 0.02, growl: 0, pace: 1.05, vibrato: 0.006 },
  halfling: { f0: 235, size: 1.28, breath: 0.15, rasp: 0.04, growl: 0, pace: 0.85, vibrato: 0 },
  runkin: { f0: 175, size: 1.12, breath: 0.25, rasp: 0.06, growl: 0, pace: 0.95, vibrato: 0 },
  elf: { f0: 195, size: 1.1, breath: 0.32, rasp: 0, growl: 0, pace: 1.15, vibrato: 0.008 },
  dwarf: { f0: 88, size: 0.86, breath: 0.06, rasp: 0.32, growl: 0.12, pace: 0.95, vibrato: 0 },
  goblin: { f0: 290, size: 1.35, breath: 0.15, rasp: 0.4, growl: 0, pace: 0.75, vibrato: 0 },
  kobold: { f0: 340, size: 1.4, breath: 0.2, rasp: 0.25, growl: 0, pace: 0.7, vibrato: 0 },
  gnoll: { f0: 105, size: 0.88, breath: 0.25, rasp: 0.55, growl: 0.35, pace: 0.9, vibrato: 0 },
  hobgoblin: { f0: 92, size: 0.9, breath: 0.1, rasp: 0.45, growl: 0.2, pace: 1, vibrato: 0 },
} as const satisfies Record<string, VoiceFamily>;

export type VoiceFamilyId = keyof typeof VOICE_FAMILIES;

/** [vowel or "a>o" glide, seconds, start pitch, end pitch, level, gap before, effort]. */
export type Syllable = readonly [string, number, number, number, number, number?, number?];

/**
 * Every event a unit can voice, from the doc's Audio list ("when units get
 * orders, are hungry, are under attack, or run out of a resource"), Order
 * feedback ("selected units also play a short voice or sound cue"),
 * Triggered speech ("or they cannot carry out an order"), the neutral
 * peoples' speech moments (first meeting, trading, attacked, warnings) and a
 * death cry. Each has alternative scripts; variants cycle through them.
 */
export const VOICE_EVENTS = {
  select: [[['m', 0.16, 1, 1.12, 0.7]], [['e', 0.07, 1.05, 1, 0.6], ['a', 0.12, 1.1, 1.2, 0.8, 0.02]], [['u', 0.08, 1, 1, 0.6], ['m', 0.12, 1.05, 1.15, 0.7, 0.01]]],
  acknowledge: [[['u', 0.1, 1.12, 0.98, 0.9, 0, 0.2]], [['a', 0.09, 1, 1.05, 0.8], ['a', 0.13, 1.1, 0.9, 0.9, 0.04]], [['m', 0.09, 1, 1, 0.7], ['m', 0.14, 1.12, 1, 0.8, 0.05]]],
  attack: [[['a', 0.24, 1.35, 1.1, 1, 0, 0.9]], [['i>a', 0.28, 1.3, 1.2, 1, 0, 0.8]], [['o>a', 0.25, 1.2, 1.35, 1, 0, 1]]],
  hungry: [[['o', 0.45, 1, 0.8, 0.6, 0, 0]], [['u>o', 0.35, 0.95, 0.8, 0.6], ['m', 0.22, 0.85, 0.75, 0.45, 0.05]], [['a>u', 0.42, 1, 0.82, 0.55]]],
  under_attack: [[['a', 0.1, 1.4, 1.6, 1, 0, 0.8], ['e', 0.14, 1.5, 1.3, 1, 0.06, 0.8]], [['a>i', 0.2, 1.5, 1.7, 1, 0, 0.9]], [['e', 0.08, 1.45, 1.55, 1, 0, 0.7], ['a', 0.16, 1.6, 1.35, 1, 0.05, 0.9]]],
  resource_out: [[['m', 0.3, 1, 0.85, 0.6], ['e', 0.12, 0.95, 1, 0.5, 0.05]], [['u>o', 0.3, 1.05, 0.85, 0.6]], [['a', 0.12, 1, 1.05, 0.5], ['m', 0.22, 0.95, 0.82, 0.55, 0.04]]],
  cannot: [[['u', 0.11, 1, 1, 0.7], ['u', 0.15, 0.85, 0.82, 0.7, 0.05]], [['e', 0.1, 1, 1, 0.7], ['e', 0.16, 0.85, 0.85, 0.7, 0.04]], [['m', 0.1, 1.05, 1.05, 0.65], ['m', 0.16, 0.88, 0.85, 0.65, 0.05]]],
  death: [[['a>o', 0.6, 1.3, 0.55, 1, 0, 0.7]], [['e>u', 0.5, 1.4, 0.6, 1, 0, 0.8]], [['a', 0.12, 1.5, 1.4, 1, 0, 0.9], ['a>u', 0.45, 1.2, 0.55, 0.8, 0.03, 0.5]]],
  greet: [[['e', 0.12, 1.1, 1.2, 0.8], ['o', 0.22, 1.25, 1, 0.9, 0.03]], [['a', 0.1, 1, 1.15, 0.8], ['i', 0.18, 1.2, 1.3, 0.8, 0.03]], [['o', 0.14, 1.05, 1.2, 0.8], ['e', 0.2, 1.2, 1.05, 0.8, 0.03]]],
  trade: [[['m', 0.1, 1, 1, 0.6], ['m', 0.18, 1.05, 1.25, 0.7, 0.04]], [['o', 0.25, 1, 1.2, 0.7]], [['a', 0.1, 1.05, 1.1, 0.7], ['e', 0.14, 1.2, 1.25, 0.7, 0.02]]],
  warn: [[['o', 0.35, 0.85, 0.8, 0.9, 0, 0.6]], [['e>o', 0.3, 0.9, 0.8, 0.9, 0, 0.5], ['o', 0.15, 0.8, 0.75, 0.8, 0.06, 0.5]], [['m', 0.18, 0.9, 0.85, 0.8, 0, 0.4], ['a', 0.2, 0.95, 0.8, 0.9, 0.03, 0.7]]],
  alert: [[['a>i', 0.3, 1.2, 1.5, 1, 0, 0.8]], [['o', 0.12, 1.1, 1.3, 1, 0, 0.6], ['o', 0.2, 1.3, 1.2, 1, 0.05, 0.7]], [['e>a', 0.26, 1.25, 1.45, 1, 0, 0.9]]],
} as const satisfies Record<string, readonly (readonly Syllable[])[]>;

export type VoiceEventId = keyof typeof VOICE_EVENTS;

/** Which events each family voices. */
const PLAYER_UNIT: readonly VoiceEventId[] = ['select', 'acknowledge', 'attack', 'hungry', 'under_attack', 'cannot', 'death'];
const PEOPLE: readonly VoiceEventId[] = ['select', 'acknowledge', 'attack', 'under_attack', 'greet', 'trade', 'warn', 'death'];
const HOSTILE: readonly VoiceEventId[] = ['alert', 'attack', 'under_attack', 'death'];

export const FAMILY_EVENTS: Record<VoiceFamilyId, readonly VoiceEventId[]> = {
  worker: [...PLAYER_UNIT, 'resource_out'],
  warrior: PLAYER_UNIT,
  mage: PLAYER_UNIT,
  halfling: PEOPLE,
  runkin: PEOPLE,
  elf: PEOPLE,
  dwarf: PEOPLE,
  goblin: HOSTILE,
  kobold: HOSTILE,
  gnoll: HOSTILE,
  hobgoblin: HOSTILE,
};

export interface VoiceParams {
  readonly family: VoiceFamilyId;
  readonly event: VoiceEventId;
}

function parseVowels(spec: string): [Vowel, Vowel] {
  const [a, b] = spec.split('>') as [Vowel, Vowel | undefined];
  return [a, b ?? a];
}

/** Renders one cue. The variant number picks the script; its stream picks the small differences. */
export function voice(ctx: GenContext, p: VoiceParams): Float32Array {
  const { sr, rng } = ctx;
  const fam: VoiceFamily = VOICE_FAMILIES[p.family];
  const scripts = VOICE_EVENTS[p.event];
  const script = scripts[ctx.variant % scripts.length]!;
  const pitch = jitter(rng, fam.f0, 0.05);
  const size = jitter(rng, fam.size, 0.03);
  const pace = jitter(rng, fam.pace, 0.08);
  let total = 0.06;
  for (const s of script) total += (s[1] + (s[5] ?? 0)) * pace;
  const out = new Float32Array(samples(total + 0.1, sr));
  let at = 0.01;
  for (const s of script) {
    at += (s[5] ?? 0) * pace;
    const len = s[1] * pace;
    syllable(out, sr, rng, fam, at, len, parseVowels(s[0]), pitch * s[2], pitch * s[3], size, s[4], s[6] ?? 0.3);
    at += len;
  }
  return out;
}

function syllable(
  out: Float32Array,
  sr: number,
  rng: Rng,
  fam: VoiceFamily,
  at: number,
  len: number,
  vowels: [Vowel, Vowel],
  p0: number,
  p1: number,
  size: number,
  level: number,
  effort: number,
): void {
  const start = Math.round(at * sr);
  const n = Math.min(out.length - start, samples(len, sr));
  const src = new Saw(rng());
  const sub = new Saw(rng());
  const tilt = new OnePole(900 + 2500 * effort, sr);
  const jit = new OnePole(40, sr);
  const shimmer = new OnePole(25, sr);
  const filters = [0, 1, 2].map((k) => new Biquad('bandpass', FORMANTS[vowels[0]].f[k]! * size, 8, sr));
  const rasp = Math.min(1, fam.rasp + effort * 0.25);
  const vibPh = rng() * TAU;
  let gains = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = i / n;
    if ((i & 31) === 0) {
      const a = FORMANTS[vowels[0]];
      const b = FORMANTS[vowels[1]];
      const k = x * x * (3 - 2 * x);
      gains = [0, 1, 2].map((j) => a.g[j]! + (b.g[j]! - a.g[j]!) * k);
      filters.forEach((f, j) => {
        const freq = (a.f[j]! + (b.f[j]! - a.f[j]!) * k) * size;
        f.set(freq, freq / (60 + j * 40));
      });
    }
    const wobble = 1 + rasp * 0.06 * jit.process(white(rng)) * 6 + fam.vibrato * Math.sin(vibPh + TAU * 5.5 * t);
    const f = (p0 + (p1 - p0) * x) * wobble;
    let s = tilt.process(src.next(f, sr));
    s *= 1 + rasp * 2.5 * shimmer.process(white(rng));
    if (fam.growl > 0) s += fam.growl * tilt.process(sub.next(f * 0.5, sr)) * 0.8;
    s += white(rng) * (fam.breath + 0.05) * 0.6;
    let y = 0;
    for (let j = 0; j < 3; j++) y += filters[j]!.process(s) * gains[j]!;
    const env = Math.min(1, t / 0.018) * Math.min(1, (len - t) / 0.045);
    out[start + i] = out[start + i]! + y * env * level * 4;
  }
}
