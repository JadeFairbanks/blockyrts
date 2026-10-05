// Loot, Hunt, Gather and guards (Jade's play-test notes, 2026-10-03).
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addEngine,
  addMob,
  bagEmpty,
  bagItems,
  bagTenthsLb,
  beyondReach,
  BuildingKind,
  buildingCentre,
  canLoot,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  dropLoot,
  DUSK_STEPS,
  Engine,
  exploreTarget,
  FOG_TILE_COLUMNS,
  fromBuilding,
  hashState,
  HOME_SLACK_M,
  homeOf,
  hurtUnit,
  LOOT_BAG_TENTHS_LB,
  lootBrag,
  Mob,
  MONSTERS,
  Res,
  serializeState,
  Species,
  step,
  UnitKind,
  WILD,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Drop,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const NIGHT_START = DAY_STEPS + DUSK_STEPS;

function run(s: SimState, n: number, orders: Order[] = [], seen?: SimEvent[]): void {
  step(s, orders);
  seen?.push(...s.events);
  for (let k = 1; k < n; k++) {
    step(s);
    seen?.push(...s.events);
  }
}

function runUntil(s: SimState, done: () => boolean, max: number, seen?: SimEvent[]): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
    seen?.push(...s.events);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

function own(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind) out.push(i);
  return out;
}

/** A point `d` wu from unit i, straight out from the Big House. */
function outFrom(s: SimState, i: number, d: number): [number, number] {
  const [bx, bz] = buildingCentre(bigHouse(s));
  const e = s.entities;
  const dx = e.x[i]! - bx;
  const dz = e.z[i]! - bz;
  const len = Math.hypot(dx, dz) || 1;
  return [Math.round(e.x[i]! + (dx / len) * d), Math.round(e.z[i]! + (dz / len) * d)];
}

/** Whether the fog tile under a point (wu) has been explored. */
function isExploredAt(s: SimState, x: number, z: number): boolean {
  const tile = WU_PER_COLUMN * FOG_TILE_COLUMNS;
  return s.world.isExplored(Math.floor(x / tile), Math.floor(z / tile));
}

const GUARD_LINES = ['Leave our worker alone!', 'Hands off our worker!', "I've got you, hold on!", 'Over here, you brute!'];

const speech = (seen: SimEvent[], unit?: number): SimEvent[] => seen.filter((ev) => ev.kind === 'speech' && (unit === undefined || ev.speaker === unit));
const meatIn = (s: SimState, i: number): number => bagItems(s, i).find(([r]) => r === Res.Venison)?.[1] ?? 0;

