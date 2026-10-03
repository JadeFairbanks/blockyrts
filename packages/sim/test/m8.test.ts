import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addEngine,
  addMob,
  addWarrior,
  BOSS_RETURN_NIGHTS,
  bossAtDawn,
  bossAtDusk,
  BuildingKind,
  buildingCentre,
  buildingTop,
  createWorld,
  CRIT,
  CYCLE_STEPS,
  DAY_STEPS,
  DebugThreat,
  deserializeState,
  DUSK_STEPS,
  Engine,
  engineSpec,
  ENGINE_GOODS,
  goodName,
  inStock,
  landAt,
  makeBundles,
  priceTenths,
  FactionKind,
  gearSpec,
  hashState,
  LONG_GEAR,
  LONG_KITS,
  Mob,
  mobSpec,
  Mount,
  mountSpec,
  PEOPLES,
  PeopleUnit,
  pickNight,
  placeBuilding,
  productProblem,
  RANGER_GEAR,
  Res,
  Research,
  RESEARCH,
  seat,
  serializeState,
  Shot,
  Skill,
  Species,
  speciesSpec,
  step,
  summonBoss,
  Troop,
  troopProduct,
  troopTypesAt,
  UnitKind,
  unlocked,
  validateOrder,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const SEC = 20;

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

function warriors(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior && e.hp[i]! > 0) out.push(i);
  return out;
}

/** A tier 1 cavalry troop (a fire-hardened spear) on a horse at a point: riders are cavalry now (Troops and gear). */
function riderAt(s: SimState, x: number, z: number): number {
  const w = addWarrior(s, 0, x, z, Troop.Cavalry, 1, 0);
  seat(s, w, Mount.Horse);
  return w;
}

function toNight(s: SimState, night: number): void {
  s.step = night * CYCLE_STEPS + DAY_STEPS + DUSK_STEPS;
}

/** A mob of a kind at a point (wu), its index. */
function spawn(s: SimState, mob: number, x: number, z: number): number {
  run(s, 1, [{ kind: 'debugSpawn', player: 0, mob, x, z }]);
  const e = s.entities;
  let last = -1;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === mob && e.hp[i]! > 0) last = i;
  return last;
}

/** A clear spot 30 m east of the Big House. */
function field(s: SimState): [number, number] {
  const [x, z] = buildingCentre(bigHouse(s));
  return [x + 30 * M, z];
}

