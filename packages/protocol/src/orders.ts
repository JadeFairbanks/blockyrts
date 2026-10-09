// The order payload codec. The relay never looks inside a player's orders: it
// forwards the bytes. The codec is schema-free so every order kind a later
// milestone adds to the sim travels without a protocol change: an order is any
// plain object whose values are integers, booleans, strings, null, arrays or
// nested objects. Fractions are refused, which keeps float values out of the
// lockstep inputs.

import { Reader, WireError, Writer } from './wire.ts';

const T_NULL = 0;
const T_FALSE = 1;
const T_TRUE = 2;
const T_INT = 3;
const T_STR = 4;
const T_ARRAY = 5;
const T_OBJECT = 6;

/** Most orders one frame may carry, and the deepest nesting, so a hostile payload cannot blow the stack. */
export const MAX_ORDERS_PER_FRAME = 256;
const MAX_DEPTH = 8;
const MAX_ITEMS = 4096;

export type OrderValue = null | boolean | number | string | OrderValue[] | { [key: string]: OrderValue };

function writeValue(w: Writer, v: unknown, depth: number): void {
  if (depth > MAX_DEPTH) throw new WireError('order nested too deeply');
  if (v === null) w.u8(T_NULL);
  else if (v === false) w.u8(T_FALSE);
  else if (v === true) w.u8(T_TRUE);
  else if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new WireError(`orders carry integers only, got ${v}`);
    w.u8(T_INT).varint(v);
  } else if (typeof v === 'string') w.u8(T_STR).str(v);
  else if (Array.isArray(v)) {
    w.u8(T_ARRAY).varuint(v.length);
    for (const item of v) writeValue(w, item, depth + 1);
  } else if (typeof v === 'object') {
    const keys = Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
    w.u8(T_OBJECT).varuint(keys.length);
    for (const k of keys) {
      w.str(k);
      writeValue(w, (v as Record<string, unknown>)[k], depth + 1);
    }
  } else throw new WireError(`orders cannot carry ${typeof v}`);
}

function readValue(r: Reader, depth: number): OrderValue {
  if (depth > MAX_DEPTH) throw new WireError('order nested too deeply');
  const t = r.u8();
  switch (t) {
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return r.varint();
    case T_STR:
      return r.str(1024);
    case T_ARRAY: {
      const n = r.varuint();
      if (n > MAX_ITEMS) throw new WireError('order array too long');
      const out: OrderValue[] = [];
      for (let i = 0; i < n; i++) out.push(readValue(r, depth + 1));
      return out;
    }
    case T_OBJECT: {
      const n = r.varuint();
      if (n > 64) throw new WireError('order has too many fields');
      const out: { [key: string]: OrderValue } = {};
      for (let i = 0; i < n; i++) {
        const k = r.str(64);
        if (k === '__proto__') throw new WireError('bad order field name');
        out[k] = readValue(r, depth + 1);
      }
      return out;
    }
    default:
      throw new WireError(`bad order value tag ${t}`);
  }
}

/** Encodes a list of orders (any plain objects) for one frame. An empty list is one byte. */
export function encodeOrders(orders: readonly object[]): Uint8Array {
  if (orders.length > MAX_ORDERS_PER_FRAME) throw new WireError('too many orders in one frame');
  const w = new Writer(16);
  w.varuint(orders.length);
  for (const o of orders) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new WireError('an order must be an object');
    writeValue(w, o, 0);
  }
  return w.finish();
}

/** Decodes a frame's orders. The caller casts to the sim's Order type and validates. */
export function decodeOrders<T = { [key: string]: OrderValue }>(bytes: Uint8Array): T[] {
  const r = new Reader(bytes);
  const n = r.varuint();
  if (n > MAX_ORDERS_PER_FRAME) throw new WireError('too many orders in one frame');
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const v = readValue(r, 0);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new WireError('an order must be an object');
    out.push(v as T);
  }
  r.end();
  return out;
}

/** The encoding of an empty order list, the payload of nearly every frame. */
export const NO_ORDERS = encodeOrders([]);

/**
 * Whether an order is one of the debugger's (Patch 5): its kind starts with
 * "debug", or it is a raw terrain edit. Online, the relay drops these from
 * anyone the server does not let use the debugger.
 */
export function isDebugOrder(o: { [key: string]: OrderValue }): boolean {
  const kind = o['kind'];
  return typeof kind === 'string' && (kind === 'terrain' || kind.startsWith('debug'));
}

/** A frame's orders without the debugger's; the same bytes when there were none (or the payload does not decode, which the sim then refuses as before). */
export function withoutDebugOrders(bytes: Uint8Array): Uint8Array {
  if (bytes.length <= NO_ORDERS.length) return bytes;
  let orders: Array<{ [key: string]: OrderValue }>;
  try {
    orders = decodeOrders(bytes);
  } catch {
    return bytes;
  }
  const kept = orders.filter((o) => !isDebugOrder(o));
  return kept.length === orders.length ? bytes : encodeOrders(kept);
}
