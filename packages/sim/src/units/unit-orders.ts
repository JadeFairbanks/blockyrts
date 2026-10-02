// A unit's own list of orders (Queuing orders with Shift). The first entry is
// what the unit is doing now; Shift adds to the end, an order without Shift
// replaces the whole list. Every entry is plain integers so it serialises and
// hashes like the rest of the state.

import type { ByteReader, ByteWriter } from '../bytes.ts';

export type UnitOrder =
  /** Walk to a point (wu). */
  | { t: 'move'; x: number; z: number }
  /** Stay close to another unit. */
  | { t: 'follow'; id: number }
  /** Gather from a resource node (its chunk and index), looping to the drop-off and back. */
  | { t: 'gather'; cx: number; cz: number; i: number }
  /** Build a planned building: footprint corner in columns. Becomes 'work' once started. */
  | { t: 'build'; kind: number; variant: number; x: number; z: number }
  /** Build, upgrade or repair a building until it needs nothing more. */
  | { t: 'work'; b: number }
  /** Double-tapped Repair: repair every damaged building nearby, worst first. */
  | { t: 'repairAll' }
  /** Return Cargo: drop the load at the nearest drop-off, then back to the node. */
  | { t: 'return' }
  /** Drop the load at this building, then back to the node. */
  | { t: 'dropoff'; b: number }
  /** Go inside a shelter. auto = 1 when Everyone Home or a farm sent it; it comes out at daybreak. */
  | { t: 'enter'; b: number; auto: number }
  /** A standing job: farm a farm, or craft in a production building, until given another order. */
  | { t: 'job'; b: number }
  /** Refuel or relight a light. */
  | { t: 'refuel'; b: number }
  /** Rank training at a main base (Table 7: Worker to Hand, to Master): the worker goes inside until it is done. */
  | { t: 'train'; b: number };

export type UnitOrderType = UnitOrder['t'];

const TYPES: readonly UnitOrderType[] = ['move', 'follow', 'gather', 'build', 'work', 'repairAll', 'return', 'dropoff', 'enter', 'job', 'refuel', 'train'];

/** The integer fields of each order type, in the order they are written. */
const FIELDS: Record<UnitOrderType, readonly string[]> = {
  move: ['x', 'z'],
  follow: ['id'],
  gather: ['cx', 'cz', 'i'],
  build: ['kind', 'variant', 'x', 'z'],
  work: ['b'],
  repairAll: [],
  return: [],
  dropoff: ['b'],
  enter: ['b', 'auto'],
  job: ['b'],
  refuel: ['b'],
  train: ['b'],
};

export function writeUnitOrder(w: ByteWriter, o: UnitOrder): void {
  w.u8(TYPES.indexOf(o.t));
  const rec = o as unknown as Record<string, number>;
  for (const f of FIELDS[o.t]) w.i32(rec[f]!);
}

export function readUnitOrder(r: ByteReader): UnitOrder {
  const t = TYPES[r.u8()];
  if (!t) throw new Error('bad unit order type in snapshot');
  const o: Record<string, number | string> = { t };
  for (const f of FIELDS[t]) o[f] = r.i32();
  return o as unknown as UnitOrder;
}

export function sameUnitOrder(a: UnitOrder, b: UnitOrder): boolean {
  if (a.t !== b.t) return false;
  const ra = a as unknown as Record<string, number>;
  const rb = b as unknown as Record<string, number>;
  return FIELDS[a.t].every((f) => ra[f] === rb[f]);
}

/** A short text for the selection panel. */
export function unitOrderText(o: UnitOrder | undefined): string {
  if (!o) return 'Idle';
  switch (o.t) {
    case 'move':
      return 'Moving';
    case 'follow':
      return 'Following';
    case 'gather':
      return 'Gathering';
    case 'build':
      return 'Going to build';
    case 'work':
      return 'Building';
    case 'repairAll':
      return 'Repairing';
    case 'return':
    case 'dropoff':
      return 'Returning cargo';
    case 'enter':
      return 'Sheltering';
    case 'job':
      return 'Working';
    case 'refuel':
      return 'Refuelling a light';
    case 'train':
      return 'Training';
  }
}
