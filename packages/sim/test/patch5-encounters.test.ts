// Jade's Patch 5 stone circle keepers (split section 20, picks in
// blueprint/patch5-mobs-picks.md): the Great White Ape's warning, Sorry and
// rage and his goods (SCA-1 to SCA-4), Silenus' sabretooth and his return
// (SCS-5), the Lich's raised dead and Touch of the Grave (SCB-1 to SCB-3),
// and the Headless God Idol turning a player's waves on a faction (SCB-4).

import { describe, expect, it } from 'vitest';
import {
  APE_ASK,
  buildingCentre,
  CircleAct,
  circleSites,
  circlesView,
  CircleType,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  Disturb,
  disturbed,
  DUSK_STEPS,
  ENCOUNTERS,
  EncounterAsk,
  encounterOf,
  EncounterMode,
  FactionKind,
  graveNow,
  hashState,
  headlessTargets,
  hostile,
  hurtUnit,
  MarkKind,
  Mob,
  nextNight,
  openQuestions,
  putMark,
  Res,
  Role,
  serializeState,
  settleDeaths,
  Status,
  step,
  UnitKind,
  useProblem,
  type CircleSite,
  type Encounter,
  type SimState,
} from '../src/index.ts';

const SEC = 20;

/** A seed's world, waves and all, with a circle of a type, and that circle. */
function withCircle(type: number): { s: SimState; c: CircleSite } {
  for (let seed = 1; seed < 60; seed++) {
    const s = createWorld(seed, { players: 2, peaceful: false });
    const c = circleSites(s.world.layout).find((x) => x.type === type);
    if (c) return { s, c };
  }
  throw new Error('no seed with that circle');
}

/** Puts player 0's first worker 8 m from a circle's middle and runs until its keepers come. */
function wakeAt(s: SimState, c: CircleSite): { w: number; r: Encounter } {
  const e = s.entities;
  const w = e.indexOf(1);
  e.x[w] = c.x + 8 * 8000;
  e.z[w] = c.z;
  e.y[w] = s.world.groundY(e.x[w]!, e.z[w]!, 0);
  for (let k = 0; k < 4 * SEC && s.threats.encounters.length === 0; k++) step(s);
  const r = s.threats.encounters.find((x) => x.circle === c.id);
  if (!r) throw new Error('no keepers came');
  return { w: e.indexOf(1), r };
}

function members(s: SimState, r: Encounter, mob: number): number[] {
  const e = s.entities;
  return [...Array(e.count).keys()].filter((j) => e.hp[j]! > 0 && e.mob[j] === mob && e.kind[j] === UnitKind.Mob && encounterOf(s, j) === r);
}