describe('riding and charges (Table 14)', () => {
  it('charges a zombie after a straight gallop: double damage, and knocked back a metre', () => {
    const s = createWorld(1, { peaceful: true });
    toNight(s, 1);
    const [x, z] = field(s);
    const e = s.entities;
    const w = riderAt(s, x, z);
    const zombie = spawn(s, Mob.Zombie, x + 25 * M, z);
    e.hp[zombie] = 1000;
    e.maxHp[zombie] = 1000;
    e.speed[zombie] = 0;
    const zid = e.id[zombie]!;
    run(s, 1, [{ kind: 'attack', player: 0, units: [e.id[w]!], target: zid }]);
    let before = 1000;
    let atX = 0;
    runUntil(s, () => {
      const t = e.indexOf(zid);
      if (e.hp[t]! < 1000) return true;
      before = e.hp[t]!;
      atX = e.x[t]!;
      return false;
    }, 20 * SEC);
    const t = e.indexOf(zid);
    const first = before - e.hp[t]!;
    // A zombie (1.7 m) is shorter than a horse (2.4 m) but taller than 60% of its shoulder: 1 m back.
    expect(e.x[t]! - atX).toBeGreaterThanOrEqual(M - M / 8);
    // The next hit, standing, is not a charge.
    const now = e.hp[t]!;
    runUntil(s, () => e.hp[e.indexOf(zid)]! < now, 10 * SEC);
    const second = now - e.hp[e.indexOf(zid)]!;
    // Both blows land at the spear's outer third of reach, a critical (+30%, Troops and gear): the charge doubles the blow before it.
    const crit = (d: number): number => Math.floor((d * (100 + CRIT.bonusPct)) / 100);
    expect(second).toBe(crit(LONG_KITS[1]!.damage));
    expect(first).toBe(crit(2 * LONG_KITS[1]!.damage));
  });

  it('a blow on a rider lands on the horse while the horse has the more health', () => {
    const s = createWorld(1, { peaceful: true });
    toNight(s, 1);
    const [x, z] = field(s);
    const e = s.entities;
    const w = riderAt(s, x, z);
    expect(e.mountHp[w]).toBe(mountSpec(Mount.Horse).hp);
    const hp = e.hp[w]!;
    spawn(s, Mob.Zombie, x + 2 * M, z);
    runUntil(s, () => e.mountHp[w]! < mountSpec(Mount.Horse).hp, 20 * SEC);
    expect(e.hp[w]).toBe(hp);
  });

  it('trains cavalry at the Stables on a tamed horse from its stalls: the horse is used up and the rider comes out mounted', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Stables, x, z }]);
    const stables = s.buildings.list.find((b) => b.kind === BuildingKind.Stables)!;
    expect(stables.complete).toBe(true);
    expect(troopTypesAt(stables)).toEqual([Troop.Cavalry]);
    const e = s.entities;
    const p = s.players[0]!;
    const horses = (): number => {
      let n = 0;
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Animal && e.mob[i] === Species.Horse && e.owner[i] === 0 && e.hp[i]! > 0) n++;
      return n;
    };
    const cavalry = (): number[] => warriors(s).filter((i) => e.troop[i] === Troop.Cavalry);
    expect(horses()).toBe(2);
    // A fire-hardened spear (4 sticks) and no armour: the kit, the food and one of the horses.
    const product = troopProduct(Troop.Cavalry, 1, 0);
    p.pool[Res.Sticks] = 12;
    expect(productProblem(s, stables, product)).toBe('');
    run(s, 1, [{ kind: 'produce', player: 0, building: stables.id, product, count: 1 }]);
    expect(stables.queue.length).toBe(1);
    expect(p.pool[Res.Sticks]).toBe(8);
    run(s, 1);
    expect(horses()).toBe(1);
    // The horse leaves quietly: no carcass alert.
    expect(s.events.some((ev) => ev.text.includes('has been killed'))).toBe(false);
    runUntil(s, () => cavalry().length > 0, 60 * SEC);
    const [c] = cavalry();
    expect(e.mount[c!]).toBe(Mount.Horse);
    expect(e.mountHp[c!]).toBe(speciesSpec(Species.Horse).hp);
    expect(e.weapon[c!]).toBe(LONG_GEAR[1]);
    expect(e.shield[c!]).toBe(0);
    expect(horses()).toBe(1);
    // The second takes the last horse; a third is refused with the reason, and cancelling gives the horse back.
    run(s, 1, [{ kind: 'produce', player: 0, building: stables.id, product, count: 1 }]);
    run(s, 1);
    expect(horses()).toBe(0);
    expect(productProblem(s, stables, product)).toBe('Cavalry needs a tamed horse in the stalls.');
    run(s, 1, [{ kind: 'produce', player: 0, building: stables.id, product, count: 1 }]);
    expect(s.events.some((ev) => ev.kind === 'alert' && ev.text === 'Cavalry needs a tamed horse in the stalls.')).toBe(true);
    expect(stables.queue.length).toBe(1);
    run(s, 1, [{ kind: 'cancelProduce', player: 0, building: stables.id, index: 0 }]);
    expect(stables.queue.length).toBe(0);
    expect(horses()).toBe(1);
    expect(p.pool[Res.Sticks]).toBe(8);
    expect(productProblem(s, stables, product)).toBe('');
  });

  it('has no riding training and no mount or dismount order: a troop\'s type is fixed', () => {
    expect(Object.keys(Skill)).toEqual(['Cannon']);
    for (const kind of ['mount', 'dismount']) expect(() => validateOrder({ kind, player: 0, units: [1], target: 0 } as unknown as Order)).toThrow(/unknown order kind/);
    // A close-melee troop cannot be trained at the Stables, nor cavalry at the Barracks.
    const s = createWorld(1, { peaceful: true });
    const base = bigHouse(s);
    const barracks = placeBuilding(s, 0, BuildingKind.Barracks, 0, base.x + 18, base.z, true);
    expect(troopTypesAt(barracks)).not.toContain(Troop.Cavalry);
    expect(productProblem(s, barracks, troopProduct(Troop.Cavalry, 1, 0))).toBe('This building cannot make that.');
  });
});

