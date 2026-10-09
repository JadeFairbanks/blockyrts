// Patch 7 (plan section 4.5; Jade, 22:04 and 22:08 UTC 2026-10-09): the
// special effects of the epic and legendary looted pieces, and the two
// trophies placed anywhere as a small item with a 15 m reach. Picks in
// blueprint/patch7/loot-effects-picks.md.
import { describe, expect, it } from 'vitest';
import {
  addMage,
  addMob,
  addWarrior,
  armourOf,
  BOG_TROPHY,
  buildingCentre,
  BuildingKind,
  buildingSpec,
  createWorld,
  DAY_STEPS,
  dealt,
  DUSK_STEPS,
  effectAttackBp,
  effectMoveBp,
  effectSightWu,
  effectWorkBp,
  FAE_SET,
  FAR_SIGHT,
  FURY,
  gearEffect,
  hexed,
  hurtBuilding,
  hurtUnit,
  isTrophy,
  itemEffect,
  ownGear,
  LOOT_EFFECTS,
  LootEffect,
  Mob,
  mobSlowBp,
  moveSpeed,
  placeBuilding,
  placementBlocked,
  Blocked,
  REAPER,
  Res,
  Role,
  School,
  settleDeaths,
  shotArmourCutBp,
  sightOf,
  spellPowerBp,
  step,
  trophyReach,
  Troop,
  UnitKind,
  updateLootEffects,
  VICTORS_TROPHY,
  WARLORD,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): void {
  for (let k = 0; k < max; k++) {
    if (done()) return;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

/** A peaceful world and a spot a little east of its main base, wu. */
function setup(): { s: SimState; x: number; z: number } {
  const s = createWorld(1, { peaceful: true });
  const base = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  const [x, z] = buildingCentre(base);
  return { s, x: x + 30 * M, z };
}

/** A column near the main base where a building of a kind can go (as m2.test.ts finds one). */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = s.buildings.list.find((o) => o.owner === 0 && o.kind === BuildingKind.MainBase)!;
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + 16 + dx, b.z + dz) === Blocked.None) return [b.x + 16 + dx, b.z + dz];
      }
    }
  }
  throw new Error('no free spot');
}

/** The grid as the next step sees it, after units were added by hand. */
function regrid(s: SimState): void {
  s.grid.rebuild(s.entities);
}

/** A finished trophy of player 0 on the column under (x, z), wu. */
function plant(s: SimState, kind: number, x: number, z: number): Building {
  return placeBuilding(s, 0, kind, 0, Math.floor(x / WU_PER_COLUMN), Math.floor(z / WU_PER_COLUMN), true);
}

describe('Patch 7: the effects ride on the looted pieces', () => {
  it('puts each effect on its piece, and none on the ladder', () => {
    const want: Array<[Res, number]> = [
      [Res.FiendCleaver, LootEffect.Fury],
      [Res.ArchfiendGreatsword, LootEffect.Warlord],
      [Res.ElfGlaive, LootEffect.Reaper],
      [Res.ElfLongbow, LootEffect.FarSight],
      [Res.FaeStarWand, LootEffect.FaeSet],
      [Res.FaeGuardianRobe, LootEffect.FaeSet],
    ];
    for (const [res, fx] of want) {
      expect(gearEffect(ownGear(res)), `${res}`).toBe(fx);
      expect(itemEffect(res)).toBe(fx);
    }
    expect(itemEffect(Res.BogGuardianClub)).toBe(LootEffect.BogTrophy);
    expect(itemEffect(Res.MorvathStaff)).toBe(LootEffect.VictorsTrophy);
    const { s } = setup();
    const w = addWarrior(s, 0, 0, 0, Troop.Close, 5, 5, 5);
    expect(gearEffect(s.entities.weapon[w]!)).toBe(LootEffect.None);
    for (const spec of LOOT_EFFECTS.slice(1)) expect(spec.text).not.toMatch(/undefined|NaN/);
  });
});

