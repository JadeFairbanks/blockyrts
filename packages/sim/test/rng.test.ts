import { describe, expect, it } from 'vitest';
import { createStreams, hash32, STREAM_NAMES, Xoshiro128 } from '../src/index.ts';

describe('xoshiro128**', () => {
  it('matches the reference C implementation', () => {
    // Values from Blackman and Vigna's xoshiro128starstar.c with state {1, 2, 3, 4}.
    const r = new Xoshiro128(1, 2, 3, 4);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492,
    ]);
  });

  it('is reproducible from a seed and survives a state copy', () => {
    const a = Xoshiro128.fromSeed(1);
    const b = Xoshiro128.fromSeed(1);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
    const c = a.clone();
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(c.nextU32());
  });

  it('gives known values for seed 1 (guards against accidental change)', () => {
    const r = Xoshiro128.fromSeed(1);
    const got = [r.nextU32(), r.nextU32(), r.nextU32()];
    expect(got).toMatchInlineSnapshot(`
      [
        2442144158,
        3238099751,
        3819917871,
      ]
    `);
  });

  it('keeps nextInt and range inside their bounds and roughly uniform', () => {
    const r = Xoshiro128.fromSeed(42);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const v = r.range(1, 6);
      expect(v >= 1 && v <= 6).toBe(true);
      counts[v - 1]!++;
    }
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
    expect(() => r.nextInt(0)).toThrow();
  });
});

describe('named streams', () => {
  it('are independent: drawing from one does not shift another', () => {
    const a = createStreams(7);
    const b = createStreams(7);
    for (let i = 0; i < 50; i++) a.combat.nextU32();
    expect(a.spawns.nextU32()).toBe(b.spawns.nextU32());
  });
  it('differ from each other', () => {
    const s = createStreams(7);
    const firsts = new Set(STREAM_NAMES.map((n) => s[n].nextU32()));
    expect(firsts.size).toBe(STREAM_NAMES.length);
  });
});

describe('hash32', () => {
  it('is stateless and sensitive to every input', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 3, 2));
    expect(hash32(1, 2, 3)).not.toBe(hash32(2, 2, 3));
    expect(hash32(1, -1)).toBe(hash32(1, 0xffffffff));
    expect(hash32(1, 2)).not.toBe(hash32(1, 2, 0));
  });
  it('gives known values (guards against accidental change)', () => {
    expect([hash32(0), hash32(1, 0, 0), hash32(1, 5, -7), hash32(123456, 1, 2, 3)]).toMatchInlineSnapshot(`
      [
        0,
        3935659133,
        205859964,
        1929879728,
      ]
    `);
  });
});
