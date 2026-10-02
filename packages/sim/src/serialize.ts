// Canonical serialisation of the whole simulation state. The same bytes are
// hashed for desync checks, kept as snapshots for rejoin and replay, and will
// become the entity section of the save format.

import { ByteReader, ByteWriter, fnv1a32 } from './bytes.ts';
import { STREAM_NAMES, Xoshiro128, type Streams } from './rng.ts';
import { BuildingStore, buildingFields, readBuildings, writeBuildings } from './buildings/store.ts';
import { RESOURCE_COUNT } from './economy/resources.ts';
import { attachNav, EntityStore, UNIT_FIELDS, type PlayerState, type SimState } from './state.ts';
import { readUnitOrder, writeUnitOrder, type UnitOrder } from './units/unit-orders.ts';
import { readWorld, writeWorld } from './world/serialize-world.ts';
import { floorDiv } from './fixed.ts';

const MAGIC = 0x53434153; // "SACS" read little-endian
export const SNAPSHOT_VERSION = 3;

function writeField(w: ByteWriter, t: string, v: number): void {
  if (t === 'u32') w.u32(v);
  else if (t === 'i32') w.i32(v);
  else if (t === 'u16') w.u16(v);
  else w.u8(v);
}

function readField(r: ByteReader, t: string): number {
  if (t === 'u32') return r.u32();
  if (t === 'i32') return r.i32();
  if (t === 'u16') return r.u16();
  return r.u8();
}

export function serializeState(state: SimState): Uint8Array {
  const w = new ByteWriter(1024 + state.entities.count * 96);
  w.u32(MAGIC);
  w.u16(SNAPSHOT_VERSION);
  w.u32(state.seed);
  w.u32(state.step);
  w.u32(state.nextEntityId);
  w.u8(STREAM_NAMES.length);
  for (const name of STREAM_NAMES) {
    for (const word of state.rng[name].getState()) w.u32(word);
  }
  const e = state.entities;
  const n = e.count;
  w.u32(n);
  // Column by column, in index order.
  for (const [name, t] of UNIT_FIELDS) {
    const col = e[name];
    for (let i = 0; i < n; i++) writeField(w, t, col[i]!);
  }
  for (let i = 0; i < n; i++) {
    const q = e.queue[i]!;
    w.u16(q.length);
    for (const o of q) writeUnitOrder(w, o);
    const p = e.path[i]!;
    w.u16(p.length);
    for (const v of p) w.i32(v);
  }
  w.u8(state.players.length);
  for (const p of state.players) {
    w.u8(p.pool.length);
    for (const v of p.pool) w.i32(v);
  }
  writeBuildings(w, state.buildings);
  w.u32(state.enclosed.length);
  for (const k of state.enclosed) {
    // Keys are below 2^51: written as two words.
    w.u32(k % 0x100000000);
    w.u32(floorDiv(k, 0x100000000));
  }
  writeWorld(w, state.world);
  return w.finish();
}

