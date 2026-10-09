// Where the stone circles stand and what each one is made of (SC-2, SC-3,
// SC-5, SC-6, SCA-7, SCS-1, SCB-1). Everything here is a pure function of the
// world's seed and layout, so the simulation, every other machine and the
// mesh workers all build the same circles without storing them.

import { cos16, floorDiv, headingTowards, length2d, sin16, WU_PER_COLUMN } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { Band, CELL_RING_SHIFT, type WorldLayout } from '../world/layout.ts';
import { CHUNK_SHIFT, chunkKey } from '../world/chunk.ts';
import { PropKind, PROPS, PropShape } from '../world/props.ts';
import { Res } from '../economy/resources.ts';
import {
  BONE_PILE_BONE,
  CHEST_LOOT,
  CHEST_RING_M,
  CHEST_SLOTS,
  CHESTS_BY_TIER,
  CIRCLE_BANDS,
  CIRCLE_SPACING_M,
  CIRCLES_PER_BAND_MAX,
  CircleProp,
  CircleType,
  CLEARING_M,
  CLEARING_SOFTWOOD_MAX,
  CLEARING_TREES_MAX_M,
  CLEARING_TREES_MIN_M,
  DRESSING,
  HAWTHORNE_FRUIT,
  circleMetres as m,
  PIECE_ROOM_DM,
  RINGS,
  ROSES_PER_BUSH,
  RUBBLE_BLUESTONE,
  RUBBLE_BY_TIER,
  RUIN_CLEAR_M,
  STANDING_MAX_PCT,
  STANDING_MIN_PCT,
  TIER_ODDS_PM,
  Trilithon,
  trilithonRow,
  TYPE_ODDS_PM,
} from './data.ts';

const COL = WU_PER_COLUMN;
const SALT = { place: 0x63697263, kind: 0x6b696e64, piece: 0x70696563, chest: 0x63686573 } as const;
/** Tries at a circle's place before the band goes without it. */
const PLACE_TRIES = 24;
/** Tries at a piece's spot before it is left out. */
const PIECE_TRIES = 8;

/** One stone circle. */
export interface CircleSite {
  /** Its number, from 0, in the order the circles were placed. */
  id: number;
  /** Its middle, wu (a column's centre). */
  x: number;
  z: number;
  band: Band;
  /** Tier I, II or III: one, two or three rings (SC-3). */
  tier: number;
  type: CircleType;
  /** The whole circle's turn, a 16-bit angle. */
  heading: number;
}

/** One thing a circle is made of: a trilithon, a chest, a plant. */
export interface CirclePiece {
  circle: number;
  prop: CircleProp;
  /** The column it stands on (global). */
  gx: number;
  gz: number;
  /** The way it faces (a 16-bit heading, 0 facing -Z): trilithons face the middle, so the way through them runs to it. */
  heading: number;
  /**
   * Which look: a trilithon's state (Trilithon); the altar's circle type;
   * 1 for a large rubble or bone pile, 0 small; which of the three flowers
   * or two mosses; a chest's number in its circle.
   */
  look: number;
  /** What it holds: bluestone, fruit, roses or bone; a chest's filled slots (a bit each); the altar's idol (a Res) or -1. */
  amount: number;
}

/** The idol on a circle type's altar (SCA-4, SCS-1: none at the Silenus Circle, SCB-1), or -1. */
export function idolOf(type: CircleType): number {
  if (type === CircleType.Lunar) return Res.MoonIdol;
  if (type === CircleType.Boneyard) return Res.HeadlessIdol;
  return -1;
}

function pick(table: readonly number[], roll: number): number {
  let acc = 0;
  for (let i = 0; i < table.length; i++) {
    acc += table[i]!;
    if (roll < acc) return i;
  }
  return table.length - 1;
}

