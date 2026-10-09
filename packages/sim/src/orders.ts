// Player orders. In lockstep every player sends the orders for step N in one
// frame; the sim applies them at the start of step N in a fixed order (player
// index, then the order each player gave them in). Every order is plain
// integers (and booleans), so it checks, copies and travels easily.

import { TUNNEL_MAX_UNITS, TUNNEL_MIN_UNITS, TUNNEL_STRETCH_MAX_COLUMNS, WALL_STRETCH_MAX_COLUMNS } from './buildings/chains.ts';

/** Orders given to some of a player's units; `queued` is Shift (added to the end of each unit's list). */
interface UnitsOrder {
  player: number;
  /** Entity ids. Ids the player does not own, or units that cannot carry the order out, are ignored. */
  units: number[];
  queued?: boolean;
}

/** Walk to a point (wu). A group keeps its shape round the point. */
export interface MoveOrder extends UnitsOrder {
  kind: 'move';
  x: number;
  z: number;
}

/** Cancel every queued order (Stop). */
export interface StopOrder {
  kind: 'stop';
  player: number;
  units: number[];
}

/** Stay close to a friendly unit. */
export interface FollowOrder extends UnitsOrder {
  kind: 'follow';
  target: number;
}

/** Gather from a resource node: its chunk and its index there. */
export interface GatherOrder extends UnitsOrder {
  kind: 'gather';
  cx: number;
  cz: number;
  index: number;
}

/** Build a building with its footprint corner at (x, z), global columns; variant picks a farm's crop. */
export interface BuildOrder extends UnitsOrder {
  kind: 'build';
  building: number;
  variant: number;
  x: number;
  z: number;
}

/** Continue building, upgrading or repairing a building. */
export interface WorkOrder extends UnitsOrder {
  kind: 'work';
  building: number;
}

/** Double-tapped Repair: repair damaged buildings nearby, worst first. */
export interface RepairAllOrder extends UnitsOrder {
  kind: 'repairAll';
}

/** A right click on Repair (Jade's Patch 5, UI-13): the selected workers' autorepair on (1) or off (0). */
export interface AutoRepairOrder extends UnitsOrder {
  kind: 'autoRepair';
  on: number;
}

/** Repair all (Jade's Patch 5, GP-25): the workers near each damaged building go and repair it (units/repairs.ts). */
export interface RepairNearbyOrder {
  kind: 'repairNearby';
  player: number;
}

/** Return Cargo (C): to the nearest drop-off, then back to the node. */
export interface ReturnCargoOrder extends UnitsOrder {
  kind: 'returnCargo';
}

/** Drop the load at a given drop-off, then back to the node. */
export interface DropoffOrder extends UnitsOrder {
  kind: 'dropoff';
  building: number;
}

/** E Enter: shelter in a building. */
export interface EnterOrder extends UnitsOrder {
  kind: 'enter';
  building: number;
}

/** U Unload All, or let one unit out (unit set). */
export interface UnloadOrder {
  kind: 'unload';
  player: number;
  building: number;
  /** One unit to let out, or 0 for all. */
  unit: number;
}

/** Assign workers to a farm or a production building (right click on it). */
export interface AssignOrder extends UnitsOrder {
  kind: 'assign';
  building: number;
}

/** Relight a light that was put out (Patch 2: lights need no fuel). */
export interface RelightOrder extends UnitsOrder {
  kind: 'relight';
  building: number;
}

/** Train warriors (at the Barracks) or mages (at the Magi Sanctum) to the next rank (Table 7; Patch 3: workers rank up by working). */
export interface TrainRankOrder extends UnitsOrder {
  kind: 'trainRank';
  building: number;
}

/** Artillery crewmen retrain as workers at their nearest main base (Patch 3, Jade); anyone else in the selection is left as it was. */
export interface RetrainOrder extends UnitsOrder {
  kind: 'retrain';
}

/** Add items to a building's production queue (1, or 5 with Shift). */
export interface ProduceOrder {
  kind: 'produce';
  player: number;
  building: number;
  product: number;
  count: number;
}

/** Cancel a queued item, refunded in full. */
export interface CancelProduceOrder {
  kind: 'cancelProduce';
  player: number;
  building: number;
  index: number;
}

/** Upgrade a building to its next level (paid now; workers then build it). */
export interface UpgradeOrder {
  kind: 'upgrade';
  player: number;
  building: number;
}

