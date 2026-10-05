// Jade's Patch 4: working through the night. Workers gathering by themselves
// within 25 m of a building and 50 m of a troop ask at dusk, instead of going
// home, "Should I keep working through the night?". Yes, or no answer, and
// they work on; No, and they go to work an empty Farm, else into the main
// base. Workers who went in for the night come out at dawn once no monster
// within 25 m of their shelter is alive (in the day whatever the monsters
// do), carrying on, or gathering by themselves when they had nothing to do.
import { describe, expect, it } from 'vitest';
import {
  addCrewman,
  addMob,
  Blocked,
  BuildingKind,
  createWorld,
  DAWN_CLEAR_M,
  DAWN_STEPS,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  ENTER_NIGHT,
  FORAGE_HOME,
  FORAGE_NIGHT,
  fromBuilding,
  hashState,
  mayWorkOn,
  Mob,
  nearBuilding,
  nearTroop,
  NIGHT_STEPS,
  NIGHT_WORK_ASK,
  NIGHT_WORK_BUILDING_M,
  NIGHT_WORK_REACH_M,
  NIGHT_WORK_TROOP_M,
  nightReach,
  openQuestions,
  placeBuilding,
  placementBlocked,
  QUESTION_WAIT_STEPS,
  RESOURCES,
  serializeState,
  solidRect,
  step,
  STEPS_PER_SECOND,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type AnswerOrder,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
  type UnitOrder,
} from '../src/index.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;
const NIGHT = DAY_STEPS + DUSK_STEPS;
const DAWN = NIGHT + NIGHT_STEPS;
const DAY2 = DAWN + DAWN_STEPS;

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

function units(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind && e.hp[i]! > 0) out.push(i);
  return out;
}

const ids = (s: SimState, list: number[]): number[] => list.map((i) => s.entities.id[i]!);

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** The answer the owner's button sends. */
function answer(ev: SimEvent, yes: boolean): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: yes ? 1 : 0, q: a.q, who: ev.speaker ?? 0, units: [...a.units], res: a.res };
}

const nightAsks = (seen: SimEvent[]): SimEvent[] => seen.filter((x) => x.kind === 'question' && x.ask!.q === NIGHT_WORK_ASK && !x.ask!.closed && !x.ask!.retold);

/** A worker's Gather order. */
function forage(s: SimState, i: number): Extract<UnitOrder, { t: 'forage' }> | undefined {
  return s.entities.queue[i]!.find((o): o is Extract<UnitOrder, { t: 'forage' }> => o.t === 'forage');
}

/** A free spot for a building beside the Big House. */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = bigHouse(s);
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + 16 + dx, b.z + dz) === Blocked.None) return [b.x + 16 + dx, b.z + dz];
      }
    }
  }
  throw new Error('no free spot');
}

/**
 * A peaceful world at the step its first dusk begins: its four workers have
 * gathered by themselves (the Gather button) round the Big House for the
 * last 40 s of the day, the start's three warriors stand by, and the stock
 * holds only food (so nobody asks about kit or tools at the same time).
 */
function duskWorld(): SimState {
  const s = createWorld(1, { peaceful: true });
  for (const p of s.players) for (const r of RESOURCES) if (r.nutrition === 0) p.pool[r.id] = 0;
  s.step = DAY_STEPS - 40 * SEC;
  run(s, 40 * SEC, [{ kind: 'forage', player: 0, units: ids(s, units(s, UnitKind.Worker)) }]);
  expect(s.step).toBe(DAY_STEPS);
  return s;
}

/** Everyone gathered: the stock's basic materials added up. */
function stockOf(s: SimState): number {
  let n = 0;
  for (const r of RESOURCES) if (r.nutrition === 0) n += s.players[0]!.pool[r.id]!;
  return n;
}

