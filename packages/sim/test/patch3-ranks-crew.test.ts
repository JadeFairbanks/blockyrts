// Jade's Patch 3: workers rank up by themselves as they build and gather
// (no rank training for workers any more), an engine with a horse or an ox
// hitched moves without its crew, and an artillery crewman can retrain as a
// worker at the main base.
import { describe, expect, it } from 'vitest';
import {
  Act,
  addAnimal,
  addCrewman,
  addEngine,
  addWarrior,
  Blocked,
  BUILD_XP_TENTHS_PER_MINUTE,
  BuildingKind,
  buildingCentre,
  createWorld,
  CREWMAN_RETRAIN_STEPS,
  crewSworn,
  deserializeState,
  Engine,
  findNode,
  fireWhy,
  gainXp,
  haulerOf,
  GATHER_XP_TENTHS_PER_MINUTE,
  hashState,
  isCrewman,
  isTree,
  Mob,
  rankTrainedAt,
  placementBlocked,
  Res,
  RESOURCES,
  serializeState,
  Species,
  step,
  tinkerProgress,
  Troop,
  UnitKind,
  WARRIOR_XP_TENTHS,
  Work,
  WORKER_HEALTH_BY_RANK,
  WORKER_XP_TENTHS,
  workXp,
  WU_PER_COLUMN,
  WU_PER_METRE,
  rankXp,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const SEC = 20;
const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);

/** Every event of every step, since a step clears the last one's. */
const logs = new WeakMap<SimState, SimEvent[]>();

function stepLogged(s: SimState, orders: Order[] = []): void {
  step(s, orders);
  const log = logs.get(s) ?? [];
  log.push(...s.events);
  logs.set(s, log);
}

function heard(s: SimState): SimEvent[] {
  return logs.get(s) ?? [];
}

