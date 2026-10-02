// Turning the world layout into land: the columns of a chunk, their water and
// the props standing on them (Terrain, What the land is made of; The world;
// Generated rocks and trees; Water; Table 5; Table 9). Every value is a pure
// function of the seed, the player count and the column's position.

import { COLUMNS_PER_CHUNK, floorDiv, length2d } from '../fixed.ts';
import { ChunkBuilder, NO_WATER, WATER_PER_UNIT, type ChunkColumns } from './chunk.ts';
import { Band, EdgeType, Look, metresToColumns, metresToUnits, type Cell, type Edge, type WorldLayout } from './layout.ts';
import { Mat } from './materials.ts';
import { centred, hash2, valueNoise } from './noise.ts';
import { PropKind, PROPS } from './props.ts';
import { falloff, polar, POCKET_BLEND_COLUMNS, POCKET_FLAT_COLUMNS, StartBasin, type Pocket } from './start.ts';

/** A generated prop: a resource node, tree or bush on the land. */
export interface PropRecord {
  kind: number;
  /** Column inside the chunk. */
  lx: number;
  lz: number;
  /** Ground height under it, terrain units. */
  y: number;
  /** Hash for the look of this one. */
  variant: number;
  /** Age in steps at step 0 (trees grow from it). */
  age: number;
  /** What it holds. */
  amount: number;
}

export interface GeneratedChunk {
  columns: ChunkColumns;
  props: PropRecord[];
}

/** Low-detail samples of a chunk: one column every `step` columns (far terrain and the minimap). */
export interface LowResChunk {
  step: number;
  size: number;
  top: Int16Array;
  material: Uint8Array;
  /** Water surface in 32nds of a terrain unit, or NO_WATER. */
  water: Int16Array;
}

interface Site {
  id: number;
  x: number;
  z: number;
}

interface PairInfo {
  edge: Edge | null;
  ux: number;
  uz: number;
  mx2: number;
  mz2: number;
  len: number;
}

interface Pond {
  x: number;
  z: number;
  r: number;
  level: number;
  depth: number;
}
interface Stream {
  x: number;
  z: number;
  dx: number;
  dz: number;
  half: number;
  width: number;
  depth: number;
}
interface Bog {
  x: number;
  z: number;
  r: number;
}
interface Spring {
  x: number;
  z: number;
  level: number;
}
interface CellFeatures {
  ponds: Pond[];
  streams: Stream[];
  bogs: Bog[];
  spring: Spring | null;
}

// Per-column flags kept while a chunk is generated, used to place props.
const F_WATER = 1;
const F_STONE = 2;
const F_BANK = 4;
const F_CLAY = 8;
const F_SALTPETRE = 16;
const F_MARSH = 32;
const F_FLAT = 64;
const F_BARRIER = 128;

/** Everything one column's generation works out. Reused between columns. */
class Profile {
  ground = 0;
  smooth = 0;
  base = 0;
  water = NO_WATER;
  source = 0;
  surface: number = Mat.Grass;
  soil = 0;
  flags = 0;
  slab0 = 0;
  slab1 = 0;
  cave0 = 0;
  cave1 = 0;
  seam = 0;
  cell: Cell | null = null;
  band: number = Band.Heartland;
  bandF = 0;
  // Barrier effects while combining edges.
  raise = 0;
  carve = 0;
  riverBottom = 0;
  riverLevel = 0;
  river = false;
  marsh = false;
  marshWater = false;
  stone = false;
  ridgeCore = false;
}

/** Linear interpolation between band values by a band fraction (1024 per band). */
function lerpBand(table: readonly number[], bandF: number): number {
  const i = bandF >> 10;
  const f = bandF & 1023;
  const a = table[Math.min(i, 4)]!;
  const b = table[Math.min(i + 1, 4)]!;
  return a + (((b - a) * f) >> 10);
}

function smooth10(t: number): number {
  return (t * t * (3072 - 2 * t)) >> 20;
}

/** 1024 at x <= flat, easing to 0 at x = 1024 (x in 1/1024 of the half width). */
function shoulder(x: number, flat: number): number {
  if (x <= flat) return 1024;
  if (x >= 1024) return 0;
  return smooth10(1024 - floorDiv((x - flat) * 1024, 1024 - flat));
}

const N = COLUMNS_PER_CHUNK;

export class WorldGen {
  readonly layout: WorldLayout;
  readonly start: StartBasin;
  readonly seed: number;
  private readonly pairs = new Map<number, PairInfo>();
  private readonly features = new Map<number, CellFeatures>();
  private readonly pocketPropCache = new Map<number, Array<{ x: number; z: number; kind: number; amount: number }>>();
  /** Band boundaries as distances from the origin, columns. */
  private readonly bandEdges: number[];
  private readonly bandBlend = metresToColumns(120);
  private readonly p = new Profile();
  private readonly s: number[];

  constructor(layout: WorldLayout) {
    this.layout = layout;
    this.start = new StartBasin(layout);
    this.seed = layout.seed;
    const b = layout.bands;
    const inner = (r: number): number => layout.ringRadius(r) - floorDiv(layout.ringSize(r), 2);
    this.bandEdges = [layout.basinRadius, inner(b.deepwoods), inner(b.barrens), inner(b.deadlands)];
    // Independent noise seeds.
    this.s = [];
    for (let i = 0; i < 32; i++) this.s.push(hash2(this.seed, 0x6e6f6973, i));
  }

  /** Continuous band index (1024 per band) by distance from the origin, for amplitudes that must not seam. */
  bandFrac(dist: number): number {
    let f = 0;
    const half = this.bandBlend >> 1;
    for (const edge of this.bandEdges) {
      const v = floorDiv((dist - (edge - half)) * 1024, this.bandBlend);
      f += Math.max(0, Math.min(1024, v));
    }
    return f;
  }

  private pair(u: Site, v: Site): PairInfo {
    const key = u.id * 16777216 + v.id;
    let info = this.pairs.get(key);
    if (!info) {
      const ux = v.x - u.x;
      const uz = v.z - u.z;
      info = {
        edge: this.layout.adjacent(u.id, v.id) ? this.layout.edge(u.id, v.id) : null,
        ux,
        uz,
        mx2: u.x + v.x,
        mz2: u.z + v.z,
        len: Math.max(1, length2d(ux, uz)),
      };
      if (info.edge && info.edge.type === EdgeType.Nothing) info.edge = null;
      this.pairs.set(key, info);
    }
    return info;
  }

