import { describe, expect, it } from 'vitest';
import {
  ANGLE_TURN,
  atan2Angle,
  cos16,
  floorDiv,
  floorMod,
  headingTowards,
  isqrt,
  length2d,
  sin16,
  TRIG_ONE,
  WORLD_EDGE_WU,
  WU_PER_COLUMN,
  WU_PER_METRE,
  WU_PER_MODEL_UNIT,
  WU_PER_TERRAIN_UNIT,
} from '../src/index.ts';

describe('world units', () => {
  it('make every game size a whole number', () => {
    expect(WU_PER_METRE).toBe(8000);
    expect(WU_PER_COLUMN).toBe(3600); // 45 cm
    expect(WU_PER_TERRAIN_UNIT).toBe(900); // 11.25 cm
    expect(WU_PER_MODEL_UNIT).toBe(225); // 2.8125 cm
    expect(WU_PER_COLUMN).toBe(4 * WU_PER_TERRAIN_UNIT);
    expect(WORLD_EDGE_WU).toBeLessThan(2 ** 31);
  });
});

describe('floorDiv and floorMod', () => {
  it('round toward negative infinity', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(-7, -2)).toBe(3);
    expect(floorDiv(0, 5)).toBe(0);
    expect(floorMod(-1, 4)).toBe(3);
    expect(floorMod(9, 4)).toBe(1);
  });
});

describe('isqrt', () => {
  it('gives known answers', () => {
    const cases: Array<[number, number]> = [
      [0, 0], [1, 1], [2, 1], [3, 1], [4, 2], [15, 3], [16, 4], [17, 4],
      [99, 9], [100, 10], [2 ** 32, 2 ** 16], [2 ** 52, 2 ** 26], [2 ** 53 - 1, 94906265],
    ];
    for (const [n, r] of cases) expect(isqrt(n), `isqrt(${n})`).toBe(r);
  });
  it('is the floor of the root for many values', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    for (let k = 1; k < 2 ** 26; k = k * 3 + 1) {
      for (const n of [k * k - 1, k * k, k * k + 1]) {
        const r = isqrt(n);
        expect(r * r <= n && (r + 1) * (r + 1) > n, `n=${n}`).toBe(true);
      }
    }
  });
  it('rejects negatives', () => {
    expect(() => isqrt(-1)).toThrow();
  });
});

describe('sin16 and cos16', () => {
  it('hit the exact quarter points', () => {
    expect(sin16(0)).toBe(0);
    expect(sin16(16384)).toBe(TRIG_ONE);
    expect(sin16(32768)).toBe(0);
    expect(sin16(49152)).toBe(-TRIG_ONE);
    expect(cos16(0)).toBe(TRIG_ONE);
    expect(cos16(32768)).toBe(-TRIG_ONE);
    expect(sin16(ANGLE_TURN + 16384)).toBe(TRIG_ONE);
  });
  it('stay within 2/65536 of the true value at every angle', () => {
    for (let a = 0; a < ANGLE_TURN; a++) {
      const t = (a / ANGLE_TURN) * 2 * Math.PI;
      expect(Math.abs(sin16(a) - Math.sin(t) * TRIG_ONE)).toBeLessThanOrEqual(2);
      expect(Math.abs(cos16(a) - Math.cos(t) * TRIG_ONE)).toBeLessThanOrEqual(2);
    }
  });
});

describe('atan2Angle', () => {
  it('gives the axis angles', () => {
    expect(atan2Angle(0, 1)).toBe(0);
    expect(atan2Angle(1, 0)).toBe(16384);
    expect(atan2Angle(0, -1)).toBe(32768);
    expect(atan2Angle(-1, 0)).toBe(49152);
    expect(atan2Angle(1, 1)).toBe(8192);
    expect(atan2Angle(0, 0)).toBe(0);
  });
  it('is within one table step of Math.atan2', () => {
    for (let k = 0; k < 2000; k++) {
      const y = ((k * 7919) % 20001) - 10000;
      const x = ((k * 104729) % 20001) - 10000;
      if (x === 0 && y === 0) continue;
      let want = (Math.atan2(y, x) / (2 * Math.PI)) * ANGLE_TURN;
      if (want < 0) want += ANGLE_TURN;
      let err = Math.abs(atan2Angle(y, x) - want);
      err = Math.min(err, ANGLE_TURN - err);
      expect(err).toBeLessThanOrEqual(16);
    }
  });
  it('handles world-edge coordinates without losing precision', () => {
    expect(atan2Angle(WORLD_EDGE_WU, WORLD_EDGE_WU)).toBe(8192);
    expect(atan2Angle(-WORLD_EDGE_WU, 2 * WORLD_EDGE_WU)).toBeGreaterThan(49152);
  });
});

describe('headingTowards', () => {
  it('uses heading 0 for -Z and matches three.js rotation.y', () => {
    expect(headingTowards(0, -10)).toBe(0);
    // rotation.y of +90 degrees turns a -Z facing model to face -X.
    expect(headingTowards(-10, 0)).toBe(16384);
    expect(headingTowards(0, 10)).toBe(32768);
    expect(headingTowards(10, 0)).toBe(49152);
  });
});

describe('length2d', () => {
  it('is exact for small vectors and safe at the world edge', () => {
    expect(length2d(3, 4)).toBe(5);
    expect(length2d(-3000, 4000)).toBe(5000);
    const big = length2d(2 * WORLD_EDGE_WU, 2 * WORLD_EDGE_WU);
    const want = Math.sqrt(2) * 2 * WORLD_EDGE_WU;
    expect(Math.abs(big - want) / want).toBeLessThan(1e-6);
  });
});

describe('negative zero', () => {
  it('never comes out of the helpers', () => {
    expect(Object.is(floorDiv(0, -5), 0)).toBe(true);
    expect(Object.is(floorDiv(-0, 5), 0)).toBe(true);
    for (let a = 0; a < ANGLE_TURN; a += 1024) {
      expect(Object.is(sin16(a), -0)).toBe(false);
      expect(Object.is(cos16(a), -0)).toBe(false);
    }
  });
});