describe('Fury (the fiend cleaver)', () => {
  it('makes its holder attack 20% faster only below half health', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const w = addWarrior(s, 0, x, z);
    e.weapon[w] = ownGear(Res.FiendCleaver);
    expect(hexed(s, w, 120)).toBe(120);
    e.hp[w] = Math.floor((e.maxHp[w]! * FURY.underPm) / 1000);
    expect(hexed(s, w, 120)).toBe(120);
    e.hp[w] = e.hp[w]! - 1;
    expect(effectAttackBp(s, w)).toBe(FURY.attackBp);
    expect(hexed(s, w, 120)).toBe(100);
  });
});

describe('Warlord (the archfiend greatsword)', () => {
  it('gives its holder and the troops within 15 m 10% more damage, but not workers or farther troops', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const holder = addWarrior(s, 0, x, z);
    e.weapon[holder] = ownGear(Res.ArchfiendGreatsword);
    const near = addWarrior(s, 0, x + 14 * M, z);
    const far = addWarrior(s, 0, x + 16 * M, z);
    const worker = e.indexOf(1);
    e.x[worker] = x + 2 * M;
    e.z[worker] = z;
    regrid(s);
    const base = dealt(s, far, 100);
    expect(dealt(s, holder, 100)).toBe(base + WARLORD.damageBp / 100);
    expect(dealt(s, near, 100)).toBe(base + WARLORD.damageBp / 100);
    expect(dealt(s, worker, 100)).toBe(100);
    // Two greatswords in reach count once.
    const second = addWarrior(s, 0, x + 13 * M, z);
    e.weapon[second] = ownGear(Res.ArchfiendGreatsword);
    regrid(s);
    expect(dealt(s, near, 100)).toBe(base + WARLORD.damageBp / 100);
  });
});

describe('Reaper (the Elf glaive)', () => {
  it('makes its holder move 10% faster and keeps its critical hits', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const w = addWarrior(s, 0, x, z, Troop.Long);
    e.weapon[w] = ownGear(Res.ElfGlaive);
    expect(effectMoveBp(s, w)).toBe(REAPER.moveBp);
    expect(LOOT_EFFECTS[LootEffect.Reaper]!.text).toMatch(/Critical hits/);
  });
});

describe('Far sight (the Elf longbow)', () => {
  it('lets its arrows ignore 20% of armour and its holder see 5 m farther at dusk and night', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const r = addWarrior(s, 0, x, z, Troop.Ranger, 3);
    const plain = addWarrior(s, 0, x, z, Troop.Ranger, 3);
    e.ranged[r] = ownGear(Res.ElfLongbow);
    expect(shotArmourCutBp(s, r)).toBe(FAR_SIGHT.armourCutBp);
    expect(shotArmourCutBp(s, plain)).toBe(0);
    s.step = 10;
    expect(effectSightWu(s, r)).toBe(0);
    s.step = DAY_STEPS + DUSK_STEPS + 10;
    expect(effectSightWu(s, r)).toBe(FAR_SIGHT.darkSight);
    expect(sightOf(s, r)).toBeGreaterThan(sightOf(s, plain));
    // The arrow: a cut of the armour it meets, so more gets through.
    const a = addMob(s, Mob.Morvath, 0, x + 40 * M, z, 1);
    const b = addMob(s, Mob.Morvath, 0, x + 40 * M, z + 10 * M, 1);
    const blow = { damage: 100, from: e.id[r]!, projectile: true, blunt: false, pierce: true };
    const hpA = e.hp[a]!;
    const hpB = e.hp[b]!;
    hurtUnit(s, a, blow);
    hurtUnit(s, b, { ...blow, armourCutBp: FAR_SIGHT.armourCutBp });
    expect(hpB - e.hp[b]!).toBeGreaterThan(hpA - e.hp[a]!);
  });
});