/** Places the circles of one layout: 0 to 4 in each of the Fringe, the Deepwoods and the Barrens (SC-2; Jade 2026-10-08). */
function placeCircles(layout: WorldLayout): CircleSite[] {
  const seed = layout.seed;
  const out: CircleSite[] = [];
  for (const band of CIRCLE_BANDS) {
    const rings: number[] = [];
    for (let r = 1; r < layout.ringCount; r++) if (layout.bandOfRing(r) === band) rings.push(r);
    if (rings.length === 0) continue;
    const n = hash32(seed ^ SALT.place, band) % (CIRCLES_PER_BAND_MAX + 1);
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < PLACE_TRIES; t++) {
        const h = hash32(seed ^ SALT.place, band, k, t);
        const ring = rings[h % rings.length]!;
        const cell = layout.cell(ring * CELL_RING_SHIFT + (hash32(h, 1) % layout.ringCellCount(ring)));
        // Near the cell's middle, away from its edges and their barriers (s: an eighth of its size either way).
        const spread = Math.max(1, floorDiv(cell.size, 8));
        const cx = cell.x + (hash32(h, 2) % (spread * 2 + 1)) - spread;
        const cz = cell.z + (hash32(h, 3) % (spread * 2 + 1)) - spread;
        if (layout.bandAt(cx, cz) !== band) continue;
        const x = cx * COL + (COL >> 1);
        const z = cz * COL + (COL >> 1);
        if (out.some((c) => length2d(c.x - x, c.z - z) < m(CIRCLE_SPACING_M))) continue;
        const tier = 1 + pick(TIER_ODDS_PM, hash32(h, 4) % 1000);
        const type = tier === 1 ? CircleType.Generic : ((1 + pick(TYPE_ODDS_PM, hash32(seed ^ SALT.kind, out.length) % 1000)) as CircleType);
        out.push({ id: out.length, x, z, band, tier, type, heading: hash32(h, 5) & 0xffff });
        break;
      }
    }
  }
  return out;
}

/** What a chest at a column holds (SC-6): every line rolls on its own; it keeps at most five, the rarest first. Never empty (s: a bare chest gets the first line). */
export function chestLoot(seed: number, gx: number, gz: number): Array<[number, number]> {
  const lines = CHEST_LOOT.map((l, k) => ({ l, k })).sort((a, b) => a.l.pct - b.l.pct || a.k - b.k);
  const out: Array<[number, number]> = [];
  for (const { l, k } of lines) {
    if (out.length >= CHEST_SLOTS) break;
    if (hash32(seed ^ SALT.chest, gx, gz, k) % 100 < l.pct) out.push([l.res, l.count]);
  }
  if (out.length === 0) out.push([CHEST_LOOT[0]!.res, CHEST_LOOT[0]!.count]);
  return out;
}

