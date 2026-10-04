// Making room (Jade's Patch 3: anti-clumping, units/spacing.ts): a stacked
// idle clump spreads just far enough apart and stops; the land can press
// bodies together; walkers pass through everyone; workers at a node work at
// the same pace; fighters fan out round their foe without leaving its reach.
import { describe, expect, it, vi } from 'vitest';
import * as Sim from '@blockyrts/sim';
import {
  addMob,
  addWarrior,
  createWorld,
  DAY_STEPS,
  DUSK_STEPS,
  gap,
  halfWidth,
  isqrt,
  Mat,
  meleeOf,
  Mob,
  mobSpec,
  OrderKind,
  SPACING_PM,
  SPACING_SLACK_WU,
  step,
  Troop,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type SimState,
} from '@blockyrts/sim';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

/** A flat, dry, empty patch of w x h columns near the first worker: its corner and ground level. */
function flatSpot(s: SimState, w: number, h: number): { x: number; z: number; y: number } {
  const x0 = col(s.entities.x[0]!);
  const z0 = col(s.entities.z[0]!);
  for (let r = 6; r < 160; r += 2) {
    for (const [x, z] of [[x0 + r, z0], [x0 - r - w, z0], [x0, z0 + r], [x0, z0 - r - h], [x0 + r, z0 + r], [x0 - r - w, z0 - r - h]] as const) {
      const y = s.world.topAt(x, z);
      let ok = true;
      for (let dz = -2; dz < h + 2 && ok; dz++) {
        for (let dx = -2; dx < w + 2 && ok; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || s.buildings.footprintAt(cx, cz) !== 0) ok = false;
        }
      }
      if (ok) return { x, z, y };
    }
  }
  throw new Error('no flat spot');
}

function dist(s: SimState, a: number, b: number): number {
  const e = s.entities;
  return isqrt((e.x[a]! - e.x[b]!) ** 2 + (e.z[a]! - e.z[b]!) ** 2);
}

/** How far short of making room two bodies stand (0 or less: room enough). */
function short(s: SimState, a: number, b: number): number {
  return Math.floor(((halfWidth(s, a) + halfWidth(s, b)) * SPACING_PM) / 1000) - SPACING_SLACK_WU - dist(s, a, b);
}

/** The most any pair of the bodies stands short of making room. */
function worstShort(s: SimState, ids: readonly number[]): number {
  let worst = -Infinity;
  for (const a of ids) for (const b of ids) if (a < b) worst = Math.max(worst, short(s, a, b));
  return worst;
}

function places(s: SimState, ids: readonly number[]): number[][] {
  return ids.map((i) => [s.entities.x[i]!, s.entities.z[i]!]);
}

function stack(s: SimState, n: number, x: number, z: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(addWarrior(s, 0, x, z, Troop.Close, 1, 0));
  return out;
}

