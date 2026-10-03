// Wandering night monsters and the bats' swoop (Jade's patch notes 1;
// picks in blueprint/wanderers-picks.md): monsters roam the explored wild at
// night, well away from towns, lights and villages, go only for prey close
// by, never add to the waves and burn at dawn; a flyer eases down to strike
// and pulls off somewhere new each time, as often as before and as easy to
// hit.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  addMob,
  addPerson,
  addWanderer,
  aggroReach,
  buildingCentre,
  BuildingKind,
  buildingSpec,
  claimShapes,
  clearRun,
  clockAt,
  createWorld,
  CYCLE_STEPS,
  DebugThreat,
  DAY_STEPS,
  deserializeState,
  diffStates,
  DUSK_STEPS,
  FactionKind,
  flyingHigh,
  flyerAhead,
  FOG_TILE_COLUMNS,
  hashState,
  hordePct,
  hordeSize,
  isLit,
  isWanderer,
  landAt,
  Mob,
  mobSpec,
  newFaction,
  NIGHT_STEPS,
  patchRoll,
  PeopleUnit,
  Period,
  placeBuilding,
  planNight,
  serializeState,
  SNAPSHOT_VERSION,
  step,
  SWOOP,
  UnitKind,
  WALKER,
  wildPool,
  wildPrey,
  WILD_CLAIM_GAP_M,
  WILD_LIGHT_TIMES,
  WILD_UNIT_GAP_M,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const SEC = 20;
const NIGHT_START = DAY_STEPS + DUSK_STEPS;
const FOG_TILE = WU_PER_COLUMN * FOG_TILE_COLUMNS;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function home(s: SimState): [number, number] {
  return buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
}

function party(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && (e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Worker)) out.push(i);
  return out;
}

function wanderers(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (isWanderer(s, i) && e.hp[i]! > 0) out.push(i);
  return out;
}

/** Makes units all but unkillable, so a test is about the monsters and not who wins. */
function sturdy(s: SimState, units: number[]): void {
  for (const i of units) {
    s.entities.hp[i] = 100_000;
    s.entities.maxHp[i] = 100_000;
  }
}

/**
 * A world on the edge of a night with the land 300 m round the town explored
 * and the starting party standing 90 m east of it, out in the wild, with the
 * night's waves called off so only the wild's monsters come.
 */
function wildNight(seed: number, night: number, options: { peaceful?: boolean; reveal?: boolean; orders?: Order[] } = {}): SimState {
  const s = createWorld(seed, { players: 1, peaceful: options.peaceful ?? false });
  const [hx, hz] = home(s);
  if (options.reveal !== false) s.world.reveal(hx, hz, 300 * M);
  const units = party(s);
  units.forEach((i, k) => {
    landAt(s, i, hx + 90 * M + k * M, hz);
    s.entities.queue[i] = [];
  });
  sturdy(s, units);
  if (options.orders) run(s, 1, options.orders);
  s.step = night * CYCLE_STEPS + NIGHT_START - 1;
  run(s, 2);
  s.spawns = [];
  return s;
}

/** Steps on, calling `each` on every step with the wanderers that came out in it (those already out count as new unless `skipOut`). */
function watch(s: SimState, seconds: number, each: (fresh: number[]) => void, skipOut = false): void {
  const seen = new Set<number>(skipOut ? wanderers(s).map((i) => s.entities.id[i]!) : []);
  for (let k = 0; k < seconds * SEC; k++) {
    if (k > 0 || skipOut) step(s);
    s.spawns = [];
    const fresh = wanderers(s).filter((i) => !seen.has(s.entities.id[i]!));
    for (const i of fresh) seen.add(s.entities.id[i]!);
    each(fresh);
  }
}

