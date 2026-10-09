// Patch 7's drops (plan section 5 and the drop parts of 4.4): a creature that carries a weapon or armour drops one of
// its own now and then, the night waves no longer carry a random piece, and the peoples' fighters drop theirs.
import { describe, expect, it } from 'vitest';
import {
  addMob,
  bagItems,
  buildingCentre,
  BuildingKind,
  createWorld,
  FactionKind,
  fightersOf,
  hurtUnit,
  isGearItem,
  Mob,
  MOBS,
  mobSpec,
  PEOPLE_GEAR_DROP,
  PeopleGear,
  peopleGearDrop,
  Res,
  rollGear,
  settleDeaths,
  SPECIES,
  Species,
  speciesSpec,
  step,
  UnitKind,
  WU_PER_METRE,
  type Faction,
  type GearDrop,
  type Rolled,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

function own(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind) out.push(i);
  return out;
}

/** A people placed by the debug button, 60 m east of the main base. */
function place(s: SimState, what: number): Faction {
  const [hx, hz] = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
  const before = new Set(s.peoples.factions.map((f) => f.id));
  step(s, [{ kind: 'debugPeoples', player: 0, what, x: hx + 60 * M, z: hz }]);
  return s.peoples.factions.find((g) => g.kind === what && !before.has(g.id))!;
}

/** A blow that kills at once, from unit `by` (or from nothing when -1), as a step would settle it. */
function kill(s: SimState, i: number, by: number): void {
  hurtUnit(s, i, { damage: 10_000_000, from: by >= 0 ? s.entities.id[by]! : 0, projectile: false, blunt: false, pierce: false, exact: true });
  settleDeaths(s);
}

/** Whether player 0's side got a good: in a unit's bag, or lying on the ground for it. */
function got(s: SimState, res: number): boolean {
  return own(s, UnitKind.Warrior).some((w) => bagItems(s, w).some(([r]) => r === res)) || s.loot.some((l) => l.res === res && l.owner === 0);
}

/** How many of `n` kills drop a piece from a gear list. */
function piecesIn(s: SimState, gear: readonly GearDrop[], n: number): number {
  let k = 0;
  for (let t = 0; t < n; t++) if (rollGear(s, gear, { items: [], rarestPm: 1000 }) !== undefined) k++;
  return k;
}

describe('a creature\'s own weapons and armour (plan section 5)', () => {
  it('a kill drops at most one piece, each at its own chance, and it counts as a rare find', () => {
    const s = createWorld(1, { peaceful: true });
    const gear: GearDrop[] = [{ res: Res.GoblinDagger, chancePm: 100 }, { res: Res.GoblinPlankShield, chancePm: 50 }];
    const count = new Map<number, number>();
    for (let k = 0; k < 20_000; k++) {
      const rolled: Rolled = { items: [], rarestPm: 1000 };
      const r = rollGear(s, gear, rolled);
      expect(rolled.items.length).toBe(r === undefined ? 0 : 1);
      if (r === undefined) continue;
      count.set(r, (count.get(r) ?? 0) + 1);
      expect(rolled.rarestPm).toBe(r === Res.GoblinDagger ? 100 : 50);
    }
    // 2000 and 1000 on average.
    expect(count.get(Res.GoblinDagger)).toBeGreaterThan(1800);
    expect(count.get(Res.GoblinDagger)).toBeLessThan(2200);
    expect(count.get(Res.GoblinPlankShield)).toBeGreaterThan(850);
    expect(count.get(Res.GoblinPlankShield)).toBeLessThan(1150);
  });

  it('every row\'s pieces are gear, a kill\'s chances add up to no more than every time', () => {
    for (const list of [...MOBS.map((m) => m.gear), ...SPECIES.map((a) => a.gear)]) {
      for (const g of list) expect(isGearItem(g.res), `good ${g.res}`).toBe(true);
      expect(list.reduce((a, g) => a + g.chancePm, 0)).toBeLessThanOrEqual(1000);
    }
    // Plan section 5's own numbers.
    const total = (gear: readonly GearDrop[]): number => gear.reduce((a, g) => a + g.chancePm, 0);
    expect(total(mobSpec(Mob.Necromancer).gear)).toBe(50);
    expect(mobSpec(Mob.BogGuardian).gear).toEqual([{ res: Res.BogGuardianClub, chancePm: 500 }]);
    expect(mobSpec(Mob.Morvath).gear).toEqual([{ res: Res.MorvathStaff, chancePm: 1000 }]);
    expect(mobSpec(Mob.MorvathAloft).gear).toEqual(mobSpec(Mob.Morvath).gear);
    expect(total(speciesSpec(Species.Minotaur).gear)).toBe(100);
    expect(total(mobSpec(Mob.Archfiend).gear)).toBe(30);
  });

  it('the necromancer\'s staff or robe one kill in twenty, the bog guardian\'s club one in two, the minotaur\'s pieces one in ten', () => {
    const s = createWorld(2, { peaceful: true });
    // 200, 500 and 200 on average.
    const necro = piecesIn(s, mobSpec(Mob.Necromancer).gear, 4000);
    expect(necro).toBeGreaterThan(150);
    expect(necro).toBeLessThan(250);
    const bog = piecesIn(s, mobSpec(Mob.BogGuardian).gear, 1000);
    expect(bog).toBeGreaterThan(440);
    expect(bog).toBeLessThan(560);
    const minotaur = piecesIn(s, speciesSpec(Species.Minotaur).gear, 2000);
    expect(minotaur).toBeGreaterThan(150);
    expect(minotaur).toBeLessThan(250);
  });

  it('a night monster drops one of its pieces only now and then: the skeleton archer\'s bow one kill in fifty', () => {
    const s = createWorld(3, { peaceful: true });
    // 200 on average.
    const bows = piecesIn(s, mobSpec(Mob.SkeletonArcher).gear, 10_000);
    expect(bows).toBeGreaterThan(150);
    expect(bows).toBeLessThan(250);
  });

  it('a kill gives the piece to the killer\'s side: Morvath\'s staff every time', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = own(s, UnitKind.Warrior)[0]!;
    const m = addMob(s, Mob.Morvath, 0, e.x[w]! + 2 * M, e.z[w]!, 110);
    kill(s, m, w);
    expect(got(s, Res.MorvathStaff)).toBe(true);
  });
});