  /** Ponds, streams, bogs and springs inside a cell, placed well inside it. Unwarped coordinates. */
  cellFeatures(cell: Cell): CellFeatures {
    let f = this.features.get(cell.id);
    if (f) return f;
    f = { ponds: [], streams: [], bogs: [], spring: null };
    const h = (k: number): number => hash2(this.seed, 0x66656174 + cell.id, k);
    const at = (k: number, frac: number): { x: number; z: number } =>
      polar(cell.x, cell.z, h(k) & 0xffff, floorDiv(cell.size * ((h(k) >>> 16) % frac), 1000));
    const clearOfPockets = (x: number, z: number, r: number): boolean =>
      this.start.pockets.every((p) => length2d(p.x - x, p.z - z) > POCKET_FLAT_COLUMNS + POCKET_BLEND_COLUMNS + r) &&
      this.start.villages.every((v) => length2d(v.x - x, v.z - z) > v.radius + POCKET_BLEND_COLUMNS + r);
    const band = cell.band;
    const pondOdds = [400, 600, 700, 150, 0][band]!;
    const ponds = (h(1) % 1000 < pondOdds ? 1 : 0) + (h(2) % 1000 < floorDiv(pondOdds, 3) ? 1 : 0);
    for (let i = 0; i < ponds; i++) {
      const c = at(10 + i, 280);
      const r = metresToColumns(4 + (h(20 + i) % 6));
      if (!clearOfPockets(c.x, c.z, r)) continue;
      f.ponds.push({ x: c.x, z: c.z, r, level: this.smoothHeight(c.x, c.z) - 2, depth: metresToUnits(1) + (h(30 + i) % 8) });
    }
    const streamOdds = [500, 500, 200, 0, 0][band]!;
    if (h(3) % 1000 < streamOdds) {
      const c = at(40, 150);
      const a = h(41) & 0xffff;
      const half = floorDiv(cell.size * 3, 10);
      const end1 = polar(c.x, c.z, a, half);
      const end2 = polar(c.x, c.z, a + 32768, half);
      if (clearOfPockets(c.x, c.z, half)) {
        f.streams.push({
          x: c.x,
          z: c.z,
          dx: end1.x - end2.x,
          dz: end1.z - end2.z,
          half,
          width: metresToColumns(1) + (h(42) % 3),
          depth: 5 + (h(43) % 3),
        });
      }
    }
    const bogOdds = [500, 200, 0, 0, 0][band]!;
    if (h(4) % 1000 < bogOdds) {
      const c = at(50, 250);
      const r = metresToColumns(6 + (h(51) % 4));
      if (clearOfPockets(c.x, c.z, r)) f.bogs.push({ x: c.x, z: c.z, r });
    }
    if (cell.hotSpring) {
      const c = at(60, 200);
      f.spring = { x: c.x, z: c.z, level: this.smoothHeight(c.x, c.z) + 1 };
    }
    this.features.set(cell.id, f);
    return f;
  }

  /** The large-scale height of the land before barriers and detail, terrain units. */
  smoothHeight(x: number, z: number): number {
    const dist = length2d(x, z);
    const bandF = this.bandFrac(dist);
    const s = this.s;
    const drift = centred(valueNoise(s[0]!, x, z, 11), lerpBand([0, 40, 100, 150, 200], bandF));
    const low = centred(valueNoise(s[1]!, x, z, 9), lerpBand([10, 40, 80, 110, 140], bandF));
    const mid = centred(valueNoise(s[2]!, x, z, 6), lerpBand([4, 16, 30, 40, 50], bandF));
    return drift + low + mid;
  }

  /** The pocket and village props of Table 9, in global columns. */
  private pocketProps(pocket: Pocket): Array<{ x: number; z: number; kind: number; amount: number }> {
    const cached = this.pocketPropCache.get(pocket.player);
    if (cached) return cached;
    const out: Array<{ x: number; z: number; kind: number; amount: number }> = [];
    const h = (a: number, b: number): number => hash2(this.seed, 0x7070 + pocket.player * 977 + a, b);
    const spacing = (x: number, z: number, min: number): boolean => out.every((o) => length2d(o.x - x, o.z - z) >= min);
    const place = (n: number, kind: number, amounts: readonly number[], bearing: number, spread: number, d0: number, d1: number, min: number): void => {
      for (let i = 0; i < n; i++) {
        for (let attempt = 0; attempt < 24; attempt++) {
          const r = h(kind * 64 + i, attempt);
          const a = (pocket.outward + bearing + floorDiv(((r & 0xffff) - 32768) * spread, 32768)) & 0xffff;
          const d = metresToColumns(d0) + ((r >>> 16) % Math.max(1, metresToColumns(d1 - d0)));
          const c = polar(pocket.x, pocket.z, a, d);
          if (attempt < 23 && !spacing(c.x, c.z, min)) continue;
          out.push({ x: c.x, z: c.z, kind, amount: amounts[Math.min(i, amounts.length - 1)]! });
          break;
        }
      }
    };
    const softwood = [PropKind.Pine, PropKind.Spruce, PropKind.SmallSoftwood];
    // A stand of 24 softwood trees, 20 to 40 m from the Big House (480 lumber).
    for (let i = 0; i < 24; i++) place(1, softwood[h(900, i) % 3]!, [20], 0, 4500, 20, 40, 5);
    place(8, PropKind.Hazel, [10], 12000, 3500, 14, 26, 4);
    place(2, PropKind.CopperOutcrop, [60], -11000, 2500, 22, 34, 6);
    place(1, PropKind.TinOutcrop, [30], -11000, 2500, 22, 34, 6);
    place(2, PropKind.LooseStone, [40, 20], -18000, 2500, 18, 30, 5);
    place(1, PropKind.StoneOutcrop, [200], -18000, 2500, 18, 30, 6);
    place(2, PropKind.FlintScatter, [20], 32768, 6000, 12, 24, 4);
    place(2, PropKind.Herbs, [10], 32768, 6000, 12, 24, 4);
    place(2, PropKind.WildFlax, [10], 32768, 6000, 12, 24, 4);
    // Iron: a bog with 40 bog iron, or an iron rock of 60.
    const iron = this.pocketIron(pocket);
    if (pocket.bog) out.push({ x: iron.x, z: iron.z, kind: PropKind.BogIron, amount: 40 });
    else out.push({ x: iron.x, z: iron.z, kind: PropKind.IronRock, amount: 60 });
    this.pocketPropCache.set(pocket.player, out);
    return out;
  }