describe('the Fae set (the Fae star wand and the Fae Guardian robe)', () => {
  it('heals the units within 8 m of a mage wearing both, 1 health every 3 s, once each however many such mages', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const m = addMage(s, 0, x, z, School.Support);
    e.weapon[m] = ownGear(Res.FaeStarWand);
    e.armour[m] = ownGear(Res.FaeGuardianRobe);
    const m2 = addMage(s, 0, x + M, z, School.Support);
    e.weapon[m2] = ownGear(Res.FaeStarWand);
    e.armour[m2] = ownGear(Res.FaeGuardianRobe);
    const half = addMage(s, 0, x + 30 * M, z, School.Support);
    e.weapon[half] = ownGear(Res.FaeStarWand);
    const near = addWarrior(s, 0, x + 5 * M, z);
    const far = addWarrior(s, 0, x + 12 * M, z);
    const byHalf = addWarrior(s, 0, x + 31 * M, z);
    for (const i of [m, near, far, byHalf]) e.hp[i] = e.maxHp[i]! - 5;
    const before = [m, near, far, byHalf].map((i) => e.hp[i]!);
    regrid(s);
    // Off the beat nothing happens; on it, each one in reach heals once.
    s.step = FAE_SET.everySteps + 1;
    runEffects(s);
    expect([m, near, far, byHalf].map((i) => e.hp[i]!)).toEqual(before);
    s.step = FAE_SET.everySteps * 2;
    runEffects(s);
    expect(e.hp[m]).toBe(before[0]! + FAE_SET.heal);
    expect(e.hp[near]).toBe(before[1]! + FAE_SET.heal);
    expect(e.hp[far]).toBe(before[2]);
    expect(e.hp[byHalf]).toBe(before[3]);
    // Never past full.
    e.hp[near] = e.maxHp[near]!;
    s.step = FAE_SET.everySteps * 3;
    runEffects(s);
    expect(e.hp[near]).toBe(e.maxHp[near]);
  });
});

/** The loot effects' own step (step.ts calls it after the mages' mana). */
function runEffects(s: SimState): void {
  updateLootEffects(s);
}