/** X Cancel: an unfinished building (75% back) or an upgrade under way (75% back). */
export interface CancelBuildOrder {
  kind: 'cancelBuild';
  player: number;
  building: number;
}

/** Set (or with add, extend) a building's rally route: ground (wu), a unit, or a resource node. */
export interface RallyOrder {
  kind: 'rally';
  player: number;
  building: number;
  add: boolean;
  point: 'ground' | 'unit' | 'node';
  x: number;
  z: number;
  /** For a unit: its id. For a node: cx, cz and index in x, z and id. */
  id: number;
}

/** Everyone Home: every unit without a standing job goes to the nearest shelter. */
export interface EveryoneHomeOrder {
  kind: 'everyoneHome';
  player: number;
}

/**
 * A terrain edit as a stepped sim event (Technology, World generation and
 * terrain): sets the solid range [bottom, top) of every column in the box to
 * a material, or carves it to air with material 0. Columns are global column
 * coordinates (45 cm), heights are terrain units (11.25 cm). Digging (M3)
 * issues these; in M1 the debug tools do.
 */
export interface TerrainOrder {
  kind: 'terrain';
  player: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  bottom: number;
  top: number;
  material: number;
}

/** Debug: marks land explored around a point (the minimap's debug reveal). Radius in wu. */
export interface DebugRevealOrder {
  kind: 'debugReveal';
  player: number;
  x: number;
  z: number;
  radius: number;
}

/** Debug: takes from a prop, felling a tree or cutting a bush. */
export interface DebugHarvestOrder {
  kind: 'debugHarvest';
  player: number;
  cx: number;
  cz: number;
  index: number;
  amount: number;
}

/** A Attack on a unit: chase it until it dies or is lost. */
export interface AttackOrder extends UnitsOrder {
  kind: 'attack';
  target: number;
}

/** A Attack on the ground: attack-move to a point (wu). */
export interface AttackMoveOrder extends UnitsOrder {
  kind: 'attackMove';
  x: number;
  z: number;
}

/** P Patrol between where each unit stands and a point (wu). */
export interface PatrolOrder extends UnitsOrder {
  kind: 'patrol';
  x: number;
  z: number;
}

/** H Hold Position. */
export interface HoldOrder {
  kind: 'hold';
  player: number;
  units: number[];
  /** Shift + H: hold where the unit is once its earlier orders are done. */
  queued?: boolean;
}

/**
 * Upgrading units (Troops and gear): line 0 Upgrade Weapon (tools on a
 * worker, wand on a mage), 1 Upgrade Armour (robe on a mage); max 1 is the
 * Max twin, to the best tier researched and affordable.
 */
export interface UpgradeKitOrder {
  kind: 'upgradeKit';
  player: number;
  units: number[];
  line: number;
  max: number;
}

/**
 * Upgrade equipment (Jade's Patch 2): every upgrade the stock pays for at
 * once, the weapon (tools, wand) before the armour (robe), each to the best
 * tier researched (units/gear.ts orderUpgradeEquipment).
 */
export interface UpgradeEquipmentOrder {
  kind: 'upgradeEquipment';
  player: number;
  units: number[];
}

/** Workers fetch a cart from a main base's stock (back 0) or hand theirs in (back 1). */
export interface CartOrder {
  kind: 'cart';
  player: number;
  units: number[];
  back: number;
}

/**
 * The padlock on a training card (Patch 2): `troop` is the troop type (1 to
 * 5) at a Barracks, or a Magi Sanctum's mage card (6 support, 7 battle:
 * production.ts mageLock); `lock` 0 off, else 1 + weapon (wand) tier x 10 +
 * armour (robe) tier.
 */
export interface TroopLockOrder {
  kind: 'troopLock';
  player: number;
  building: number;
  troop: number;
  lock: number;
}

/** The lock (Warriors): 0 switches by itself, 1 melee only, 2 ranged only. */
export interface LockOrder {
  kind: 'lock';
  player: number;
  units: number[];
  lock: number;
}

/** D Dig: a box of columns down to a floor (terrain units), or a tunnel between a floor and a roof. */
export interface DigOrder extends UnitsOrder {
  kind: 'dig';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  level: number;
  level2: number;
  tunnel: number;
}

