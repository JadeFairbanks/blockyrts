// Whole-number noise for world generation. Everything here is a pure function
// of the seed and integer coordinates, built on 32-bit hashing, so the land
// comes out the same on every computer and in any order (Technology, World
// generation and terrain: "whole-number noise made by hashing").

import { floorDiv } from '../fixed.ts';

/** A fast 32-bit hash of a seed and two integers (murmur3 finaliser). */
export function hash2(seed: number, x: number, z: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(x | 0, 0xcc9e2d51);
  h = Math.imul((h << 13) | (h >>> 19), 5) + 0xe6546b64;
  h ^= Math.imul(z | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hash of a seed and three integers. */
export function hash3(seed: number, x: number, y: number, z: number): number {
  return hash2(hash2(seed, x, y), z, 0x5bd1e995);
}

/** Smoothstep on a 10-bit fraction: t in 0..1024 gives 0..1024. */
export function smooth10(t: number): number {
  return (t * t * (3072 - 2 * t)) >> 20;
}

/**
 * Value noise in 0..65535 with lattice spacing 2^shift (in whatever integer
 * unit x and z are given), smoothly interpolated. Pure integer maths.
 */
export function valueNoise(seed: number, x: number, z: number, shift: number): number {
  const xi = x >> shift;
  const zi = z >> shift;
  const mask = (1 << shift) - 1;
  // 10-bit fractions.
  const fx = smooth10(shift >= 10 ? (x & mask) >> (shift - 10) : (x & mask) << (10 - shift));
  const fz = smooth10(shift >= 10 ? (z & mask) >> (shift - 10) : (z & mask) << (10 - shift));
  const a = hash2(seed, xi, zi) & 0xffff;
  const b = hash2(seed, xi + 1, zi) & 0xffff;
  const c = hash2(seed, xi, zi + 1) & 0xffff;
  const d = hash2(seed, xi + 1, zi + 1) & 0xffff;
  const ab = a + (((b - a) * fx) >> 10);
  const cd = c + (((d - c) * fx) >> 10);
  return ab + (((cd - ab) * fz) >> 10);
}

/**
 * Two to four octaves of value noise summed with halving weights, scaled back
 * to 0..65535. `shift` is the coarsest octave's spacing.
 */
export function fbm(seed: number, x: number, z: number, shift: number, octaves: number): number {
  let sum = 0;
  let weight = 0;
  let w = 8;
  for (let o = 0; o < octaves && shift - o >= 0; o++) {
    sum += valueNoise(seed + o * 0x632be5ab, x, z, shift - o) * w;
    weight += w;
    w >>= 1;
  }
  return floorDiv(sum, weight);
}

/** Maps a 0..65535 noise value to -half..half of `amplitude` (any integer unit). */
export function centred(n: number, amplitude: number): number {
  return ((n - 32768) * amplitude) >> 16;
}
