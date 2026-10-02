// Seeded random numbers. Each subsystem owns a named xoshiro128** stream so an
// extra draw in one subsystem never shifts another. World generation never uses
// a stream: it uses the stateless coordinate hash below.

/** The named streams, in the fixed order they are serialised and hashed. */
export const STREAM_NAMES = ['ai', 'spawns', 'combat', 'trade', 'weather'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32: expands one 32-bit seed into a sequence of well-mixed words. */
export function splitmix32(state: number): { value: number; next: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return { value: z, next };
}

/** xoshiro128** by Blackman and Vigna, 32-bit output. */
export class Xoshiro128 {
  s0: number;
  s1: number;
  s2: number;
  s3: number;

  constructor(s0: number, s1: number, s2: number, s3: number) {
    this.s0 = s0 >>> 0;
    this.s1 = s1 >>> 0;
    this.s2 = s2 >>> 0;
    this.s3 = s3 >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Seeds the four state words from one 32-bit seed with SplitMix32. */
  static fromSeed(seed: number): Xoshiro128 {
    let st = seed >>> 0;
    const words: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = splitmix32(st);
      words.push(r.value);
      st = r.next;
    }
    return new Xoshiro128(words[0]!, words[1]!, words[2]!, words[3]!);
  }

  /** The next unsigned 32-bit value. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** A uniform integer in 0..n-1 without modulo bias. n must be in 1..2^32. */
  nextInt(n: number): number {
    if (n <= 0 || n > 0x100000000 || n !== Math.trunc(n)) throw new RangeError(`bad range ${n}`);
    const limit = 0x100000000 - (0x100000000 % n);
    for (;;) {
      const v = this.nextU32();
      if (v < limit) return v % n;
    }
  }

  /** A uniform integer in lo..hi inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.nextInt(hi - lo + 1);
  }

  getState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  clone(): Xoshiro128 {
    return new Xoshiro128(this.s0, this.s1, this.s2, this.s3);
  }
}

export type Streams = Record<StreamName, Xoshiro128>;

/** FNV-1a of an ASCII name, used to give each stream its own seed. */
function nameHash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/** One stream per subsystem, each seeded from the world seed and the stream's name. */
export function createStreams(worldSeed: number): Streams {
  const streams = {} as Streams;
  for (const name of STREAM_NAMES) {
    streams[name] = Xoshiro128.fromSeed(hash32(worldSeed, nameHash(name)));
  }
  return streams;
}

function fmix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Stateless 32-bit hash of a seed and any number of 32-bit integers
 * (MurmurHash3 style). World generation uses this with cell, chunk or column
 * coordinates so any place can be generated alone, in any order.
 */
export function hash32(seed: number, ...values: number[]): number {
  let h = seed >>> 0;
  for (const v of values) {
    let k = Math.imul(v | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  return fmix32((h ^ (values.length * 4)) >>> 0);
}