describe('where wanderers come out', () => {
  it('fills the explored wild round the party, away from the town, its lights and the units themselves', () => {
    const s = wildNight(1, 1);
    const e = s.entities;
    const pool = new Set(wildPool(1).map(([m]) => m));
    let n = 0;
    watch(s, 60, (fresh) => {
      const shapes = claimShapes(s, 0);
      const lights = s.buildings.list.filter((b) => buildingSpec(b.kind).light && isLit(b, s.step));
      const ours = party(s);
      for (const i of fresh) {
        n++;
        const x = e.homeX[i]!;
        const z = e.homeZ[i]!;
        expect(pool.has(e.mob[i]!)).toBe(true);
        expect(s.world.isExplored(Math.floor(x / FOG_TILE), Math.floor(z / FOG_TILE))).toBe(true);
        // Its group stands round its spot.
        expect(Math.hypot(e.x[i]! - x, e.z[i]! - z)).toBeLessThanOrEqual(4 * M);
        for (const [cx, cz, r] of shapes.circles) expect(Math.hypot(x - cx, z - cz)).toBeGreaterThanOrEqual(r + WILD_CLAIM_GAP_M * M - 1);
        for (const [x0, z0, x1, z1] of shapes.rects) {
          const dx = Math.max(x0 - x, 0, x - x1);
          const dz = Math.max(z0 - z, 0, z - z1);
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(WILD_CLAIM_GAP_M * M - 1);
        }
        for (const b of lights) {
          const [lx, lz] = buildingCentre(b);
          expect(Math.hypot(x - lx, z - lz)).toBeGreaterThanOrEqual(buildingSpec(b.kind).light!.lightM * M * WILD_LIGHT_TIMES - 1);
        }
        // Out of sight of every one of the players' units (a second's walk aside).
        for (const j of ours) expect(Math.hypot(x - e.x[j]!, z - e.z[j]!)).toBeGreaterThanOrEqual(WILD_UNIT_GAP_M * M - 4 * M);
      }
    });
    expect(n).toBeGreaterThanOrEqual(6);
  });

  it('never comes out in land nobody has explored', () => {
    const s = wildNight(1, 1, { reveal: false });
    // The party sees 20 m round itself; the wild's monsters keep 35 m off, so nothing qualifies.
    watch(s, 20, () => undefined);
    expect(wanderers(s)).toHaveLength(0);
  });

  it('never comes out in a peaceful game', () => {
    const s = wildNight(1, 1, { peaceful: true });
    watch(s, 20, () => undefined);
    expect(wanderers(s)).toHaveLength(0);
  });

  it('keeps clear of a goblin village', () => {
    // A village 150 m east of the town, 60 m past the party: none of the wild's monsters comes out within 50 m of its middle or its huts.
    const probe = createWorld(1, { players: 1 });
    const [hx, hz] = home(probe);
    const s = wildNight(1, 1, { orders: [{ kind: 'debugThreat', player: 0, what: DebugThreat.Village, x: hx + 150 * M, z: hz }] });
    const v = s.threats.villages.find((g) => g.x === hx + 150 * M)!;
    const e = s.entities;
    const huts: Array<[number, number]> = [];
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.hp[i]! > 0 && e.group[i] === v.id) huts.push([e.x[i]!, e.z[i]!]);
    expect(huts.length).toBeGreaterThan(0);
    let n = 0;
    watch(s, 10, (fresh) => {
      for (const i of fresh) {
        n++;
        expect(Math.hypot(e.homeX[i]! - v.x, e.homeZ[i]! - v.z)).toBeGreaterThanOrEqual(50 * M);
        for (const [x, z] of huts) expect(Math.hypot(e.homeX[i]! - x, e.homeZ[i]! - z)).toBeGreaterThanOrEqual(50 * M);
      }
    });
    expect(n).toBeGreaterThan(0);
  });

  it('picks the weak often and the strong rarely, from the kinds the nights have brought so far', () => {
    const one = new Map(wildPool(1));
    expect([...one.keys()].every((m) => mobSpec(m).firstNight <= 1)).toBe(true);
    expect(one.get(Mob.GiantRat)!).toBeGreaterThan(one.get(Mob.Slime)!);
    const forty = new Map(wildPool(40));
    // Night 0's weakest never drops out; the bosses never wander.
    expect(forty.has(Mob.GiantRat)).toBe(true);
    expect(wildPool(120).some(([m]) => m === Mob.Morvath || m === Mob.MorvathAloft)).toBe(false);
    // Larger groups of a weak kind from night 5, growing with the nights.
    expect(hordePct(4)).toBe(0);
    expect(hordePct(5)).toBeGreaterThan(0);
    expect(hordeSize(5)).toBe(3);
    expect(hordeSize(40)).toBeGreaterThan(hordeSize(5));
    // A patch holds the same if it is emptied and filled again.
    expect(patchRoll(7, 12, 3, -4, 1000)).toEqual(patchRoll(7, 12, 3, -4, 1000));
  });
});

