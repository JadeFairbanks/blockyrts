// A coarse grid of where units stand, rebuilt at the start of every step so
// targeting and hit tests only look at units close by (How ranged attacks
// hit: "only things in nearby chunks are checked"). Not state: it is rebuilt
// from the entity arrays each step. Callers break ties by distance, then id,
// so the order units are found in never matters.

import { floorDiv, WU_PER_METRE } from '../fixed.ts';
import type { EntityStore } from '../state.ts';

/** Cells are 8 m square. */
export const CELL_WU = 8 * WU_PER_METRE;

export class UnitGrid {
  private readonly cells = new Map<number, number[]>();

  rebuild(e: EntityStore): void {
    this.cells.clear();
    for (let i = 0; i < e.count; i++) {
      if (e.inside[i] !== 0 || e.hp[i]! <= 0) continue;
      const k = key(floorDiv(e.x[i]!, CELL_WU), floorDiv(e.z[i]!, CELL_WU));
      let c = this.cells.get(k);
      if (!c) {
        c = [];
        this.cells.set(k, c);
      }
      c.push(i);
    }
  }

  /** Adds a unit that appeared during the step (a new spawn), so it can be hit at once. */
  insert(e: EntityStore, i: number): void {
    const k = key(floorDiv(e.x[i]!, CELL_WU), floorDiv(e.z[i]!, CELL_WU));
    const c = this.cells.get(k);
    if (c) c.push(i);
    else this.cells.set(k, [i]);
  }

  /** Every unit index in the cells touching the square of half-size r round (x, z). */
  near(x: number, z: number, r: number, out: number[] = []): number[] {
    out.length = 0;
    const x0 = floorDiv(x - r, CELL_WU);
    const x1 = floorDiv(x + r, CELL_WU);
    const z0 = floorDiv(z - r, CELL_WU);
    const z1 = floorDiv(z + r, CELL_WU);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells.get(key(cx, cz));
        if (c) for (const i of c) out.push(i);
      }
    }
    return out;
  }
}

function key(cx: number, cz: number): number {
  return (cz + 0x100000) * 0x200000 + (cx + 0x100000);
}
