// Patch 7 (Jade, 03:33 UTC 2026-10-10): "make all damage randomized, except
// from poison. Don't change the few damage things that are already
// randomized but make all others be up to ~6% higher and ~6% lower ...
// except magic which only has 3% upper and lower bounds ... don't hard code
// in the 6 and 3". Every damage source carries its own roll (rollBp), drawn
// from the world's own 'damage' stream.
import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  blowRollBp,
  buildingCentre,
  BuildingKind,
  CLOSE_KITS,
  createWorld,
  DAMAGE_ROLL,
  ENGINES,
  fireAt,
  GEAR,
  hurtUnit,
  LONG_KITS,
  LOOT_KITS,
  Mob,
  MOBS,
  mobSpec,
  RANGER_KITS,
  rollDamage,
  Shot,
  SHOTS,
  SPECIES,
  Spell,
  SPELLS,
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

describe('damage rolls (Patch 7, Jade)', () => {
  it('starts every blow at up to 6% either way and magic at up to 3%, as values to tune, not rules', () => {
    expect(DAMAGE_ROLL).toEqual({ physicalBp: 600, magicBp: 300 });
  });

  it('rolls a blow of 100 anywhere from 94 to 106, about 100 on average, and leaves a roll of 0 alone', () => {
    const { s } = setup();
    const seen = new Set<number>();
    let sum = 0;
    const n = 4000;
    for (let k = 0; k < n; k++) {
      const d = rollDamage(s, 100, 600);
      seen.add(d);
      sum += d;
    }
    expect(Math.min(...seen)).toBe(94);
    expect(Math.max(...seen)).toBe(106);
    expect(Math.abs(sum / n - 100)).toBeLessThan(0.3);
    expect(rollDamage(s, 100, 0)).toBe(100);
    // A small blow keeps its average through the share of a point left over: 10 at 6% is 9, 10 or 11.
    let small = 0;
    const smalls = new Set<number>();
    for (let k = 0; k < n; k++) {
      const d = rollDamage(s, 10, 600);
      smalls.add(d);
      small += d;
    }
    expect([...smalls].sort((a, b) => a - b)).toEqual([9, 10, 11]);
    expect(Math.abs(small / n - 10)).toBeLessThan(0.05);
    // Magic at 3%: a blow of 100 is 97 to 103.
    for (let k = 0; k < 500; k++) {
      const d = rollDamage(s, 100, 300);
      expect(d).toBeGreaterThanOrEqual(97);
      expect(d).toBeLessThanOrEqual(103);
    }
  });

  it('draws only from its own stream: the same on every machine, and no other stream moves', () => {
    const a = setup().s;
    const b = setup().s;
    const combat = a.rng.combat.getState();
    const rollsA = Array.from({ length: 50 }, () => rollDamage(a, 37, 600));
    const rollsB = Array.from({ length: 50 }, () => rollDamage(b, 37, 600));
    expect(rollsA).toEqual(rollsB);
    expect(a.rng.combat.getState()).toEqual(combat);
  });

  it('lands a blow with its roll on a unit, before its armour', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const seen = new Set<number>();
    for (let k = 0; k < 60; k++) {
      const w = addWarrior(s, 0, x, z + k * M, Troop.Close, 0, 1);
      const hp = e.hp[w]!;
      hurtUnit(s, w, { damage: 50, from: 0, projectile: false, blunt: false, pierce: false, spell: true, roll: DAMAGE_ROLL.physicalBp });
      seen.add(hp - e.hp[w]!);
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(47);
    expect(Math.max(...seen)).toBeLessThanOrEqual(53);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('carries a shot\'s roll in the air to what it hits', () => {
    const { s, x, z } = setup();
    const e = s.entities;
    const a = addWarrior(s, 0, x, z, Troop.Ranger, 2, 1);
    const t = addWarrior(s, 0, x + 10 * M, z, Troop.Close, 0, 1);
    fireAt(s, a, e.x[a]!, e.y[a]! + M, e.z[a]!, t, Shot.Arrow, 10, 600, 0, 0);
    expect(s.projectiles.at(-1)!.roll).toBe(600);
    expect(SHOTS[Shot.Arrow]).toBeDefined();
  });

  it('gives every damage source a roll of its own: 6% for every blow, 3% for magic', () => {
    const P = DAMAGE_ROLL.physicalBp;
    const G = DAMAGE_ROLL.magicBp;
    for (const k of [...CLOSE_KITS, ...LONG_KITS, ...RANGER_KITS]) expect([k.name, k.rollBp]).toEqual([k.name, P]);
    for (const g of GEAR) {
      if (g.melee) expect([g.name, g.melee.rollBp]).toEqual([g.name, P]);
      if (g.ranged) expect([g.name, g.ranged.rollBp]).toEqual([g.name, P]);
    }
    for (const k of LOOT_KITS) if (k.melee || k.ranged) expect([k.name, (k.melee ?? k.ranged)!.rollBp]).toEqual([k.name, P]);
    for (const m of MOBS) expect([m.name, m.rollBp]).toEqual([m.name, P]);
    for (const a of SPECIES) expect([a.name, a.rollBp]).toEqual([a.name, P]);
    for (const g of ENGINES) expect([g.name, g.rollBp]).toEqual([g.name, P]);
    // The bolts and curses of magic, 3%.
    const magic: readonly number[] = [Mob.FaeGuardian, Mob.FaeGuardianAloft, Mob.GoblinMage, Mob.ManaWraith, Mob.HollowPriest, Mob.Flamecaller, Mob.VoidWitch, Mob.AbyssalDrake, Mob.Necromancer, Mob.Silenus, Mob.SatyrReveler, Mob.Lich];
    for (const m of MOBS) expect([m.name, m.shotRollBp]).toEqual([m.name, magic.includes(m.id) ? G : P]);
    // Every spell that does damage, 3%; the rest have none.
    const hurts: readonly number[] = [Spell.ArcaneBolt, Spell.Beam, Spell.Fireball, Spell.AreaBlast, Spell.ThornVolley, Spell.EnergyDart];
    for (const sp of SPELLS) expect([sp.name, sp.rollBp]).toEqual([sp.name, hurts.includes(sp.id) ? G : undefined]);
  });

  it('does not roll a blow that already falls anywhere in a range', () => {
    for (const m of [Mob.GreatWhiteApe, Mob.Silenus, Mob.Sabretooth, Mob.SatyrTrickster, Mob.SatyrReveler, Mob.Lich]) {
      const spec = mobSpec(m);
      expect(spec.damageMaxTenths).toBeGreaterThan(spec.damageTenths);
      expect([spec.name, blowRollBp(spec, false), blowRollBp(spec, true)]).toEqual([spec.name, 0, 0]);
    }
    expect(blowRollBp(mobSpec(Mob.Zombie), false)).toBe(DAMAGE_ROLL.physicalBp);
    expect(blowRollBp(mobSpec(Mob.Necromancer), true)).toBe(DAMAGE_ROLL.magicBp);
  });
});