describe('who wanderers go for', () => {
  /** A peaceful night with a wanderer of a kind and one of the party at an offset from it, on open ground. */
  function face(mob: number, dx: number): { s: SimState; w: number; u: number } {
    const s = wildNight(1, 1, { peaceful: true });
    const [u] = party(s);
    const e = s.entities;
    const x = e.x[u!]! - dx;
    const z = e.z[u!]!;
    const w = addWanderer(s, mob, x, z, 1);
    for (const j of party(s)) if (j !== u) landAt(s, j, e.x[u!]! + 200 * M, z);
    return { s, w, u: u! };
  }

  it('goes for a unit it could reach in 2 s, and not one further off', () => {
    const near = face(Mob.GiantRat, 7 * M);
    const ne = near.s.entities;
    expect(aggroReach(near.s, near.w)).toBe(Math.max(ne.speed[near.w]! * 2 * SEC, 3 * M));
    expect(clearRun(near.s, WALKER, ne.x[near.w]!, ne.y[near.w]!, ne.z[near.w]!, ne.x[near.u]!, ne.z[near.u]!)).toBe(true);
    run(near.s, 5);
    expect(ne.target[near.w]).toBe(ne.id[near.u]);
    const far = face(Mob.GiantRat, 12 * M);
    run(far.s, 5);
    expect(far.s.entities.target[far.w]).toBe(0);
  });

  it('sees a unit within 3 m across anything, but not one further off behind a wall', () => {
    const behind = face(Mob.GiantRat, 6 * M);
    const s = behind.s;
    const e = s.entities;
    // A wall across the line between them.
    const mx = Math.floor((e.x[behind.w]! + e.x[behind.u]!) / 2 / WU_PER_COLUMN);
    const mz = Math.floor(e.z[behind.u]! / WU_PER_COLUMN);
    for (let dz = -6; dz <= 6; dz++) placeBuilding(s, 0, BuildingKind.Wall, 0, mx, mz + dz, true);
    expect(clearRun(s, WALKER, e.x[behind.w]!, e.y[behind.w]!, e.z[behind.w]!, e.x[behind.u]!, e.z[behind.u]!)).toBe(false);
    run(s, 5);
    expect(e.target[behind.w]).toBe(0);
    // Close enough to see over it.
    landAt(s, behind.u, e.x[behind.w]! + floorM(2.5), e.z[behind.u]!);
    run(s, 5);
    expect(e.target[behind.w]).toBe(e.id[behind.u]);
  });

  it('spares traders the players have not met, and goes for a people they have', () => {
    const s = wildNight(1, 1, { peaceful: true });
    const [u] = party(s);
    const e = s.entities;
    for (const j of party(s)) landAt(s, j, e.x[u!]! + 200 * M, e.z[u!]!);
    const x = e.x[u!]! - 100 * M;
    const z = e.z[u!]!;
    const f = newFaction(s, FactionKind.ElfCaravan, 0, x, z, 0, 99);
    const trader = addPerson(s, f, PeopleUnit.ElfVillager, x, z);
    const w = addWanderer(s, Mob.Zombie, x - floorM(2), z, 1);
    expect(wildPrey(s, trader)).toBe(false);
    run(s, 5);
    expect(e.target[w]).toBe(0);
    f.seen = 1;
    expect(wildPrey(s, trader)).toBe(true);
    run(s, 5);
    expect(e.target[w]).toBe(e.id[trader]);
  });

  it('gives its prey up once it gets away', () => {
    const { s, w, u } = face(Mob.Zombie, floorM(2));
    const e = s.entities;
    run(s, 5);
    expect(e.target[w]).toBe(e.id[u]);
    landAt(s, u, e.x[u]! + 40 * M, e.z[u]!);
    run(s, 5);
    expect(e.target[w]).toBe(0);
  });
});

function floorM(m: number): number {
  return Math.floor(m * M);
}

