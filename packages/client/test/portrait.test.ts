// Patch notes 1: the portrait beside the middle panel, a live headshot of a
// unit idling three-quarters on, a still of a building from about 45 degrees,
// the whole of anything long or low.
import { describe, expect, it } from 'vitest';
import { BuildingKind, Mob, OrderKind, Species, UnitKind } from '@blockyrts/sim';
import { S, STATE_STRIDE } from '../src/messages.ts';
import { buildingFrame, fitDistance, PORTRAIT_HEADING, unitFrame } from '../src/world/portrait-view.ts';

const row = (kind: number, mob = 0): Int32Array => {
  const r = new Int32Array(STATE_STRIDE);
  r[S.kind] = kind;
  r[S.mob] = mob;
  r[S.order] = OrderKind.Idle;
  return r;
};

describe('the portrait frame', () => {
  it('shows a head and shoulders of a person', () => {
    const f = unitFrame(row(UnitKind.Warrior));
    expect(f.target[1]).toBeGreaterThan(1.3);
    expect(f.radius).toBeLessThan(0.5);
  });

  it('shows the whole of an animal, a low creature and a lair', () => {
    for (const r of [row(UnitKind.Animal, Species.Cattle), row(UnitKind.Mob, Mob.GiantRat), row(UnitKind.Mob, Mob.LairBarrow)]) {
      const f = unitFrame(r);
      expect(f.target[1]).toBeLessThan(2);
      expect(f.elevation).toBeGreaterThan(0.2);
    }
  });

  it('shows an upright creature from the shoulders up', () => {
    const f = unitFrame(row(UnitKind.Mob, Mob.Zombie));
    expect(f.elevation).toBeLessThan(0.2);
    expect(f.target[1]).toBeGreaterThan(1);
  });

  it('looks at a building from its corner, about 45 degrees round and from above', () => {
    const f = buildingFrame(BuildingKind.MainBase, 0, 5);
    expect(f.azimuth).toBeCloseTo(Math.PI / 4, 5);
    expect(f.elevation).toBeGreaterThan(0.3);
    expect(f.target[0]).toBeGreaterThan(0);
    expect(f.target[2]).toBeGreaterThan(0);
  });

  it('stands the unit three-quarters on to the camera', () => {
    const turn = (PORTRAIT_HEADING / 65536) * 360;
    expect(turn).toBeGreaterThan(190);
    expect(turn).toBeLessThan(230);
  });

  it('backs the camera off far enough for a narrow window', () => {
    expect(fitDistance(1, 26, 0.5)).toBeGreaterThan(fitDistance(1, 26, 1));
    expect(fitDistance(1, 26, 2)).toBeCloseTo(fitDistance(1, 26, 1.5), 5);
  });
});
