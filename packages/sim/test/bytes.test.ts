import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter, fnv1a32, hashHex } from '../src/index.ts';

describe('fnv1a32', () => {
  it('matches the published test vectors', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(fnv1a32(enc(''))).toBe(0x811c9dc5);
    expect(fnv1a32(enc('a'))).toBe(0xe40c292c);
    expect(fnv1a32(enc('foobar'))).toBe(0xbf9cf968);
    expect(hashHex(0xbf9cf968)).toBe('bf9cf968');
    expect(hashHex(5)).toBe('00000005');
  });
});

describe('ByteWriter and ByteReader', () => {
  it('round-trip little-endian values and grow as needed', () => {
    const w = new ByteWriter(2);
    w.u8(255);
    w.u16(0xbeef);
    w.u32(0xdeadbeef);
    w.i32(-123456789);
    w.bytes(new Uint8Array([1, 2, 3]));
    const b = w.finish();
    expect(b.length).toBe(1 + 2 + 4 + 4 + 3);
    expect(b[1]).toBe(0xef);
    const r = new ByteReader(b);
    expect(r.u8()).toBe(255);
    expect(r.u16()).toBe(0xbeef);
    expect(r.u32()).toBe(0xdeadbeef);
    expect(r.i32()).toBe(-123456789);
    expect([...r.bytes(3)]).toEqual([1, 2, 3]);
    expect(r.done).toBe(true);
  });
});
