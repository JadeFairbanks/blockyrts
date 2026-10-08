import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  ARMOUR_GEAR,
  Blocked,
  BuildingKind,
  buildingCentre,
  canReach,
  clockAt,
  CLOSE_GEAR,
  createWorld,
  CRIT,
  critDamage,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  destroyBuilding,
  DUSK_STEPS,
  foodQuarters,
  nextMealIn,
  gap,
  halfWidth,
  hashState,
  kitHolder,
  Line,
  LONG_GEAR,
  meleeOf,
  Mob,
  MONSTERS,
  nearestUpgradePlace,
  nightBudgetTenths,
  NIGHT_STEPS,
  pendingKitUp,
  Period,
  pickNight,
  PISTOL_GEAR,
  placeBuilding,
  placementBlocked,
  productProblem,
  RANGER_GEAR,
  Res,
  Research,
  serializeState,
  SHIELD_GEAR,
  step,
  supplyUsed,
  techOf,
  Troop,
  troopDefault,
  troopProduct,
  troopTiersAt,
  troopTypesAt,
  UnitKind,
  upgradeProgress,
  upgradeTarget,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const NIGHT_START = DAY_STEPS + DUSK_STEPS;
const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

/** Steps on until none of player 0's units has a meal in the next n steps, so the food in stock holds still meanwhile. */
function mealFree(s: SimState, n: number): void {
  const e = s.entities;
  for (;;) {
    let busy = false;
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && nextMealIn(s.step, e.id[i]!) <= n + 2) busy = true;
    if (!busy) return;
    step(s);
  }
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

/** A clear spot for a building, searching outwards from a column. */
function spotNear(s: SimState, kind: number, x0: number, z0: number): [number, number] {
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, x0 + dx, z0 + dz) === Blocked.None) return [x0 + dx, z0 + dz];
      }
    }
  }
  throw new Error('no free spot');
}

/** A finished building of a kind and level, near a column (east of the Big House unless given). */
function built(s: SimState, kind: number, level = 1, at?: [number, number]): Building {
  const h = bigHouse(s)!;
  const [x, z] = spotNear(s, kind, ...(at ?? [h.x + 16, h.z]));
  const b = placeBuilding(s, 0, kind, 0, x, z, true);
  b.level = level;
  return b;
}

/** Patch 2: the Forge's metal steps come with the main base's level (wrought iron 3, iron 5, steel 7). */
function mainBaseAt(s: SimState, level: number): void {
  bigHouse(s)!.level = level;
}

function giveResearch(s: SimState, ...r: number[]): void {
  for (const k of r) s.players[0]!.research |= 1 << k;
}

function bigHouse(s: SimState, player = 0) {
  return s.buildings.list.find((b) => b.owner === player && b.kind === BuildingKind.MainBase);
}

function walls(s: SimState): number {
  return s.buildings.list.filter((b) => b.kind === BuildingKind.Wall && b.hp > 0).length;
}

/** Units of a player that are alive, by kind. */
function alive(s: SimState, kind: number, player = 0): number {
  const e = s.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.kind[i] === kind && e.hp[i]! > 0) n++;
  return n;
}

/** The player's own units, by entity id. */
function ownIds(s: SimState, player = 0): number[] {
  const e = s.entities;
  const ids: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior)) ids.push(e.id[i]!);
  return ids;
}

/** Spots just inside a ring 4 columns out from the Big House, one per unit. */
function insideSpots(s: SimState): Array<[number, number]> {
  const b = bigHouse(s)!;
  return [[b.x - 2, b.z + 7], [b.x + 15, b.z + 7], [b.x + 7, b.z - 2], [b.x + 7, b.z + 15], [b.x - 2, b.z - 2], [b.x + 15, b.z + 15], [b.x + 15, b.z - 2], [b.x - 2, b.z + 15]];
}