/**
 * One stretch of a wall chain (Building placement: wall chains): a wall on
 * every column from (x, z), global columns, `length` columns in direction
 * `dir` (0 east, turning towards +z; buildings/chains.ts). `skip` 1 leaves
 * out the anchor, which the stretch before placed. Columns that cannot take
 * a wall are skipped, and the stretch is cut short where the stock, less
 * what is already planned, runs out.
 */
export interface WallStretchOrder extends UnitsOrder {
  kind: 'wallStretch';
  building: number;
  x: number;
  z: number;
  dir: number;
  length: number;
  skip: number;
}

/** One stretch of a tunnel chain (Digging: tunnel chains): dug level from (x, z) `length` columns in direction `dir`, between a floor and a roof (terrain units). */
export interface TunnelStretchOrder extends UnitsOrder {
  kind: 'tunnelStretch';
  x: number;
  z: number;
  dir: number;
  length: number;
  level: number;
  level2: number;
}

/** Debug: puts resources into a player's pool. */
export interface DebugGiveOrder {
  kind: 'debugGive';
  player: number;
  res: number;
  count: number;
}

/** Debug: a threat at a point (wu) for the player: a lair, a goblin village, a tribe's band, a territorial creature or fog (threats/debug.ts DebugThreat). */
export interface DebugThreatOrder {
  kind: 'debugThreat';
  player: number;
  what: number;
  x: number;
  z: number;
}

/** Trade (Neutral villages and trade): the goods in the offer box for a faction, as pairs of good (peoples/data.ts goods codes) and count. It answers with three bundles. */
export interface TradeOfferOrder {
  kind: 'tradeOffer';
  player: number;
  faction: number;
  goods: number[];
}

/** Take one of the three bundles the faction answered with (0 to 2). */
export interface TradeTakeOrder {
  kind: 'tradeTake';
  player: number;
  faction: number;
  bundle: number;
}

/** Turn the faction's answer down (it counts towards its mood). */
export interface TradeWithdrawOrder {
  kind: 'tradeWithdraw';
  player: number;
  faction: number;
}

/** Declare war on a faction, after the confirmation pop-up; every player is drawn in. */
export interface DeclareWarOrder {
  kind: 'declareWar';
  player: number;
  faction: number;
}

/** Accept (1) or refuse (0) a faction's offer to surrender. */
export interface SurrenderOrder {
  kind: 'surrender';
  player: number;
  faction: number;
  accept: number;
}

/** Pay a Dwarf faction's reparations from the stock. */
export interface ReparationsOrder {
  kind: 'reparations';
  player: number;
  faction: number;
}

/** Hire mercenaries from a camp for the day (2 silver each). */
export interface HireOrder {
  kind: 'hire';
  player: number;
  faction: number;
  count: number;
}

/** Debug: one of the peoples at a point (wu): a faction kind (peoples/data.ts FactionKind), 7 an Elf caravan to the player now, 8 meet the Elves. */
export interface DebugPeoplesOrder {
  kind: 'debugPeoples';
  player: number;
  what: number;
  x: number;
  z: number;
}

/** Debug: a night mob at a point (wu), sent against the player. */
export interface DebugSpawnOrder {
  kind: 'debugSpawn';
  player: number;
  mob: number;
  x: number;
  z: number;
}

/** Debug (Jade's Patch 5): godmode on (1) or off (0) for the player (debug/god.ts). */
export interface DebugGodOrder {
  kind: 'debugGod';
  player: number;
  on: number;
}

/** Debug: godmode places one of GOD_SPAWNS (debug/god.ts) at a point (wu). */
export interface DebugPlaceOrder {
  kind: 'debugPlace';
  player: number;
  what: number;
  x: number;
  z: number;
}

/** The debugger's other buttons (debug/god.ts): every unit to its top rank, all healed, the monsters round a point cleared, the Elf kingdom shown. */
export const DebugTool = { MaxRank: 0, HealAll: 1, ClearFoes: 2, ElfKingdom: 3 } as const;
export type DebugTool = (typeof DebugTool)[keyof typeof DebugTool];

/** Debug: one of the debugger's buttons (DebugTool), at a point (wu) where it needs one. */
export interface DebugToolOrder {
  kind: 'debugTool';
  player: number;
  tool: number;
  x: number;
  z: number;
}

/** Debug: kills the given units outright, whoever's they are. */
export interface DebugKillOrder {
  kind: 'debugKill';
  player: number;
  units: number[];
}