describe('wanderers and the night', () => {
  it('never feed the waves: the night is planned the same with them out or not', () => {
    const s = wildNight(1, 2);
    watch(s, 20, () => undefined);
    expect(wanderers(s).length).toBeGreaterThan(0);
    const a = deserializeState(serializeState(s));
    const b = deserializeState(serializeState(s));
    for (const i of wanderers(b)) b.entities.hp[i] = 0;
    run(b, 1);
    a.step = b.step;
    const night = clockAt(s.step).cycle;
    expect(planNight(a, 0, night, a.step)).toEqual(planNight(b, 0, night, b.step));
  });

  it('burns or flees at dawn like the waves, and the wild is empty by day', () => {
    const s = wildNight(1, 3);
    s.step = 3 * CYCLE_STEPS + NIGHT_START + NIGHT_STEPS - 60 * SEC;
    watch(s, 50, () => undefined);
    expect(wanderers(s).length).toBeGreaterThan(0);
    expect(clockAt(s.step).period).toBe(Period.Night);
    while (clockAt(s.step).period === Period.Night) step(s);
    run(s, 35 * SEC);
    expect(wanderers(s)).toHaveLength(0);
    expect(s.threats.wild).toHaveLength(0);
  });

  it('empties a patch nobody comes near and fills it the same when someone comes back', () => {
    const s = wildNight(1, 1);
    const e = s.entities;
    watch(s, 5, () => undefined);
    const filled = new Map(s.threats.wild.filter((p) => p.size > 0).map((p) => [`${p.px},${p.pz}`, p]));
    expect(filled.size).toBeGreaterThan(0);
    const kindOf = (group: number): number => e.mob[wanderers(s).find((i) => e.group[i] === group)!]!;
    const kinds = new Map([...filled].map(([k, p]) => [k, kindOf(p.group)]));
    // Patches whose monsters have fought stay; the rest slip away once the party is far off.
    const fought = new Set(wanderers(s).filter((i) => e.hp[i]! < e.maxHp[i]! || e.atkAt[i] !== 0).map((i) => e.group[i]!));
    const [hx, hz] = home(s);
    const spots = party(s).map((i) => [e.x[i]!, e.z[i]!] as const);
    for (const i of party(s)) landAt(s, i, hx - 280 * M, hz);
    watch(s, 3, () => undefined);
    const groups = new Set([...filled.values()].map((p) => p.group));
    const left = wanderers(s).filter((i) => groups.has(e.group[i]!));
    expect(left.every((i) => fought.has(e.group[i]!))).toBe(true);
    expect(left.length).toBeLessThan([...filled.values()].reduce((n, p) => n + p.size, 0));
    party(s).forEach((i, k) => landAt(s, i, spots[k]![0], spots[k]![1]));
    watch(s, 3, () => undefined);
    let again = 0;
    for (const p of s.threats.wild) {
      const was = kinds.get(`${p.px},${p.pz}`);
      if (was === undefined || p.size === 0 || groups.has(p.group)) continue;
      expect(kindOf(p.group)).toBe(was);
      expect(p.size).toBe(filled.get(`${p.px},${p.pz}`)!.size);
      again++;
    }
    expect(again).toBeGreaterThan(0);
  });

  it('loads a save from before them (version 13), and the wild fills afresh', () => {
    // Saved by the code before this change, on night 1 (seed 1, one player, 40 steps after dusk ended).
    const old = gunzipSync(readFileSync(new URL('./fixtures/snapshot-v13-night1.bin.gz', import.meta.url)));
    expect(old[4]! | (old[5]! << 8)).toBe(13);
    const s = deserializeState(new Uint8Array(old));
    expect(s.step).toBe(CYCLE_STEPS + NIGHT_START + 37);
    expect(s.threats.wild).toEqual([]);
    run(s, 100);
    const again = serializeState(s);
    expect(again[4]! | (again[5]! << 8)).toBe(SNAPSHOT_VERSION);
    expect(diffStates(s, deserializeState(again))).toBeNull();
  });

  it('replays to the same hash and survives a snapshot round trip in the night', () => {
    const play = (): SimState => {
      const s = wildNight(3, 6);
      watch(s, 30, () => undefined);
      return s;
    };
    const a = play();
    const b = play();
    expect(wanderers(a).length).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
    const c = deserializeState(serializeState(a));
    expect(diffStates(a, c)).toBeNull();
    run(a, 400);
    run(c, 400);
    expect(hashState(a)).toBe(hashState(c));
  });
});

