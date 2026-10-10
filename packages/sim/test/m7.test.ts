import { describe, expect, it } from 'vitest';
import {
  Band,
  BuildingKind,
  buildingCentre,
  clockAt,
  createWorld,
  dailyTradeTenths,
  CARAVAN_EVERY_STEPS,
  CYCLE_STEPS,
  DEBUG_CARAVAN,
  DEBUG_MEET_ELVES,
  deserializeState,
  diffStates,
  elfKingdom,
  elfKingdomCell,
  FactionKind,
  factionMembers,
  fightersOf,
  hashState,
  hireSilver,
  hurtUnit,
  isPerson,
  landAt,
  LINES,
  LIVE_GOODS,
  MANA_SCALE,
  MERC_LINES,
  Mob,
  MONSTERS,
  NEUTRAL,
  offerOf,
  OUT_OF_REACH,
  onTreeCut,
  People,
  PEOPLES,
  payPct,
  peopleOf,
  Period,
  PLUNDER_GOODS,
  priceTenths,
  recampIn,
  reparationsOwed,
  Res,
  RESOURCES,
  Role,
  School,
  serializeState,
  settleDeaths,
  Status,
  step,
  structuresOf,
  supplyUsed,
  tradeProblem,
  trinketRes,
  UnitKind,
  UNTIL_DAWN,
  WU_PER_COLUMN,
  WU_PER_METRE,
  addMob,
  type Faction,
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

function home(s: SimState): [number, number] {
  return buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
}

function unit(s: SimState, kind: number, n = 0): number {
  const e = s.entities;
  let k = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind && k++ === n) return i;
  throw new Error('no such unit');
}

/** A people placed by the debug button, `dx` metres east of the main base. */
function place(s: SimState, what: number, dx = 60, dz = 0): Faction {
  const [hx, hz] = home(s);
  const before = new Set(s.peoples.factions.map((f) => f.id));
  run(s, 1, [{ kind: 'debugPeoples', player: 0, what, x: hx + dx * M, z: hz + dz * M }]);
  const f = s.peoples.factions.find((g) => g.kind === what && (!before.has(g.id) || what === FactionKind.ElfKingdom))!;
  expect(f, `faction ${what}`).toBeDefined();
  return f;
}

/** Brings a unit to stand `dx` metres east of one of a faction's buildings (Patch 5: trade within 10 m of one) and keeps it there. */
function bring(s: SimState, i: number, f: Faction, dx = 6): void {
  const e = s.entities;
  const b = structuresOf(s, f.id)[0]!;
  landAt(s, i, e.x[b]! + dx * M, e.z[b]!);
  e.queue[i] = [];
}

/** A player's unit kills some of the peoples, as a blow in a step would (the events stay to be read). */
function kill(s: SimState, list: readonly number[], by: number): void {
  for (const i of list) hurtUnit(s, i, { damage: 100000, from: s.entities.id[by]!, projectile: false, blunt: false, pierce: false, exact: true, roll: 0 });
  settleDeaths(s);
}

function texts(s: SimState): string[] {
  return s.events.map((v) => v.text);
}

/** What a bundle is worth to the faction selling it, tenths. */
function worthOf(f: Faction, b: readonly number[]): number {
  let t = 0;
  for (let k = 0; k < b.length; k += 2) t += priceTenths(f, b[k]!) * b[k + 1]!;
  return t;
}

