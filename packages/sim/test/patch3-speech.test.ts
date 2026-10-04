// Jade's Patch 3, speech: under-attack lines name the attacker; questions
// wait 10 s; a hurt unit asks to eat only while idle and left alone; a timed
// action's line is in the present tense and its bubble stays while the bar
// runs; at the start the workers ask about their tools as the warriors ask
// about their kit, Yes spends the stock first come first served and never
// more than it holds, and the main base gives its word of advice once.
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addMage,
  addMob,
  addWarrior,
  aFoe,
  Ask,
  createWorld,
  CYCLE_STEPS,
  deserializeState,
  HURT_ASK_QUIET_STEPS,
  hurtUnit,
  Mob,
  openQuestions,
  pendingKitUp,
  PEOPLES,
  PeopleUnit,
  QUESTION_WAIT_STEPS,
  Res,
  RESOURCES,
  School,
  serializeState,
  Species,
  step,
  STEPS_PER_SECOND,
  tinkering,
  UnitKind,
  WILD,
  WU_PER_METRE,
  type AnswerOrder,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';
import { Line } from '../src/units/kits.ts';
import { Role } from '../src/threats/types.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

function run(s: SimState, n: number, orders: Order[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < n; k++) {
    step(s, k === 0 ? orders : []);
    out.push(...s.events);
  }
  return out;
}

function units(s: SimState, kind: number, owner = 0): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === owner && e.kind[i] === kind) out.push(i);
  return out;
}

function answer(ev: SimEvent, yes: boolean): AnswerOrder {
  const a = ev.ask!;
  return { kind: 'answer', player: ev.player, ask: a.id, yes: yes ? 1 : 0, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res };
}

const asked = (evs: SimEvent[], q: number): SimEvent[] => evs.filter((x) => x.kind === 'question' && !x.ask!.closed && x.ask!.q === q);
const closed = (evs: SimEvent[], id: number): boolean => evs.some((x) => x.kind === 'question' && x.ask!.closed && x.ask!.id === id);

/** A world whose stock is food only, so nobody asks about kit. */
function plainWorld(): SimState {
  const s = createWorld(1, { peaceful: true });
  for (const p of s.players) for (const r of RESOURCES) if (r.nutrition === 0) p.pool[r.id] = 0;
  return s;
}

function hit(s: SimState, i: number, from: number): void {
  hurtUnit(s, i, { damage: 1, from: s.entities.id[from]!, projectile: false, blunt: false, pierce: false });
}

describe("under attack (Jade's Patch 3: say what by)", () => {
  it('names the first enemy whose blow made the unit speak', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    run(s, 1);
    const [w] = units(s, UnitKind.Worker);
    const z = addMob(s, Mob.Zombie, 0, e.x[w!]! + 2 * M, e.z[w!]!, 0);
    s.events.length = 0;
    hit(s, w!, z);
    const line = s.events.find((x) => x.kind === 'speech' && x.speaker === e.id[w!]);
    expect(line).toMatchObject({ text: 'Help! I am being attacked by a zombie!', urgent: true });
    // A warrior far off, hurt by an ash golem, once the player's 10 s gap is over.
    s.step += 10 * SEC;
    const [war] = units(s, UnitKind.Warrior);
    const g = addMob(s, Mob.AshGolem, 0, e.x[war!]! + 3 * M, e.z[war!]!, 0);
    s.events.length = 0;
    hit(s, war!, g);
    expect(s.events.find((x) => x.kind === 'speech' && x.speaker === e.id[war!])?.text).toBe('We are under attack from an ash golem!');
    // A mage hurt by a wolf.
    s.step += 10 * SEC;
    const m = addMage(s, 0, e.x[war!]! + 30 * M, e.z[war!]!, School.Battle);
    const wolf = addAnimal(s, Species.Wolf, WILD, e.x[m]! + 2 * M, e.z[m]!, 0, 0);
    // A wild animal is an enemy of the one it goes for.
    e.target[wolf] = e.id[m]!;
    s.events.length = 0;
    hit(s, m, wolf);
    expect(s.events.find((x) => x.kind === 'speech' && x.speaker === e.id[m])?.text).toBe('I am under attack from a wolf!');
  });

  it('names monsters, animals, the peoples and the boss as a sentence does', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const at = (k: number): number => 400 * M + k * 10 * M;
    expect(aFoe(s, addMob(s, Mob.GiantSpider, 0, at(1), at(1), 0))).toBe('a giant spider');
    expect(aFoe(s, addMob(s, Mob.AshGolem, 0, at(2), at(2), 0))).toBe('an ash golem');
    expect(aFoe(s, addMob(s, Mob.Morvath, 0, at(3), at(3), 0))).toBe('Morvath');
    expect(aFoe(s, addAnimal(s, Species.Wolf, WILD, at(4), at(4), 0, 0))).toBe('a wolf');
    // A people's spearman keeps the capital of his people's name.
    const p = addWarrior(s, 0, at(5), at(5));
    e.owner[p] = PEOPLES;
    e.role[p] = Role.People;
    e.mob[p] = PeopleUnit.HalflingSpearman;
    expect(aFoe(s, p)).toBe('a Halfling spearman');
  });
});