/** What a targeted command pressed twice asks each unit to pick for itself (Controls: "Double-tap for auto-target"). */
export const PickOwn = {
  /** A: the nearest enemy it can see. */
  Attack: 0,
  /** G: the nearest node it can gather (of what it carries, if anything). */
  Gather: 1,
  /** E: the nearest of its player's buildings with room for it (workers shelter, ranged units and mages garrison). */
  Enter: 2,
  /** T: the ground it stands on. */
  Prospect: 3,
} as const;

/** A targeted command pressed twice: each unit picks its own target (PickOwn). */
export interface PickOwnOrder extends UnitsOrder {
  kind: 'pickOwn';
  command: number;
}

/** N Hunt an animal; auto (double-tapped) keeps hunting game near where each warrior stands. Workers in the selection haul. */
export interface HuntOrder extends UnitsOrder {
  kind: 'hunt';
  /** The animal, or 0 with auto for the nearest game. */
  target: number;
  auto: number;
}

/** Pick up loot lying on the ground (a right-click on it): the units walk over, and those with room take it. */
export interface PickUpOrder extends UnitsOrder {
  kind: 'pickUp';
  /** The loot's id. */
  target: number;
}

/** Gather: workers fetch the basic materials the side can use, by themselves, and come home at dusk. */
export interface ForageOrder extends UnitsOrder {
  kind: 'forage';
}

/**
 * Cast a spell (Magic; Table 13): at a unit (target, an entity id), or at a
 * spot on the ground (x, z wu) for an area spell. auto (a double-tapped
 * spell button) lets each mage pick the best target herself.
 */
export interface CastOrder extends UnitsOrder {
  kind: 'cast';
  spell: number;
  target: number;
  x: number;
  z: number;
  auto: number;
}

/** Tame a wild animal (one worker stands by it with food). */
export interface TameOrder extends UnitsOrder {
  kind: 'tame';
  target: number;
}

/** Eat at a building that keeps food (0: the nearest), healing and taking medicine. */
export interface EatOrder extends UnitsOrder {
  kind: 'eat';
  building: number;
}

/** Hitch a tamed horse or ox to a worker's cart or pack; target 0 lets it go. */
export interface HitchOrder extends UnitsOrder {
  kind: 'hitch';
  target: number;
}

/** Warriors crew an engine or cannon (target): they stand by it, push it and work it. */
export interface CrewOrder extends UnitsOrder {
  kind: 'crew';
  target: number;
}

/** Workers repair an engine or cannon (target). */
export interface MendOrder extends UnitsOrder {
  kind: 'mend';
  target: number;
}

/** T Prospect a spot (global columns). */
export interface ProspectOrder extends UnitsOrder {
  kind: 'prospect';
  x: number;
  z: number;
}

/** F9 Rations: 0 everyone eats, 1 troops only, 2 workers only. */
export interface RationsOrder {
  kind: 'rations';
  player: number;
  rations: number;
}

/** A food's Don't eat toggle (Food): on 1 keeps it out of meals. */
export interface DontEatOrder {
  kind: 'dontEat';
  player: number;
  res: number;
  on: number;
}

/** Allies panel: let another player command this player's units (on 1), or stop (on 0). */
export interface ShareControlOrder {
  kind: 'shareControl';
  player: number;
  with: number;
  on: number;
}

/** Send resources (Allies panel): an amount of one resource (a Res id) to another player. */
export interface SendResourcesOrder {
  kind: 'sendResources';
  player: number;
  to: number;
  res: number;
  amount: number;
}

/**
 * Yes or No to a question one of the player's units or buildings asked
 * (Patch 2, round 3). It carries what the question was about, so Yes does
 * the same on every machine whether or not that machine still has the
 * question open: Yes runs the same code as the matching button's order.
 */
export interface AnswerOrder {
  kind: 'answer';
  player: number;
  /** The question's number (AskInfo.id), so it closes. */
  ask: number;
  /** 1 Yes, 0 No. */
  yes: number;
  /** Which question (units/questions.ts Ask, units/greyed.ts GreyAsk, units/work-asks.ts WorkAsk): 1 to 31. */
  q: number;
  /** Who asked: an entity id, or a building id for a building's question. */
  who: number;
  /** The units it spoke for (entity ids); empty for a building's. */
  units: number[];
  /** The resource it was about, or -1. */
  res: number;
  /** How many Yes makes (AskInfo.n), when the question says. */
  n?: number;
}