function run(s: SimState, n: number, orders: Order[] = []): void {
  stepLogged(s, orders);
  for (let k = 1; k < n; k++) stepLogged(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    stepLogged(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** Open ground 30 m east of the Big House. */
function field(s: SimState): [number, number] {
  const [x, z] = buildingCentre(bigHouse(s));
  return [x + 30 * M, z];
}

/** A clear, level spot for a building near the Big House, searching outwards. */
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

function firstWorker(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) return i;
  throw new Error('no worker');
}

describe('worker ranks (Patch 3)', () => {
  it('a worker learns as it gathers: 10 experience a minute of work with starting tools', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const n = findNode(s, 0, Res.SoftwoodLumber, col(e.x[0]!), col(e.z[0]!), 120)!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], cx: n.cx, cz: n.cz, index: n.i }]);
    // A load of pine is 15 s of chopping: a quarter of a minute, 2.5 experience.
    runUntil(s, () => pool[Res.SoftwoodLumber] === 45, 4000);
    expect(GATHER_XP_TENTHS_PER_MINUTE).toBe(100);
    expect(e.xp[0]).toBe(25);
    // Walking to and from the tree teaches nothing.
    runUntil(s, () => e.act[0] === Act.Work, 2000);
    expect(e.xp[0]).toBe(25);
    expect(e.rank[0]).toBe(1);
  });

  it('a worker learns as it builds', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    s.players[0]!.pool[Res.Resin] = 1;
    const [x, z] = freeSpot(s, BuildingKind.TorchPost);
    run(s, 1, [{ kind: 'build', player: 0, units: [e.id[0]!], building: BuildingKind.TorchPost, variant: 0, x, z }]);
    runUntil(s, () => s.buildings.list.length === 2 && s.buildings.list[1]!.complete, 4000);
    expect(e.xp[0]).toBeGreaterThan(0);
  });

  it('a step of work at a pace: 12 steps make a tenth of experience with starting tools, better tools learn faster', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = firstWorker(s);
    expect(BUILD_XP_TENTHS_PER_MINUTE).toBe(100);
    for (let k = 0; k < 11; k++) workXp(s, w, Work.Build);
    expect(e.xp[w]).toBe(0);
    workXp(s, w, Work.Build);
    expect(e.xp[w]).toBe(1);
    // A tool 1.25 times as fast: 10 steps.
    for (let k = 0; k < 10; k++) workXp(s, w, Work.Gather, 1250);
    expect(e.xp[w]).toBe(2);
    // Warriors never learn by working.
    const [x, z] = field(s);
    const war = addWarrior(s, 0, x, z);
    for (let k = 0; k < 100; k++) workXp(s, war, Work.Build);
    expect(e.xp[war]).toBe(0);
  });

  it('rises through Labourer, Hand, Master worker, Foreman and Elder as its experience grows, its health with it', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = firstWorker(s);
    expect(WORKER_XP_TENTHS).toEqual([0, 0, 500, 1500, 4000, 10000]);
    expect([e.rank[w], e.maxHp[w], e.hp[w]]).toEqual([1, 60, 60]);
    e.xp[w] = WORKER_XP_TENTHS[2]! - 1;
    e.hp[w] = 50;
    workXp(s, w, Work.Build);
    expect(e.rank[w]).toBe(1);
    for (let k = 0; k < 12; k++) workXp(s, w, Work.Build);
    expect([e.rank[w], e.maxHp[w], e.hp[w]]).toEqual([2, WORKER_HEALTH_BY_RANK[2], 60]);
    expect(s.events.some((ev) => ev.text === 'A worker has risen to Hand.')).toBe(true);
    // Fighting teaches too (a little; the same ladder), and a big gain rises more than one rank.
    gainXp(s, w, WORKER_XP_TENTHS[4]! - e.xp[w]!);
    expect([e.rank[w], e.maxHp[w]]).toEqual([4, WORKER_HEALTH_BY_RANK[4]]);
    expect(s.events.some((ev) => ev.text === 'A worker has risen to Master worker.')).toBe(true);
    expect(s.events.some((ev) => ev.text === 'A worker has risen to Foreman.')).toBe(true);
    gainXp(s, w, 100000);
    expect([e.rank[w], e.maxHp[w]]).toEqual([5, 100]);
    expect(s.events.filter((ev) => ev.text === 'A worker has risen to Elder.').length).toBe(1);
    // An Elder learns no more from work.
    const xp = e.xp[w]!;
    for (let k = 0; k < 100; k++) workXp(s, w, Work.Build);
    expect(e.xp[w]).toBe(xp);
  });

  it('workers no longer train their rank at the main base; warriors still train at the Barracks', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    const w = firstWorker(s);
    expect(rankTrainedAt(UnitKind.Worker)).toBe(-1);
    expect(rankTrainedAt(UnitKind.Warrior)).toBe(BuildingKind.Barracks);
    const food = s.players[0]!.pool[Res.FarmFare];
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[w]!], building: base.id }]);
    expect(e.queue[w]!.length).toBe(0);
    // A worker's train order from a save made before Patch 3 is dropped, at no cost.
    e.queue[w] = [{ t: 'train', b: base.id }];
    e.act[w] = Act.Start;
    run(s, 2);
    expect(e.queue[w]!.length).toBe(0);
    expect(e.rank[w]).toBe(1);
    expect(s.players[0]!.pool[Res.FarmFare]).toBe(food);
  });

  it('the unit view carries experience and the experience for the next rank, in whole points', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = firstWorker(s);
    expect(rankXp(s, w)).toEqual([0, 50]);
    gainXp(s, w, 525);
    expect(rankXp(s, w)).toEqual([52, 150]);
    gainXp(s, w, 100000);
    expect(rankXp(s, w)).toEqual([Math.floor(e.xp[w]! / 10), 0]);
    const [x, z] = field(s);
    const war = addWarrior(s, 0, x, z);
    expect(rankXp(s, war)).toEqual([0, WARRIOR_XP_TENTHS[2]! / 10]);
    const cat = addEngine(s, 0, Engine.Catapult, x, z);
    expect(rankXp(s, cat)).toEqual([0, 0]);
  });
});

