// Canonical serialisation of the whole simulation state. The same bytes are
// hashed for desync checks, kept as snapshots for rejoin and replay, and will
// become the entity section of the save format.

import { ByteReader, ByteWriter, fnv1a32 } from './bytes.ts';
import { STREAM_NAMES, Xoshiro128, type Streams } from './rng.ts';
import { EntityStore, type SimState } from './state.ts';
import { readWorld, writeWorld } from './world/serialize-world.ts';

const MAGIC = 0x53434153; // "SACS" read little-endian
export const SNAPSHOT_VERSION = 2;

export function serializeState(state: SimState): Uint8Array {
  const w = new ByteWriter(256 + state.entities.count * 48);
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
  for (let i = 0; i < n; i++) w.u32(e.id[i]!);
  for (let i = 0; i < n; i++) w.u8(e.owner[i]!);
  for (let i = 0; i < n; i++) w.u8(e.kind[i]!);
  for (let i = 0; i < n; i++) w.i32(e.x[i]!);
  for (let i = 0; i < n; i++) w.i32(e.y[i]!);
  for (let i = 0; i < n; i++) w.i32(e.z[i]!);
  for (let i = 0; i < n; i++) w.u16(e.heading[i]!);
  for (let i = 0; i < n; i++) w.i32(e.speed[i]!);
  for (let i = 0; i < n; i++) w.u8(e.order[i]!);
  for (let i = 0; i < n; i++) w.i32(e.targetX[i]!);
  for (let i = 0; i < n; i++) w.i32(e.targetZ[i]!);
  for (let i = 0; i < n; i++) w.u32(e.wanderAt[i]!);
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
  for (let i = 0; i < n; i++) e.id[i] = r.u32();
  for (let i = 0; i < n; i++) e.owner[i] = r.u8();
  for (let i = 0; i < n; i++) e.kind[i] = r.u8();
  for (let i = 0; i < n; i++) e.x[i] = r.i32();
  for (let i = 0; i < n; i++) e.y[i] = r.i32();
  for (let i = 0; i < n; i++) e.z[i] = r.i32();
  for (let i = 0; i < n; i++) e.heading[i] = r.u16();
  for (let i = 0; i < n; i++) e.speed[i] = r.i32();
  for (let i = 0; i < n; i++) e.order[i] = r.u8();
  for (let i = 0; i < n; i++) e.targetX[i] = r.i32();
  for (let i = 0; i < n; i++) e.targetZ[i] = r.i32();
  for (let i = 0; i < n; i++) e.wanderAt[i] = r.u32();
  const world = readWorld(r, seed);
  if (!r.done) throw new Error('trailing bytes in snapshot');
  e.reindex();
  return { seed, step, nextEntityId, rng, entities: e, world };
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
  const fields = ['id', 'owner', 'kind', 'x', 'y', 'z', 'heading', 'speed', 'order', 'targetX', 'targetZ', 'wanderAt'] as const;
  for (let i = 0; i < ea.count; i++) {
    for (const f of fields) {
      const d = scalar(`entities[${i}].${f}`, ea[f][i]!, eb[f][i]!);
      if (d) return d;
    }
  }
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
