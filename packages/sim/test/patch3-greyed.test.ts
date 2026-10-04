// Patch 3: a click on a greyed-out button. The units and buildings best
// placed to sort out each reason it is greyed ask their owner, all at once,
// in the question bubbles; Yes runs the order the matching button runs.
// None of it is state.
import { describe, expect, it } from 'vitest';
import {
  Ask,
  buildingCentre,
  BuildingKind,
  createWorld,
  GREY_ASKS_MAX,
  GreyAsk,
  Greyed,
  hashState,
  Made,
  nodeResource,
  openQuestions,
  placeBuilding,
  Product,
  RECIPE_PRODUCT,
  RECIPES,
  Res,
  Research,
  RESEARCH_PRODUCT,
  RESOURCES,
  step,
  Troop,
  troopProduct,
  UnitKind,
  validateOrder,
  WU_PER_METRE,
  type AnswerOrder,
  type Building,
  type GreyedOrder,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

function units(s: SimState, kind: number, owner = 0): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === owner && e.kind[i] === kind) out.push(i);
  return out;
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A peaceful world with nothing in the stock but food, so no unit asks for better kit by itself. */
function plainWorld(): SimState {
  const s = createWorld(1, { peaceful: true });
  for (const r of RESOURCES) if (r.nutrition === 0) s.players[0]!.pool[r.id] = 0;
  return s;
}

/** The questions a step's orders raised. */
function asked(s: SimState, orders: Order[]): SimEvent[] {
  step(s, orders);
  return s.events.filter((x) => x.kind === 'question' && !x.ask!.closed);
}

function click(what: number, id: number, building = 0, ids: number[] = []): GreyedOrder {
  return { kind: 'greyed', player: 0, what, id, building, units: ids };
}

function yes(ev: SimEvent): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: 1, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res, ...(a.n !== undefined ? { n: a.n } : {}) };
}

/** The selected workers, as the client sends them with a build menu click. */
function workerIds(s: SimState): number[] {
  return units(s, UnitKind.Worker).map((i) => s.entities.id[i]!);
}

/** A finished building of a kind beside the Big House. */
function beside(s: SimState, kind: number, dx = 18): Building {
  const base = bigHouse(s);
  return placeBuilding(s, 0, kind, 0, base.x + dx, base.z, true);
}