describe('loot from kills', () => {
  it('goes into the killer\'s 25 lb bag, then to its side\'s units beside it, and the rest lies on the ground for its side', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    // 200 silver weighs 200 lb: far more than the bags beside the kill hold.
    dropLoot(s, e.x[a]!, e.z[a]!, [[Res.Bone, 2], [Res.Silver, 200]], { killer: a, owner: 0, brag: 0, src: 0 });
    expect(bagItems(s, a).find(([r]) => r === Res.Bone)?.[1]).toBe(2);
    expect(bagTenthsLb(s, a)).toBeLessThanOrEqual(LOOT_BAG_TENTHS_LB);
    let carried = 0;
    for (let i = 0; i < e.count; i++) carried += bagItems(s, i).find(([r]) => r === Res.Silver)?.[1] ?? 0;
    const ground = s.loot.filter((l) => l.res === Res.Silver);
    expect(ground.length).toBe(1);
    expect(ground[0]!.owner).toBe(0);
    expect(ground[0]!.by).toBe(e.id[a]);
    expect(carried + ground[0]!.amt).toBe(200);
  });

  it('is picked up by an idle unit nearby when it is safe, and handed in at the main base in the day', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    const [lx, lz] = outFrom(s, a, 8 * M);
    dropLoot(s, lx, lz, [[Res.Hides, 3]], { killer: -1, owner: 0, brag: 0, src: 0 });
    expect(s.loot.length).toBe(1);
    const hides = s.players[0]!.pool[Res.Hides]!;
    runUntil(s, () => s.loot.length === 0, 600);
    runUntil(s, () => s.players[0]!.pool[Res.Hides] === hides + 3, 1500);
    // Each one goes back to where it stood and is idle again.
    runUntil(s, () => own(s, UnitKind.Warrior).every((i) => e.queue[i]!.length === 0), 1500);
  });

  it('at dusk and at night is picked up by itself only right beside a unit, and kept until dawn', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = DAY_STEPS + 20;
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    const [nx, nz] = outFrom(s, a, 3 * M);
    const [fx, fz] = outFrom(s, a, 12 * M);
    dropLoot(s, nx, nz, [[Res.Bone, 1]], { killer: -1, owner: 0, brag: 0, src: 0 });
    dropLoot(s, fx, fz, [[Res.Feathers, 2]], { killer: -1, owner: 0, brag: 0, src: 0 });
    const bone = s.players[0]!.pool[Res.Bone]!;
    run(s, 200);
    expect(s.loot.some((l) => l.res === Res.Bone)).toBe(false);
    expect(s.loot.some((l) => l.res === Res.Feathers)).toBe(true);
    expect(s.players[0]!.pool[Res.Bone]).toBe(bone);
    let held = 0;
    for (let i = 0; i < e.count; i++) held += bagItems(s, i).find(([r]) => r === Res.Bone)?.[1] ?? 0;
    expect(held).toBe(1);
  });

  it('is never picked up by a cannon: it needs its crew', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [bx, bz] = buildingCentre(bigHouse(s));
    const c = addEngine(s, 0, Engine.BronzeCannon, bx + 14 * M, bz);
    expect(canLoot(s, c)).toBe(false);
    // Anyone's loot: no unit of the side beside it takes it.
    dropLoot(s, e.x[c]!, e.z[c]! + 6 * M, [[Res.Venison, 2]], { killer: c, owner: -1, brag: 0, src: 0 });
    expect(bagEmpty(s, c)).toBe(true);
    run(s, 1, [{ kind: 'pickUp', player: 0, units: [e.id[c]!], target: s.loot[0]!.id }]);
    expect(s.events.some((ev) => ev.kind === 'alert' && ev.text.startsWith('Only living units pick up loot'))).toBe(true);
  });

  it('right-clicked, it sends the nearest selected units with room, as many as it takes to carry it all', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    const [lx, lz] = outFrom(s, a, 6 * M);
    // 30 meat is 75 lb: three bags' worth.
    dropLoot(s, lx, lz, [[Res.Venison, 30]], { killer: -1, owner: -1, brag: 0, src: 0 });
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Venison, on: 1 }]);
    const id = s.loot[0]!.id;
    const all: number[] = [];
    for (let i = 0; i < e.count; i++) if (e.owner[i] === 0) all.push(e.id[i]!);
    run(s, 1, [{ kind: 'pickUp', player: 0, units: all, target: id }]);
    const going = all.filter((u) => e.queue[e.indexOf(u)]![0]?.t === 'loot');
    expect(going.length).toBe(3);
    runUntil(s, () => s.loot.length === 0, 800);
    let meat = 0;
    for (let i = 0; i < e.count; i++) meat += meatIn(s, i);
    // Some may already be in the pool: idle units hand loot in during the day.
    expect(meat).toBeGreaterThan(0);
  });
});