/** Brings every unit inside the ring line, then closes a wooden wall ring round the Big House (resource props are cleared for it). */
function fenceIn(s: SimState): void {
  const spots = insideSpots(s);
  run(s, 900, ownIds(s).map((id, n) => ({ kind: 'move', player: 0, units: [id], x: centre(spots[n]![0]), z: centre(spots[n]![1]) }) as Order));
  const b = bigHouse(s)!;
  const pad = 4;
  for (let x = b.x - pad; x <= b.x + 13 + pad; x++) {
    for (let z = b.z - pad; z <= b.z + 13 + pad; z++) {
      if (x !== b.x - pad && x !== b.x + 13 + pad && z !== b.z - pad && z !== b.z + 13 + pad) continue;
      const r = placementBlocked(s, 0, BuildingKind.Wall, x, z);
      if (r === Blocked.None || r === Blocked.Node) placeBuilding(s, 0, BuildingKind.Wall, 0, x, z, true);
    }
  }
}

/** Moves the clock to the start of a night (tests only: the world is peaceful, so nothing is planned). */
function toNight(s: SimState, night: number): void {
  s.step = night * CYCLE_STEPS + NIGHT_START;
}

describe('night 0', () => {
  it('is survived by the three starting warriors and four workers behind a wooden fence', () => {
    const s = createWorld(1);
    const e = s.entities;
    // Close melee with wooden cudgels and no armour (Troops and gear: starting units).
    for (const i of [4, 5, 6]) {
      expect(e.troop[i]).toBe(Troop.Close);
      expect(e.weapon[i]).toBe(CLOSE_GEAR[1]);
      expect(e.armour[i]).toBe(0);
    }
    fenceIn(s);
    run(s, NIGHT_START + NIGHT_STEPS + 20 - s.step);
    expect(clockAt(s.step).period).toBe(Period.Dawn);
    expect(s.over).toBe(0);
    expect(bigHouse(s)!.hp).toBe(1200);
    // Cudgels are too short to stab over the fence (a polearm's 2 m does): a zombie chews through a corner and the
    // troops fight it there, so not all three come through; every worker does.
    expect(alive(s, UnitKind.Warrior)).toBeGreaterThanOrEqual(1);
    expect(alive(s, UnitKind.Worker)).toBe(4);
    // Every mob that came was killed or is burning in the dawn (the peoples found nearby are not mobs): the slime comes
    // last, for the side of the fence nearest the Big House's walls, and is still chewing at it when the sun comes up.
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.owner[i] === MONSTERS) expect([Mob.Slime, Mob.SmallSlime]).toContain(e.mob[i]);
  });

  it('never ends the game while the Big House stands', () => {
    for (const seed of [2, 3, 4]) {
      const s = createWorld(seed);
      fenceIn(s);
      // The horde goes for the men first; only with every defender down does it walk into the Big House's open yard
      // and break it (seed 3: the rats and the spider climb the fence and the zombies strike over it).
      while (s.step < NIGHT_START + NIGHT_STEPS + 20 && bigHouse(s)) step(s);
      if (bigHouse(s)) {
        expect(s.over).toBe(0);
        continue;
      }
      expect(alive(s, UnitKind.Warrior) + alive(s, UnitKind.Worker)).toBe(0);
      run(s, 1);
      expect(s.over).toBeGreaterThan(0);
    }
    // Three whole nights with the three starting troops fighting: slow on a busy machine.
  }, 180_000);

  it('sends the fixed first-night pick: 4 zombies, 2 bats, 2 rats, a spider and a slime', () => {
    const s = createWorld(1);
    const picked = pickNight(s, 0).sort((a, b) => a - b);
    expect(picked).toEqual([Mob.Zombie, Mob.Zombie, Mob.Zombie, Mob.Zombie, Mob.CaveBat, Mob.CaveBat, Mob.GiantRat, Mob.GiantRat, Mob.GiantSpider, Mob.Slime]);
    expect(nightBudgetTenths(0)).toBe(120);
    expect(nightBudgetTenths(10)).toBe(550);
  });
});

