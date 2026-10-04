// Buildings in the simulation: one record per building, kept in id order,
// plus the columns their footprints and solid parts cover (derived, rebuilt
// on load). A building is a real object from the moment it is started
// (Building placement). Its anchor never moves; which columns are solid can
// change as it levels up, and a kitchen's footprint grows round the anchor
// (footprints.ts): an upgrade takes the new level's footprint from the
// moment it is paid for, and gives it back if cancelled.

import type { ByteReader, ByteWriter } from '../bytes.ts';
import { COLUMNS_PER_CHUNK, floorDiv } from '../fixed.ts';
import { CHUNK_SHIFT, chunkKey } from '../world/chunk.ts';
import { BuildingKind, buildingSpec, levelSpec, workSteps, UNFINISHED_HEALTH_PER_MILLE } from './data.ts';
import { footprintDims, type Dims } from './footprints.ts';

const N = COLUMNS_PER_CHUNK;

/** Production items (Table 7 training rows and Table 2b processing at the buildings live now). */
export const Product = {
  Worker: 0,
  PlanksSoftwood: 1,
  PlanksHardwood: 2,
  /** Table 7: a new Novice Acolyte, support or battle, with a hazel wand and a homespun robe. */
  SupportMage: 4,
  BattleMage: 5,
} as const;
export type Product = number;
/**
 * Research step r is product RESEARCH_PRODUCT + r; a processing or cooking
 * recipe (recipes.ts) RECIPE_PRODUCT + n; slaughtering one animal of a
 * species at a livestock farm, SLAUGHTER_PRODUCT + species; making a siege
 * engine or cannon (siege/data.ts), ENGINE_PRODUCT + engine; a new troop
 * (units/kits.ts) TROOP_PRODUCT + type x 100 + weapon tier x 10 + armour
 * tier (troopProduct); a new mage with her kit picked at a Magi Sanctum
 * (Patch 2), MAGE_PRODUCT + school x 100 + wand tier x 10 + robe tier
 * (mageProduct).
 */
export const RESEARCH_PRODUCT = 8;
export const RECIPE_PRODUCT = 512;
export const SLAUGHTER_PRODUCT = 1024;
export const ENGINE_PRODUCT = 2048;
export const TROOP_PRODUCT = 4096;
export const MAGE_PRODUCT = 8192;

/** The product for a new troop of a type with a weapon tier and an armour tier. */
export function troopProduct(troop: number, weapon: number, armour: number): Product {
  return TROOP_PRODUCT + troop * 100 + weapon * 10 + armour;
}

/** A troop product's type and tiers, or undefined for any other product. */
export function troopOf(product: Product): { troop: number; w: number; a: number } | undefined {
  if (product < TROOP_PRODUCT || product >= MAGE_PRODUCT) return undefined;
  const n = product - TROOP_PRODUCT;
  return { troop: floorDiv(n, 100), w: floorDiv(n, 10) % 10, a: n % 10 };
}

/** The product for a new mage of a school (magic/spells.ts School) with a wand tier and a robe tier, trained at a Magi Sanctum (Patch 2). */
export function mageProduct(school: number, wand: number, robe: number): Product {
  return MAGE_PRODUCT + school * 100 + wand * 10 + robe;
}

/** A Sanctum mage product's school and wand and robe tiers, or undefined for any other product. */
export function mageOf(product: Product): { school: number; w: number; a: number } | undefined {
  if (product < MAGE_PRODUCT) return undefined;
  const n = product - MAGE_PRODUCT;
  return { school: floorDiv(n, 100), w: floorDiv(n, 10) % 10, a: n % 10 };
}

export interface QueueItem {
  product: Product;
  /**
   * What was paid, refunded in full if cancelled: resources and counts; food
   * paid for a "food" cost is exact to the quarter (economy/food.ts takeFood),
   * so it is written as minus its quarters of nutrition.
   */
  paid: Array<[number, number]>;
  /** Steps of work done. */
  progress: number;
  /** The player who queued and paid for it: the building's owner, or another player using an inherited building (Multiplayer and saving). */
  by: number;
  /** New cavalry: the tamed horse taken from the stalls, 1 + its sex (given back if cancelled), or 0. */
  horse: number;
}

/** A rally point: ground (wu), a unit to follow, or a resource node to gather from. */
export type RallyPoint = { t: 'ground'; x: number; z: number } | { t: 'unit'; id: number } | { t: 'node'; cx: number; cz: number; i: number };

