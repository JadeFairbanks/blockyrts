import { describe, expect, it } from 'vitest';
import {
  addDreadnought,
  addMage,
  addWarrior,
  bestFirst,
  BuildingKind,
  CLOSE_KITS,
  CRAFT_PACE,
  createWorld,
  deserializeState,
  DREADNOUGHT_GEAR,
  dreadnoughtBlow,
  dreadnoughtTakes,
  FAE_REGAIN_PCT,
  fitProblem,
  fits,
  GEAR,
  GEAR_ITEMS,
  gearSpec,
  GearKind,
  Hit,
  holderOf,
  isGearItem,
  itemGear,
  itemKind,
  itemLine,
  itemRarity,
  itemScore,
  kitKinds,
  Line,
  LOOT_GEAR,
  LOOT_KITS,
  mageRank,
  meleeOf,
  MOBS,
  Mob,
  nextBlow,
  NO_CARRY,
  ownGear,
  PeopleGear,
  piecesCost,
  planPieces,
  Rarity,
  RECIPES,
  refillMages,
  Res,
  RESOURCE_COUNT,
  School,
  SECOND_BLOW,
  serializeState,
  Slot,
  SMASHING_LINE,
  STEPS_PER_SECOND,
  takeOffLine,
  TOOL_GEAR,
  Troop,
  WAND_KITS,
  wearItem,
  type KitHolder,
  type SimState,
} from '../src/index.ts';

// Patch 7's gear catalogue (plan 2.1 to 2.4, 4, 6 and 11): looted pieces, rarity, Heft and Stature, ranking, the
// Dreadnought's rules, the Fae Guardian's mana regain, witchwood, scrapping and saves with goods past 255.

const close = (w = 1): KitHolder => ({ kind: 'warrior', troop: Troop.Close, w, a: 0, s: 0, t: 0 });
const spear = (w = 1): KitHolder => ({ kind: 'warrior', troop: Troop.Long, w, a: 0, s: 0, t: 0 });
const ranger = (w = 1): KitHolder => ({ kind: 'warrior', troop: Troop.Ranger, w, a: 0, s: 0, t: 0 });
const mage = (): KitHolder => ({ kind: 'mage', troop: 0, w: 1, a: 1, s: 0, t: 0 });
const worker = (): KitHolder => ({ kind: 'worker', troop: 0, w: 1, a: 0, s: 0, t: 0 });
const dread = (): KitHolder => ({ kind: 'warrior', troop: Troop.Dreadnought, w: 0, a: 0, s: 0, t: 0 });

function home(s: SimState): { x: number; z: number } {
  const b = s.buildings.list.find((q) => q.owner === 0 && q.kind === BuildingKind.MainBase)!;
  return { x: b.x + 6, z: b.z + 6 };
}

