// The world's macro layout: rings of growing cells around the start basin,
// the barrier edge between every pair of neighbouring cells, its gaps, and the
// no natural fortress rule (The world: Cells, Cell sizes, Barriers, Gaps, No
// natural fortresses, Depth bands; Technology, World generation: growing cells).
//
// All lengths here are in columns (45 cm) and heights in terrain units
// (11.25 cm). Every value is a pure function of the seed and the player count,
// worked out on demand and cached, so any cell can be described alone.

import { atan2Angle, cos16, floorDiv, length2d, sin16, WORLD_EDGE_WU, WU_PER_COLUMN } from '../fixed.ts';
import { hash2 } from './noise.ts';

/** Metres to columns (1 column = 0.45 m), rounded down. */
export function metresToColumns(m: number): number {
  return floorDiv(m * 20, 9);
}
/** Metres to terrain units (1 unit = 0.1125 m), rounded down. */
export function metresToUnits(m: number): number {
  return floorDiv(m * 80, 9);
}

export const WORLD_EDGE_COLUMNS = floorDiv(WORLD_EDGE_WU, WU_PER_COLUMN);

export const Band = { Heartland: 0, Fringe: 1, Deepwoods: 2, Barrens: 3, Deadlands: 4 } as const;
export type Band = (typeof Band)[keyof typeof Band];
export const BAND_NAMES = ['Heartland', 'Fringe', 'Deepwoods', 'Barrens', 'Deadlands'] as const;

/** Cell looks (The world: "meadow, woodland, rocky scrub, badlands or dead land"). */
export const Look = { Meadow: 0, Woodland: 1, RockyScrub: 2, Badlands: 3, DeadLand: 4 } as const;
export type Look = (typeof Look)[keyof typeof Look];
export const LOOK_NAMES = ['meadow', 'woodland', 'rocky scrub', 'badlands', 'dead land'] as const;

/** The seven barrier edge types (The world, Barriers). */
export const EdgeType = { Nothing: 0, LowHills: 1, Ridge: 2, Cliff: 3, Ravine: 4, River: 5, Marsh: 6 } as const;
export type EdgeType = (typeof EdgeType)[keyof typeof EdgeType];
export const EDGE_NAMES = ['nothing', 'low hills', 'ridge', 'cliff line', 'ravine', 'river', 'marsh'] as const;

/** Edge types that block walking unless a gap crosses them. */
export function blocksWalking(t: EdgeType): boolean {
  return t === EdgeType.Ridge || t === EdgeType.Cliff || t === EdgeType.Ravine || t === EdgeType.River;
}

export interface Gap {
  /** Signed offset of the gap's centre along the edge from the midpoint of the two sites, in columns. */
  t: number;
  /** Half the gap's width in columns. */
  half: number;
  /** For ridges: the pass keeps a stone slab overhead (a natural arch). For ravines: a natural bridge. */
  arch: boolean;
}

export interface Edge {
  /** The two cell ids, a < b. */
  a: number;
  b: number;
  type: EdgeType;
  gaps: Gap[];
  /** True when the no natural fortress rule opened a gap this edge would not otherwise have. */
  forced: boolean;
  /** Half the barrier's width across the edge, in columns. */
  half: number;
  /** Height of a ridge or hills, depth of a ravine, water depth of a river, cliff height: terrain units. */
  height: number;
  /** Cliff lines: the cell on the high side. */
  upper: number;
  /** Cliff lines: how far the high ground slopes back down behind the cliff, in columns. */
  fade: number;
  /** Ridges: a cave at the foot of the ridge, or null. */
  cave: Cave | null;
  /** A hash for anything else that should vary per edge. */
  hash: number;
}

export interface Cave {
  /** The cell whose side the mouth opens on. */
  side: number;
  /** Offset of the cave along the edge, in columns. */
  t: number;
  /** Half width, how far it runs into the ridge, and its height: columns, columns, terrain units. */
  half: number;
  depth: number;
  height: number;
  /** About one cave in three holds saltpetre on its floor (Table 5). */
  saltpetre: boolean;
}

export interface Cell {
  id: number;
  ring: number;
  /** Site position in columns. */
  x: number;
  z: number;
  /** The ring's mean cell size across, in columns. */
  size: number;
  band: Band;
  look: Look;
  /** Deadlands cells with volcanic ground and sulphur. */
  volcanic: boolean;
  /** Barrens cells with a rare hot spring and a little sulphur (Table 5: about 1 in 10). */
  hotSpring: boolean;
  /** Neighbouring cell ids (sorted) and the edge shared with each. */
  neighbours: number[];
  edges: Edge[];
}