describe('a towed engine (Patch 3)', () => {
  it('a horse hauls a catapult with no crew', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [x, z] = field(s);
    const cat = addEngine(s, 0, Engine.Catapult, x, z);
    const catId = e.id[cat]!;
    const horse = addAnimal(s, Species.Horse, 0, x - 6 * M, z, 0, 0);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [catId], target: e.id[horse]! }]);
    run(s, 1, [{ kind: 'move', player: 0, units: [catId], x: x + 20 * M, z }]);
    runUntil(s, () => e.x[e.indexOf(catId)]! >= x + 19 * M, 90 * SEC);
  });

  it('fires with no crew while its horse or ox is hitched beside it (the coordinator\'s ruling on Jade\'s words); let go, it needs its crew again', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [x, z] = field(s);
    const bal = addEngine(s, 0, Engine.Ballista, x, z);
    const balId = e.id[bal]!;
    expect(fireWhy(s, bal)).toBe('It needs its crewman standing by it to fire (0 now).');
    const ox = addAnimal(s, Species.Ox, 0, x - 3 * M, z, 0, 0);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [balId], target: e.id[ox]! }]);
    runUntil(s, () => haulerOf(s, e.indexOf(balId)) >= 0, 30 * SEC);
    expect(fireWhy(s, e.indexOf(balId))).toBe('');
    // A goblin hut 20 m off, the trees in between felled: the uncrewed ballista breaks it.
    run(s, 1, [{ kind: 'debugSpawn', player: 0, mob: Mob.GoblinHut, x: x + 20 * M, z }]);
    let hut = -1;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.GoblinHut && e.hp[i]! > 0) hut = i;
    const hutId = e.id[hut]!;
    const full = e.hp[hut]!;
    const n = 64 * WU_PER_COLUMN;
    for (let cz = Math.floor((z - 4 * M) / n); cz <= Math.floor((z + 4 * M) / n); cz++) {
      for (let cx = Math.floor(x / n); cx <= Math.floor((x + 20 * M) / n); cx++) {
        for (const p of s.world.props(cx, cz, s.step)) if (isTree(p.kind)) s.world.harvest(cx, cz, p.index, p.amount, s.step);
      }
    }
    run(s, 1, [{ kind: 'attack', player: 0, units: [balId], target: hutId }]);
    runUntil(s, () => e.indexOf(hutId) < 0 || e.hp[e.indexOf(hutId)]! < full, 60 * SEC);
    expect(crewSworn(s, e.indexOf(balId)).length).toBe(0);
    // Let go, it is an engine with no crew again.
    run(s, 1, [{ kind: 'hitch', player: 0, units: [balId], target: 0 }]);
    expect(fireWhy(s, e.indexOf(balId))).toBe('It needs its crewman standing by it to fire (0 now).');
  });
});

