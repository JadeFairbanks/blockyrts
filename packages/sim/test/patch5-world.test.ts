// Jade's Patch 5 world (WL-2 to WL-11, GP-12): her numbers, checked on
// generated land. One scan of the land round the main bases serves the
// checks that need many chunks.
import { describe, expect, it } from 'vitest';
import {
  amountOf,
  Band,
  BAND_WIDTH_MAX_M,
  BAND_WIDTH_MIN_M,
  BOULDER_BASE_CLEAR_M,
  CHUNK_SHIFT,
  createWorld,
  DIG_LIMIT_UNITS,
  digFloor,
  guardSpring,
  NATURAL_FLOOR_UNITS,
  PropKind,
  PROPS,
  Res,
  RESOURCES,
  Role,
  SPRING_GUARDIAN,
  SPRING_GUARDIAN_LINES,
  step,
  STEPS_PER_SECOND,
  Tool,
  UnitKind,
  World,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

const N = 1 << CHUNK_SHIFT;
/** Columns per metre. */
const CM = 20 / 9;

describe("Patch 5's world", () => {
  const w = new World(1, 2);
  const gen = w.gen;
  const layout = w.layout;
  const pockets = gen.start.pockets;
  const baseDistanceM = (x: number, z: number): number => Math.min(...pockets.map((p) => Math.hypot(p.x - x, p.z - z))) / CM;

  // Every other chunk out to about 400 m from the middle: the lowest ground, and the marble, flax and boulders with their bands.
  let scanned: { lowest: number; marble: number[]; flaxBands: Set<number>; boulders: Array<[number, number]> } | null = null;
  const scan = (): NonNullable<typeof scanned> => {
    if (scanned) return scanned;
    const out = { lowest: Infinity, marble: [0, 0, 0, 0, 0], flaxBands: new Set<number>(), boulders: [] as Array<[number, number]> };
    for (let cz = -14; cz < 14; cz++) {
      for (let cx = -14 + ((cz + 14) & 1); cx < 14; cx += 2) {
        const g = gen.generateChunk(cx, cz);
        for (let i = 0; i < N * N; i++) out.lowest = Math.min(out.lowest, g.columns.top(i));
        for (const p of g.props) {
          const x = cx * N + p.lx;
          const z = cz * N + p.lz;
          if (p.kind === PropKind.MarbleRock) out.marble[gen.columnBand(x, z)]!++;
          if (p.kind === PropKind.WildFlax || p.kind === PropKind.FlaxTall) out.flaxBands.add(gen.columnBand(x, z));
          if (p.kind === PropKind.Boulder) out.boulders.push([x, z]);
        }
      }
    }
    scanned = out;
    return out;
  };

  it('measures the bands from the nearest main base, 155 to 175 m each, the border wandering 5 m (WL-8)', () => {
    let at = 0;
    for (const start of layout.bandStarts) {
      expect(((start - at) * 9) / 20).toBeGreaterThanOrEqual(BAND_WIDTH_MIN_M - 1);
      expect(((start - at) * 9) / 20).toBeLessThanOrEqual(BAND_WIDTH_MAX_M + 1);
      at = start;
    }
    const wander = 12;
    for (let t = 0; t < 400; t++) {
      const x = ((t * 7919) % 3200) - 1600;
      const z = ((t * 104729) % 3200) - 1600;
      const d = layout.startDistance(x, z);
      expect(Math.abs(d / CM - baseDistanceM(x, z))).toBeLessThan(1);
      const band = gen.columnBand(x, z);
      expect(band).toBeGreaterThanOrEqual(layout.bandAtDistance(d - wander));
      expect(band).toBeLessThanOrEqual(layout.bandAtDistance(d + wander));
    }
  });

  it('guarantees a peak of 9 m or more 100 to 125 m from a main base (WL-6)', () => {
    const lm = gen.landmark;
    const d = Math.hypot(lm.x - pockets[0]!.x, lm.z - pockets[0]!.z) / CM;
    expect(d).toBeGreaterThanOrEqual(100);
    expect(d).toBeLessThanOrEqual(125);
    let peak = -Infinity;
    for (let dz = -12; dz <= 12; dz += 2) for (let dx = -12; dx <= 12; dx += 2) peak = Math.max(peak, w.topAt(lm.x + dx, lm.z + dz));
    expect(peak * 0.1125).toBeGreaterThanOrEqual(9);
  });

  it('lets nothing natural or dug lie more than 6 m below sea level (WL-2)', () => {
    expect(scan().lowest).toBeGreaterThanOrEqual(-NATURAL_FLOOR_UNITS);
    expect(digFloor(0)).toBe(-DIG_LIMIT_UNITS);
    expect(digFloor(-40)).toBe(-NATURAL_FLOOR_UNITS);
  });

  it('puts marble rock in the Fringe and the Deepwoods (GP-12), flax only out to the Deepwoods (WL-10), and no boulder near a main base (WL-5)', () => {
    const { marble, flaxBands, boulders } = scan();
    expect(marble[Band.Fringe]).toBeGreaterThan(0);
    expect(marble[Band.Deepwoods]).toBeGreaterThan(0);
    expect(flaxBands.size).toBeGreaterThan(0);
    for (const b of flaxBands) expect(b).toBeLessThanOrEqual(Band.Deepwoods);
    expect(boulders.length).toBeGreaterThan(0);
    for (const [x, z] of boulders) expect(baseDistanceM(x, z)).toBeGreaterThanOrEqual(BOULDER_BASE_CLEAR_M);
  });

  it('gives coal rock and the ore nodes more stone than ore, left behind once mined out, with copper tools (WL-4, WL-7)', () => {
    for (const [kind, most] of [[PropKind.CoalRock, 30], [PropKind.SilverNode, 4], [PropKind.GoldNode, 2]] as const) {
      const info = PROPS[kind]!;
      expect(info.tool).toBe(Tool.Copper);
      for (let v = 0; v < 2000; v += 7) expect(amountOf(kind, v)).toBeLessThanOrEqual(most);
      const leaves = info.leaves!;
      const ore = kind === PropKind.CoalRock ? Res.Coal : kind === PropKind.SilverNode ? Res.Silver : Res.Gold;
      const stone = leaves.kind === PropKind.StoneOutcrop || leaves.kind === PropKind.LooseStone;
      expect(stone).toBe(true);
      // By weight for coal ("mostly rock by weight"), by count for the nodes ("more stone than the ore").
      if (kind === PropKind.CoalRock) expect(leaves.min * RESOURCES[Res.Stone]!.weightTenthsLb).toBeGreaterThan(most * RESOURCES[ore]!.weightTenthsLb);
      else expect(leaves.min).toBeGreaterThan(most);
    }
    const at = w.addProp(40, 40, PropKind.CoalRock, 77, 25, 0);
    expect(w.harvest(at.cx, at.cz, at.i, 100, 1)).toBe(25);
    const left = w.props(at.cx, at.cz, 2).find((p) => p.kind === PropKind.StoneOutcrop && at.cx * N + p.lx === 40 && at.cz * N + p.lz === 40);
    expect(left?.amount).toBeGreaterThanOrEqual(40);
    expect(left?.amount).toBeLessThanOrEqual(60);
  });

  it('wakes an ash golem at a hot spring the first time, speaking as it does, and none in a peaceful game (WL-11)', () => {
    const springChunk = (s: SimState): [number, number] => {
      for (let cx = 10; cx < 80; cx++) if (s.world.gen.chunkSpring(cx, 0)) return [cx, 0];
      throw new Error('no hot spring east of the start');
    };
    const guardians = (s: SimState): number[] => {
      const e = s.entities;
      const out: number[] = [];
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === SPRING_GUARDIAN && e.role[i] === Role.Resident) out.push(i);
      return out;
    };
    const calm = createWorld(1, { peaceful: true });
    guardSpring(calm, ...springChunk(calm));
    expect(guardians(calm)).toEqual([]);
    const s = createWorld(1);
    const before = guardians(s).length;
    guardSpring(s, ...springChunk(s));
    const g = guardians(s);
    expect(g.length).toBe(before + 1);
    // A worker 18 m off, out of its 12 m reach: it grumbles a warning within the second.
    const e = s.entities;
    const golemId = e.id[g[g.length - 1]!]!;
    const workerId = e.id[0]!;
    const said: string[] = [];
    for (let k = 0; k < STEPS_PER_SECOND + 1; k++) {
      const golem = e.indexOf(golemId);
      const worker = e.indexOf(workerId);
      e.x[worker] = e.x[golem]! + 18 * WU_PER_METRE;
      e.z[worker] = e.z[golem]!;
      e.queue[worker] = [];
      step(s);
      for (const v of s.events) if (v.kind === 'speech' && v.speaker === golemId) said.push(v.text);
    }
    expect(said.length).toBe(1);
    expect(SPRING_GUARDIAN_LINES.warn as readonly string[]).toContain(said[0]);
  });
});
