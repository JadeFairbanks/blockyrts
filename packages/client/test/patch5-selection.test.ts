// Jade's Patch 5 (CT-5): a double click on a unit of a mixed selection keeps
// only that unit's type, by her types: workers, cavalry, close melee, long
// melee, each mage school, and every other kind its own.
import { describe, expect, it } from 'vitest';
import { sameTypeInView, typeOf, typeWithin, type SelInfo } from '../src/selection/rules.ts';

const unit = (key: string, typeKey: string, clickType?: string): SelInfo => ({ key, kind: 'unit', owner: 0, typeKey, ...(clickType ? { clickType } : {}) });

describe('double click types (Patch 5, CT-5)', () => {
  const mixed = [unit('e:1', 'worker'), unit('e:2', 'warrior', 'warrior:1'), unit('e:3', 'warrior', 'warrior:2'), unit('e:4', 'warrior', 'warrior:1'), unit('e:5', 'warrior', 'warrior:cavalry'), unit('e:6', 'mage:battle')];

  it('keeps only the clicked unit\'s type within a mixed selection', () => {
    expect(typeWithin(mixed, mixed[1]!)!.map((t) => t.key)).toEqual(['e:2', 'e:4']);
    expect(typeWithin(mixed, mixed[4]!)!.map((t) => t.key)).toEqual(['e:5']);
    expect(typeOf(mixed[0]!)).toBe('worker');
    // One type only, or a unit not in it: the usual double click (all of its type on screen).
    expect(typeWithin([mixed[1]!, mixed[3]!], mixed[1]!)).toBeNull();
    expect(typeWithin(mixed.slice(1), mixed[0]!)).toBeNull();
  });

  it('draws the on-screen double click by the same types', () => {
    const view = mixed.map((item) => ({ item, rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, x: 0, y: 0, depth: 1 }));
    expect(sameTypeInView(view, mixed[2]!, 0).map((t) => t.key)).toEqual(['e:3']);
  });
});