describe('the peoples', () => {
  it('are placed with their buildings, people, beasts and stock', () => {
    const s = createWorld(1);
    const kinds = [FactionKind.HalflingVillage, FactionKind.RunkinCamp, FactionKind.ElfKingdom, FactionKind.ElfCaravan, FactionKind.DwarfColony, FactionKind.DwarfCity, FactionKind.MercCamp];
    kinds.forEach((kind, k) => {
      const f = place(s, kind, 80 + 90 * (k % 4), k < 4 ? -60 : 60);
      expect(f.kind).toBe(kind);
      expect(f.built).toBe(1);
      expect(f.status).toBe(Status.Settled);
      expect(peopleOf(s, f.id).length).toBeGreaterThan(0);
      if (kind !== FactionKind.MercCamp) {
        expect(structuresOf(s, f.id).length).toBeGreaterThan(0);
        expect(f.stock.length).toBeGreaterThan(0);
        expect(f.leader).not.toBe(0);
      }
      for (const j of factionMembers(s, f.id)) expect(s.entities.owner[j]).toBe(PEOPLES);
    });
    // A Grovesinger is a mage of the Grove with her mana bar full.
    const k = s.peoples.factions.find((f) => f.kind === FactionKind.ElfKingdom)!;
    const e = s.entities;
    const grove = peopleOf(s, k.id).filter((j) => e.kind[j] === UnitKind.Mage);
    expect(grove.length).toBeGreaterThan(0);
    for (const j of grove) {
      expect(e.school[j]).toBe(School.Grove);
      expect(e.mana[j]).toBe(150 * MANA_SCALE);
    }
    // They stand side by side with nobody: the run goes on without a fight among them.
    run(s, 400);
    for (const f of s.peoples.factions) if (f.built) expect(f.dead).toBe(0);
  });

  it('are found as the players explore, by the seed alone', () => {
    const a = createWorld(3);
    const b = createWorld(3);
    run(a, 200);
    run(b, 200);
    expect(a.peoples.factions.map((f) => [f.kind, f.x, f.z])).toEqual(b.peoples.factions.map((f) => [f.kind, f.x, f.z]));
    // The Elf kingdom's cell is in the Deepwoods, a ring in from its edge where the band is that deep (its band is its site's since Patch 5).
    const layout = a.world.layout;
    const cell = layout.cell(elfKingdomCell(a));
    expect(cell.band).toBe(Band.Deepwoods);
    expect(cell.ring).toBe(Math.min(layout.bands.deepwoods + 1, layout.bands.barrens - 1));
  });
});

