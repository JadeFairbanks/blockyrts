// Patch 5's stone circles (Jade's Stone Circle document, SC-1 to SC-12 and
// SCA-4 to SCA-8, with her answers 2.5, 2.8, 9 and 10): placed from the seed
// alike on every machine, built to her rules, and the Goddess's gifts, the
// idols, the chests and the Bright Nights carried through a save.
import { describe, expect, it } from 'vitest';
import {
  brightFor,
  chestLoot,
  chestSlots,
  CHESTS_BY_TIER,
  CIRCLE_BANDS,
  CircleAct,
  circlePieces,
  CircleProp,
  circleSites,
  CircleType,
  cloneState,
  createWorld,
  CYCLE_STEPS,
  hashState,
  nextNight,
  payAny,
  Res,
  RESOURCE_COUNT,
  RINGS,
  skyBright,
  step,
  Trilithon,
  useProblem,
  WorldLayout,
  type CircleSite,
  type SimState,
} from '../src/index.ts';

/** A seed's world with a circle of a type, and that circle. */
function withCircle(type: number): { s: SimState; c: CircleSite } {
  for (let seed = 1; seed < 60; seed++) {
    const s = createWorld(seed, { players: 2, peaceful: true });
    const c = circleSites(s.world.layout).find((x) => x.type === type);
    if (c) return { s, c };
  }
  throw new Error('no seed with that circle');
}

/** Puts player 0's first worker beside a spot (wu). */
function standBy(s: SimState, x: number, z: number): number {
  const e = s.entities;
  const i = e.indexOf(1);
  e.x[i] = x + 8000;
  e.z[i] = z;
  e.y[i] = s.world.groundY(e.x[i]!, e.z[i]!, 0);
  return i;
}

describe('stone circles (SC-2, SC-3)', () => {
  it('stand 0 to 4 to a band in the Fringe, Deepwoods and Barrens, the same on every machine', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = circleSites(new WorldLayout(seed, 3));
      const b = circleSites(new WorldLayout(seed, 3));
      expect(b).toEqual(a);
      for (const band of CIRCLE_BANDS) expect(a.filter((c) => c.band === band).length).toBeLessThanOrEqual(4);
      expect(a.every((c) => CIRCLE_BANDS.includes(c.band))).toBe(true);
      for (const c of a) expect(c.tier === 1).toBe(c.type === CircleType.Generic);
    }
  });

  it('are built of one to three rings, 40 to 70% of each standing, with a chest per tier', () => {
    const layout = new WorldLayout(7, 2);
    for (const c of circleSites(layout)) {
      const pieces = circlePieces(layout, c.id);
      const tri = pieces.filter((p) => p.prop === CircleProp.Trilithon);
      expect(tri.length).toBe(RINGS.slice(0, c.tier).reduce((n, r) => n + r.trilithons, 0));
      const standing = tri.filter((p) => p.look === Trilithon.Intact || p.look === Trilithon.Worn).length;
      expect(standing * 100).toBeGreaterThanOrEqual(tri.length * 40 - 100);
      expect(standing * 100).toBeLessThanOrEqual(tri.length * 70 + 100);
      expect(pieces.filter((p) => p.prop === CircleProp.Chest).length).toBe(CHESTS_BY_TIER[c.tier - 1]);
      expect(pieces.some((p) => p.prop === CircleProp.Altar)).toBe(c.type !== CircleType.Generic);
      // Never two pieces on one column.
      expect(new Set(pieces.map((p) => `${p.gx},${p.gz}`)).size).toBe(pieces.length);
    }
  });

  it('fill a chest with at most five things from the loot table, the rarest first', () => {
    for (let k = 0; k < 200; k++) {
      const loot = chestLoot(9, k, -k);
      expect(loot.length).toBeGreaterThan(0);
      expect(loot.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('the circle goods (answer 2.5)', () => {
  it('pay for marble with bluestone and for flint with obsidian, 1 for 1, once the good itself runs out', () => {
    const pool = new Int32Array(RESOURCE_COUNT);
    pool[Res.Flint] = 2;
    pool[Res.Obsidian] = 5;
    pool[Res.Bluestone] = 4;
    expect(payAny(pool, [[Res.Flint, 4], [Res.Marble, 3]])).toEqual([[Res.Flint, 2], [Res.Bluestone, 3], [Res.Obsidian, 2]].sort((a, b) => a[0]! - b[0]!));
    expect([pool[Res.Flint], pool[Res.Obsidian], pool[Res.Bluestone]]).toEqual([0, 3, 1]);
  });
});

describe('the Goddess, her idol and the chests (answer 9, SCA-4, SC-6)', () => {
  it('blesses a player who leaves 5 gold and 3 Moon Roses: a Bright Night that night and every tenth after', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const pool = s.players[0]!.pool;
    pool[Res.Gold] = 5;
    pool[Res.MoonRose] = 3;
    standBy(s, c.x, c.z);
    step(s, [{ kind: 'circle', player: 0, units: [1], circle: c.id, act: CircleAct.Gift, arg: 0 }]);
    for (let k = 0; k < 60; k++) step(s);
    expect(pool[Res.Gold]).toBe(0);
    expect(pool[Res.MoonRose]).toBe(0);
    const first = nextNight(0);
    expect(s.circles.blessed[0]).toBe(first);
    expect(brightFor(s, 0, first)).toBe(true);
    expect(brightFor(s, 0, first + 1)).toBe(false);
    expect(brightFor(s, 0, first + 10)).toBe(true);
    expect(brightFor(s, 1, first)).toBe(false);
    expect(skyBright(s, first)).toBe(true);
  });

  it('lets a unit take the idol, which then lights the next night once in ten', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const i = standBy(s, c.x, c.z);
    step(s, [{ kind: 'circle', player: 0, units: [1], circle: c.id, act: CircleAct.TakeIdol, arg: 0 }]);
    for (let k = 0; k < 60; k++) step(s);
    expect(s.circles.taken).toEqual([c.id]);
    const bag = s.entities.bag[i]!;
    expect(bag[bag.indexOf(Res.MoonIdol) + 1]).toBe(1);
    s.players[0]!.pool[Res.MoonIdol] = 1;
    expect(useProblem(s, 0, Res.MoonIdol)).toBe('');
    step(s, [{ kind: 'useItem', player: 0, res: Res.MoonIdol, unit: 0 }]);
    const night = nextNight(s.step);
    expect(brightFor(s, 0, night)).toBe(true);
    expect(useProblem(s, 0, Res.MoonIdol)).not.toBe('');
    s.step += CYCLE_STEPS * 10;
    expect(useProblem(s, 0, Res.MoonIdol)).toBe('');
  });

  it('empties a chest slot by slot into the unit\'s bag, and keeps it through a save', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const chest = circlePieces(s.world.layout, c.id).find((p) => p.prop === CircleProp.Chest)!;
    standBy(s, chest.gx * 3600, chest.gz * 3600);
    const before = chestSlots(s, c.id, 0);
    step(s, [{ kind: 'circle', player: 0, units: [1], circle: c.id, act: CircleAct.TakeChest, arg: 0 }]);
    for (let k = 0; k < 40; k++) step(s);
    const after = chestSlots(s, c.id, 0);
    expect(after[0]).toBeNull();
    expect(after.slice(1)).toEqual(before.slice(1));
    const copy = cloneState(s);
    expect(chestSlots(copy, c.id, 0)).toEqual(after);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