  /** Where a pocket's iron lies: 40 to 55 m out, behind and to one side. */
  pocketIron(pocket: Pocket): { x: number; z: number } {
    const r = hash2(this.seed, 0x69726f6e, pocket.player);
    return polar(pocket.x, pocket.z, (pocket.outward - 27000 + ((r & 0xfff) - 2048)) & 0xffff, metresToColumns(40 + ((r >>> 12) % 16)));
  }

  /**
   * Works out one column into `this.p`. `cands` are the cell sites near the
   * chunk; x and z are global column coordinates.
   */
  private profile(x: number, z: number, cands: readonly Site[]): Profile {
    const p = this.p;
    const s = this.s;
    const dist = length2d(x, z);
    const bandF = this.bandFrac(dist);
    p.bandF = bandF;
    // Cell membership and edges use warped coordinates so the edges wander.
    const amp = Math.max(40, Math.min(160, floorDiv(dist, 30)));
    const wx = x + centred(valueNoise(s[3]!, x, z, 7), amp) + centred(valueNoise(s[4]!, x, z, 5), amp >> 2);
    const wz = z + centred(valueNoise(s[5]!, x, z, 7), amp) + centred(valueNoise(s[6]!, x, z, 5), amp >> 2);
    let a: Site = cands[0]!;
    let b: Site = cands[0]!;
    let c: Site = cands[0]!;
    let da = Infinity;
    let db = Infinity;
    let dc = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const site = cands[i]!;
      const ex = site.x - wx;
      const ez = site.z - wz;
      const d = ex * ex + ez * ez;
      if (d < da || (d === da && site.id < a.id)) {
        c = b; dc = db;
        b = a; db = da;
        a = site; da = d;
      } else if (d < db || (d === db && site.id < b.id)) {
        c = b; dc = db;
        b = site; db = d;
      } else if (d < dc || (d === dc && site.id < c.id)) {
        c = site; dc = d;
      }
    }
    const cell = this.layout.cell(a.id);
    p.cell = cell;
    p.band = cell.band;

    // Base land: smooth hills, small detail, and the broken land of the deeper bands.
    const smooth = this.smoothHeight(x, z);
    const small = centred(valueNoise(s[7]!, x, z, 3), lerpBand([3, 4, 5, 6, 7], bandF));
    let ground = smooth + small;
    p.smooth = smooth;
    p.base = ground;
    p.flags = 0;
    p.stone = false;
    p.ridgeCore = false;
    p.slab0 = 0;
    p.slab1 = 0;
    p.cave0 = 0;
    p.cave1 = 0;
    p.seam = 0;
    let plateau = false;
    // Terraces: stepped hillsides in patches, more of them deeper (deep land is more broken).
    const terraceAmt = lerpBand([0, 150, 400, 700, 900], bandF);
    if (valueNoise(s[8]!, x, z, 7) < terraceAmt * 64) {
      const step = 6 + (bandF >> 10);
      ground = floorDiv(ground, step) * step;
    }
    // Mesas from the Deepwoods out; a few have soil on top (the rare, valuable plateau).
    const mesaAmt = lerpBand([0, 0, 6500, 12000, 16000], bandF);
    if (mesaAmt > 0 && valueNoise(s[9]!, x, z, 7) > 65536 - mesaAmt) {
      const top = floorDiv(smooth + metresToUnits(6) + (valueNoise(s[10]!, x, z, 9) >> 12) * 4, 4) * 4;
      if (top > ground) {
        ground = top;
        plateau = valueNoise(s[11]!, x, z, 9) > 48000;
        if (!plateau) p.stone = true;
      }
    }
    // Badlands: small ravines cut inside the cell.
    if (cell.look === Look.Badlands) {
      const r = valueNoise(s[12]!, x, z, 6) - 32768;
      if (r > -1800 && r < 1800) ground -= metresToUnits(3) + ((r + 1800) >> 9);
    }
    // Boulders on rocky ground.
    const boulderRate = cell.look === Look.RockyScrub ? 30 : cell.look === Look.Badlands || cell.look === Look.DeadLand ? 15 : cell.band >= Band.Fringe ? 4 : 1;
    const hb = hash2(s[13]!, x >> 2, z >> 2);
    if (hb % 1000 < boulderRate) {
      const ox = ((x >> 2) << 2) + 1 + ((hb >>> 10) & 1);
      const oz = ((z >> 2) << 2) + 1 + ((hb >>> 11) & 1);
      const rad = 1 + ((hb >>> 12) & 1);
      if (Math.abs(x - ox) < rad && Math.abs(z - oz) < rad) {
        ground += 4 + ((hb >>> 13) % 7);
        p.stone = true;
      }
    }

    // Barriers: the edges between the three nearest cells.
    p.raise = 0;
    p.carve = 0;
    p.river = false;
    p.marsh = false;
    p.marshWater = false;
    p.riverBottom = 32767;
    p.riverLevel = 0;
    // Rivers narrow and shallow out towards a corner where they meet no other river.
    const lab = this.pair(a.id < b.id ? a : b, a.id < b.id ? b : a);
    const lac = this.pair(a.id < c.id ? a : c, a.id < c.id ? c : a);
    const toAB = floorDiv(db - da, 2 * lab.len);
    const toAC = floorDiv(dc - da, 2 * lac.len);
    const bx = this.pairEffect(a, b, da, db, wx, wz, x, z, toAC, lac.edge?.type === EdgeType.River);
    const cx = this.pairEffect(a, c, da, dc, wx, wz, x, z, toAB, lab.edge?.type === EdgeType.River);
    // Only edges of the cell the column is in: the line between the other two runs on into this cell past their corner.
    if (bx || cx) p.flags |= F_BARRIER;
    ground = ground + p.raise - p.carve;
    let waterLevel = -32768;
    let source = 0;
    let surfaceHint = -1;
    if (p.river) {
      if (p.riverBottom < ground) ground = p.riverBottom;
      waterLevel = p.riverLevel;
      source = 1;
      surfaceHint = Mat.Sand;
    }
    if (p.marsh) {
      ground -= 2;
      surfaceHint = Mat.Mud;
      if (p.marshWater) {
        const lvl = p.base - 2;
        ground = Math.min(ground, lvl - 2 - (hash2(s[14]!, x, z) & 1));
        waterLevel = Math.max(waterLevel, lvl);
      }
    }