describe('the trophies', () => {
  it('are small walkable items placed anywhere explored, costing the piece itself', () => {
    for (const kind of [BuildingKind.BogTrophy, BuildingKind.VictorsTrophy]) {
      const spec = buildingSpec(kind);
      expect(isTrophy(kind)).toBe(true);
      expect(spec.w * spec.d).toBe(1);
      expect(spec.levels[0]!.cost).toEqual([[spec.trophy!.item, 1]]);
      expect(trophyReach(kind)).toBe(15 * M);
    }
    expect(isTrophy(BuildingKind.TorchPost)).toBe(false);
  });

  it('are built from the stock, picked up whole and planted again, and come back to the stock when knocked down', () => {
    const { s } = setup();
    const pool = s.players[0]!.pool;
    pool[Res.BogGuardianClub] = 1;
    const [cx, cz] = freeSpot(s, BuildingKind.BogTrophy);
    const x = (cx + 0.5) * WU_PER_COLUMN;
    const z = (cz + 0.5) * WU_PER_COLUMN;
    run(s, 1, [{ kind: 'build', player: 0, units: [1], building: BuildingKind.BogTrophy, variant: 0, x: cx, z: cz }]);
    runUntil(s, () => s.buildings.list.some((b) => b.kind === BuildingKind.BogTrophy && b.complete), 3000);
    expect(pool[Res.BogGuardianClub]).toBe(0);
    const t = s.buildings.list.find((b) => b.kind === BuildingKind.BogTrophy)!;
    // Its own column is walkable, and no other building can go on it.
    expect(s.buildings.solidAt(cx, cz)).toBe(0);
    expect(placementBlocked(s, 0, BuildingKind.TorchPost, cx, cz)).toBe(Blocked.Building);
    run(s, 1, [{ kind: 'cancelBuild', player: 0, building: t.id }]);
    expect(s.buildings.get(t.id)).toBeUndefined();
    expect(pool[Res.BogGuardianClub]).toBe(1);
    // Knocked down: back to the stock, with an alert.
    const again = plant(s, BuildingKind.BogTrophy, x, z);
    pool[Res.BogGuardianClub] = 0;
    hurtBuilding(s, again, 10000, x, 0, z);
    settleDeaths(s);
    expect(s.buildings.get(again.id)).toBeUndefined();
    expect(pool[Res.BogGuardianClub]).toBe(1);
    expect(s.events.some((ev) => ev.kind === 'alert' && /back in your stock/.test(ev.text))).toBe(true);
  });

  it("bog trophy: the night's monsters within 15 m move 10% slower", () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const t = plant(s, BuildingKind.BogTrophy, x, z);
    const [tx, tz] = buildingCentre(t);
    const near = addMob(s, Mob.Zombie, 0, tx + 14 * M, tz, 1);
    const far = addMob(s, Mob.Zombie, 0, tx + 16 * M, tz, 1);
    e.role[near] = Role.Night;
    e.role[far] = Role.Night;
    expect(mobSlowBp(s, near)).toBe(BOG_TROPHY.slowBp);
    expect(mobSlowBp(s, far)).toBe(0);
    // Two in reach count once.
    plant(s, BuildingKind.BogTrophy, tx + 10 * M, tz);
    expect(mobSlowBp(s, near)).toBe(BOG_TROPHY.slowBp);
    // An unfinished one does nothing.
    const { s: s2, x: x2, z: z2 } = setup();
    const u = placeBuilding(s2, 0, BuildingKind.BogTrophy, 0, Math.floor(x2 / WU_PER_COLUMN), Math.floor(z2 / WU_PER_COLUMN), false);
    const [ux, uz] = buildingCentre(u);
    const m = addMob(s2, Mob.Zombie, 0, ux + M, uz, 1);
    s2.entities.role[m] = Role.Night;
    expect(mobSlowBp(s2, m)).toBe(0);
  });

  it("Victor's trophy: the players' units within 15 m gain 5% to everything, once however many stand near", () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const w = addWarrior(s, 0, x + 5 * M, z);
    const mage = addMage(s, 0, x + 5 * M, z + M, School.Battle);
    const worker = e.indexOf(1);
    e.x[worker] = x + 5 * M;
    e.z[worker] = z - M;
    const before = { dealt: dealt(s, w, 100), armour: armourOf(s, w), swing: hexed(s, w, 105), move: moveSpeed(s, worker, false), spell: spellPowerBp(s, mage) };
    const t = plant(s, BuildingKind.VictorsTrophy, x, z);
    expect(dealt(s, w, 100)).toBe(before.dealt + VICTORS_TROPHY.bonusBp / 100);
    expect(armourOf(s, w)).toBeGreaterThan(before.armour);
    expect(hexed(s, w, 105)).toBe(100);
    expect(moveSpeed(s, worker, false)).toBeGreaterThan(before.move);
    expect(effectWorkBp(s, worker)).toBe(VICTORS_TROPHY.bonusBp);
    expect(spellPowerBp(s, mage)).toBe(before.spell + VICTORS_TROPHY.bonusBp);
    plant(s, BuildingKind.VictorsTrophy, x + 2 * M, z);
    expect(effectWorkBp(s, worker)).toBe(VICTORS_TROPHY.bonusBp);
    // Out of reach, and monsters, get nothing.
    e.x[worker] = buildingCentre(t)[0] + 20 * M;
    expect(effectWorkBp(s, worker)).toBe(0);
    const mob = addMob(s, Mob.Zombie, 0, x + M, z, 1);
    expect(e.kind[mob]).toBe(UnitKind.Mob);
    expect(effectWorkBp(s, mob)).toBe(0);
    expect(effectMoveBp(s, mob)).toBe(0);
  });
});