export interface Building {
  id: number;
  owner: number;
  kind: number;
  /** Farms: which crop (index into the spec's crops); 0 otherwise. */
  variant: number;
  level: number;
  /** Footprint corner (smallest x and z), global columns. */
  x: number;
  z: number;
  /** Floor level, terrain units. */
  y: number;
  hp: number;
  /** Steps of construction work done; complete once it reaches workSteps(kind, 1). */
  progress: number;
  complete: boolean;
  /** Level being built as an upgrade, or 0. */
  upgrading: number;
  upProgress: number;
  /** Repair work carried over between steps (health points x work steps). */
  repairAcc: number;
  queue: QueueItem[];
  rally: RallyPoint[];
  /** Lights: the step it burns until (lit while the step is below it). */
  fuelUntil: number;
  /** Step construction finished. */
  doneAt: number;
  /** Farms: the harvest's progress, in farmer-steps of work (full at FARM_HARVEST_STEPS); the yield's thousandths carried between harvests are in `acc[0]`. */
  farmAcc: number;
  /** Set when an alert about this building was sent, so it is sent once (bit 1: no supply). */
  alerted: number;
  /** Research facilities: how many of them the player had when this one was paid for (each further one costs this much again on top). */
  costMul: number;
  /** Mineshafts: the prospect rating of the spot (mining.ts Rating), loads brought up so far, and what waits at the shaft to be hauled. */
  rating: number;
  mined: number;
  stock: Array<[number, number]>;
  /** Mineshafts: output carried between steps, per resource of the tier's list, in thousandths times steps per day. Farms: [the thousandths of an item carried to the next harvest]. */
  acc: number[];
  /**
   * 1 once inherited from a player who was eliminated or left: every player
   * still in may use it, paying with their own resources (When a player is
   * eliminated or leaves).
   */
  shared: number;
  /** Research the players it was inherited from had (a bit per step), which anyone using it may build on. */
  tech: number;
  /**
   * Barracks and Stables: the padlock per troop type (Patch 2's training
   * cards), by type; a Magi Sanctum's per school at mageLock (6 support, 7
   * battle): 0 unlocked, else 1 + weapon (wand) tier x 10 + armour (robe)
   * tier, the kit this building keeps training.
   */
  locks: number[];
}

/** Ranged units a building takes on its top (Table 4: towers 4, a main base's parapets 8 from level 3). */
export function garrisonRoom(b: Building): number {
  if (!b.complete) return 0;
  const spec = buildingSpec(b.kind);
  if (spec.slots) return spec.slots;
  if (b.kind === BuildingKind.MainBase && b.level >= 3) return 8;
  return 0;
}

export function maxHealth(b: Building): number {
  return levelSpec(b.kind, b.level).health;
}

/** Health a building under construction has after `progress` steps of work: 10% plus the share built. */
export function constructionHealth(kind: number, progress: number): number {
  const max = levelSpec(kind, 1).health;
  const total = workSteps(kind, 1);
  const pm = UNFINISHED_HEALTH_PER_MILLE + floorDiv((1000 - UNFINISHED_HEALTH_PER_MILLE) * Math.min(progress, total), total);
  return floorDiv(max * pm, 1000);
}

/** Where a building stands: its kind, anchor (level 1 corner) and variant (gates turn with variant 1), and its level and any upgrade under way. */
export interface Placed {
  kind: number;
  x: number;
  z: number;
  variant?: number;
  level?: number;
  upgrading?: number;
}

/** The level whose footprint a building takes: the one it is being upgraded to while that goes on. */
export function footLevel(b: Placed): number {
  return Math.max(b.level ?? 1, b.upgrading ?? 0);
}

/** A building's footprint now (footprints.ts Dims). */
export function placedDims(b: Placed): Dims {
  return footprintDims(b.kind, b.variant ?? 0, footLevel(b));
}

/** The rectangle round the solid columns in global columns, inclusive: [x0, z0, x1, z1] (the footprint when none is solid). */
export function solidRect(b: Placed): [number, number, number, number] {
  const d = placedDims(b);
  const [sx, sz, sw, sd] = d.solid;
  if (sw === 0) return footprintRect(b);
  const x = b.x + d.ox;
  const z = b.z + d.oz;
  return [x + sx, z + sz, x + sx + sw - 1, z + sz + sd - 1];
}

/** The solid columns in global columns, row by row. */
export function solidCells(b: Placed): Array<[number, number]> {
  const d = placedDims(b);
  return d.cells.map(([x, z]) => [b.x + d.ox + x, b.z + d.oz + z]);
}

/** The whole footprint in global columns, inclusive. */
export function footprintRect(b: Placed): [number, number, number, number] {
  const d = placedDims(b);
  const x = b.x + d.ox;
  const z = b.z + d.oz;
  return [x, z, x + d.w - 1, z + d.d - 1];
}

/** The columns a building's marks cover, kept to take them off again whatever its level has become. */
interface Marked {
  foot: [number, number, number, number];
  cells: Array<[number, number]>;
}

