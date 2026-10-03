// Men up top (Table 4's tower slots and main base parapets; Jade's patch
// notes 1: manning defences). Anyone on foot may man a tower or a level 3+
// main base: warriors of every kind, mages, and workers. They stand at the
// places the footprint table gives the level (footprints.ts posts), drawn
// there and seen there. Archers and mages shoot and cast from up there as
// before; men without a ranged weapon are out of reach of anything that
// walks, and fight only flyers that swoop down at them. Workers sent in go
// up top while there is room and shelter inside when it is full; Everyone
// Home and a double-tapped Enter shelter them inside.

import { WU_PER_COLUMN, WU_PER_MODEL_UNIT, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { garrisonRoom, type Building } from '../buildings/store.ts';
import { footprintDims } from '../buildings/footprints.ts';
import { UnitKind, type SimState } from '../state.ts';
import { ENTER_TOP } from './unit-orders.ts';

/** The building a unit stands on top of, or undefined (it is out, or inside one). */
export function topOf(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  const id = e.inside[i]!;
  if (id === 0) return undefined;
  const o = e.queue[i]![0];
  if (o?.t !== 'enter' || o.b !== id) return undefined;
  if (e.kind[i] === UnitKind.Worker && o.auto !== ENTER_TOP) return undefined;
  const b = state.buildings.get(id);
  return b && garrisonRoom(b) > 0 ? b : undefined;
}

/** Whether a unit stands on top of a building. */
export function onTop(state: SimState, i: number): boolean {
  return topOf(state, i) !== undefined;
}

/** Whether a unit may go up on a tower or a main base's top: anyone on foot (a rider gets down first, Table 1's mounted row). */
export function mayMan(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.mount[i]) return false;
  const k = e.kind[i];
  return k === UnitKind.Warrior || k === UnitKind.Mage || k === UnitKind.Worker;
}

/** The units on top of a building, by index. */
export function unitsOnTop(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) if (e.inside[j] === id && onTop(state, j)) out.push(j);
  return out;
}

/** Where the n-th man on a building's top stands, wu: its level's posts in turn (the middle of its footprint if it has none). */
export function topPost(b: Building, n: number): [number, number, number] {
  const d = footprintDims(b.kind, b.variant, b.level);
  const x0 = (b.x + d.ox) * WU_PER_COLUMN;
  const z0 = (b.z + d.oz) * WU_PER_COLUMN;
  const y0 = b.y * WU_PER_TERRAIN_UNIT;
  const post = d.posts[n % Math.max(1, d.posts.length)];
  if (!post) return [x0 + ((d.w * WU_PER_COLUMN) >> 1), y0, z0 + ((d.d * WU_PER_COLUMN) >> 1)];
  return [x0 + post[0] * WU_PER_MODEL_UNIT, y0 + post[2] * WU_PER_MODEL_UNIT, z0 + post[1] * WU_PER_MODEL_UNIT];
}

/** The first post on a building's top that no one else up there stands on, for unit i coming up. */
export function freePost(state: SimState, b: Building, i: number): [number, number, number] {
  const e = state.entities;
  const others = unitsOnTop(state, b.id).filter((j) => j !== i);
  const n = Math.max(1, footprintDims(b.kind, b.variant, b.level).posts.length);
  for (let k = 0; k < n; k++) {
    const p = topPost(b, k);
    if (!others.some((j) => e.x[j] === p[0] && e.z[j] === p[2])) return p;
  }
  return topPost(b, others.length);
}

/** Puts everyone on a building's top on its posts, in index order (after it levels up and its posts move). */
export function spreadTop(state: SimState, b: Building): void {
  const e = state.entities;
  unitsOnTop(state, b.id).forEach((j, n) => {
    [e.x[j], e.y[j], e.z[j]] = topPost(b, n);
  });
}