describe('what units say about loot', () => {
  it('always remarks on a rare or a boss\'s drop with an exclamation, an ordinary find now and then; both are bubbles only', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    dropLoot(s, e.x[a]!, e.z[a]!, [[Res.Rubies, 1], [Res.Gold, 4]], { killer: a, owner: 0, brag: 1, src: Mob.Morvath + 1 });
    const brag = speech(s.events, e.id[a]).at(-1)!;
    expect(brag.text).toBe('A ruby and 4 gold from Morvath!');
    expect(brag.quiet).toBe(true);
    s.events = [];
    for (let k = 0; k < 40; k++) dropLoot(s, e.x[a]!, e.z[a]!, [[Res.Bone, 1]], { killer: a, owner: 0, brag: 0, src: 0 });
    expect(speech(s.events).every((ev) => ev.quiet === true)).toBe(true);
  });

  it('weighs a find against what that creature usually drops', () => {
    const drops: Drop[] = [
      { res: Res.Silver, chancePm: 500, min: 1, max: 2 },
      { res: Res.Rubies, chancePm: 20, min: 1, max: 1 },
    ];
    expect(lootBrag(drops, { items: [], rarestPm: 1000 }, false)).toBe(0);
    expect(lootBrag(drops, { items: [[Res.Silver, 1]], rarestPm: 500 }, false)).toBe(0);
    // A ruby comes one kill in fifty: always worth a word.
    expect(lootBrag(drops, { items: [[Res.Rubies, 1]], rarestPm: 20 }, false)).toBe(1);
    // Anything from a rare and powerful monster is.
    expect(lootBrag(drops, { items: [[Res.Silver, 1]], rarestPm: 500 }, true)).toBe(1);
    // Far more silver than it usually gives.
    expect(lootBrag(drops, { items: [[Res.Silver, 30]], rarestPm: 500 }, false)).toBe(1);
  });
});

describe('Hunt', () => {
  it('reaches only as far as a hunter can walk home from in dusk\'s 40 s, plus 4 m', () => {
    const s = createWorld(1, { peaceful: true });
    const a = own(s, UnitKind.Warrior)[0]!;
    const h = homeOf(s, a)!;
    const b = bigHouse(s);
    expect(h.b).toBe(b);
    expect(h.reach).toBeGreaterThan(HOME_SLACK_M * M);
    // Never more than the straight walk home in 40 s.
    expect(h.reach).toBeLessThanOrEqual(HOME_SLACK_M * M + Math.floor((s.entities.speed[a]! * DUSK_STEPS * 1000) / 1000));
    const [bx, bz] = buildingCentre(b);
    let x = bx;
    while (fromBuilding(b, x, bz) <= h.reach) x += M / 4;
    expect(beyondReach(s, a, x, bz)).toBe(true);
    expect(beyondReach(s, a, x - M / 2, bz)).toBe(false);
  });

  it('sends the warriors out after game; they bring the meat home and are back by the main base when night falls, and out again in the day', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    s.step = DAY_STEPS - 70 * 20;
    const b = bigHouse(s);
    const [bx, bz] = buildingCentre(b);
    addAnimal(s, Species.Deer, WILD, bx + 18 * M, bz + 6 * M, 0, 0);
    const hunters = own(s, UnitKind.Warrior).map((i) => e.id[i]!);
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Venison, on: 1 }]);
    const meat = s.players[0]!.pool[Res.Venison]!;
    const seen: SimEvent[] = [];
    run(s, 1, [{ kind: 'hunt', player: 0, units: hunters, target: 0, auto: 1 }], seen);
    runUntil(s, () => s.step >= NIGHT_START, 3000, seen);
    // Every hunter still standing (a boar fights back) is home: within 4 m of the main base.
    const home = hunters.map((id) => e.indexOf(id)).filter((i) => i >= 0);
    expect(home.length).toBeGreaterThan(0);
    for (const i of home) {
      expect(fromBuilding(b, e.x[i]!, e.z[i]!)).toBeLessThanOrEqual(HOME_SLACK_M * M + M / 2);
      expect(e.queue[i]![0]?.t).toBe('hunt');
    }
    expect(speech(seen).some((ev) => ev.text === 'Spotted a deer.' && ev.quiet)).toBe(true);
    expect(speech(seen).some((ev) => ev.text === 'Getting dark. Heading home.' && ev.quiet)).toBe(true);
    expect(s.players[0]!.pool[Res.Venison]).toBeGreaterThan(meat);
    // Out again at daybreak.
    s.step = CYCLE_STEPS - 2;
    const morning: SimEvent[] = [];
    run(s, 40, [], morning);
    expect(speech(morning).some((ev) => ev.text === 'Back to the hunt.')).toBe(true);
  });

  it('a right-clicked animal is hunted alone: the hunt ends with it', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    const [x, z] = outFrom(s, a, 6 * M);
    const hare = addAnimal(s, Species.Hare, WILD, x, z, 0, 0);
    const id = e.id[hare]!;
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: id, auto: 0 }]);
    runUntil(s, () => e.indexOf(id) < 0, 1500);
    runUntil(s, () => e.queue[a]!.every((o) => o.t !== 'hunt'), 600);
  });
});