describe('siege engines (Table 2f)', () => {
  it('an ox hauls a catapult, two warriors crew it, and its stones break a goblin hut', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    const e = s.entities;
    const p = s.players[0]!;
    p.pool[Res.CatapultStone] = 20;
    const cat = addEngine(s, 0, Engine.Catapult, x, z);
    const catId = e.id[cat]!;
    const ox = addAnimal(s, Species.Ox, 0, x - 6 * M, z, 0, 0);
    // Nothing hauls it yet: it says why and stays.
    run(s, 2, [{ kind: 'move', player: 0, units: [catId], x: x + 10 * M, z }]);
    expect(e.x[e.indexOf(catId)]).toBe(x);
    run(s, 1, [{ kind: 'stop', player: 0, units: [catId] }]);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [catId], target: e.id[ox]! }]);
    run(s, 1, [{ kind: 'move', player: 0, units: [catId], x: x + 10 * M, z }]);
    runUntil(s, () => e.x[e.indexOf(catId)]! >= x + 9 * M, 60 * SEC);
    const hut = spawn(s, Mob.GoblinHut, x + 10 * M + 35 * M, z);
    const hutId = e.id[hut]!;
    addWarrior(s, 0, x + 8 * M, z + 3 * M);
    const [w1, w2] = warriors(s);
    run(s, 1, [{ kind: 'crew', player: 0, units: [e.id[w1!]!, e.id[w2!]!], target: catId }]);
    run(s, 1, [{ kind: 'attack', player: 0, units: [catId], target: hutId }]);
    runUntil(s, () => e.indexOf(hutId) < 0 || e.hp[e.indexOf(hutId)]! <= 0, 180 * SEC);
    expect(p.pool[Res.CatapultStone]).toBeLessThan(20);
  });

  it('workers repair a damaged engine; it never heals by itself', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    const e = s.entities;
    const b = addEngine(s, 0, Engine.Ballista, x, z);
    e.hp[b] = 100;
    run(s, 30 * SEC);
    expect(e.hp[b]).toBe(100);
    let worker = -1;
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) worker = i;
    run(s, 1, [{ kind: 'mend', player: 0, units: [e.id[worker]!], target: e.id[b]! }]);
    runUntil(s, () => e.hp[b] === engineSpec(Engine.Ballista).hp, engineSpec(Engine.Ballista).steps + 60 * SEC);
  });
});