/**
 * A greyed-out button clicked (Patch 3): the build menu's buildings, a
 * building's training, making and research, its Upgrade. The units and
 * buildings best placed to sort out why it is greyed each ask their owner
 * (units/greyed.ts).
 */
export interface GreyedOrder {
  kind: 'greyed';
  player: number;
  /** What was clicked (units/greyed.ts Greyed): a building to place, a product, or a building's upgrade. */
  what: number;
  /** The building kind (a building to place) or the product; 0 for an upgrade. */
  id: number;
  /** The building whose button it is (a product or an upgrade), or 0. */
  building: number;
  /** The selected units: workers nearest them are asked first. */
  units: number[];
}

/**
 * The player leaves the match for good (the relay's leave marker, when the
 * host carries on without a player who is gone): their side is shared out
 * as if eliminated.
 */
export interface LeaveOrder {
  kind: 'leave';
  player: number;
}

export type Order =
  | AnswerOrder
  | GreyedOrder
  | PickOwnOrder
  | PickUpOrder
  | ForageOrder
  | ShareControlOrder
  | SendResourcesOrder
  | LeaveOrder
  | CastOrder
  | HuntOrder
  | TameOrder
  | EatOrder
  | HitchOrder
  | CrewOrder
  | MendOrder
  | ProspectOrder
  | RationsOrder
  | DontEatOrder
  | AttackOrder
  | AttackMoveOrder
  | PatrolOrder
  | HoldOrder
  | UpgradeKitOrder
  | UpgradeEquipmentOrder
  | CartOrder
  | TroopLockOrder
  | LockOrder
  | DigOrder
  | WallStretchOrder
  | TunnelStretchOrder
  | DebugGiveOrder
  | DebugSpawnOrder
  | DebugThreatOrder
  | TradeOfferOrder
  | TradeTakeOrder
  | TradeWithdrawOrder
  | DeclareWarOrder
  | SurrenderOrder
  | ReparationsOrder
  | HireOrder
  | DebugPeoplesOrder
  | DebugGodOrder
  | DebugPlaceOrder
  | DebugToolOrder
  | DebugKillOrder
  | MoveOrder
  | StopOrder
  | FollowOrder
  | GatherOrder
  | BuildOrder
  | WorkOrder
  | RepairAllOrder
  | AutoRepairOrder
  | RepairNearbyOrder
  | ReturnCargoOrder
  | DropoffOrder
  | EnterOrder
  | UnloadOrder
  | AssignOrder
  | RelightOrder
  | TrainRankOrder
  | RetrainOrder
  | ProduceOrder
  | CancelProduceOrder
  | UpgradeOrder
  | CancelBuildOrder
  | RallyOrder
  | EveryoneHomeOrder
  | TerrainOrder
  | DebugRevealOrder
  | DebugHarvestOrder;

export type OrderKindName = Order['kind'];

/** The orders of every player for one step. */
export interface InputFrame {
  step: number;
  orders: Order[];
}

/** A stable copy of the orders sorted by player; within a player the given order is kept. */
export function canonicalOrders(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => a.player - b.player);
}

/** A deep copy of an order (the input log keeps its own). */
export function copyOrder(o: Order): Order {
  if (o.kind === 'tradeOffer') return { ...o, goods: [...o.goods] };
  return 'units' in o ? { ...o, units: [...o.units] } : { ...o };
}