describe('the catalogue (plan 2.1, 4)', () => {
  it('knows every new good from the goblin dagger to the heavy spiked mace as gear, and witchwood as a material', () => {
    for (let r = Res.GoblinDagger; r <= Res.HeavySpikedMace; r++) expect(isGearItem(r), String(r)).toBe(true);
    expect(isGearItem(Res.Witchwood)).toBe(false);
    expect(GEAR_ITEMS).toContain(Res.HeavySpikedMace);
    expect(GEAR_ITEMS).toContain(Res.SteelSideSword);
    expect([...GEAR_ITEMS]).toEqual([...GEAR_ITEMS].sort((a, b) => a - b));
  });

  it('grades pieces by rarity, crappy night mob drops always common', () => {
    for (const r of [Res.GoblinDagger, Res.GoblinSling, Res.GoblinBow, Res.GoblinPlankShield, Res.GoblinLeathers]) expect(itemRarity(r)).toBe(Rarity.Common);
    expect(itemRarity(Res.BarrowKnightLongsword)).toBe(Rarity.Rare);
    expect(itemRarity(Res.FiendCleaver)).toBe(Rarity.Epic);
    expect(itemRarity(Res.HeavySpikedMace)).toBe(Rarity.Epic);
    expect(itemRarity(Res.FaeStarWand)).toBe(Rarity.Legendary);
    expect(itemRarity(Res.MorvathStaff)).toBe(Rarity.Legendary);
  });

  it('sorts pieces into kinds and lines', () => {
    expect(itemKind(Res.GoblinDagger)).toBe(GearKind.OneHanded);
    expect(itemKind(Res.ChainAndHook)).toBe(GearKind.Flail);
    expect(itemKind(Res.KoboldSpear)).toBe(GearKind.Spear);
    expect(itemKind(Res.MinotaurGreatAxe)).toBe(GearKind.Great);
    expect(itemKind(Res.SkeletonRecurveBow)).toBe(GearKind.Ranged);
    expect(itemKind(Res.HollowPriestStaff)).toBe(GearKind.Wand);
    expect(itemKind(Res.HobgoblinShield)).toBe(GearKind.Shield);
    expect(itemKind(Res.BarrowKnightMail)).toBe(GearKind.Armour);
    expect(itemKind(Res.NecromancerRobe)).toBe(GearKind.Robe);
    expect(itemLine(Res.NecromancerRobe)).toBe(Line.Armour);
    expect(itemLine(Res.HobgoblinShield)).toBe(Line.Shield);
    expect(itemLine(Res.SkeletonRecurveBow)).toBe(Line.Weapon);
    expect(itemLine(Res.Witchwood)).toBe(-1);
  });

  it('never gives a looted weapon the blow its mob strikes with (Jade: "there should be almost no situations where they are the same")', () => {
    const pairs: Array<[Res, Mob]> = [
      [Res.GoblinDagger, Mob.GoblinCutter], [Res.GoblinSling, Mob.GoblinSlinger], [Res.GoblinBow, Mob.GoblinArcher],
      [Res.HobgoblinSword, Mob.Hobgoblin], [Res.SkeletonRecurveBow, Mob.SkeletonArcher], [Res.KoboldSpear, Mob.Kobold], [Res.GnollSpear, Mob.Gnoll],
    ];
    for (const [item, mob] of pairs) {
      const row = LOOT_KITS.find((k) => k.item === item)!;
      const hit = row.melee?.damage ?? row.ranged?.damage;
      expect(hit! * 10, String(item)).not.toBe(MOBS.find((m) => m.id === mob)!.damageTenths);
    }
  });

  it('keeps the peoples\' own units on their old numbers: the cudgel and steel side-sword are rows of their own', () => {
    expect(gearSpec(PeopleGear.Cudgel).melee!.damage).toBe(8);
    expect(gearSpec(PeopleGear.SteelSword).melee!.damage).toBe(30);
    expect(gearSpec(PeopleGear.Cudgel).item).toBe(Res.WoodenCudgel);
  });

  it('keeps the tool rows under 256, so tool columns stay one byte', () => {
    for (const rows of TOOL_GEAR) for (const g of rows) expect(g).toBeLessThan(256);
  });
});

