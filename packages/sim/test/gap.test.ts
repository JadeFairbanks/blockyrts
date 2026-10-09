// The fixes between milestones 5 and 6: the early tools by job, none
// researched (Table 2c, Table 5: the stone maul, the stone hammer, the flint
// axe and knife; since Troops and gear, the tier 2 tool kit a worker upgrades
// to at the Big House), digging into a cliff face (Digging and building up the
// land), and hopping up 3 to 4 unit rises (Moving over the land).
import { describe, expect, it } from 'vitest';
import {
  CLIMB_COST_PER_UNIT,
  Gait,
  gaitMover,
  MOB_WALKER,
  BuildingKind,
  CHUNK_SHIFT,
  createWorld,
  deserializeState,
  hashState,
  serializeState,
  digRate,
  gearSpec,
  Line,
  Mat,
  NO_FLOOR,
  PERSON,
  PropKind,
  propInfo,
  Res,
  step,
  heldTools,
  placeBuilding,
  placementBlocked,
  Blocked,
  propJob,
  RESEARCH,
  Research,
  TIER_NEEDS,
  Tool,
  TOOL_GEAR,
  TOOL_KITS,
  ToolJob,
  toolMelee,
  toolNeeded,
  toolTierFor,
  upgradeProgress,
  workerMelee,
  ALL_JOBS,
  WU_PER_COLUMN,
  WU_PER_TERRAIN_UNIT,
  WALK_SPEED_WU,
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

/** A clear spot for a building near the Big House, searching outwards. */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + 16 + dx, b.z + dz) === Blocked.None) return [b.x + 16 + dx, b.z + dz];
      }
    }
  }
  throw new Error('no free spot');
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

/** The tier 2 kit's tool for each job: the flint axe and knife, the stone maul, the stone hammer (Table 2c). */
const FLINT = TOOL_GEAR[2]![ToolJob.Chop]!;
const MAUL = TOOL_GEAR[2]![ToolJob.Break]!;
const HAMMER = TOOL_GEAR[2]![ToolJob.Build]!;