describe('a click on a greyed-out building (Patch 3)', () => {
  it('asks for both reasons at once: the main base to go up a level, and a worker to gather what is short', () => {
    const s = plainWorld();
    const pool = s.players[0]!.pool;
    // The Longhall is paid for; the Barracks needs it and 20 sticks.
    pool[Res.SoftwoodLumber] = 300;
    pool[Res.Stone] = 300;
    const qs = asked(s, [click(Greyed.Building, BuildingKind.Barracks, 0, workerIds(s))]);
    expect(qs.map((x) => x.ask!.q).sort()).toEqual([GreyAsk.Gather, GreyAsk.Upgrade].sort());
    const up = qs.find((x) => x.ask!.q === GreyAsk.Upgrade)!;
    expect(up.building).toBe(bigHouse(s).id);
    expect(up.text).toBe('We need a level 2 main base for the Barracks. Upgrade to Longhall?');
    expect(up.ask!.yes).toContain('From the stock now: 100 softwood lumber, 40 stone.');
    const gather = qs.find((x) => x.ask!.q === GreyAsk.Gather)!;
    expect(gather.text).toBe('We need 20 more hardwood sticks for the Barracks. Shall I go and gather some?');
    expect(gather.ask!.res).toBe(Res.Sticks);
    expect(s.entities.kind[s.entities.indexOf(gather.speaker!)]).toBe(UnitKind.Worker);
    // Yes to both: the Big House starts its upgrade, the worker goes for sticks.
    step(s, [yes(up), yes(gather)]);
    expect(bigHouse(s).upgrading).toBe(2);
    const i = s.entities.indexOf(gather.speaker!);
    const o = s.entities.queue[i]![0]!;
    expect(o.t).toBe('gather');
    if (o.t === 'gather') {
      const p = s.world.props(o.cx, o.cz, s.step).find((x) => x.index === o.i)!;
      expect(nodeResource(p.kind)).toBe(Res.Sticks);
    }
    expect(openQuestions(s).length).toBe(0);
  });

  it('goes down to what stops the answer: the upgrade short of stone asks a worker for the stone', () => {
    const s = plainWorld();
    s.players[0]!.pool[Res.SoftwoodLumber] = 300;
    s.players[0]!.pool[Res.Sticks] = 50;
    const qs = asked(s, [click(Greyed.Building, BuildingKind.Barracks, 0, workerIds(s))]);
    // The Barracks's own stone (40) is the same cause as the Longhall's (40): one question for both.
    expect(qs.map((x) => [x.ask!.q, x.ask!.res])).toEqual([[GreyAsk.Gather, Res.Stone]]);
    expect(qs[0]!.text).toBe('We need 80 more stone for the Barracks and the Longhall. Shall I go and gather some?');
  });

  it('asks nothing when nobody can sort it out, and never more than its cap', () => {
    const s = plainWorld();
    // A Mineshaft: a level 4 main base, Deep Mining I (no research building), bronze ingots (no Forge), hardwood and stone.
    const qs = asked(s, [click(Greyed.Building, BuildingKind.Mineshaft, 0, workerIds(s))]);
    expect(qs.length).toBeLessThanOrEqual(GREY_ASKS_MAX);
    expect(qs.every((x) => x.ask!.q === GreyAsk.Gather)).toBe(true);
    expect(new Set(qs.map((x) => x.speaker)).size).toBe(qs.length);
  });

  it('does nothing for the same click while its questions are up, and a new click ends them', () => {
    const s = plainWorld();
    const first = asked(s, [click(Greyed.Building, BuildingKind.Forge, 0, workerIds(s))]);
    expect(first.length).toBeGreaterThan(0);
    expect(asked(s, [click(Greyed.Building, BuildingKind.Forge, 0, workerIds(s))])).toEqual([]);
    step(s, [click(Greyed.Building, BuildingKind.Workshop, 0, workerIds(s))]);
    const ended = s.events.filter((x) => x.kind === 'question' && x.ask!.closed).map((x) => x.ask!.id);
    for (const q of first) expect(ended).toContain(q.ask!.id);
  });

  it('is not state: a click and its questions leave the hash as it was', () => {
    const a = plainWorld();
    const b = plainWorld();
    step(a, [click(Greyed.Building, BuildingKind.Barracks, 0, workerIds(a))]);
    step(b);
    expect(openQuestions(a).length).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('a click on a building\'s greyed-out button (Patch 3)', () => {
  it('has the building that makes a missing good offer to make it: planks for a hand cart, at the Workshop itself', () => {
    const s = plainWorld();
    bigHouse(s).level = 3;
    s.players[0]!.pool[Res.HardwoodLumber] = 100;
    s.players[0]!.pool[Res.SoftwoodLumber] = 100;
    const shop = beside(s, BuildingKind.Workshop);
    const cart = RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Hand cart');
    const qs = asked(s, [click(Greyed.Product, cart, shop.id)]);
    expect(qs.length).toBe(1);
    const make = qs[0]!;
    expect([make.ask!.q, make.building, make.ask!.res, make.ask!.n]).toEqual([GreyAsk.Make, shop.id, Res.Planks, 5]);
    expect(make.text).toBe('We need 6 more planks for the hand cart. Shall I make 5?');
    step(s, [yes(make)]);
    expect(shop.queue.map((q) => q.product)).toEqual(Array.from({ length: 5 }, () => RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Planks from softwood')));
  });

  it('has a worker offer to gather what a recipe is short of', () => {
    const s = plainWorld();
    const shop = beside(s, BuildingKind.Workshop);
    const planks = RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Planks from softwood');
    const qs = asked(s, [click(Greyed.Product, planks, shop.id)]);
    expect(qs.map((x) => [x.ask!.q, x.ask!.res])).toEqual([[GreyAsk.Gather, Res.SoftwoodLumber]]);
    expect(qs[0]!.text).toBe('We need 1 more softwood lumber for the planks from softwood. Shall I go and gather some?');
  });

  it('has the Scholar\'s Lodge offer research a recipe needs, and Yes queues it there', () => {
    const s = plainWorld();
    const p = s.players[0]!;
    p.made |= Made.TinIngot;
    p.pool[Res.CopperIngot] = 20;
    p.pool[Res.TinIngot] = 2;
    const forge = beside(s, BuildingKind.Forge);
    const lodge = beside(s, BuildingKind.ScholarsLodge, -14);
    const bronze = RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Bronze ingots (10)');
    const qs = asked(s, [click(Greyed.Product, bronze, forge.id)]);
    expect(qs.map((x) => [x.ask!.q, x.building])).toEqual([[GreyAsk.Research, lodge.id]]);
    expect(qs[0]!.text).toBe('We need Bronze research for the bronze ingots. Shall I start it?');
    step(s, [yes(qs[0]!)]);
    expect(lodge.queue.map((q) => q.product)).toEqual([RESEARCH_PRODUCT + Research.Bronze]);
  });

  it('has a worker whose tools cannot break copper ore offer the cheapest tools that can, then go for it', () => {
    const s = plainWorld();
    const p = s.players[0]!;
    // Enough for stone and flint tools (6 sticks, 1 flint, 5 stone) and the fuel; plenty of ingots for better ones.
    p.pool[Res.Sticks] = 6;
    p.pool[Res.Flint] = 1;
    p.pool[Res.Stone] = 5;
    p.pool[Res.SoftwoodLumber] = 50;
    p.pool[Res.CopperIngot] = 20;
    p.pool[Res.HardwoodLumber] = 20;
    const forge = beside(s, BuildingKind.Forge);
    const copper = RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Copper ingot');
    const qs = asked(s, [click(Greyed.Product, copper, forge.id)]);
    expect(qs.map((x) => [x.ask!.q, x.ask!.res])).toEqual([[GreyAsk.Tools, Res.CopperOre]]);
    expect(qs[0]!.text).toBe("We need 2 more copper ore for the copper ingot, and my tools can't break it. Shall I make stone and flint tools and go and gather some?");
    expect(qs[0]!.ask!.yes).toContain('From the stock now: 6 hardwood sticks, 1 flint, 5 stone.');
    step(s, [yes(qs[0]!)]);
    const i = s.entities.indexOf(qs[0]!.speaker!);
    const [up, gather] = s.entities.queue[i]!;
    expect(up).toMatchObject({ t: 'kitUp', to: 2, paid: 1 });
    expect(gather?.t).toBe('gather');
    if (gather?.t === 'gather') expect(nodeResource(s.world.props(gather.cx, gather.cz, s.step).find((x) => x.index === gather.i)!.kind)).toBe(Res.CopperOre);
    expect([p.pool[Res.Sticks], p.pool[Res.Flint], p.pool[Res.Stone], p.pool[Res.CopperIngot]]).toEqual([0, 0, 0, 20]);
  });

  it('asks the main base to upgrade for its own greyed Upgrade only through what it is short of', () => {
    const s = plainWorld();
    const qs = asked(s, [click(Greyed.Upgrade, 0, bigHouse(s).id)]);
    // The Longhall needs softwood and stone: workers for each.
    expect(qs.map((x) => [x.ask!.q, x.ask!.res]).sort()).toEqual([
      [GreyAsk.Gather, Res.SoftwoodLumber],
      [GreyAsk.Gather, Res.Stone],
    ]);
    expect(qs[0]!.text).toMatch(/for the Longhall\. Shall I go and gather some\?$/);
  });

  it('sends idle warriors hunting for food a troop needs, one speaking for those round it', () => {
    const s = plainWorld();
    const p = s.players[0]!;
    for (const r of RESOURCES) if (r.nutrition > 0) p.pool[r.id] = 0;
    p.pool[Res.Sticks] = 50;
    p.pool[Res.HardwoodLumber] = 50;
    p.pool[Res.Leather] = 50;
    const product = troopProduct(Troop.Close, 1, 0);
    const qs = asked(s, [click(Greyed.Product, product, bigHouse(s).id)]);
    const hunt = qs.find((x) => x.ask!.q === GreyAsk.Hunt)!;
    expect(hunt.text).toMatch(/^We need 30 more food for training\. Shall (we|I) go hunting\?$/);
    const warriors = units(s, UnitKind.Warrior).map((i) => s.entities.id[i]!);
    for (const id of hunt.ask!.units) expect(warriors).toContain(id);
    step(s, [yes(hunt)]);
    for (const id of hunt.ask!.units) expect(s.entities.queue[s.entities.indexOf(id)]![0]!.t).toBe('hunt');
  });

  it('keeps the Patch 2 questions as they were, and these out of their numbers', () => {
    for (const q of Object.values(GreyAsk)) expect(Object.values(Ask)).not.toContain(q);
    expect(Product.Worker).toBe(0);
  });

  it('checks the click and the answer\'s count like every order', () => {
    expect(() => validateOrder(click(Greyed.Building, BuildingKind.Forge))).not.toThrow();
    expect(() => validateOrder(click(3, 0))).toThrow();
    expect(() => validateOrder({ kind: 'answer', player: 0, ask: 1, yes: 1, q: GreyAsk.Make, who: 1, units: [], res: Res.Planks, n: 5 })).not.toThrow();
    expect(() => validateOrder({ kind: 'answer', player: 0, ask: 1, yes: 1, q: GreyAsk.Make, who: 1, units: [], res: Res.Planks, n: 500 })).toThrow();
  });
});

describe('the anchor of a click', () => {
  it('asks the worker nearest the selection first', () => {
    const s = plainWorld();
    const e = s.entities;
    const ws = units(s, UnitKind.Worker);
    // Move one worker far off; select it alone: it is asked, if it can reach softwood.
    const far = ws[0]!;
    const [bx, bz] = buildingCentre(bigHouse(s));
    e.x[far] = bx + 20 * M;
    e.z[far] = bz + 20 * M;
    const qs = asked(s, [click(Greyed.Building, BuildingKind.Workshop, 0, [e.id[far]!])]);
    const soft = qs.find((x) => x.ask!.res === Res.SoftwoodLumber);
    expect(soft?.speaker).toBe(e.id[far]);
  });
});
