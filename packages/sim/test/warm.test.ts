// Building the caches between steps (warmCaches: the game worker on each
// player's machine does it while the next step is not due) must leave the
// game exactly as it was. The land, the walk maps and the coarse crossings
// are pure caches of the state, so caches built early must match ones built
// afresh, as after loading a save, and a game whose caches were all built
// early must play step for step as one that builds them as it goes, or the
// players' games would drift apart.
import { describe, expect, it } from 'vitest';
import {
  addMob,
  buildingCentre,
  BuildingKind,
  CLIMBER_PLAN,
  cloneState,
  createWorld,
  DAY_STEPS,
  DUSK_STEPS,
  fieldFor,
  fieldWindow,
  floorDiv,
  hashState,
  Mat,
  Mob,
  MOB_PLAN,
  MobClass,
  step,
  warmCaches,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

/** Walkers, climbers and breakers, so every kind of field is asked for. */
const KINDS = [Mob.Zombie, Mob.GiantRat, Mob.GoblinCutter, Mob.GraveHound, Mob.Fiend, Mob.BloatedCorpse];
const CLASSES = [MobClass.Walker, MobClass.Climber, MobClass.Breaker];

/** Coarse crossings over a player's field that differ between two states, for the monsters' two planners. */
function edgeDiffs(a: SimState, b: SimState, player: number): number {
  const f = fieldWindow(a, player)!;
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

/** Field tiles whose cost differs between two states. */
function fieldDiffs(a: SimState, b: SimState, player: number): number {
  let n = 0;
  for (const c of CLASSES) {
    const fa = fieldFor(a, player, c)!;
    const fb = fieldFor(b, player, c)!;
    for (let k = 0; k < fa.cost.length; k++) if (fa.cost[k] !== fb.cost[k]) n++;
  }
  return n;
}

describe('warming the caches between steps', () => {
  it('builds the crossings and fields a game loaded afresh would', () => {
    const s = createWorld(1, { players: 2 });
    let jobs = 0;
    while (warmCaches(s)) jobs++;
    expect(jobs).toBeGreaterThan(100);
    expect(edgeDiffs(s, cloneState(s), 0)).toBe(0);
    expect(fieldDiffs(s, cloneState(s), 0)).toBe(0);
    // Smashed ground out in the field round the town: warming again redoes only what it touched.
    const base = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    const [x, z] = buildingCentre(base).map((v) => floorDiv(v, WU_PER_COLUMN));
    for (let k = 0; k < 4; k++) {
      const px = x! + 40 + k * 9;
      const pz = z! - 30 + k * 13;
      const top = s.world.topAt(px, pz);
      s.world.editBox(px, pz, px + 2, pz + 2, top - 8, top, Mat.Air);
      s.world.editBox(px + 6, pz, px + 7, pz + 3, top, top + 6, Mat.Soil);
    }
    jobs = 0;
    while (warmCaches(s)) jobs++;
    expect(jobs).toBeGreaterThan(0);
    expect(edgeDiffs(s, cloneState(s), 0)).toBe(0);
    expect(fieldDiffs(s, cloneState(s), 0)).toBe(0);
  });

  it('plays the same game, step for step', () => {
    const cold = createWorld(1, { players: 2 });
    cold.step = DAY_STEPS + DUSK_STEPS;
    const base = cold.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    const [bx, bz] = buildingCentre(base);
    // A ring of monsters 40 to 60 m out, coming for the town.
    for (let k = 0; k < 12; k++) {
      const r = (40 + ((k * 7) % 21)) * WU_PER_METRE;
      const [dx, dz] = [[r, 0], [0, r], [-r, 0], [0, -r]][k % 4]!;
      addMob(cold, KINDS[k % KINDS.length]!, 0, bx + dx! + (k >> 2) * 3 * WU_PER_METRE, bz + dz!, 1);
    }
    const warm = cloneState(cold);
    let jobs = 0;
    for (let k = 0; k < 200; k++) {
      while (warmCaches(warm)) jobs++;
      step(cold);
      step(warm);
      if (k % 20 === 19) expect(hashState(warm)).toBe(hashState(cold));
    }
    expect(jobs).toBeGreaterThan(100);
  });
});
