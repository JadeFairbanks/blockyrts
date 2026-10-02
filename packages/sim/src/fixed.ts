// Fixed-point helpers. Every quantity in the simulation is an integer held in
// an ordinary JS number (exact below 2^53). See docs/technical-decisions.md,
// decision 2.

import { SIN_QUARTER } from './trig-table.ts';

/** One world unit (wu) is 0.125 mm. */
export const WU_PER_METRE = 8000;
/** One Blockbench model unit (2.8125 cm). */
export const WU_PER_MODEL_UNIT = 225;
/** One terrain unit (11.25 cm), the vertical step of a column layer. */
export const WU_PER_TERRAIN_UNIT = 900;
/** One column (45 cm), the horizontal grid of the world. */
export const WU_PER_COLUMN = 3600;
/** Columns along one side of a chunk (28.8 m). */
export const COLUMNS_PER_CHUNK = 64;
/** The world edge, 100 km from the start in every direction. */
export const WORLD_EDGE_WU = 100_000 * WU_PER_METRE;

/** Simulation steps per second. */
export const STEPS_PER_SECOND = 20;
/** The state hash is taken every this many steps. */
export const HASH_INTERVAL_STEPS = 20;

/** A full turn as a 16-bit angle. */
export const ANGLE_TURN = 65536;
/** Fixed-point one for sin and cos results (2^16). */
export const TRIG_ONE = 65536;

/** Integer division rounding toward negative infinity. b must be non-zero. */
export function floorDiv(a: number, b: number): number {
  // Adding 0 turns a -0 result into 0, so no negative zero reaches the state.
  // eslint-disable-next-line no-restricted-syntax -- the one sanctioned division in the sim
  return Math.floor(a / b) + 0;
}

/** Remainder with the sign of the divisor, so floorMod(-1, 4) === 3. */
export function floorMod(a: number, b: number): number {
  return a - floorDiv(a, b) * b;
}

/** Floor of the square root of a non-negative integer below 2^53, by Newton iteration. */
export function isqrt(n: number): number {
  if (n < 0) throw new RangeError('isqrt of a negative number');
  if (n < 2) return n;
  // Start above the root: 2^ceil(bits/2) using an integer bit length.
  let bits = 0;
  for (let t = n; t > 0; t = floorDiv(t, 2)) bits++;
  let x = 2 ** floorDiv(bits + 1, 2);
  for (;;) {
    const y = floorDiv(x + floorDiv(n, x), 2);
    if (y >= x) return x;
    x = y;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sinIndex(i: number): number {
  // i is a table index in 0..4096 (wrapping), each step 1/4096 of a turn.
  const idx = i & 4095;
  const quadrant = idx >> 10;
  const k = idx & 1023;
  switch (quadrant) {
    case 0:
      return SIN_QUARTER[k]!;
    case 1:
      return SIN_QUARTER[1024 - k]!;
    case 2:
      return -SIN_QUARTER[k]! | 0;
    default:
      return -SIN_QUARTER[1024 - k]! | 0;
  }
}

/** sin of a 16-bit angle, scaled by 2^16, linearly interpolated between table entries. */
export function sin16(angle: number): number {
  const a = angle & 0xffff;
  const i = a >> 4;
  const frac = a & 15;
  const v0 = sinIndex(i);
  if (frac === 0) return v0;
  const v1 = sinIndex(i + 1);
  return v0 + ((v1 - v0) * frac >> 4);
}

/** cos of a 16-bit angle, scaled by 2^16. */
export function cos16(angle: number): number {
  return sin16(angle + 16384);
}

/**
 * The 16-bit angle whose sine and cosine point along (y, x), like Math.atan2(y, x)
 * but returning 0..65535. Resolution is 1/4096 of a turn. atan2Angle(0, 0) is 0.
 */
export function atan2Angle(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ay = Math.abs(y);
  const ax = Math.abs(x);
  // Largest k in 0..1024 with tan(k / 4096 turn) <= ay / ax, i.e. sin_k * ax <= cos_k * ay.
  let lo = 0;
  let hi = 1024;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SIN_QUARTER[mid]! * ax <= SIN_QUARTER[1024 - mid]! * ay) lo = mid;
    else hi = mid - 1;
  }
  const phi = lo << 4;
  let angle: number;
  if (y >= 0) angle = x >= 0 ? phi : 32768 - phi;
  else angle = x < 0 ? 32768 + phi : ANGLE_TURN - phi;
  return angle & 0xffff;
}

/**
 * Heading convention: heading 0 faces -Z (the way an unrotated model faces) and
 * the heading equals three.js rotation.y in 1/65536 turns, so the forward
 * vector is (-sin h, -cos h) on the (x, z) ground plane.
 */
export function headingTowards(dx: number, dz: number): number {
  return atan2Angle(-dx, -dz);
}

/**
 * Length of (dx, dz) in the same units, exact to within 1 for any coordinates
 * inside the world edge. Large vectors are shifted down first so the squares
 * stay below 2^53.
 */
export function length2d(dx: number, dz: number): number {
  let ax = Math.abs(dx);
  let az = Math.abs(dz);
  let shift = 0;
  while (ax > 0x1ffffff || az > 0x1ffffff) {
    ax = floorDiv(ax, 2);
    az = floorDiv(az, 2);
    shift++;
  }
  return isqrt(ax * ax + az * az) * 2 ** shift;
}
