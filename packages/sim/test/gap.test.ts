// The fixes between milestones 5 and 6: the early tools by job at the Big
// House, none researched (Table 2c, Table 5: the stone maul, the stone hammer,
// the flint axe and knife), digging into a cliff face (Digging and building up
// the land), and hopping up 3 to 4 unit rises (Moving over the land).
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
  heldTools,
  ITEMS,
  propJob,
  RESEARCH,
  Research,
  Tool,
  ToolJob,
  toolMelee,
  toolNeeded,
  toolTierFor,
  workerMelee,
  ALL_JOBS,
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

describe('early tools by job', () => {
  it('make stone the blunt tier and flint the edge tier, with no research (Table 2c)', () => {
    expect(Tool.Hardwood < Tool.Stone && Tool.Stone < Tool.Flint).toBe(true);
    const maul = itemSpec(Item.MaulStone);
    expect(maul.name).toBe('Stone maul');
    expect(maul.tool).toBe(Tool.Stone);
    expect(maul.jobs).toBe(1 << ToolJob.Break);
    expect(maul.recipes).toEqual([[[Res.Sticks, 2], [Res.Stone, 3]]]);
    expect(maul.steps).toBe(200);
    expect(maul.weightTenthsLb).toBe(40);
    expect(maul.model).toBe('maul_stone');
    // Damage 4, and slow.
    expect(toolMelee(Item.MaulStone).damage).toBe(4);
    expect(toolMelee(Item.MaulStone).attackSteps).toBeGreaterThan(toolMelee(Item.ToolsHardwood).attackSteps);
    const hammer = itemSpec(Item.HammerStone);
    expect(hammer.name).toBe('Stone hammer');
    expect(hammer.jobs).toBe(1 << ToolJob.Build);
    expect(hammer.recipes).toEqual([[[Res.Sticks, 2], [Res.Stone, 2]]]);
    expect(hammer.weightTenthsLb).toBe(30);
    expect(hammer.model).toBe('hammer_stone');
    const flint = itemSpec(Item.ToolsFlint);
    expect(flint.name).toBe('Flint axe and knife');
    expect(flint.jobs).toBe((1 << ToolJob.Chop) | (1 << ToolJob.Cut));
    expect(flint.recipes).toEqual([[[Res.Sticks, 2], [Res.Flint, 1]]]);
    expect(toolMelee(Item.ToolsFlint).damage).toBe(5);
    expect(itemSpec(Item.ToolsHardwood).jobs).toBe(ALL_JOBS);
    expect(itemSpec(Item.ToolsCopper).jobs).toBe(ALL_JOBS);
    // No flint pick, no flint mallet, no stone axe: the jobs do not overlap.
    expect(toolTierFor(Item.ToolsFlint, ToolJob.Break)).toBe(Tool.None);
    expect(toolTierFor(Item.MaulStone, ToolJob.Chop)).toBe(Tool.None);
    // Nothing the Big House makes needs research, and Flint tools research is gone from the Scholar's Lodge.
    for (const it of ITEMS) if (it.madeAt.some(([k]) => k === BuildingKind.MainBase)) expect(it.research, it.name).toBe(0);
    expect(RESEARCH[Research.FlintTools]!.retired).toBe(true);
    expect(toolNeeded(ToolJob.Break, Tool.Stone)).toBe('stone maul');
    expect(toolNeeded(ToolJob.Chop, Tool.Stone)).toBe('flint axe');
    expect(toolNeeded(ToolJob.Break, Tool.Flint)).toBe('copper pickaxe');
  });

  it('are made at the Big House on day 0: a stone maul from 2 sticks and 3 stone in 10 s', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const sticks = pool[Res.Sticks]!;
    const stone = pool[Res.Stone]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: bigHouse(s).id, product: CRAFT_PRODUCT + Item.MaulStone, count: 1 }]);
    const took = runUntil(s, () => s.players[0]!.items[Item.MaulStone]! >= 1, 400);
    expect(took).toBeGreaterThan(190);
    expect(pool[Res.Sticks]).toBe(sticks - 2);
    expect(pool[Res.Stone]).toBe(stone - 3);
  });

  it('quarry a stone outcrop with the digging stick, and mine copper only with a stone maul (Table 5)', () => {
    expect(propInfo(PropKind.StoneOutcrop).tool).toBe(Tool.Hardwood);
    expect(propInfo(PropKind.CopperOutcrop).tool).toBe(Tool.Stone);
    expect(propInfo(PropKind.TinOutcrop).tool).toBe(Tool.Stone);
    expect(propJob(PropKind.CopperOutcrop)).toBe(ToolJob.Break);
    expect(propJob(PropKind.Birch)).toBe(ToolJob.Chop);
    expect(propJob(PropKind.Herbs)).toBe(ToolJob.Cut);
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const outcrop = nearestProp(s, PropKind.StoneOutcrop);
    const before = pool[Res.Stone]!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...outcrop }]);
    runUntil(s, () => pool[Res.Stone]! > before, 6000);
    // Copper ore: the hardwood digging stick and a flint axe cannot; the stone maul can.
    const copper = nearestProp(s, PropKind.CopperOutcrop);
    e.toolChop[0] = Item.ToolsFlint;
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...copper }])).toContain('Copper outcrop: needs a stone maul or better.');
    e.toolBreak[0] = Item.MaulStone;
    const ore = pool[Res.CopperOre]!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...copper }]);
    runUntil(s, () => pool[Res.CopperOre]! > ore, 8000);
  });

  it('chop birch only with a flint axe or better', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    e.toolBreak[0] = Item.MaulStone;
    e.toolBuild[0] = Item.HammerStone;
    const birch = nearestProp(s, PropKind.Birch);
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...birch }])).toContain('Birch: needs a flint axe or better.');
    e.toolChop[0] = Item.ToolsFlint;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...birch }]);
    run(s, 2);
    expect(e.queue[0]![0]?.t).toBe('gather');
  });

  it('dig with the maul a little faster than the digging stick, and break rock slowly (Table 10)', () => {
    expect(digRate(Tool.Hardwood, Mat.Soil)).toBe(500);
    expect(digRate(Tool.Stone, Mat.Soil)).toBe(580);
    expect(digRate(Tool.Stone, Mat.Clay)).toBe(460);
    expect(digRate(Tool.Stone, Mat.Stone)).toBe(5);
    expect(digRate(Tool.Hardwood, Mat.Stone)).toBe(0);
  });

  it('build and repair 15% faster with a stone hammer than with the hardwood mallet', () => {
    const work = (hammer: boolean): number => {
      const s = createWorld(1, { peaceful: true });
      const pool = s.players[0]!.pool;
      pool[Res.SoftwoodLumber] = 100;
      pool[Res.Stone] = 40;
      if (hammer) s.entities.toolBuild[0] = Item.HammerStone;
      const b = bigHouse(s);
      run(s, 1, [{ kind: 'upgrade', player: 0, building: b.id }]);
      run(s, 1, [{ kind: 'work', player: 0, units: [s.entities.id[0]!], building: b.id }]);
      runUntil(s, () => b.upProgress > 0, 2000);
      const start = b.upProgress;
      run(s, 200);
      return b.upProgress - start;
    };
    expect(work(false)).toBe(200);
    expect(work(true)).toBe(230);
  });

  it('are handed out by job by Equip Best, and a copper set replaces them all', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const stock = s.players[0]!.items;
    run(s, 2, [
      { kind: 'debugGive', player: 0, item: Item.ToolsFlint, count: 1 },
      { kind: 'debugGive', player: 0, item: Item.MaulStone, count: 1 },
      { kind: 'debugGive', player: 0, item: Item.HammerStone, count: 1 },
    ]);
    const hardwood = stock[Item.ToolsHardwood]!;
    run(s, 1, [{ kind: 'equipBest', player: 0, units: [e.id[0]!] }]);
    runUntil(s, () => e.toolChop[0] === Item.ToolsFlint, 3000);
    expect([e.toolChop[0], e.toolBreak[0], e.toolBuild[0], e.toolCut[0]]).toEqual([Item.ToolsFlint, Item.MaulStone, Item.HammerStone, Item.ToolsFlint]);
    // The hardwood set does no job now and goes back to the stock.
    expect(stock[Item.ToolsHardwood]).toBe(hardwood + 1);
    expect(heldTools(e, 0)).toEqual([Item.ToolsFlint, Item.MaulStone, Item.HammerStone]);
    // The worker fights with its best tool, the flint axe.
    expect(workerMelee(e, 0).damage).toBe(5);
    run(s, 2, [{ kind: 'debugGive', player: 0, item: Item.ToolsCopper, count: 1 }]);
    run(s, 1, [{ kind: 'equipBest', player: 0, units: [e.id[0]!] }]);
    runUntil(s, () => e.toolChop[0] === Item.ToolsCopper, 3000);
    expect([e.toolChop[0], e.toolBreak[0], e.toolBuild[0], e.toolCut[0]]).toEqual([Item.ToolsCopper, Item.ToolsCopper, Item.ToolsCopper, Item.ToolsCopper]);
    expect([stock[Item.ToolsFlint], stock[Item.MaulStone], stock[Item.HammerStone]]).toEqual([1, 1, 1]);
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
    for (const i of workers) e.toolBreak[i] = Item.ToolsHQSteel;
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