describe('the swoop', () => {
  /** A bat (or another flyer) of the night against one sturdy warrior out in the open; returns what each step looked like. */
  function swoops(mob: number, seconds: number) {
    const s = wildNight(1, 1, { peaceful: true });
    const e = s.entities;
    const units = party(s);
    const u = units.find((i) => e.kind[i] === UnitKind.Warrior)!;
    for (const j of units) if (j !== u) landAt(s, j, e.x[u]! + 200 * M, e.z[u]!);
    const b = addMob(s, mob, 0, e.x[u]! + 8 * M, e.z[u]! + 3 * M, 1);
    e.hp[b] = 100_000;
    e.maxHp[b] = 100_000;
    const bid = e.id[b]!;
    const out: Array<{ y: number; atkAt: number; high: boolean; dx: number; dz: number; batHp: number }> = [];
    for (let k = 0; k < seconds * SEC; k++) {
      step(s);
      const i = e.indexOf(bid);
      out.push({ y: e.y[i]!, atkAt: e.atkAt[i]!, high: flyingHigh(s, i), dx: e.x[i]! - e.x[u]!, dz: e.z[i]! - e.z[u]!, batHp: e.hp[i]! });
    }
    return out;
  }

  for (const [name, mob] of [['a cave bat', Mob.CaveBat], ['a gravewing', Mob.Gravewing]] as const) {
    it(`eases ${name} down and up, strikes from a new spot each time, as often as before, and stays in reach`, () => {
      const steps = swoops(mob, 30);
      const spec = mobSpec(mob);
      // Never drops faster than the dive.
      for (let k = 1; k < steps.length; k++) expect(steps[k - 1]!.y - steps[k]!.y).toBeLessThanOrEqual(SWOOP.diveSpeed);
      // A strike begins every attack time once it has come in (the old rate).
      const starts: number[] = [];
      for (let k = 1; k < steps.length; k++) if (steps[k]!.atkAt !== 0 && steps[k - 1]!.atkAt === 0) starts.push(k);
      expect(starts.length).toBeGreaterThanOrEqual(10);
      const gaps = starts.slice(1).map((k, n) => k - starts[n]!);
      expect(gaps.filter((g) => g === spec.attackSteps).length).toBeGreaterThanOrEqual(gaps.length - 1);
      // From a different spot round its prey each time.
      const spots = new Set(starts.map((k) => `${Math.round(steps[k]!.dx / (M / 4))},${Math.round(steps[k]!.dz / (M / 4))}`));
      expect(spots.size).toBeGreaterThanOrEqual(Math.floor(starts.length / 2));
      // In its swoop it can always be struck, and the warrior does strike it.
      for (let k = starts[0]!; k < steps.length; k++) expect(steps[k]!.high).toBe(false);
      expect(steps[steps.length - 1]!.batHp).toBeLessThan(100_000);
    });
  }

  it('lets a shooter lead a swooping bat to the very spot it will be when the shot gets there', () => {
    const s = wildNight(1, 1, { peaceful: true });
    const e = s.entities;
    const units = party(s);
    const u = units.find((i) => e.kind[i] === UnitKind.Warrior)!;
    for (const j of units) if (j !== u) landAt(s, j, e.x[u]! + 200 * M, e.z[u]!);
    e.queue[u] = [{ t: 'hold' }];
    const b = addMob(s, Mob.CaveBat, 0, e.x[u]! + 8 * M, e.z[u]! + 3 * M, 1);
    e.hp[b] = 100_000;
    e.maxHp[b] = 100_000;
    const bid = e.id[b]!;
    // Once it swoops on its prey, every lead (flights of 1 to 20 steps) is where it turns out to be.
    const due = new Map<number, Array<readonly [number, number, number]>>();
    let checked = 0;
    for (let k = 0; k < 30 * SEC; k++) {
      const i = e.indexOf(bid);
      if (k >= 5 * SEC && k % 3 === 0) {
        for (const n of [1, 6, 12, 20]) due.set(s.step + n, [...(due.get(s.step + n) ?? []), flyerAhead(s, i, s.step, n)!]);
      }
      step(s);
      for (const at of due.get(s.step) ?? []) {
        expect([e.x[i]!, e.y[i]!, e.z[i]!]).toEqual(at);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});
