import { describe, expect, it } from 'vitest';
import {
  addMob,
  BuildingKind,
  buildingCentre,
  createWorld,
  deserializeState,
  diffStates,
  faeLeft,
  FactionKind,
  hurtUnit,
  landAt,
  Mob,
  openQuestions,
  QUEST_REPEAT_STEPS,
  QuestAsk,
  questsView,
  QuestStage,
  Res,
  serializeState,
  settleDeaths,
  spawnBand,
  members,
  step,
  UnitKind,
  WU_PER_METRE,
  type AskInfo,
  type Faction,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function home(s: SimState): [number, number] {
  return buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
}

function worker(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) return i;
  throw new Error('no worker');
}

function place(s: SimState, what: number, dx = 70): Faction {
  const [hx, hz] = home(s);
  const before = new Set(s.peoples.factions.map((f) => f.id));
  run(s, 1, [{ kind: 'debugPeoples', player: 0, what, x: hx + dx * M, z: hz }]);
  return s.peoples.factions.find((g) => g.kind === what && (!before.has(g.id) || what === FactionKind.ElfKingdom))!;
}

/** Stands a unit 4 m from a faction's leader and keeps it there. */
function bring(s: SimState, i: number, f: Faction): void {
  const e = s.entities;
  const l = e.indexOf(f.leader);
  landAt(s, i, e.x[l]! + 4 * M, e.z[l]!);
  e.queue[i] = [];
}

function asked(s: SimState, f: Faction, q: number): AskInfo | undefined {
  return openQuestions(s).find((a) => a.q === q && a.units[0] === f.leader);
}

function answer(s: SimState, a: AskInfo, yes: number): void {
  run(s, 1, [{ kind: 'answer', player: 0, ask: a.id, yes, q: a.q, who: a.units[0]!, units: [...a.units], res: -1 }]);
}

function kill(s: SimState, i: number, by: number): void {
  hurtUnit(s, i, { damage: 100000, from: s.entities.id[by]!, projectile: false, blunt: false, pierce: false, exact: true });
  settleDeaths(s);
}

describe('the peoples\' quests (Patch 5, QV-1 to QV-34)', () => {
  it('the Halfling elder wants a bog pear: taken with a unit near, claimed while the player holds one, back after 20 days', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.HalflingVillage);
    const w = worker(s);
    bring(s, w, f);
    run(s, 40);
    const offer = asked(s, f, QuestAsk.Offer);
    expect(offer, 'the elder offers the quest once met').toBeDefined();
    // Yes with no unit within 15 m: not taken, and the offer comes back.
    landAt(s, w, s.entities.x[w]! + 40 * M, s.entities.z[w]!);
    answer(s, offer!, 1);
    expect(f.quest[0]).toBe(QuestStage.Open);
    bring(s, w, f);
    run(s, 25);
    answer(s, asked(s, f, QuestAsk.Offer)!, 1);
    expect(f.quest[0]).toBe(QuestStage.Taken);
    expect(questsView(s, 0).map((v) => [v.title, v.ready, v.hint])).toEqual([['The Bog Pear', false, "It's in a bog. Duh."]]);
    // A bog pear in the inventory: the claim goes up and stays while the player holds it.
    const pool = s.players[0]!.pool;
    pool[Res.BogPear] = 1;
    const fare = pool[Res.FarmFare]!;
    const stone = pool[Res.Stone]!;
    run(s, 25);
    const claim = asked(s, f, QuestAsk.Claim);
    expect(claim).toBeDefined();
    answer(s, claim!, 1);
    expect(pool[Res.BogPear]).toBe(0);
    expect(pool[Res.FarmFare]).toBe(fare + 50);
    expect(pool[Res.Stone]).toBe(stone + 50);
    expect(f.quest[0]).toBe(QuestStage.Open);
    expect(f.questAt[0]).toBe(s.step - 1 + QUEST_REPEAT_STEPS);
    run(s, 25);
    expect(asked(s, f, QuestAsk.Offer), 'not again for 20 days').toBeUndefined();
  });

  it('the Runkin raid is after the nearest band, done once it is wiped out with the player\'s kills', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.RunkinCamp);
    const w = worker(s);
    bring(s, w, f);
    run(s, 25);
    expect(asked(s, f, QuestAsk.Offer), 'no band, no raid').toBeUndefined();
    const band = spawnBand(s, 0, { tribe: Mob.Kobold, x: f.x + 60 * M, z: f.z })!;
    run(s, 25);
    const offer = asked(s, f, QuestAsk.Offer)!;
    expect(offer).toBeDefined();
    answer(s, offer, 1);
    expect(f.quest[0]).toBe(QuestStage.Taken);
    expect(f.questTarget[0]).toBe(band.id);
    expect(s.events.some((v) => v.kind === 'alert' && v.text.includes('kobolds') && v.x !== undefined)).toBe(true);
    // Killing shifts the units along, so each kill looks the band up afresh.
    for (let left = members(s, band.id); left.length > 0; left = members(s, band.id)) kill(s, left[0]!, w);
    bring(s, w, f);
    run(s, 25);
    expect(f.quest[0]).toBe(QuestStage.Done);
    const leather = s.players[0]!.pool[Res.Leather]!;
    answer(s, asked(s, f, QuestAsk.Claim)!, 1);
    expect(s.players[0]!.pool[Res.Leather]).toBe(leather + 10);
  });

  it('the Elves count Fae Guardians killed after taking the quest; none is offered in a peaceful game', () => {
    const s = createWorld(1);
    const t0 = Date.now();
    expect(faeLeft(s, 2)).toBe(2);
    expect(Date.now() - t0, 'finding two crystals is quick').toBeLessThan(1500);
    expect(faeLeft(createWorld(1, { peaceful: true }), 2)).toBe(0);
    const k = place(s, FactionKind.ElfKingdom);
    const w = worker(s);
    bring(s, w, k);
    run(s, 25);
    answer(s, asked(s, k, QuestAsk.Offer)!, 1);
    expect(k.quest[0]).toBe(QuestStage.Taken);
    for (let n = 0; n < 2; n++) kill(s, addMob(s, Mob.FaeGuardian, 0, s.entities.x[w]! + 3 * M, s.entities.z[w]!, 0), w);
    expect(k.questCount[0]).toBe(2);
    expect(k.quest[0]).toBe(QuestStage.Done);
    // The quest state goes through a save.
    const back = deserializeState(serializeState(s));
    expect(diffStates(s, back)).toBeNull();
    expect(back.peoples.factions.find((g) => g.id === k.id)!.quest[0]).toBe(QuestStage.Done);
  });
});
