// The fixes between milestones 5 and 6: stone tools at the Big House and
// stone outcrops (Table 2c, Table 5), digging into a cliff face (Digging and
// building up the land), and hopping up 3 to 4 unit rises (Moving over the land).
import { describe, expect, it } from 'vitest';
import {
  BIG_WALKER,
  BuildingKind,
  CHUNK_SHIFT,
  createWorld,
  CRAFT_PRODUCT,
  digRate,
  Item,
  itemSpec,
  Mat,
  NO_FLOOR,
  PERSON,
  PropKind,
  propInfo,
  Res,
  step,
  Tool,
  toolItem,
  WU_PER_COLUMN,
  WU_PER_TERRAIN_UNIT,
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

/** A flat, explored, empty patch of w x h columns near the first worker: its corner and ground level. */
function flatSpot(s: SimState, w: number, h: number): { x: number; z: number; y: number } {
  const x0 = col(s.entities.x[0]!);
  const z0 = col(s.entities.z[0]!);
  for (let r = 6; r < 120; r += 2) {
    for (const [x, z] of [[x0 + r, z0], [x0 - r - w, z0], [x0, z0 + r], [x0, z0 - r - h], [x0 + r, z0 + r], [x0 - r - w, z0 - r - h]] as const) {
      const y = s.world.topAt(x, z);
      let ok = true;
      for (let dz = -2; dz < h + 2 && ok; dz++) {
        for (let dx = -2; dx < w + 2 && ok; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || !s.world.isExplored(0, cx >> 2, cz >> 2)) ok = false;
        }
      }
      if (ok) return { x, z, y };
    }
  }
  throw new Error('no flat spot');
}

/** Raises a box of columns to a level with soil. */
function raise(s: SimState, x0: number, z0: number, x1: number, z1: number, from: number, to: number): void {
  s.world.editBox(x0, z0, x1, z1, from, to, Mat.Soil);
}

const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

describe('moving over the land', () => {
  it('walks up 2 units, jumps 3 to 4 at a cost, and is blocked by 5 (big monsters jump 6)', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z, y } = flatSpot(s, 8, 2);
    raise(s, x + 1, z, x + 1, z, y, y + 2);
    raise(s, x + 3, z, x + 3, z, y, y + 4);
    raise(s, x + 5, z, x + 5, z, y, y + 5);
    raise(s, x + 7, z, x + 7, z, y, y + 6);
    expect(s.nav.stepCost(x, z, x + 1, z, PERSON)).toBe(10);
    expect(s.nav.stepCost(x + 2, z, x + 3, z, PERSON)).toBe(20);
    expect(s.nav.stepCost(x + 4, z, x + 5, z, PERSON)).toBe(-1);
    expect(s.nav.stepCost(x + 6, z, x + 7, z, PERSON)).toBe(-1);
    expect(s.nav.stepCost(x + 6, z, x + 7, z, BIG_WALKER)).toBeGreaterThan(0);
    // Down: a drop of up to 9 units is stepped or jumped down.
    expect(s.nav.stepCost(x + 5, z, x + 4, z, PERSON)).toBe(10);
  });

  it('hops up onto a 4 unit platform, slowing for a moment, but cannot get onto a 5 unit one', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 16, 7);
    raise(s, x, z, x + 4, z + 4, y, y + 4);
    raise(s, x + 10, z, x + 14, z + 4, y, y + 5);
    const id = e.id[0]!;
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 2), z: centre(z + 2) }]);
    let hopped = 0;
    runUntil(s, () => {
      if (e.hopUntil[0]! > s.step && e.hopRise[0] === 4 * WU_PER_TERRAIN_UNIT) hopped++;
      return col(e.x[0]!) === x + 2 && col(e.z[0]!) === z + 2;
    }, 4000);
    expect(hopped).toBeGreaterThan(0);
    expect(e.y[0]).toBe((y + 4) * WU_PER_TERRAIN_UNIT);
    // Off it again and towards the 5 unit platform: it never gets on.
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 12), z: centre(z + 2) }]);
    run(s, 1500);
    expect(e.y[0]! < (y + 5) * WU_PER_TERRAIN_UNIT).toBe(true);
  });
});

describe('digging into a cliff face', () => {
  it('carves a tunnel through a hill that workers walk into, under the overhang', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 20, 9);
    // A soil hill 3.4 m tall and 10 columns deep, from x + 6 to x + 15.
    const hx0 = x + 6;
    const hx1 = x + 15;
    raise(s, hx0, z, hx1, z + 8, y, y + 30);
    const workers = [0, 1, 2, 3];
    for (const i of workers) e.tool[i] = Tool.HighQualitySteel;
    run(s, 1, [{ kind: 'move', player: 0, units: workers.map((i) => e.id[i]!), x: centre(x + 2), z: centre(z + 4) }]);
    run(s, 400);
    // Tunnel 2 columns wide, 2.25 m tall, all the way through.
    run(s, 1, [{ kind: 'dig', player: 0, units: workers.map((i) => e.id[i]!), x0: hx0, z0: z + 4, x1: hx1, z1: z + 5, level: y, level2: y + 20, tunnel: 1 }]);
    const site = s.sites[s.sites.length - 1]!.id;
    const done = runUntil(s, () => !s.sites.some((t) => t.id === site), 12000);
    expect(done).toBeGreaterThan(0);
    for (let cx = hx0; cx <= hx1; cx++) {
      expect(s.nav.under(cx, z + 4)).toBe(y);
      expect(s.nav.roof(cx, z + 4)).toBe(y + 20);
      // The hill above is still there.
      expect(s.world.topAt(cx, z + 4)).toBe(y + 30);
    }
    expect(s.nav.under(hx0, z + 3)).toBe(NO_FLOOR);
    expect(s.threats.tunnels.length).toBe(1);
    // A worker walks into the middle of the tunnel and stands on its floor, under the hill.
    const id = e.id[0]!;
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(hx0 + 5), z: centre(z + 4) }]);
    runUntil(s, () => col(e.x[0]!) === hx0 + 5 && col(e.z[0]!) === z + 4, 3000);
    expect(e.y[0]).toBe(y * WU_PER_TERRAIN_UNIT);
    // And out of the far side.
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(hx1 + 3), z: centre(z + 4) }]);
    runUntil(s, () => col(e.x[0]!) === hx1 + 3, 3000);
    expect(e.y[0]).toBe(y * WU_PER_TERRAIN_UNIT);
  });
});
