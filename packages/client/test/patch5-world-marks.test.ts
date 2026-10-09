import { BuildingKind } from '@blockyrts/sim';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { S, STATE_STRIDE, type BuildingInfo } from '../src/messages.ts';
import { orderLines, type Mover } from '../src/hud/order-lines.ts';
import { barShown, hpColour, markEntry, type MarkSource } from '../src/hud/world-marks.ts';
import type { Selectable } from '../src/selection/types.ts';

const thing = (key: string, owner: number): Selectable => ({ key, kind: key.startsWith('b:') ? 'building' : 'unit', owner, typeKey: 'x', centre: new THREE.Vector3(0, 1, 0), halfSize: new THREE.Vector3(0.3, 0.85, 0.3), label: '' });

function source(rows: Record<number, Partial<Record<keyof typeof S, number>>>, buildings: Record<number, Partial<BuildingInfo>> = {}): MarkSource {
  return {
    player: 0,
    players: 2,
    colour: (p) => (p === 1 ? '#3070ff' : '#ff0000'),
    row: (id) => {
      const r = rows[id];
      if (!r) return null;
      const d = new Int32Array(STATE_STRIDE);
      for (const [k, v] of Object.entries(r)) d[S[k as keyof typeof S]] = v!;
      return d;
    },
    building: (id) => buildings[id] as BuildingInfo | undefined,
    extra: () => [],
  };
}

describe('Patch 5 marks over the world (UI-9, UI-12, UI-18)', () => {
  it('draws no bar over 95%, health changing colour, mana below it, a star only on another player\'s things', () => {
    expect(barShown(96, 100)).toBe(false);
    expect(barShown(95, 100)).toBe(true);
    expect(barShown(0, 0)).toBe(false);
    expect(hpColour(1)).toMatch(/^hsl\(120,/);
    expect(hpColour(0)).toMatch(/^hsl\(0,/);
    const src = source({ 1: { hp: 100, maxHp: 100 }, 2: { hp: 40, maxHp: 100, mana: 10, maxMana: 50 }, 3: { hp: 100, maxHp: 100 } });
    // Own and whole: nothing at all.
    expect(markEntry(thing('e:1', 0), src)).toBeNull();
    const hurt = markEntry(thing('e:2', 0), src)!;
    expect(hurt.bars.map((b) => b.frac)).toEqual([0.4, 0.2]);
    expect(hurt.star).toBeNull();
    // Another player's whole unit: only its star; a monster's never has one.
    expect(markEntry(thing('e:3', 1), src)).toMatchObject({ bars: [], star: '#3070ff' });
    expect(markEntry(thing('e:3', 254), src)).toBeNull();
  });

  it('keeps walls bare, and shows what a building makes', () => {
    const src = source({}, {
      5: { kind: BuildingKind.Wall, hp: 10, maxHp: 300, complete: true, queue: [], upgrading: 0 },
      6: { kind: BuildingKind.Barracks, hp: 900, maxHp: 900, complete: true, queue: [{ product: 1, done: 250, stepsLeft: 10 }], upgrading: 0 },
    });
    expect(markEntry(thing('b:5', 1), src)).toBeNull();
    expect(markEntry(thing('b:6', 0), src)!.bars.map((b) => b.frac)).toEqual([0.25]);
  });
});

describe('Patch 5 order lines (GP-23)', () => {
  const at = (x: number, z: number, endX = 50, endZ = 0): Mover => ({ x, z, kind: 'move', endX, endZ });
  it('draws one line a group, from where it is densest, and another for units more than 10 m from the rest', () => {
    const lines = orderLines([at(0, 0, 50, 0), at(1, 0, 51, 0), at(0.5, 1, 50, 1), at(6, 6, 49, 0), at(30, 0, 50, 2)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.x).toBeCloseTo(0.5);
    expect(lines.every((l) => l.endX === 50 && l.endZ === 0.6)).toBe(true);
    // Another order's units are another group.
    expect(orderLines([at(0, 0), { ...at(1, 0), kind: 'attackMove' }])).toHaveLength(2);
  });
});
