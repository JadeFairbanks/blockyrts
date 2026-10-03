// Plants grow in steps (Jade's patch notes 1): a hazel picked bare is a hazel
// sapling that holds nothing, tree saplings hold nothing until they look like
// small trees, and buildings may go up over saplings, which the builder
// clears first.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  canBuildOver,
  createWorld,
  CYCLE_STEPS,
  footprintRect,
  growth,
  growthStages,
  HAZEL_GROWTH,
  OrderKind,
  placementBlocked,
  PLANT_GROWTH,
  PropKind,
  PROPS,
  Res,
  Stage,
  stageName,
  step,
  TREE_GROWTH,
  World,
  type Order,
  type PropView,
  type SimState,
} from '../src/index.ts';

const MINUTE = 60 * 20;

/** The first prop of a kind within a few chunks of the first pocket that holds something. */
function findProp(w: World, kind: number): { cx: number; cz: number; i: number } {
  for (let cz = -4; cz <= 3; cz++) {
    for (let cx = -4; cx <= 4; cx++) {
      for (const v of w.props(cx, cz, 0)) if (v.kind === kind && v.amount > 0 && v.stage === Stage.Grown) return { cx, cz, i: v.index };
    }
  }
  throw new Error(`no ${kind} near the start`);
}

const viewAt = (w: World, p: { cx: number; cz: number; i: number }, at: number): PropView | undefined => w.prop(p.cx, p.cz, p.i, at);

describe('growth stage tables', () => {
  for (const [name, stages] of [['trees', TREE_GROWTH], ['hazel', HAZEL_GROWTH], ['herbs and flax', PLANT_GROWTH]] as const) {
    it(`${name}: start at 0, rise in order, end grown, and hold nothing while small enough to build over`, () => {
      expect(stages[0]!.fromPm).toBe(0);
      const last = stages[stages.length - 1]!;
      expect([last.stage, last.fromPm, last.sizePm, last.yieldPm]).toEqual([Stage.Grown, 1000, 1000, 1000]);
      for (let k = 1; k < stages.length; k++) {
        expect(stages[k]!.stage).toBeGreaterThan(stages[k - 1]!.stage);
        expect(stages[k]!.fromPm).toBeGreaterThan(stages[k - 1]!.fromPm);
        expect(stages[k]!.sizePm).toBeGreaterThan(stages[k - 1]!.sizePm);
        expect(stages[k]!.yieldPm).toBeGreaterThanOrEqual(stages[k - 1]!.yieldPm);
      }
      for (const s of stages) if (s.buildOver) expect(s.yieldPm).toBe(0);
    });
  }

  it('names the stages after the plant', () => {
    expect(stageName(PropKind.Hazel, Stage.Sapling)).toBe('Hazel sapling');
    expect(stageName(PropKind.Hazel, Stage.Grown)).toBe('Hazel bush');
    expect(stageName(PropKind.Pine, Stage.Sapling)).toBe('Pine sapling');
    expect(stageName(PropKind.Oak, Stage.Young)).toBe('Young great oak');
    expect(stageName(PropKind.WildFlax, Stage.Sapling)).toBe('Sprouting wild flax');
    expect(stageName(PropKind.StoneOutcrop, Stage.Grown)).toBe('Stone outcrop');
  });

  it('grows in steps: the drawn size only ever takes a stage\'s size', () => {
    const t = PROPS[PropKind.Pine]!.regrowSteps;
    const sizes = new Set(TREE_GROWTH.map((s) => s.sizePm));
    let last = 0;
    let changes = 0;
    for (let age = 0; age <= t + 200; age += 97) {
      const g = growth(PropKind.Pine, age);
      expect(sizes.has(g.size)).toBe(true);
      if (g.size !== last) changes++;
      last = g.size;
      if (g.stage !== Stage.Grown) expect(g.next).toBeGreaterThan(0);
      else expect(g.next).toBe(-1);
    }
    expect(changes).toBe(TREE_GROWTH.length);
    // Rocks, dead trees and fish do not grow.
    expect(growthStages(PropKind.StoneOutcrop)).toBeNull();
    expect(growthStages(PropKind.DeadTree)).toBeNull();
    expect(growthStages(PropKind.FishTrout)).toBeNull();
  });
});

