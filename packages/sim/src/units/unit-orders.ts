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
  /**
   * Go inside a shelter, or up on a building's top. auto = 1 when Everyone
   * Home sent it by day (it comes out at daybreak); ENTER_NIGHT when it went
   * in for the night (units/night-work.ts: out at dawn once no monster is
   * near, or in the day); ENTER_TOP up top (units/top.ts).
   */
  | { t: 'enter'; b: number; auto: number }
  /** A standing job: farm a farm, or craft in a production building, until given another order. */
  | { t: 'job'; b: number }
  /** Relight a light that was put out. */
  | { t: 'relight'; b: number }
  /** Rank training (Table 7): a warrior at the Barracks, a mage at the Magi Sanctum, inside until it is done (Patch 3: workers no longer train their rank). */
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
   * Upgrade Weapon or Upgrade Armour (Troops and gear: upgrading units): walk
   * to the nearest Forge, Barracks or main base (mages also the Magi
   * Sanctum; b once chosen), wait out the bar, and come
   * away with `line` (units/kits.ts Line: weapon, tools or wand; armour or
   * robe) at tier `to`. The new piece was paid when the order was given, the
   * ways it was paid in `ways` (kits.ts planPieces), and is given back if the
   * order is dropped first; `paid` is 0 once it is spent.
   */
  | { t: 'kitUp'; line: number; to: number; ways: number; paid: number; b: number }
  /** A worker takes a cart from the pool at a main base (res: economy Res.HandCart or Res.OxCart), or hands its cart back there (res 0). */
  | { t: 'cart'; b: number; res: number }
  /**
   * Dig out a marked site (Digging). `band`: the level, terrain units, the
   * digger takes its column down to before it moves on to another (Jade's
   * Patch 5, GP-4: the high points first, spread over the area); `miss`: the
   * walks to a column it could not reach since its last load home, so it
   * takes the nearest column rather than the highest (units/dig.ts).
   */
  | { t: 'dig'; site: number; band: number; miss: number }
  /**
   * N Hunt (Semi-automation: hunting). A warrior chases the animal `id` (0:
   * none yet); with auto (double-tapped) it takes the nearest game within its
   * 40 m leash of (x, z) wu, carries what it can home and repeats. A worker
   * follows the hunter `id` and hauls the carcasses. (kx, kz) wu is where its
   * quarry was last seen when k is 1. Ends at dusk.
   */
  | { t: 'hunt'; id: number; auto: number; x: number; z: number; k: number; kx: number; kz: number }
  /** Tame a wild animal: stand by it with its food until it trusts the worker (Animals; Table 14). */
  | { t: 'tame'; id: number }
  /** Eat (and take medicine) at the nearest building that keeps food (Food and medicine), or at building b. */
  | { t: 'eat'; b: number }
  /** Hitch a tamed horse or ox to the worker's cart or pack (Table 12); id 0 lets it go. */
  | { t: 'hitch'; id: number }
  /** T Prospect a spot (columns). */
  | { t: 'prospect'; x: number; z: number }
  /** Cast a spell (magic/cast.ts) at a unit (id) or a spot (x, z wu); auto: the mage picks the target; until: the step she gives up (0 before she starts). */
  | { t: 'cast'; spell: number; id: number; x: number; z: number; auto: number; until: number }
  /** Crew a siege engine or cannon (id): stand by it, push it, and work it. */
  | { t: 'crew'; id: number }
  /** A worker repairs a siege engine or cannon (id). */
  | { t: 'mend'; id: number }
  /**
   * Loot (units/loot.ts): pick up the loot `id` lying on the ground (and
   * whatever else lies right by it), then with `hand` hand the bag in at the
   * nearest drop-off, then with `back` walk back to (x, z) wu, where the unit
   * stood when it went by itself (back is set only on what a unit does by
   * itself, and then it fights back on the way like an idle unit).
   */
  | { t: 'loot'; id: number; hand: number; back: number; x: number; z: number }
  /**
   * Gather (Semi-automation: the Gather button): fetch the basic materials
   * the side needs, at nodes it has seen, venturing out no farther than
   * needed (units/forage.ts). `res` is what it is after (-1 none yet); while
   * k is 1 it is looking for more out at (x, z) wu, on a bearing of `ang`
   * (0 to 65535); k 2 (FORAGE_HOME) is home for the night, k 3
   * (FORAGE_NIGHT) working on through the night (Jade's Patch 4,
   * units/night-work.ts); with the FORAGE_OWN bit its player set it
   * gathering in the dark (GP-24). The gathering itself is a 'gather' order
   * put in front of this one.
   */
  | { t: 'forage'; res: number; x: number; z: number; k: number; ang: number }
  /** An artillery crewman retrains as a worker (Patch 3): walks to his nearest main base (b, 0 until chosen), sits tinkering for the time it takes and gets up a worker. */
  | { t: 'retrain'; b: number }
  /**
   * The woodsman's work (Patch 5, Jade's WD-1 and WD-5, units/woods.ts):
   * fishing and foraging, each on (1) or off, both at once if the player
   * likes. (cx, cz, i) is the fish stretch or wild food he is working or
   * walking to (i -1: none yet); k holds WOODS_* bits; (x, z) wu is where he
   * set out, for his reach with no main base; (ex, ez) wu where he is
   * looking when nothing is in sight.
   */
  | { t: 'woods'; fish: number; forage: number; cx: number; cz: number; i: number; k: number; x: number; z: number; ex: number; ez: number };

