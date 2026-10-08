// Patch 2, round 3: questions in bubbles, with Yes and No. A question waits
// 10 s of game time (Jade's Patch 3; 30 s in Patch 2) or until its owner
// answers; one open per unit or building, at most 3 per player; Yes is an
// order every machine runs the same; No or no answer does nothing and the
// question rests. None of it is state: hashes and saves never see it.
import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  Ask,
  askHooks,
  Blocked,
  BuildingKind,
  clockAt,
  createWorld,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  EAT_NUTRITION,
  FIRST_KIT_ASK_STEPS,
  hashState,
  maxHealth,
  Mob,
  NIGHT_STEPS,
  nodeResource,
  onTop,
  openQuestions,
  OPEN_QUESTIONS_PER_PLAYER,
  pendingKitUp,
  Period,
  placeBuilding,
  placementBlocked,
  QUESTION_WAIT_STEPS,
  Res,
  RESOURCES,
  sayUpTop,
  serializeState,
  step,
  STEPS_PER_SECOND,
  UnitKind,
  validateOrder,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type AnswerOrder,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';
import { Line } from '../src/units/kits.ts';

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

/** Steps until a question is asked (not ended) that `want` accepts; returns its event. */
function untilAsked(s: SimState, want: (ev: SimEvent) => boolean, max: number): SimEvent {
  for (let k = 0; k < max; k++) {
    step(s);
    const ev = s.events.find((x) => x.kind === 'question' && !x.ask!.closed && want(x));
    if (ev) return ev;
  }
  throw new Error(`no question in ${max} steps`);
}

/** Every question event over n steps (asked and ended). */
function questionsOver(s: SimState, n: number, orders: Order[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < n; k++) {
    step(s, k === 0 ? orders : []);
    for (const ev of s.events) if (ev.kind === 'question') out.push(ev);
  }
  return out;
}

/** The troops' better-kit question (the workers ask about their tools apart, Jade's Patch 3). */
const troopsKit = (x: SimEvent): boolean => x.ask!.q === Ask.Kit && x.text.includes('better kit');

/** The answer the owner's button sends. */
function answer(ev: SimEvent, yes: boolean): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: yes ? 1 : 0, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res };
}

function units(s: SimState, kind: number, owner = 0): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === owner && e.kind[i] === kind) out.push(i);
  return out;
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

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

/** A new world run to the moment its units may first ask about kit (Jade's Patch 3b: 10 s in), none having asked before it. */
function startWorld(): SimState {
  const s = createWorld(1, { peaceful: true });
  while (s.step < FIRST_KIT_ASK_STEPS) {
    step(s);
    expect(s.events.some((x) => x.kind === 'question' && x.ask!.q === Ask.Kit)).toBe(false);
  }
  return s;
}

/** A world whose starting warriors have no better kit to ask for: nothing but food in the stock. */
function plainWorld(players = 1): SimState {
  const s = createWorld(1, { peaceful: true, players });
  for (const p of s.players) for (const r of RESOURCES) if (r.nutrition === 0) p.pool[r.id] = 0;
  return s;
}