/** Builds one circle's pieces. */
function buildPieces(seed: number, s: CircleSite): CirclePiece[] {
  const out: CirclePiece[] = [];
  const room: Array<[number, number, number]> = [];
  const cols = new Set<number>();
  const roll = (n: number, ...k: number[]): number => hash32(seed ^ SALT.piece, s.id, ...k) % n;
  const roomOf = (prop: CircleProp): number => floorDiv(PIECE_ROOM_DM[prop]! * m(1), 10);
  /** Puts a piece down if it has room; returns whether it did. */
  const put = (prop: CircleProp, x: number, z: number, heading: number, look: number, amount: number, force = false): boolean => {
    const gx = floorDiv(x, COL);
    const gz = floorDiv(z, COL);
    const key = gx * 65536 + gz;
    const r = roomOf(prop);
    if (cols.has(key)) return false;
    if (!force && room.some(([ux, uz, ur]) => length2d(ux - x, uz - z) < ur + r)) return false;
    cols.add(key);
    room.push([x, z, r]);
    out.push({ circle: s.id, prop, gx, gz, heading: heading & 0xffff, look, amount });
    return true;
  };
  const at = (radius: number, angle: number): [number, number] => [s.x + floorDiv(radius * sin16(angle), 65536), s.z + floorDiv(radius * cos16(angle), 65536)];
  const facing = (x: number, z: number): number => headingTowards(s.x - x, s.z - z);

  // The altar in the very middle (SCA-1, SCS-1, SCB-1): Tier II and III circles only; Tier I ruins are generic.
  if (s.type !== CircleType.Generic) put(CircleProp.Altar, s.x, s.z, s.heading, s.type, idolOf(s.type), true);

  // The rings of trilithons (SC-3): 40 to 70% of each ring intact or worn, the rest destroyed, poor or crumbled.
  for (let k = 0; k < s.tier; k++) {
    const row = RINGS[k]!;
    const n = row.trilithons;
    const pct = STANDING_MIN_PCT + roll(STANDING_MAX_PCT - STANDING_MIN_PCT + 1, 1, k);
    const standing = Math.max(1, floorDiv(n * pct + 50, 100));
    const order = Array.from({ length: n }, (_, j) => j);
    for (let j = n - 1; j > 0; j--) {
      const o = roll(j + 1, 2, k, j);
      [order[j], order[o]] = [order[o]!, order[j]!];
    }
    const stands = new Set(order.slice(0, standing));
    // Each ring turned half a gap from the one inside it, so the ways through do not line up (s).
    const offset = k % 2 === 1 ? floorDiv(32768, n) : 0;
    for (let j = 0; j < n; j++) {
      const [x, z] = at(m(row.radiusM), s.heading + offset + floorDiv(j * 65536, n));
      const fallen = [Trilithon.Destroyed, Trilithon.Poor, Trilithon.Crumbled] as const;
      const state = stands.has(j) ? (roll(2, 3, k, j) === 0 ? Trilithon.Intact : Trilithon.Worn) : fallen[roll(3, 3, k, j)]!;
      put(CircleProp.Trilithon, x, z, facing(x, z), state, trilithonRow(state).bluestone, true);
    }
  }

  // The bluestone chests (SC-3, SC-6), just inside the first ring.
  const chests = CHESTS_BY_TIER[s.tier - 1]!;
  for (let j = 0; j < chests; j++) {
    const [x, z] = at(m(CHEST_RING_M), s.heading + 32768 + floorDiv(j * 65536, chests) + floorDiv(65536, chests * 2));
    const loot = chestLoot(seed, floorDiv(x, COL), floorDiv(z, COL));
    put(CircleProp.Chest, x, z, facing(x, z), j, (1 << loot.length) - 1, true);
  }

  const outer = m(RINGS[s.tier - 1]!.radiusM);
  /** A spot between minR and maxR from the middle that has room. */
  const scatter = (prop: CircleProp, minR: number, maxR: number, look: number, amount: number, ...k: number[]): boolean => {
    for (let t = 0; t < PIECE_TRIES; t++) {
      const r = minR + roll(Math.max(1, maxR - minR), 4, ...k, t);
      const [x, z] = at(r, roll(65536, 5, ...k, t));
      if (put(prop, x, z, roll(65536, 6, ...k, t), look, amount)) return true;
    }
    return false;
  };

  // Bluestone rubble (SC-5) dotting the ground in and round the rings: one large pile to two small.
  for (let j = 0; j < RUBBLE_BY_TIER[s.tier - 1]!; j++) {
    const large = j % 3 === 0;
    scatter(CircleProp.Rubble, m(3), outer + m(6), large ? 1 : 0, large ? RUBBLE_BLUESTONE.large : RUBBLE_BLUESTONE.small, 7, j);
  }

  // The overgrowth, and each type's own plants and bones (SC-2, SCA-7, SCS-1, SCB-1).
  const rows = DRESSING[s.type]!;
  rows.forEach((row, r) => {
    const count = row.byTier[s.tier - 1] ?? 0;
    for (let j = 0; j < count; j++) {
      let look = 0;
      let amount = 0;
      if (row.prop === CircleProp.Flower) look = roll(3, 8, r, j);
      else if (row.prop === CircleProp.Moss) look = roll(2, 8, r, j);
      else if (row.prop === CircleProp.BonePile) {
        look = j % 3 === 0 ? 1 : 0;
        amount = look ? BONE_PILE_BONE.large : BONE_PILE_BONE.small;
      } else if (row.prop === CircleProp.Hawthorne) amount = HAWTHORNE_FRUIT;
      else if (row.prop === CircleProp.MoonRose) amount = ROSES_PER_BUSH;
      scatter(row.prop, m(row.minM), m(row.maxM), look, amount, 9, r, j);
    }
  });

  // The forest gives way round it: 0 to 5 softwood trees within the 60 m (SC-2).
  const pines = roll(CLEARING_SOFTWOOD_MAX + 1, 10);
  for (let j = 0; j < pines; j++) scatter(CircleProp.Softwood, m(CLEARING_TREES_MIN_M), m(CLEARING_TREES_MAX_M), 0, 0, 11, j);
  return out;
}

interface Built {
  /** The layout's bands when these were placed: placing again if they change (the bands follow the main bases). */
  bands: unknown;
  sites: CircleSite[];
  pieces: Map<number, CirclePiece[]>;
  byChunk: Map<number, CirclePiece[]> | null;
}
const built = new WeakMap<WorldLayout, Built>();

function builtFor(layout: WorldLayout): Built {
  let b = built.get(layout);
  if (!b || b.bands !== layout.bands) {
    b = { bands: layout.bands, sites: placeCircles(layout), pieces: new Map(), byChunk: null };
    built.set(layout, b);
  }
  return b;
}

/** Every stone circle in the world. */
export function circleSites(layout: WorldLayout): readonly CircleSite[] {
  return builtFor(layout).sites;
}

/** One circle by its number. */
export function circleSite(layout: WorldLayout, id: number): CircleSite | undefined {
  return builtFor(layout).sites[id];
}

