// Patch 4 (Jade): "workers digging do not seem to need to turn in their
// inventories like if they were gathering, but they should still be required
// to, and then return to their task just like with gathering (standardize
// that interaction)". A digger carries what it carves as a gatherer carries
// its load, 25 lb of one kind (a cart's load with a cart), takes a full load
// to the nearest main base or Storehouse and comes back to the dig; its last
// load goes home when the dig is finished. One shut in the pit it dug climbs
// out at the edge on its way. Mineshafts already turned in (Patch 2, m4.test.ts).
import { describe, expect, it } from 'vitest';
import {
  Act,
  Blocked,
  BuildingKind,
  buildingCentre,
  carryCapacity,
  createWorld,
  deserializeState,
  hashState,
  Mat,
  NO_CARRY,
  placeBuilding,
  placementBlocked,
  Res,
  serializeState,
  step,
  TOOL_GEAR,
  ToolJob,
  WU_PER_COLUMN,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A flat, open, explored patch w by h columns (with a 3-column margin) at least `from` columns from the first worker. */
function flatSpot(s: SimState, w: number, h: number, from = 6): { x: number; z: number; y: number } {
  const x0 = col(s.entities.x[0]!);
  const z0 = col(s.entities.z[0]!);
  for (let r = from; r < 120; r += 2) {
    for (const [x, z] of [[x0 + r, z0], [x0 - r - w, z0], [x0, z0 + r], [x0, z0 - r - h]] as const) {
      const y = s.world.topAt(x, z);
      let ok = true;
      for (let dz = -3; dz < h + 3 && ok; dz++) {
        for (let dx = -3; dx < w + 3 && ok; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || s.buildings.footprintAt(cx, cz) !== 0 || !s.world.isExplored(cx >> 2, cz >> 2)) ok = false;
          for (const p of s.world.props(cx >> 6, cz >> 6, s.step)) if ((cx >> 6) * 64 + p.lx === cx && (cz >> 6) * 64 + p.lz === cz && p.stage > 0) ok = false;
        }
      }
      if (ok) return { x, z, y };
    }
  }
  throw new Error('no flat spot');
}

/** A world with only the workers listed (by index) on the job: the warriors and the rest go, so nobody stands on a column of the dig. */
function camp(keep: number[]): SimState {
  const s = createWorld(1, { peaceful: true, warriors: 0 });
  const e = s.entities;
  const ids: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && !keep.includes(i)) ids.push(e.id[i]!);
  for (const id of ids) e.remove(id);
  return s;
}

function dig(s: SimState, units: number[], x: number, z: number, w: number, h: number, floor: number): Order {
  return { kind: 'dig', player: 0, units: units.map((i) => s.entities.id[i]!), x0: x, z0: z, x1: x + w - 1, z1: z + h - 1, level: floor, level2: 0, tunnel: 0 };
}

/** Each hand-in: what the worker carried and where it stood as its load went to 0. */
interface Trip {
  res: number;
  amount: number;
  x: number;
  z: number;
  step: number;
}

/** The Earth in a loot bag, (resource, count) pairs. */
function bagEarth(bag: number[]): number {
  let n = 0;
  for (let k = 0; k < bag.length; k += 2) if (bag[k] === Res.Earth) n += bag[k + 1]!;
  return n;
}

function watchTrips(s: SimState, i: number, until: () => boolean, max: number): { trips: Trip[]; most: number } {
  const e = s.entities;
  const trips: Trip[] = [];
  let most = 0;
  let res = NO_CARRY as number;
  let amount = 0;
  for (let k = 0; k < max && !until(); k++) {
    step(s);
    most = Math.max(most, e.carryAmt[i]!);
    if (amount > 0 && e.carryAmt[i] === 0) trips.push({ res, amount, x: e.x[i]!, z: e.z[i]!, step: s.step });
    res = e.carryRes[i]!;
    amount = e.carryAmt[i]!;
  }
  return { trips, most };
}

