import { describe, expect, it } from 'vitest';
import {
  bagItems,
  Ability,
  BuildingKind,
  buildingCentre,
  canUse,
  snuffEffect,
  stumbleEffect,
  spend,
  settleDeaths,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  DebugThreat,
  deserializeState,
  diffStates,
  DUSK_STEPS,
  hashState,
  hurtUnit,
  isLit,
  lairCap,
  lairDue,
  LAIRS,
  MANA_SCALE,
  Mob,
  mobSpec,
  moveSpeed,
  OrderKind,
  placeBuilding,
  placementBlocked,
  Blocked,
  RELIGHT_STEPS,
  Res,
  Role,
  serializeState,
  sightOf,
  Species,
  step,
  tinkerProgress,
  UnitKind,
  WILD,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const DUSK_START = DAY_STEPS;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

function home(s: SimState): [number, number] {
  return buildingCentre(bigHouse(s));
}

/** Mobs alive of some kind. */
function mobs(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === kind && e.hp[i]! > 0) out.push(i);
  return out;
}

function warrior(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior) return i;
  throw new Error('no warrior');
}

/** Puts the clock at a period's start on a cycle, so the next step begins it. */
function toPeriod(s: SimState, cycle: number, offset: number): void {
  s.step = cycle * CYCLE_STEPS + offset;
}

function events(s: SimState, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    step(s);
    out.push(...s.events.map((ev) => ev.text));
  }
  return out;
}

describe('lairs', () => {
  it('follows the cadence and the cap of Table 8', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9, 12, 13, 14].filter(lairDue)).toEqual([3, 6, 9, 12]);
    expect([15, 16, 17, 43, 44, 45, 46].filter(lairDue)).toEqual([15, 17, 43, 45, 46]);
    expect(lairCap(0)).toBe(2);
    expect(lairCap(15)).toBe(3);
    expect(lairCap(45)).toBe(5);
  });

  it('places one at dusk on night 3, well away from claimed land, with its guardian', () => {
    const s = createWorld(1);
    toPeriod(s, 3, DUSK_START);
    step(s);
    const e = s.entities;
    const lairs: number[] = [];
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && mobSpec(e.mob[i]!).role === Role.Structure && e.group[i] === 0) lairs.push(i);
    expect(lairs.length).toBe(1);
    const l = lairs[0]!;
    const [hx, hz] = home(s);
    expect(Math.hypot(e.x[l]! - hx, e.z[l]! - hz)).toBeGreaterThan(40 * M);
    const guards = [];
    for (let i = 0; i < e.count; i++) if (e.role[i] === Role.Resident && e.group[i] === e.id[l]) guards.push(i);
    expect(guards.length).toBeGreaterThan(0);
  });

  it('sends a lair\'s own share out of it 20 s after nightfall (Patch 3: half its sleepers\' threat)', () => {
    const s = createWorld(1);
    const [hx, hz] = home(s);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Lair + 1, x: hx + 90 * M, z: hz }]);
    const cave = mobs(s, Mob.LairCaveMouth)[0]!;
    toPeriod(s, 4, DAY_STEPS + DUSK_STEPS);
    step(s);
    const id = s.entities.id[cave]!;
    expect(s.spawns.some((p) => p.src === id)).toBe(true);
    run(s, 20 * 20 + 2);
    const e = s.entities;
    let near = 0;
    for (let i = 0; i < e.count; i++) {
      // Since Patch 5 (MB-1) a lair's own go for the player's target nearest it.
      if (e.kind[i] !== UnitKind.Mob || (e.role[i] !== Role.Night && e.role[i] !== Role.Aimed)) continue;
      if (Math.hypot(e.x[i]! - e.x[cave]!, e.z[i]! - e.z[cave]!) < 6 * M) near++;
    }
    expect(near).toBeGreaterThan(0);
  });

  it('wakes its sleepers when attacked, and when broken leaves a ruin, a hoard and 20 XP for the warriors', () => {
    const s = createWorld(1);
    const w = warrior(s);
    const e = s.entities;
    const lx = e.x[w]! + 6 * M;
    const lz = e.z[w]!;
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Lair, x: lx, z: lz }]);
    const l = mobs(s, Mob.LairBarrow)[0]!;
    const lairId = e.id[l]!;
    // Nothing near it but the warrior: the guardian and sleepers are put out of the way so the warrior lives to break it.
    for (let i = 0; i < e.count; i++) if (e.role[i] === Role.Resident) e.hp[i] = 1;
    e.hp[l] = 40;
    const xp = e.xp[w]!;
    const texts: string[] = [];
    step(s, [{ kind: 'attack', player: 0, units: [e.id[w]!], target: lairId }]);
    for (let k = 0; k < 600 && e.indexOf(lairId) >= 0; k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
      // The woken sleepers are kept from killing the warrior: the test is about the lair.
      for (let i = 0; i < e.count; i++) if (e.role[i] === Role.Resident) e.atkNext[i] = s.step + 100;
    }
    expect(e.indexOf(lairId)).toBe(-1);
    expect(texts.some((t) => t.includes('sleepers are awake'))).toBe(true);
    expect(texts.some((t) => t.startsWith('The barrow is cleared'))).toBe(true);
    expect(s.threats.ruins.length).toBe(1);
    expect(s.threats.ruins[0]!.mob).toBe(Mob.LairBarrow);
    // The hoard is loot (Jade's play-test notes): in the warrior's bag, or on the ground for its side.
    const silver = (bagItems(s, w).find(([r]) => r === Res.Silver)?.[1] ?? 0) + s.loot.filter((l) => l.res === Res.Silver && l.owner === 0).reduce((n, l) => n + l.amt, 0);
    expect(silver).toBeGreaterThan(0);
    expect(e.xp[w]!).toBeGreaterThanOrEqual(xp + 200);
  });
});