describe('making room', () => {
  it('spreads a stacked idle clump to no overlap within a few seconds, no farther than it needs, then stands still', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 12, 12);
    const cx = centre(x + 6);
    const cz = centre(z + 6);
    const ids = stack(s, 10, cx, cz);
    // Turned to step aside while they make room.
    step(s);
    expect(ids.every((i) => s.entities.order[i] === OrderKind.Move)).toBe(true);
    for (let k = 1; k < 60; k++) step(s);
    const e = s.entities;
    expect(worstShort(s, ids)).toBeLessThanOrEqual(0);
    // Ten bodies 54 cm apart fit inside about a metre of where they stood.
    for (const i of ids) expect(isqrt((e.x[i]! - cx) ** 2 + (e.z[i]! - cz) ** 2)).toBeLessThan(WU_PER_METRE + (WU_PER_METRE >> 1));
    const before = places(s, ids);
    for (let k = 0; k < 40; k++) step(s);
    expect(places(s, ids)).toEqual(before);
    for (const i of ids) expect(e.order[i]).toBe(OrderKind.Idle);
  });

  it('leaves a clump the land presses together where it is: a one-column pit and a one-column pillar', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z, y } = flatSpot(s, 12, 12);
    // A pit: the column in the middle, walled in by a rise no one can step up.
    s.world.editBox(x + 2, z + 2, x + 4, z + 4, y, y + 10, Mat.Stone);
    s.world.editBox(x + 3, z + 3, x + 3, z + 3, y, y + 10, Mat.Air);
    // A pillar: a column standing high above a drop no one steps off.
    s.world.editBox(x + 8, z + 8, x + 8, z + 8, y, y + 10, Mat.Stone);
    const pit = stack(s, 4, centre(x + 3), centre(z + 3));
    const pillar = stack(s, 4, centre(x + 8), centre(z + 8));
    for (let k = 0; k < 100; k++) step(s);
    const e = s.entities;
    for (const i of pit) expect([col(e.x[i]!), col(e.z[i]!)]).toEqual([x + 3, z + 3]);
    for (const i of pillar) expect([col(e.x[i]!), col(e.z[i]!), e.y[i]]).toEqual([x + 8, z + 8, s.entities.y[pillar[0]!]]);
    // Still overlapped (no room in a 45 cm column), and no one jitters.
    expect(worstShort(s, pit)).toBeGreaterThan(0);
    const before = places(s, [...pit, ...pillar]);
    for (let k = 0; k < 40; k++) step(s);
    expect(places(s, [...pit, ...pillar])).toEqual(before);
  });

  it('spreads a clump in a one-column corridor only along the corridor', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z, y } = flatSpot(s, 14, 6);
    // A corridor 12 columns long running east, one column wide, walled on both sides.
    s.world.editBox(x, z + 1, x + 13, z + 1, y, y + 10, Mat.Stone);
    s.world.editBox(x, z + 3, x + 13, z + 3, y, y + 10, Mat.Stone);
    const ids = stack(s, 5, centre(x + 6), centre(z + 2));
    for (let k = 0; k < 120; k++) step(s);
    const e = s.entities;
    // In the corridor's column, off its walls by a quarter column, and with room enough for all five along it.
    for (const i of ids) {
      expect(col(e.z[i]!)).toBe(z + 2);
      expect(Math.abs(e.z[i]! - centre(z + 2))).toBeLessThanOrEqual(WU_PER_COLUMN >> 2);
    }
    expect(worstShort(s, ids)).toBeLessThanOrEqual(0);
  });

  it('never steps a body into water, onto a building or up a cliff, and walkers pass through everyone on their way', () => {
    const run = (crowd: boolean): number[][] => {
      const s = createWorld(1, { peaceful: true });
      const { x, z } = flatSpot(s, 16, 6);
      const walker = 0;
      if (crowd) stack(s, 6, centre(x + 8), centre(z + 3));
      Sim.applyOrders(s, [{ kind: 'move', player: 0, units: [s.entities.id[walker]!], x: centre(x + 15), z: centre(z + 3) }]);
      const trail: number[][] = [];
      for (let k = 0; k < 400; k++) {
        step(s);
        trail.push([s.entities.x[walker]!, s.entities.z[walker]!]);
      }
      return trail;
    };
    // The walker's every step is the same with a stacked crowd standing on its way.
    expect(run(true)).toEqual(run(false));
  });

  it('lets fighters fan out round their foe without ever leaving its reach', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = DAY_STEPS + DUSK_STEPS + 20;
    const { x, z } = flatSpot(s, 16, 16);
    const w = addWarrior(s, 0, centre(x + 8), centre(z + 8), Troop.Close, 1, 0);
    const e = s.entities;
    e.hp[w] = e.maxHp[w] = 100000;
    Sim.applyOrders(s, [{ kind: 'hold', player: 0, units: [e.id[w]!] }]);
    const mobs: number[] = [];
    for (let k = 0; k < 6; k++) mobs.push(addMob(s, Mob.Zombie, 0, centre(x + 14), centre(z + 8), 0));
    const reach = mobSpec(Mob.Zombie).reach;
    let checked = 0;
    for (let k = 0; k < 400; k++) {
      step(s);
      for (const m of mobs) {
        if (e.hp[m]! <= 0 || e.atkAt[m] !== 0 || e.atkNext[m]! <= s.step || e.target[m] !== e.id[w]) continue;
        // Getting its breath back between blows: still in reach for the next.
        expect(gap(s, m, w)).toBeLessThanOrEqual(reach);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    const live = mobs.filter((m) => e.hp[m]! > 0);
    expect(live.length).toBe(6);
    // Round the warrior, not on one spot: no two of them closer than half a body apart.
    let nearest = Infinity;
    for (const a of live) for (const b of live) if (a < b) nearest = Math.min(nearest, dist(s, a, b));
    expect(nearest).toBeGreaterThan(halfWidth(s, live[0]!));
  });

  it('lets warriors round one foe fan out between blows, each staying in its reach', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = DAY_STEPS + DUSK_STEPS + 20;
    const { x, z } = flatSpot(s, 16, 16);
    const e = s.entities;
    const foe = addMob(s, Mob.Zombie, 0, centre(x + 8), centre(z + 8), 0);
    e.hp[foe] = e.maxHp[foe] = 100000;
    const ids = stack(s, 4, centre(x + 4), centre(z + 8));
    for (const i of ids) e.hp[i] = e.maxHp[i] = 100000;
    Sim.applyOrders(s, [{ kind: 'attack', player: 0, units: ids.map((i) => e.id[i]!), target: e.id[foe]! }]);
    let checked = 0;
    let between = Infinity;
    for (let k = 0; k < 400; k++) {
      step(s);
      let all = true;
      for (const i of ids) {
        if (e.order[i] !== OrderKind.Idle || e.target[i] !== e.id[foe] || e.atkAt[i] !== 0) {
          all = false;
          continue;
        }
        expect(gap(s, i, foe)).toBeLessThanOrEqual(meleeOf(s, i).reach);
        checked++;
      }
      // While all four get their breath back between blows, how short of room the closest two stand.
      if (all) between = worstShort(s, ids);
    }
    expect(checked).toBeGreaterThan(100);
    expect(between).toBeLessThanOrEqual(0);
  });
});