describe('the fence against later nights', () => {
  it('lets skeleton archers on night 5 shoot over it', () => {
    const s = createWorld(1, { peaceful: true });
    fenceIn(s);
    toNight(s, 5);
    const b = bigHouse(s)!;
    const [cx, cz] = buildingCentre(b);
    const before = walls(s);
    const e = s.entities;
    const hp = new Map<number, number>();
    for (let i = 0; i < e.count; i++) hp.set(e.id[i]!, e.hp[i]!);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.SkeletonArcher, x: cx + 16 * WU_PER_METRE, z: cz }]);
    let archer = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.SkeletonArcher) archer = e.id[i]!;
    let hurt = 0;
    for (let k = 0; k < 600 && hurt === 0; k++) {
      step(s);
      for (let i = 0; i < e.count; i++) {
        if (e.kind[i] === UnitKind.Mob) continue;
        if (e.hp[i]! < (hp.get(e.id[i]!) ?? 0) && e.attacker[i] === archer) hurt++;
      }
    }
    expect(hurt).toBeGreaterThan(0);
    expect(walls(s)).toBe(before);
  });

  it('is broken by a skeleton bomber on night 10', () => {
    const s = createWorld(1, { peaceful: true });
    fenceIn(s);
    toNight(s, 10);
    const [cx, cz] = buildingCentre(bigHouse(s)!);
    const before = walls(s);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.SkeletonBomber, x: cx + 18 * WU_PER_METRE, z: cz + 2 * WU_PER_METRE }]);
    const texts: string[] = [];
    for (let k = 0; k < 900 && walls(s) === before; k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(walls(s)).toBeLessThan(before);
    expect(texts).toContain('A wall has been broken.');
  });
});

describe('digging', () => {
  /** How many steps a zombie sent at the Big House from the east spends in a strip of ground, with or without a trench dug there, and whether it gets there. */
  function zombieThrough(trench: boolean): { inStrip: number; reached: boolean } {
    const s = createWorld(1, { peaceful: true });
    toNight(s, 1);
    // Nobody home to fight it: the zombie marches on the Big House.
    for (const id of ownIds(s)) s.entities.remove(id);
    const [hx, hz] = buildingCentre(bigHouse(s)!);
    // A strip 3 columns wide and 30 long across the way from the east, 10 m out; the trench is 1.6 m deep.
    const tx = col(hx) + 22;
    const z0 = col(hz) - 15;
    const z1 = col(hz) + 15;
    let low = 1 << 30;
    let high = 0;
    for (let x = tx; x < tx + 3; x++) {
      for (let z = z0; z <= z1; z++) {
        low = Math.min(low, s.world.topAt(x, z));
        high = Math.max(high, s.world.topAt(x, z));
      }
    }
    if (trench) step(s, [{ kind: 'terrain', player: 0, x0: tx, z0, x1: tx + 2, z1, bottom: low - 14, top: high + 1, material: 0 }]);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.Zombie, x: hx + 24 * WU_PER_METRE, z: hz }]);
    const e = s.entities;
    let zombie = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.Zombie) zombie = e.id[i]!;
    let inStrip = 0;
    let reached = false;
    for (let k = 0; k < 1200 && !reached; k++) {
      step(s);
      const i = e.indexOf(zombie);
      expect(i).toBeGreaterThanOrEqual(0);
      const x = col(e.x[i]!);
      const z = col(e.z[i]!);
      if (x >= tx && x <= tx + 2 && z >= z0 && z <= z1) inStrip++;
      if (Math.hypot(e.x[i]! - hx, e.z[i]! - hz) < 9 * WU_PER_METRE) reached = true;
    }
    return { inStrip, reached };
  }

  it('a trench turns zombies aside', () => {
    const open = zombieThrough(false);
    expect(open.inStrip).toBeGreaterThan(0);
    expect(open.reached).toBe(true);
    const dug = zombieThrough(true);
    expect(dug.inStrip).toBe(0);
    expect(dug.reached).toBe(true);
  });
});

const M = WU_PER_METRE;

