// Jade's Patch 4: an empty farm, a building no one works on and an idle
// worker each ask by themselves once a minute has gone by (by dawn and day:
// never at dusk or night), in the question bubbles; Yes sends a nearby
// worker to farm or build, or gives the idle worker something to do (farm,
// help build, else gather); No, or no answer, rests until the cause clears
// or the next day. None of it is state, and Yes does the same on a machine
// that loaded the game and never saw the question.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  constructionHealth,
  createWorld,
  DAY_STEPS,
  DAWN_STEPS,
  deserializeState,
  DUSK_STEPS,
  FARM_EMPTY_ASK_STEPS,
  fromBuilding,
  hashState,
  NIGHT_STEPS,
  placeBuilding,
  placementBlocked,
  RESOURCES,
  serializeState,
  SITE_UNWORKED_ASK_STEPS,
  step,
  STEPS_PER_SECOND,
  UnitKind,
  validateOrder,
  WORK_ASK_NEAR_M,
  WORKER_IDLE_ASK_STEPS,
  WorkAsk,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type AnswerOrder,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const SEC = STEPS_PER_SECOND;

/** One player, no monsters, and a stock of food only, so nobody asks about kit. */
function world(): SimState {
  const s = createWorld(1, { peaceful: true });
  for (const p of s.players) for (const r of RESOURCES) if (r.nutrition === 0) p.pool[r.id] = 0;
  return s;
}

function run(s: SimState, n: number, orders: Order[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < n; k++) {
    step(s, k === 0 ? orders : []);
    out.push(...s.events);
  }
  return out;
}

const asked = (evs: SimEvent[], q: number): SimEvent[] => evs.filter((x) => x.kind === 'question' && !x.ask!.closed && !x.ask!.retold && x.ask!.q === q);

/** Steps until a question of kind q is asked; returns it and the step it came on. */
function untilAsked(s: SimState, q: number, max: number): { ev: SimEvent; at: number } {
  for (let k = 0; k < max; k++) {
    step(s);
    const ev = asked(s.events, q)[0];
    if (ev) return { ev, at: s.step - 1 };
  }
  throw new Error(`question ${q} not asked in ${max} steps`);
}

function answer(ev: SimEvent, yes: boolean): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: yes ? 1 : 0, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res };
}

/** Player 0's workers, by index. */
function workers(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) out.push(i);
  return out;
}

const head = (s: SimState, i: number): string | undefined => s.entities.queue[i]![0]?.t;
const has = (s: SimState, i: number, t: string, b: number): boolean => s.entities.queue[i]!.some((o) => o.t === t && 'b' in o && o.b === b);

/** A building put down on a clear spot about `from` columns east of the Big House, searching outwards; finished, or a site just started. */
function putNear(s: SimState, kind: number, complete: boolean, from = 16): Building {
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = home.x + from + dx;
        const z = home.z + dz;
        if (placementBlocked(s, 0, kind, x, z) !== Blocked.None) continue;
        const b = placeBuilding(s, 0, kind, 0, x, z, complete);
        if (!complete) b.hp = constructionHealth(kind, 0);
        return b;
      }
    }
  }
  throw new Error('no free spot');
}

/** The worker a farm or site sends for: idle first, then the nearest to its edge. */
function nearestTo(s: SimState, b: Building): number {
  const e = s.entities;
  let best = -1;
  for (const i of workers(s)) {
    if (best < 0 || fromBuilding(b, e.x[i]!, e.z[i]!) < fromBuilding(b, e.x[best]!, e.z[best]!)) best = i;
  }
  return best;
}