describe("questions wait 10 s (Jade's Patch 3)", () => {
  it('is 10 s of game time, the editor value', () => {
    expect(QUESTION_WAIT_STEPS).toBe(10 * SEC);
  });
});

describe("eat to heal only when idle (Jade's Patch 3)", () => {
  it('is not asked while the unit has work, nor while it is being hit, and is asked once it is idle and left alone', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w] = units(s, UnitKind.Worker);
    for (const i of units(s, UnitKind.Worker)) if (i !== w) e.hp[i] = e.maxHp[i]!;
    e.hp[w!] = Math.floor((e.maxHp[w!]! * 6) / 10);
    // Busy: a move order far off.
    const evs = run(s, 3 * SEC, [{ kind: 'move', player: 0, units: [e.id[w!]!], x: e.x[w!]! + 60 * M, z: e.z[w!]! }]);
    expect(asked(evs, Ask.Heal)).toEqual([]);
    // Idle but just hit: it waits until nothing has hurt it for the quiet time.
    e.queue[w!] = [];
    const z = addMob(s, Mob.Zombie, 0, e.x[w!]! + 40 * M, e.z[w!]!, 0);
    hit(s, w!, z);
    e.target[w!] = 0;
    e.chasing[w!] = 0;
    e.queue[w!] = [];
    e.hp[z] = 0;
    const from = s.step;
    let ev: SimEvent | undefined;
    for (let k = 0; k < HURT_ASK_QUIET_STEPS + 2 * SEC && !ev; k++) {
      step(s);
      e.queue[w!] = [];
      ev = asked(s.events, Ask.Heal)[0];
    }
    expect(ev?.speaker).toBe(e.id[w!]);
    expect(s.step - from).toBeGreaterThanOrEqual(HURT_ASK_QUIET_STEPS);
  });

  it('is withdrawn once the unit is given an order or hit, and asked again when it is idle and left alone', () => {
    const s = plainWorld();
    const e = s.entities;
    const [w] = units(s, UnitKind.Worker);
    e.hp[w!] = Math.floor((e.maxHp[w!]! * 6) / 10);
    let ev: SimEvent | undefined;
    for (let k = 0; k < 2 * SEC && !ev; k++) {
      step(s);
      ev = asked(s.events, Ask.Heal).find((x) => x.ask!.units.includes(e.id[w!]!));
    }
    expect(ev).toBeDefined();
    // An order: the question goes at once.
    const evs = run(s, 2, [{ kind: 'move', player: 0, units: [e.id[w!]!], x: e.x[w!]! + 4 * M, z: e.z[w!]! }]);
    expect(closed(evs, ev!.ask!.id)).toBe(true);
    expect(openQuestions(s).some((a) => a.id === ev!.ask!.id)).toBe(false);
    // Idle again: it may ask again about the same wound (a withdrawn question is not a No).
    let again: SimEvent | undefined;
    for (let k = 0; k < 10 * SEC && !again; k++) {
      step(s);
      again = asked(s.events, Ask.Heal).find((x) => x.ask!.units.includes(e.id[w!]!));
    }
    expect(again).toBeDefined();
    // Hit while it asks: the question goes.
    const z = addMob(s, Mob.Zombie, 0, e.x[w!]! + 40 * M, e.z[w!]!, 0);
    hit(s, w!, z);
    expect(closed(run(s, 1), again!.ask!.id)).toBe(true);
  });
});

describe("a timed action's bubble (Jade's Patch 3: present tense, up while the bar runs)", () => {
  it('says what it is upgrading to as it sits down, held for the bar, and says it is done only after its last piece', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [hero] = units(s, UnitKind.Warrior);
    pool.fill(0);
    // A flint hand-axe and a leather jerkin with a wooden shield.
    pool[Res.Sticks] = 2;
    pool[Res.Flint] = 1;
    pool[Res.Leather] = 4;
    pool[Res.Planks] = 3;
    const id = e.id[hero!]!;
    const said: Array<{ text: string; hold: string | undefined; sitting: boolean }> = [];
    let evs = run(s, 1, [{ kind: 'upgradeEquipment', player: 0, units: [id] }]);
    for (let k = 0; k < 6000 && !(e.wTier[hero!] === 2 && e.aTier[hero!] === 1 && e.queue[hero!]!.length === 0); k++) {
      for (const x of evs) if (x.kind === 'speech' && x.speaker === id) said.push({ text: x.text, hold: x.hold, sitting: tinkering(s, hero!) });
      evs = run(s, 1);
    }
    for (const x of evs) if (x.kind === 'speech' && x.speaker === id) said.push({ text: x.text, hold: x.hold, sitting: tinkering(s, hero!) });
    const lines = said.filter((x) => !x.text.startsWith('Off to'));
    expect(lines.map((x) => x.text)).toEqual(['Upgrading to flint hand-axe.', 'Upgrading to leather jerkin.', 'Upgraded to leather jerkin.']);
    // The present-tense lines come as the bar starts and are held for it.
    expect(lines.slice(0, 2).every((x) => x.hold === 'bar' && x.sitting)).toBe(true);
    expect(lines[2]!.hold).toBeUndefined();
  });
});