describe('where a worker may work on through the night (Jade: 25 m to a building, 50 m to a troop)', () => {
  it('measures to a building from its walls, not counting lights, and to any combat unit but an artillery crewman', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const b = bigHouse(s);
    expect(NIGHT_WORK_BUILDING_M).toBe(25);
    expect(NIGHT_WORK_TROOP_M).toBe(50);
    expect(NIGHT_WORK_REACH_M).toBe(25);
    expect(DAWN_CLEAR_M).toBe(25);
    // Straight out east of the Big House's walls.
    const [, z0, x1, z1] = solidRect(b);
    const wallX = (x1 + 1) * WU_PER_COLUMN;
    const z = ((z0 + z1 + 1) * WU_PER_COLUMN) >> 1;
    const at = (m: number): number => wallX + m * M;
    expect(nearBuilding(s, at(20), z, NIGHT_WORK_BUILDING_M)).toBe(true);
    expect(nearBuilding(s, at(27), z, NIGHT_WORK_BUILDING_M)).toBe(false);
    expect(nightReach(s)(at(20), z)).toBe(true);
    expect(nightReach(s)(at(27), z)).toBe(false);
    // A torch post out there is a light, not a building.
    const tx = Math.floor(at(40) / WU_PER_COLUMN);
    const tz = Math.floor(z / WU_PER_COLUMN);
    placeBuilding(s, 0, BuildingKind.TorchPost, 0, tx, tz, true);
    expect(nearBuilding(s, at(40), z, NIGHT_WORK_BUILDING_M)).toBe(false);
    // The start's warriors stand by the Big House; far off, there is no troop near it.
    run(s, 1);
    const [bx, bz] = [(b.x + 2) * WU_PER_COLUMN, (b.z + 2) * WU_PER_COLUMN];
    expect(nearTroop(s, bx, bz)).toBe(true);
    for (const w of units(s, UnitKind.Warrior)) e.x[w] = e.x[w]! + 150 * M;
    run(s, 1);
    expect(nearTroop(s, bx, bz)).toBe(false);
    // A lone artillery crewman is no troop.
    addCrewman(s, 0, bx + 3 * M, bz);
    run(s, 1);
    expect(nearTroop(s, bx, bz)).toBe(false);
  });
});