describe('a hazel bush picked bare', () => {
  it('is a hazel sapling that holds no sticks, then grows back in steps over 2 days', () => {
    const w = new World(1, 2);
    const h = findProp(w, PropKind.Hazel);
    expect(w.harvest(h.cx, h.cz, h.i, 100, 1000)).toBe(10);
    const at = (dt: number): PropView => viewAt(w, h, 1000 + dt)!;
    expect(at(1).stage).toBe(Stage.Sapling);
    expect(at(1).amount).toBe(0);
    expect(at(1).size).toBe(250);
    expect(w.harvest(h.cx, h.cz, h.i, 100, 1001)).toBe(0);
    // Young from 30% of its 2 days, half-grown from 65%, grown at 100%.
    const day2 = 2 * CYCLE_STEPS;
    expect(at(Math.ceil(day2 * 0.3) - 1).stage).toBe(Stage.Sapling);
    expect([at(Math.ceil(day2 * 0.3)).stage, at(Math.ceil(day2 * 0.3)).amount, at(Math.ceil(day2 * 0.3)).size]).toEqual([Stage.Young, 3, 500]);
    expect([at(Math.ceil(day2 * 0.65)).stage, at(Math.ceil(day2 * 0.65)).amount]).toEqual([Stage.HalfGrown, 6]);
    expect([at(day2).stage, at(day2).amount, at(day2).size, at(day2).next]).toEqual([Stage.Grown, 10, 1000, -1]);
  });

  it('picked while young gives what it holds and starts again as a sapling; part-picked it keeps growing', () => {
    const w = new World(1, 2);
    const h = findProp(w, PropKind.Hazel);
    w.harvest(h.cx, h.cz, h.i, 100, 0);
    const young = Math.ceil(2 * CYCLE_STEPS * 0.3);
    // Part of a young bush: one stick taken, two left, and it keeps growing from when it was picked bare.
    expect(w.harvest(h.cx, h.cz, h.i, 1, young)).toBe(1);
    expect(viewAt(w, h, young)!.amount).toBe(2);
    expect(viewAt(w, h, 2 * CYCLE_STEPS)!.stage).toBe(Stage.Grown);
    expect(viewAt(w, h, 2 * CYCLE_STEPS)!.amount).toBe(2);
    // Picked bare again: a sapling once more.
    expect(w.harvest(h.cx, h.cz, h.i, 100, 2 * CYCLE_STEPS)).toBe(2);
    expect(viewAt(w, h, 2 * CYCLE_STEPS + 1)!.stage).toBe(Stage.Sapling);
  });
});

describe('young trees', () => {
  it('hold nothing as seeds and saplings, then a share of their lumber once they look like small trees', () => {
    const w = new World(1, 2);
    const pine = PropKind.Pine;
    const at = w.addProp(3, -100, pine, 12345, PROPS[pine]!.yield, 0);
    const v = (minutes: number): PropView => w.prop(at.cx, at.cz, at.i, minutes * MINUTE)!;
    expect([v(1).stage, v(1).amount]).toEqual([Stage.Seed, 0]);
    expect([v(10).stage, v(10).amount]).toEqual([Stage.Sapling, 0]);
    expect([v(25).stage, v(25).amount]).toEqual([Stage.Young, 7]);
    expect([v(45).stage, v(45).amount]).toEqual([Stage.HalfGrown, 13]);
    expect([v(60).stage, v(60).amount]).toEqual([Stage.Grown, 20]);
    // Felled young, it gives its 7 lumber and drops its seeds like any felled tree.
    const before = [...w.addedProps.values()].flat().length;
    expect(w.harvest(at.cx, at.cz, at.i, 5, 25 * MINUTE)).toBe(5);
    expect(w.prop(at.cx, at.cz, at.i, 25 * MINUTE)!.amount).toBe(2);
    expect(w.harvest(at.cx, at.cz, at.i, 5, 25 * MINUTE + 1)).toBe(2);
    expect(w.prop(at.cx, at.cz, at.i, 25 * MINUTE + 2)).toBeUndefined();
    expect([...w.addedProps.values()].flat().length - before).toBeGreaterThanOrEqual(1);
  });

  it('a part-chopped young tree holds only what is left as it grows', () => {
    const w = new World(1, 2);
    const at = w.addProp(3, -100, PropKind.Spruce, 777, PROPS[PropKind.Spruce]!.yield, 0);
    expect(w.harvest(at.cx, at.cz, at.i, 5, 25 * MINUTE)).toBe(5);
    expect(w.prop(at.cx, at.cz, at.i, 70 * MINUTE)!.amount).toBe(2);
  });
});

