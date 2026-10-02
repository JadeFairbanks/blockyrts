// Chunk deltas: everything players changed in one chunk, as plain data that
// crosses to a Worker with structured clone. The sim worker sends them for
// chunks it marks dirty; the drawing side keeps a mirror World (the same seed
// and players, so the same generated land) and applies them. Saves (M9)
// write the same changes per chunk.

import { CHUNK_COLUMNS, chunkKey } from './chunk.ts';
import type { PropRecord } from './generate.ts';
import type { World } from './world.ts';

export interface ChunkDelta {
  cx: number;
  cz: number;
  /** Changed columns: index, then its (bottom, top, material) triples. */
  columns: Array<[number, number[]]>;
  /** The whole chunk's water when it has moved, else null. */
  water: Int16Array | null;
  /** Prop changes: index, amount, step cut (or -1), removed. */
  props: Array<[number, number, number, boolean]>;
  /** Props added to the chunk (dropped seeds). */
  added: PropRecord[];
}

/** The chunk's changes as they stand. */
export function chunkDelta(world: World, cx: number, cz: number): ChunkDelta {
  const key = chunkKey(cx, cz);
  const columns: Array<[number, number[]]> = [];
  const c = world.edited.get(key);
  const cols = world.editedColumns.get(key);
  if (c && cols) for (const i of [...cols].sort((a, b) => a - b)) columns.push([i, c.column(i)]);
  const water = c && world.waterMoved.has(key) ? c.water.slice(0, CHUNK_COLUMNS) : null;
  const props: Array<[number, number, number, boolean]> = [];
  const m = world.propChanges.get(key);
  if (m) for (const i of [...m.keys()].sort((a, b) => a - b)) {
    const ch = m.get(i)!;
    props.push([i, ch.amount, ch.cutAt, ch.removed]);
  }
  const added = (world.addedProps.get(key) ?? []).map((p) => ({ ...p }));
  return { cx, cz, columns, water, props, added };
}

/** Applies a chunk's changes to a mirror world. Later deltas of a chunk replace earlier ones. */
export function applyChunkDelta(world: World, d: ChunkDelta): void {
  const key = chunkKey(d.cx, d.cz);
  if (d.columns.length > 0 || d.water) world.restoreChunk(d.cx, d.cz, new Map(d.columns), d.water);
  if (d.props.length > 0) {
    const m = new Map<number, { amount: number; cutAt: number; removed: boolean }>();
    for (const [i, amount, cutAt, removed] of d.props) m.set(i, { amount, cutAt, removed });
    world.propChanges.set(key, m);
  }
  if (d.added.length > 0) world.addedProps.set(key, d.added.map((p) => ({ ...p })));
  world.dirty.add(key);
}