describe('tier 8: the Gunnery yard and the Citadel ports', () => {
  it('trains a musketeer, a tier 8 ranger, at the Barracks once Gunpowder and Muskets are researched and there is a Steelworks', () => {
    const s = createWorld(1, { peaceful: true });
    const base = bigHouse(s);
    const barracks = placeBuilding(s, 0, BuildingKind.Barracks, 0, base.x + 18, base.z, true);
    const p = s.players[0]!;
    p.pool[Res.Meat] = 200;
    // The flintlock musket's kit (Table 2e): carbon steel, planks, flint and gunpowder.
    for (const [r, n] of [[Res.CarbonSteel, 1], [Res.Planks, 2], [Res.Flint, 1], [Res.Gunpowder, 1]] as const) p.pool[r] = n;
    const product = troopProduct(Troop.Ranger, 8, 0);
    expect(productProblem(s, barracks, product)).toBe('Needs a Steelworks.');
    const forge = placeBuilding(s, 0, BuildingKind.Forge, 0, base.x - 18, base.z, true);
    forge.level = 4;
    expect(productProblem(s, barracks, product)).toBe(`Needs ${RESEARCH[Research.CarbonSteel]!.name} researched first.`);
    p.research |= 1 << Research.Steel;
    p.research |= 1 << Research.CarbonSteel;
    expect(productProblem(s, barracks, product)).toBe(`Needs ${RESEARCH[Research.Gunpowder]!.name} researched first.`);
    p.research |= 1 << Research.Gunpowder;
    expect(productProblem(s, barracks, product)).toBe(`Needs ${RESEARCH[Research.Muskets]!.name} researched first.`);
    p.research |= 1 << Research.Muskets;
    expect(productProblem(s, barracks, product)).toBe('');
    run(s, 1, [{ kind: 'produce', player: 0, building: barracks.id, product, count: 1 }]);
    expect(p.pool[Res.Gunpowder]).toBe(0);
    const e = s.entities;
    const rangers = (): number[] => warriors(s).filter((i) => e.troop[i] === Troop.Ranger);
    runUntil(s, () => rangers().length > 0, (45 + 90) * SEC + 5);
    const [r] = rangers();
    expect(e.wTier[r!]).toBe(8);
    expect(e.ranged[r!]).toBe(RANGER_GEAR[8]);
    expect(gearSpec(e.ranged[r!]!).ranged!.shot).toBe(Shot.MusketBall);
  });

  it('trains cannon crew at the Gunnery yard once Cannons is researched', () => {
    const s = createWorld(1, { peaceful: true });
    const base = bigHouse(s);
    const yard = placeBuilding(s, 0, BuildingKind.GunneryYard, 0, base.x + 18, base.z, true);
    const p = s.players[0]!;
    p.pool[Res.Meat] = 200;
    const e = s.entities;
    const id = e.id[warriors(s)[0]!]!;
    run(s, 1, [{ kind: 'trainSkill', player: 0, units: [id], building: yard.id, skill: Skill.Cannon }]);
    run(s, 30 * SEC);
    expect(e.skills[e.indexOf(id)]! & Skill.Cannon).toBe(0);
    p.research |= 1 << Research.Cannons;
    run(s, 1, [{ kind: 'trainSkill', player: 0, units: [id], building: yard.id, skill: Skill.Cannon }]);
    runUntil(s, () => (e.skills[e.indexOf(id)]! & Skill.Cannon) !== 0, 120 * SEC);
  });

  it('hauls a bronze cannon into a Citadel port, where its crew fire it from the roof', () => {
    const s = createWorld(1, { peaceful: true });
    const base = bigHouse(s);
    const [bx, bz] = buildingCentre(base);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Citadel, x: bx, z: bz }]);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.GunKit, x: bx, z: bz }]);
    const p = s.players[0]!;
    p.pool[Res.Cannonball] = 10;
    const e = s.entities;
    const gun = addEngine(s, 0, Engine.BronzeCannon, bx + 20 * M, bz);
    const gunId = e.id[gun]!;
    const horse = addAnimal(s, Species.Horse, 0, bx + 24 * M, bz, 0, 0);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [gunId], target: e.id[horse]! }]);
    run(s, 1, [{ kind: 'enter', player: 0, units: [gunId], building: base.id }]);
    runUntil(s, () => e.inside[e.indexOf(gunId)] === base.id, 90 * SEC);
    const g = e.indexOf(gunId);
    expect(e.y[g]).toBe(buildingTop(base));
    addWarrior(s, 0, bx + 12 * M, bz);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.GunKit, x: bx, z: bz }]);
    const crew = warriors(s).slice(0, 2).map((i) => e.id[i]!);
    run(s, 1, [{ kind: 'crew', player: 0, units: crew, target: gunId }]);
    runUntil(s, () => crew.every((id) => e.inside[e.indexOf(id)] === base.id), 60 * SEC);
    toNight(s, 2);
    const powder = p.pool[Res.Gunpowder]!;
    const zombie = spawn(s, Mob.Zombie, e.x[g]! + 35 * M, e.z[g]!);
    e.speed[zombie] = 0;
    runUntil(s, () => p.pool[Res.Cannonball]! < 10, 20 * SEC);
    // A gunpowder makes ten charges: one is spent, nine wait in the cannon.
    expect(p.pool[Res.Gunpowder]).toBe(powder - 1);
    expect(e.ammo[e.indexOf(gunId)]).toBe(9);
  });

  it('a Dwarf city fields gunners, cannon crew and two cannons', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: FactionKind.DwarfCity, x: x + 60 * M, z }]);
    const e = s.entities;
    let gunners = 0;
    let crew = 0;
    let cannons = 0;
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== PEOPLES) continue;
      if (e.kind[i] === UnitKind.Warrior && e.mob[i] === PeopleUnit.DwarfGunner) gunners++;
      if (e.kind[i] === UnitKind.Warrior && e.mob[i] === PeopleUnit.DwarfCannonCrew) crew++;
      if (e.kind[i] === UnitKind.Engine) cannons++;
    }
    expect([gunners, crew, cannons]).toEqual([6, 4, 2]);
    // It sells a cannon of each kind and muskets, with the powder and shot to use them (Table 19).
    const city = s.peoples.factions.find((f) => f.kind === FactionKind.DwarfCity)!;
    expect(inStock(city, ENGINE_GOODS + Engine.BronzeCannon)).toBe(1);
    expect(goodName(ENGINE_GOODS + Engine.BronzeCannon)).toBe('Bronze cannon');
    expect(priceTenths(city, ENGINE_GOODS + Engine.BronzeCannon)).toBe(4200);
    expect(inStock(city, Res.Gunpowder)).toBeGreaterThan(0);
  });

  it('a Dwarf city sells one cannon a day, bronze or iron, whichever goes first', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: FactionKind.DwarfCity, x: x + 60 * M, z }]);
    const city = s.peoples.factions.find((f) => f.kind === FactionKind.DwarfCity)!;
    const bronze = ENGINE_GOODS + Engine.BronzeCannon;
    const iron = ENGINE_GOODS + Engine.IronCannon;
    expect([inStock(city, bronze), inStock(city, iron)]).toEqual([1, 1]);
    // However rich the offer, no bundle holds two cannons.
    for (const b of makeBundles(city, 100000)) {
      let cannons = 0;
      for (let k = 0; k < b.length; k += 2) if (b[k] === bronze || b[k] === iron) cannons += b[k + 1]!;
      expect(cannons).toBeLessThanOrEqual(1);
    }
    // Bought: the other kind waits for the dawn restock. (The offer's answer is set to the cannon here; gold and gems pay for it.)
    const w = warriors(s)[0]!;
    landAt(s, w, city.x + 12 * M, city.z);
    s.entities.queue[w] = [];
    const pool = s.players[0]!.pool;
    for (const r of [Res.Gold, Res.Rubies, Res.Emeralds]) pool[r] = 20;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: city.id, goods: [Res.Gold, 20, Res.Rubies, 20, Res.Emeralds, 20] }]);
    s.peoples.offers.find((o) => o.faction === city.id)!.bundles[0] = [iron, 1];
    run(s, 1, [{ kind: 'tradeTake', player: 0, faction: city.id, bundle: 0 }]);
    expect(pool[Res.Gold]).toBe(0);
    expect(inStock(city, bronze) + inStock(city, iron)).toBe(0);
  });

  it('a Halfling village rides its war oxen out only when a war starts', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: FactionKind.HalflingVillage, x, z: z - 60 * M }]);
    const e = s.entities;
    const village = s.peoples.factions.find((f) => f.kind === FactionKind.HalflingVillage)!;
    const count = (unit: number): number => {
      let n = 0;
      for (let i = 0; i < e.count; i++) if (e.owner[i] === PEOPLES && e.group[i] === village.id && e.hp[i]! > 0 && e.mob[i] === unit) n++;
      return n;
    };
    const before = [count(PeopleUnit.HalflingSpearman), count(PeopleUnit.HalflingArcher)];
    expect(count(PeopleUnit.HalflingOxRider)).toBe(0);
    expect(village.oxen).toBe(2);
    run(s, 1, [{ kind: 'declareWar', player: 0, faction: village.id }]);
    // A spearman in front and an archer behind on each ox.
    expect([count(PeopleUnit.HalflingSpearman), count(PeopleUnit.HalflingArcher), count(PeopleUnit.HalflingOxRider)]).toEqual([before[0]! - 2, before[1]! - 2, 2]);
    expect(village.oxen).toBe(0);
    let rider = -1;
    for (let i = 0; i < e.count; i++) if (e.mob[i] === PeopleUnit.HalflingOxRider && e.owner[i] === PEOPLES) rider = i;
    expect(e.mount[rider]).toBe(Mount.WarOx);
    expect(e.mountHp[rider]).toBe(mountSpec(Mount.WarOx).hp);
  });
});

