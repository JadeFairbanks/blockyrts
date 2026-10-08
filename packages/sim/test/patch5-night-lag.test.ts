// Patch 5 BG-2, the late-night lag: the night's monsters find the town down
// fields over its coarse tiles, and every change to the walk map near the
// town (a breaker smashing the ground, water then flowing into the hole)
// threw the field away and built it again, with the coarse crossings of nine
// chunks round each change. Now the walk map is touched only by a change it
// can see, and the crossings and fields are brought up to date in place,
// redoing only what a change can reach. They are caches, so they must come
// out exactly as ones built afresh, as after loading a save, or the players'
// games would drift apart.
import { describe, expect, it } from 'vitest';
import { cloneState, createWorld, fieldFor, Mat, MOB_PLAN, CLIMBER_PLAN, MobClass, NO_WATER, standLevel, waterFlag, Walk, type Field, type SimState } from '../src/index.ts';

const CLASSES = [MobClass.Walker, MobClass.Climber, MobClass.Breaker];

/** Tiles where two fields' costs differ. */
function costDiffs(a: Field, b: Field): number {
  expect([a.x0, a.z0, a.w, a.h]).toEqual([b.x0, b.z0, b.w, b.h]);
  let n = 0;
  for (let k = 0; k < a.cost.length; k++) if (a.cost[k] !== b.cost[k]) n++;
  return n;
}

/** Coarse crossings that differ between two states over a field's window, for the monsters' two planners. */
function edgeDiffs(a: SimState, b: SimState, f: Field): number {
  let n = 0;
  for (const m of [MOB_PLAN, CLIMBER_PLAN]) {
    for (let tz = f.z0; tz < f.z0 + f.h; tz++) {
      for (let tx = f.x0; tx < f.x0 + f.w; tx++) {
        for (let d = 0; d < 8; d++) if (a.paths.edgeCost(tx, tz, d, m) !== b.paths.edgeCost(tx, tz, d, m)) n++;
      }
    }
  }
  return n;
}

describe('the town fields through a siege (Patch 5 BG-2)', () => {
  it('kept up to date in place, match fields and crossings built afresh from a save', () => {
    const s = createWorld(1, { players: 2 });
    const w = s.world;
    const pocket = w.gen.start.pockets[0]!;
    const pond = pocket.water;
    const first = CLASSES.map((c) => fieldFor(s, 0, c)!);
    // The channel from the pond runs away from the Big House, so it stays clear of the town's own tiles.
    const alongX = Math.abs(pocket.x - pond.x) >= Math.abs(pocket.z - pond.z);
    const sign = -Math.sign(alongX ? pocket.x - pond.x : pocket.z - pond.z) || 1;
    const at = (t: number, across: number): [number, number] => (alongX ? [pond.x + sign * t, pond.z + across] : [pond.x + across, pond.z + sign * t]);
    let repaired = 0;
    for (let round = 0; round < 6; round++) {
      // A breach out of the pond a little longer each round, with water running into it.
      const [x0, z0] = at(4 + round * 4, -1);
      const [x1, z1] = at(8 + round * 4, 1);
      w.editBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), -6, 4, Mat.Air);
      // Smashed ground out in the fields round the town: a pit and a heap.
      const px = pocket.x + 40 + round * 7;
      const pz = pocket.z - 35 + round * 11;
      const top = w.topAt(px, pz);
      w.editBox(px, pz, px + 2, pz + 2, top - 8, top, Mat.Air);
      w.editBox(px + 6, pz, px + 7, pz + 3, top, top + 6, Mat.Soil);
      for (let n = 0; n < 20; n++) w.flowWater();
      const fresh = cloneState(s);
      for (const c of CLASSES) {
        const live = fieldFor(s, 0, c)!;
        if (live === first[c]) repaired++;
        const again = fieldFor(fresh, 0, c)!;
        expect(again).not.toBe(live);
        expect(costDiffs(live, again)).toBe(0);
      }
      expect(edgeDiffs(s, fresh, first[0]!)).toBe(0);
    }
    // The point of it: the fields were brought up to date rather than built again.
    expect(repaired).toBeGreaterThan(0);
  });

  it('reads water only as wading, swimming and a swimmer’s level', () => {
    // 32nds of a terrain unit over ground at 10: dry, shallow, and deep enough to swim.
    expect(waterFlag(10, NO_WATER)).toBe(0);
    expect(waterFlag(10, 10 * 32)).toBe(0);
    expect(waterFlag(10, 10 * 32 + 1)).toBe(Walk.Wade);
    expect(waterFlag(10, 19 * 32)).toBe(Walk.Wade);
    expect(waterFlag(10, 19 * 32 + 1)).toBe(Walk.Deep);
    // Settling by a 32nd changes nothing the walk map holds; rising a whole unit lifts a swimmer.
    expect(standLevel(10, 30 * 32 + 3)).toBe(standLevel(10, 30 * 32 + 4));
    expect(standLevel(10, 31 * 32)).toBe(standLevel(10, 30 * 32) + 1);
    expect(standLevel(10, 12 * 32)).toBe(10);
  });
});
