// Patch 5 (Jade's WD-1 to WD-7, FR-1 and CT-1): the woodsman. Trained at the
// Scholar's Lodge for food, 1 leather or 1 hides and 4 flax with his wooden
// spear; no armour, 2 less damage, his weapon upgraded only at a main base.
// He fishes (only woodsmen fish: the fishing dock is gone and workers no
// longer fish), each fish coming up on the line, and leaves a stretch half
// its fish; he takes his bag home when it cannot take another; at dusk he
// hands in and goes home. His line shows what he brought in against what he
// ate.
import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  Blocked,
  BuildingKind,
  buildingCentre,
  buildingSpec,
  CHUNK_SHIFT,
  createWorld,
  DAY_STEPS,
  deserializeState,
  Gait,
  gaitOf,
  gaitSpec,
  DUSK_STEPS,
  fromBuilding,
  hashState,
  HOME_SLACK_M,
  isFish,
  Keep,
  ledgerAdd,
  LONG_KITS,
  Line,
  lineTop,
  meleeOf,
  placeBuilding,
  placementBlocked,
  Product,
  productProblem,
  productsOf,
  productSpec,
  Res,
  RESOURCES,
  serializeState,
  step,
  STEPS_PER_SECOND,
  Troop,
  TROOP_NAMES,
  UnitKind,
  upgradesAt,
  WOODS,
  WOODSMAN,
  woodsmanLedger,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;
const NIGHT = DAY_STEPS + DUSK_STEPS;

function run(s: SimState, n: number, orders: Order[] = [], seen?: SimEvent[]): void {
  for (let k = 0; k < n; k++) {
    step(s, k === 0 ? orders : []);
    seen?.push(...s.events);
  }
}

function runUntil(s: SimState, done: () => boolean, max: number): void {
  for (let k = 0; k < max; k++) {
    if (done()) return;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A clear spot for a building beside the Big House, searching outwards. */
function besideCamp(s: SimState, kind: number): Building {
  const home = bigHouse(s);
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = home.x + 16 + dx;
        const z = home.z + dz;
        if (placementBlocked(s, 0, kind, x, z) !== Blocked.None) continue;
        return placeBuilding(s, 0, kind, 0, x, z, true);
      }
    }
  }
  throw new Error('no free spot');
}

/** Player 0's living woodsmen. */
function woodsmen(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior && e.troop[i] === Troop.Woodsman && e.hp[i]! > 0) out.push(i);
  return out;
}

interface Stretch {
  cx: number;
  cz: number;
  i: number;
  x: number;
  z: number;
}

/** The fish stretches near the Big House, nearest first (the camp's water is stocked once units are by it). */
function stretches(s: SimState): Stretch[] {
  const [hx, hz] = buildingCentre(bigHouse(s));
  const gx = Math.floor(hx / WU_PER_COLUMN) >> CHUNK_SHIFT;
  const gz = Math.floor(hz / WU_PER_COLUMN) >> CHUNK_SHIFT;
  const out: Array<Stretch & { d: number }> = [];
  for (let cz = gz - 4; cz <= gz + 4; cz++) {
    for (let cx = gx - 4; cx <= gx + 4; cx++) {
      for (const p of s.world.props(cx, cz, s.step)) {
        if (!isFish(p.kind)) continue;
        const x = ((cx << CHUNK_SHIFT) + p.lx) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
        const z = ((cz << CHUNK_SHIFT) + p.lz) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
        out.push({ cx, cz, i: p.index, x, z, d: Math.hypot(x - hx, z - hz) });
      }
    }
  }
  if (out.length === 0) throw new Error('no fish stretch near the camp');
  return out.sort((a, b) => a.d - b.d);
}

/** Fishes a stretch down to n, as if it had been fished before. */
function thin(s: SimState, f: Stretch, n: number): void {
  s.world.harvest(f.cx, f.cz, f.i, fishLeft(s, f).amount - n, s.step);
}

/** The fish a stretch keeps from a woodsman fishing by himself: half its most. */
function keepOf(s: SimState, f: Stretch): number {
  return Math.floor((fishLeft(s, f).most + 1) / 2);
}

