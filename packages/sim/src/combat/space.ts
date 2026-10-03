// A coarse grid of where units stand, rebuilt at the start of every step so
// targeting and hit tests only look at units close by (How ranged attacks
// hit: "only things in nearby chunks are checked"). Not state: it is rebuilt
// from the entity arrays each step. Callers break ties by distance, then id,
// so the order units are found in never matters.

import { floorDiv, WU_PER_METRE } from '../fixed.ts';
import type { EntityStore } from '../state.ts';

/** Cells are 8 m square. */
export const CELL_WU = 8 * WU_PER_METRE;

/** The monsters' owner (state.ts MONSTERS), the mob unit kind (UnitKind.Mob) and the goblin chief (mobs.ts Mob.GoblinChief), kept as numbers here so this module stays a leaf. */
const MONSTERS_OWNER = 254;
const MOB_KIND = 3;
const GOBLIN_CHIEF = 12;

export class UnitGrid {
  private readonly cells = new Map<number, number[]>();
  /**
   * The same cells holding only units the monsters do not own. No unit ever
   * becomes the monsters' during a step, so a monster looking for prey finds
   * exactly what near() would give it, less the thousands of its own kind
   * standing round it on a late night.
   */
  private readonly others = new Map<number, number[]>();
  /** The same cells holding only goblin chiefs (whoever's), whose shout every goblin near one listens for each step. */
  private readonly chiefs = new Map<number, number[]>();

  rebuild(e: EntityStore): void {
    this.cells.clear();
    this.others.clear();
    this.chiefs.clear();
    for (let i = 0; i < e.count; i++) {
      if (e.inside[i] !== 0 || e.hp[i]! <= 0) continue;
      this.insert(e, i);
    }
  }

  /** Adds a unit that appeared during the step (a new spawn), so it can be hit at once. */
  insert(e: EntityStore, i: number): void {
    const k = key(floorDiv(e.x[i]!, CELL_WU), floorDiv(e.z[i]!, CELL_WU));
    push(this.cells, k, i);
    if (e.owner[i] !== MONSTERS_OWNER) push(this.others, k, i);
    if (e.kind[i] === MOB_KIND && e.mob[i] === GOBLIN_CHIEF) push(this.chiefs, k, i);
  }

  /** Every unit index in the cells touching the square of half-size r round (x, z). */
  near(x: number, z: number, r: number, out: number[] = []): number[] {
    return gather(this.cells, x, z, r, out);
  }

  /** As near(), only goblin chiefs. */
  nearChiefs(x: number, z: number, r: number, out: number[] = []): number[] {
    return gather(this.chiefs, x, z, r, out);
  }

  /** As near(), only the units the monsters do not own: the players', the peoples', animals. */
  nearOthers(x: number, z: number, r: number, out: number[] = []): number[] {
    return gather(this.others, x, z, r, out);
  }
}

function push(cells: Map<number, number[]>, k: number, i: number): void {
  const c = cells.get(k);
  if (c) c.push(i);
  else cells.set(k, [i]);
}

function gather(cells: Map<number, number[]>, x: number, z: number, r: number, out: number[]): number[] {
  out.length = 0;
  const x0 = floorDiv(x - r, CELL_WU);
  const x1 = floorDiv(x + r, CELL_WU);
  const z0 = floorDiv(z - r, CELL_WU);
  const z1 = floorDiv(z + r, CELL_WU);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cells.get(key(cx, cz));
      if (c) for (const i of c) out.push(i);
    }
  }
  return out;
}

function key(cx: number, cz: number): number {
  return (cz + 0x100000) * 0x200000 + (cx + 0x100000);
}