    // Features inside the cell.
    const feat = this.cellFeatures(cell);
    for (const pond of feat.ponds) {
      if (Math.abs(x - pond.x) > pond.r + 6 || Math.abs(z - pond.z) > pond.r + 6) continue;
      const d = length2d(x - pond.x, z - pond.z) + centred(valueNoise(s[15]!, x, z, 3), 3);
      if (d <= pond.r) {
        const prof = shoulder(floorDiv(d * 1024, pond.r), 400);
        ground = Math.min(ground, pond.level - 1 - ((pond.depth * prof) >> 10));
        waterLevel = Math.max(waterLevel, pond.level);
        surfaceHint = Mat.Mud;
      } else if (d <= pond.r + 3) ground = Math.max(ground, pond.level + 1);
    }
    for (const st of feat.streams) this.streamEffect(st, x, z, smooth, (g, lvl) => {
      ground = Math.min(ground, g);
      waterLevel = Math.max(waterLevel, lvl);
      source = 1;
      surfaceHint = Mat.Gravel;
    });
    for (const bog of feat.bogs) {
      if (this.bogEffect(bog, x, z, smooth)) {
        ground = Math.min(ground, p.base - 1);
        surfaceHint = Mat.Mud;
        p.flags |= F_MARSH;
        if (valueNoise(s[16]!, x, z, 2) > 40000) {
          ground = Math.min(ground, smooth - 3);
          waterLevel = Math.max(waterLevel, smooth - 1);
        }
      }
    }
    if (feat.spring && Math.abs(x - feat.spring.x) <= 8 && Math.abs(z - feat.spring.z) <= 8) {
      const d = length2d(x - feat.spring.x, z - feat.spring.z);
      if (d <= 5) {
        ground = feat.spring.level - 4 + (d >> 1);
        waterLevel = feat.spring.level;
        surfaceHint = Mat.Stone;
      } else if (d <= 8) {
        ground = Math.max(ground, feat.spring.level + 1);
        p.stone = true;
      }
    }

    // Pockets and village sites: flat, grassy and at sea level.
    const w = this.start.flatness(x, z);
    if (w > 0) {
      ground = (ground * (1024 - w)) >> 10;
      if (w > 512) {
        p.stone = false;
        p.slab0 = p.slab1 = 0;
        p.cave0 = p.cave1 = 0;
        if (waterLevel > -32768 && source === 1 && p.river) waterLevel = -32768;
        if (!p.river) {
          waterLevel = -32768;
          surfaceHint = -1;
        }
        p.flags |= F_FLAT;
      }
      if (w >= 1000) {
        ground = 0;
        waterLevel = -32768;
        surfaceHint = -1;
        p.marsh = false;
      }
    }
    for (const pocket of this.start.pockets) {
      const pw = pocket.water;
      if (Math.abs(x - pw.x) > pw.halfLength + pw.radius + 8 || Math.abs(z - pw.z) > pw.halfLength + pw.radius + 8) continue;
      if (pw.kind === 'pond') {
        const d = length2d(x - pw.x, z - pw.z);
        if (d <= pw.radius) {
          const prof = shoulder(floorDiv(d * 1024, pw.radius), 300);
          ground = -1 - ((9 * prof) >> 10);
          waterLevel = 0;
          surfaceHint = Mat.Mud;
        }
      } else {
        const st: Stream = {
          x: pw.x,
          z: pw.z,
          dx: polar(0, 0, pw.angle, pw.halfLength * 2).x,
          dz: polar(0, 0, pw.angle, pw.halfLength * 2).z,
          half: pw.halfLength,
          width: pw.radius,
          depth: 5,
        };
        this.streamEffect(st, x, z, 0, (g, lvl) => {
          ground = g;
          waterLevel = lvl;
          source = 1;
          surfaceHint = Mat.Gravel;
        });
      }
      if (pocket.bog) {
        const iron = this.pocketIron(pocket);
        if (this.bogEffect({ x: iron.x, z: iron.z, r: metresToColumns(7) }, x, z, 0)) {
          ground = Math.min(ground, -1);
          surfaceHint = Mat.Mud;
          p.flags |= F_MARSH;
          if (valueNoise(s[16]!, x, z, 2) > 42000 && length2d(x - iron.x, z - iron.z) > 4) {
            ground = -3;
            waterLevel = Math.max(waterLevel, -1);
          }
        }
      }
    }