export function deserializeState(bytes: Uint8Array): SimState {
  const r = new ByteReader(bytes);
  if (r.u32() !== MAGIC) throw new Error('not a simulation snapshot');
  const version = r.u16();
  if (version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version ${version}`);
  const seed = r.u32();
  const step = r.u32();
  const nextEntityId = r.u32();
  const streamCount = r.u8();
  if (streamCount !== STREAM_NAMES.length) throw new Error('snapshot stream count mismatch');
  const rng = {} as Streams;
  for (const name of STREAM_NAMES) rng[name] = new Xoshiro128(r.u32(), r.u32(), r.u32(), r.u32());
  const n = r.u32();
  const e = new EntityStore(Math.max(64, n));
  e.count = n;
  for (const [name, t] of UNIT_FIELDS) {
    const col = e[name];
    for (let i = 0; i < n; i++) col[i] = readField(r, t);
  }
  for (let i = 0; i < n; i++) {
    const q: UnitOrder[] = [];
    const nq = r.u16();
    for (let k = 0; k < nq; k++) q.push(readUnitOrder(r));
    e.queue[i] = q;
    const np = r.u16();
    const p: number[] = [];
    for (let k = 0; k < np; k++) p.push(r.i32());
    e.path[i] = p;
  }
  const players: PlayerState[] = [];
  const np = r.u8();
  for (let k = 0; k < np; k++) {
    const len = r.u8();
    const pool = new Int32Array(RESOURCE_COUNT);
    for (let j = 0; j < len; j++) {
      const v = r.i32();
      if (j < RESOURCE_COUNT) pool[j] = v;
    }
    players.push({ pool });
  }
  const buildings = new BuildingStore();
  readBuildings(r, buildings, () => {});
  const ne = r.u32();
  const enclosed: number[] = [];
  for (let k = 0; k < ne; k++) {
    const lo = r.u32();
    enclosed.push(r.u32() * 0x100000000 + lo);
  }
  const world = readWorld(r, seed);
  if (!r.done) throw new Error('trailing bytes in snapshot');
  e.reindex();
  return attachNav({ seed, step, nextEntityId, rng, entities: e, world, players, buildings, enclosed });
}

/** The 32-bit desync hash: FNV-1a over the canonical serialisation. */
export function hashState(state: SimState): number {
  return fnv1a32(serializeState(state));
}

/** A deep copy through the canonical bytes. */
export function cloneState(state: SimState): SimState {
  return deserializeState(serializeState(state));
}

/**
 * The first field where two states differ, as a readable path such as
 * "entities[3].x: 1200 vs 1201", or null when they are identical. Used by
 * the desync tool after a replay finds the first diverging step.
 */
export function diffStates(a: SimState, b: SimState): string | null {
  const scalar = (name: string, va: number, vb: number): string | null =>
    va === vb ? null : `${name}: ${va} vs ${vb}`;
  const head =
    scalar('seed', a.seed, b.seed) ??
    scalar('step', a.step, b.step) ??
    scalar('nextEntityId', a.nextEntityId, b.nextEntityId);
  if (head) return head;
  for (const name of STREAM_NAMES) {
    const sa = a.rng[name].getState();
    const sb = b.rng[name].getState();
    for (let k = 0; k < 4; k++) {
      const d = scalar(`rng.${name}[${k}]`, sa[k]!, sb[k]!);
      if (d) return d;
    }
  }
  const ea = a.entities;
  const eb = b.entities;
  const count = scalar('entities.count', ea.count, eb.count);
  if (count) return count;
  for (let i = 0; i < ea.count; i++) {
    for (const [f] of UNIT_FIELDS) {
      const d = scalar(`entities[${i}].${f}`, ea[f][i]!, eb[f][i]!);
      if (d) return d;
    }
    const qa = JSON.stringify(ea.queue[i]);
    const qb = JSON.stringify(eb.queue[i]);
    if (qa !== qb) return `entities[${i}].queue: ${qa} vs ${qb}`;
    const pa = JSON.stringify(ea.path[i]);
    const pb = JSON.stringify(eb.path[i]);
    if (pa !== pb) return `entities[${i}].path: ${pa} vs ${pb}`;
  }
  const players = scalar('players.length', a.players.length, b.players.length);
  if (players) return players;
  for (let p = 0; p < a.players.length; p++) {
    for (let k = 0; k < a.players[p]!.pool.length; k++) {
      const d = scalar(`players[${p}].pool[${k}]`, a.players[p]!.pool[k]!, b.players[p]!.pool[k]!);
      if (d) return d;
    }
  }
  const bl = scalar('buildings.length', a.buildings.list.length, b.buildings.list.length);
  if (bl) return bl;
  for (let k = 0; k < a.buildings.list.length; k++) {
    const fa = buildingFields(a.buildings.list[k]!);
    const fb = buildingFields(b.buildings.list[k]!);
    for (const f of Object.keys(fa)) if (fa[f] !== fb[f]) return `buildings[${k}].${f}: ${fa[f]} vs ${fb[f]}`;
  }
  const en = JSON.stringify(a.enclosed) === JSON.stringify(b.enclosed) ? null : `enclosed: ${a.enclosed.length} tiles vs ${b.enclosed.length}`;
  if (en) return en;
  return diffWorlds(a, b);
}

/** The first difference in the world section, named by the part it falls in. */
function diffWorlds(a: SimState, b: SimState): string | null {
  const bytesOf = (s: SimState): Uint8Array => {
    const w = new ByteWriter(1024);
    writeWorld(w, s.world);
    return w.finish();
  };
  const wa = bytesOf(a);
  const wb = bytesOf(b);
  const counts = (s: SimState): [string, number][] => [
    ['edited chunks', s.world.edited.size],
    ['prop changes', s.world.propChanges.size],
    ['dropped seeds', s.world.addedProps.size],
    ['explored chunks', s.world.explored.reduce((t, m) => t + m.size, 0)],
    ['water settling', s.world.waterActive.size],
  ];
  const ca = counts(a);
  const cb = counts(b);
  for (let k = 0; k < ca.length; k++) {
    if (ca[k]![1] !== cb[k]![1]) return `world.${ca[k]![0]}: ${ca[k]![1]} vs ${cb[k]![1]}`;
  }
  const len = Math.min(wa.length, wb.length);
  for (let i = 0; i < len; i++) if (wa[i] !== wb[i]) return `world byte ${i}: ${wa[i]} vs ${wb[i]}`;
  return wa.length === wb.length ? null : `world length: ${wa.length} vs ${wb.length}`;
}