describe("the start's two upgrade questions (Jade's Patch 3)", () => {
  function start(): { s: SimState; kit: SimEvent; tools: SimEvent; advice: SimEvent[]; evs: SimEvent[] } {
    const s = createWorld(1, { peaceful: true });
    const evs = run(s, 3 * SEC);
    const kits = asked(evs, Ask.Kit);
    const kit = kits.find((x) => x.text.includes('better kit'))!;
    const tools = kits.find((x) => x.text.includes('better tools'))!;
    const advice = evs.filter((x) => x.kind === 'speech' && x.building !== undefined);
    return { s, kit, tools, advice, evs };
  }

  it('has the workers ask about their tools as the warriors ask about their kit', () => {
    const { s, kit, tools } = start();
    const e = s.entities;
    expect(kit.text).toBe('Three of us could use better kit. Upgrade?');
    expect(tools.text).toBe('Four of us could use better tools. Upgrade?');
    expect([...tools.ask!.units].sort()).toEqual(units(s, UnitKind.Worker).map((i) => e.id[i]!).sort());
    // The start's stock pays for three workers' tools: the tooltip says so.
    expect(tools.ask!.yes).toBe(
      'The stock pays for 3 of the 4, the highest rank first: they go to the nearest Forge, Barracks or main base and take the best tools it pays for; the rest keep their tools. From the stock: 18 hardwood sticks, 3 flint, 15 stone.',
    );
  });

  it('has the main base give its word of advice once, as the tools question comes, held twice as long', () => {
    const { s, tools, advice, evs } = start();
    expect(advice.length).toBe(1);
    expect(advice[0]).toMatchObject({ text: 'If you upgrade all their tools you may not be able to make any structures right away, choose wisely.', hold: 'long' });
    expect(advice[0]!.urgent).toBeFalsy();
    // The same step as the tools question.
    const at = (x: SimEvent): number => evs.indexOf(x);
    expect(Math.abs(at(advice[0]!) - at(tools))).toBeLessThan(4);
    // Never again in that game, even when the tools are asked about again.
    const e = s.entities;
    const later = run(s, 2, [answer(tools, false)]);
    for (const i of units(s, UnitKind.Worker)) e.wTier[i] = 1;
    const pool = s.players[0]!.pool;
    pool[Res.Flint] = pool[Res.Flint]! + 50;
    later.push(...run(s, 3 * SEC));
    expect(later.filter((x) => x.kind === 'speech' && x.building !== undefined)).toEqual([]);
  });

  it('gives no word of advice after the first day', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = CYCLE_STEPS;
    const evs = run(s, 3 * SEC);
    expect(asked(evs, Ask.Kit).some((x) => x.text.includes('better tools'))).toBe(true);
    expect(evs.filter((x) => x.kind === 'speech' && x.building !== undefined)).toEqual([]);
  });

  /** The upgrades a player's units have under way, by entity id: "weapon tier/armour tier" (0 for none). */
  function pending(s: SimState): Map<number, string> {
    const e = s.entities;
    const out = new Map<number, string>();
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== 0) continue;
      const w = pendingKitUp(s, i, Line.Weapon)?.to ?? 0;
      const a = pendingKitUp(s, i, Line.Armour)?.to ?? 0;
      if (w || a) out.set(e.id[i]!, `${w}/${a}`);
    }
    return out;
  }

  for (const order of ['warriors first', 'workers first', 'both in one step'] as const) {
    it(`spends the stock first come first served and never more than it holds (${order})`, () => {
      const { s, kit, tools } = start();
      const pool = s.players[0]!.pool;
      const a = order === 'workers first' ? tools : kit;
      const b = order === 'workers first' ? kit : tools;
      // What the first group answered gets when it is the only Yes.
      const alone = deserializeState(serializeState(s));
      run(alone, 1, [answer(a, true)]);
      const firstAlone = pending(alone);
      if (order === 'both in one step') run(s, 1, [answer(a, true), answer(b, true)]);
      else {
        run(s, 1, [answer(a, true)]);
        run(s, 1, [answer(b, true)]);
      }
      // Never more than the stock held: nothing below zero.
      for (let r = 0; r < pool.length; r++) expect(pool[r]).toBeGreaterThanOrEqual(0);
      // The first Yes takes all it would have alone; the second gets only what is left.
      const both = pending(s);
      for (const [id, tiers] of firstAlone) expect(both.get(id)).toBe(tiers);
      expect(both.size).toBeGreaterThan(firstAlone.size);
      // Each upgrade under way is paid for, and what the stock lost is what they paid (the old kit comes back only when the new goes on).
      const e = s.entities;
      for (let i = 0; i < e.count; i++) for (const o of e.queue[i]!) if (o.t === 'kitUp') expect(o.paid).toBe(1);
    });
  }
});
