// What a blast does to the land (Patch 5). Jade's MB-6: a cannonball that
// hits a tree head on blows it apart and fells it, and one that lands on the
// ground chips the earth there, which lies about as earth to pick up; a
// catapult stone breaks only small trees and chips less (SHOTS fells and
// chips). Jade's BL-7: a wall breaker going off leaves a shallow crater.

import { floorDiv, WU_PER_COLUMN, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { Res } from '../economy/resources.ts';
import { standY, type SimState } from '../state.ts';
import { CHUNK_SHIFT, NO_WATER } from '../world/chunk.ts';
import { Mat } from '../world/materials.ts';
import { isTree } from '../world/props.ts';
import { nodeResource } from '../units/behaviour.ts';

/** The columns a blast chips, nearest the middle first: the column it hit, the four beside it, then the four corners. */
const AROUND: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** Earthy ground a blast chips: grass, soil, mud, ash and dead earth (rock, ore, sand and clay stand, s). */
function earthy(mat: number): boolean {
  return mat === Mat.Grass || mat === Mat.DryGrass || mat === Mat.Soil || mat === Mat.Mud || mat === Mat.Ash || mat === Mat.DeadEarth;
}

/** A column a blast may take ground from: no building on it and no water over it. */
function open(state: SimState, cx: number, cz: number): boolean {
  return state.buildings.footprintAt(cx, cz) === 0 && state.world.waterAt(cx, cz) === NO_WATER;
}

/** Earth (or a felled tree's lumber) left lying where a blast was, for `owner` (-1: anyone) to pick up. */
function leave(state: SimState, res: number, amt: number, x: number, z: number, owner: number): void {
  if (amt <= 0) return;
  state.loot.push({ id: state.nextEntityId++, res, amt, x, y: standY(state, x, z), z, at: state.step, by: 0, owner, brag: 0, src: 0 });
}

/**
 * A shot that hit the tree on a column fells it if the tree is no bigger than
 * `stage` (world/props.ts Stage): the tree is gone and half the lumber it
 * held lies where it stood (s). True when a tree fell.
 */
export function fellTree(state: SimState, cx: number, cz: number, stage: number, owner: number): boolean {
  const kx = cx >> CHUNK_SHIFT;
  const kz = cz >> CHUNK_SHIFT;
  const lx = cx - (kx << CHUNK_SHIFT);
  const lz = cz - (kz << CHUNK_SHIFT);
  for (const p of state.world.props(kx, kz, state.step)) {
    if (p.lx !== lx || p.lz !== lz || !isTree(p.kind) || p.stage === 0 || p.stage > stage) continue;
    // Blown apart: no seeds fall, and a sapling (which holds nothing yet) just breaks.
    const held = p.amount;
    state.world.removeProp(kx, kz, p.index);
    const res = nodeResource(p.kind, p.variant);
    const x = cx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const z = cz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    if (res >= 0) leave(state, res, held >> 1, x, z, owner);
    state.hits.push({ look: 'fell', x, y: p.y * WU_PER_TERRAIN_UNIT, z, id: 0 });
    return true;
  }
  return false;
}

/**
 * A shot that landed on the ground at (x, z) wu chips one terrain unit off
 * the top of up to `columns` earthy columns round it, nearest first, and the
 * earth lies there in one heap (MB-6).
 */
export function chipGround(state: SimState, x: number, z: number, columns: number, owner: number): void {
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  const w = state.world;
  let earth = 0;
  for (let k = 0; k < Math.min(columns, AROUND.length); k++) {
    const qx = cx + AROUND[k]![0];
    const qz = cz + AROUND[k]![1];
    if (!open(state, qx, qz)) continue;
    const layers = w.columnAt(qx, qz);
    const top = layers[layers.length - 2]!;
    if (!earthy(layers[layers.length - 1]!)) continue;
    if (w.editBox(qx, qz, qx, qz, top - 1, top, Mat.Air) > 0) earth++;
  }
  leave(state, Res.Earth, earth, cx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), cz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), owner);
}

/** A wall breaker's crater (Jade's BL-7: "like a creeper", very shallow): 2 terrain units (22 cm) deep in the middle, 1 round it, out to this many columns (s: 3, about 1.4 m). */
export const CRATER = { columns: 3, middle: 2, edge: 1 };

/** A wall breaker goes off at (x, z) wu: a shallow bowl of land is blown away (nothing is left to pick up), never under a building or water. */
export function crater(state: SimState, x: number, z: number): void {
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  const r = CRATER.columns;
  const w = state.world;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || !open(state, cx + dx, cz + dz)) continue;
      const deep = d2 * 4 <= r * r ? CRATER.middle : CRATER.edge;
      const top = w.topAt(cx + dx, cz + dz);
      w.editBox(cx + dx, cz + dz, cx + dx, cz + dz, top - deep, top, Mat.Air);
    }
  }
}