interface Ring {
  /** Centre radius and mean cell size, in columns. */
  radius: number;
  size: number;
  count: number;
  /** Rotation of the ring's first site, 16-bit angle. */
  offset: number;
}

interface Site {
  id: number;
  x: number;
  z: number;
}

const RING_SHIFT = 65536;

/** The start of each band, as ring indexes (ring 0 is the start basin). */
export interface BandRings {
  fringe: number;
  deepwoods: number;
  barrens: number;
  deadlands: number;
}

/** Barrier odds per band, per mille, in EdgeType order. (s): coordinator picks, see the PR. */
const EDGE_ODDS: readonly (readonly number[])[] = [
  // Basin interior: barriers less likely and nothing that blocks walking.
  [700, 250, 0, 0, 0, 0, 50],
  // Heartland outer edges and the Fringe: the normal odds.
  [300, 220, 140, 100, 60, 120, 60],
  [200, 180, 180, 140, 120, 120, 60],
  [140, 120, 220, 180, 180, 80, 80],
  [100, 100, 240, 220, 220, 60, 60],
];
/** Chance of 0, 1 or 2 gaps on a barrier edge, per mille, by band (deeper: fewer gaps). */
const GAP_ODDS: readonly (readonly number[])[] = [
  [0, 500, 500],
  [250, 500, 250],
  [350, 450, 200],
  [450, 400, 150],
  [550, 350, 100],
];
/** Cell look odds per band, per mille, in Look order. */
const LOOK_ODDS: readonly (readonly number[])[] = [
  [600, 400, 0, 0, 0],
  [350, 450, 200, 0, 0],
  [150, 700, 150, 0, 0],
  [0, 0, 350, 450, 200],
  [0, 0, 0, 300, 700],
];
/** Ridge caves per band, per mille (caves form at the foot of barrier edges and in the deeper bands). */
const CAVE_ODDS = [0, 250, 400, 600, 600];

function pick(table: readonly number[], roll: number): number {
  let acc = 0;
  for (let i = 0; i < table.length; i++) {
    acc += table[i]!;
    if (roll < acc) return i;
  }
  return table.length - 1;
}

function sq(v: number): number {
  return v * v;
}

/** Packs an ordered pair of cell ids into one number. */
function pairKey(a: number, b: number): number {
  return a < b ? a * 16777216 + b : b * 16777216 + a;
}

export class WorldLayout {
  readonly seed: number;
  readonly players: number;
  readonly basinCells: number;
  /** The basin cells' sites. */
  private readonly basin: Site[];
  /** Radius of the basin's outer boundary, columns. */
  readonly basinRadius: number;
  /** The mean size of a starting cell, columns. */
  readonly startSize: number;
  private readonly rings: Ring[] = [];
  readonly bands: BandRings;
  private readonly cells = new Map<number, Cell>();
  private readonly rawEdges = new Map<number, Edge>();
  private readonly neighbourCache = new Map<number, number[]>();