/** A clear, level, explored spot for a building east of the Big House. */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = s.buildings.list[0]!;
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + 16 + dx, b.z + dz) === Blocked.None) return [b.x + 16 + dx, b.z + dz];
      }
    }
  }
  throw new Error('no free spot');
}

describe('building over saplings', () => {
  it('lets a building go over saplings and sprouting plants but not over a grown bush', () => {
    const s = createWorld(1, { peaceful: true });
    const kind = BuildingKind.Storehouse;
    const [x, z] = freeSpot(s, kind);
    const [x0, z0, x1, z1] = footprintRect({ kind, x, z });
    // A pine sapling (10 minutes old) and a hazel picked bare.
    s.world.addProp(x0, z0, PropKind.Pine, 99, PROPS[PropKind.Pine]!.yield, -10 * MINUTE);
    const hazel = s.world.addProp(x1, z1, PropKind.Hazel, 98, 10, 0);
    expect(placementBlocked(s, 0, kind, x, z)).toBe(Blocked.Node);
    s.world.harvest(hazel.cx, hazel.cz, hazel.i, 100, 0);
    expect(canBuildOver(PropKind.Hazel, Stage.Sapling)).toBe(true);
    expect(placementBlocked(s, 0, kind, x, z)).toBe(Blocked.None);
  });

  it('has the builder pull the saplings up before building starts', () => {
    const s = createWorld(1, { peaceful: true });
    const kind = BuildingKind.Storehouse;
    const [x, z] = freeSpot(s, kind);
    const [x0, z0, x1, z1] = footprintRect({ kind, x, z });
    const pine = s.world.addProp(x0, z0, PropKind.Pine, 99, PROPS[PropKind.Pine]!.yield, -10 * MINUTE);
    const hazel = s.world.addProp(x1, z1, PropKind.Hazel, 98, 10, 0);
    s.world.harvest(hazel.cx, hazel.cz, hazel.i, 100, 0);
    const pool = s.players[0]!.pool;
    pool[Res.SoftwoodLumber] = 100;
    pool[Res.Stone] = 100;
    const orders: Order[] = [{ kind: 'build', player: 0, units: [1], building: kind, variant: 0, x, z }];
    step(s, orders);
    let cleared = -1;
    let pulling = 0;
    for (let k = 0; k < 4000 && s.buildings.list.length === 1; k++) {
      step(s);
      if (s.entities.order[0] === OrderKind.Farm) pulling++;
      if (cleared < 0 && !s.world.prop(pine.cx, pine.cz, pine.i, s.step) && !s.world.prop(hazel.cx, hazel.cz, hazel.i, s.step)) cleared = s.step;
    }
    expect(cleared).toBeGreaterThan(0);
    // The building went up only once both were gone, after 2 s pulling up each.
    expect(pulling).toBeGreaterThanOrEqual(2 * 2 * 20 - 1);
    expect(s.buildings.list.length).toBe(2);
    expect(s.step).toBeGreaterThanOrEqual(cleared);
    const b = s.buildings.list[1]!;
    expect([b.x, b.z]).toEqual([x, z]);
  });
});
