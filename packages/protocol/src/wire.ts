// Little-endian binary writer and reader for every message and the save
// container. Integers that are usually small (lengths, counts, order fields)
// are LEB128 varints; zigzag maps signed values onto them. Everything works on
// plain JS numbers up to 2^53 without bitwise operators, so 64-bit-ish values
// such as step counts never wrap.

import { utf8Decoder as textDecoder, utf8Encoder as textEncoder } from './text.ts';

/** Thrown for any malformed input; the relay turns it into a protocol error. */
export class WireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireError';
  }
}

export class Writer {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;

  constructor(initial = 64) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  get length(): number {
    return this.len;
  }

  u8(v: number): this {
    this.ensure(1);
    this.view.setUint8(this.len, v);
    this.len += 1;
    return this;
  }

  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }

  u16(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.len, v, true);
    this.len += 2;
    return this;
  }

  u32(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.len, v >>> 0, true);
    this.len += 4;
    return this;
  }

  i32(v: number): this {
    this.ensure(4);
    this.view.setInt32(this.len, v, true);
    this.len += 4;
    return this;
  }

  /** Unsigned LEB128 varint for 0 <= v <= 2^53 - 1. */
  varuint(v: number): this {
    if (!Number.isSafeInteger(v) || v < 0) throw new WireError(`varuint out of range: ${v}`);
    this.ensure(8);
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) + 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
    return this;
  }

  /** Zigzag varint for integers within +-(2^52 - 1), so the zigzag value stays exact. */
  varint(v: number): this {
    if (!Number.isSafeInteger(v) || Math.abs(v) >= 2 ** 52) throw new WireError(`varint out of range: ${v}`);
    return this.varuint(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  /** Length-prefixed bytes. */
  bytes(b: Uint8Array): this {
    this.varuint(b.length);
    return this.raw(b);
  }

  /** Bytes with no length prefix. */
  raw(b: Uint8Array): this {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
    return this;
  }

  /** Length-prefixed UTF-8. */
  str(s: string): this {
    return this.bytes(textEncoder.encode(s));
  }

  /** Overwrites a u32 written earlier, for lengths known only afterwards. */
  patchU32(at: number, v: number): void {
    this.view.setUint32(at, v >>> 0, true);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export class Reader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new WireError('message truncated');
  }

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  bool(): boolean {
    const v = this.u8();
    if (v > 1) throw new WireError('bad boolean');
    return v === 1;
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  varuint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      result += (b & 0x7f) * scale;
      if (b < 0x80) {
        if (!Number.isSafeInteger(result)) throw new WireError('varuint too large');
        return result;
      }
      scale *= 0x80;
    }
    throw new WireError('varuint too long');
  }

  varint(): number {
    const z = this.varuint();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }

  /** Length-prefixed bytes; `max` guards against hostile lengths. */
  bytes(max = Number.MAX_SAFE_INTEGER): Uint8Array {
    const n = this.varuint();
    if (n > max) throw new WireError(`field too long: ${n} > ${max}`);
    return this.raw(n);
  }

  raw(n: number): Uint8Array {
    this.need(n);
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  str(maxBytes = 4096): string {
    try {
      return textDecoder.decode(this.bytes(maxBytes));
    } catch (e) {
      if (e instanceof WireError) throw e;
      throw new WireError('bad UTF-8');
    }
  }

  /** Fails if anything is left, so a message with junk on the end is refused. */
  end(): void {
    if (!this.done) throw new WireError('trailing bytes');
  }
}