describe('Patch 4: an idle worker asks for work', () => {
  it('asks once a minute has gone by, never before, speaking for the idle workers near it; Yes sends them gathering', () => {
    const s = world();
    const ws = workers(s);
    expect(ws.length).toBe(4);
    expect(asked(run(s, WORKER_IDLE_ASK_STEPS), WorkAsk.Idle)).toEqual([]);
    const { ev, at } = untilAsked(s, WorkAsk.Idle, 3 * SEC);
    expect(at).toBeGreaterThan(WORKER_IDLE_ASK_STEPS);
    expect(at).toBeLessThanOrEqual(WORKER_IDLE_ASK_STEPS + 2 * SEC);
    // No farm or site at the start: they would gather.
    expect(ev.text).toBe('Four of us have nothing to do. Shall we gather?');
    expect(ev.ask!.units.length).toBe(4);
    expect(ev.ask!.yes).toBe('All 4 gather what the side needs most, as the Gather button sends them. Takes nothing from the stock.');
    run(s, 1, [answer(ev, true)]);
    for (const i of ws) expect(['forage', 'gather']).toContain(head(s, i));
  });

  it('No rests until the next day; none asks at dusk or night; the minute counts again from dawn', () => {
    const s = world();
    const { ev } = untilAsked(s, WorkAsk.Idle, WORKER_IDLE_ASK_STEPS + 3 * SEC);
    const rest = run(s, DAY_STEPS + DUSK_STEPS + NIGHT_STEPS - s.step, [answer(ev, false)]);
    expect(asked(rest, WorkAsk.Idle)).toEqual([]);
    // Dawn begins: a minute later, not before, they ask again.
    const dawn = s.step;
    expect(asked(run(s, WORKER_IDLE_ASK_STEPS), WorkAsk.Idle)).toEqual([]);
    const again = untilAsked(s, WorkAsk.Idle, 3 * SEC);
    expect(again.at - dawn).toBeGreaterThan(WORKER_IDLE_ASK_STEPS);
    expect(DAWN_STEPS).toBeLessThan(WORKER_IDLE_ASK_STEPS);
  });

  it('a worker given an order and idle again waits another minute; the question goes once one of them is busy', () => {
    const s = world();
    const ws = workers(s);
    const { ev } = untilAsked(s, WorkAsk.Idle, WORKER_IDLE_ASK_STEPS + 3 * SEC);
    const e = s.entities;
    // One of them is told to walk a little: the question is withdrawn on every machine.
    const one = ws[0]!;
    const evs = run(s, 2, [{ kind: 'move', player: 0, units: [e.id[one]!], x: e.x[one]! + 2 * WU_PER_METRE, z: e.z[one]!, queued: false }]);
    expect(evs.some((x) => x.kind === 'question' && x.ask!.closed && x.ask!.id === ev.ask!.id)).toBe(true);
    // The other three ask again at once (a withdrawn question is not a No); the walker, idle again, only after its own minute.
    const next = asked(evs, WorkAsk.Idle)[0] ?? untilAsked(s, WorkAsk.Idle, 2 * SEC).ev;
    expect(next.ask!.units).not.toContain(e.id[one]);
    expect(next.text).toBe('Three of us have nothing to do. Shall we gather?');
    const later = run(s, WORKER_IDLE_ASK_STEPS - 2 * SEC);
    expect(asked(later, WorkAsk.Idle).filter((x) => x.ask!.units.includes(e.id[one]!))).toEqual([]);
    const own = untilAsked(s, WorkAsk.Idle, 6 * SEC);
    expect(own.ev.ask!.units).toContain(e.id[one]);
  });
});

describe('Patch 4: an empty farm asks for a worker', () => {
  it('asks a minute after it stands empty, picking the nearest idle worker; Yes assigns one, and it does not ask again', () => {
    const s = world();
    const farm = putNear(s, BuildingKind.Farm, true);
    const { ev, at } = untilAsked(s, WorkAsk.Farm, FARM_EMPTY_ASK_STEPS + 3 * SEC);
    expect(at).toBeGreaterThan(FARM_EMPTY_ASK_STEPS);
    expect(ev.building).toBe(farm.id);
    expect(ev.text).toBe('No one is farming here. Send a worker?');
    expect(ev.ask!.yes).toMatch(/^The nearest idle worker \(\d+ m away\) comes to farm here\. Takes nothing from the stock\.$/);
    const pick = nearestTo(s, farm);
    // The idle workers ask too, but not the one the farm would send.
    const idle = asked(run(s, 2 * SEC), WorkAsk.Idle);
    for (const q of idle) expect(q.ask!.units).not.toContain(s.entities.id[pick]);
    run(s, 1, [answer(ev, true)]);
    expect(has(s, pick, 'job', farm.id)).toBe(true);
    expect(workers(s).filter((i) => has(s, i, 'job', farm.id)).length).toBe(1);
    expect(asked(run(s, FARM_EMPTY_ASK_STEPS + 2 * SEC), WorkAsk.Farm)).toEqual([]);
  });

  it('a farm with a farmer never asks, and neither does one with no worker free nearby', () => {
    const s = world();
    const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    run(s, 1, [{ kind: 'debugReveal', player: 0, x: (home.x + 70) * WU_PER_COLUMN, z: home.z * WU_PER_COLUMN, radius: 60 * WU_PER_METRE }]);
    const farm = putNear(s, BuildingKind.Farm, true);
    const far = putNear(s, BuildingKind.Farm, true, 140);
    const e = s.entities;
    for (const i of workers(s)) expect(fromBuilding(far, e.x[i]!, e.z[i]!)).toBeGreaterThan(WORK_ASK_NEAR_M * WU_PER_METRE);
    const evs = run(s, FARM_EMPTY_ASK_STEPS + 3 * SEC, [{ kind: 'assign', player: 0, units: [e.id[workers(s)[0]!]!], building: farm.id, queued: false }]);
    expect(asked(evs, WorkAsk.Farm)).toEqual([]);
  });

  it('is withdrawn when the player assigns a farmer while it is up', () => {
    const s = world();
    const farm = putNear(s, BuildingKind.Farm, true);
    const { ev } = untilAsked(s, WorkAsk.Farm, FARM_EMPTY_ASK_STEPS + 3 * SEC);
    const e = s.entities;
    const evs = run(s, 2 * SEC, [{ kind: 'assign', player: 0, units: [e.id[workers(s)[1]!]!], building: farm.id, queued: false }]);
    expect(evs.some((x) => x.kind === 'question' && x.ask!.closed && x.ask!.id === ev.ask!.id)).toBe(true);
  });
});

