// Patch 2, round 1 (Jade): one artillery crewman, trained at the Artillery
// workshop, crews every engine; every engine rolls out with its full crew,
// and a crewman who falls is replaced by training another (the "A crewman
// fell" question). No attack of any kind uses ammunition.
import { describe, expect, it } from 'vitest';
import {
  addCrewman,
  addEngine,
  addFullCrew,
  Ask,
  BuildingKind,
  buildingCentre,
  createWorld,
  CREWMAN,
  crewSworn,
  deserializeState,
  Engine,
  ENGINE_PRODUCT,
  engineSpec,
  hashState,
  hurtUnit,
  isCrewman,
  placeBuilding,
  Product,
  productProblem,
  productsOf,
  productSpec,
  Res,
  Research,
  RESOURCES,
  serializeState,
  settleDeaths,
  spawnEngine,
  step,
  supplyNeed,
  Troop,
  TROOP_NAMES,
  UnitKind,
  WU_PER_METRE,
  type AnswerOrder,
  type Building,
  type Order,
  type SimEvent,
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

/** A peaceful world with nothing in the stock but food, so no unit asks for better kit; and an Artillery workshop beside the Big House. */
function setup(): { s: SimState; yard: Building; x: number; z: number } {
  const s = createWorld(1, { peaceful: true });
  for (const r of RESOURCES) if (r.nutrition === 0) s.players[0]!.pool[r.id] = 0;
  s.players[0]!.pool[Res.FarmFare] = 500;
  const base = bigHouse(s);
  const yard = placeBuilding(s, 0, BuildingKind.ArtilleryWorkshop, 0, base.x + 18, base.z, true);
  const [x, z] = buildingCentre(base);
  return { s, yard, x: x + 30 * M, z };
}

function crewmen(s: SimState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.entities.count; i++) if (s.entities.owner[i] === 0 && isCrewman(s, i) && s.entities.hp[i]! > 0) out.push(i);
  return out;
}

function yes(ev: SimEvent): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: 1, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res };
}

