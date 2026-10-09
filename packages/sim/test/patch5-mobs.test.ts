// Jade's Patch 5, mobs and waves (picks in blueprint/patch5-mobs-picks.md):
// the damage cuts held in tenths, the waves going for every base and party
// (MB-1), their size with the player count (EX-3), Bright Nights, the
// necromancer (MB-5) and the Deadlands' mana crystal guardians (MB-13).

import { afterEach, describe, expect, it } from 'vitest';
import {
  addMob,
  aimsOf,
  Band,
  bandAtWu,
  brightHooks,
  buildingCentre,
  BuildingKind,
  colKey,
  COLUMNS_PER_CHUNK,
  createWorld,
  CRYSTAL_GUARDS,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  landAt,
  Mob,
  mobSpec,
  necromancerAct,
  necromancerLoot,
  necromancerNight,
  PropKind,
  Res,
  Role,
  runGuardian,
  serializeState,
  Species,
  speciesSpec,
  UnitKind,
  updateGuardians,
  updateSpawns,
  wholeDamage,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';
import { ARMOUR_KITS, CLOSE_KITS, LONG_KITS, RANGER_KITS } from '../src/units/kits.ts';

const M = WU_PER_METRE;
/** Every weapon and armour good, and those of tier 3 to 5. */
const GEAR_LINES = [CLOSE_KITS, LONG_KITS, RANGER_KITS, ARMOUR_KITS];
const GEAR_ANY = new Set<number>(GEAR_LINES.flatMap((t) => t.flatMap((k) => k.items)));
const GEAR_3_TO_5 = new Set<number>(GEAR_LINES.flatMap((t) => t.filter((k) => k.tier >= 3 && k.tier <= 5).flatMap((k) => k.items)));
const NIGHT_START = DAY_STEPS + DUSK_STEPS;

/** The threat each player's planned night holds, at nightfall of a night. */
function planned(s: SimState, night: number): number[] {
  s.step = night * CYCLE_STEPS + NIGHT_START;
  updateSpawns(s);
  const per = s.players.map(() => 0);
  for (const p of s.spawns) per[p.player]! += mobSpec(p.mob).threatTenths;
  return per;
}

afterEach(() => {
  brightHooks.bright = () => false;
});

describe('the damage cuts (BL-5, BL-9)', () => {
  it('hold the cut blows in tenths, each blow whole and the tenths as that share of one more', () => {
    expect(mobSpec(Mob.Zombie).damageTenths).toBe(76);
    expect(mobSpec(Mob.GiantRat).damageTenths).toBe(50);
    expect(speciesSpec(Species.Wolf).damageTenths).toBe(85);
    const s = createWorld(1);
    let sum = 0;
    for (let k = 0; k < 2000; k++) {
      s.step = k;
      const d = wholeDamage(s, 0, 85);
      expect(d === 8 || d === 9).toBe(true);
      sum += d;
    }
    expect(sum / 2000).toBeGreaterThan(8.4);
    expect(sum / 2000).toBeLessThan(8.6);
  });
});

describe('waves for every player (EX-3)', () => {
  it('double for two players and triple for three, each on its own share', () => {
    for (const night of [4, 20, 60]) {
      const one = planned(createWorld(5, { players: 1 }), night)[0]!;
      for (const n of [2, 3]) {
        const per = planned(createWorld(5, { players: n }), night);
        const total = per.reduce((a, b) => a + b, 0);
        expect(total / one, `night ${night}, ${n} players`).toBeGreaterThan(n * 0.9);
        expect(total / one, `night ${night}, ${n} players`).toBeLessThan(n * 1.1);
      }
    }
  });

  it('leave out a player\'s share on their Bright Night, and send no wave at all in single player', () => {
    brightHooks.bright = (_s, p) => p === 1;
    const per = planned(createWorld(5, { players: 2 }), 12);
    expect(per[0]).toBeGreaterThan(0);
    expect(per[1]).toBe(0);
    brightHooks.bright = () => true;
    expect(planned(createWorld(5, { players: 1 }), 12)[0]).toBe(0);
  });
});

describe('what the waves go for (MB-1)', () => {
  it('sends the night\'s groups for the bases and for parties out in the open, by worth', () => {
    const s = createWorld(7, { players: 1 });
    const house = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
    const e = s.entities;
    // Two workers 150 m off are a party.
    const out = [0, 1, 2, 3].filter((i) => e.owner[i] === 0 && e.kind[i] === UnitKind.Worker).slice(0, 2);
    out.forEach((i, k) => landAt(s, i, house[0] + 150 * M + k * M, house[1]));
    const aims = aimsOf(s, 0);
    const party = aims.find((a) => !a.base)!;
    expect(aims.some((a) => a.base)).toBe(true);
    expect(party.worth).toBe(4);
    expect(Math.abs(party.x - (house[0] + 150 * M))).toBeLessThan(2 * M);
    // Over a long night most groups go for the base and some for the party; every group is aimed.
    s.step = 30 * CYCLE_STEPS + NIGHT_START;
    updateSpawns(s);
    expect(s.spawns.length).toBeGreaterThan(0);
    for (const p of s.spawns) expect(p.role).toBe(Role.Aimed);
    const atParty = new Set(s.spawns.filter((p) => p.ax === party.x && p.az === party.z).map((p) => p.group));
    const groups = new Set(s.spawns.map((p) => p.group));
    expect(atParty.size).toBeGreaterThan(0);
    expect(atParty.size).toBeLessThan(groups.size);
  });
});

describe('the necromancer (MB-5)', () => {
  it('comes on nights 10, 20, 30, 40, every 5th to 60, every 2nd from 60 and every night from 90', () => {
    const nights = [];
    for (let n = 0; n <= 95; n++) if (necromancerNight(n)) nights.push(n);
    expect(nights).toEqual([10, 20, 30, 40, 45, 50, 55, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 91, 92, 93, 94, 95]);
  });

  it('comes one for each player on top of the waves\' threat, and not on a player\'s Bright Night', () => {
    expect(mobSpec(Mob.Necromancer).threatTenths).toBe(0);
    const s = createWorld(5, { players: 2 });
    planned(s, 20);
    expect(s.spawns.filter((p) => p.mob === Mob.Necromancer).map((p) => p.player).sort()).toEqual([0, 1]);
    brightHooks.bright = (_s, p) => p === 1;
    const b = createWorld(5, { players: 2 });
    planned(b, 20);
    expect(b.spawns.filter((p) => p.mob === Mob.Necromancer).map((p) => p.player)).toEqual([0]);
    expect(planned(createWorld(5, { players: 1 }), 21).length).toBe(1);
    expect(createWorld(5).spawns.length).toBe(0);
  });

  it('summons 9 or 10 skeleton archers and zombies once seen, then every 60 s, and speaks in 20 s bubbles', () => {
    const s = createWorld(9, { players: 1 });
    const e = s.entities;
    const w = [0, 1, 2, 3].find((i) => e.kind[i] === UnitKind.Worker)!;
    s.step = 12 * CYCLE_STEPS + NIGHT_START;
    const n = addMob(s, Mob.Necromancer, 0, e.x[w]! + 10 * M, e.z[w]!, 12);
    const raised = (): number[] => [...Array(e.count).keys()].filter((j) => e.kind[j] === UnitKind.Mob && (e.mob[j] === Mob.SkeletonArcher || e.mob[j] === Mob.Zombie));
    for (let k = 0; k < 20; k++, s.step++) necromancerAct(s, n, mobSpec(Mob.Necromancer), -1);
    const first = raised();
    expect(first.length === 9 || first.length === 10).toBe(true);
    const said = s.events.filter((ev) => ev.kind === 'speech' && ev.speaker === e.id[n]);
    expect(said.length).toBe(1);
    expect(said[0]!.hold).toBe('linger');
    // Nothing more until 60 s have gone by.
    for (let k = 0; k < 59 * 20; k++, s.step++) necromancerAct(s, n, mobSpec(Mob.Necromancer), -1);
    expect(raised().length).toBe(first.length);
    for (let k = 0; k < 2 * 20; k++, s.step++) necromancerAct(s, n, mobSpec(Mob.Necromancer), -1);
    expect(raised().length).toBeGreaterThanOrEqual(first.length + 9);
  });

  it('drops 2 to 4 weapons or armours of tier 3 to 5, ingots of one kind, bones and now and then a mana crystal', () => {
    const s = createWorld(3, { players: 1 });
    let crystals = 0;
    for (let k = 0; k < 400; k++) {
      const items = necromancerLoot(s, 0).items;
      const bones = items.filter(([r]) => r === Res.Bone).reduce((a, [, n]) => a + n, 0);
      expect(bones).toBeGreaterThanOrEqual(2);
      expect(bones).toBeLessThanOrEqual(8);
      if (items.some(([r]) => r === Res.ManaCrystal)) crystals++;
      // The pieces themselves, tier 3 to 5 for a town that can make no higher.
      const pieces = items.filter(([r]) => GEAR_3_TO_5.has(r)).reduce((a, [, n]) => a + n, 0);
      expect(pieces).toBeGreaterThanOrEqual(2);
      expect(pieces).toBeLessThanOrEqual(4);
      expect(items.some(([r]) => GEAR_ANY.has(r) && !GEAR_3_TO_5.has(r))).toBe(false);
    }
    expect(crystals).toBeGreaterThan(20);
    expect(crystals).toBeLessThan(70);
  });
});

/** A Deadlands mana crystal of a world: its column. */
function deadlandsCrystal(s: SimState): [number, number] {
  let x = 0;
  while (bandAtWu(s, x, 0) !== Band.Deadlands) x += 20 * M;
  const cw = COLUMNS_PER_CHUNK * WU_PER_COLUMN;
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = 0; dx <= 8; dx++) {
      const cx = Math.floor(x / cw) + dx;
      for (const p of s.world.propRecords(cx, dz)) {
        const gx = cx * COLUMNS_PER_CHUNK + p.lx;
        const gz = dz * COLUMNS_PER_CHUNK + p.lz;
        if (p.kind === PropKind.ManaCrystal && bandAtWu(s, gx * WU_PER_COLUMN, gz * WU_PER_COLUMN) === Band.Deadlands) return [gx, gz];
      }
    }
  }
  throw new Error('no crystal');
}