describe('early tools by job', () => {
  it('make stone the blunt tier and flint the edge tier, with no research (Table 2c)', () => {
    expect(Tool.Hardwood < Tool.Stone && Tool.Stone < Tool.Flint).toBe(true);
    // One tier 2 kit (Troops and gear): 6 sticks, 1 flint and 5 stone, 30 s to make.
    const kit = TOOL_KITS[2]!;
    expect(kit.name).toBe('Stone and flint tools');
    expect(kit.cost).toEqual([[[Res.Sticks, 6], [Res.Flint, 1], [Res.Stone, 5]]]);
    expect(kit.timeS).toBe(30);
    const maul = gearSpec(MAUL);
    expect(maul.name).toBe('Stone maul');
    expect(maul.tool).toBe(Tool.Stone);
    expect(maul.jobs).toBe(1 << ToolJob.Break);
    expect(maul.model).toBe('maul_stone');
    const hammer = gearSpec(HAMMER);
    expect(hammer.name).toBe('Stone hammer');
    expect(hammer.jobs).toBe(1 << ToolJob.Build);
    expect(hammer.model).toBe('hammer_stone');
    const flint = gearSpec(FLINT);
    expect(flint.name).toBe('Flint axe and knife');
    expect(flint.jobs).toBe((1 << ToolJob.Chop) | (1 << ToolJob.Cut));
    expect(TOOL_GEAR[2]![ToolJob.Cut]).toBe(FLINT);
    // The kit's blow is the tier's (Table 2c's 5, less 2 since Patch 5), whichever of its tools is in hand.
    for (const g of [MAUL, HAMMER, FLINT]) expect(toolMelee(g).damage).toBe(3);
    expect(toolMelee(TOOL_GEAR[1]![ToolJob.Chop]!).damage).toBe(2);
    expect(gearSpec(TOOL_GEAR[1]![0]!).jobs).toBe(ALL_JOBS);
    expect(gearSpec(TOOL_GEAR[3]![0]!).jobs).toBe(ALL_JOBS);
    // No flint pick, no flint mallet, no stone axe: the jobs do not overlap.
    expect(toolTierFor(FLINT, ToolJob.Break)).toBe(Tool.None);
    expect(toolTierFor(MAUL, ToolJob.Chop)).toBe(Tool.None);
    // Tier 2 needs no forge and no research, and Flint tools research is gone from the Scholar's Lodge.
    expect(TIER_NEEDS[2]).toMatchObject({ forge: 0, research: [] });
    expect(RESEARCH[Research.FlintTools]!.retired).toBe(true);
    expect(toolNeeded(ToolJob.Break, Tool.Stone)).toBe('stone maul');
    expect(toolNeeded(ToolJob.Chop, Tool.Stone)).toBe('flint axe');
    expect(toolNeeded(ToolJob.Break, Tool.Flint)).toBe('copper pickaxe');
  });

  it('are had at the Big House on day 0: Upgrade Tools pays 6 sticks, 1 flint and 5 stone and takes 15 s', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const sticks = pool[Res.Sticks]!;
    const stone = pool[Res.Stone]!;
    const flint = pool[Res.Flint]!;
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [e.id[0]!], line: Line.Weapon, max: 0 }]);
    expect([pool[Res.Sticks], pool[Res.Flint], pool[Res.Stone]]).toEqual([sticks - 6, flint - 1, stone - 5]);
    // Half the kit's 30 s beside the Big House.
    let bar = 0;
    let beside = 0;
    runUntil(
      s,
      () => {
        const [, n] = upgradeProgress(s, 0);
        if (n) {
          bar = n;
          beside++;
        }
        return e.wTier[0] === 2;
      },
      1000,
    );
    expect(bar).toBe(300);
    expect(beside).toBeGreaterThanOrEqual(299);
    // The hardwood kit is scrapped with a full refund (3 sticks).
    expect([pool[Res.Sticks], pool[Res.Flint], pool[Res.Stone]]).toEqual([sticks - 3, flint - 1, stone - 5]);
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
    e.toolChop[0] = FLINT;
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...copper }])).toContain('Copper outcrop: needs a stone maul or better.');
    e.toolBreak[0] = MAUL;
    const ore = pool[Res.CopperOre]!;
    run(s, 1, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...copper }]);
    runUntil(s, () => pool[Res.CopperOre]! > ore, 8000);
  });

  it('chop birch only with a flint axe or better', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    e.toolBreak[0] = MAUL;
    e.toolBuild[0] = HAMMER;
    const birch = nearestProp(s, PropKind.Birch);
    expect(texts(s, 3, [{ kind: 'gather', player: 0, units: [e.id[0]!], ...birch }])).toContain('Birch: needs a flint axe or better.');
    e.toolChop[0] = FLINT;
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

  it('build and repair 15% faster with a stone hammer than with the wooden mallet', () => {
    const work = (hammer: boolean): number => {
      const s = createWorld(1, { peaceful: true });
      const pool = s.players[0]!.pool;
      // The Hall (Patch 5's tier 2): 118 lumber and 45 stone.
      pool[Res.SoftwoodLumber] = 200;
      pool[Res.Stone] = 100;
      if (hammer) s.entities.toolBuild[0] = HAMMER;
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

  it('are handed out by job with the tier 2 kit, and the copper kit replaces them all', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [e.id[0]!], line: Line.Weapon, max: 0 }]);
    runUntil(s, () => e.wTier[0] === 2, 3000);
    expect([e.toolChop[0], e.toolBreak[0], e.toolBuild[0], e.toolCut[0]]).toEqual([FLINT, MAUL, HAMMER, FLINT]);
    expect(heldTools(e, 0)).toEqual([FLINT, MAUL, HAMMER]);
    // The worker fights with the kit's blow.
    expect(workerMelee(e, 0).damage).toBe(3);
    // Copper tools need a Forge (Patch 2: any Forge, in place of a Casting Hearth): 2 copper ingots and 2 lumber, half of 35 s beside the nearest Forge or main base.
    pool[Res.CopperIngot] = 2;
    // Either lumber pays (Patch 5): only hardwood is in stock here.
    pool[Res.SoftwoodLumber] = 0;
    pool[Res.HardwoodLumber] = 2;
    const said: string[] = [];
    for (let k = 0; k < 2; k++) {
      step(s, k === 0 ? [{ kind: 'upgradeKit', player: 0, units: [e.id[0]!], line: Line.Weapon, max: 0 }] : []);
      said.push(...s.events.map((v) => v.text));
    }
    expect(said).toContain('Needs a Forge.');
    expect(e.wTier[0]).toBe(2);
    expect(pool[Res.CopperIngot]).toBe(2);
    const [fx, fz] = freeSpot(s, BuildingKind.Forge);
    placeBuilding(s, 0, BuildingKind.Forge, 0, fx, fz, true);
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [e.id[0]!], line: Line.Weapon, max: 0 }]);
    expect([pool[Res.CopperIngot], pool[Res.HardwoodLumber]]).toEqual([0, 0]);
    runUntil(s, () => e.wTier[0] === 3, 3000);
    const copper = TOOL_GEAR[3]![0]!;
    expect([e.toolChop[0], e.toolBreak[0], e.toolBuild[0], e.toolCut[0]]).toEqual([copper, copper, copper, copper]);
    expect(heldTools(e, 0)).toEqual([copper]);
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
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || !s.world.isExplored(cx >> 2, cz >> 2)) ok = false;
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
  it('walks up 2 units, jumps up to 5 (Patch 5: 20% higher), climbs a face slowly, and a monster jumps 1 m', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z, y } = flatSpot(s, 12, 2);
    raise(s, x + 1, z, x + 1, z, y, y + 2);
    raise(s, x + 3, z, x + 3, z, y, y + 5);
    raise(s, x + 5, z, x + 5, z, y, y + 6);
    raise(s, x + 7, z, x + 7, z, y, y + 9);
    raise(s, x + 9, z, x + 9, z, y, y + 36);
    const worker = gaitMover(Gait.Worker);
    const fighter = gaitMover(Gait.Fighter);
    expect(s.nav.stepCost(x, z, x + 1, z, fighter)).toBe(10);
    expect(s.nav.stepCost(x + 2, z, x + 3, z, fighter)).toBe(20);
    // 6 units is a climb for the players' units: 5 times a walk's cost a unit up.
    expect(s.nav.stepCost(x + 4, z, x + 5, z, fighter)).toBe(10 + 6 * CLIMB_COST_PER_UNIT);
    expect(s.nav.climbStep(x + 4, z, x + 5, z, fighter, y)).toBe(true);
    expect(s.nav.hopCost(x + 4, z, x + 5, z, fighter, y)).toBe(-1);
    // 36 units (4.05 m): a worker climbs it (up to 7 m), a fighter does not (up to 4 m).
    expect(s.nav.stepCost(x + 8, z, x + 9, z, worker)).toBeGreaterThan(0);
    expect(s.nav.stepCost(x + 8, z, x + 9, z, fighter)).toBe(-1);
    // The peoples' units keep their 4 unit jump and never climb.
    expect(s.nav.stepCost(x + 2, z, x + 3, z, PERSON)).toBe(-1);
    // Monsters jump 1 m (9 units, MB-3), no more.
    expect(s.nav.stepCost(x + 6, z, x + 7, z, MOB_WALKER)).toBe(20);
    expect(s.nav.stepCost(x + 8, z, x + 9, z, MOB_WALKER)).toBe(-1);
    // A horse jumps 2.5 m and never climbs.
    const horse = gaitMover(Gait.Cavalry);
    expect(s.nav.stepCost(x + 6, z, x + 7, z, horse)).toBe(20);
    expect(s.nav.stepCost(x + 8, z, x + 9, z, horse)).toBe(-1);
    // Down: a drop of up to 9 units is stepped or jumped down; more is climbed down.
    expect(s.nav.stepCost(x + 5, z, x + 4, z, fighter)).toBe(10);
    expect(s.nav.climbStep(x + 9, z, x + 10, z, worker, y + 36)).toBe(true);
  });

  it('hops onto a 5 unit platform, climbs a 3 m face at a fifth of its walk, and a fighter never gets onto a 4.5 m one', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 20, 7);
    raise(s, x, z, x + 4, z + 4, y, y + 5);
    raise(s, x + 7, z, x + 11, z + 4, y, y + 27);
    raise(s, x + 14, z, x + 18, z + 4, y, y + 40);
    const id = e.id[0]!;
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 2), z: centre(z + 2) }]);
    let hopped = 0;
    runUntil(s, () => {
      if (e.hopUntil[0]! > s.step && e.hopRise[0] === 5 * WU_PER_TERRAIN_UNIT) hopped++;
      return col(e.x[0]!) === x + 2 && col(e.z[0]!) === z + 2;
    }, 4000);
    expect(hopped).toBeGreaterThan(0);
    expect(e.y[0]).toBe((y + 5) * WU_PER_TERRAIN_UNIT);
    // Onto the 3 m block (22 units above the platform): down off the platform, then up the face.
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 9), z: centre(z + 2) }]);
    let onFace = 0;
    runUntil(s, () => {
      if (e.onFace[0] !== 0) onFace++;
      return col(e.x[0]!) === x + 9 && col(e.z[0]!) === z + 2;
    }, 6000);
    expect(e.y[0]).toBe((y + 27) * WU_PER_TERRAIN_UNIT);
    // 27 units up at a fifth of 2.55 m/s: about 119 steps on the face (more with the climb back down off the platform).
    expect(onFace).toBeGreaterThanOrEqual(Math.floor((27 * WU_PER_TERRAIN_UNIT * 5) / WALK_SPEED_WU));
    // Saved and loaded while it climbs back down the 3 m face, it carries on the same.
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 13), z: centre(z + 6) }]);
    runUntil(s, () => e.onFace[0] !== 0 && e.y[0]! < (y + 20) * WU_PER_TERRAIN_UNIT, 2000);
    expect(e.onFace[0]).toBe(1);
    const half = serializeState(s);
    run(s, 300);
    const copy = deserializeState(half);
    while (copy.step < s.step) step(copy);
    expect(hashState(copy)).toBe(hashState(s));
    // A fighter (the first warrior), set down beside the 4.5 m block, cannot climb it.
    const w = e.indexOf(e.id[4]!);
    expect(e.kind[w]).toBe(1);
    e.x[w] = centre(x + 13);
    e.z[w] = centre(z + 6);
    e.y[w] = y * WU_PER_TERRAIN_UNIT;
    run(s, 1, [{ kind: 'move', player: 0, units: [e.id[w]!], x: centre(x + 16), z: centre(z + 2) }]);
    run(s, 2000);
    const onBlock = col(e.x[w]!) >= x + 14 && col(e.x[w]!) <= x + 18 && col(e.z[w]!) >= z && col(e.z[w]!) <= z + 4;
    expect(onBlock).toBe(false);
    expect(e.y[w]! < (y + 40) * WU_PER_TERRAIN_UNIT).toBe(true);
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
    for (const i of workers) e.toolBreak[i] = TOOL_GEAR[8]![ToolJob.Break]!;
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