describe('the Great White Ape (SCA-1 to SCA-4)', () => {
  it('comes to his circle, at peace, warns a looter, stands down at Sorry and rages at the next wrong', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const { w, r } = wakeAt(s, c);
    const e = s.entities;
    const ape = e.indexOf(r.leader);
    expect(e.mob[ape]).toBe(Mob.GreatWhiteApe);
    expect(e.role[ape]).toBe(Role.Encounter);
    // Calm, nobody's foe: the players' troops leave him be.
    expect(hostile(s, w, ape)).toBe(false);
    expect(circlesView(s, 0, []).apes[0]).toMatchObject({ id: r.leader, circle: c.id, peace: true, why: '' });
    // A chest taken from: his warning, put to the player as Yes or No.
    disturbed(s, c.id, w, Disturb.Chest);
    expect(r.mode).toBe(EncounterMode.Warning);
    const q = openQuestions(s).find((x) => x.q === EncounterAsk.Warn)!;
    expect([q.yes, q.no]).toEqual([APE_ASK.yes, APE_ASK.no]);
    expect(s.events.find((x) => x.kind === 'question' && x.ask?.id === q.id)!.text).toBe(APE_ASK.text);
    expect(circlesView(s, 0, []).apes[0]!.why).toBe('Answer the Great White Ape first.');
    // "Sorry!": he stands down.
    step(s, [{ kind: 'answer', player: 0, ask: q.id, yes: 0, q: q.q, who: r.leader, units: q.units, res: -1 }]);
    expect(r.mode).toBe(EncounterMode.Calm);
    expect(r.sorry & 1).toBe(1);
    expect(r.foes).toBe(0);
    // Looting again after a Sorry: rage, and he runs.
    disturbed(s, c.id, w, Disturb.Trilithon);
    expect(r.mode).toBe(EncounterMode.Fighting);
    expect(r.foes & 1).toBe(1);
    expect(hostile(s, w, ape)).toBe(true);
    expect(s.hits.some((h) => h.look === 'enrage' && h.id === r.leader)).toBe(true);
    expect(circlesView(s, 0, []).apes[0]).toMatchObject({ peace: false, why: 'The Great White Ape is enraged with you.' });
    // The other player is no foe of his.
    expect(r.foes & 2).toBe(0);
  });

  it('rages at once when the idol is taken', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const { w, r } = wakeAt(s, c);
    disturbed(s, c.id, w, Disturb.Idol);
    expect(r.mode).toBe(EncounterMode.Fighting);
    expect(r.foes & 1).toBe(1);
    expect(openQuestions(s).some((x) => x.q === EncounterAsk.Warn)).toBe(false);
  });

  it('sells a bundle of fruit for a silver, three bundles a day', () => {
    const { s, c } = withCircle(CircleType.Lunar);
    const { r } = wakeAt(s, c);
    const pool = s.players[0]!.pool;
    pool[Res.Silver] = 1;
    const fruit = pool[Res.HawthorneFruit]!;
    step(s, [{ kind: 'circle', player: 0, units: [1], circle: c.id, act: CircleAct.Buy, arg: 0 }]);
    for (let k = 0; k < 40 * SEC && pool[Res.HawthorneFruit] === fruit; k++) step(s);
    expect(pool[Res.HawthorneFruit]).toBe(fruit + ENCOUNTERS.ape.goods.fruit);
    expect(pool[Res.Silver]).toBe(0);
    expect(r.fruit).toBe(ENCOUNTERS.ape.goods.perDay - 1);
    expect(circlesView(s, 0, []).apes[0]!.left).toEqual([2, 3, 3]);
    expect(useProblem(s, 0, Res.HeadlessIdol)).toBe('You have no Headless God Idol.');
  });
});

describe('Silenus and his satyrs (SCS-1 to SCS-5, answer 8)', () => {
  it('becomes a sabretooth below half health, and comes back with his health when it falls', () => {
    const { s, c } = withCircle(CircleType.Silenus);
    const { w, r } = wakeAt(s, c);
    const e = s.entities;
    const band = ENCOUNTERS.silenus.band[c.tier >= 3 ? 1 : 0]!;
    expect(members(s, r, Mob.SatyrTrickster).length).toBe(band[0]);
    expect(members(s, r, Mob.SatyrReveler).length).toBe(band[1]);
    const i = e.indexOf(r.leader);
    // Reveling: at peace until attacked or the circle is looted.
    expect(hostile(s, w, i)).toBe(false);
    disturbed(s, c.id, w, Disturb.Chest);
    expect(r.mode).toBe(EncounterMode.Fighting);
    expect(hostile(s, w, i)).toBe(true);
    const low = Math.floor(e.maxHp[i]! * 0.4);
    e.hp[i] = low;
    for (let k = 0; k < 2 * SEC && e.mob[i] !== Mob.Sabretooth; k++) step(s);
    const t = e.indexOf(r.leader);
    expect(e.mob[t]).toBe(Mob.Sabretooth);
    expect(r.heldHp).toBe(low);
    hurtUnit(s, t, { damage: 100000, from: 0, projectile: false, blunt: false, pierce: false, exact: true });
    settleDeaths(s);
    const back = e.indexOf(r.leader);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(e.mob[back]).toBe(Mob.Silenus);
    expect(e.hp[back]).toBe(low);
  });
});