describe('trade', () => {
  it('answers an offer with three bundles worth about what it is worth to them, and takes one', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.HalflingVillage);
    const w = unit(s, UnitKind.Worker);
    bring(s, w, f);
    run(s, 2);
    expect(tradeProblem(s, f, 0)).toBe('');
    const tok = trinketRes(0, 1);
    s.players[0]!.pool[tok] = 3;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [tok, 3] }]);
    const o = offerOf(s, f.id, 0)!;
    expect(o).toBeDefined();
    expect(o.worth).toBeGreaterThan(0);
    expect(o.bundles.length).toBe(3);
    for (const b of o.bundles) {
      expect(worthOf(f, b)).toBeLessThanOrEqual(o.worth);
      expect(worthOf(f, b) * 100).toBeGreaterThanOrEqual(o.worth * 85 - 100 * priceTenths(f, b[b.length - 2]!));
    }
    // Every good is a material or food for the pool (Troops and gear: no items).
    const [good, n] = o.bundles[0]!;
    expect(good!).toBeLessThan(RESOURCES.length);
    const had = s.players[0]!.pool[good!]!;
    const stock = f.stock[f.stock.indexOf(good!) + 1]!;
    run(s, 1, [{ kind: 'tradeTake', player: 0, faction: f.id, bundle: 0 }]);
    expect(s.players[0]!.pool[tok]).toBe(0);
    expect(s.players[0]!.pool[good!]).toBe(had + n!);
    expect(f.stock[f.stock.indexOf(good!) + 1]).toBe(stock - n!);
    expect(f.traded & 1).toBe(1);
    expect(texts(s)).toContain(LINES[People.Halfling].trade);
    expect(offerOf(s, f.id, 0)).toBeUndefined();
  });

  it('stocks materials, food, live animals and engines, never items; the Elves sell steel, carbon steel and hardened leather', () => {
    const s = createWorld(1);
    const kinds = [FactionKind.HalflingVillage, FactionKind.RunkinCamp, FactionKind.ElfCaravan, FactionKind.DwarfColony, FactionKind.DwarfCity];
    const elfGoods = new Set<number>();
    kinds.forEach((kind, k) => {
      const f = place(s, kind, 80 + 90 * (k % 4), k < 4 ? -60 : 60);
      for (let q = 0; q < f.stock.length; q += 2) {
        const good = f.stock[q]!;
        expect(good < RESOURCES.length || good >= LIVE_GOODS, `faction ${kind} good ${good}`).toBe(true);
        if (kind === FactionKind.ElfCaravan) elfGoods.add(good);
      }
    });
    // One of the three leans per caravan (Troops and gear: weapons in trade become their materials).
    expect([Res.SteelIngot, Res.CarbonSteel, Res.HardenedLeather].some((r) => elfGoods.has(r))).toBe(true);
  });

  it('needs a unit within 10 m of one of their buildings; the Halflings take gold but not gems, and nobody takes earth', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.HalflingVillage, 120);
    s.players[0]!.pool[Res.Gold] = 5;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.Gold, 5] }]);
    expect(texts(s)).toContain(OUT_OF_REACH);
    // Next to one of its people but 20 m from every building is still too far (Patch 5, GP-46).
    const w = unit(s, UnitKind.Worker);
    const e = s.entities;
    const far = peopleOf(s, f.id).find((j) => structuresOf(s, f.id).every((b) => Math.hypot(e.x[b]! - e.x[j]!, e.z[b]! - e.z[j]!) > 20 * M));
    if (far !== undefined) {
      landAt(s, w, e.x[far]! + M, e.z[far]!);
      e.queue[w] = [];
      run(s, 1);
      expect(tradeProblem(s, f, 0)).toBe(OUT_OF_REACH);
    }
    bring(s, w, f);
    run(s, 1);
    expect(tradeProblem(s, f, 0)).toBe('');
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.Gold, 5] }]);
    expect(offerOf(s, f.id, 0)).toBeDefined();
    run(s, 1, [{ kind: 'tradeWithdraw', player: 0, faction: f.id }]);
    s.players[0]!.pool[Res.Emeralds] = 2;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.Emeralds, 2] }]);
    expect(texts(s)).toContain(LINES[People.Halfling].refuse);
    expect(offerOf(s, f.id, 0)).toBeUndefined();
    s.players[0]!.pool[Res.Earth] = 50;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.Earth, 50] }]);
    expect(texts(s)).toContain(LINES[People.Halfling].dirt);
    expect(offerOf(s, f.id, 0)).toBeUndefined();
  });

  it('trades a fixed worth a day per settlement, shared by every player, cutting a bigger offer down to fit', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.DwarfColony);
    bring(s, unit(s, UnitKind.Worker), f);
    const day = dailyTradeTenths(f);
    expect(day).toBeGreaterThan(0);
    s.players[0]!.pool[Res.FarmFare] = 5000;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.FarmFare, 5000] }]);
    const o = offerOf(s, f.id, 0)!;
    expect(o.worth).toBeLessThanOrEqual(day);
    expect(o.worth).toBeGreaterThan(day - 20);
    // Only what fits is offered: the rest stays with the player.
    expect(o.goods[1]!).toBeLessThan(5000);
    expect(texts(s)).toContain(LINES[People.Dwarf].trimmed);
    run(s, 1, [{ kind: 'tradeTake', player: 0, faction: f.id, bundle: 0 }]);
    expect(s.players[0]!.pool[Res.FarmFare]).toBe(5000 - o.goods[1]!);
    expect(f.bought).toBe(o.worth);
    // The day's trade is used up for everyone until dawn.
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.FarmFare, 10] }]);
    expect(offerOf(s, f.id, 0)).toBeUndefined();
    expect(texts(s)).toContain(LINES[People.Dwarf].full);
  });

  it('pays little for stone, and the Dwarves and Elves pay high for diamonds', () => {
    const s = createWorld(1);
    const dwarves = place(s, FactionKind.DwarfColony);
    const halflings = place(s, FactionKind.HalflingVillage, -80);
    expect(payPct(dwarves, Res.Stone)).toBeLessThan(payPct(dwarves, Res.Flint));
    expect(payPct(dwarves, Res.Diamonds)).toBeGreaterThan(payPct(dwarves, Res.Emeralds));
    expect(payPct(halflings, Res.Silver)).toBeGreaterThan(0);
    expect(payPct(halflings, Res.Earth)).toBe(-1);
    // The Dwarves sell stone at its full worth, five times what they pay for it.
    expect(priceTenths(dwarves, Res.Stone)).toBeGreaterThan(Math.floor((10 * payPct(dwarves, Res.Stone)) / 100));
  });

  it('turns sour on the same offer after three refusals, and opens again at dawn', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.HalflingVillage);
    bring(s, unit(s, UnitKind.Worker), f);
    s.players[0]!.pool[Res.FarmFare] = 20;
    const offer: Order = { kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.FarmFare, 20] };
    for (let k = 0; k < 3; k++) {
      run(s, 1, [offer]);
      expect(offerOf(s, f.id, 0)).toBeDefined();
      run(s, 1, [{ kind: 'tradeWithdraw', player: 0, faction: f.id }]);
    }
    run(s, 1, [offer]);
    expect(offerOf(s, f.id, 0)).toBeUndefined();
    expect(texts(s)).toContain(LINES[People.Halfling].close);
    expect(f.closedUntil[0]).toBe(UNTIL_DAWN);
    expect(tradeProblem(s, f, 0)).toBe('They will not trade with you again until dawn.');
    runUntil(s, () => clockAt(s.step).period === Period.Day && clockAt(s.step).cycle === 1, 20 * 60 * SEC);
    run(s, 2);
    expect(f.closedUntil[0]).toBe(0);
  });

  it('insults the Elves with lumber: no trade for a day', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.ElfCaravan);
    bring(s, unit(s, UnitKind.Worker), f);
    s.players[0]!.pool[Res.SoftwoodLumber] = 10;
    run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [Res.SoftwoodLumber, 10] }]);
    expect(texts(s)).toContain(LINES[People.Elf].lumber);
    expect(f.closedUntil[0]).toBeGreaterThan(s.step);
    expect(tradeProblem(s, f, 0)).toBe('They will not trade with you today.');
  });
});