describe('the peoples\' fighters (plan sections 4.4 and 5)', () => {
  it('drop one of the pieces they carry one kill in ten, half of them armour; the Dwarves\' crossbow comes off as the steel-prod crossbow', () => {
    const s = createWorld(1);
    const f = place(s, FactionKind.DwarfColony);
    const e = s.entities;
    const xbow = fightersOf(s, f.id).find((i) => e.ranged[i] === PeopleGear.DwarfCrossbow)!;
    expect(xbow).toBeDefined();
    const count = new Map<number, number>();
    for (let k = 0; k < 4000; k++) {
      const r = peopleGearDrop(s, xbow);
      if (r !== undefined) count.set(r, (count.get(r) ?? 0) + 1);
    }
    const all = [...count.values()].reduce((a, n) => a + n, 0);
    // 400 on average, 200 of them its mail.
    expect(all).toBeGreaterThan(330);
    expect(all).toBeLessThan(470);
    expect(count.get(Res.DwarfMail)).toBeGreaterThan(150);
    expect(count.get(Res.DwarfMail)).toBeLessThan(250);
    expect(count.get(Res.SteelProdCrossbow)).toBeGreaterThan(0);
    for (const r of count.keys()) expect(isGearItem(r), `good ${r}`).toBe(true);
  });

  it('a fighter a player\'s unit kills drops its piece as that player\'s loot, at war or not; one nobody of theirs killed drops nothing', () => {
    const was = PEOPLE_GEAR_DROP.chancePm;
    PEOPLE_GEAR_DROP.chancePm = 1000;
    try {
      const s = createWorld(1);
      const f = place(s, FactionKind.DwarfColony);
      const e = s.entities;
      const [a, b] = fightersOf(s, f.id);
      // Not at war: a fall to no one of a player's drops nothing.
      expect(f.war).toBe(0);
      const before = s.loot.length;
      kill(s, b!, -1);
      expect(s.loot.length).toBe(before);
      const w = own(s, UnitKind.Warrior)[0]!;
      const pieces = [e.weapon[a!]!, e.ranged[a!]!, e.armour[a!]!, e.shield[a!]!];
      kill(s, a!, w);
      const loot = [...bagItems(s, w), ...s.loot.filter((l) => l.owner === 0).map((l): [number, number] => [l.res, l.amt])];
      expect(loot.some(([r]) => isGearItem(r))).toBe(true);
      expect(pieces.some((g) => g !== 0)).toBe(true);
    } finally {
      PEOPLE_GEAR_DROP.chancePm = was;
    }
  });
});