    p.ground = ground;
    // Water.
    if (waterLevel > ground && waterLevel < 1000 && waterLevel > -1000) {
      p.water = waterLevel * WATER_PER_UNIT;
      p.source = source;
      p.flags |= F_WATER;
    } else {
      p.water = NO_WATER;
      p.source = 0;
    }
    if (p.marsh) p.flags |= F_MARSH;
    // Surface and soil.
    const volcanic = cell.volcanic;
    const grassNoise = valueNoise(s[17]!, x, z, 4);
    // Surfaces follow the cell's own band, so band borders run along cell edges rather than in circles.
    const sb = cell.band << 10;
    const grassiness = lerpBand([1000, 900, 700, 250, 0], sb) + (cell.look === Look.Meadow ? 80 : cell.look === Look.RockyScrub ? -250 : 0);
    let soil = lerpBand([22, 14, 9, 3, 1], sb) + centred(valueNoise(s[18]!, x, z, 5), 6);
    let surface: number;
    if (p.flags & F_WATER) {
      surface = surfaceHint >= 0 ? surfaceHint : Mat.Sand;
      soil = 2;
    } else if (surfaceHint === Mat.Mud || p.marsh) {
      surface = Mat.Mud;
      soil = Math.max(soil, 6);
    } else if (p.stone && !plateau) {
      surface = volcanic ? Mat.Basalt : Mat.Stone;
      soil = 0;
    } else if (p.flags & F_BANK) {
      surface = p.flags & F_CLAY ? Mat.Clay : Mat.Sand;
      soil = 4;
    } else if (surfaceHint === Mat.Stone) {
      surface = Mat.Stone;
      soil = 0;
    } else if (volcanic) {
      surface = grassNoise > 30000 ? Mat.Ash : Mat.DeadEarth;
      soil = Math.max(1, soil);
    } else if ((grassNoise >> 6) < grassiness) {
      // Thinning grass: lush near the start, patchy in the Deepwoods, dry in the Barrens.
      const thin = sb >= 3072 || (sb >= 2048 && (grassNoise >> 6) > grassiness - 250);
      surface = thin ? Mat.DryGrass : Mat.Grass;
    } else {
      surface = sb >= 4096 ? Mat.DeadEarth : Mat.Soil;
    }
    if (plateau && !(p.flags & F_WATER)) {
      surface = cell.band >= Band.Deadlands ? Mat.DeadEarth : cell.band >= Band.Barrens ? Mat.DryGrass : Mat.Grass;
      soil = Math.max(soil, 6);
    }
    if (p.flags & F_FLAT && !(p.flags & F_WATER) && surface !== Mat.Mud) {
      surface = Mat.Grass;
      soil = 22;
    }
    p.surface = surface;
    p.soil = Math.max(0, soil);
    if (p.stone) p.flags |= F_STONE;
    return p;
  }

  private streamEffect(st: Stream, x: number, z: number, smooth: number, apply: (ground: number, level: number) => void): void {
    // Distance from the segment, with a gentle meander.
    const len2 = st.dx * st.dx + st.dz * st.dz;
    if (len2 === 0) return;
    const rx = x - st.x;
    const rz = z - st.z;
    // Projection in 1/1024 of the half-length units along the segment (dx, dz spans the whole length).
    let tq = floorDiv((rx * st.dx + rz * st.dz) * 2048, len2);
    if (tq < -1024 || tq > 1024) return;
    tq = Math.max(-1024, Math.min(1024, tq));
    const along = floorDiv(tq * st.half, 1024);
    const lateral = floorDiv(rx * st.dz - rz * st.dx, Math.max(1, length2d(st.dx, st.dz)));
    const meander = centred(valueNoise(this.s[19]!, along + 4096, st.x, 5), 10);
    const d = Math.abs(lateral - meander);
    if (d > st.width) return;
    // Shallow at the two ends so the stretch begins and ends naturally.
    const endFade = shoulder(Math.abs(tq), 700);
    const level = smooth - 2;
    const depth = ((st.depth * endFade) >> 10) + 1;
    apply(level - depth + (d === st.width ? 2 : 0), level);
  }

  private bogEffect(bog: Bog, x: number, z: number, _smooth: number): boolean {
    if (Math.abs(x - bog.x) > bog.r + 6 || Math.abs(z - bog.z) > bog.r + 6) return false;
    const d = length2d(x - bog.x, z - bog.z) + centred(valueNoise(this.s[20]!, x, z, 3), 6);
    return d <= bog.r;
  }

  /**
   * Applies the barrier of the edge between sites u and v, if any, to the
   * profile. du and dv are squared distances from the warped point.
   */
  private pairEffect(u0: Site, v0: Site, du0: number, dv0: number, wx: number, wz: number, x: number, z: number, toCorner: number, cornerRiver: boolean): boolean {
    if (u0.id === v0.id) return false;
    const swap = u0.id > v0.id;
    const u = swap ? v0 : u0;
    const v = swap ? u0 : v0;
    const du = swap ? dv0 : du0;
    const dv = swap ? du0 : dv0;
    const info = this.pair(u, v);
    const e = info.edge;
    if (!e) return false;
    const diff = dv - du;
    const d = floorDiv(Math.abs(diff), 2 * info.len);
    const reach = e.type === EdgeType.Cliff ? e.fade : e.type === EdgeType.River ? e.half + floorDiv(e.half, 3) + 2 : e.half;
    if (d > reach) return false;
    const p = this.p;
    const side = diff >= 0 ? u.id : v.id;
    const t = floorDiv(info.ux * (2 * wz - info.mz2) - info.uz * (2 * wx - info.mx2), 2 * info.len);
    let g = 0;
    let arch = false;
    for (const gap of e.gaps) {
      const q = Math.abs(t - gap.t);
      const f = falloff(q, gap.half, 10);
      if (f > g) {
        g = f;
        arch = gap.arch && q <= gap.half;
      }
    }
    const s = this.s;
    const x1024 = floorDiv(d * 1024, Math.max(1, e.half));
    switch (e.type) {
      case EdgeType.LowHills: {
        const bb = 1024 - ((x1024 * x1024) >> 10);
        const bump = (bb * bb) >> 10;
        const lump = 640 + (valueNoise(s[21]!, x, z, 5) >> 8) + (valueNoise(s[22]!, x, z, 3) >> 9);
        p.raise = Math.max(p.raise, (((e.height * bump) >> 10) * lump) >> 10);
        return true;
      }
      case EdgeType.Ridge: {
        const prof = shoulder(x1024, 360);
        if (prof === 0) return false;
        const rugged = 820 + (valueNoise(s[23]!, x, z, 3) >> 8);
        let r = (((e.height * prof) >> 10) * rugged) >> 10;
        if (prof < 1024) r = floorDiv(r, 7) * 7;
        const full = r;
        r = (r * (1024 - g)) >> 10;
        const clear = metresToUnits(4);
        if (arch && g >= 900 && full >= clear + 14) {
          p.slab0 = p.base + clear;
          p.slab1 = p.base + full;
        }
        if (r > p.raise) p.raise = r;
        if (r > 12) p.stone = true;
        if (r > 30) p.ridgeCore = true;
        const cave = e.cave;
        if (cave && side === cave.side && r > cave.height + 10) {
          const foot = floorDiv(e.half * 3, 4);
          const cq = Math.abs(t - cave.t) + centred(valueNoise(s[24]!, x, z, 2), 3);
          if (cq <= cave.half && d <= foot + 2 && d >= foot - cave.depth) {
            p.cave0 = p.base;
            p.cave1 = p.base + cave.height - (d < foot - cave.depth + 3 ? 4 : 0);
            if (cave.saltpetre) p.flags |= F_SALTPETRE;
          }
        }
        return true;
      }
      case EdgeType.Cliff: {
        if (side !== e.upper) return true;
        const fx = floorDiv(d * 1024, Math.max(1, e.fade));
        const prof = shoulder(fx, 150);
        let r = (e.height * prof) >> 10;
        if (g > 0) {
          const ramp = Math.min(r, floorDiv(d * 3, 2));
          r = r + (((ramp - r) * g) >> 10);
        }
        if (r > p.raise) p.raise = r;
        if (d < 4 && g < 512) p.stone = true;
        return true;
      }
      case EdgeType.Ravine: {
        const prof = shoulder(x1024, 500);
        if (prof === 0) return false;
        let c = (e.height * prof) >> 10;
        c = floorDiv(c, 6) * 6;
        if (arch && g >= 900 && c >= 26) {
          p.slab0 = p.base - 12;
          p.slab1 = p.base;
        } else c = (c * (1024 - g)) >> 10;
        if (c > p.carve) p.carve = c;
        if (c > 8) p.stone = true;
        return true;
      }
      case EdgeType.River: {
        const level = p.smooth - 3;
        const taper = cornerRiver ? 1024 : Math.max(0, Math.min(1024, floorDiv(toCorner * 1024, e.half * 2)));
        const xr = taper === 1024 ? x1024 : floorDiv(x1024 * 1024, Math.max(1, taper));
        if (xr < 1024) {
          const depth = (((e.height * (1024 - ((g * 650) >> 10))) >> 10) * taper) >> 10;
          const prof = shoulder(xr, 450);
          const bottom = level - ((depth * prof) >> 10) - 1;
          p.river = true;
          p.riverLevel = level;
          if (bottom < p.riverBottom) p.riverBottom = bottom;
        } else {
          p.flags |= F_BANK;
          if (p.band === Band.Fringe && valueNoise(s[25]!, x, z, 4) > 36000) p.flags |= F_CLAY;
        }
        return true;
      }
      case EdgeType.Marsh: {
        const hx = x1024 + centred(valueNoise(s[26]!, x, z, 5), 300);
        if (hx >= 1024 || g >= 512) return false;
        p.marsh = true;
        if (valueNoise(s[27]!, x, z, 3) > 36000) p.marshWater = true;
        return true;
      }
      default:
        return false;
    }
  }

  /** Sites near a chunk, enough to answer the three-nearest question for every column in it. */
  private chunkCandidates(cx: number, cz: number): Site[] {
    const x0 = cx * N + (N >> 1);
    const z0 = cz * N + (N >> 1);
    const dist = length2d(x0, z0);
    const ring = this.layout.ringAt(dist);
    const size = this.layout.ringSize(Math.min(this.layout.ringCount - 1, ring + 1));
    return this.layout.sitesNear(x0, z0, 46 + 160 + floorDiv(size * 3, 2));
  }

  /** Generates a chunk's columns and props. */
  generateChunk(cx: number, cz: number): GeneratedChunk {
    const cands = this.chunkCandidates(cx, cz);
    const builder = new ChunkBuilder();
    const top = new Int16Array(N * N);
    const flags = new Uint8Array(N * N);
    const surface = new Uint8Array(N * N);
    const cellOf: Cell[] = [];
    const seamSeed = this.s[28]!;
    const oreSeed = this.s[29]!;
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const x = cx * N + lx;
        const z = cz * N + lz;
        const p = this.profile(x, z, cands);
        const i = lz * N + lx;
        builder.beginColumn(i);
        this.emit(builder, p, x, z, seamSeed, oreSeed);
        builder.water[i] = p.water;
        builder.source[i] = p.source;
        top[i] = p.ground;
        flags[i] = p.flags;
        surface[i] = p.surface;
        cellOf.push(p.cell!);
      }
    }
    const columns = builder.finish(cx, cz);
    const props = this.placeProps(cx, cz, top, flags, surface, cellOf);
    return { columns, props };
  }

  /** Writes a column's layers from its profile, bottom to top. */
  private emit(b: ChunkBuilder, p: Profile, x: number, z: number, seamSeed: number, oreSeed: number): void {
    const ground = p.ground;
    const bottom = Math.min(ground, 0) - 36;
    const volcanic = p.cell!.volcanic;
    const rock = volcanic ? Mat.Basalt : Mat.Stone;
    const soilTop = p.surface === Mat.Grass || p.surface === Mat.DryGrass ? 1 : 0;
    const soilMat =
      p.surface === Mat.Mud ? Mat.Mud : p.surface === Mat.Ash ? Mat.Ash : p.surface === Mat.DeadEarth ? Mat.DeadEarth : p.surface === Mat.Sand || p.surface === Mat.Gravel || p.surface === Mat.Clay ? p.surface : Mat.Soil;
    const soil = Math.min(p.soil, ground - bottom - 1);
    // Clay, sand or gravel lens under the soil in places.
    const ln = valueNoise(oreSeed + 1, x, z, 5);
    const lens = p.soil > 0 && ln > 40000 ? (ln - 40000) >> 12 : 0;
    const lensMat = [Mat.Clay, Mat.Sand, Mat.Gravel][hash2(oreSeed, x >> 5, z >> 5) % 3]!;
    const rockTop = ground - soil - lens;
    // Ore deeper down in places (found later by prospecting and mineshafts), vein iron inside ridges.
    const stack: number[] = [];
    const push = (y0: number, y1: number, m: number): void => {
      if (y1 <= y0) return;
      const n = stack.length;
      if (n > 0 && stack[n - 1] === m && stack[n - 2] === y0) stack[n - 2] = y1;
      else stack.push(y0, y1, m);
    };
    let seam0 = 0;
    let seam1 = 0;
    let seamMat: number = Mat.VeinIron;
    if (p.ridgeCore && p.band >= Band.Deepwoods) {
      const sn = valueNoise(seamSeed, x, z, 5);
      if (sn > 30000 && sn < 34000) {
        seam0 = p.base + floorDiv(p.raise, 3);
        seam1 = seam0 + 6;
        seamMat = Mat.VeinIron;
      } else if (sn > 60000 && p.band >= Band.Deepwoods) {
        seam0 = p.base + floorDiv(p.raise, 2);
        seam1 = seam0 + 5;
        seamMat = Mat.Marble;
      }
    } else {
      const on = valueNoise(oreSeed, x, z, 5);
      if (on > 58000) {
        const kinds = [
          [Mat.CopperOre, Mat.TinOre],
          [Mat.IronRock, Mat.Coal],
          [Mat.VeinIron, Mat.Coal],
          [Mat.VeinIron, Mat.Marble],
          [Mat.VeinIron, Mat.Coal],
        ][p.band]!;
        seamMat = kinds[hash2(oreSeed, x >> 6, z >> 6) & 1]!;
        seam1 = Math.min(rockTop - 6, bottom + 20);
        seam0 = seam1 - ((on - 58000) >> 10);
      }
    }
    if (seam1 > seam0 && seam0 > bottom && seam1 < rockTop) {
      push(bottom, seam0, rock);
      push(seam0, seam1, seamMat);
      push(seam1, rockTop, rock);
    } else push(bottom, rockTop, rock);
    push(rockTop, rockTop + lens, lensMat);
    push(ground - soil, ground - soilTop, soilMat);
    if (soilTop) push(ground - 1, ground, p.surface);
    if (p.surface === Mat.Stone || p.surface === Mat.Basalt) push(ground - 1, ground, p.surface);
    // Caves: an air pocket inside the stack.
    let out = stack;
    if (p.cave1 > p.cave0 && p.cave1 < ground - 4) {
      out = [];
      for (let k = 0; k < stack.length; k += 3) {
        const y0 = stack[k]!;
        const y1 = stack[k + 1]!;
        const m = stack[k + 2]!;
        if (y1 <= p.cave0 || y0 >= p.cave1) out.push(y0, y1, m);
        else {
          if (y0 < p.cave0) out.push(y0, p.cave0, m);
          if (y1 > p.cave1) out.push(p.cave1, y1, m);
        }
      }
    }
    for (let k = 0; k < out.length; k += 3) b.layer(out[k]!, out[k + 1]!, out[k + 2]!);
    if (p.slab1 > p.slab0 && p.slab0 > ground + 2) b.layer(p.slab0, p.slab1, rock);
  }

  /** Places trees and resource nodes on a generated chunk (Table 5 by band; Table 9 in the pockets). */
  private placeProps(cx: number, cz: number, top: Int16Array, flags: Uint8Array, surface: Uint8Array, cellOf: Cell[]): PropRecord[] {
    const props: PropRecord[] = [];
    const x0 = cx * N;
    const z0 = cz * N;
    const add = (kind: number, lx: number, lz: number, amount: number, age: number, variant: number): void => {
      props.push({ kind, lx, lz, y: top[lz * N + lx]!, variant, age, amount });
    };
    // Table 9: the pockets' guaranteed set.
    for (const pocket of this.start.pockets) {
      if (Math.abs(pocket.x - (x0 + 32)) > N + 160 || Math.abs(pocket.z - (z0 + 32)) > N + 160) continue;
      for (const pp of this.pocketProps(pocket)) {
        const lx = pp.x - x0;
        const lz = pp.z - z0;
        if (lx < 0 || lz < 0 || lx >= N || lz >= N) continue;
        const info = PROPS[pp.kind]!;
        add(pp.kind, lx, lz, pp.amount, info.regrowSteps + (hash2(this.seed, pp.x, pp.z) % 20000), hash2(this.seed ^ 0x5a5a, pp.x, pp.z));
      }
    }
    // Scatter on a 1.8 m grid: one candidate spot per 4 x 4 columns.
    const sd = this.s[30]!;
    const forest = this.s[31]!;
    for (let bz = 0; bz < N; bz += 4) {
      for (let bx = 0; bx < N; bx += 4) {
        const gx = x0 + bx;
        const gz = z0 + bz;
        const h = hash2(sd, gx, gz);
        const lx = bx + (h & 3);
        const lz = bz + ((h >>> 2) & 3);
        const i = lz * N + lx;
        const f = flags[i]!;
        if (f & F_FLAT) continue;
        const cell = cellOf[i]!;
        const y = top[i]!;
        // Level ground only: compare with the neighbours inside the chunk.
        let rough = 0;
        if (lx > 0) rough = Math.max(rough, Math.abs(top[i - 1]! - y));
        if (lx < N - 1) rough = Math.max(rough, Math.abs(top[i + 1]! - y));
        if (lz > 0) rough = Math.max(rough, Math.abs(top[i - N]! - y));
        if (lz < N - 1) rough = Math.max(rough, Math.abs(top[i + N]! - y));
        const roll = (h >>> 4) % 10000;
        const variant = hash2(sd ^ 0x7777, gx, gz);
        if (f & F_SALTPETRE) {
          if (roll < 900) add(PropKind.Saltpetre, lx, lz, 30, 0, variant);
          continue;
        }
        if (f & F_WATER) continue;
        if (f & F_BANK) {
          if (roll < 300) add(f & F_CLAY ? PropKind.ClayBank : PropKind.Sand, lx, lz, 100, 0, variant);
          continue;
        }
        if (rough > 2) continue;
        const band = cell.band;
        const look = cell.look;
        const stony = (f & F_STONE) !== 0;
        // Trees: dense in woodland, scattered in meadows, dead out in the Barrens and Deadlands.
        const forestN = valueNoise(forest, gx, gz, 6);
        let treeRate = [40, 2600, 120, 50, 300][look]!;
        if (look === Look.Meadow) treeRate = forestN > 52000 ? 1800 : 300;
        else if (look === Look.Woodland) treeRate = forestN > 22000 ? 3200 : 700;
        if (band === Band.Deepwoods) treeRate = floorDiv(treeRate, 2);
        if (stony || f & F_MARSH) treeRate = floorDiv(treeRate, 8);
        if (roll < treeRate) {
          const kind = this.treeKind(band, cell.look, variant);
          if (kind < 0) continue;
          if ((kind === PropKind.Oak || kind === PropKind.Beech) && ((bx + bz) & 4) !== 0) continue;
          const info = PROPS[kind]!;
          const g = variant % 100;
          const grow = info.regrowSteps;
          const age = grow === 0 ? 0 : g < 6 ? (variant >>> 8) % floorDiv(grow, 10) : g < 16 ? floorDiv(grow, 10) + ((variant >>> 8) % floorDiv(grow * 9, 10)) : grow + ((variant >>> 8) % grow);
          add(kind, lx, lz, info.yield, age, variant);
          continue;
        }
        // Other nodes, per spot, in 1/10000 (s).
        const r2 = roll - treeRate;
        if (r2 < 0) continue;
        const kind = this.nodeKind(band, look, f, r2, variant, surface[i]!);
        if (kind < 0) continue;
        const info = PROPS[kind]!;
        let amount = info.yield;
        if (kind === PropKind.SurfaceGold) amount = band >= Band.Deadlands ? 2 + (variant % 4) : 1 + (variant % 3);
        if (kind === PropKind.SurfaceGem && band >= Band.Deadlands) amount = 2 + (variant % 4);
        add(kind, lx, lz, amount, info.regrowSteps, variant);
      }
    }
    // Hot spring sulphur and bog iron at their features.
    const seen = new Set<number>();
    for (let k = 0; k < cellOf.length; k += 97) {
      const cell = cellOf[k]!;
      if (seen.has(cell.id)) continue;
      seen.add(cell.id);
      const feat = this.cellFeatures(cell);
      if (feat.spring) {
        const sx = feat.spring.x + 7 - x0;
        const sz = feat.spring.z - z0;
        if (sx >= 0 && sz >= 0 && sx < N && sz < N) add(PropKind.HotSpringSulphur, sx, sz, 20, 0, hash2(this.seed, sx, sz));
      }
      if (cell.band === Band.Heartland) {
        for (const bog of feat.bogs) {
          const bx = bog.x - x0;
          const bz = bog.z - z0;
          if (bx >= 0 && bz >= 0 && bx < N && bz < N) add(PropKind.BogIron, bx, bz, 40, 0, hash2(this.seed, bog.x, bog.z));
        }
      }
    }
    return props;
  }

  private treeKind(band: number, look: number, v: number): number {
    const r = (v >>> 4) % 100;
    switch (band) {
      case Band.Heartland:
        return r < 40 ? PropKind.Pine : r < 75 ? PropKind.Spruce : r < 92 ? PropKind.SmallSoftwood : PropKind.Hazel;
      case Band.Fringe:
        return r < 25 ? PropKind.Pine : r < 45 ? PropKind.Spruce : r < 55 ? PropKind.SmallSoftwood : r < 77 ? PropKind.Birch : PropKind.Hornbeam;
      case Band.Deepwoods:
        return r < 50 ? PropKind.Oak : PropKind.Beech;
      default:
        return look === Look.DeadLand && r < 50 ? PropKind.Thornwood : PropKind.DeadTree;
    }
  }

  /** Resource nodes by band (Table 5's band column); chances per candidate spot in 1/10000 (s). */
  private nodeKind(band: number, look: number, f: number, r: number, v: number, surface: number): number {
    const table: Array<[number, number]> = [];
    switch (band) {
      case Band.Heartland:
        table.push([PropKind.Hazel, 40], [PropKind.Herbs, 12], [PropKind.WildFlax, 8], [PropKind.LooseStone, 10], [PropKind.FlintScatter, 8], [PropKind.StoneOutcrop, 2], [PropKind.CopperOutcrop, 2], [PropKind.TinOutcrop, 1]);
        break;
      case Band.Fringe:
        table.push([PropKind.StoneOutcrop, 10], [PropKind.CoalSeam, 3], [PropKind.IronRock, 4], [PropKind.Herbs, 6], [PropKind.WildFlax, 5], [PropKind.MarbleRock, (v & 7) === 0 ? 1 : 0]);
        break;
      case Band.Deepwoods:
        table.push([PropKind.StoneOutcrop, 8], [PropKind.MarbleRock, 4], [PropKind.LeadOre, 2], [PropKind.Herbs, 1], [PropKind.WildFlax, 1]);
        break;
      case Band.Barrens:
        table.push([PropKind.StoneOutcrop, 8], [PropKind.MarbleRock, 4], [PropKind.LeadOre, 2], [PropKind.SurfaceGold, 2], [PropKind.SurfaceGem, 1]);
        break;
      default:
        table.push([PropKind.MarbleRock, 4], [PropKind.SurfaceGold, 2], [PropKind.SurfaceGem, 2], [PropKind.ManaCrystal, 2]);
        break;
    }
    if (band >= Band.Deadlands && (surface === Mat.Ash || surface === Mat.Basalt)) table.push([PropKind.Sulphur, 8]);
    if (look === Look.RockyScrub || f & F_STONE) for (const t of table) if (PROPS[t[0]]!.shape === 3) t[1] *= 2;
    let acc = 0;
    for (const [kind, chance] of table) {
      acc += chance;
      if (r < acc) return kind;
    }
    return -1;
  }

  /** Low-detail samples of a chunk for far terrain and the minimap. */
  lowRes(cx: number, cz: number, step: number): LowResChunk {
    const size = floorDiv(N, step);
    const cands = this.chunkCandidates(cx, cz);
    const topA = new Int16Array(size * size);
    const mat = new Uint8Array(size * size);
    const water = new Int16Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const p = this.profile(cx * N + i * step + (step >> 1), cz * N + j * step + (step >> 1), cands);
        const k = j * size + i;
        topA[k] = p.slab1 > p.slab0 && p.slab0 > p.ground ? p.slab1 : p.ground;
        mat[k] = p.surface;
        water[k] = p.water;
      }
    }
    return { step, size, top: topA, material: mat, water };
  }
}