/** A circle's pieces. */
export function circlePieces(layout: WorldLayout, id: number): readonly CirclePiece[] {
  const b = builtFor(layout);
  let p = b.pieces.get(id);
  if (!p) {
    const s = b.sites[id];
    p = s ? buildPieces(layout.seed, s) : [];
    b.pieces.set(id, p);
  }
  return p;
}

/** The circle pieces standing in a chunk, in a fixed order. */
export function piecesInChunk(layout: WorldLayout, cx: number, cz: number): readonly CirclePiece[] {
  const b = builtFor(layout);
  if (!b.byChunk) {
    const map = new Map<number, CirclePiece[]>();
    for (const s of b.sites) {
      for (const p of circlePieces(layout, s.id)) {
        const key = chunkKey(p.gx >> CHUNK_SHIFT, p.gz >> CHUNK_SHIFT);
        const list = map.get(key) ?? [];
        list.push(p);
        map.set(key, list);
      }
    }
    b.byChunk = map;
  }
  return b.byChunk.get(chunkKey(cx, cz)) ?? [];
}

/** The circle whose middle is within `metres` of a point (wu), or undefined. */
export function circleNear(layout: WorldLayout, x: number, z: number, metres: number): CircleSite | undefined {
  for (const s of builtFor(layout).sites) if (length2d(s.x - x, s.z - z) < m(metres)) return s;
  return undefined;
}

/**
 * Whether world generation may put one of its own props at a column (SC-2):
 * no trees within the 60 m clearing (the circle brings its 0 to 5 softwood
 * trees itself), and nothing else of its own inside the ruin.
 */
export function clearForGenerated(layout: WorldLayout, gx: number, gz: number, tree: boolean): boolean {
  const x = gx * COL + (COL >> 1);
  const z = gz * COL + (COL >> 1);
  return !circleNear(layout, x, z, tree ? CLEARING_M : RUIN_CLEAR_M);
}

/** The circles whose clearing reaches into a chunk (for the generator: most chunks have none, and skip every check). */
export function circlesNearChunk(layout: WorldLayout, cx: number, cz: number): readonly CircleSite[] {
  const r = floorDiv(m(CLEARING_M), COL) + 1;
  const x0 = cx << CHUNK_SHIFT;
  const z0 = cz << CHUNK_SHIFT;
  const x1 = x0 + (1 << CHUNK_SHIFT) - 1;
  const z1 = z0 + (1 << CHUNK_SHIFT) - 1;
  return builtFor(layout).sites.filter((s) => {
    const gx = floorDiv(s.x, COL);
    const gz = floorDiv(s.z, COL);
    return gx + r >= x0 && gx - r <= x1 && gz + r >= z0 && gz - r <= z1;
  });
}

/**
 * What world generation may put of its own on a column near these circles
 * (SC-2): nothing inside a ruin (0), no trees in its 60 m clearing (1), or
 * anything (2).
 */
export function circleRoom(sites: readonly CircleSite[], gx: number, gz: number): 0 | 1 | 2 {
  const x = gx * COL + (COL >> 1);
  const z = gz * COL + (COL >> 1);
  let room: 0 | 1 | 2 = 2;
  for (const s of sites) {
    const d = length2d(s.x - x, s.z - z);
    if (d < m(RUIN_CLEAR_M)) return 0;
    if (d < m(CLEARING_M)) room = 1;
  }
  return room;
}

/** Whether a circle's ruin lies within `columns` of a column: ponds, streams, bogs and hot springs keep clear of the stones. */
export function ruinWithin(layout: WorldLayout, gx: number, gz: number, columns: number): boolean {
  const x = gx * COL + (COL >> 1);
  const z = gz * COL + (COL >> 1);
  for (const s of builtFor(layout).sites) if (length2d(s.x - x, s.z - z) < m(RUIN_CLEAR_M) + columns * COL) return true;
  return false;
}

/** The ruin's ground is levelled out to RUIN_CLEAR_M from the middle, blending into the land over this much more (s). */
const RUIN_BLEND_M = 12;

/**
 * How level a ruin keeps the ground at a column, per 1024: 1024 inside the
 * ruin, fading to 0 over RUIN_BLEND_M beyond it, so the stones stand on the
 * land's smooth shape without terraces, mesas, ravines or boulders (s).
 */