/** The integer fields each order kind must carry, besides player (and units, checked separately). */
const INT_FIELDS: Record<OrderKindName, readonly string[]> = {
  move: ['x', 'z'],
  stop: [],
  follow: ['target'],
  gather: ['cx', 'cz', 'index'],
  build: ['building', 'variant', 'x', 'z'],
  work: ['building'],
  repairAll: [],
  autoRepair: ['on'],
  repairNearby: [],
  returnCargo: [],
  dropoff: ['building'],
  enter: ['building'],
  unload: ['building', 'unit'],
  assign: ['building'],
  relight: ['building'],
  trainRank: ['building'],
  retrain: [],
  produce: ['building', 'product', 'count'],
  cancelProduce: ['building', 'index'],
  upgrade: ['building'],
  cancelBuild: ['building'],
  rally: ['building', 'x', 'z', 'id'],
  everyoneHome: [],
  terrain: ['x0', 'z0', 'x1', 'z1', 'bottom', 'top', 'material'],
  debugReveal: ['x', 'z', 'radius'],
  debugHarvest: ['cx', 'cz', 'index', 'amount'],
  attack: ['target'],
  attackMove: ['x', 'z'],
  patrol: ['x', 'z'],
  hold: [],
  upgradeKit: ['line', 'max'],
  upgradeEquipment: [],
  cart: ['back'],
  troopLock: ['building', 'troop', 'lock'],
  lock: ['lock'],
  dig: ['x0', 'z0', 'x1', 'z1', 'level', 'level2', 'tunnel'],
  wallStretch: ['building', 'x', 'z', 'dir', 'length', 'skip'],
  tunnelStretch: ['x', 'z', 'dir', 'length', 'level', 'level2'],
  debugGive: ['res', 'count'],
  debugSpawn: ['mob', 'x', 'z'],
  debugThreat: ['what', 'x', 'z'],
  hunt: ['target', 'auto'],
  cast: ['spell', 'target', 'x', 'z', 'auto'],
  tame: ['target'],
  eat: ['building'],
  hitch: ['target'],
  crew: ['target'],
  mend: ['target'],
  prospect: ['x', 'z'],
  rations: ['rations'],
  dontEat: ['res', 'on'],
  tradeOffer: ['faction'],
  tradeTake: ['faction', 'bundle'],
  tradeWithdraw: ['faction'],
  declareWar: ['faction'],
  surrender: ['faction', 'accept'],
  reparations: ['faction'],
  hire: ['faction', 'count'],
  debugPeoples: ['what', 'x', 'z'],
  debugGod: ['on'],
  debugPlace: ['what', 'x', 'z'],
  debugTool: ['tool', 'x', 'z'],
  debugKill: [],
  shareControl: ['with', 'on'],
  sendResources: ['to', 'res', 'amount'],
  leave: [],
  pickOwn: ['command'],
  pickUp: ['target'],
  forage: [],
  answer: ['ask', 'yes', 'q', 'who', 'res'],
  greyed: ['what', 'id', 'building'],
};

const WITH_UNITS = new Set<OrderKindName>(['move', 'stop', 'follow', 'gather', 'build', 'work', 'repairAll', 'autoRepair', 'returnCargo', 'dropoff', 'enter', 'assign', 'relight', 'trainRank', 'retrain', 'attack', 'attackMove', 'patrol', 'hold', 'upgradeKit', 'upgradeEquipment', 'cart', 'lock', 'dig', 'wallStretch', 'tunnelStretch', 'hunt', 'tame', 'eat', 'hitch', 'prospect', 'cast', 'crew', 'mend', 'pickOwn', 'pickUp', 'forage', 'answer', 'greyed', 'debugKill']);

