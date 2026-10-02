// The world's cells as the threats see them: which cell a point is in,
// which cells hold the players' buildings (claimed cells, for lair placement
// and the blood night trigger), how many cells a depth band has, and the
// spots the land offers a lair: cave mouths and the foot of barrier edges.

import { buildingCentre } from '../buildings/lights.ts';
import { floorDiv, isqrt, WU_PER_COLUMN } from '../fixed.ts';
import type { SimState } from '../state.ts';
import { Band, EdgeType, type WorldLayout } from '../world/layout.ts';

/** The cell a point (wu) is in. */
export function cellAt(state: SimState, x: number, z: number): number {
  return state.world.layout.nearest(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN));
}

/** The band of the cell a point (wu) is in. */
export function bandAtWu(state: SimState, x: number, z: number): Band {
  return state.world.layout.cell(cellAt(state, x, z)).band;
}

/**
 * Cells holding the players' buildings (a lit torch is a building too), with
 * a bit for each player that has one there: the claimed cells (s: a cell
 * counts once the players hold any building in it).
 */
export function occupiedCells(state: SimState): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const [x, z] = buildingCentre(b);
    const c = cellAt(state, x, z);
    out.set(c, (out.get(c) ?? 0) | (1 << b.owner));
  }
  return out;
}

/** The rings a band spans, [first, last). */
export function bandRings(layout: WorldLayout, band: Band): [number, number] {
  const b = layout.bands;
  switch (band) {
    case Band.Heartland:
      return [0, 1];
    case Band.Fringe:
      return [1, b.deepwoods];
    case Band.Deepwoods:
      return [b.deepwoods, b.barrens];
    case Band.Barrens:
      return [b.barrens, b.deadlands];
    default:
      return [b.deadlands, layout.ringCount];
  }
}

/** How many cells a band has. */
export function bandCellCount(layout: WorldLayout, band: Band): number {
  const [r0, r1] = bandRings(layout, band);
  let n = 0;
  for (let r = r0; r < r1; r++) n += layout.ringCellCount(r);
  return n;
}

/**
 * A spot at the foot of one of the cell's barrier edges, wu: a ridge's cave
 * mouth when the cell has one, else just outside the foot of a ridge or
 * cliff line on the cell's side; null for none.
 */
export function barrierSpot(layout: WorldLayout, cellId: number, caveOnly: boolean): [number, number] | null {
  const cell = layout.cell(cellId);
  let foot: [number, number] | null = null;
  for (const e of cell.edges) {
    const isRidge = e.type === EdgeType.Ridge;
    if (!isRidge && e.type !== EdgeType.Cliff) continue;
    const u = layout.site(e.a);
    const v = layout.site(e.b);
    const ux = v.x - u.x;
    const uz = v.z - u.z;
    const len = Math.max(1, isqrt(ux * ux + uz * uz));
    const mx = (u.x + v.x) >> 1;
    const mz = (u.z + v.z) >> 1;
    // Towards this cell's side, and along the edge.
    const sx = cellId === e.a ? -ux : ux;
    const sz = cellId === e.a ? -uz : uz;
    if (isRidge && e.cave && e.cave.side === cellId) {
      const out = floorDiv(e.half * 3, 4) + 4;
      const x = mx + floorDiv(-uz * e.cave.t + sx * out, len);
      const z = mz + floorDiv(ux * e.cave.t + sz * out, len);
      return [x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1)];
    }
    if (caveOnly || foot) continue;
    const out = e.half + 4;
    foot = [(mx + floorDiv(sx * out, len)) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), (mz + floorDiv(sz * out, len)) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1)];
  }
  return foot;
}