describe('war', () => {
  it('starts with a declaration; the Halflings offer to surrender at half and leave their buildings to be broken down', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.HalflingVillage);
    const wr = unit(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'declareWar', player: 0, faction: f.id }]);
    expect(f.war & 1).toBe(1);
    expect(texts(s).some((t) => t.startsWith('You have declared war on'))).toBe(true);
    expect(texts(s)).toContain(LINES[People.Halfling].attacked);
    // At war, its trade is shut.
    expect(tradeProblem(s, f, 0)).toBe('You are at war with them.');
    const people = peopleOf(s, f.id);
    // Counted against those it was founded with (two archers now ride behind on the war oxen).
    const half = Math.floor(f.founded / 2) + 1;
    // Villagers first, so fighters are left (a defeat is no surrender).
    const order = [...people].sort((a, b) => Number(s.entities.kind[b] === UnitKind.Worker) - Number(s.entities.kind[a] === UnitKind.Worker));
    kill(s, order.slice(0, half), wr);
    expect(f.dead).toBe(half);
    expect(f.kills[0]).toBe(half);
    expect(f.surrender).toBe(1);
    expect(texts(s).some((t) => t.includes('offer to surrender'))).toBe(true);
    // Plunder is food and metal for the pool: the Halflings' farm fare (Patch 2: in place of bread) and wrought iron, their weapons as their metal.
    const [food, metal] = PLUNDER_GOODS[People.Halfling];
    expect([food, metal]).toEqual([Res.FarmFare, Res.WroughtIron]);
    const had = [s.players[0]!.pool[food]!, s.players[0]!.pool[metal]!];
    run(s, 1, [{ kind: 'surrender', player: 0, faction: f.id, accept: 1 }]);
    expect(f.war).toBe(0);
    expect(f.status).toBe(Status.Leaving);
    expect(s.players[0]!.pool[food]!).toBeGreaterThan(had[0]!);
    expect(s.players[0]!.pool[metal]!).toBeGreaterThan(had[1]!);
    expect(texts(s).some((t) => t.startsWith('Plunder from') && t.includes('wrought iron'))).toBe(true);
    // Its buildings stand empty.
    const e = s.entities;
    const left = factionMembers(s, f.id).filter((j) => e.kind[j] === UnitKind.Mob);
    expect(left.length).toBe(0);
    let empty = -1;
    for (let i = 0; i < e.count; i++) if (e.owner[i] === NEUTRAL && e.group[i] === f.id) empty = i;
    expect(empty).toBeGreaterThanOrEqual(0);
    runUntil(s, () => f.status === Status.Gone, 120 * SEC);
    expect(peopleOf(s, f.id).length).toBe(0);
    // A worker breaks one down for its materials. Since Patch 5 the night's waves go for the players' units out in the
    // open (MB-1), and this one stands alone 70 m out into the night, so the night stays away for it.
    s.peaceful = 1;
    const w = unit(s, UnitKind.Worker);
    landAt(s, w, e.x[empty]! + 2 * M, e.z[empty]!);
    const before = s.players[0]!.pool.reduce((a, b) => a + b, 0);
    run(s, 1, [{ kind: 'attack', player: 0, units: [e.id[w]!], target: e.id[empty]! }]);
    const id = e.id[empty]!;
    runUntil(s, () => e.indexOf(id) < 0 || e.hp[e.indexOf(id)]! <= 0, 600 * SEC);
    run(s, 2);
    expect(s.players[0]!.pool.reduce((a, b) => a + b, 0)).toBeGreaterThan(before);
  });

  it('comes on its own when a player kills one of theirs at peace', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.RunkinCamp);
    const wr = unit(s, UnitKind.Warrior);
    kill(s, [peopleOf(s, f.id)[0]!], wr);
    expect(f.war & 1).toBe(1);
    expect(texts(s).some((t) => t.startsWith('Blood has been spilt'))).toBe(true);
  });

  it('defeats the Runkin, who camp again in a cell nobody has seen', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.RunkinCamp);
    const wr = unit(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'declareWar', player: 0, faction: f.id }]);
    kill(s, fightersOf(s, f.id), wr);
    expect(texts(s).some((t) => t.endsWith('has been defeated.'))).toBe(true);
    expect(f.status).toBe(Status.Leaving);
    expect(f.toCell).toBeGreaterThan(0);
    runUntil(s, () => f.status !== Status.Leaving, 120 * SEC);
    expect(f.status).toBe(Status.Away);
    expect(recampIn(s, f.toCell)).toBe(true);
    expect(f.status).toBe(Status.Settled);
    expect(f.war).toBe(0);
    expect(peopleOf(s, f.id).length).toBeGreaterThan(0);
  });

  it('sends the Dwarves away to rebuild; they raid until paid reparations', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.DwarfColony);
    const wr = unit(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'declareWar', player: 0, faction: f.id }]);
    const people = peopleOf(s, f.id);
    const villagers = people.filter((j) => s.entities.kind[j] === UnitKind.Worker);
    const half = Math.floor(people.length / 2) + 1;
    const victims = [...villagers, ...people.filter((j) => !villagers.includes(j))].slice(0, half);
    kill(s, victims, wr);
    expect(f.status).toBe(Status.Leaving);
    expect(texts(s).some((t) => t.includes('abandoned their home'))).toBe(true);
    runUntil(s, () => f.status !== Status.Leaving, 120 * SEC);
    expect(f.status).toBe(Status.Migrated);
    // The rebuilding done, a war band of 6 comes.
    f.rebuildUntil = s.step + 1;
    f.nextAt = s.step + 1;
    run(s, 3);
    const e = s.entities;
    const band = peopleOf(s, f.id).filter((j) => e.foe[j] === 1);
    expect(band.length).toBe(6);
    expect(reparationsOwed(f, 0)).toBe(20000 + 1000 * half);
    run(s, 1, [{ kind: 'reparations', player: 0, faction: f.id }]);
    expect(f.war & 1).toBe(1);
    expect(texts(s).some((t) => t.startsWith('Reparations to'))).toBe(true);
    s.players[0]!.pool[Res.Gold] = 2000;
    run(s, 1, [{ kind: 'reparations', player: 0, faction: f.id }]);
    expect(f.war).toBe(0);
    expect(f.status).toBe(Status.Gone);
    expect(s.players[0]!.pool[Res.Gold]).toBeLessThan(2000);
    // The band, at peace again, walks home.
    run(s, 2 * SEC);
    for (const j of peopleOf(s, f.id)) expect(e.foe[j]).toBe(255);
  });

  it('is what the Elves give the third time a player cuts their trees', () => {
    const s = createWorld(1);
    const cell = s.world.layout.cell(elfKingdomCell(s));
    const x = cell.x * WU_PER_COLUMN;
    const z = cell.z * WU_PER_COLUMN;
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: FactionKind.ElfKingdom, x, z }]);
    const k = elfKingdom(s);
    expect(k.built).toBe(1);
    expect(k.x).toBe(x);
    const w = unit(s, UnitKind.Worker);
    const elf = peopleOf(s, k.id)[0]!;
    const e = s.entities;
    landAt(s, w, e.x[elf]! + 5 * M, e.z[elf]!);
    onTreeCut(s, w, e.x[w]!, e.z[w]!);
    expect(k.warnings[0]).toBe(1);
    onTreeCut(s, w, e.x[w]!, e.z[w]!);
    expect(k.warnings[0]).toBe(1);
    run(s, 20 * SEC);
    onTreeCut(s, w, e.x[w]!, e.z[w]!);
    expect(k.warnings[0]).toBe(2);
    run(s, 20 * SEC);
    onTreeCut(s, w, e.x[w]!, e.z[w]!);
    expect(k.war & 1).toBe(1);
    expect(k.nextAt).toBeGreaterThan(s.step);
  });
});

