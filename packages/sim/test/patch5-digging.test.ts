// Patch 5's digging (Jade's GP-4, BL-2 and BG-6). A dig can be drawn upwards
// from the ground clicked to dig a hill away; diggers take the high points
// first and spread over the area a layer at a time, a regular dig too; they
// reach material up to 2 m over their heads; a bite takes a tenth of the time
// and earth weighs half as much; and a tunnel goes into a cliff too tall to
// climb from its face, and units walk in.
import { describe, expect, it } from 'vitest';
import {
  Act,
  addAnimal,
  biteSteps,
  createWorld,
  DIG_SPEED_TIMES,
  loadCapacity,
  Mat,
  REACH_UP_UNITS,
  Res,
  SiteKind,
  Species,
  SPREAD_UNITS,
  step,
  stretchCells,
  TOOL_GEAR,
  ToolJob,
  TUNNEL_HEIGHT_UNITS,
  TUNNEL_WIDTH_COLUMNS,
  WU_PER_COLUMN,
  WILD,
  WU_PER_TERRAIN_UNIT,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

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

/** A flat, open, explored patch w by h columns (with a 3-column margin) near the first worker. */
function flatSpot(s: SimState, w: number, h: number): { x: number; z: number; y: number } {
  const x0 = col(s.entities.x[0]!);
  const z0 = col(s.entities.z[0]!);
  for (let r = 6; r < 120; r += 2) {
    for (const [x, z] of [[x0 + r, z0], [x0 - r - w, z0], [x0, z0 + r], [x0, z0 - r - h]] as const) {
      const y = s.world.topAt(x, z);
      let ok = true;
      for (let dz = -3; dz < h + 3 && ok; dz++) {
        for (let dx = -3; dx < w + 3 && ok; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || s.buildings.footprintAt(cx, cz) !== 0 || !s.world.isExplored(cx >> 2, cz >> 2)) ok = false;
          for (const p of s.world.props(cx >> 6, cz >> 6, s.step)) if ((cx >> 6) * 64 + p.lx === cx && (cz >> 6) * 64 + p.lz === cz && p.stage > 0) ok = false;
        }
      }
      if (ok) return { x, z, y };
    }
  }
  throw new Error('no flat spot');
}

/** A world with only the workers listed (by index), with steel picks: the warriors and the rest go, so nobody stands on a column of the dig. */
function camp(keep: number[]): SimState {
  const s = createWorld(1, { peaceful: true, warriors: 0 });
  const e = s.entities;
  const gone: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && !keep.includes(i)) gone.push(e.id[i]!);
  for (const id of gone) e.remove(id);
  for (const i of keep) e.toolBreak[i] = TOOL_GEAR[8]![ToolJob.Break]!;
  return s;
}

/** The highest and lowest top of the columns of a box. */
function tops(s: SimState, x0: number, z0: number, x1: number, z1: number): [number, number] {
  let hi = -Infinity;
  let lo = Infinity;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const t = s.world.topAt(x, z);
      hi = Math.max(hi, t);
      lo = Math.min(lo, t);
    }
  }
  return [hi, lo];
}

/**
 * Runs a lone digger's site to the end, checking at every step that the
 * columns stay within SPREAD_UNITS of each other (a layer at a time) and that
 * every bite it takes is at most 2 m over its head.
 */
function digInLayers(s: SimState, x0: number, z0: number, x1: number, z1: number): void {
  const e = s.entities;
  let spread = 0;
  let reach = -Infinity;
  runUntil(s, () => {
    const [hi, lo] = tops(s, x0, z0, x1, z1);
    spread = Math.max(spread, hi - lo);
    if (e.act[0] === Act.Work && e.waitUntil[0]! > 0) reach = Math.max(reach, s.world.topAt(e.climbX[0]!, e.climbZ[0]!) - Math.floor(e.y[0]! / WU_PER_TERRAIN_UNIT));
    return s.sites.length === 0;
  }, 120000);
  expect(spread).toBeLessThanOrEqual(SPREAD_UNITS);
  expect(reach).toBeLessThanOrEqual(REACH_UP_UNITS);
}

