// Building the game's caches ahead of need, in the time between steps. The
// generated land, the walk maps and the coarse tiles' crossings are pure
// caches of the state (a game loaded from a save starts with none of them
// and plays the same), so building one early changes only when the work is
// done, never what the game does. Without this, the first monsters to march
// on a town at night built the crossings of the whole field round it (86 m
// past the town, for walkers and for climbers) inside one step: up to half a
// second with the game standing still. The land the next stocking checks
// will look at is built ahead too: each cell of new land the units came near
// cost a step of up to a tenth of a second.

import { STOCK_CHECK_STEPS, stockingAhead } from './animals/animals.ts';
import { fieldWindow } from './combat/fields.ts';
import { COLUMNS_PER_CHUNK, floorDiv } from './fixed.ts';
import { CLIMBER_PLAN, MOB_PLAN } from './nav/grid.ts';
import { TILE_COLUMNS } from './nav/path.ts';
import type { SimState } from './state.ts';
import { CHUNK_SHIFT, chunkKey, chunkKeyX, chunkKeyZ } from './world/chunk.ts';

/** The movers the monsters' fields are made for (breakers walk as walkers do). */
const MOVERS = [MOB_PLAN, CLIMBER_PLAN];
/** Chunks of fields warmed at most, so a sprawling game never churns the caches (the coarse one keeps 2048 a mover, the walk maps 1024). */
const MAX_CHUNKS = 600;
/** Coarse tiles per chunk a side. */
const CHUNK_TILES = floorDiv(COLUMNS_PER_CHUNK, TILE_COLUMNS);

/** Columns round a stocking try that landNear may look at (it looks 5 out). */
const LAND_NEAR = 6;

/** Not state: the walk-map epoch and building revision at which the fields had nothing left to warm. */
const done = new WeakMap<SimState, readonly [number, number]>();
/** Not state: the chunks the next stocking checks will read, worked out once a check. */
const landAhead = new WeakMap<SimState, { check: number; chunks: number[] }>();

function stockingChunks(state: SimState): number[] {
  const check = floorDiv(state.step, STOCK_CHECK_STEPS);
  const last = landAhead.get(state);
  if (last && last.check === check) return last.chunks;
  const at = stockingAhead(state);
  const keys = new Set<number>();
  for (let k = 0; k < at.length; k += 2) {
    for (const z of [at[k + 1]! - LAND_NEAR, at[k + 1]! + LAND_NEAR]) for (const x of [at[k]! - LAND_NEAR, at[k]! + LAND_NEAR]) keys.add(chunkKey(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
  }
  const chunks = [...keys];
  landAhead.set(state, { check, chunks });
  return chunks;
}

/**
 * Does one small piece of the cache work the coming steps would otherwise
 * do inside a step (a chunk of the land the next stocking checks will read,
 * or for the monsters' fields round the towns a chunk of land, a walk map or
 * one chunk's coarse crossings) and returns whether there was any left.
 * For the time between steps: it never changes what the game does, only
 * how long a step takes.
 */
export function warmCaches(state: SimState): boolean {
  const world = state.world;
  for (const key of stockingChunks(state)) {
    if (world.isCached(chunkKeyX(key), chunkKeyZ(key))) continue;
    world.generated(chunkKeyX(key), chunkKeyZ(key));
    return true;
  }
  const epoch = world.navEpoch;
  const rev = state.buildings.rev;
  const last = done.get(state);
  if (last && last[0] === epoch && last[1] === rev) return false;
  const chunks = new Set<number>();
  for (let player = 0; player < state.players.length && chunks.size < MAX_CHUNKS; player++) {
    const win = fieldWindow(state, player);
    if (!win) continue;
    const cx1 = floorDiv(win.x0 + win.w - 1, CHUNK_TILES);
    const cz1 = floorDiv(win.z0 + win.h - 1, CHUNK_TILES);
    for (let cz = floorDiv(win.z0, CHUNK_TILES); cz <= cz1; cz++) {
      for (let cx = floorDiv(win.x0, CHUNK_TILES); cx <= cx1 && chunks.size < MAX_CHUNKS; cx++) chunks.add(chunkKey(cx, cz));
    }
  }
  for (const m of MOVERS) {
    for (const key of chunks) {
      const cx = chunkKeyX(key);
      const cz = chunkKeyZ(key);
      if (state.paths.coarseReady(cx, cz, m)) continue;
      // A chunk's crossings read the walk maps of it and the chunks round it, and those the land.
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (world.isCached(cx + dx, cz + dz)) continue;
          world.generated(cx + dx, cz + dz);
          return true;
        }
      }
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (state.nav.ready(cx + dx, cz + dz)) continue;
          state.nav.warm(cx + dx, cz + dz);
          return true;
        }
      }
      state.paths.warmCoarse(cx, cz, m);
      return true;
    }
  }
  done.set(state, [epoch, rev]);
  return false;
}