describe('the mana crystal guardians (MB-13)', () => {
  it('come once a unit nears a Deadlands crystal, keep to it, go for whoever comes near, and never come back', () => {
    const s = createWorld(5, { players: 1 });
    const e = s.entities;
    const [gx, gz] = deadlandsCrystal(s);
    const cx = gx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const cz = gz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const w = [0, 1, 2, 3].find((i) => e.kind[i] === UnitKind.Worker)!;
    landAt(s, w, cx - 50 * M, cz);
    s.step = 3 * CYCLE_STEPS;
    updateGuardians(s);
    const guards = (): number[] => [...Array(e.count).keys()].filter((j) => e.kind[j] === UnitKind.Mob && e.role[j] === Role.Guardian && e.hp[j]! > 0);
    const g = guards();
    expect(g.length).toBeGreaterThanOrEqual(CRYSTAL_GUARDS.min);
    expect(g.length).toBeLessThanOrEqual(CRYSTAL_GUARDS.max);
    for (const j of g) {
      expect([Mob.AshGolem, Mob.ManaWraith]).toContain(e.mob[j]);
      expect(Math.hypot(e.x[j]! - cx, e.z[j]! - cz)).toBeLessThanOrEqual(5 * M);
    }
    expect(s.threats.guarded.has(colKey(gx, gz))).toBe(true);
    // The guarded crystals go in the save.
    expect(deserializeState(serializeState(s)).threats.guarded.has(colKey(gx, gz))).toBe(true);
    // Far off, nobody is gone for; 6 m from the crystal, the worker is.
    runGuardian(s, g[0]!, mobSpec(e.mob[g[0]!]!));
    expect(e.target[g[0]!]).toBe(0);
    landAt(s, w, cx - 6 * M, cz);
    s.grid.rebuild(e);
    runGuardian(s, g[0]!, mobSpec(e.mob[g[0]!]!));
    expect(e.target[g[0]!]).toBe(e.id[w]);
    // Killed, they never come again.
    for (const j of g) e.hp[j] = 0;
    s.step += CRYSTAL_GUARDS.everySteps;
    updateGuardians(s);
    expect(guards().length).toBe(0);
  });
});