describe('the late nights and Morvath', () => {
  it('by night 85 the budget can buy infernal juggernauts', () => {
    expect(mobSpec(Mob.InfernalJuggernaut).firstNight).toBe(85);
    expect(unlocked(84).some(([m]) => m === Mob.InfernalJuggernaut)).toBe(false);
    expect(unlocked(85).some(([m]) => m === Mob.InfernalJuggernaut)).toBe(true);
    const s = createWorld(1);
    let bought = 0;
    for (let k = 0; k < 20 && bought === 0; k++) bought = pickNight(s, 90).filter((m) => m === Mob.InfernalJuggernaut).length;
    expect(bought).toBeGreaterThan(0);
  });

  it('Morvath comes on night 110, withdraws at dawn with his health, and returns ten nights after a defeat', () => {
    const s = createWorld(1);
    const t = s.threats;
    bossAtDusk(s, 109);
    expect(t.bossId).toBe(0);
    bossAtDusk(s, 110);
    const e = s.entities;
    let i = e.indexOf(t.bossId);
    expect(e.mob[i]).toBe(Mob.Morvath);
    e.hp[i] = e.maxHp[i]! - 500;
    const left = e.hp[i]!;
    bossAtDawn(s, 110);
    run(s, 2);
    expect(t.bossId).toBe(0);
    expect(e.indexOf(e.id[i]!) < 0 || e.hp[i]! <= 0 || e.mob[i] !== Mob.Morvath).toBe(true);
    expect(t.bossNext).toBe(111);
    bossAtDusk(s, 111);
    i = e.indexOf(t.bossId);
    expect(e.hp[i]).toBe(left);
    // Beaten: back ten nights later.
    s.step = 111 * CYCLE_STEPS + DAY_STEPS + DUSK_STEPS + 100;
    e.hp[i] = 0;
    s.dying.push(e.id[i]!);
    run(s, 2);
    expect(t.bossId).toBe(0);
    expect(t.bossNext).toBe(111 + BOSS_RETURN_NIGHTS);
    bossAtDusk(s, 115);
    expect(t.bossId).toBe(0);
  });

  it('takes flight below half his health', () => {
    const s = createWorld(1, { peaceful: true });
    toNight(s, 110);
    const [x, z] = field(s);
    const e = s.entities;
    const i = summonBoss(s, 0, x + 40 * M, z, 110);
    e.hp[i] = (e.maxHp[i]! >> 1) - 1;
    run(s, SEC + 1);
    expect(e.mob[i]).toBe(Mob.MorvathAloft);
  });

  it('keeps riders, engines and the boss through a snapshot and replays to the same hash', () => {
    const s = createWorld(1);
    toNight(s, 30);
    const [x, z] = field(s);
    const e = s.entities;
    const w = riderAt(s, x, z);
    addEngine(s, 0, Engine.Catapult, x + 5 * M, z);
    addMob(s, Mob.BarrowKnight, 0, x + 30 * M, z, 30);
    summonBoss(s, 0, x + 60 * M, z, 110);
    run(s, 40);
    const snap = serializeState(s);
    const t = deserializeState(snap);
    expect(hashState(t)).toBe(hashState(s));
    run(s, 200);
    for (let k = 0; k < 200; k++) step(t);
    expect(hashState(t)).toBe(hashState(s));
    expect(e.mount[w]).toBe(Mount.Horse);
  });
});