describe('Patch 4: a building no one works on asks for a builder', () => {
  it('asks a minute after no one is on it; Yes sends the nearest free worker to build it', () => {
    const s = world();
    const site = putNear(s, BuildingKind.Storehouse, false);
    const { ev, at } = untilAsked(s, WorkAsk.Site, SITE_UNWORKED_ASK_STEPS + 3 * SEC);
    expect(at).toBeGreaterThan(SITE_UNWORKED_ASK_STEPS);
    expect(ev.building).toBe(site.id);
    expect(ev.text).toBe('No one is building this storehouse. Send a builder?');
    const pick = nearestTo(s, site);
    run(s, 1, [answer(ev, true)]);
    expect(has(s, pick, 'work', site.id)).toBe(true);
  });

  it('never asks at dusk or night, and asks a minute after dawn begins', () => {
    const s = world();
    s.step = DAY_STEPS;
    const site = putNear(s, BuildingKind.Storehouse, false);
    expect(asked(run(s, DUSK_STEPS + NIGHT_STEPS), WorkAsk.Site)).toEqual([]);
    const dawn = s.step;
    const { ev, at } = untilAsked(s, WorkAsk.Site, SITE_UNWORKED_ASK_STEPS + 3 * SEC);
    expect(ev.building).toBe(site.id);
    expect(at - dawn).toBeGreaterThan(SITE_UNWORKED_ASK_STEPS);
  });

  it('a site with a builder on its way or queued never asks', () => {
    const s = world();
    const site = putNear(s, BuildingKind.Storehouse, false);
    const e = s.entities;
    const w = workers(s)[0]!;
    const evs = run(s, SITE_UNWORKED_ASK_STEPS + 3 * SEC, [{ kind: 'work', player: 0, units: [e.id[w]!], building: site.id, queued: false }]);
    expect(asked(evs, WorkAsk.Site)).toEqual([]);
  });

  it('the idle workers offer to help build it, past the one the site would send', () => {
    const s = world();
    const site = putNear(s, BuildingKind.Storehouse, false);
    const { ev } = untilAsked(s, WorkAsk.Site, SITE_UNWORKED_ASK_STEPS + 3 * SEC);
    const idle = untilAsked(s, WorkAsk.Idle, 2 * SEC);
    expect(idle.ev.text).toBe('Three of us have nothing to do. Shall we help build the storehouse?');
    run(s, 1, [answer(idle.ev, true)]);
    const builders = workers(s).filter((i) => has(s, i, 'work', site.id));
    expect(builders.length).toBe(3);
    // The site's question goes once someone is on it.
    const evs = run(s, 2 * SEC);
    expect(evs.some((x) => x.kind === 'question' && x.ask!.closed && x.ask!.id === ev.ask!.id)).toBe(true);
  });
});

describe('Patch 4: the idle worker farms first', () => {
  it('a farm with a free place within reach takes one, and the rest gather', () => {
    const s = world();
    const farm = putNear(s, BuildingKind.Farm, true);
    const e = s.entities;
    const ws = workers(s);
    run(s, 1, [{ kind: 'assign', player: 0, units: [e.id[ws[0]!]!], building: farm.id, queued: false }]);
    const { ev } = untilAsked(s, WorkAsk.Idle, WORKER_IDLE_ASK_STEPS + 3 * SEC);
    expect(ev.text).toBe('Three of us have nothing to do. Shall we get to work?');
    expect(ev.ask!.yes).toMatch(/^1 farms at the farm \d+ m away and 2 gather what the side needs most, as the Gather button sends them\. Takes nothing from the stock\.$/);
    run(s, 1, [answer(ev, true)]);
    expect(ws.filter((i) => has(s, i, 'job', farm.id)).length).toBe(2);
    expect(ws.filter((i) => ['forage', 'gather'].includes(head(s, i) ?? '')).length).toBe(2);
  });
});

describe('Patch 4: Yes is the same everywhere', () => {
  it('a machine that loaded the game, and never saw the question, does the same on Yes', () => {
    const s = world();
    putNear(s, BuildingKind.Farm, true);
    const { ev } = untilAsked(s, WorkAsk.Farm, FARM_EMPTY_ASK_STEPS + 3 * SEC);
    const copy = deserializeState(serializeState(s));
    run(s, 5 * SEC, [answer(ev, true)]);
    run(copy, 5 * SEC, [answer(ev, true)]);
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('answer orders take the new kinds and nothing past 31', () => {
    const base: AnswerOrder = { kind: 'answer', player: 0, ask: 1, yes: 1, q: WorkAsk.Idle, who: 1, units: [1], res: -1 };
    expect(() => validateOrder(base)).not.toThrow();
    expect(() => validateOrder({ ...base, q: 31 })).not.toThrow();
    expect(() => validateOrder({ ...base, q: 32 })).toThrow();
  });
});