export type UnitOrderType = UnitOrder['t'];

/** An enter order's `auto` for a unit going up on the building's top rather than inside (units/top.ts). */
export const ENTER_TOP = 2;
/** An enter order's `auto` for a worker that went into a shelter for the night (Jade's Patch 4, units/night-work.ts): it comes out at dawn once no monster is near, or in the day. */
export const ENTER_NIGHT = 3;
/** A woods order's `k` bits (units/woods.ts): home for the night; walking out to look about; his last look-about walk failed; his spot is the one the player picked (CT-1's left click), worked down further. */
export const WOODS_HOME = 1;
export const WOODS_SEARCH = 2;
export const WOODS_TURNED = 4;
export const WOODS_PICKED = 8;
/** A Gather order's `k` bit while its player set it gathering in the dark: it works on all that night as by day (Jade's GP-24), the bit gone at dawn (units/forage.ts). */
export const FORAGE_OWN = 16;
/** A Gather order's `k` while it is home for the night (units/forage.ts). */
export const FORAGE_HOME = 2;
/** A Gather order's `k` while it works on through the night (Jade's Patch 4, units/night-work.ts). */
export const FORAGE_NIGHT = 3;

const TYPES: readonly UnitOrderType[] = ['move', 'follow', 'gather', 'build', 'work', 'repairAll', 'return', 'dropoff', 'enter', 'job', 'relight', 'train', 'attack', 'attackMove', 'patrol', 'hold', 'kitUp', 'cart', 'dig', 'hunt', 'tame', 'eat', 'hitch', 'prospect', 'cast', 'crew', 'mend', 'loot', 'forage', 'retrain', 'woods'];

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
  relight: ['b'],
  train: ['b'],
  attack: ['id'],
  attackMove: ['x', 'z'],
  patrol: ['x', 'z', 'x2', 'z2', 'leg'],
  hold: [],
  kitUp: ['line', 'to', 'ways', 'paid', 'b'],
  cart: ['b', 'res'],
  dig: ['site', 'band', 'miss'],
  hunt: ['id', 'auto', 'x', 'z', 'k', 'kx', 'kz'],
  tame: ['id'],
  eat: ['b'],
  hitch: ['id'],
  prospect: ['x', 'z'],
  cast: ['spell', 'id', 'x', 'z', 'auto', 'until'],
  crew: ['id'],
  mend: ['id'],
  loot: ['id', 'hand', 'back', 'x', 'z'],
  forage: ['res', 'x', 'z', 'k', 'ang'],
  retrain: ['b'],
  woods: ['fish', 'forage', 'cx', 'cz', 'i', 'k', 'x', 'z', 'ex', 'ez'],
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
      return o.auto === ENTER_TOP ? 'Manning the top' : 'Sheltering';
    case 'job':
      return 'Working';
    case 'relight':
      return 'Relighting a light';
    case 'train':
      return 'Training';
    case 'attack':
      return 'Attacking';
    case 'attackMove':
      return 'Attack-moving';
    case 'patrol':
      return 'Patrolling';
    case 'hold':
      return 'Holding position';
    case 'kitUp':
      return 'Going to upgrade';
    case 'cart':
      return 'Fetching a cart';
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
    case 'cast':
      return 'Casting';
    case 'crew':
      return 'Crewing';
    case 'mend':
      return 'Repairing';
    case 'loot':
      return o.id !== 0 ? 'Picking up loot' : o.hand !== 0 ? 'Handing in loot' : 'Walking back';
    case 'forage': {
      const k = o.k & ~FORAGE_OWN;
      return k === FORAGE_HOME ? 'Home for the night' : k === 1 ? 'Looking for materials' : k === FORAGE_NIGHT || k !== o.k ? 'Gathering through the night' : 'Gathering';
    }
    case 'retrain':
      return 'Retraining as a worker';
    case 'woods':
      return (o.k & WOODS_HOME) !== 0 ? 'Home for the night' : o.fish && o.forage ? 'Foraging and fishing' : o.fish ? 'Fishing' : 'Foraging';
  }
}