describe('workers at their jobs', () => {
  /** Ten workers sent to one tree, for 4,000 steps: what they bring in, and whether any worker at work changed column. */
  async function tenOnATree(sim: typeof Sim): Promise<{ lumber: number; hops: number }> {
    const s = sim.createWorld(1, { peaceful: true });
    const e = s.entities;
    for (let k = 0; k < 6; k++) {
      const x = e.x[k % 4]! + (k + 1) * 3000;
      const z = e.z[k % 4]!;
      e.add(s.nextEntityId++, 0, x, sim.standY(s, x, z), z, sim.WALK_SPEED_WU, sim.UnitKind.Worker);
    }
    const workers = [0, 1, 2, 3, 7, 8, 9, 10, 11, 12];
    const n = sim.findNode(s, 0, sim.Res.SoftwoodLumber, col(e.x[0]!), col(e.z[0]!), 120)!;
    sim.applyOrders(s, [{ kind: 'gather', player: 0, units: workers.map((i) => e.id[i]!), cx: n.cx, cz: n.cz, index: n.i }]);
    let hops = 0;
    for (let k = 0; k < 4000; k++) {
      const was = workers.map((i) => (e.act[i] === sim.Act.Work && e.order[i] === sim.OrderKind.Chop ? col(e.x[i]!) * 100000 + col(e.z[i]!) : -1));
      sim.step(s);
      workers.forEach((i, j) => {
        if (was[j] !== -1 && e.act[i] === sim.Act.Work && e.order[i] === sim.OrderKind.Chop && col(e.x[i]!) * 100000 + col(e.z[i]!) !== was[j]) hops++;
      });
    }
    return { lumber: s.players[0]!.pool[sim.Res.SoftwoodLumber]!, hops };
  }

  it('ten workers sent to one tree keep their pace: as much lumber as with no making room, and no one at work is moved off its column', async () => {
    const on = await tenOnATree(Sim);
    vi.resetModules();
    vi.doMock('../src/units/spacing.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), updateSpacing: () => {} }));
    const off = await tenOnATree((await import('@blockyrts/sim')) as typeof Sim);
    vi.doUnmock('../src/units/spacing.ts');
    vi.resetModules();
    expect(on.hops).toBe(0);
    expect(on.lumber).toBeGreaterThanOrEqual(off.lumber);
    expect(off.lumber).toBeGreaterThan(0);
  });
});