describe('Patch 4: diggers turn in their loads like gatherers', () => {
  it('carries 25 lb of earth to the main base, comes back to the dig, and takes the last part load home when it is finished', () => {
    const s = camp([0]);
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const { x, z, y } = flatSpot(s, 4, 4);
    const earth = pool[Res.Earth]!;
    // A pit 4 by 4 columns (1.8 m a side), 1 m deep: 144 Earth.
    run(s, 1, [dig(s, [0], x, z, 4, 4, y - 9)]);
    // What it digs is in its hands, not in the stock.
    for (let k = 0; k < 2000 && e.carryAmt[0] === 0; k++) step(s);
    expect(e.carryRes[0]).toBe(Res.Earth);
    expect(e.carryAmt[0]).toBe(1);
    expect(pool[Res.Earth]).toBe(earth);
    let finishedAt = 0;
    const { trips, most } = watchTrips(s, 0, () => {
      if (s.events.some((v) => v.text === 'The dig is finished.')) finishedAt = s.step;
      return finishedAt > 0 && e.carryAmt[0] === 0 && e.queue[0]!.length === 0;
    }, 30000);
    // A load is 25 lb: 5 Earth (5 lb each).
    expect(carryCapacity(s, 0, Res.Earth)).toBe(5);
    expect(most).toBe(5);
    // 28 full loads, and the last 4 handed in after the dig was finished.
    expect(trips.length).toBe(29);
    expect(trips.slice(0, -1).every((t) => t.res === Res.Earth && t.amount === 5)).toBe(true);
    expect(trips.at(-1)!.amount).toBe(4);
    expect(trips.at(-1)!.step).toBeGreaterThan(finishedAt);
    expect(pool[Res.Earth]).toBe(earth + 144);
    for (let zz = z; zz < z + 4; zz++) for (let xx = x; xx < x + 4; xx++) expect(s.world.topAt(xx, zz)).toBe(y - 9);
    expect(s.sites.length).toBe(0);
  });

  it('takes its load to a Storehouse nearer than the main base', () => {
    const s = camp([0]);
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 3, 3, 40);
    // A finished Storehouse 6 m or so from the dig, which is some 20 m from the Big House.
    let store: Building | null = null;
    for (let r = 4; r < 30 && !store; r++) {
      for (const [sx, sz] of [[x + r, z], [x - r - 8, z], [x, z + r], [x, z - r - 8]] as const) {
        if (placementBlocked(s, 0, BuildingKind.Storehouse, sx, sz) === Blocked.None) {
          store = placeBuilding(s, 0, BuildingKind.Storehouse, 0, sx, sz, true);
          break;
        }
      }
    }
    expect(store).not.toBeNull();
    run(s, 1, [dig(s, [0], x, z, 3, 3, y - 4)]);
    const { trips } = watchTrips(s, 0, () => s.sites.length === 0 && e.carryAmt[0] === 0, 20000);
    expect(trips.length).toBeGreaterThan(3);
    const [sx, sz] = buildingCentre(store!);
    const [hx, hz] = buildingCentre(bigHouse(s));
    for (const t of trips) expect(Math.hypot(t.x - sx, t.z - sz)).toBeLessThan(Math.hypot(t.x - hx, t.z - hz));
  });

  it("fills a hand cart's 150 lb before the trip home", () => {
    const s = camp([0]);
    const e = s.entities;
    e.kit[0] = Res.HandCart;
    const pool = s.players[0]!.pool;
    const { x, z, y } = flatSpot(s, 4, 4);
    const earth = pool[Res.Earth]!;
    run(s, 1, [dig(s, [0], x, z, 4, 4, y - 9)]);
    const { trips, most } = watchTrips(s, 0, () => s.sites.length === 0 && e.carryAmt[0] === 0, 30000);
    expect(carryCapacity(s, 0, Res.Earth)).toBe(30);
    expect(most).toBe(30);
    expect(trips.map((t) => t.amount)).toEqual([30, 30, 30, 30, 24]);
    expect(pool[Res.Earth]).toBe(earth + 144);
  });

  it('fills a load with one kind through soil over stone, and goes back to the column it left, so only the last load of each kind is short', () => {
    const s = camp([0]);
    const e = s.entities;
    e.toolBreak[0] = TOOL_GEAR[8]![ToolJob.Break]!;
    const pool = s.players[0]!.pool;
    const { x, z, y } = flatSpot(s, 3, 3);
    // Soil 3 units deep over 3 units of stone, 3 by 3 columns: 27 Earth and 27 stone.
    s.world.editBox(x, z, x + 2, z + 2, y - 6, y - 3, Mat.Stone);
    const before = [pool[Res.Earth]!, pool[Res.Stone]!];
    run(s, 1, [dig(s, [0], x, z, 3, 3, y - 6)]);
    const { trips } = watchTrips(s, 0, () => s.sites.length === 0 && e.carryAmt[0] === 0, 40000);
    expect([pool[Res.Earth]! - before[0]!, pool[Res.Stone]! - before[1]!]).toEqual([27, 27]);
    // Six loads of each (5 five times and 2), the fewest trips there can be.
    expect(trips.length).toBe(12);
    for (const r of [Res.Earth, Res.Stone]) expect(trips.filter((t) => t.res === r).map((t) => t.amount).sort((a, b) => b - a)).toEqual([5, 5, 5, 5, 5, 2]);
  });

  it('goes home with a load it brought of something else before it digs', () => {
    const s = camp([0]);
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const { x, z, y } = flatSpot(s, 2, 2);
    e.carryRes[0] = Res.SoftwoodLumber;
    e.carryAmt[0] = 3;
    const wood = pool[Res.SoftwoodLumber]!;
    run(s, 1, [dig(s, [0], x, z, 2, 2, y - 2)]);
    expect(e.act[0]).toBe(Act.ToDrop);
    const { trips } = watchTrips(s, 0, () => s.sites.length === 0 && e.carryAmt[0] === 0, 10000);
    expect(trips[0]).toMatchObject({ res: Res.SoftwoodLumber, amount: 3 });
    expect(pool[Res.SoftwoodLumber]).toBe(wood + 3);
    expect(trips.slice(1).every((t) => t.res === Res.Earth)).toBe(true);
  });

  it('Return cargo takes a digger to the drop-off and back to its dig', () => {
    const s = camp([0]);
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 4, 4);
    run(s, 1, [dig(s, [0], x, z, 4, 4, y - 9)]);
    const site = s.sites[0]!.id;
    for (let k = 0; k < 4000 && !(e.act[0] === Act.Work && e.carryAmt[0] === 2); k++) step(s);
    expect(e.carryAmt[0]).toBe(2);
    run(s, 1, [{ kind: 'returnCargo', player: 0, units: [e.id[0]!] }]);
    expect(e.queue[0]).toEqual([{ t: 'return' }, { t: 'dig', site }]);
    for (let k = 0; k < 4000 && e.carryAmt[0]! > 0; k++) step(s);
    expect(e.carryAmt[0]).toBe(0);
    expect(e.queue[0]).toEqual([{ t: 'dig', site }]);
    // Back at the pit, digging again.
    for (let k = 0; k < 4000 && e.carryAmt[0] === 0; k++) step(s);
    expect(e.carryRes[0]).toBe(Res.Earth);
    expect(e.queue[0]![0]).toEqual({ t: 'dig', site });
  });

  it('diggers in a wide pit get out with their loads, cutting no stairs (Patch 5 GP-17), and carry on the same after a save', () => {
    const s = camp([0, 1, 2, 3]);
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const team = [0, 1, 2, 3];
    for (const i of team) e.toolBreak[i] = TOOL_GEAR[8]![ToolJob.Break]!;
    // 12 by 12 columns (5.4 m a side), 1 m deep: the middle is out of reach from the edge, so they go down into it, and
    // 1 m is more than a worker jumps up (56 cm). Patch 4 had them cut crude stairs out; Patch 5's workers climb where they must.
    const { x, z, y } = flatSpot(s, 12, 12);
    const earth = pool[Res.Earth]!;
    run(s, 1, [dig(s, team, x, z, 12, 12, y - 9)]);
    let stuck = 0;
    let half: Uint8Array | null = null;
    for (let k = 0; k < 40000 && (s.sites.length > 0 || team.some((i) => e.carryAmt[i]! > 0 || e.queue[i]!.length > 0)); k++) {
      step(s);
      // No wild animal wanders into the pit (one that falls in stays there, and a column it stands on waits for it).
      for (let j = e.count - 1; j >= 0; j--) if (e.owner[j] !== 0) e.remove(e.id[j]!);
      stuck += s.events.filter((v) => v.text === 'I cannot reach a drop-off.').length;
      // Saved and loaded half way, it carries on the same.
      if (!half && pool[Res.Earth]! - earth >= 12 * 12 * 9 / 2) half = serializeState(s);
    }
    expect(s.sites.length).toBe(0);
    expect(stuck).toBe(0);
    // Nothing outside the pit is dug: no stairs.
    for (let zz = z - 4; zz < z + 16; zz++) {
      for (let xx = x - 4; xx < x + 16; xx++) {
        if (xx >= x && xx < x + 12 && zz >= z && zz < z + 12) continue;
        expect(s.world.topAt(xx, zz)).toBe(y);
      }
    }
    // Every unit of earth dug is in the stock, none lost.
    expect(pool[Res.Earth]! - earth + team.reduce((n, i) => n + bagEarth(e.bag[i]!), 0)).toBe(12 * 12 * 9);
    for (const i of team) expect(e.carryAmt[i]).toBe(0);
    expect(half).not.toBeNull();
    const copy = deserializeState(half!);
    while (copy.step < s.step) {
      step(copy);
      for (let j = copy.entities.count - 1; j >= 0; j--) if (copy.entities.owner[j] !== 0) copy.entities.remove(copy.entities.id[j]!);
    }
    expect(hashState(copy)).toBe(hashState(s));
  });
  it('diggers leaving the rim of a pit too deep to step into walk round its corner home, and finish it', () => {
    const s = camp([0, 1, 2, 3]);
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const team = [0, 1, 2, 3];
    for (const i of team) e.toolBreak[i] = TOOL_GEAR[8]![ToolJob.Break]!;
    // 6 by 6 columns, 3 m deep: they dig it from its rim. Walking off from a spot near the rim's edge, the straight line
    // home cut the pit's corner, and after a few tries they gave up with "I cannot reach a drop-off."
    const { x, z, y } = flatSpot(s, 6, 6);
    const before = [...pool];
    run(s, 1, [dig(s, team, x, z, 6, 6, y - 27)]);
    let stuck = 0;
    for (let k = 0; k < 30000 && (s.sites.length > 0 || team.some((i) => e.carryAmt[i]! > 0)); k++) {
      step(s);
      // No wild animal wanders into the pit (one that falls in stays there, and a column it stands on waits for it).
      for (let j = e.count - 1; j >= 0; j--) if (e.owner[j] !== 0) e.remove(e.id[j]!);
      stuck += s.events.filter((v) => v.text === 'I cannot reach a drop-off.').length;
    }
    expect(stuck).toBe(0);
    expect(s.sites.length).toBe(0);
    let dug = 0;
    for (let zz = z; zz < z + 6; zz++) for (let xx = x; xx < x + 6; xx++) dug += y - s.world.topAt(xx, zz);
    expect(dug).toBeGreaterThan(6 * 6 * 18);
    // All of it handed in (soil gives Earth; the stone under it, its own).
    expect(before.reduce((n, was, r) => n + Math.max(0, pool[r]! - was), 0)).toBe(dug);
  });
});