describe('fog nights', () => {
  it('halves sight in fog until the day', () => {
    const s = createWorld(1);
    const w = warrior(s);
    const clear = sightOf(s, w);
    run(s, 2);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Fog, x: 0, z: 0 }]);
    expect(sightOf(s, w)).toBe(clear >> 1);
    toPeriod(s, 1, 0);
    step(s);
    expect(sightOf(s, w)).toBe(clear);
  });
});

describe('the dusk goblin horde', () => {
  it('comes for outlying lights over the limit: 3 cutters and a slinger per light over', () => {
    const s = createWorld(1);
    const b = bigHouse(s);
    run(s, 1, [{ kind: 'debugReveal', player: 0, x: (b.x + 150) * WU_PER_COLUMN, z: b.z * WU_PER_COLUMN, radius: 60 * M }]);
    let placed = 0;
    for (let k = 0; placed < 6 && k < 400; k++) {
      const x = b.x + 130 + (k % 20) * 4;
      const z = b.z - 40 + Math.floor(k / 20) * 4;
      const why = placementBlocked(s, 0, BuildingKind.TorchPost, x, z);
      if (why !== Blocked.None && why !== Blocked.Node) continue;
      placeBuilding(s, 0, BuildingKind.TorchPost, 0, x, z, true);
      placed++;
    }
    expect(placed).toBe(6);
    toPeriod(s, 0, DUSK_START);
    step(s);
    expect(mobs(s, Mob.GoblinCutter).length).toBe(6);
    expect(mobs(s, Mob.GoblinSlinger).length).toBe(2);
    for (const i of mobs(s, Mob.GoblinCutter)) expect(s.entities.role[i]).toBe(Role.Aimed);
  });
});

describe('goblin villages', () => {
  function village(s: SimState): { v: number; goblins: number[] } {
    const w = warrior(s);
    const e = s.entities;
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Village, x: e.x[w]! + 60 * M, z: e.z[w]! }]);
    const v = s.threats.villages[0]!.id;
    const goblins: number[] = [];
    for (let i = 0; i < e.count; i++) if (e.group[i] === v && e.mob[i] === Mob.VillageGoblin) goblins.push(e.id[i]!);
    return { v, goblins };
  }

  it('builds huts, a fire pit, a totem, 2 goblins a hut, 2 archers and a mage', () => {
    const s = createWorld(1);
    const { goblins } = village(s);
    expect(mobs(s, Mob.GoblinHut).length).toBe(5);
    expect(mobs(s, Mob.GoblinFirePit).length).toBe(1);
    expect(mobs(s, Mob.GoblinTotem).length).toBe(1);
    expect(goblins.length).toBe(10);
    expect(mobs(s, Mob.GoblinArcher).length).toBe(2);
    expect(mobs(s, Mob.GoblinMage).length).toBe(1);
  });

  it('warns one kill before war, declares it on the fifth and marches 30 s after dawn', () => {
    const s = createWorld(1);
    const { goblins } = village(s);
    const e = s.entities;
    const w = warrior(s);
    const texts: string[] = [];
    for (const id of goblins.slice(0, 5)) {
      const g = e.indexOf(id);
      s.events = [];
      hurtUnit(s, g, { damage: 1000, from: e.id[w]!, projectile: false, blunt: false, pierce: false, roll: 0 });
      settleDeaths(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(texts.filter((t) => t.startsWith('The goblins are angry')).length).toBe(1);
    expect(texts.some((t) => t.startsWith('A goblin village has declared war on you'))).toBe(true);
    expect(s.threats.villages[0]!.war).toBe(1);
    toPeriod(s, 1, 0 - 40 * 20 + 30 * 20);
    const t2 = events(s, 2);
    expect(t2.some((t) => t.startsWith('A goblin warband'))).toBe(true);
    let raiders = 0;
    for (let i = 0; i < e.count; i++) if (e.role[i] === Role.Village && e.act[i] === 1) raiders++;
    expect(raiders).toBeGreaterThanOrEqual(4);
  });

  it("has a mage whose Stumble hex slows a unit and costs mana", () => {
    const s = createWorld(1);
    village(s);
    const mage = mobs(s, Mob.GoblinMage)[0]!;
    const w = warrior(s);
    const e = s.entities;
    expect(canUse(s, mage, Ability.StumbleHex)).toBe(true);
    const speed = moveSpeed(s, w);
    spend(s, mage, Ability.StumbleHex);
    stumbleEffect(s, mage, w);
    expect(moveSpeed(s, w)).toBeLessThan(speed);
    expect(e.mana[mage]).toBe((60 - 10) * MANA_SCALE);
    expect(canUse(s, mage, Ability.StumbleHex)).toBe(false);
  });

  it('snuffs a light, which a worker relights at no cost', () => {
    const s = createWorld(1);
    const e = s.entities;
    const b = bigHouse(s);
    const t = placeBuilding(s, 0, BuildingKind.TorchPost, 0, b.x + 20, b.z + 20, true);
    const [tx, tz] = buildingCentre(t);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Village, x: tx + 80 * M, z: tz }]);
    const mage = mobs(s, Mob.GoblinMage)[0]!;
    snuffEffect(s, mage, t);
    expect(isLit(t)).toBe(false);
    const pool = s.players[0]!.pool[Res.SoftwoodLumber]!;
    let worker = -1;
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) worker = i;
    step(s, [{ kind: 'relight', player: 0, units: [e.id[worker]!], building: t.id }]);
    // It sits beside the light tinkering, with the bar over its head (Patch 2's timed actions), for 2 s.
    let bar = 0;
    runUntil(
      s,
      () => {
        if (e.order[worker] === OrderKind.Tinker) bar = Math.max(bar, tinkerProgress(s, worker)[1]);
        return isLit(t);
      },
      2000,
    );
    expect(bar).toBe(RELIGHT_STEPS);
    expect(s.players[0]!.pool[Res.SoftwoodLumber]).toBe(pool);
  });
});