  constructor(seed: number, players: number) {
    this.seed = seed >>> 0;
    this.players = Math.max(1, Math.min(8, players | 0));
    // Table 9: 1 to 2 players 1 cell, 3 to 5 players 2 cells, 6 to 8 players 3 cells.
    this.basinCells = this.players <= 2 ? 1 : this.players <= 5 ? 2 : 3;
    const h = (n: number): number => hash2(this.seed, 0x6c61796f, n);
    const s0 = metresToColumns(150 + (h(1) % 51));
    this.startSize = s0;
    const rot = h(2) & 0xffff;
    this.basin = [];
    if (this.basinCells === 1) {
      this.basin.push({ id: 0, x: 0, z: 0 });
      this.basinRadius = floorDiv(s0, 2);
    } else {
      const r = this.basinCells === 2 ? floorDiv(s0, 2) : floorDiv(s0 * 577, 1000);
      for (let k = 0; k < this.basinCells; k++) {
        const a = rot + floorDiv(k * 65536, this.basinCells);
        this.basin.push({ id: k, x: floorDiv(r * cos16(a), 65536), z: floorDiv(r * sin16(a), 65536) });
      }
      this.basinRadius = r + floorDiv(s0, 2);
    }
    // Ring 0 stands for the basin in the ring table.
    this.rings.push({ radius: 0, size: s0, count: this.basinCells, offset: 0 });
    // Cell sizes: rings 1 and 2 are 150 to 200 m; each later ring 10 to 30% larger up to 2.5 times the start size,
    // then about that size (The world, Cell sizes).
    const cap = floorDiv(s0 * 5, 2);
    let deepwoods = -1;
    let barrens = -1;
    let radius = this.basinRadius;
    let prevSize = 0;
    for (let r = 1; ; r++) {
      let size: number;
      if (r <= 2) size = metresToColumns(150 + (h(10 + r) % 51));
      else if (barrens < 0) {
        size = floorDiv(prevSize * (110 + (h(10 + r) % 21)), 100);
        if (size >= cap) {
          size = cap;
          barrens = r;
        }
      } else size = floorDiv(cap * (95 + (h(10 + r) % 11)), 100);
      if (deepwoods < 0 && size * 2 > s0 * 3) deepwoods = r;
      radius += r === 1 ? floorDiv(size, 2) : floorDiv(prevSize + size, 2);
      // 2 pi r / size cells round the ring.
      const count = Math.max(6, floorDiv(radius * 62832 + size * 5000, size * 10000));
      this.rings.push({ radius, size, count, offset: h(1000 + r) & 0xffff });
      prevSize = size;
      if (radius > WORLD_EDGE_COLUMNS + 2 * size) break;
    }
    this.bands = { fringe: 1, deepwoods, barrens, deadlands: barrens + 3 };
  }

  get ringCount(): number {
    return this.rings.length;
  }

  ringRadius(r: number): number {
    return this.rings[r]!.radius;
  }

  ringSize(r: number): number {
    return this.rings[r]!.size;
  }

  ringCellCount(r: number): number {
    return this.rings[r]!.count;
  }

  bandOfRing(r: number): Band {
    if (r === 0) return Band.Heartland;
    if (r < this.bands.deepwoods) return Band.Fringe;
    if (r < this.bands.barrens) return Band.Deepwoods;
    if (r < this.bands.deadlands) return Band.Barrens;
    return Band.Deadlands;
  }