export class BuildingStore {
  readonly list: Building[] = [];
  private readonly byId = new Map<number, Building>();
  /** Derived: solid columns per chunk (local index to building id). */
  private readonly solid = new Map<number, Map<number, number>>();
  /** Derived: footprint columns (global column key to building id), for placement. */
  private readonly foot = new Map<number, number>();
  /** Derived: gate columns per chunk (local indices). */
  private readonly gates = new Map<number, Set<number>>();
  /** Derived: what each building marked. */
  private readonly marked = new Map<number, Marked>();
  /** Not state: bumped whenever a building is added or removed, changes hands or changes its footprint, so a cache can tell nothing changed with one compare. */
  rev = 0;

  get(id: number): Building | undefined {
    return this.byId.get(id);
  }

  add(b: Building, touch: (chunk: number) => void): void {
    this.rev++;
    this.list.push(b);
    this.list.sort((a, c) => a.id - c.id);
    this.byId.set(b.id, b);
    this.mark(b, true, touch);
  }

  remove(id: number, touch: (chunk: number) => void): void {
    const b = this.byId.get(id);
    if (!b) return;
    this.rev++;
    this.mark(b, false, touch);
    this.byId.delete(id);
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Brings the marks in line with the building's level and upgrade, after either changes. */
  refit(b: Building, touch: (chunk: number) => void): void {
    if (!this.byId.has(b.id)) return;
    this.rev++;
    const keys = new Set<number>();
    const gather = (key: number): void => {
      keys.add(key);
    };
    this.mark(b, false, gather);
    this.mark(b, true, gather);
    for (const key of [...keys].sort((a, c) => a - c)) touch(key);
  }

  private mark(b: Building, on: boolean, touch: (chunk: number) => void): void {
    let m0 = this.marked.get(b.id);
    if (on) {
      m0 = { foot: footprintRect(b), cells: solidCells(b) };
      this.marked.set(b.id, m0);
    } else {
      this.marked.delete(b.id);
      if (!m0) return;
    }
    const [fx0, fz0, fx1, fz1] = m0.foot;
    for (let z = fz0; z <= fz1; z++) {
      for (let x = fx0; x <= fx1; x++) {
        const k = footKey(x, z);
        if (on) this.foot.set(k, b.id);
        else if (this.foot.get(k) === b.id) this.foot.delete(k);
      }
    }
    const isGate = buildingSpec(b.kind).defence === 'gate';
    const touched = new Set<number>();
    for (const [x, z] of m0.cells) {
      const cx = x >> CHUNK_SHIFT;
      const cz = z >> CHUNK_SHIFT;
      const key = chunkKey(cx, cz);
      const i = (z - cz * N) * N + (x - cx * N);
      let m = this.solid.get(key);
      if (on) {
        if (!m) {
          m = new Map();
          this.solid.set(key, m);
        }
        m.set(i, b.id);
      } else if (m && m.get(i) === b.id) {
        m.delete(i);
        if (m.size === 0) this.solid.delete(key);
      }
      if (isGate) {
        let g = this.gates.get(key);
        if (on) {
          if (!g) {
            g = new Set();
            this.gates.set(key, g);
          }
          g.add(i);
        } else if (g) {
          g.delete(i);
          if (g.size === 0) this.gates.delete(key);
        }
      }
      touched.add(key);
    }
    for (const key of [...touched].sort((a, c) => a - c)) touch(key);
  }

  /** The building whose footprint covers a column, or 0. */
  footprintAt(x: number, z: number): number {
    return this.foot.get(footKey(x, z)) ?? 0;
  }

  /** The building whose solid part fills a column, or 0. */
  solidAt(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.solid.get(chunkKey(cx, cz))?.get((z - cz * N) * N + (x - cx * N)) ?? 0;
  }

  /** For the walk map: the solid local columns of a chunk. */
  solidIn(chunk: number): ReadonlySet<number> | undefined {
    const m = this.solid.get(chunk);
    return m ? new Set(m.keys()) : undefined;
  }

  /** For the walk map: the gate columns of a chunk. */
  gatesIn(chunk: number): ReadonlySet<number> | undefined {
    return this.gates.get(chunk);
  }

  /** Whether any building's solid part lies in a chunk. */
  hasSolidIn(chunk: number): boolean {
    return this.solid.has(chunk);
  }
}

function footKey(x: number, z: number): number {
  return (x + 0x40000) * 0x80000 + (z + 0x40000);
}

// ----- serialisation -----

function writeRally(w: ByteWriter, p: RallyPoint): void {
  if (p.t === 'ground') {
    w.u8(0);
    w.i32(p.x);
    w.i32(p.z);
  } else if (p.t === 'unit') {
    w.u8(1);
    w.u32(p.id);
  } else {
    w.u8(2);
    w.i32(p.cx);
    w.i32(p.cz);
    w.i32(p.i);
  }
}

function readRally(r: ByteReader): RallyPoint {
  const t = r.u8();
  if (t === 0) return { t: 'ground', x: r.i32(), z: r.i32() };
  if (t === 1) return { t: 'unit', id: r.u32() };
  return { t: 'node', cx: r.i32(), cz: r.i32(), i: r.i32() };
}

export function writeBuildings(w: ByteWriter, store: BuildingStore): void {
  w.u32(store.list.length);
  for (const b of store.list) {
    w.u32(b.id);
    w.u8(b.owner);
    w.u8(b.kind);
    w.u8(b.variant);
    w.u8(b.level);
    w.i32(b.x);
    w.i32(b.z);
    w.i16(b.y);
    w.i32(b.hp);
    w.i32(b.progress);
    w.u8(b.complete ? 1 : 0);
    w.u8(b.upgrading);
    w.i32(b.upProgress);
    w.i32(b.repairAcc);
    w.u8(b.queue.length);
    for (const q of b.queue) {
      w.u16(q.product);
      w.i32(q.progress);
      w.u8(q.by);
      w.u8(q.horse);
      w.u8(q.paid.length);
      for (const [res, n] of q.paid) {
        w.u8(res);
        w.i32(n);
      }
    }
    w.u8(b.rally.length);
    for (const p of b.rally) writeRally(w, p);
    w.u32(b.fuelUntil);
    w.u32(b.doneAt);
    w.i32(b.farmAcc);
    w.u8(b.alerted);
    w.u8(b.costMul);
    w.u8(b.rating);
    w.i32(b.mined);
    w.u8(b.stock.length);
    for (const [res, n] of b.stock) {
      w.u8(res);
      w.i32(n);
    }
    w.u8(b.acc.length);
    for (const v of b.acc) w.i32(v);
    w.u8(b.shared);
    w.u32(b.tech);
    w.u8(b.locks.length);
    for (const v of b.locks) w.u8(v);
  }
}

export function readBuildings(r: ByteReader, store: BuildingStore, touch: (chunk: number) => void): void {
  const n = r.u32();
  for (let k = 0; k < n; k++) {
    const b: Building = {
      id: r.u32(),
      owner: r.u8(),
      kind: r.u8(),
      variant: r.u8(),
      level: r.u8(),
      x: r.i32(),
      z: r.i32(),
      y: r.i16(),
      hp: r.i32(),
      progress: r.i32(),
      complete: r.u8() === 1,
      upgrading: r.u8(),
      upProgress: r.i32(),
      repairAcc: r.i32(),
      queue: [],
      rally: [],
      fuelUntil: 0,
      doneAt: 0,
      farmAcc: 0,
      alerted: 0,
      costMul: 1,
      rating: 0,
      mined: 0,
      stock: [],
      acc: [],
      shared: 0,
      tech: 0,
      locks: [],
    };
    const nq = r.u8();
    for (let q = 0; q < nq; q++) {
      const product = r.u16();
      const progress = r.i32();
      const by = r.u8();
      const horse = r.u8();
      const np = r.u8();
      const paid: Array<[number, number]> = [];
      for (let p = 0; p < np; p++) paid.push([r.u8(), r.i32()]);
      b.queue.push({ product, progress, paid, by, horse });
    }
    const nr = r.u8();
    for (let p = 0; p < nr; p++) b.rally.push(readRally(r));
    b.fuelUntil = r.u32();
    b.doneAt = r.u32();
    b.farmAcc = r.i32();
    b.alerted = r.u8();
    b.costMul = r.u8();
    b.rating = r.u8();
    b.mined = r.i32();
    const ns = r.u8();
    for (let k2 = 0; k2 < ns; k2++) b.stock.push([r.u8(), r.i32()]);
    const na = r.u8();
    for (let k2 = 0; k2 < na; k2++) b.acc.push(r.i32());
    b.shared = r.u8();
    b.tech = r.u32();
    const nl = r.u8();
    for (let k2 = 0; k2 < nl; k2++) b.locks.push(r.u8());
    store.add(b, touch);
  }
}

/** Every field of a building, for the desync tool's diff. */
export function buildingFields(b: Building): Record<string, number | string> {
  return {
    id: b.id, owner: b.owner, kind: b.kind, variant: b.variant, level: b.level, x: b.x, z: b.z, y: b.y, hp: b.hp,
    progress: b.progress, complete: b.complete ? 1 : 0, upgrading: b.upgrading, upProgress: b.upProgress, repairAcc: b.repairAcc,
    queue: JSON.stringify(b.queue), rally: JSON.stringify(b.rally), fuelUntil: b.fuelUntil, doneAt: b.doneAt, farmAcc: b.farmAcc, alerted: b.alerted,
    costMul: b.costMul, rating: b.rating, mined: b.mined, stock: JSON.stringify(b.stock), acc: JSON.stringify(b.acc), shared: b.shared, tech: b.tech, locks: JSON.stringify(b.locks),
  };
}