describe('fit: Heft and Stature (plan 2.1 to 2.3)', () => {
  it('lets each troop take only its kinds, with a reason for the rest', () => {
    expect(fitProblem(close(), Res.GoblinDagger)).toBe('');
    expect(fitProblem(close(), Res.ChainAndHook)).toBe('');
    expect(fitProblem(spear(), Res.GoblinDagger)).toBe('Only swordsmen use one-handed weapons and flails.');
    expect(fitProblem(close(), Res.KoboldSpear)).toBe('Only spearmen, riders and woodsmen use spears and two-handed weapons.');
    expect(fitProblem(spear(), Res.KoboldSpear)).toBe('');
    expect(fitProblem(close(), Res.SkeletonRecurveBow)).toBe('Only rangers use bows and slings.');
    expect(fitProblem(ranger(), Res.SkeletonRecurveBow)).toBe('');
    expect(fitProblem(ranger(), Res.HobgoblinShield)).toBe('Only swordsmen carry a shield.');
    expect(fitProblem(close(), Res.HollowPriestStaff)).toBe('Only mages use wands.');
    expect(fitProblem(close(), Res.NecromancerRobe)).toBe('Only mages wear robes.');
    expect(fitProblem(mage(), Res.NecromancerRobe)).toBe('');
    expect(fitProblem(mage(), Res.GoblinDagger)).toBe('A mage uses only wands and robes.');
    expect(fitProblem(worker(), Res.GoblinDagger)).toBe('A worker uses only tools.');
    expect(fitProblem(close(), Res.Witchwood)).toBe('That is not something to wear or wield.');
  });

  it('keeps pieces too heavy or too big for a person off a person', () => {
    expect(fitProblem(spear(), Res.MinotaurGreatAxe)).toBe('Too heavy: Heft 134 (up to 125 fits).');
    expect(fitProblem(close(), Res.MinotaurBracers)).toBe('Too big: Stature 36 (16 to 21 fits).');
    expect(fitProblem(close(), Res.HeavySpikedMace)).toBe('Only spearmen, riders and woodsmen use spears and two-handed weapons.');
    expect(fitProblem(spear(), Res.HeavySpikedMace)).toBe('Too heavy: Heft 250 (up to 125 fits).');
  });

  it('gives the Dreadnought only two-handed area weapons within his Heft, and his own size of armour', () => {
    expect(fitProblem(dread(), Res.GoblinDagger)).toBe(SMASHING_LINE);
    expect(fitProblem(dread(), Res.KoboldSpear)).toBe(SMASHING_LINE);
    expect(fitProblem(dread(), Res.HobgoblinShield)).toBe('A Dreadnought carries no shield.');
    expect(fitProblem(dread(), Res.MinotaurGreatAxe)).toBe('');
    expect(fitProblem(dread(), Res.ArchfiendGreatsword)).toBe('');
    expect(fitProblem(dread(), Res.HeavySpikedMace)).toBe('');
    expect(dreadnoughtTakes(Res.MinotaurGreatAxe)).toBe(true);
    expect(dreadnoughtTakes(Res.GoblinDagger)).toBe(false);
    expect(fitProblem(dread(), Res.BogGuardianClub)).toBe('Too heavy, even for a Dreadnought: Heft 351 (up to 340 fits).');
    expect(fitProblem(dread(), Res.MinotaurBracers)).toBe('');
    expect(fitProblem(dread(), Res.FlutedGothicHarness)).toBe('');
    expect(fitProblem(dread(), Res.BarrowKnightMail)).toBe('Too small for a Dreadnought: Stature 20 (24 to 36 fits).');
    expect(fitProblem(dread(), Res.JuggernautPlating)).toBe('Too big, even for a Dreadnought: Stature 42 (24 to 36 fits).');
  });

  it('keeps the pieces that fit nobody off every body', () => {
    for (const r of [Res.BogGuardianClub, Res.MorvathStaff, Res.JuggernautPlating, Res.GoblinLeathers, Res.GoblinChiefHelmet, Res.HalflingIronCap]) {
      for (const h of [close(), spear(), ranger(), mage(), dread()]) expect(fits(h, r), `${r} on ${h.troop}`).toBe(false);
    }
  });
});

describe('ranking by real numbers (plan 2.4)', () => {
  it('ranks a looted piece onto the ladder rung its numbers earn', () => {
    const rung = (r: Res): number => GEAR[ownGear(r)]!.rung;
    expect(rung(Res.GoblinDagger)).toBe(3);
    expect(rung(Res.HobgoblinSword)).toBe(4);
    expect(rung(Res.BarrowKnightLongsword)).toBe(5);
    expect(rung(Res.FiendCleaver)).toBe(8);
    expect(rung(Res.SkeletonRecurveBow)).toBe(4);
  });

  it('lists pieces best first for each holder, the Dreadnought by his smash and sweep in turn', () => {
    expect(bestFirst(close(), [Res.GoblinDagger, Res.FiendCleaver, Res.HobgoblinSword])).toEqual([Res.FiendCleaver, Res.HobgoblinSword, Res.GoblinDagger]);
    // A smash at 1.5 times, then a sweep at its own damage: 1.25 times on average.
    expect(itemScore(Res.MinotaurGreatAxe, dread())).toBe(Math.floor((itemScore(Res.MinotaurGreatAxe) * 2500) / 2000));
    // The mace is his own: nothing on top.
    expect(itemScore(Res.HeavySpikedMace, dread())).toBe(itemScore(Res.HeavySpikedMace));
    expect(bestFirst(dread(), [Res.MinotaurGreatAxe, Res.ArchfiendGreatsword, Res.HeavySpikedMace])).toEqual([Res.HeavySpikedMace, Res.ArchfiendGreatsword, Res.MinotaurGreatAxe]);
  });

});