/** Checks that an order holds only integers in range, so a bad script or a bad message fails loudly. */
export function validateOrder(o: Order): void {
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  if (!isInt(o.player) || o.player < 0 || o.player > 7) throw new Error(`bad player ${o.player}`);
  const fields = INT_FIELDS[o.kind];
  if (!fields) throw new Error(`unknown order kind ${String((o as { kind: unknown }).kind)}`);
  const rec = o as unknown as Record<string, unknown>;
  if (!fields.every((f) => isInt(rec[f]))) throw new Error(`${o.kind} order values must be integers`);
  if (WITH_UNITS.has(o.kind)) {
    const units = rec['units'];
    if (!Array.isArray(units) || !units.every(isInt)) throw new Error('order units must be entity ids');
    if (rec['queued'] !== undefined && typeof rec['queued'] !== 'boolean') throw new Error('queued must be true or false');
  }
  switch (o.kind) {
    case 'terrain':
      if (Math.abs(o.x1 - o.x0) > 64 || Math.abs(o.z1 - o.z0) > 64) throw new Error('a terrain edit covers at most 65 x 65 columns');
      if (o.top - o.bottom > 512 || o.material < 0 || o.material > 255) throw new Error('bad terrain edit range');
      return;
    case 'debugReveal':
      if (o.radius < 0 || o.radius > 2000 * 8000) throw new Error('reveal radius out of range');
      return;
    case 'produce':
      if (o.count < 1 || o.count > 5) throw new Error('produce count must be 1 to 5');
      return;
    case 'dig':
      if (Math.abs(o.x1 - o.x0) > 63 || Math.abs(o.z1 - o.z0) > 63) throw new Error('a dig covers at most 64 x 64 columns');
      return;
    case 'wallStretch':
      if (o.dir < 0 || o.dir > 7 || o.length < 0 || o.length > WALL_STRETCH_MAX_COLUMNS || (o.skip !== 0 && o.skip !== 1)) throw new Error(`a wall stretch runs 0 to ${WALL_STRETCH_MAX_COLUMNS} columns in one of 8 directions`);
      return;
    case 'tunnelStretch':
      if (o.dir < 0 || o.dir > 7 || o.length < 1 || o.length > TUNNEL_STRETCH_MAX_COLUMNS) throw new Error(`a tunnel stretch runs 1 to ${TUNNEL_STRETCH_MAX_COLUMNS} columns in one of 8 directions`);
      if (o.level2 - o.level < TUNNEL_MIN_UNITS || o.level2 - o.level > TUNNEL_MAX_UNITS) throw new Error(`a tunnel is ${TUNNEL_MIN_UNITS} to ${TUNNEL_MAX_UNITS} terrain units tall`);
      return;
    case 'debugGive':
      if (o.count < 1 || o.count > 100000 || o.res < 0 || o.res > 255) throw new Error('debug give out of range');
      return;
    case 'debugGod':
      if (o.on !== 0 && o.on !== 1) throw new Error('godmode is on or off');
      return;
    case 'autoRepair':
      if (o.on !== 0 && o.on !== 1) throw new Error('autorepair is on or off');
      return;
    case 'debugPlace':
      if (o.what < 0 || o.what > 0xffff) throw new Error('bad godmode placement');
      return;
    case 'debugTool':
      if (o.tool < DebugTool.MaxRank || o.tool > DebugTool.ElfKingdom) throw new Error('bad debug tool');
      return;
    case 'debugKill':
      if (o.units.length > 256) throw new Error('kill at most 256 units at once');
      return;
    case 'upgradeKit':
      if ((o.line !== 0 && o.line !== 1) || (o.max !== 0 && o.max !== 1)) throw new Error('bad upgrade');
      return;
    case 'cart':
      if (o.back !== 0 && o.back !== 1) throw new Error('bad cart order');
      return;
    case 'troopLock':
      if (o.troop < 1 || o.troop > 7 || o.lock < 0 || o.lock > 89) throw new Error('bad troop lock');
      return;
    case 'rations':
      if (o.rations < 0 || o.rations > 2) throw new Error('rations must be 0 to 2');
      return;
    case 'dontEat':
      if (o.res < 0 || o.res > 255 || (o.on !== 0 && o.on !== 1)) throw new Error('bad Don\'t eat toggle');
      return;
    case 'pickOwn':
      if (o.command < 0 || o.command > 3) throw new Error('bad pick-own command');
      return;
    case 'cast':
      if (o.spell < 0 || o.spell > 255 || (o.auto !== 0 && o.auto !== 1)) throw new Error('bad cast');
      return;
    case 'tradeOffer':
      if (!Array.isArray(o.goods) || o.goods.length % 2 !== 0 || o.goods.length > 32 || !o.goods.every((v) => isInt(v) && v >= 0 && v < 0x10000)) throw new Error('trade goods must be up to 16 pairs of good and count');
      return;
    case 'tradeTake':
      if (o.bundle < 0 || o.bundle > 2) throw new Error('a bundle is 0 to 2');
      return;
    case 'hire':
      if (o.count < 1 || o.count > 6) throw new Error('hire 1 to 6');
      return;
    case 'shareControl':
      if (o.with < 0 || o.with > 7 || (o.on !== 0 && o.on !== 1)) throw new Error('bad share control');
      return;
    case 'sendResources':
      if (o.to < 0 || o.to > 7 || o.res < 0 || o.res > 255 || o.amount < 1 || o.amount > 1_000_000_000) throw new Error('bad send resources');
      return;
    case 'answer':
      if ((o.yes !== 0 && o.yes !== 1) || o.q < 1 || o.q > 31 || o.units.length > 256 || o.res < -1 || o.res > 255) throw new Error('bad answer');
      if (o.n !== undefined && (!isInt(o.n) || o.n < 0 || o.n > 99)) throw new Error('bad answer');
      return;
    case 'greyed':
      if (o.what < 0 || o.what > 2 || o.id < 0 || o.id > 0xffff || o.units.length > 256) throw new Error('bad greyed-out click');
      return;
    case 'rally':
      if (typeof o.add !== 'boolean' || !['ground', 'unit', 'node'].includes(o.point)) throw new Error('bad rally point');
      return;
    default:
      return;
  }
}