describe('the artillery crewman (Patch 2)', () => {
  it('is trained at the Artillery workshop for 30 food and 1 supply, and goes to crew the nearest engine a crewman short', () => {
    const { s, yard, x, z } = setup();
    const e = s.entities;
    expect(productsOf(yard)).toContain(Product.Crewman);
    expect(productsOf(bigHouse(s))).not.toContain(Product.Crewman);
    const spec = productSpec(Product.Crewman);
    expect([spec.name, spec.food, spec.cost, spec.steps]).toEqual([TROOP_NAMES[Troop.Crew], CREWMAN.food, [], CREWMAN.seconds * SEC]);
    expect(supplyNeed(Product.Crewman)).toBe(1);
    expect(productProblem(s, yard, Product.Crewman)).toBe('');
    // A ballista with nobody by it, and a catapult a crewman short.
    const far = addEngine(s, 0, Engine.Ballista, x + 40 * M, z);
    const cat = addEngine(s, 0, Engine.Catapult, x, z);
    const first = addCrewman(s, 0, x + 2 * M, z, cat);
    const firstId = e.id[first]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: yard.id, product: Product.Crewman, count: 1 }]);
    runUntil(s, () => crewmen(s).length === 2, CREWMAN.seconds * SEC + 10);
    const c = crewmen(s).find((i) => e.id[i] !== firstId)!;
    expect(e.troop[c]).toBe(Troop.Crew);
    expect(e.wTier[c]).toBe(0);
    expect(e.aTier[c]).toBe(0);
    // The catapult is nearer the workshop than the ballista: he fills it.
    expect(crewSworn(s, cat).length).toBe(2);
    expect(crewSworn(s, far).length).toBe(0);
    // No kit to upgrade: Upgrade equipment leaves him at his engine.
    run(s, 1, [{ kind: 'upgradeEquipment', player: 0, units: [e.id[c]!] }]);
    expect(e.queue[c]![0]).toEqual({ t: 'crew', id: e.id[cat]! });
  });

  it('every engine made rolls out with its full crew, their food paid with it', () => {
    const { s, yard } = setup();
    const e = s.entities;
    const p = s.players[0]!;
    bigHouse(s).level = 3;
    p.research |= 1 << Research.SiegeEngines;
    const product = ENGINE_PRODUCT + Engine.Catapult;
    expect(productSpec(product).food).toBe(engineSpec(Engine.Catapult).crew * CREWMAN.food);
    expect(supplyNeed(product)).toBe(2);
    expect(productProblem(s, yard, product)).toMatch(/^Not enough resources/);
    for (const [r, n] of engineSpec(Engine.Catapult).cost) p.pool[r === Res.AnyLumber ? Res.SoftwoodLumber : r] = n;
    expect(productProblem(s, yard, product)).toBe('');
    run(s, 1, [{ kind: 'produce', player: 0, building: yard.id, product, count: 1 }]);
    let cat = -1;
    runUntil(s, () => {
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Engine && e.owner[i] === 0) cat = i;
      return cat >= 0;
    }, engineSpec(Engine.Catapult).steps + 10);
    expect(crewSworn(s, cat).map((j) => isCrewman(s, j))).toEqual([true, true]);
    expect(s.events.some((ev) => ev.text === 'A catapult is ready, with its 2 crewmen. Its crew push it, or hitch a horse or an ox to haul it faster.')).toBe(true);
    // An iron cannon reads "An".
    spawnEngine(s, yard, Engine.IronCannon);
    expect(s.events.at(-1)?.text).toBe('An iron cannon is ready, with its 2 crewmen. Its crew push it, or hitch a horse or an ox to haul it faster.');
  });

  it('a crewman falls: the engine asks for another, and Yes trains one at the nearest Artillery workshop who joins that engine', () => {
    const { s, yard, x, z } = setup();
    const e = s.entities;
    const gun = addEngine(s, 0, Engine.BronzeCannon, x, z);
    addFullCrew(s, gun);
    // A second engine nearer the workshop is short too: the new crewman still goes to the one that asked.
    const [yx, yz] = buildingCentre(yard);
    const near = addEngine(s, 0, Engine.Ballista, yx, yz + 12 * M);
    expect(crewSworn(s, gun).length).toBe(2);
    const fallen = crewSworn(s, gun)[0]!;
    hurtUnit(s, fallen, { damage: 10000, from: 0, projectile: false, blunt: false, pierce: false, roll: 0 });
    settleDeaths(s);
    const ev = s.events.find((x) => x.kind === 'question' && !x.ask!.closed && x.ask!.q === Ask.Crew)!;
    expect(ev).toBeDefined();
    expect(ev.text).toBe('A crewman fell. Train another?');
    expect(ev.speaker).toBe(e.id[gun]);
    run(s, 1, [yes(ev)]);
    expect(yard.queue.map((q) => [q.product, q.engine])).toEqual([[Product.Crewman, e.id[gun]]]);
    // The queued item and the engine it is for survive a save.
    const copy = deserializeState(serializeState(s));
    expect(copy.buildings.get(yard.id)!.queue[0]!.engine).toBe(e.id[gun]);
    expect(hashState(copy)).toBe(hashState(s));
    runUntil(s, () => crewSworn(s, gun).length === 2, CREWMAN.seconds * SEC + 10);
    expect(crewSworn(s, near).length).toBe(0);
  });

  it('crewmen selected with their engine stay with it; Hunt leaves them out', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const cat = addEngine(s, 0, Engine.Catapult, x, z);
    addFullCrew(s, cat);
    const crew = crewSworn(s, cat).map((j) => e.id[j]!);
    run(s, 1, [{ kind: 'move', player: 0, units: [e.id[cat]!, ...crew], x: x + 10 * M, z }]);
    for (const id of crew) expect(e.queue[e.indexOf(id)]![0]).toEqual({ t: 'crew', id: e.id[cat]! });
    // Alone, they go where they are sent.
    run(s, 1, [{ kind: 'move', player: 0, units: crew.slice(0, 1), x: x - 10 * M, z }]);
    expect(e.queue[e.indexOf(crew[0]!)]![0]?.t).toBe('move');
    run(s, 1, [{ kind: 'hunt', player: 0, units: crew, target: 0, auto: 1 }]);
    for (const id of crew) expect(e.queue[e.indexOf(id)]![0]?.t).not.toBe('hunt');
  });
});