describe('hostile tribes', () => {
  it('chase what they see and camp at dusk', () => {
    const s = createWorld(1);
    const w = warrior(s);
    const e = s.entities;
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Hobgoblins, x: e.x[w]! + 20 * M, z: e.z[w]! }]);
    expect(s.threats.bands.length).toBe(1);
    const band = s.threats.bands[0]!;
    run(s, 40);
    expect(band.target).not.toBe(0);
    toPeriod(s, 0, DUSK_START);
    step(s);
    expect(band.camp).toBe(1);
  });

  it('turn up on the third day while there is room under the cap', () => {
    const s = createWorld(1);
    toPeriod(s, 2, 0);
    step(s);
    expect(s.threats.bands.length).toBe(1);
    const e = s.entities;
    let n = 0;
    for (let i = 0; i < e.count; i++) if (e.role[i] === Role.Tribe) n++;
    expect(n).toBeGreaterThanOrEqual(3);
  });
});

describe('territorial creatures', () => {
  it('a griffin, once disturbed, hunts its quarry down', () => {
    const s = createWorld(1);
    const w = warrior(s);
    const e = s.entities;
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Creature + 4, x: e.x[w]! + 10 * M, z: e.z[w]! }]);
    let g = -1;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Animal && e.mob[i] === Species.Griffin && e.owner[i] === WILD) g = i;
    expect(g).toBeGreaterThanOrEqual(0);
    const hp = e.hp[w]!;
    runUntil(s, () => e.hp[w]! < hp, 600);
  });
});

describe('determinism with the threats', () => {
  it('replays to the same hash and survives a snapshot round trip', () => {
    const play = (): SimState => {
      const s = createWorld(5);
      const [hx, hz] = home(s);
      // 70% of the 70 and 80 m used before Jade's mini patch brought the rings 30% closer, so they stay on the basin's floor.
      run(s, 1, [
        { kind: 'debugThreat', player: 0, what: DebugThreat.Village, x: hx + 49 * M, z: hz },
        { kind: 'debugThreat', player: 0, what: DebugThreat.Gnolls, x: hx - 49 * M, z: hz },
        { kind: 'debugThreat', player: 0, what: DebugThreat.Lair + 2, x: hx, z: hz + 56 * M },
        { kind: 'debugThreat', player: 0, what: DebugThreat.Creature + 1, x: hx, z: hz - 49 * M },
      ]);
      run(s, 1200);
      return s;
    };
    const a = play();
    const b = play();
    expect(hashState(a)).toBe(hashState(b));
    const c = deserializeState(serializeState(a));
    expect(diffStates(a, c)).toBeNull();
    run(a, 200);
    run(c, 200);
    expect(hashState(a)).toBe(hashState(c));
    expect(LAIRS.length).toBe(8);
  });
});

