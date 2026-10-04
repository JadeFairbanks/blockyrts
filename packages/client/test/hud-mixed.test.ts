// Mixed selections (patch notes 1): units and buildings in one selection, the
// most valuable type first on the card and the portrait, Tab through the rest.
import { describe, expect, it } from 'vitest';
import { BuildingKind, Troop } from '@blockyrts/sim';
import { subgroups } from '../src/hud/selection-panel.ts';
import { buildingWorth, typeWorth } from '../src/hud/worth.ts';
import type { Selectable } from '../src/selection/types.ts';

const sel = (key: string, kind: Selectable['kind'], typeKey: string): Selectable =>
  ({ key, kind, owner: 0, typeKey, label: typeKey, centre: { x: 0, y: 0, z: 0 }, halfSize: { x: 1, y: 1, z: 1 } }) as unknown as Selectable;

describe('worth', () => {
  it('counts every level of a building up to its own', () => {
    expect(buildingWorth(BuildingKind.MainBase, 2)).toBeGreaterThan(buildingWorth(BuildingKind.MainBase, 1));
    expect(typeWorth(`building:${BuildingKind.MainBase}:3`)).toBe(buildingWorth(BuildingKind.MainBase, 3));
  });

  it('prices troops by the dearest kit selected', () => {
    const cudgel = typeWorth('warrior', () => [{ troop: Troop.Close, wTier: 1, aTier: 0 }]);
    const better = typeWorth('warrior', () => [
      { troop: Troop.Close, wTier: 1, aTier: 0 },
      { troop: Troop.Close, wTier: 4, aTier: 2 },
    ]);
    expect(better).toBeGreaterThan(cudgel);
    expect(typeWorth('worker')).toBeGreaterThan(0);
    expect(typeWorth('mob:3')).toBe(0);
  });
});

describe('subgroups of a mixed selection', () => {
  const list = [
    sel('e:1', 'unit', 'worker'),
    sel('e:2', 'unit', 'worker'),
    sel('b:5', 'building', `building:${BuildingKind.MainBase}:1`),
    sel('b:6', 'building', `building:${BuildingKind.Barracks}:1`),
  ];

  it('keeps the fixed order without a worth', () => {
    expect(subgroups(list).map((g) => g.typeKey)).toEqual(['worker', `building:${BuildingKind.MainBase}:1`, `building:${BuildingKind.Barracks}:1`]);
  });

  it('puts the most valuable type first with one', () => {
    const worth = (k: string): number => typeWorth(k);
    const order = subgroups(list, worth).map((g) => g.typeKey);
    expect(order[order.length - 1]).toBe('worker');
    const first = order[0]!;
    for (const k of order) expect(typeWorth(first)).toBeGreaterThanOrEqual(typeWorth(k));
  });
});