describe('working through the night (Jade\'s Patch 4)', () => {
  it('asks at dusk instead of going home, one worker for those round it, and with no answer they work on all night', () => {
    const s = duskWorld();
    const e = s.entities;
    const workers = units(s, UnitKind.Worker);
    for (const i of workers) expect(mayWorkOn(s, i)).toBe(true);
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const asked = nightAsks(seen);
    expect(asked.length).toBe(1);
    const ev = asked[0]!;
    expect(ev.text).toBe('Should the four of us keep working through the night?');
    expect([...ev.ask!.units].sort((a, c) => a - c)).toEqual(ids(s, workers).sort((a, c) => a - c));
    expect(ev.ask!.yes).toContain('Not answering counts as Yes');
    expect(ev.ask!.no).toContain('shelter in the main base for the night');
    for (const i of workers) expect(forage(s, i)!.k).toBe(FORAGE_NIGHT);
    // No answer in its 10 s: it ends, and they keep at it (Jade: not answering counts as Yes).
    run(s, QUESTION_WAIT_STEPS);
    expect(openQuestions(s).some((q) => q.q === NIGHT_WORK_ASK)).toBe(false);
    runUntil(s, () => s.step >= NIGHT, DUSK_STEPS);
    const before = stockOf(s);
    // All night: outside, gathering, never farther than the night's reach from a building (a step or two for the node it stands at).
    while (s.step < NIGHT + 120 * SEC) {
      run(s, SEC);
      for (const i of workers) {
        expect(e.inside[i]).toBe(0);
        expect(forage(s, i)!.k).toBe(FORAGE_NIGHT);
        expect(nearBuilding(s, e.x[i]!, e.z[i]!, NIGHT_WORK_REACH_M + 3)).toBe(true);
      }
    }
    expect(stockOf(s)).toBeGreaterThan(before);
    // Asked once a dusk: no second question that night.
    const later: SimEvent[] = [];
    run(s, 10 * SEC, [], later);
    expect(nightAsks(later).length).toBe(0);
  });

  it('Yes: they work on, as no answer would', () => {
    const s = duskWorld();
    const e = s.entities;
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const ev = nightAsks(seen)[0]!;
    run(s, 1, [answer(ev, true)]);
    expect(openQuestions(s).length).toBe(0);
    runUntil(s, () => s.step >= NIGHT + 10 * SEC, DUSK_STEPS + 20 * SEC);
    for (const i of units(s, UnitKind.Worker)) {
      expect(e.inside[i]).toBe(0);
      expect(forage(s, i)!.k).toBe(FORAGE_NIGHT);
    }
  });

  it('No, with no farm: home into the main base for the night, out again at dawn with no monster near, gathering on', () => {
    const s = duskWorld();
    const e = s.entities;
    const b = bigHouse(s);
    const workers = units(s, UnitKind.Worker);
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const ev = nightAsks(seen)[0]!;
    run(s, 1, [answer(ev, false)], seen);
    expect(seen.some((x) => x.kind === 'speech' && x.text === 'Heading in for the night.' && x.quiet)).toBe(true);
    runUntil(s, () => workers.every((i) => e.inside[i] === b.id), DUSK_STEPS);
    for (const i of workers) expect(e.queue[i]![0]).toEqual({ t: 'enter', b: b.id, auto: ENTER_NIGHT });
    // Still in at the end of the night; out as dawn begins (nothing near), carrying on gathering by themselves.
    s.step = DAWN - 2;
    run(s, 1);
    for (const i of workers) expect(e.inside[i]).toBe(b.id);
    run(s, 2);
    for (const i of workers) {
      expect(e.inside[i]).toBe(0);
      expect(forage(s, i)).toBeDefined();
    }
    // They work at dawn now: out to the nodes, not standing about.
    run(s, 10 * SEC);
    expect(workers.some((i) => e.queue[i]![0]?.t === 'gather')).toBe(true);
  });

  it('No, with an empty farm: the farm takes as many as it has places (two), the rest go to the main base', () => {
    const s = duskWorld();
    const e = s.entities;
    const [x, z] = freeSpot(s, BuildingKind.Farm);
    const farm = placeBuilding(s, 0, BuildingKind.Farm, 0, x, z, true);
    const workers = units(s, UnitKind.Worker);
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const ev = nightAsks(seen)[0]!;
    expect(ev.ask!.no).toBe(
      `Two go to work the nearest empty farm (to shelter in the farmhouse tonight and farm from daybreak); the rest drop off their loads and shelter in the main base for the night, coming out at dawn once no monster within ${DAWN_CLEAR_M} m is alive.`,
    );
    run(s, 1, [answer(ev, false)]);
    const farmers = workers.filter((i) => e.queue[i]!.some((o) => o.t === 'job' && o.b === farm.id));
    const home = workers.filter((i) => forage(s, i)?.k === FORAGE_HOME);
    expect(farmers.length).toBe(2);
    expect(home.length).toBe(2);
    // Into the farmhouse for the night, and out to the field at daybreak.
    runUntil(s, () => farmers.every((i) => e.inside[i] === farm.id), DUSK_STEPS);
    s.step = DAY2 - 2;
    run(s, 4 * SEC);
    for (const i of farmers) {
      expect(e.inside[i]).toBe(0);
      expect(e.queue[i]![0]).toEqual({ t: 'job', b: farm.id });
    }
  });

  it('goes home at dusk without asking when no troop is within 50 m', () => {
    const s = duskWorld();
    const e = s.entities;
    for (const w of units(s, UnitKind.Warrior)) e.x[w] = e.x[w]! + 150 * M;
    const seen: SimEvent[] = [];
    run(s, 2 * SEC, [], seen);
    expect(nightAsks(seen).length).toBe(0);
    for (const i of units(s, UnitKind.Worker)) expect(forage(s, i)!.k).toBe(FORAGE_HOME);
  });

  it('goes home at dusk without asking when it is farther than 25 m from every building, though a troop is by it', () => {
    const s = duskWorld();
    const e = s.entities;
    const b = bigHouse(s);
    const [far, ...rest] = units(s, UnitKind.Worker);
    // Out 40 m from the Big House's walls, a warrior beside it.
    let x = e.x[far!]!;
    while (fromBuilding(b, x, e.z[far!]!) < 40 * M) x += WU_PER_COLUMN;
    e.x[far!] = x;
    const w = units(s, UnitKind.Warrior)[0]!;
    e.x[w] = x + 2 * M;
    e.z[w] = e.z[far!]!;
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const asked = nightAsks(seen);
    expect(asked.length).toBe(1);
    expect(asked[0]!.ask!.units).not.toContain(e.id[far!]);
    expect(asked[0]!.ask!.units.length).toBe(rest.length);
    expect(forage(s, far!)!.k).toBe(FORAGE_HOME);
  });

  it('withdraws the question once its workers are all given other orders', () => {
    const s = duskWorld();
    const e = s.entities;
    const b = bigHouse(s);
    const workers = units(s, UnitKind.Worker);
    const seen: SimEvent[] = [];
    run(s, 1, [], seen);
    const ev = nightAsks(seen)[0]!;
    const ended: SimEvent[] = [];
    run(s, 2, [{ kind: 'move', player: 0, units: ids(s, workers), x: (b.x + 2) * WU_PER_COLUMN, z: (b.z - 6) * WU_PER_COLUMN }], ended);
    expect(ended.some((x) => x.kind === 'question' && x.ask!.id === ev.ask!.id && x.ask!.closed)).toBe(true);
    for (const i of workers) expect(e.queue[i]!.some((o) => o.t === 'forage')).toBe(false);
  });

  it('is state where it counts: a save in the night keeps who works on, and every machine agrees', () => {
    const s = duskWorld();
    run(s, 1);
    runUntil(s, () => s.step >= NIGHT + 5 * SEC, DUSK_STEPS + 10 * SEC);
    const copy = deserializeState(serializeState(s));
    for (const i of units(copy, UnitKind.Worker)) expect(forage(copy, i)!.k).toBe(FORAGE_NIGHT);
    run(s, 30 * SEC);
    run(copy, 30 * SEC);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('out again at dawn (Jade\'s Patch 4)', () => {
  /** A peaceful world in its first night with the workers idle in the Big House, sent by Everyone Home in the dark, and the warriors far off. */
  function shelteredWorld(): SimState {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const b = bigHouse(s);
    for (const w of units(s, UnitKind.Warrior)) e.x[w] = e.x[w]! + 150 * M;
    s.step = NIGHT + 10 * SEC;
    run(s, 1, [{ kind: 'everyoneHome', player: 0 }]);
    const workers = units(s, UnitKind.Worker);
    for (const i of workers) expect(e.queue[i]![0]).toEqual({ t: 'enter', b: b.id, auto: ENTER_NIGHT });
    runUntil(s, () => workers.every((i) => e.inside[i] === b.id), 60 * SEC);
    return s;
  }

  it('stays in at dawn while a monster lives within 25 m of the shelter, and comes out once it is gone, gathering when it had nothing to do', () => {
    const s = shelteredWorld();
    const e = s.entities;
    const b = bigHouse(s);
    const workers = units(s, UnitKind.Worker);
    let x = (b.x + 2) * WU_PER_COLUMN;
    const z = (b.z + 2) * WU_PER_COLUMN;
    while (fromBuilding(b, x, z) < 15 * M) x += WU_PER_COLUMN;
    s.step = DAWN - 2;
    const zombie = addMob(s, Mob.Zombie, 0, x, z, 0);
    run(s, 2 + 5 * SEC);
    for (const i of workers) expect(e.inside[i]).toBe(b.id);
    // Gone: out within the second, and with nothing else to do, gathering by themselves (Jade).
    e.hp[zombie] = 0;
    run(s, SEC + 1);
    for (const i of workers) {
      expect(e.inside[i]).toBe(0);
      expect(forage(s, i)).toBeDefined();
    }
  });

  it('comes out in the day whatever the monsters do', () => {
    const s = shelteredWorld();
    const e = s.entities;
    const b = bigHouse(s);
    const workers = units(s, UnitKind.Worker);
    let x = (b.x + 2) * WU_PER_COLUMN;
    const z = (b.z + 2) * WU_PER_COLUMN;
    while (fromBuilding(b, x, z) < 10 * M) x += WU_PER_COLUMN;
    s.step = DAY2 - 3 * SEC;
    const zombie = addMob(s, Mob.Zombie, 0, x, z, 0);
    run(s, 2 * SEC);
    for (const i of workers) expect(e.inside[i]).toBe(b.id);
    run(s, SEC + 2);
    expect(e.hp[zombie]).toBeGreaterThan(0);
    for (const i of workers) expect(e.inside[i]).toBe(0);
  });

  it('Everyone Home by day keeps them in until daybreak, as before Patch 4', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const b = bigHouse(s);
    // (Not on the game's first step: daybreak's own step lets out those in until daybreak.)
    run(s, 10 * SEC);
    run(s, 1, [{ kind: 'everyoneHome', player: 0 }]);
    const workers = units(s, UnitKind.Worker);
    for (const i of workers) expect(e.queue[i]![0]).toEqual({ t: 'enter', b: b.id, auto: 1 });
    runUntil(s, () => workers.every((i) => e.inside[i] === b.id), 60 * SEC);
    s.step = DAWN + 2;
    run(s, 2 * SEC);
    for (const i of workers) expect(e.inside[i]).toBe(b.id);
    s.step = DAY2 - 1;
    run(s, 3);
    for (const i of workers) {
      expect(e.inside[i]).toBe(0);
      expect(e.queue[i]!.length).toBe(0);
    }
  });

  it('a worker its player sends in by night comes out at dawn too; one sent in by day stays until let out', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const b = bigHouse(s);
    const [w1, w2] = units(s, UnitKind.Worker);
    run(s, 1, [{ kind: 'enter', player: 0, units: [e.id[w1!]!], building: b.id }]);
    expect(e.queue[w1!]![0]).toEqual({ t: 'enter', b: b.id, auto: 0 });
    s.step = NIGHT + 5 * SEC;
    run(s, 1, [{ kind: 'enter', player: 0, units: [e.id[w2!]!], building: b.id }]);
    expect(e.queue[w2!]![0]).toEqual({ t: 'enter', b: b.id, auto: ENTER_NIGHT });
    runUntil(s, () => e.inside[w1!] === b.id && e.inside[w2!] === b.id, 60 * SEC);
    s.step = DAWN - 1;
    run(s, 3);
    expect(e.inside[w2!]).toBe(0);
    expect(e.inside[w1!]).toBe(b.id);
  });
});
