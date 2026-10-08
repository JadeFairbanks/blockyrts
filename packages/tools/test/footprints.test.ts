import { describe, expect, it } from 'vitest';
import { BuildingKind, buildingSpec, footprintDims, FOOTPRINTS, PARAPET_SLOTS, PARAPET_TIER } from '@blockyrts/sim';
import { checkFootprints } from '../src/models/footprints.ts';
import { readModel } from '../src/models/model-files.ts';

// The sim's footprint table (Jade's patch notes 1: walkable areas match what is drawn) against the catalogue models.
describe('building footprints', () => {
  const checks = checkFootprints(readModel);

  it('measures every modelled level as the table has it', () => {
    // Patch 2: fourteen buildings, so fewer modelled levels than the 31 entries before it; Patch 5: the main base's four tiers.
    expect(checks.length).toBeGreaterThanOrEqual(10);
    for (const c of checks) expect(c.measured, `kind ${c.kind} level ${c.level}`).toEqual([...c.table]);
  });

  it('stands every post of a modelled level on its top, with room for a man', () => {
    for (const c of checks) expect(c.posts, `kind ${c.kind} level ${c.level}`).toEqual([]);
  });

  it('keeps the Citadel shut and the Big House yard open', () => {
    const big = footprintDims(BuildingKind.MainBase, 0, 1);
    const citadel = footprintDims(BuildingKind.MainBase, 0, 4);
    // The Citadel's ring walls and shut gate close the whole footprint; the Big House leaves its yard to walk in.
    expect(citadel.cells.length).toBe(14 * 14);
    expect(big.cells.length).toBeLessThan(14 * 14 / 2);
  });

  it('gives every kind a footprint of its level 1 size, and every level with a top a post per place', () => {
    for (const k of Object.values(BuildingKind)) {
      const s = buildingSpec(k);
      const d = footprintDims(k, 0, 1);
      expect([d.w, d.d], s.name).toEqual([s.w, s.d]);
      for (let l = 1; l <= s.levels.length; l++) {
        const room = s.slots ?? (k === BuildingKind.MainBase && l >= PARAPET_TIER ? PARAPET_SLOTS : 0);
        expect(footprintDims(k, 0, l).posts.length, `${s.name} level ${l}`).toBe(room);
      }
      expect(FOOTPRINTS[k]!.length).toBeLessThanOrEqual(s.levels.length);
    }
  });
});