describe('training troops (Troops and gear: Barracks panel; Patch 2: cavalry there too)', () => {
  it('trains each troop type at the Barracks, at the tiers the forge and research allow', () => {
    const s = createWorld(1, { peaceful: true, warriors: 0 });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    giveResearch(s, Research.Bronze, Research.Steel, Research.CarbonSteel, Research.Crossbows, Research.Gunpowder, Research.Muskets);
    built(s, BuildingKind.Forge);
    mainBaseAt(s, 3);
    for (const r of [Res.Sticks, Res.Flint, Res.HardwoodLumber, Res.SoftwoodLumber, Res.Planks, Res.Leather, Res.HardenedLeather, Res.Flax, Res.Feathers, Res.Rope]) pool[r] = 50;
    for (const r of [Res.BronzeIngot, Res.WroughtIron, Res.IronIngot, Res.SteelIngot, Res.CarbonSteel, Res.Gunpowder]) pool[r] = 20;
    pool[Res.Venison] = 200;
    // One Barracks each, so they train side by side: a bronze shortsword with a jerkin and wooden shield, an iron pike,
    // a steel-prod crossbow with a boiled-leather cuirass, and the brawler's pistol and cutlass.
    const kits: Array<[Troop, number, number]> = [
      [Troop.Close, 4, 1],
      [Troop.Long, 6, 0],
      [Troop.Ranger, 7, 2],
      [Troop.Brawler, 8, 0],
    ];
    const barracks = kits.map(() => built(s, BuildingKind.Barracks));
    // Patch 2: cavalry trains at the Barracks too.
    expect(troopTypesAt(barracks[0]!)).toEqual([Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler, Troop.Cavalry]);
    kits.forEach(([t, w, a], k) => expect(productProblem(s, barracks[k]!, troopProduct(t, w, a))).toBe(''));
    run(s, 1, kits.map(([t, w, a], k): Order => ({ kind: 'produce', player: 0, building: barracks[k]!.id, product: troopProduct(t, w, a), count: 1 })));
    for (const b of barracks) expect(b.queue.length).toBe(1);
    // The ranger's takes longest: 45 s, the crossbow's 75 s and the cuirass's 50 s.
    runUntil(s, () => alive(s, UnitKind.Warrior) === 4, 170 * 20 + 40);
    const troops = new Map<number, number>();
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Warrior) troops.set(e.troop[i]!, i);
    for (const [t, w, a] of kits) {
      const i = troops.get(t)!;
      expect(i).toBeDefined();
      expect([e.wTier[i], e.aTier[i]]).toEqual([w, a]);
    }
    const close = troops.get(Troop.Close)!;
    expect([e.weapon[close], e.shield[close], e.armour[close], e.ranged[close]]).toEqual([CLOSE_GEAR[4], SHIELD_GEAR[1], ARMOUR_GEAR[1], 0]);
    const long = troops.get(Troop.Long)!;
    expect([e.weapon[long], e.shield[long], e.armour[long]]).toEqual([LONG_GEAR[6], 0, 0]);
    // Rangers fight close with their fists; no shield for anyone but close melee.
    const ranger = troops.get(Troop.Ranger)!;
    expect([e.ranged[ranger], e.weapon[ranger], e.shield[ranger], e.armour[ranger]]).toEqual([RANGER_GEAR[7], CLOSE_GEAR[0], 0, ARMOUR_GEAR[2]]);
    const brawler = troops.get(Troop.Brawler)!;
    expect([e.ranged[brawler], e.weapon[brawler]]).toEqual([PISTOL_GEAR, CLOSE_GEAR[8]]);
  });

  it('needs the forge and research for a tier', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    for (const r of [Res.HardwoodLumber, Res.Leather, Res.CopperIngot, Res.BronzeIngot, Res.SteelIngot, Res.Planks, Res.Flax, Res.WroughtIron, Res.Feathers]) pool[r] = 20;
    const barracks = built(s, BuildingKind.Barracks);
    expect(productProblem(s, barracks, troopProduct(Troop.Close, 2, 0))).toBe('');
    expect(productProblem(s, barracks, troopProduct(Troop.Close, 3, 0))).toBe('Needs a Forge.');
    built(s, BuildingKind.Forge);
    expect(productProblem(s, barracks, troopProduct(Troop.Close, 3, 0))).toBe('');
    expect(productProblem(s, barracks, troopProduct(Troop.Long, 4, 0))).toBe('Needs Bronze researched first.');
    // Patch 2: wrought iron comes with the main base, not a Bloomery (Patch 5: at tier 2).
    expect(productProblem(s, barracks, troopProduct(Troop.Ranger, 5, 0))).toBe('Needs a tier 2 main base.');
    // Nothing affordable at a tier: the panel's default drops to the best the stock pays for.
    giveResearch(s, Research.Bronze);
    expect(troopDefault(s, barracks, Troop.Long)).toEqual({ w: 4, a: 1 });
  });

  it('offers only tier 1 and below at the main base', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    giveResearch(s, Research.Bronze, Research.Steel, Research.CarbonSteel, Research.Crossbows, Research.Gunpowder, Research.Muskets);
    built(s, BuildingKind.Forge);
    mainBaseAt(s, 3);
    for (const r of [Res.Sticks, Res.Flint, Res.HardwoodLumber, Res.Planks, Res.Leather, Res.HardenedLeather, Res.Flax, Res.CopperIngot, Res.CarbonSteel, Res.Gunpowder]) pool[r] = 50;
    const base = bigHouse(s)!;
    expect(troopTypesAt(base)).toEqual([Troop.Close, Troop.Long, Troop.Ranger]);
    for (const t of [Troop.Close, Troop.Long, Troop.Ranger]) {
      expect(troopTiersAt(base, t)).toEqual({ w: [t === Troop.Close ? 0 : 1, 1], a: [0, 1] });
      expect(productProblem(s, base, troopProduct(t, 1, 1))).toBe('');
      expect(productProblem(s, base, troopProduct(t, 2, 0))).toBe('This building cannot make that.');
      expect(productProblem(s, base, troopProduct(t, 1, 2))).toBe('This building cannot make that.');
    }
    expect(productProblem(s, base, troopProduct(Troop.Close, 0, 0))).toBe('');
    expect(productProblem(s, base, troopProduct(Troop.Brawler, 8, 0))).toBe('This building cannot make that.');
    expect(productProblem(s, base, troopProduct(Troop.Cavalry, 1, 0))).toBe('This building cannot make that.');
    // The panel's default is the best the main base makes, however rich the stock.
    expect(troopDefault(s, base, Troop.Close)).toEqual({ w: 1, a: 1 });
    // A tier 2 troop ordered there is refused and nothing is paid.
    const sticks = pool[Res.Sticks]!;
    const flint = pool[Res.Flint]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: base.id, product: troopProduct(Troop.Close, 2, 0), count: 1 }]);
    expect(base.queue.length).toBe(0);
    expect([pool[Res.Sticks], pool[Res.Flint]]).toEqual([sticks, flint]);
  });

  it('pays 30 food, the kit and a supply for a troop, and gives it all back when cancelled', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    pool[Res.Leather] = 10;
    pool[Res.Planks] = 10;
    const base = bigHouse(s)!;
    const kit = (): number[] => [pool[Res.Sticks]!, pool[Res.Leather]!, pool[Res.Planks]!];
    const before = kit();
    const player = s.players[0]!;
    mealFree(s, 8);
    const food = foodQuarters(player);
    const used = supplyUsed(s, 0);
    run(s, 1, [{ kind: 'produce', player: 0, building: base.id, product: troopProduct(Troop.Close, 1, 1), count: 1 }]);
    // A wooden cudgel (3 sticks), a leather jerkin (3 leather) and a wooden shield (3 planks, 1 leather).
    expect(kit()).toEqual([before[0]! - 3, before[1]! - 4, before[2]! - 3]);
    // Exactly 30 food, in quarters: nothing lost to rounding.
    expect(foodQuarters(player)).toBe(food - 30 * 4);
    const paid = kit();
    // The one in training takes a supply.
    run(s, 2);
    mealFree(s, 8);
    const paidFood = foodQuarters(player);
    expect(base.queue[0]!.progress).toBeGreaterThan(0);
    expect(supplyUsed(s, 0)).toBe(used + 1);
    // A second one, cancelled: everything it paid comes back.
    run(s, 1, [{ kind: 'produce', player: 0, building: base.id, product: troopProduct(Troop.Close, 1, 1), count: 1 }]);
    expect(base.queue.length).toBe(2);
    expect(kit()).not.toEqual(paid);
    run(s, 1, [{ kind: 'cancelProduce', player: 0, building: base.id, index: 1 }]);
    expect(base.queue.length).toBe(1);
    expect(kit()).toEqual(paid);
    expect(foodQuarters(player)).toBe(paidFood);
    // The first comes out with its kit: 45 s plus 10 + 30 + 20 s.
    const warriors = alive(s, UnitKind.Warrior);
    runUntil(s, () => alive(s, UnitKind.Warrior) === warriors + 1, 105 * 20 + 20);
    let i = -1;
    for (let j = 0; j < e.count; j++) if (e.kind[j] === UnitKind.Warrior && (i < 0 || e.id[j]! > e.id[i]!)) i = j;
    expect([e.troop[i], e.wTier[i], e.aTier[i]]).toEqual([Troop.Close, 1, 1]);
    expect([e.weapon[i], e.armour[i], e.shield[i]]).toEqual([CLOSE_GEAR[1], ARMOUR_GEAR[1], SHIELD_GEAR[1]]);
  });

  it('waits for free supply before a troop starts', () => {
    const s = createWorld(1, { playerUnits: 7, peaceful: true });
    const base = bigHouse(s)!;
    const texts: string[] = [];
    for (let k = 0; k < 200; k++) {
      step(s, k === 0 ? [{ kind: 'produce', player: 0, building: base.id, product: troopProduct(Troop.Long, 1, 0), count: 1 }] : []);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(base.queue[0]!.progress).toBe(0);
    expect(texts).toContain('Not enough supply to train a long melee. Build farms or upgrade the main base.');
  });
});

