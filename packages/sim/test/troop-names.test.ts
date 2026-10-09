// Patch 2, troop names: a troop goes by its weapon tier's name, the type name
// stays on the training buttons, workers at rank 4 and 5 are Foreman and
// Elder, and mages keep their school and rank.
import { describe, expect, it } from 'vitest';
import {
  aTroop,
  createWorld,
  gainXp,
  School,
  speakerName,
  Troop,
  TROOP_TIER_NAMES,
  TROOP_TYPES,
  troopTierName,
  UnitKind,
  unitTitle,
  unitTitleOf,
  weaponTiers,
  type SimState,
} from '../src/index.ts';

function first(s: SimState, kind: number): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind) return i;
  throw new Error('no such unit');
}

describe('troop names', () => {
  it('name every weapon tier a troop type has, and only those; the brawler keeps its type name', () => {
    for (const t of TROOP_TYPES) {
      const [lo, hi] = weaponTiers(t);
      for (let w = 0; w <= 8; w++) {
        const name = troopTierName(t, w);
        if (t === Troop.Brawler) expect(name).toBe('Brawler');
        // Its own name at every tier it has (Patch 5: the spear line's type name is its first tier's, Spearman).
        else if (w >= lo && w <= hi) expect(TROOP_TIER_NAMES[t]![w]).toBeTruthy();
        else expect(TROOP_TIER_NAMES[t]![w] ?? '').toBe('');
      }
    }
    const all = TROOP_TYPES.flatMap((t) => TROOP_TIER_NAMES[t]!.filter(Boolean));
    expect(new Set(all).size).toBe(all.length);
    expect(TROOP_TIER_NAMES[Troop.Close]).toEqual(['Fist fighter', 'Club fighter', 'Flint axeman', 'Copper swordsman', 'Bronze swordsman', 'Iron swordsman', 'Broadswordsman', 'Steel swordsman', 'Champion']);
    expect(troopTierName(Troop.Long, 8)).toBe('Greatswordsman');
    expect(troopTierName(Troop.Ranger, 1)).toBe('Slinger');
    expect(troopTierName(Troop.Cavalry, 6)).toBe('Pike rider');
    expect(aTroop(Troop.Ranger, 5)).toBe('an iron archer');
    expect(aTroop(Troop.Close, 1, true)).toBe('A club fighter');
  });

  it('show on a troop, in its lines too, and change the moment its weapon tier does', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const i = first(s, UnitKind.Warrior);
    expect(unitTitleOf(s, i)).toBe('Club fighter (Recruit)');
    expect(speakerName(s, i)).toBe('Club fighter (Recruit)');
    e.wTier[i] = 3;
    expect(unitTitleOf(s, i)).toBe('Copper swordsman (Recruit)');
    gainXp(s, i, 500);
    expect(s.events.some((ev) => ev.text === 'A copper swordsman has risen to Soldier.')).toBe(true);
    expect(speakerName(s, i)).toBe('Copper swordsman (Soldier)');
  });

  it('call workers at rank 4 and 5 Foreman and Elder, and mages by school and rank', () => {
    const s = createWorld(1, { peaceful: true });
    const w = first(s, UnitKind.Worker);
    expect(unitTitleOf(s, w)).toBe('Worker (Labourer)');
    expect(unitTitle({ kind: UnitKind.Worker, troop: 0, wTier: 1, rank: 4, school: 0 })).toBe('Worker (Foreman)');
    expect(unitTitle({ kind: UnitKind.Worker, troop: 0, wTier: 1, rank: 5, school: 0 })).toBe('Worker (Elder)');
    expect(unitTitle({ kind: UnitKind.Mage, troop: 0, wTier: 3, rank: 1, school: School.Battle })).toBe('Battle mage (Novice Acolyte)');
  });
});