function fishLeft(s: SimState, f: Stretch): { amount: number; most: number } {
  const v = s.world.prop(f.cx, f.cz, f.i, s.step)!;
  return { amount: v.amount, most: v.most };
}

/** A peaceful world whose camp water holds trout (40 to a stretch), its stretches seen, and a woodsman beside the Big House. */
function fishing(): { s: SimState; all: Stretch[]; f: Stretch; w: number } {
  const s = createWorld(2, { peaceful: true });
  run(s, 2 * SEC);
  const all = stretches(s);
  for (const f of all) s.world.reveal(f.x, f.z, 6 * M);
  const f = all[0]!;
  const [hx, hz] = buildingCentre(bigHouse(s));
  const w = addWarrior(s, 0, hx + 12 * M, hz, Troop.Woodsman, 1, 0);
  return { s, all, f, w };
}

describe('the woodsman (Patch 5)', () => {
  it("is trained at the Scholar's Lodge with his wooden spear, paying with hides when there is no leather", () => {
    const s = createWorld(1, { peaceful: true });
    const p = s.players[0]!;
    for (const r of RESOURCES) if (r.nutrition === 0) p.pool[r.id] = 0;
    p.pool[Res.FarmFare] = 500;
    p.pool[Res.Sticks] = 4;
    p.pool[Res.Flax] = 4;
    p.pool[Res.Hides] = 1;
    const lodge = besideCamp(s, BuildingKind.ScholarsLodge);
    expect(productsOf(lodge)[0]).toBe(Product.Woodsman);
    const spec = productSpec(Product.Woodsman);
    expect([spec.name, spec.food, spec.steps]).toEqual([TROOP_NAMES[Troop.Woodsman], WOODSMAN.food, (WOODSMAN.trainS + 20) * SEC]);
    expect(spec.pieces?.[0]).toBe(LONG_KITS[1]);
    expect(productProblem(s, lodge, Product.Woodsman)).toBe('');
    run(s, 1, [{ kind: 'produce', player: 0, building: lodge.id, product: Product.Woodsman, count: 1 }]);
    runUntil(s, () => woodsmen(s).length === 1, spec.steps + 10 * SEC);
    const e = s.entities;
    const i = woodsmen(s)[0]!;
    expect([e.wTier[i], e.aTier[i]]).toEqual([1, 0]);
    expect([p.pool[Res.Sticks], p.pool[Res.Flax], p.pool[Res.Hides]]).toEqual([0, 0, 0]);
    // His ledger opens with him: nothing in, nothing eaten.
    expect(woodsmanLedger(s, i)).toMatchObject({ brought: 0, ate: 0, keep: Keep.Yellow });
    expect(e.ledger[i]!.length).toBeGreaterThan(0);
  });

  it('hits 2 less than a spearman with the same spear, wears no armour, upgrades only at a main base, and climbs as a worker does', () => {
    const s = createWorld(1, { peaceful: true });
    const [hx, hz] = buildingCentre(bigHouse(s));
    const w = addWarrior(s, 0, hx + 8 * M, hz, Troop.Woodsman, 1, 0);
    const sp = addWarrior(s, 0, hx + 10 * M, hz, Troop.Long, 1, 0);
    expect(meleeOf(s, sp).damage - meleeOf(s, w).damage).toBe(WOODSMAN.damageLess);
    const h = { kind: 'warrior' as const, troop: Troop.Woodsman, w: 1, a: 0, s: 0, t: 0 };
    expect(lineTop(h, Line.Armour)).toBe(0);
    expect(lineTop(h, Line.Weapon)).toBeGreaterThan(1);
    expect([BuildingKind.MainBase, BuildingKind.Forge, BuildingKind.Barracks].map((k) => upgradesAt(h, k))).toEqual([true, false, false]);
    expect(upgradesAt({ ...h, troop: Troop.Long }, BuildingKind.Forge)).toBe(true);
    expect(gaitOf(s, w)).toBe(Gait.Woodsman);
    expect(gaitSpec(Gait.Woodsman).climb).toBe(gaitSpec(Gait.Worker).climb);
  });

  it('there is no fishing dock to build, and workers sent to a fish stretch are told only woodsmen fish', () => {
    const { s, f } = fishing();
    expect(buildingSpec(BuildingKind.FishingDock).live).toBe(false);
    const e = s.entities;
    let worker = -1;
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) worker = i;
    const seen: SimEvent[] = [];
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[worker]!], cx: f.cx, cz: f.cz, index: f.i }], seen);
    expect(seen.some((ev) => ev.text === "Only woodsmen fish. Train them at the Scholar's Lodge.")).toBe(true);
    const o = e.queue[worker]![0];
    expect(o?.t === 'gather' && o.cx === f.cx && o.cz === f.cz && o.i === f.i).toBe(false);
  });

  it('a woodsman fishing by himself lands fish one at a time and leaves each stretch half its fish; his catch goes in his bag', () => {
    const { s, all, w } = fishing();
    const e = s.entities;
    const id = e.id[w]!;
    // Every stretch with 3 fish to spare.
    for (const f of all) thin(s, f, keepOf(s, f) + 3);
    let catches = 0;
    run(s, 1, [{ kind: 'woods', player: 0, units: [id], what: 1, on: 1, cx: 0, cz: 0, index: -1 }]);
    expect(e.queue[w]![0]).toMatchObject({ t: 'woods', fish: 1, forage: 0 });
    // Out to the nearest stretch, a fish every 12 s while it has fish to spare.
    const until = s.step + 40 * SEC + 4 * WOODS.fishS * SEC;
    while (s.step < until) {
      step(s);
      for (const h of s.hits) if (h.look === 'catch' && h.id === id) catches++;
      for (const f of all) expect(fishLeft(s, f).amount).toBeGreaterThanOrEqual(keepOf(s, f));
    }
    expect(catches).toBeGreaterThanOrEqual(3);
    expect(all.some((f) => fishLeft(s, f).amount === keepOf(s, f))).toBe(true);
    // What he caught is in his bag: it takes 10 trout before he must take it home.
    expect(e.bag[w]).toEqual([Res.Trout, catches]);
  });

  it('a stretch the player picks is fished down to its last pair, and he goes home at dusk with his catch', () => {
    const { s, all, f, w } = fishing();
    const e = s.entities;
    const id = e.id[w]!;
    thin(s, f, 5);
    for (const g of all.slice(1)) thin(s, g, keepOf(s, g));
    run(s, 1, [{ kind: 'woods', player: 0, units: [id], what: 1, on: 1, cx: f.cx, cz: f.cz, index: f.i }]);
    runUntil(s, () => fishLeft(s, f).amount === 2, NIGHT - s.step);
    run(s, (WOODS.fishS + 2) * SEC);
    expect(fishLeft(s, f).amount).toBe(2);
    // Night: his bag goes in, on his line as food brought in, and he waits by the Big House.
    run(s, NIGHT + 60 * SEC - s.step);
    expect(e.bag[w]!.length).toBe(0);
    expect(woodsmanLedger(s, w).brought).toBeGreaterThanOrEqual(3 * 4 * RESOURCES[Res.Trout]!.nutrition);
    expect(fromBuilding(bigHouse(s), e.x[w]!, e.z[w]!)).toBeLessThanOrEqual((HOME_SLACK_M + 1) * M);
    expect(e.queue[w]![0]).toMatchObject({ t: 'woods', fish: 1 });
    // A save mid-night carries his order and his ledger.
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    expect(copy.entities.ledger[w]).toEqual(e.ledger[w]);
  });

  it('his line is red while he eats more than he brings in, green when he brings in over 3 food more every 3 meals', () => {
    const { s, w } = fishing();
    // Yellow: even.
    ledgerAdd(s, w, 8, 8);
    expect(woodsmanLedger(s, w).keep).toBe(Keep.Yellow);
    ledgerAdd(s, w, 0, 4);
    expect(woodsmanLedger(s, w).keep).toBe(Keep.Red);
    // A big catch in: far more than 3 food over 3 meals.
    ledgerAdd(s, w, 400, 0);
    expect(woodsmanLedger(s, w)).toMatchObject({ brought: 408, ate: 12, keep: Keep.Green });
    // Ten minutes on, the catch has gone out of the window (only the meals he ate since are in it).
    run(s, 10 * 60 * SEC + SEC);
    expect(woodsmanLedger(s, w).brought).toBe(0);
  });
});
