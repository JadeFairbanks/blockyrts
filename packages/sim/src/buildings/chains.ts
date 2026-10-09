// Wall and tunnel chains (Controls: Building placement, "Wall chains";
// Digging and prospecting, "Tunnel chains"). A chain is clicked out one
// stretch at a time: from an anchor, in one of the eight compass directions,
// for a number of columns. Each stretch reaches the sim as one order carrying
// its start, direction and length, and the sim and the client's preview both
// take its columns from stretchCells, so what the player sees is what is
// ordered.

import { floorDiv } from '../fixed.ts';
import type { UnitOrder } from '../units/unit-orders.ts';

/** The eight compass directions by number, as steps in columns: east first, turning towards +z (south on screen). */
export const STRETCH_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** A stretch of wall runs at most 64 columns (29 m) from its anchor, like a marked dig's side; the chain goes on from its end (s). */
export const WALL_STRETCH_MAX_COLUMNS = 64;
/** A stretch of tunnel runs at most 64 columns (29 m) from its anchor (s). */
export const TUNNEL_STRETCH_MAX_COLUMNS = 64;
/** A chained tunnel is 2 columns (90 cm) wide on its straight runs; on a diagonal the steps overlap, so a walker never squeezes past a corner (s). */
export const TUNNEL_WIDTH_COLUMNS = 2;
/** A new tunnel's height: 2.25 m, so a 1.8 m walker has headroom (s, as since milestone 3). */
export const TUNNEL_HEIGHT_UNITS = 20;
/** The lowest and highest a tunnel's roof is set, in terrain units over its floor (2 m to 4 m); + and - step it 34 cm (s). */
export const TUNNEL_MIN_UNITS = 18;
export const TUNNEL_MAX_UNITS = 36;
/** The tallest a dig drawn upwards is marked (Jade's Patch 5, GP-4: "keep extending it up until it covers the entire hill or even mountain"): 360 terrain units, 40.5 m (s). */
export const DIG_UP_MAX_UNITS = 360;

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** tan 22.5 degrees in thousandths: a stretch snaps to the direction within 22.5 degrees of the cursor. */
const TAN_22_5_PM = 414;

/**
 * The direction and length of the stretch from an anchor towards a column:
 * the nearest of the eight compass directions, as far along it as the
 * column reaches (a diagonal goes as far as the mean of the two distances),
 * at most `max` columns.
 */
export function snapStretch(ax: number, az: number, tx: number, tz: number, max: number): { dir: number; length: number } {
  const dx = tx - ax;
  const dz = tz - az;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);
  if (adx === 0 && adz === 0) return { dir: 0, length: 0 };
  let sx = sign(dx);
  let sz = sign(dz);
  let length: number;
  if (adz * 1000 <= adx * TAN_22_5_PM) {
    sz = 0;
    length = adx;
  } else if (adx * 1000 <= adz * TAN_22_5_PM) {
    sx = 0;
    length = adz;
  } else length = (adx + adz + 1) >> 1;
  const dir = STRETCH_DIRS.findIndex(([x, z]) => x === sx && z === sz);
  return { dir, length: Math.min(length, max) };
}

/** Where a stretch ends: the column `length` steps from the anchor. */
export function stretchEnd(x: number, z: number, dir: number, length: number): [number, number] {
  const [dx, dz] = STRETCH_DIRS[dir]!;
  return [x + dx * length, z + dz * length];
}

/** The direction and length of the stretch from (x0, z0) to (x1, z1), which lie on one of the eight directions. */
export function stretchBetween(x0: number, z0: number, x1: number, z1: number): { dir: number; length: number } {
  const sx = sign(x1 - x0);
  const sz = sign(z1 - z0);
  const dir = STRETCH_DIRS.findIndex(([x, z]) => x === sx && z === sz);
  return { dir: Math.max(0, dir), length: Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) };
}

/**
 * The columns of a stretch, from the anchor outward. A straight stretch is
 * `width` columns across (the extra ones on the +x or +z side). A diagonal
 * one joins each column to the one before through the column beside it, so
 * no two columns meet only at a corner: a wall has no gap a monster could
 * squeeze through, and a tunnel no corner a walker cannot pass; from width 2
 * up a diagonal joins both ways, so walkers can step straight along it.
 */
export function stretchCells(x: number, z: number, dir: number, length: number, width = 1): Array<[number, number]> {
  const [dx, dz] = STRETCH_DIRS[dir]!;
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  const add = (cx: number, cz: number): void => {
    const k = `${cx},${cz}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push([cx, cz]);
  };
  const diagonal = dx !== 0 && dz !== 0;
  for (let k = 0; k <= length; k++) {
    const cx = x + dx * k;
    const cz = z + dz * k;
    if (diagonal) {
      if (k > 0) {
        add(cx, cz - dz);
        if (width > 1) add(cx - dx, cz);
      }
      add(cx, cz);
    } else {
      for (let w = 0; w < width; w++) add(cx + (dz !== 0 ? w : 0), cz + (dx !== 0 ? w : 0));
    }
  }
  return out;
}

/**
 * The corners of the pieces of a chain of square pieces `size` columns across
 * (Patch 5: the earth rampart's 2 x 2 chunks), from the anchor outward: one
 * every `size` columns along the stretch, and on a diagonal one more beside
 * each step, as stretchCells joins a wall's, so no two pieces meet only at a
 * corner. A size of 1 is stretchCells itself.
 */
export function stretchSpots(x: number, z: number, dir: number, length: number, size: number): Array<[number, number]> {
  if (size <= 1) return stretchCells(x, z, dir, length);
  const [dx, dz] = STRETCH_DIRS[dir]!;
  const out: Array<[number, number]> = [];
  const diagonal = dx !== 0 && dz !== 0;
  for (let k = 0; k * size <= length; k++) {
    const cx = x + dx * k * size;
    const cz = z + dz * k * size;
    if (diagonal && k > 0) out.push([cx, cz - dz * size]);
    out.push([cx, cz]);
  }
  return out;
}

/** Whether a building kind is placed in chains of stretches (Building placement: wall chains): the walls, one column each, and the earth rampart's square chunks (Patch 5). */
export function chainPiece(spec: { defence?: string; w: number; d: number }): number {
  return spec.defence === 'wall' && spec.w === spec.d ? spec.w : 0;
}

/**
 * The planned builds in a player's order lists that are not started yet,
 * each spot once however many workers have it queued, keyed "x,z" (the
 * footprint corner) with the building kind. `standing` says whether a
 * building of that kind already stands or is started at the spot.
 */
export function plannedSpots(queues: Iterable<readonly UnitOrder[]>, standing: (kind: number, x: number, z: number) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (const q of queues) {
    for (const o of q) {
      if (o.t !== 'build') continue;
      const k = `${o.x},${o.z}`;
      if (out.has(k) || standing(o.kind, o.x, o.z)) continue;
      out.set(k, o.kind);
    }
  }
  return out;
}

/** How many of a building one more stretch can still pay for: the stock less what the planned builds will take, over its cost; and the resource that runs out first (-1 if none). */
export function stretchRoom(have: (res: number) => number, owed: ReadonlyMap<number, number>, cost: ReadonlyArray<readonly [number, number]>): { room: number; short: number } {
  let room = Number.MAX_SAFE_INTEGER;
  let short = -1;
  for (const [r, n] of cost) {
    if (n <= 0) continue;
    const k = Math.max(0, floorDiv(have(r) - (owed.get(r) ?? 0), n));
    if (k < room) {
      room = k;
      short = r;
    }
  }
  return { room, short };
}
