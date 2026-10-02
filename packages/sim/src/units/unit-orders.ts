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
  | { t: 'train'; b: number }
  /** Attack one target (an entity id), chasing it until it dies or is lost. */
  | { t: 'attack'; id: number }
  /** Attack-move: walk to a point (wu), stopping to fight whatever hostile comes in sight. */
  | { t: 'attackMove'; x: number; z: number }
  /** Patrol between two points (wu) forever, fighting like an attack-move; leg is the point it is walking to (0 or 1). */
  | { t: 'patrol'; x: number; z: number; x2: number; z2: number; leg: number }
  /** Hold Position: never move; fight only what is in reach. */
  | { t: 'hold' }
  /**
   * Collect equipment at a main base (Equipment): an item id per slot, or
   * KEEP. Slots in `reserved` (a bit per Slot) were taken from the stock when
   * the order was given (Equip Best); the others are hand-picked and taken
   * only on arrival, if still there.
   */
  | { t: 'equip'; b: number; tool: number; weapon: number; backup: number; ranged: number; shield: number; boots: number; ammo: number; torch: number; armour: number; helmet: number; boltCase: number; kit: number; reserved: number }
  /** Dig out, or heap up, a marked site (Digging and building up the land). */
  | { t: 'dig'; site: number }
  /** Specialist training at a building (Table 7: Archery at the Barracks): the unit goes inside until it is done. */
  | { t: 'skill'; b: number; skill: number }
  /**
   * N Hunt (Semi-automation: hunting). A warrior chases the animal `id` (0:
   * none yet); with auto (double-tapped) it takes the nearest game within its
   * 40 m leash of (x, z) wu, carries what it can home and repeats. A worker
   * follows the hunter `id` and hauls the carcasses. Ends at dusk.
   */
  | { t: 'hunt'; id: number; auto: number; x: number; z: number }
  /** Tame a wild animal: stand by it with its food until it trusts the worker (Animals; Table 14). */
  | { t: 'tame'; id: number }
  /** Eat (and take medicine) at the nearest building that keeps food (Food and medicine), or at building b. */
  | { t: 'eat'; b: number }
  /** Hitch a tamed horse or ox to the worker's cart or pack (Table 12); id 0 lets it go. */
  | { t: 'hitch'; id: number }
  /** T Prospect a spot (columns). */
  | { t: 'prospect'; x: number; z: number }
  /** Haul what waits at a mineshaft to a drop-off, over and over. */
  | { t: 'haul'; b: number }
  /** Cast a spell (magic/cast.ts) at a unit (id) or a spot (x, z wu); auto: the mage picks the target. */
  | { t: 'cast'; spell: number; id: number; x: number; z: number; auto: number };

/** An equip order's "leave this slot as it is". */
export const KEEP = 255;

export type UnitOrderType = UnitOrder['t'];

const TYPES: readonly UnitOrderType[] = ['move', 'follow', 'gather', 'build', 'work', 'repairAll', 'return', 'dropoff', 'enter', 'job', 'refuel', 'train', 'attack', 'attackMove', 'patrol', 'hold', 'equip', 'dig', 'skill', 'hunt', 'tame', 'eat', 'hitch', 'prospect', 'haul', 'cast'];

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
  attack: ['id'],
  attackMove: ['x', 'z'],
  patrol: ['x', 'z', 'x2', 'z2', 'leg'],
  hold: [],
  equip: ['b', 'tool', 'weapon', 'backup', 'ranged', 'shield', 'boots', 'ammo', 'torch', 'armour', 'helmet', 'boltCase', 'kit', 'reserved'],
  dig: ['site'],
  skill: ['b', 'skill'],
  hunt: ['id', 'auto', 'x', 'z'],
  tame: ['id'],
  eat: ['b'],
  hitch: ['id'],
  prospect: ['x', 'z'],
  haul: ['b'],
  cast: ['spell', 'id', 'x', 'z', 'auto'],
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
    case 'skill':
      return 'Training';
    case 'attack':
      return 'Attacking';
    case 'attackMove':
      return 'Attack-moving';
    case 'patrol':
      return 'Patrolling';
    case 'hold':
      return 'Holding position';
    case 'equip':
      return 'Fetching equipment';
    case 'dig':
      return 'Digging';
    case 'hunt':
      return 'Hunting';
    case 'tame':
      return 'Taming';
    case 'eat':
      return 'Going to eat';
    case 'hitch':
      return 'Fetching an animal';
    case 'prospect':
      return 'Prospecting';
    case 'haul':
      return 'Hauling';
    case 'cast':
      return 'Casting';
  }
}