describe('Gather', () => {
  it('sends workers to fetch what the camp needs, and home to the main base at dusk (no troop near them), out again in the day', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    s.step = DAY_STEPS - 60 * 20;
    const b = bigHouse(s);
    // The start's warriors far off, so no troop stands within 50 m and dusk sends the workers home without asking (Jade's Patch 4).
    for (const w of own(s, UnitKind.Warrior)) e.x[w] = e.x[w]! + 150 * M;
    const workers = own(s, UnitKind.Worker).slice(0, 2);
    const seen: SimEvent[] = [];
    run(s, 1, [{ kind: 'forage', player: 0, units: workers.map((i) => e.id[i]!) }], seen);
    run(s, 40, [], seen);
    for (const i of workers) {
      expect(e.queue[i]![0]?.t).toBe('gather');
      expect(e.queue[i]![1]?.t).toBe('forage');
    }
    expect(speech(seen).some((ev) => ev.text.startsWith('Off to gather ') && ev.quiet)).toBe(true);
    runUntil(s, () => s.step >= NIGHT_START, 2000, seen);
    for (const i of workers) expect(e.inside[i] === b.id || fromBuilding(b, e.x[i]!, e.z[i]!) <= HOME_SLACK_M * M).toBe(true);
    expect(speech(seen).some((ev) => /^(Getting dark|Dusk already|Back to the base)/.test(ev.text) && ev.quiet)).toBe(true);
    s.step = CYCLE_STEPS - 2;
    run(s, 60);
    for (const i of workers) {
      expect(e.inside[i]).toBe(0);
      expect(e.queue[i]!.some((o) => o.t === 'forage')).toBe(true);
    }
  });

  it('looks out at the edge of the explored land, never more than 25 m into the unknown', () => {
    const s = createWorld(1, { peaceful: true });
    const w = own(s, UnitKind.Worker)[0]!;
    const h = homeOf(s, w)!;
    for (const from of [0, 16384, 32768, 49152]) {
      const t = exploreTarget(s, h, from);
      expect(t).not.toBeNull();
      if (!t) continue;
      // Within reach of home, and within 25 m (and a tile) of explored land.
      expect(fromBuilding(h.b, t.x, t.z)).toBeLessThanOrEqual(h.reach + 2 * M);
      let near = false;
      for (let dz = -27; dz <= 27 && !near; dz += 1) for (let dx = -27; dx <= 27 && !near; dx += 1) if (dx * dx + dz * dz <= 27 * 27 && isExploredAt(s, t.x + dx * M, t.z + dz * M)) near = true;
      expect(near).toBe(true);
    }
  });
});

describe('guards', () => {
  it('an idle warrior near a worker under attack says so and goes for the attacker', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    run(s, 1);
    const w = own(s, UnitKind.Worker)[0]!;
    const z = addMob(s, Mob.Zombie, 0, e.x[w]! + 2 * M, e.z[w]!, 0);
    hurtUnit(s, w, { damage: 1, from: e.id[z]!, projectile: false, blunt: false, pierce: false });
    const lines = speech(s.events).filter((ev) => GUARD_LINES.includes(ev.text));
    expect(lines.length).toBe(1);
    const guards = own(s, UnitKind.Warrior).filter((i) => e.target[i] === e.id[z]);
    expect(guards.length).toBeGreaterThan(0);
    expect(e.owner[z]).toBe(MONSTERS);
  });
});

describe('saves', () => {
  it('keeps bags and loot on the ground through a snapshot', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const a = own(s, UnitKind.Warrior)[0]!;
    dropLoot(s, e.x[a]!, e.z[a]!, [[Res.Silver, 300]], { killer: a, owner: 0, brag: 0, src: 0 });
    run(s, 5);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    expect(copy.loot).toEqual(s.loot);
    expect(copy.entities.bag[a]).toEqual(s.entities.bag[a]);
    run(s, 50);
    run(copy, 50);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