describe('wearing and taking off (plan 2.1 to 2.3)', () => {
  it('puts a looted piece on at its rung and gives back the piece it had', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = home(s);
    const e = s.entities;
    const i = addWarrior(s, 0, x, z, Troop.Close, 1, 0);
    const off = wearItem(e, i, 'warrior', Res.HobgoblinSword)!;
    expect(off).toEqual([CLOSE_KITS[1]!.items[0]]);
    expect(e.weapon[i]).toBe(ownGear(Res.HobgoblinSword));
    expect(e.wTier[i]).toBe(4);
    expect(holderOf(e, i, 'warrior').wItem).toBe(Res.HobgoblinSword);
    // Wearing another gives the hobgoblin sword back as itself.
    expect(wearItem(e, i, 'warrior', Res.BarrowKnightLongsword)).toEqual([Res.HobgoblinSword]);
    // A piece that does not fit stays in the bag.
    expect(wearItem(e, i, 'warrior', Res.KoboldSpear)).toBeNull();
    expect(takeOffLine(e, i, 'warrior', Line.Weapon)).toEqual([Res.BarrowKnightLongsword]);
    expect(e.wTier[i]).toBe(0);
    expect(takeOffLine(e, i, 'warrior', Line.Armour)).toEqual([]);
  });

  it('lets the Dreadnought swap his mace for a great weapon: a smash at 1.5 times, then a sweep, in turn (Jade)', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = home(s);
    const e = s.entities;
    const i = addDreadnought(s, 0, x, z);
    expect(e.weapon[i]).toBe(DREADNOUGHT_GEAR.mace);
    expect(e.armour[i]).toBe(DREADNOUGHT_GEAR.plate);
    expect(wearItem(e, i, 'warrior', Res.MinotaurGreatAxe)).toEqual([Res.HeavySpikedMace]);
    const row = e.weapon[i]!;
    expect(row).toBe(itemGear(Res.MinotaurGreatAxe, dread()));
    const own = gearSpec(row).melee!.damage;
    e.atkWith[i] = nextBlow(s, i);
    expect(e.atkWith[i]).toBe(Slot.Weapon);
    expect(meleeOf(s, i)).toMatchObject({ damage: Math.floor((own * 1500) / 1000), hit: Hit.Stab });
    e.atkWith[i] = nextBlow(s, i);
    expect(e.atkWith[i]).toBe(SECOND_BLOW);
    expect(meleeOf(s, i)).toMatchObject({ damage: own, hit: Hit.Sweep });
    expect(nextBlow(s, i)).toBe(Slot.Weapon);
    expect(dreadnoughtBlow(gearSpec(row).melee!, true).hit).toBe(Hit.Sweep);
    expect(wearItem(e, i, 'warrior', Res.GoblinDagger)).toBeNull();
    expect(wearItem(e, i, 'warrior', Res.MinotaurBracers)).toEqual([Res.FlutedGothicHarness]);
    expect(takeOffLine(e, i, 'warrior', Line.Weapon)).toEqual([Res.MinotaurGreatAxe]);
    expect(e.weapon[i]).toBe(0);
  });

  it('gives the Fae Guardian\'s wand and robe 25% mana regain each (Jade)', () => {
    expect(FAE_REGAIN_PCT).toBe(25);
    expect(gearSpec(ownGear(Res.FaeStarWand)).wand!.regainPct).toBe(25);
    expect(gearSpec(ownGear(Res.FaeGuardianRobe)).robe!.regainPct).toBe(30 + 25);
    const s = createWorld(1, { peaceful: true });
    const { x, z } = home(s);
    const e = s.entities;
    const i = addMage(s, 0, x, z, School.Support);
    expect(wearItem(e, i, 'mage', Res.FaeStarWand)).not.toBeNull();
    expect(wearItem(e, i, 'mage', Res.FaeGuardianRobe)).not.toBeNull();
    e.mana[i] = 0;
    e.manaAcc[i] = 0;
    refillMages(s);
    expect(e.mana[i]! * 100 + e.manaAcc[i]!).toBe(Math.floor((mageRank(e.rank[i]!).refill * (100 + 25 + 55)) / 100));
  });
});