describe('upgrading units (Troops and gear: Upgrading units)', () => {
  it('Upgrade Weapon walks a troop to the nearest Forge, Barracks or main base and raises its tier', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const h = bigHouse(s)!;
    const forge = built(s, BuildingKind.Forge, 1, [h.x + 40, h.z]);
    const barracks = built(s, BuildingKind.Barracks, 1, [h.x - 40, h.z]);
    // Three close-melee troops with cudgels: one out by the forge, one by the barracks, one by the Big House.
    const [fx, fz] = buildingCentre(forge);
    const [bx, bz] = buildingCentre(barracks);
    const [hx, hz] = buildingCentre(h);
    const units = [addWarrior(s, 0, fx + 8 * M, fz, Troop.Close, 1), addWarrior(s, 0, bx - 8 * M, bz, Troop.Close, 1), addWarrior(s, 0, hx, hz + 14 * M, Troop.Close, 1)];
    const places = [forge, barracks, h];
    units.forEach((i, k) => expect(nearestUpgradePlace(s, i, kitHolder(s, i)!)!.id).toBe(places[k]!.id));
    const sticks = pool[Res.Sticks]!;
    const flint = pool[Res.Flint]!;
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: units.map((i) => e.id[i]!), line: Line.Weapon, max: 0 }]);
    // Each flint hand-axe (2 sticks, 1 flint) is paid when the button is pressed.
    expect([pool[Res.Sticks], pool[Res.Flint]]).toEqual([sticks - 6, flint - 3]);
    units.forEach((i, k) => expect(pendingKitUp(s, i, Line.Weapon)).toMatchObject({ to: 2, b: places[k]!.id }));
    // Half the hand-axe's 10 s beside the building.
    const bars = units.map(() => 0);
    runUntil(
      s,
      () => {
        units.forEach((i, k) => {
          const [, n] = upgradeProgress(s, i);
          if (n) bars[k] = n;
        });
        return units.every((i) => e.wTier[i] === 2);
      },
      3000,
    );
    expect(bars).toEqual([100, 100, 100]);
    for (const i of units) {
      expect(e.weapon[i]).toBe(CLOSE_GEAR[2]);
      expect(pendingKitUp(s, i, Line.Weapon)).toBeUndefined();
    }
    // Each cudgel is scrapped with a full refund (3 sticks), so a step costs the difference.
    expect([pool[Res.Sticks], pool[Res.Flint]]).toEqual([sticks - 6 + 9, flint - 3]);
  });

  it('Max goes to the best tier researched and affordable, and the old kit comes back in full', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    built(s, BuildingKind.Forge);
    mainBaseAt(s, 3);
    // Bronze and Steel are not researched and the iron broadsword is 1 ingot short: the best is the wrought iron sword.
    // Its 1 lumber comes from the hardwood, the only lumber in stock (Patch 5: either kind pays).
    pool[Res.SoftwoodLumber] = 0;
    pool[Res.CopperIngot] = 1;
    pool[Res.BronzeIngot] = 2;
    pool[Res.WroughtIron] = 2;
    pool[Res.IronIngot] = 1;
    pool[Res.SteelIngot] = 3;
    pool[Res.HardwoodLumber] = 3;
    pool[Res.Leather] = 1;
    const i = 4;
    const h = kitHolder(s, i)!;
    expect(h).toEqual({ kind: 'warrior', troop: Troop.Close, w: 1, a: 0 });
    expect(upgradeTarget(h, Line.Weapon, false, pool, techOf(s, 0))).toMatchObject({ to: 2 });
    expect(upgradeTarget(h, Line.Weapon, true, pool, techOf(s, 0))).toMatchObject({ to: 5 });
    const before = [...pool];
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [e.id[i]!], line: Line.Weapon, max: 1 }]);
    expect([pool[Res.WroughtIron], pool[Res.HardwoodLumber], pool[Res.Leather]]).toEqual([0, 2, 0]);
    runUntil(s, () => e.wTier[i] === 5, 3000);
    expect(e.weapon[i]).toBe(CLOSE_GEAR[5]);
    // Nothing else was touched, and the cudgel's 3 sticks came back.
    for (const r of [Res.CopperIngot, Res.BronzeIngot, Res.IronIngot, Res.SteelIngot]) expect(pool[r], `res ${r}`).toBe(before[r]);
    expect(pool[Res.Sticks]).toBe(before[Res.Sticks]! + 3);
    // With another iron ingot in stock, Max would go on to the iron broadsword.
    pool[Res.IronIngot] = 2;
    pool[Res.HardwoodLumber] = 1;
    pool[Res.Leather] = 1;
    expect(upgradeTarget(kitHolder(s, i)!, Line.Weapon, true, pool, techOf(s, 0))).toMatchObject({ to: 6 });
  });
});