  /** The ring whose band of radii holds a distance from the origin, in columns. */
  ringAt(dist: number): number {
    if (dist <= this.basinRadius) return 0;
    let lo = 1;
    let hi = this.rings.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const ring = this.rings[mid]!;
      if (dist < ring.radius + floorDiv(ring.size, 2)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Position of a cell's site in columns. */
  site(id: number): Site {
    const r = floorDiv(id, RING_SHIFT);
    const k = id - r * RING_SHIFT;
    if (r === 0) return this.basin[k]!;
    const ring = this.rings[r]!;
    const hj = hash2(this.seed, 0x73697465, id);
    const jitter = ((hj & 0x3ff) * 614 >> 10) - 307; // -0.3 to +0.3 of the spacing, in 1/1024
    const angle = ring.offset + floorDiv((k * 1024 + 512 + jitter) * 65536, ring.count * 1024);
    const radial = ((((hj >>> 10) & 0xffff) - 32768) * floorDiv(ring.size * 2, 5)) >> 16;
    const rad = ring.radius + radial;
    return { id, x: floorDiv(rad * cos16(angle), 65536), z: floorDiv(rad * sin16(angle), 65536) };
  }

  /** Every site within `radius` columns of (x, z), plus some a little farther; unsorted. */
  sitesNear(x: number, z: number, radius: number): Site[] {
    const out: Site[] = [];
    const dist = length2d(x, z);
    if (dist - radius <= this.basinRadius + this.startSize) for (const s of this.basin) out.push(s);
    const angle = atan2Angle(z, x);
    const first = this.ringAt(Math.max(0, dist - radius));
    const last = Math.min(this.rings.length - 1, this.ringAt(dist + radius) + 1);
    for (let r = Math.max(1, first - 1); r <= last; r++) {
      const ring = this.rings[r]!;
      const n = ring.count;
      // The angular window: radius over the ring's radius, in cells, plus slack for jitter.
      const dk = floorDiv(radius * n, Math.max(1, ring.radius) * 6) + 3;
      if (dk * 2 + 1 >= n) {
        for (let k = 0; k < n; k++) out.push(this.site(r * RING_SHIFT + k));
        continue;
      }
      const kc = floorDiv((((angle - ring.offset) & 0xffff) * n), 65536);
      for (let d = -dk; d <= dk; d++) {
        const k = (((kc + d) % n) + n) % n;
        out.push(this.site(r * RING_SHIFT + k));
      }
    }
    return out;
  }

  /** The nearest cell site to (x, z) in columns. */
  nearest(x: number, z: number): number {
    let best = -1;
    let bestD = Infinity;
    for (const s of this.sitesNear(x, z, 4)) {
      const d = sq(s.x - x) + sq(s.z - z);
      if (d < bestD || (d === bestD && s.id < best)) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  /** Neighbouring cells: the Gabriel graph of the sites, which every Voronoi edge with a real length is in. */
  neighboursOf(id: number): number[] {
    const cached = this.neighbourCache.get(id);
    if (cached) return cached;
    const a = this.site(id);
    const ring = floorDiv(id, RING_SHIFT);
    const reach = 3 * Math.max(this.rings[ring]!.size, this.rings[Math.min(ring + 1, this.rings.length - 1)]!.size);
    const near = this.sitesNear(a.x, a.z, reach).filter((s) => s.id !== id);
    const out: number[] = [];
    for (const b of near) {
      // Midpoint doubled to stay in integers.
      const mx = a.x + b.x;
      const mz = a.z + b.z;
      const r2 = sq(2 * a.x - mx) + sq(2 * a.z - mz);
      let gabriel = true;
      for (const c of near) {
        if (c.id === b.id) continue;
        if (sq(2 * c.x - mx) + sq(2 * c.z - mz) < r2) {
          gabriel = false;
          break;
        }
      }
      if (gabriel) out.push(b.id);
    }
    out.sort((p, q) => p - q);
    this.neighbourCache.set(id, out);
    return out;
  }

  /** The edge between two cells before the no natural fortress rule. */
  private rawEdge(a: number, b: number): Edge {
    const key = pairKey(a, b);
    const cached = this.rawEdges.get(key);
    if (cached) return cached;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const ra = floorDiv(lo, RING_SHIFT);
    const rb = floorDiv(hi, RING_SHIFT);
    const band = Math.max(this.bandOfRing(ra), this.bandOfRing(rb));
    const interior = ra === 0 && rb === 0;
    const h = hash2(this.seed, lo, hi);
    const h2 = hash2(h, 0x65646765, 1);
    const h3 = hash2(h, 0x65646765, 2);
    const type = pick(EDGE_ODDS[interior ? 0 : band]!, h % 1000) as EdgeType;
    let nGaps = 0;
    if (blocksWalking(type) || type === EdgeType.Marsh) nGaps = pick(GAP_ODDS[interior ? 0 : band]!, (h >>> 10) % 1000);
    const r = (n: number, lo2: number, hi2: number): number => lo2 + (hash2(h3, n, 0) % (hi2 - lo2 + 1));
    let half = 0;
    let height = 0;
    let fade = 0;
    switch (type) {
      case EdgeType.LowHills:
        half = metresToColumns(r(1, 25, 40));
        height = floorDiv(metresToUnits(r(2, 15, 35)), 10); // 1.5 to 3.5 m: r() gives tenths
        break;
      case EdgeType.Ridge:
        half = metresToColumns(r(1, 12, 22) + band * 2);
        height = metresToUnits(r(2, 9, 16) + band * 2);
        break;
      case EdgeType.Cliff:
        height = metresToUnits(r(2, 5, 10) + band);
        fade = metresToColumns(r(3, 50, 80));
        break;
      case EdgeType.Ravine:
        half = metresToColumns(r(1, 6, 10));
        height = metresToUnits(r(2, 6, 12));
        break;
      case EdgeType.River:
        half = metresToColumns(r(1, 6, 10));
        height = floorDiv(metresToUnits(r(2, 16, 24)), 10); // water 1.6 to 2.4 m deep
        break;
      case EdgeType.Marsh:
        half = metresToColumns(r(1, 15, 25));
        height = 3;
        break;
      default:
        break;
    }
    const gaps: Gap[] = [];
    for (let g = 0; g < nGaps; g++) {
      const hg = hash2(h2, 0x676170, g);
      const ab = this.siteDistance(lo, hi);
      // First gap near the midpoint (always on the edge for a Gabriel pair), a second one off to the side.
      const t = g === 0 ? floorDiv(((hg & 0xff) - 128) * ab, 2560) : (g === 1 ? 1 : -1) * floorDiv(ab * (50 + ((hg >>> 8) % 30)), 300);
      const halfGap = metresToColumns(type === EdgeType.River ? 5 + ((hg >>> 16) % 4) : 6 + ((hg >>> 16) % 5));
      const arch =
        (type === EdgeType.Ridge && height >= metresToUnits(10) && ((hg >>> 20) & 3) === 0) ||
        (type === EdgeType.Ravine && ((hg >>> 22) & 1) === 0);
      gaps.push({ t: g === 0 ? t : g === 1 ? Math.abs(t) : -Math.abs(t), half: halfGap, arch });
    }
    let cave: Cave | null = null;
    if (type === EdgeType.Ridge && (h2 >>> 4) % 1000 < CAVE_ODDS[band]!) {
      const ab = this.siteDistance(lo, hi);
      cave = {
        side: (h2 & 1) === 0 ? lo : hi,
        t: floorDiv((((h2 >>> 12) & 0xff) - 128) * ab, 1024),
        half: metresToColumns(2 + ((h2 >>> 20) % 3)),
        depth: metresToColumns(8 + ((h2 >>> 22) % 8)),
        height: metresToUnits(3) + ((h2 >>> 26) % 8),
        saltpetre: band >= Band.Fringe && (h2 >>> 28) % 3 === 0,
      };
    }
    const edge: Edge = {
      a: lo,
      b: hi,
      type,
      gaps,
      forced: false,
      half,
      height,
      upper: (h2 & 2) === 0 ? lo : hi,
      fade,
      cave,
      hash: h,
    };
    this.rawEdges.set(key, edge);
    return edge;
  }

  /** Distance between two sites in columns. */
  siteDistance(a: number, b: number): number {
    const sa = this.site(a);
    const sb = this.site(b);
    return length2d(sb.x - sa.x, sb.z - sa.z);
  }

  private passable(e: Edge): boolean {
    return !blocksWalking(e.type) || e.gaps.length > 0;
  }

  /**
   * The raw edges a cell would open to satisfy the no natural fortress rule:
   * if fewer than two of its edges are open or gapped, the blocked edges with
   * the lowest hashes, as many as are missing.
   */
  private forcedBy(id: number): number[] {
    const neighbours = this.neighboursOf(id);
    const blocked: Edge[] = [];
    let open = 0;
    for (const n of neighbours) {
      const e = this.rawEdge(id, n);
      if (this.passable(e)) open++;
      else blocked.push(e);
    }
    if (open >= 2) return [];
    blocked.sort((p, q) => p.hash - q.hash || p.a - q.a || p.b - q.b);
    return blocked.slice(0, 2 - open).map((e) => pairKey(e.a, e.b));
  }

  /** The final edge between two neighbouring cells, after the no natural fortress rule. */
  edge(a: number, b: number): Edge {
    const raw = this.rawEdge(a, b);
    if (this.passable(raw)) return raw;
    const key = pairKey(a, b);
    if (!this.forcedBy(a).includes(key) && !this.forcedBy(b).includes(key)) return raw;
    const t = 0;
    const half = metresToColumns(raw.type === EdgeType.River ? 6 : 7);
    return { ...raw, forced: true, gaps: [{ t, half, arch: false }] };
  }

  /** The full description of a cell. */
  cell(id: number): Cell {
    const cached = this.cells.get(id);
    if (cached) return cached;
    const s = this.site(id);
    const ring = floorDiv(id, RING_SHIFT);
    const band = this.bandOfRing(ring);
    const h = hash2(this.seed, 0x63656c6c, id);
    const look = pick(LOOK_ODDS[band]!, h % 1000) as Look;
    const neighbours = this.neighboursOf(id);
    const cell: Cell = {
      id,
      ring,
      x: s.x,
      z: s.z,
      size: this.rings[ring]!.size,
      band,
      look,
      volcanic: band === Band.Deadlands && (h >>> 10) % 2 === 0,
      hotSpring: band === Band.Barrens && (h >>> 12) % 10 === 0,
      neighbours,
      edges: neighbours.map((n) => this.edge(id, n)),
    };
    this.cells.set(id, cell);
    return cell;
  }

  /** Whether a and b are neighbours. */
  adjacent(a: number, b: number): boolean {
    return this.neighboursOf(a).includes(b);
  }

  /** The basin's cell ids. */
  basinIds(): number[] {
    return this.basin.map((s) => s.id);
  }

  /** Ring and index of a cell id. */
  static ringOf(id: number): number {
    return floorDiv(id, RING_SHIFT);
  }
}

export const CELL_RING_SHIFT = RING_SHIFT;