describe('the Lich (SCB-1 to SCB-3)', () => {
  it('stands among five necromancers, who raise ten dead once when his fight begins', () => {
    const { s, c } = withCircle(CircleType.Boneyard);
    const { w, r } = wakeAt(s, c);
    expect(members(s, r, Mob.Necromancer).length).toBe(ENCOUNTERS.lich.necromancers);
    // Hostile to every player.
    expect(hostile(s, w, s.entities.indexOf(r.leader))).toBe(true);
    disturbed(s, c.id, w, Disturb.Chest);
    expect(r.foes).toBe(3);
    const raised = (mob: number): number => members(s, r, mob).length;
    expect([raised(Mob.SkeletonArcher), raised(Mob.BarrowKnight), raised(Mob.SkeletonBomber)]).toEqual([4, 4, 2]);
    // Once only.
    disturbed(s, c.id, w, Disturb.Trilithon);
    expect(raised(Mob.SkeletonArcher)).toBe(4);
  });

  it('Touch of the Grave hurts 3 every 5 s but never below 2 health, and is saved', () => {
    const s = createWorld(1, { players: 1, peaceful: false });
    const e = s.entities;
    const w = e.indexOf(1);
    e.hp[w] = 6;
    // Nothing heals by itself meanwhile (as in a plague bearer's miasma).
    e.sickUntil[w] = s.step + 1_000_000;
    const g = ENCOUNTERS.lich.grave;
    putMark(s, e.id[w]!, MarkKind.Grave, s.step + g.lastS * SEC, 0, s.step + g.everyS * SEC);
    expect(graveNow(s, w)).toBe(true);
    for (let k = 0; k <= g.everyS * SEC; k++) step(s);
    expect(e.hp[e.indexOf(1)]).toBe(3);
    const loaded = deserializeState(serializeState(s));
    expect(hashState(loaded)).toBe(hashState(s));
    expect(loaded.threats.marks).toEqual(s.threats.marks);
    expect(loaded.threats.encounters).toEqual(s.threats.encounters);
    for (let k = 0; k < 3 * g.everyS * SEC; k++) step(s);
    expect(e.hp[e.indexOf(1)]).toBe(2);
  });
});

describe('the Headless God Idol (SCB-4)', () => {
  it('turns the coming night’s waves on a faction, declaring war, once every 15 nights', () => {
    const s = createWorld(1, { players: 1, peaceful: false });
    const base = s.buildings.list.find((b) => b.owner === 0)!;
    const [hx, hz] = buildingCentre(base);
    step(s, [{ kind: 'debugPeoples', player: 0, what: FactionKind.HalflingVillage, x: hx + 140 * 8000, z: hz }]);
    const f = s.peoples.factions.find((x) => x.kind === FactionKind.HalflingVillage && x.built && x.status === Status.Settled)!;
    expect(useProblem(s, 0, Res.HeadlessIdol, -1, f.id)).toBe('You have no Headless God Idol.');
    s.players[0]!.pool[Res.HeadlessIdol] = 1;
    f.seen |= 1;
    const target = headlessTargets(s, 0).find((x) => x.id === f.id)!;
    expect(useProblem(s, 0, Res.HeadlessIdol, -1, target.id)).toBe('');
    step(s, [{ kind: 'useItem', player: 0, res: Res.HeadlessIdol, unit: -1, arg: target.id }]);
    const night = nextNight(s.step);
    expect(s.circles.headless[0]).toBe(night);
    expect(s.circles.headlessFaction[0]).toBe(target.id);
    expect(target.war & 1).toBe(1);
    expect(useProblem(s, 0, Res.HeadlessIdol, -1, target.id)).toBe(`The idol can unleash your waves again in 15 nights.`);
    expect(circlesView(s, 0, []).headless).toEqual([[target.id, true]]);
    // Nightfall: the waves come round the faction, theirs to fall on.
    while (s.step % CYCLE_STEPS < DAY_STEPS + DUSK_STEPS + 30 * SEC) step(s);
    const e = s.entities;
    const unleashed = [...Array(e.count).keys()].filter((j) => e.kind[j] === UnitKind.Mob && e.hp[j]! > 0 && e.role[j] === Role.Unleashed);
    expect(unleashed.length).toBeGreaterThan(0);
    expect(unleashed.every((j) => e.group[j] === target.id)).toBe(true);
  });
});