describe('long melee (Troops and gear)', () => {
  it('has no minimum range, and hits 30% harder in the outer third of its reach', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = buildingCentre(bigHouse(s)!);
    const x = hx + 30 * M;
    const pike = addWarrior(s, 0, x, hz, Troop.Long, 6);
    const sword = addWarrior(s, 0, x, hz + 12 * M, Troop.Close, 5);
    const rat = addMob(s, Mob.GiantRat, 0, x + M, hz, 0);
    const w = meleeOf(s, pike);
    expect(w.crit).toBe(true);
    expect(w.oneHanded).toBe(false);
    expect(w.reach).toBe(Math.floor((350 * M) / 100));
    const at = (from: number, g: number): void => {
      e.x[rat] = e.x[from]! + g + halfWidth(s, rat);
      e.z[rat] = e.z[from]!;
      expect(gap(s, from, rat)).toBe(g);
    };
    // Right beside it: in reach, a plain blow.
    at(pike, 0);
    expect(canReach(s, pike, rat, w)).toBe(true);
    expect(critDamage(s, pike, rat, w, 100)).toBe(100);
    // The outer third of reach: +30%.
    const edge = w.reach - Math.floor((w.reach * CRIT.outerPm) / 1000);
    at(pike, edge - 1);
    expect(critDamage(s, pike, rat, w, 100)).toBe(100);
    at(pike, edge);
    expect(critDamage(s, pike, rat, w, 100)).toBe(130);
    at(pike, w.reach);
    expect(canReach(s, pike, rat, w)).toBe(true);
    expect(critDamage(s, pike, rat, w, 100)).toBe(130);
    // A close-melee sword never crits, at the edge of its reach or anywhere.
    const sw = meleeOf(s, sword);
    expect(sw.crit).toBe(false);
    at(sword, sw.reach);
    expect(critDamage(s, sword, rat, sw, 100)).toBe(100);
  });

  it('kills a giant rat right beside it with its spear', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = buildingCentre(bigHouse(s)!);
    const x = hx + 30 * M;
    const spear = addWarrior(s, 0, x, hz, Troop.Long, 1);
    const rat = addMob(s, Mob.GiantRat, 0, x + M / 2, hz, 0);
    const ratId = e.id[rat]!;
    const spearId = e.id[spear]!;
    let hitBySpear = false;
    run(s, 1, [{ kind: 'attack', player: 0, units: [spearId], target: ratId }]);
    runUntil(
      s,
      () => {
        const r = e.indexOf(ratId);
        if (r >= 0 && e.attacker[r] === spearId && e.hp[r]! < e.maxHp[r]!) hitBySpear = true;
        return r < 0 || e.hp[r]! <= 0;
      },
      600,
    );
    expect(hitBySpear).toBe(true);
    expect(e.hp[e.indexOf(spearId)]).toBeGreaterThan(0);
  });
});