describe('caravans and mercenaries', () => {
  it('brings an Elf caravan by day to trade near the main base, gone at dusk', () => {
    const s = createWorld(1);
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: DEBUG_CARAVAN, x: 0, z: 0 }]);
    run(s, 2);
    const c = s.peoples.factions.find((f) => f.kind === FactionKind.ElfCaravan && f.visits === 0)!;
    expect(c).toBeDefined();
    const e = s.entities;
    const wagon = structuresOf(s, c.id).find((j) => e.mob[j] === Mob.ElfCaravanWagon)!;
    runUntil(s, () => Math.abs(e.x[wagon]! - c.toX) + Math.abs(e.z[wagon]! - c.toZ) < 2 * M, 120 * SEC);
    const [hx, hz] = home(s);
    expect(Math.hypot(c.x - hx, c.z - hz)).toBeLessThan(20 * M);
    // Trade with the main base's own units close by.
    const w = unit(s, UnitKind.Worker);
    landAt(s, w, c.x + 4 * M, c.z);
    e.queue[w] = [];
    run(s, 1);
    expect(tradeProblem(s, c, 0)).toBe('');
    runUntil(s, () => clockAt(s.step).period === Period.Dusk, 10 * 60 * SEC);
    run(s, 2);
    expect(c.status).toBe(Status.Leaving);
    expect(structuresOf(s, c.id).length).toBe(0);
  });

  it('sends the Elves\' caravan to a player five days after first meeting them', () => {
    // Peaceful, so nobody is overrun in the nights between.
    const s = createWorld(1, { players: 1, peaceful: true });
    const [hx, hz] = home(s);
    run(s, 1, [{ kind: 'debugPeoples', player: 0, what: DEBUG_MEET_ELVES, x: hx, z: hz }]);
    const met = s.step;
    expect(elfKingdom(s).caravanAt[0]).toBe(met - 1 + CARAVAN_EVERY_STEPS);
    const waited = runUntil(s, () => s.peoples.factions.some((f) => f.kind === FactionKind.ElfCaravan && f.visits === 0 && f.status === Status.Settled), CARAVAN_EVERY_STEPS + CYCLE_STEPS);
    // Five days on, or the next morning when that falls at night.
    expect(waited).toBeGreaterThanOrEqual(CARAVAN_EVERY_STEPS - 2);
    expect(clockAt(s.step).period === Period.Day || clockAt(s.step).period === Period.Dawn).toBe(true);
  });

  it('points the way to the nearest Dwarf city after a colony\'s first trade', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.DwarfColony);
    const w = unit(s, UnitKind.Worker);
    bring(s, w, f);
    run(s, 2);
    expect(tradeProblem(s, f, 0)).toBe('');
    const tok = trinketRes(0, 1);
    s.players[0]!.pool[tok] = 6;
    // Only the first trade names the way.
    for (const first of [true, false]) {
      run(s, 1, [{ kind: 'tradeOffer', player: 0, faction: f.id, goods: [tok, 3] }]);
      expect(offerOf(s, f.id, 0)).toBeDefined();
      run(s, 1, [{ kind: 'tradeTake', player: 0, faction: f.id, bundle: 0 }]);
      const said = texts(s).filter((t) => t.startsWith('Our kin hold a city'));
      expect(said.length).toBe(first ? 1 : 0);
      if (first) expect(said[0]).toMatch(/^Our kin hold a city in the deep dead lands: .+ from here\.$/);
    }
  });

  it('hires mercenaries for good, for silver or gold, and they take supply', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.MercCamp);
    bring(s, unit(s, UnitKind.Worker), f, 6);
    run(s, 2);
    const size = f.survivors;
    expect(size).toBeGreaterThanOrEqual(2);
    const silver = hireSilver(f);
    s.players[0]!.pool[Res.Silver] = 1;
    run(s, 1, [{ kind: 'hire', player: 0, faction: f.id, count: 2 }]);
    expect(texts(s)).toContain(`Hiring 2 costs ${2 * silver} silver; you have 1.`);
    s.players[0]!.pool[Res.Silver] = 2 * silver + 4;
    const supply = supplyUsed(s, 0);
    run(s, 1, [{ kind: 'hire', player: 0, faction: f.id, count: 1 }]);
    expect(s.players[0]!.pool[Res.Silver]).toBe(silver + 4);
    expect(texts(s)).toContain(MERC_LINES.hired);
    // Or in gold, 1 gold to 7 silver (Patch 5, BL-4).
    s.players[0]!.pool[Res.Gold] = 5;
    run(s, 1, [{ kind: 'hire', player: 0, faction: f.id, count: 1, gold: 1 }]);
    expect(s.players[0]!.pool[Res.Gold]).toBe(5 - Math.ceil(silver / 7));
    const e = s.entities;
    const hired: number[] = [];
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.role[i] === Role.Mercenary) hired.push(i);
    expect(hired.length).toBe(2);
    const hiredIds = hired.map((j) => e.id[j]!);
    expect(f.survivors).toBe(size - 2);
    expect(supplyUsed(s, 0)).toBe(supply + 2);
    // Theirs to command, and theirs still after dusk.
    const id = e.id[hired[0]!]!;
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: f.x + 20 * M, z: f.z }]);
    expect(e.queue[e.indexOf(id)]!.length).toBeGreaterThan(0);
    runUntil(s, () => clockAt(s.step).period === Period.Dusk, 10 * 60 * SEC);
    run(s, 2);
    // By id: a death elsewhere can move a unit's index.
    for (const hid of hiredIds) {
      const j = e.indexOf(hid);
      if (j >= 0 && e.hp[j]! > 0) expect(e.owner[j]).toBe(0);
    }
    expect(f.survivors).toBe(size - 2);
  });
});