export function ruinLevel(layout: WorldLayout, gx: number, gz: number): number {
  const sites = builtFor(layout).sites;
  if (sites.length === 0) return 0;
  const inner = floorDiv(m(RUIN_CLEAR_M), COL);
  const outer = inner + floorDiv(m(RUIN_BLEND_M), COL);
  let best = 0;
  for (const s of sites) {
    const dx = Math.abs(gx - floorDiv(s.x, COL));
    const dz = Math.abs(gz - floorDiv(s.z, COL));
    if (dx >= outer || dz >= outer) continue;
    const d = length2d(dx, dz);
    if (d >= outer) continue;
    const w = d <= inner ? 1024 : floorDiv((outer - d) * 1024, outer - inner);
    if (w > best) best = w;
  }
  return best;
}

/** The prop kind each piece is (CircleProp order); -1 for the idols, drawn on their altar rather than placed. */
export const PIECE_KINDS: readonly number[] = [
  PropKind.Trilithon,
  PropKind.BluestoneRubble,
  PropKind.BluestoneChest,
  PropKind.CircleAltar,
  -1,
  -1,
  PropKind.SweetHawthorne,
  PropKind.MoonRoseBush,
  PropKind.RuinBush,
  PropKind.RuinFern,
  PropKind.RuinMoss,
  PropKind.RuinFlower,
  PropKind.BonePile,
  PropKind.BoneyardDeadTree,
  PropKind.BoneyardThorn,
  PropKind.CirclePine,
];

/** A piece's prop variant: its heading (16 bits), its look (4 bits), its circle's type (2 bits) and its circle (8 bits). */
export function pieceVariant(p: CirclePiece, type: CircleType): number {
  return (p.heading & 0xffff) | ((p.look & 15) << 16) | ((type & 3) << 20) | ((p.circle & 255) << 22);
}
/** A circle piece's heading, from its prop variant (a 16-bit angle). */
export function variantHeading(variant: number): number {
  return variant & 0xffff;
}
/** A circle piece's look, from its prop variant: a trilithon's state, a pile's size, which flower or moss, a chest's number. */
export function variantLook(variant: number): number {
  return (variant >>> 16) & 15;
}
/** The type of a circle piece's circle, from its prop variant: its trilithons and altar take that type's look. */
export function variantType(variant: number): CircleType {
  return ((variant >>> 20) & 3) as CircleType;
}
/** A circle piece's circle, from its prop variant. */
export function variantCircle(variant: number): number {
  return (variant >>> 22) & 255;
}

/** A piece as a generated prop: its kind, what it holds, its age (grown: its growing time and more) and its variant; null for an idol. */
export function pieceRecord(layout: WorldLayout, p: CirclePiece): { kind: number; amount: number; age: number; variant: number } | null {
  const kind = PIECE_KINDS[p.prop] ?? -1;
  if (kind < 0) return null;
  const s = builtFor(layout).sites[p.circle]!;
  // The Moon Roses are shut until a Bright Night opens them (circles/update.ts).
  const amount = p.prop === CircleProp.MoonRose ? 0 : p.amount;
  const grow = PROPS[kind]!.regrowSteps;
  const age = PROPS[kind]!.shape === PropShape.Tree && grow > 0 ? grow + (hash32(layout.seed ^ SALT.piece, p.gx, p.gz) % grow) : 0;
  return { kind, amount, age, variant: pieceVariant(p, s.type) };
}

/** Where a piece stands as a prop: its chunk and its index among the chunk's props (the pieces come first in every chunk). */
export function pieceSlot(layout: WorldLayout, p: CirclePiece): { cx: number; cz: number; index: number } {
  const cx = p.gx >> CHUNK_SHIFT;
  const cz = p.gz >> CHUNK_SHIFT;
  let index = 0;
  for (const q of piecesInChunk(layout, cx, cz)) {
    if (q === p) break;
    if ((PIECE_KINDS[q.prop] ?? -1) >= 0) index++;
  }
  return { cx, cz, index };
}

/** The chunks a circle's clearing reaches into, as [cx, cz] pairs (for the generator to know which chunks to look at). */
export function chunksOf(s: CircleSite): Array<[number, number]> {
  const r = floorDiv(m(CLEARING_M), COL) + 1;
  const gx = floorDiv(s.x, COL);
  const gz = floorDiv(s.z, COL);
  const out: Array<[number, number]> = [];
  for (let cz = (gz - r) >> CHUNK_SHIFT; cz <= (gz + r) >> CHUNK_SHIFT; cz++) {
    for (let cx = (gx - r) >> CHUNK_SHIFT; cx <= (gx + r) >> CHUNK_SHIFT; cx++) out.push([cx, cz]);
  }
  return out;
}