describe("digging (Jade's Patch 5)", () => {
  it('digs a hill away inside a box drawn upwards from the ground clicked, from the top a layer at a time, reaching at most 2 m over its head (GP-4)', () => {
    const s = camp([0]);
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 5, 5);
    // A soil mound 4.5 m tall on 3 by 3 columns (its top is out of reach from the ground, so the digger climbs it), in a 5 by 5 box drawn 5 m up from the ground round it.
    s.world.editBox(x + 1, z + 1, x + 3, z + 3, y, y + 40, Mat.Soil);
    run(s, 1, [{ kind: 'dig', player: 0, units: [e.id[0]!], x0: x, z0: z, x1: x + 4, z1: z + 4, level: y, level2: y + 45, tunnel: 2 }]);
    expect(s.sites[0]).toMatchObject({ kind: SiteKind.Up, level: y, level2: y + 45 });
    digInLayers(s, x + 1, z + 1, x + 3, z + 3);
    // Level with the ground clicked, and nothing under it dug.
    expect(tops(s, x, z, x + 4, z + 4)).toEqual([y, y]);
  });

  it('digs a pit a layer at a time across it too, not a column at a time (GP-4)', () => {
    const s = camp([0]);
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 4, 4);
    run(s, 1, [{ kind: 'dig', player: 0, units: [e.id[0]!], x0: x, z0: z, x1: x + 3, z1: z + 3, level: y - 9, level2: 0, tunnel: 0 }]);
    digInLayers(s, x, z, x + 3, z + 3);
    expect(tops(s, x, z, x + 3, z + 3)).toEqual([y - 9, y - 9]);
  });

  it('digs the ground from under a wild animal stuck in the pit, which drops with the floor, rather than waiting for it for ever', () => {
    const s = camp([0]);
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 3, 3);
    const deer = e.id[addAnimal(s, Species.Deer, WILD, centre(x + 1), centre(z + 1), 0, 0)]!;
    run(s, 1, [{ kind: 'dig', player: 0, units: [e.id[0]!], x0: x, z0: z, x1: x + 2, z1: z + 2, level: y - 9, level2: 0, tunnel: 0 }]);
    // It stays in the middle of the pit (it cannot get out of a deep one).
    runUntil(s, () => {
      const a = e.indexOf(deer);
      e.x[a] = centre(x + 1);
      e.z[a] = centre(z + 1);
      return s.sites.length === 0;
    }, 20000);
    expect(tops(s, x, z, x + 2, z + 2)).toEqual([y - 9, y - 9]);
    expect(e.y[e.indexOf(deer)]).toBe((y - 9) * WU_PER_TERRAIN_UNIT);
  });

  it('takes a tenth of the time a bite took, and a load holds twice the earth (BL-2)', () => {
    // A soil bite with a digging stick (500 a minute) was 54 steps, 2.7 s.
    expect(DIG_SPEED_TIMES).toBe(10);
    expect(biteSteps(500, 1000)).toBe(5);
    expect(loadCapacity(Res.Earth)).toBe(10);
  });

  it("tunnels into a cliff too tall to climb from its face, and units walk in on the tunnel's floor (BG-6)", () => {
    const s = camp([0, 1, 2, 3]);
    const e = s.entities;
    const ids = [0, 1, 2, 3].map((i) => e.id[i]!);
    const { x, z, y } = flatSpot(s, 24, 12);
    run(s, 1, [{ kind: 'move', player: 0, units: ids, x: centre(x + 21), z: centre(z + 5) }]);
    runUntil(s, () => [0, 1, 2, 3].every((i) => col(e.x[i]!) > x + 15), 4000);
    // A soil cliff 9 m tall (no worker climbs past 7 m) from x to x + 14, between the workers and their main base; its face looks east, at them.
    s.world.editBox(x, z, x + 14, z + 11, y, y + 80, Mat.Soil);
    // From the face column, 8 columns west into the cliff, level with the ground in front.
    run(s, 1, [{ kind: 'tunnelStretch', player: 0, units: ids, x: x + 14, z: z + 4, dir: 4, length: 8, level: y, level2: y + TUNNEL_HEIGHT_UNITS }]);
    expect(s.sites.length).toBe(1);
    // Back from the drop-off behind the cliff, they go round to the face, never to the far end of the tunnel; two wait while two dig the face (it is two columns wide).
    const said: string[] = [];
    let waited = 0;
    runUntil(s, () => {
      said.push(...s.events.map((v) => v.text));
      waited = Math.max(waited, [0, 1, 2, 3].filter((i) => e.act[i] === Act.Wait).length);
      return s.sites.length === 0;
    }, 60000);
    expect(said).not.toContain('A worker cannot reach the dig.');
    expect(said).toContain('The tunnel is finished.');
    expect(waited).toBeGreaterThan(0);
    for (const [cx, cz] of stretchCells(x + 14, z + 4, 4, 8, TUNNEL_WIDTH_COLUMNS)) {
      expect(s.nav.under(cx, cz)).toBe(y);
      expect(s.world.topAt(cx, cz)).toBe(y + 80);
    }
    // A worker walks to the far end, under 9 m of cliff.
    run(s, 1, [{ kind: 'move', player: 0, units: [ids[0]!], x: centre(x + 7), z: centre(z + 4) }]);
    runUntil(s, () => col(e.x[0]!) === x + 7 && col(e.z[0]!) === z + 4, 4000);
    expect(e.y[0]).toBe(y * WU_PER_TERRAIN_UNIT);
  });
});