describe('the Grovesingers', () => {
  it('cast their spells on monsters that come near', () => {
    const s = createWorld(1);
    const k = place(s, FactionKind.ElfKingdom, 120);
    const e = s.entities;
    const grove = peopleOf(s, k.id).find((j) => e.kind[j] === UnitKind.Mage)!;
    const full = e.mana[grove]!;
    for (let n = 0; n < 4; n++) addMob(s, Mob.Zombie, 0, e.x[grove]! + (8 + n) * M, e.z[grove]!, 3);
    runUntil(s, () => e.mana[grove]! < full, 30 * SEC);
    expect(e.mana[grove]).toBeLessThan(full);
    run(s, 30 * SEC);
    let zombies = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.owner[i] === MONSTERS && e.mob[i] === Mob.Zombie) zombies++;
    expect(zombies).toBeLessThan(4);
  });
});

describe('determinism', () => {
  it('keeps the peoples through a snapshot, mid-war, and replays to the same hash', () => {
    const play = (): SimState => {
      const s = createWorld(5);
      place(s, FactionKind.HalflingVillage);
      const d = place(s, FactionKind.DwarfColony, -70);
      place(s, FactionKind.MercCamp, 0, 70);
      run(s, 1, [{ kind: 'declareWar', player: 0, faction: d.id }]);
      run(s, 300);
      return s;
    };
    const a = play();
    const b = play();
    expect(hashState(a)).toBe(hashState(b));
    const t = deserializeState(serializeState(a));
    expect(diffStates(a, t)).toBeNull();
    run(a, 400);
    run(t, 400);
    expect(hashState(t)).toBe(hashState(a));
    // Every person still counted as one, every building as one.
    for (const f of a.peoples.factions) for (const j of peopleOf(a, f.id)) expect(isPerson(a, j)).toBe(true);
  });
});