describe('losing', () => {
  it('losing every worker with no main base or farm ends the game with the nights survived', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = 3 * CYCLE_STEPS + 100;
    destroyBuilding(s, bigHouse(s)!.id);
    step(s);
    expect(s.over).toBe(0);
    for (const id of ownIds(s)) s.entities.remove(id);
    const texts: string[] = [];
    for (let k = 0; k < 3; k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(s.over).toBeGreaterThan(0);
    expect(texts).toContain('The game is over. Nights survived: 3.');
  });
});

describe('determinism with monsters', () => {
  it('a save made mid-fight carries on to the same hash', () => {
    const s = createWorld(5);
    fenceIn(s);
    run(s, NIGHT_START + 1200 - s.step);
    expect(s.entities.count).toBeGreaterThan(6);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    run(s, 600);
    run(copy, 600);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('orders for units that are gone', () => {
  it('are ignored, whatever the order', () => {
    const s = createWorld(1, { peaceful: true });
    const gone = [999];
    const orders: Order[] = [
      { kind: 'move', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'attackMove', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'patrol', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'attack', player: 0, units: gone, target: 999 },
      { kind: 'hold', player: 0, units: gone },
      { kind: 'upgradeKit', player: 0, units: gone, line: 0, max: 1 },
      { kind: 'upgradeEquipment', player: 0, units: gone },
      { kind: 'cart', player: 0, units: gone, back: 0 },
      { kind: 'troopLock', player: 0, building: 999, troop: 1, lock: 12 },
      { kind: 'lock', player: 0, units: gone, lock: 1 },
      { kind: 'dig', player: 0, units: gone, x0: 0, z0: 0, x1: 1, z1: 1, level: -4, level2: 0, tunnel: 0 },
    ];
    const before = hashState(s);
    expect(() => step(s, orders)).not.toThrow();
    const fresh = createWorld(1, { peaceful: true });
    step(fresh);
    expect(hashState(s)).toBe(hashState(fresh));
    expect(before).not.toBe(hashState(s));
  });
});
