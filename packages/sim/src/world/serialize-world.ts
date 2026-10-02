// The world's part of the canonical state bytes: the chunk deltas (changed
// columns and moved water), prop changes, dropped seeds, explored land and the
// water still moving. Everything is written in sorted order so every machine
// writes the same bytes. Untouched land is not written: it is regenerated from
// the seed (Terrain, Saving).

import type { ByteReader, ByteWriter } from '../bytes.ts';
import { CHUNK_COLUMNS, chunkKey, chunkKeyX, chunkKeyZ } from './chunk.ts';
import { colKey, colKeyX, colKeyZ, World } from './world.ts';

const sorted = <T>(m: { keys(): Iterable<T> }): T[] => [...m.keys()].sort((a, b) => (a as number) - (b as number));

export function writeWorld(w: ByteWriter, world: World): void {
  w.u8(world.players);
  // Chunk deltas.
  const chunks = sorted(world.edited);
  w.u32(chunks.length);
  for (const key of chunks) {
    const c = world.edited.get(key)!;
    w.i32(chunkKeyX(key));
    w.i32(chunkKeyZ(key));
    const cols = [...world.editedColumns.get(key)!].sort((a, b) => a - b);
    w.u16(cols.length);
    for (const i of cols) {
      w.u16(i);
      const n = c.count[i]!;
      w.u8(n);
      const s = c.start[i]! * 3;
      for (let k = 0; k < n * 3; k++) w.i16(c.layers[s + k]!);
    }
    const moved = world.waterMoved.has(key);
    w.u8(moved ? 1 : 0);
    if (moved) for (let i = 0; i < CHUNK_COLUMNS; i++) w.i16(c.water[i]!);
  }
  // Prop changes.
  const propChunks = sorted(world.propChanges);
  w.u32(propChunks.length);
  for (const key of propChunks) {
    const m = world.propChanges.get(key)!;
    w.i32(chunkKeyX(key));
    w.i32(chunkKeyZ(key));
    const idx = sorted(m);
    w.u16(idx.length);
    for (const i of idx) {
      const ch = m.get(i)!;
      w.u16(i);
      w.i32(ch.amount);
      w.i32(ch.cutAt);
      w.u8(ch.removed ? 1 : 0);
    }
  }
  // Dropped seeds.
  const addedChunks = sorted(world.addedProps);
  w.u32(addedChunks.length);
  for (const key of addedChunks) {
    const list = world.addedProps.get(key)!;
    w.i32(chunkKeyX(key));
    w.i32(chunkKeyZ(key));
    w.u16(list.length);
    for (const p of list) {
      w.u8(p.kind);
      w.u8(p.lx);
      w.u8(p.lz);
      w.i16(p.y);
      w.u32(p.variant);
      w.i32(p.age);
      w.i32(p.amount);
    }
  }
  // Explored land.
  for (let p = 0; p < world.players; p++) {
    const map = world.explored[p]!;
    const keys = sorted(map);
    w.u32(keys.length);
    for (const key of keys) {
      w.i32(chunkKeyX(key));
      w.i32(chunkKeyZ(key));
      w.bytes(map.get(key)!);
    }
  }
  // Water still settling.
  const active = [...world.waterActive].sort((a, b) => a - b);
  w.u32(active.length);
  for (const k of active) {
    w.i32(colKeyX(k));
    w.i32(colKeyZ(k));
  }
}

export function readWorld(r: ByteReader, seed: number): World {
  const players = r.u8();
  const world = new World(seed, players);
  const chunks = r.u32();
  for (let n = 0; n < chunks; n++) {
    const cx = r.i32();
    const cz = r.i32();
    const cols = new Map<number, number[]>();
    const nc = r.u16();
    for (let k = 0; k < nc; k++) {
      const i = r.u16();
      const layers = r.u8();
      const t: number[] = [];
      for (let q = 0; q < layers * 3; q++) t.push(r.i16());
      cols.set(i, t);
    }
    let water: Int16Array | null = null;
    if (r.u8() === 1) {
      water = new Int16Array(CHUNK_COLUMNS);
      for (let i = 0; i < CHUNK_COLUMNS; i++) water[i] = r.i16();
    }
    world.restoreChunk(cx, cz, cols, water);
  }
  const propChunks = r.u32();
  for (let n = 0; n < propChunks; n++) {
    const key = chunkKey(r.i32(), r.i32());
    const m = new Map<number, { amount: number; cutAt: number; removed: boolean }>();
    const count = r.u16();
    for (let k = 0; k < count; k++) {
      const i = r.u16();
      m.set(i, { amount: r.i32(), cutAt: r.i32(), removed: r.u8() === 1 });
    }
    world.propChanges.set(key, m);
  }
  const addedChunks = r.u32();
  for (let n = 0; n < addedChunks; n++) {
    const key = chunkKey(r.i32(), r.i32());
    const count = r.u16();
    const list = [];
    for (let k = 0; k < count; k++) {
      list.push({ kind: r.u8(), lx: r.u8(), lz: r.u8(), y: r.i16(), variant: r.u32(), age: r.i32(), amount: r.i32() });
    }
    world.addedProps.set(key, list);
  }
  for (let p = 0; p < players; p++) {
    const count = r.u32();
    const map = world.explored[p]!;
    for (let k = 0; k < count; k++) {
      const key = chunkKey(r.i32(), r.i32());
      map.set(key, r.bytes(32));
    }
  }
  const active = r.u32();
  for (let k = 0; k < active; k++) world.waterActive.add(colKey(r.i32(), r.i32()));
  return world;
}