describe('witchwood and scrapping (plan 6)', () => {
  it('lets witchwood stand in for a mana crystal in a wand recipe', () => {
    const piece = WAND_KITS.find((k) => k.cost.some((alt) => alt.some(([r]) => r === Res.ManaCrystal)))!;
    const pool = new Int32Array(RESOURCE_COUNT);
    for (const alt of piece.cost) for (const [r, n] of alt) if (r !== Res.ManaCrystal) for (const k of kitKinds(r)) pool[k] = n * 2;
    pool[Res.Witchwood] = 20;
    const plan = planPieces([piece], pool);
    expect(plan).not.toBeNull();
    const cost = piecesCost([piece], plan!.ways);
    expect(cost.some(([r]) => r === Res.Witchwood)).toBe(true);
    expect(cost.some(([r]) => r === Res.ManaCrystal)).toBe(false);
  });

  it('scraps every piece at the Workshop in its grade\'s time', () => {
    const scrap = (r: Res) => RECIPES.find((q) => q.scrap === r)!;
    const secs = (r: Res) => scrap(r).steps / (STEPS_PER_SECOND * CRAFT_PACE);
    for (const r of GEAR_ITEMS) expect(scrap(r), String(r)).toBeDefined();
    expect(secs(Res.GoblinDagger)).toBe(10);
    expect(secs(Res.BarrowKnightLongsword)).toBe(30);
    expect(secs(Res.FiendCleaver)).toBe(90);
    expect(secs(Res.FaeStarWand)).toBe(180);
    expect(secs(Res.MorvathStaff)).toBe(240);
    // Casters' staffs give witchwood; iron ingots replace black iron.
    expect(scrap(Res.MorvathStaff).outputs.some(([r]) => r === Res.Witchwood)).toBe(true);
    expect(scrap(Res.MorvathStaff).outputs.some(([r]) => r === Res.IronIngot)).toBe(true);
  });
});

describe('saves with goods and gear rows past 255 (plan 11)', () => {
  it('round-trips the new ids in stock, carried goods and gear slots', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = home(s);
    const e = s.entities;
    s.players[0]!.pool[Res.HeavySpikedMace] = 3;
    s.players[0]!.pool[Res.Witchwood] = 7;
    const i = addWarrior(s, 0, x, z, Troop.Close, 1, 0);
    wearItem(e, i, 'warrior', Res.FiendCleaver);
    e.carryRes[i] = Res.Witchwood;
    const top = Math.max(...LOOT_GEAR);
    expect(e.weapon[i]).toBe(ownGear(Res.FiendCleaver));
    const j = addWarrior(s, 0, x + 2, z, Troop.Close, 1, 0);
    e.armour[j] = top;
    const bytes = serializeState(s);
    const t = deserializeState(bytes);
    expect(t.players[0]!.pool[Res.HeavySpikedMace]).toBe(3);
    expect(t.players[0]!.pool[Res.Witchwood]).toBe(7);
    expect(t.entities.carryRes[i]).toBe(Res.Witchwood);
    expect(t.entities.weapon[i]).toBe(ownGear(Res.FiendCleaver));
    expect(t.entities.armour[j]).toBe(top);
    expect(serializeState(t)).toEqual(bytes);
    expect(NO_CARRY).toBe(0xffff);
  });
});