describe('the questions (Patch 2, round 3)', () => {
  it('has the starting warriors ask together for better kit, and Yes sends each to the best the stock pays for', () => {
    const s = startWorld();
    const ev = untilAsked(s, troopsKit, 3 * STEPS_PER_SECOND);
    const warriors = units(s, UnitKind.Warrior);
    expect(ev.text).toBe('Three of us could use better kit. Upgrade?');
    expect(ev.player).toBe(0);
    expect(ev.speaker).toBe(ev.ask!.units[0]);
    expect([...ev.ask!.units].sort()).toEqual(warriors.map((i) => s.entities.id[i]!).sort());
    // The tooltip says what Yes does and what it takes from the stock.
    expect(ev.ask!.yes).toMatch(/^All 3 go to the nearest .* From the stock: .+\.$/);
    expect(ev.ask!.until).toBe(s.step - 1 + QUESTION_WAIT_STEPS);
    run(s, 1, [answer(ev, true)]);
    expect(s.events.some((x) => x.kind === 'question' && x.ask!.id === ev.ask!.id && x.ask!.closed)).toBe(true);
    expect(openQuestions(s).some((a) => a.id === ev.ask!.id)).toBe(false);
    for (const i of warriors) expect(pendingKitUp(s, i, Line.Weapon) ?? pendingKitUp(s, i, Line.Armour)).toBeDefined();
  });

  it('does nothing on No, and asks the same units again only once the stock pays for better', () => {
    const s = startWorld();
    const ev = untilAsked(s, troopsKit, 3 * STEPS_PER_SECOND);
    const queues = units(s, UnitKind.Warrior).map((i) => s.entities.queue[i]!.length);
    const later = questionsOver(s, 60 * STEPS_PER_SECOND, [answer(ev, false)]);
    expect(later.filter((x) => !x.ask!.closed && troopsKit(x))).toEqual([]);
    expect(units(s, UnitKind.Warrior).map((i) => s.entities.queue[i]!.length)).toEqual(queues);
  });

  it('ends an unanswered question after 10 s of game time, on every machine', () => {
    const s = startWorld();
    expect(QUESTION_WAIT_STEPS).toBe(10 * STEPS_PER_SECOND);
    const ev = untilAsked(s, troopsKit, 3 * STEPS_PER_SECOND);
    const asked = s.step;
    let ended = -1;
    for (let k = 0; k < QUESTION_WAIT_STEPS + 5 && ended < 0; k++) {
      step(s);
      if (s.events.some((x) => x.kind === 'question' && x.ask!.id === ev.ask!.id && x.ask!.closed)) ended = s.step;
    }
    expect(ended - asked).toBe(QUESTION_WAIT_STEPS);
    expect(openQuestions(s).some((a) => a.id === ev.ask!.id)).toBe(false);
  });

  it('has a hurt unit ask to eat to heal, and Yes puts a meal in front of its work', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w] = units(s, UnitKind.Worker);
    e.hp[w!] = Math.floor((e.maxHp[w!]! * 6) / 10);
    const ev = untilAsked(s, (x) => x.ask!.q === Ask.Heal, 2 * STEPS_PER_SECOND);
    expect(ev.text).toBe("I'm hurt. Can I eat to heal?");
    expect(ev.speaker).toBe(e.id[w!]);
    expect(ev.ask!.yes).toContain(`From the stock: ${EAT_NUTRITION} food`);
    run(s, 1, [answer(ev, true)]);
    expect(e.queue[w!]![0]!.t).toBe('eat');
  });

  it('asks about a wound once, and again only after the unit was back above 70%', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w] = units(s, UnitKind.Worker);
    e.hp[w!] = Math.floor((e.maxHp[w!]! * 6) / 10);
    const ev = untilAsked(s, (x) => x.ask!.q === Ask.Heal, 2 * STEPS_PER_SECOND);
    const asked = questionsOver(s, 10 * STEPS_PER_SECOND, [answer(ev, false)]).filter((x) => !x.ask!.closed && x.ask!.q === Ask.Heal);
    expect(asked).toEqual([]);
    e.hp[w!] = e.maxHp[w!]!;
    run(s, 2 * STEPS_PER_SECOND);
    e.hp[w!] = Math.floor((e.maxHp[w!]! * 6) / 10);
    expect(untilAsked(s, (x) => x.ask!.q === Ask.Heal, 2 * STEPS_PER_SECOND).speaker).toBe(e.id[w!]);
  });

  it('has one unit speak for the hurt near it', () => {
    const s = plainWorld();
    const e = s.entities;
    const workers = units(s, UnitKind.Worker);
    for (const i of workers) e.hp[i] = Math.floor((e.maxHp[i]! * 5) / 10);
    const ev = untilAsked(s, (x) => x.ask!.q === Ask.Heal, 2 * STEPS_PER_SECOND);
    expect(ev.text).toBe(`${['', '', 'Two', 'Three', 'Four'][ev.ask!.units.length]} of us are hurt. Can we eat to heal?`);
    expect(ev.ask!.units.length).toBeGreaterThan(1);
    // Nobody spoken for asks again on their own.
    const more = questionsOver(s, 3 * STEPS_PER_SECOND).filter((x) => !x.ask!.closed && x.ask!.q === Ask.Heal);
    for (const x of more) for (const id of x.ask!.units) expect(ev.ask!.units).not.toContain(id);
  });

  it('keeps at most 3 questions open for a player, and the next asks once one ends', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w0] = units(s, UnitKind.Worker);
    // Five hurt warriors, 30 m apart, so none speaks for another.
    const far = [0, 1, 2, 3, 4].map((k) => addWarrior(s, 0, e.x[w0!]! + (k - 2) * 30 * WU_PER_METRE, e.z[w0!]! + 40 * WU_PER_METRE));
    for (const i of far) e.hp[i] = Math.floor((e.maxHp[i]! * 5) / 10);
    const seen = questionsOver(s, 3 * STEPS_PER_SECOND);
    expect(openQuestions(s).length).toBe(OPEN_QUESTIONS_PER_PLAYER);
    expect(seen.filter((x) => !x.ask!.closed).length).toBe(OPEN_QUESTIONS_PER_PLAYER);
    const first = seen[0]!;
    const next = questionsOver(s, 2 * STEPS_PER_SECOND, [answer(first, false)]);
    expect(next.some((x) => x.ask!.closed && x.ask!.id === first.ask!.id)).toBe(true);
    expect(next.filter((x) => !x.ask!.closed).length).toBe(1);
    expect(openQuestions(s).length).toBe(OPEN_QUESTIONS_PER_PLAYER);
  });

  it('has a man up top ask to get down to fight, and Yes lets him down to attack', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Tower, h.x + 20, h.z + 4);
    const t = placeBuilding(s, 0, BuildingKind.Tower, 0, x, z, true);
    const i = addWarrior(s, 0, x * WU_PER_COLUMN, (z - 2) * WU_PER_COLUMN);
    const e = s.entities;
    const id = e.id[i]!;
    run(s, 1, [{ kind: 'enter', player: 0, units: [id], building: t.id }]);
    for (let k = 0; k < 3000 && !onTop(s, e.indexOf(id)); k++) step(s);
    const j = e.indexOf(id);
    expect(onTop(s, j)).toBe(true);
    const foe = addMob(s, Mob.Zombie, 0, e.x[j]! + 8 * WU_PER_METRE, e.z[j]!, 0);
    // Whichever warrior's turn it is to be eager: call it as the tower's lookout does, until he is.
    let ev: SimEvent | undefined;
    for (let k = 0; k < 8 && !ev; k++) {
      s.step += 90 * STEPS_PER_SECOND;
      sayUpTop(s, e.indexOf(id), foe);
      ev = s.events.find((x) => x.kind === 'question' && x.ask!.q === Ask.Down);
      s.events.length = 0;
    }
    expect(ev?.text).toBe('Let me down to fight those zombies?');
    run(s, 1, [answer(ev!, true)]);
    const k = e.indexOf(id);
    expect(onTop(s, k)).toBe(false);
    expect(e.queue[k]![0]).toMatchObject({ t: 'attack', id: e.id[foe]! });
  });

  it('has the main base ask at dawn to repair, and Yes sends an idle worker to each building', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Tower, h.x + 16, h.z + 4);
    const t = placeBuilding(s, 0, BuildingKind.Tower, 0, x, z, true);
    t.hp = Math.floor(maxHealth(t) / 2);
    s.step = DAY_STEPS + DUSK_STEPS + NIGHT_STEPS - 1;
    expect(clockAt(s.step + 1).period).toBe(Period.Dawn);
    const ev = untilAsked(s, (x2) => x2.ask!.q === Ask.Repair, 2 * STEPS_PER_SECOND);
    expect(ev.building).toBe(h.id);
    expect(ev.speaker).toBeUndefined();
    expect(ev.text).toBe('One building is damaged. Repair it?');
    run(s, 1, [answer(ev, true)]);
    const e = s.entities;
    const working = units(s, UnitKind.Worker).filter((i) => e.queue[i]![0]?.t === 'work');
    expect(working.length).toBe(1);
    expect(e.queue[working[0]!]![0]).toMatchObject({ t: 'work', b: t.id });
    // Once a dawn.
    const again = questionsOver(s, 20 * STEPS_PER_SECOND).filter((x2) => !x2.ask!.closed && x2.ask!.q === Ask.Repair);
    expect(again).toEqual([]);
  });

  it('has a gatherer that ran out ask to look farther off, and Yes sends it to the nearest within reach', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w] = units(s, UnitKind.Worker);
    askHooks.ranOut(s, w!, Res.SoftwoodLumber);
    const ev = s.events.find((x) => x.kind === 'question' && x.ask!.q === Ask.Farther)!;
    expect(ev.text).toBe('No more softwood nearby. Look farther off?');
    expect(ev.ask!.res).toBe(Res.SoftwoodLumber);
    run(s, 1, [answer(ev, true)]);
    const o = e.queue[w!]![0]!;
    expect(o.t).toBe('gather');
    if (o.t === 'gather') expect(nodeResource(s.world.prop(o.cx, o.cz, o.i, s.step)!.kind)).toBe(Res.SoftwoodLumber);
    expect(s.events.some((x) => x.kind === 'speech' && x.speaker === e.id[w!] && x.text === "I'll fetch softwood from farther off." && x.quiet)).toBe(true);
  });

  it('asks nothing for a player who left', () => {
    const s = plainWorld(2);
    const e = s.entities;
    s.players[1]!.out = 1;
    const left = units(s, UnitKind.Worker, 1);
    expect(left.length).toBeGreaterThan(0);
    for (const i of [...left, ...units(s, UnitKind.Worker, 0)]) e.hp[i] = Math.floor((e.maxHp[i]! * 5) / 10);
    const seen = questionsOver(s, 3 * STEPS_PER_SECOND);
    expect(seen.filter((x) => x.player === 1)).toEqual([]);
    expect(seen.filter((x) => x.player === 0).length).toBeGreaterThan(0);
  });

  it('is not state: a save starts with no questions, and the same answers keep every machine in step', () => {
    const s = startWorld();
    const ev = untilAsked(s, troopsKit, 3 * STEPS_PER_SECOND);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    expect(openQuestions(copy)).toEqual([]);
    // The machine that loaded never saw the question; its Yes still does the same.
    run(s, 1, [answer(ev, true)]);
    run(copy, 1, [answer(ev, true)]);
    expect(hashState(copy)).toBe(hashState(s));
    run(s, 200);
    run(copy, 200);
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('refuses a malformed answer', () => {
    const good: AnswerOrder = { kind: 'answer', player: 0, ask: 1, yes: 1, q: Ask.Kit, who: 5, units: [5], res: -1 };
    expect(() => validateOrder(good)).not.toThrow();
    expect(() => validateOrder({ ...good, yes: 2 })).toThrow();
    expect(() => validateOrder({ ...good, q: 0 })).toThrow();
    // Patch 4: kinds go up to 31 (16 is working through the night).
    expect(() => validateOrder({ ...good, q: 16 })).not.toThrow();
    expect(() => validateOrder({ ...good, q: 32 })).toThrow();
    expect(() => validateOrder({ ...good, res: 256 })).toThrow();
  });
});
