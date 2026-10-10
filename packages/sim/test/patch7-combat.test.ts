// Patch 7 (Jade, 02:06 UTC 2026-10-10): magic goes through all armour and
// its damage numbers show purple, poison's green; every bow and crossbow
// misses a little less than a musket, and every sling, bow, crossbow and gun
// reloads 1.5 s slower. Picks in blueprint/combat-tuning-picks.md.
import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  armourOf,
  blowKind,
  BRAWLER_KIT,
  buildingCentre,
  BuildingKind,
  createWorld,
  DAY_STEPS,
  DUSK_STEPS,
  DamageKind,
  fireAt,
  GEAR,
  hurtUnit,
  LOOT_KITS,
  Mob,
  Mount,
  mountSpec,
  PeopleGear,
  RANGER_KITS,
  RISEN_BOW_GEAR,
  Shot,
  step,
  STEPS_PER_SECOND,
  Troop,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

/** A peaceful world and a spot a little east of its main base, wu. */
function setup(): { s: SimState; x: number; z: number } {
  const s = createWorld(1, { peaceful: true });
  const base = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  const [x, z] = buildingCentre(base);
  return { s, x: x + 30 * M, z };
}

function waitFor(s: SimState, done: () => boolean, max: number): void {
  for (let k = 0; k < max; k++) {
    if (done()) return;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

describe('magic and poison (Patch 7, Jade)', () => {
  it('lets magic through all armour, with a purple number; a blow of the same size is cut by the armour as before', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const a = addWarrior(s, 0, x, z, Troop.Close, 5, 8);
    const b = addWarrior(s, 0, x + 3 * M, z, Troop.Close, 5, 8);
    expect(armourOf(s, a)).toBeGreaterThan(0);
    const blow = { damage: 40, from: 0, projectile: false, blunt: false, pierce: false, roll: 0 };
    const hpA = e.hp[a]!;
    const hpB = e.hp[b]!;
    s.hits = [];
    hurtUnit(s, a, blow);
    hurtUnit(s, b, { ...blow, spell: true });
    expect(hpA - e.hp[a]!).toBeLessThan(40);
    expect(hpB - e.hp[b]!).toBe(40);
    expect(s.hits.map((h) => h.dmgKind)).toEqual([undefined, DamageKind.Magic]);
    // Magic that is no spell (a flamecaller's hellfire) goes through too; a miasma's due is poison.
    expect(blowKind({ ...blow, magic: true })).toBe(DamageKind.Magic);
    expect(blowKind({ ...blow, poison: true })).toBe(DamageKind.Poison);
    expect(blowKind(blow)).toBe(DamageKind.Physical);
  });

  it('carries magic through a bolt of magic that is no spell: a flamecaller\'s hellfire lands in full through armour', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const w = addWarrior(s, 0, x, z, Troop.Close, 5, 8);
    const f = addMob(s, Mob.Flamecaller, 0, x + 10 * M, z, 1);
    e.power[f] = 1000;
    const hp = e.hp[w]!;
    fireAt(s, f, e.x[f]!, e.y[f]! + 2 * M, e.z[f]!, w, Shot.Hellfire, 30, 0, 0, 0);
    e.hp[f] = 0;
    let kinds: Array<number | undefined> = [];
    waitFor(s, () => {
      kinds = s.hits.filter((h) => h.id === e.id[w] && h.dmg).map((h) => h.dmgKind);
      return kinds.length > 0;
    }, 3 * STEPS_PER_SECOND);
    expect(kinds).toEqual([DamageKind.Magic]);
    expect(hp - e.hp[w]!).toBe(30);
  });

  it('shows a centipede\'s poison as it works, in green, through the armour', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    // At night, so it does not run from the sun.
    s.step = DAY_STEPS + DUSK_STEPS + 10;
    const w = addWarrior(s, 0, x, z, Troop.Close, 5, 8);
    const c = addMob(s, Mob.GiantCentipede, 0, x + 1 * M, z, 1);
    waitFor(s, () => e.dotLeft[w]! > 0, 20 * STEPS_PER_SECOND);
    expect(e.dotKind[w]).toBe(DamageKind.Poison);
    // Out of the fight, the poison still ticks on, and each tick says so for the screen to add up.
    e.hp[c] = 0;
    step(s);
    const ticks = s.hits.filter((h) => h.look === 'tick' && h.id === e.id[w]);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((h) => h.dmgKind === DamageKind.Poison && h.dmg! > 0)).toBe(true);
  });
});

describe('bows, crossbows and guns (Patch 7, Jade)', () => {
  const ds = (steps: number): number => (steps * 10) / STEPS_PER_SECOND;

  it('has every bow and crossbow a unit holds miss by at most 3%, a little less than a musket\'s 4%', () => {
    const musket = RANGER_KITS[8]!;
    expect(musket.spreadPct).toBe(4);
    const bows = GEAR.filter((g) => g.ranged && (g.ranged.shot === Shot.Arrow || g.ranged.shot === Shot.Bolt));
    expect(bows.length).toBeGreaterThan(8);
    for (const g of bows) expect([g.name, g.ranged!.spreadBp]).toEqual([g.name, 300]);
    for (const k of LOOT_KITS) if (k.ranged && k.ranged.shot === Shot.Arrow) expect([k.name, k.ranged.spreadPct]).toEqual([k.name, 3]);
    expect(mountSpec(Mount.WarOx).attack!.spreadBp).toBe(300);
    // A raised skeleton archer keeps the monster's own bow (Jade: it uses the skeleton archer's own attack).
    expect(GEAR[RISEN_BOW_GEAR]!.ranged!.spreadBp).toBe(700);
  });

  it('has every sling, bow, crossbow and gun shoot 1.5 s slower than before', () => {
    // Before: a sling and every bow 2 s, the crossbow 4.5 s, the musket 8 s, the pistol 6 s.
    expect(RANGER_KITS.slice(1).map((k) => k.attackDs)).toEqual([35, 35, 35, 35, 35, 35, 60, 95]);
    expect(BRAWLER_KIT.attackDs).toBe(75);
    for (const k of LOOT_KITS) if (k.ranged) expect([k.name, k.ranged.attackDs]).toEqual([k.name, 35]);
    expect(ds(GEAR[PeopleGear.Shortbow]!.ranged!.attackSteps)).toBe(35);
    expect(ds(GEAR[PeopleGear.ElfLongbow]!.ranged!.attackSteps)).toBe(35);
    expect(ds(GEAR[PeopleGear.DwarfCrossbow]!.ranged!.attackSteps)).toBe(45);
    expect(ds(mountSpec(Mount.WarOx).attack!.attackSteps)).toBe(35);
  });
});
