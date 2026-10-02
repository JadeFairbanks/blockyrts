// Buildings in the simulation: one record per building, kept in id order,
// plus the columns their footprints and solid parts cover (derived, rebuilt
// on load). A building is a real object from the moment it is started
// (Building placement); its footprint never changes as it levels up.

import type { ByteReader, ByteWriter } from '../bytes.ts';
import { COLUMNS_PER_CHUNK, floorDiv } from '../fixed.ts';
import { CHUNK_SHIFT, chunkKey } from '../world/chunk.ts';
import { buildingSpec, footprintDims, levelSpec, workSteps, UNFINISHED_HEALTH_PER_MILLE } from './data.ts';

const N = COLUMNS_PER_CHUNK;

/** Production items (Table 7 training rows and Table 2b processing at the buildings live now). */
export const Product = {
  Worker: 0,
  PlanksSoftwood: 1,
  PlanksHardwood: 2,
} as const;
export type Product = (typeof Product)[keyof typeof Product];

export interface QueueItem {
  product: Product;
  /** What was paid, refunded in full if cancelled. */
  paid: Array<[number, number]>;
  /** Steps of work done. */
  progress: number;
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
  /** Step construction finished (farms lie fallow for 2 days from it). */
  doneAt: number;
  /** Farms: yield carried between steps, in thousandths of a unit times steps per day. */
  farmAcc: number;
  /** Set when an alert about this building was sent, so it is sent once (bit 1: no supply). */
  alerted: number;
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

/** Where a building stands: its kind, footprint corner and variant (gates turn with variant 1). */
export interface Placed {
  kind: number;
  x: number;
  z: number;
  variant?: number;
}

/** The solid rectangle in global columns, inclusive: [x0, z0, x1, z1]. */
export function solidRect(b: Placed): [number, number, number, number] {
  const [sx, sz, sw, sd] = footprintDims(b.kind, b.variant ?? 0).solid;
  return [b.x + sx, b.z + sz, b.x + sx + sw - 1, b.z + sz + sd - 1];
}

/** The whole footprint in global columns, inclusive. */
export function footprintRect(b: Placed): [number, number, number, number] {
  const d = footprintDims(b.kind, b.variant ?? 0);
  return [b.x, b.z, b.x + d.w - 1, b.z + d.d - 1];
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

  get(id: number): Building | undefined {
    return this.byId.get(id);
  }

  add(b: Building, touch: (chunk: number) => void): void {
    this.list.push(b);
    this.list.sort((a, c) => a.id - c.id);
    this.byId.set(b.id, b);
    this.mark(b, true, touch);
  }

  remove(id: number, touch: (chunk: number) => void): void {
    const b = this.byId.get(id);
    if (!b) return;
    this.mark(b, false, touch);
    this.byId.delete(id);
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
  }

  private mark(b: Building, on: boolean, touch: (chunk: number) => void): void {
    const [fx0, fz0, fx1, fz1] = footprintRect(b);
    for (let z = fz0; z <= fz1; z++) {
      for (let x = fx0; x <= fx1; x++) {
        const k = footKey(x, z);
        if (on) this.foot.set(k, b.id);
        else if (this.foot.get(k) === b.id) this.foot.delete(k);
      }
    }
    const [sx0, sz0, sx1, sz1] = solidRect(b);
    const isGate = buildingSpec(b.kind).defence === 'gate';
    const touched = new Set<number>();
    for (let z = sz0; z <= sz1; z++) {
      for (let x = sx0; x <= sx1; x++) {
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
      w.u8(q.product);
      w.i32(q.progress);
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
    };
    const nq = r.u8();
    for (let q = 0; q < nq; q++) {
      const product = r.u8() as Product;
      const progress = r.i32();
      const np = r.u8();
      const paid: Array<[number, number]> = [];
      for (let p = 0; p < np; p++) paid.push([r.u8(), r.i32()]);
      b.queue.push({ product, progress, paid });
    }
    const nr = r.u8();
    for (let p = 0; p < nr; p++) b.rally.push(readRally(r));
    b.fuelUntil = r.u32();
    b.doneAt = r.u32();
    b.farmAcc = r.i32();
    b.alerted = r.u8();
    store.add(b, touch);
  }
}

/** Every field of a building, for the desync tool's diff. */
export function buildingFields(b: Building): Record<string, number | string> {
  return {
    id: b.id, owner: b.owner, kind: b.kind, variant: b.variant, level: b.level, x: b.x, z: b.z, y: b.y, hp: b.hp,
    progress: b.progress, complete: b.complete ? 1 : 0, upgrading: b.upgrading, upProgress: b.upProgress, repairAcc: b.repairAcc,
    queue: JSON.stringify(b.queue), rally: JSON.stringify(b.rally), fuelUntil: b.fuelUntil, doneAt: b.doneAt, farmAcc: b.farmAcc, alerted: b.alerted,
  };
}
