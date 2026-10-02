// The fixes between milestones 5 and 6: stone tools at the Big House and
// stone outcrops (Table 2c, Table 5), digging into a cliff face (Digging and
// building up the land), and hopping up 3 to 4 unit rises (Moving over the land).
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  CHUNK_SHIFT,
  createWorld,
  CRAFT_PRODUCT,
  digRate,
  Item,
  itemSpec,
  Mat,
  PropKind,
  propInfo,
  Res,
  step,
  Tool,
  toolItem,
  WU_PER_COLUMN,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

/** Runs n steps and returns every event text they made. */
function texts(s: SimState, n: number, orders: Order[] = []): string[] {
  const out: string[] = [];
  step(s, orders);
  out.push(...s.events.map((v) => v.text));
  for (let k = 1; k < n; k++) {
    step(s);
    out.push(...s.events.map((v) => v.text));
  }
  return out;
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** The nearest prop of a kind to the first worker, as the gather order addresses it. */
function nearestProp(s: SimState, kind: number): { cx: number; cz: number; index: number } {
  const x = col(s.entities.x[0]!);
  const z = col(s.entities.z[0]!);
  let best: { cx: number; cz: number; index: number } | null = null;
  let bestD = Infinity;
  for (let cz = (z - 200) >> CHUNK_SHIFT; cz <= (z + 200) >> CHUNK_SHIFT; cz++) {
    for (let cx = (x - 200) >> CHUNK_SHIFT; cx <= (x + 200) >> CHUNK_SHIFT; cx++) {
      for (const p of s.world.props(cx, cz, s.step)) {
        if (p.kind !== kind || p.amount <= 0) continue;
        const d = ((cx << CHUNK_SHIFT) + p.lx - x) ** 2 + ((cz << CHUNK_SHIFT) + p.lz - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { cx, cz, index: p.index };
        }
      }
    }
  }
  if (!best) throw new Error('no such prop near the start');
  return best;
}

describe('stone tools', () => {
  it('sit between hardwood and flint in Table 2c', () => {
    expect(Tool.Hardwood < Tool.Stone && Tool.Stone < Tool.Flint).toBe(true);
    const stone = itemSpec(Item.ToolsStone);
    expect(toolItem(Tool.Stone)).toBe(Item.ToolsStone);
    expect(stone.tool).toBe(Tool.Stone);
    expect(stone.research).toBe(0);
    expect(stone.recipes).toEqual([[[Res.Sticks, 2], [Res.Stone, 2]]]);
    expect(stone.steps).toBe(200);
    expect(stone.weightTenthsLb).toBe(35);
    expect(stone.model).toBe('axe_stone');
    expect(itemSpec(Item.ToolsHardwood).tier).toBeLessThan(stone.tier);
    expect(stone.tier).toBeLessThan(itemSpec(Item.ToolsFlint).tier);
    // Table 2c recipes for the Big House's other two sets.
    expect(itemSpec(Item.ToolsHardwood).recipes).toEqual([[[Res.Sticks, 3]]]);
    expect(itemSpec(Item.ToolsFlint).recipes).toEqual([[[Res.Sticks, 2], [Res.Flint, 1]]]);
  });

  it('are made at the Big House on day 0 with no research, from 2 sticks and 2 stone in 10 s', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const sticks = pool[Res.Sticks]!;
    const stone = pool[Res.Stone]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: bigHouse(s).id, product: CRAFT_PRODUCT + Item.ToolsStone, count: 1 }]);
    const took = runUntil(s, () => s.players[0]!.items[Item.ToolsStone]! >= 1, 400);
    expect(took).toBeGreaterThan(190);
    expect(pool[Res.Sticks]).toBe(sticks - 2);
    expect(pool[Res.Stone]).toBe(stone - 2);
  });

  it('quarry a stone outcrop, which hardwood tools cannot, but mine no ore', () => {
    expect(propInfo(PropKind.StoneOutcrop).tool).toBe(Tool.Stone);
    expect(propInfo(PropKind.CopperOutcrop).tool).toBe(Tool.Flint);
    expect(propInfo(PropKind.TinOutcrop).tool).toBe(Tool.Flint);
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const outcrop = nearestProp(s, PropKind.StoneOutcrop);
    // Hardwood tools: the worker says it needs better tools and stops.
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...outcrop }])).toContain('Stone outcrop: needs better tools than these.');
    // Stone tools: it quarries the outcrop.
    e.tool[0] = Tool.Stone;
    const before = pool[Res.Stone]!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...outcrop }]);
    runUntil(s, () => pool[Res.Stone]! > before, 6000);
    // Copper ore still needs flint.
    const copper = nearestProp(s, PropKind.CopperOutcrop);
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...copper }])).toContain('Copper outcrop: needs better tools than these.');
  });

  it('dig a little faster than hardwood and barely scratch stone (Table 10)', () => {
    expect(digRate(Tool.Stone, Mat.Soil)).toBe(520);
    expect(digRate(Tool.Stone, Mat.Stone)).toBe(3);
    expect(digRate(Tool.Hardwood, Mat.Stone)).toBe(0);
    expect(digRate(Tool.Flint, Mat.Soil)).toBe(550);
  });

  it('are what Equip Best hands out over hardwood, and flint over stone', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const ids = [e.id[0]!, e.id[1]!];
    run(s, 2, [{ kind: 'debugGive', player: 0, item: Item.ToolsStone, count: 1 }, { kind: 'debugGive', player: 0, item: Item.ToolsFlint, count: 1 }]);
    run(s, 1, [{ kind: 'equipBest', player: 0, units: ids }]);
    runUntil(s, () => e.tool[0] !== Tool.Hardwood && e.tool[1] !== Tool.Hardwood, 3000);
    expect([e.tool[0], e.tool[1]].sort()).toEqual([Tool.Stone, Tool.Flint]);
  });
});