describe('retraining an artillery crewman as a worker (Patch 3)', () => {
  function setup(): { s: SimState; c: number; id: number; x: number; z: number } {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = field(s);
    const c = addCrewman(s, 0, x, z);
    return { s, c, id: s.entities.id[c]!, x, z };
  }

  it('walks to the main base, sits tinkering saying so, and gets up a Labourer with starting tools, at no cost', () => {
    const { s, c, id } = setup();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const stock = [...pool];
    expect(CREWMAN_RETRAIN_STEPS).toBe(30 * SEC);
    run(s, 1, [{ kind: 'retrain', player: 0, units: [id] }]);
    expect(e.queue[c]![0]).toMatchObject({ t: 'retrain' });
    runUntil(s, () => e.tinker[c] !== 0, 60 * SEC);
    const [bx, bz] = buildingCentre(bigHouse(s));
    expect(Math.hypot(e.x[c]! - bx, e.z[c]! - bz)).toBeLessThan(12 * M);
    const said = heard(s).find((ev) => ev.kind === 'speech' && ev.speaker === id);
    expect(said?.text).toBe('Retraining to be a worker.');
    expect(said?.quiet).toBe(true);
    // The bubble stays up as long as the bar (the bubbles thread's hook).
    expect(said?.hold).toBe('bar');
    expect(tinkerProgress(s, c)[1]).toBe(CREWMAN_RETRAIN_STEPS);
    expect(isCrewman(s, c)).toBe(true);
    // Hurt as he sits (a hurt unit's question bubble would take the place of the line above), he keeps his share of health.
    e.hp[c] = 40;
    const most = e.maxHp[c]!;
    const took = runUntil(s, () => e.kind[c] === UnitKind.Worker, CREWMAN_RETRAIN_STEPS + 10);
    expect(took).toBeGreaterThanOrEqual(CREWMAN_RETRAIN_STEPS - 2);
    // The same unit, now a worker.
    expect(e.indexOf(id)).toBe(c);
    expect(isCrewman(s, c)).toBe(false);
    expect([e.rank[c], e.xp[c], e.wTier[c], e.troop[c], e.maxHp[c]]).toEqual([1, 0, 1, 0, 60]);
    // (He mends a little as he sits.)
    expect(e.hp[c]).toBeGreaterThanOrEqual(Math.floor((40 * 60) / most));
    expect(e.hp[c]).toBeLessThan(Math.floor((45 * 60) / most));
    expect(heard(s).some((ev) => ev.text === 'An artillery crewman has retrained as a worker.')).toBe(true);
    for (const r of RESOURCES) if (r.nutrition === 0) expect([r.name, pool[r.id]]).toEqual([r.name, stock[r.id]]);
    // And works as one.
    run(s, 2);
    expect(e.queue[c]!.length).toBe(0);
    const n = findNode(s, 0, Res.SoftwoodLumber, col(e.x[c]!), col(e.z[c]!), 120)!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [id], cx: n.cx, cz: n.cz, index: n.i }]);
    expect(e.queue[c]![0]?.t).toBe('gather');
  });

  it('a new order before the bar is full leaves him a crewman', () => {
    const { s, c, id, x, z } = setup();
    const e = s.entities;
    run(s, 1, [{ kind: 'retrain', player: 0, units: [id] }]);
    runUntil(s, () => e.tinker[c] !== 0, 60 * SEC);
    run(s, 5 * SEC);
    run(s, 2, [{ kind: 'move', player: 0, units: [id], x, z }]);
    expect(e.tinker[c]).toBe(0);
    run(s, CREWMAN_RETRAIN_STEPS);
    expect(isCrewman(s, c)).toBe(true);
    expect(e.troop[c]).toBe(Troop.Crew);
  });

  it('only crewmen take the order; with no main base he says so and stays a crewman', () => {
    const { s, c, id, x, z } = setup();
    const e = s.entities;
    const war = addWarrior(s, 0, x, z + 2 * M);
    const w = firstWorker(s);
    run(s, 1, [{ kind: 'retrain', player: 0, units: [e.id[war]!, e.id[w]!] }]);
    expect(e.queue[war]![0]?.t).not.toBe('retrain');
    expect(e.queue[w]![0]?.t).not.toBe('retrain');
    bigHouse(s).complete = false;
    run(s, 2, [{ kind: 'retrain', player: 0, units: [id] }]);
    expect(heard(s).some((ev) => ev.speaker === id && ev.text === 'There is no main base to retrain at.')).toBe(true);
    expect(e.queue[c]!.length).toBe(0);
    expect(isCrewman(s, c)).toBe(true);
  });

  it('a save made while he retrains plays on the same', () => {
    const { s, c, id } = setup();
    const e = s.entities;
    run(s, 1, [{ kind: 'retrain', player: 0, units: [id] }]);
    runUntil(s, () => e.tinker[c] !== 0, 60 * SEC);
    run(s, 5 * SEC);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    run(s, CREWMAN_RETRAIN_STEPS);
    run(copy, CREWMAN_RETRAIN_STEPS);
    expect(hashState(copy)).toBe(hashState(s));
    expect(copy.entities.kind[copy.entities.indexOf(id)]).toBe(UnitKind.Worker);
  });
});
