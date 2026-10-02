// Player orders. In lockstep every player sends the orders for step N in one
// frame; the sim applies them at the start of step N in a fixed order (player
// index, then the order each player gave them in). Every order is plain
// integers (and booleans), so it checks, copies and travels easily.

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

/** Refuel or relight a light. */
export interface RefuelOrder extends UnitsOrder {
  kind: 'refuel';
  building: number;
}

/** Train workers to the next rank at a main base (Table 7). */
export interface TrainRankOrder extends UnitsOrder {
  kind: 'trainRank';
  building: number;
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
}

/** Q Equip Best. */
export interface EquipBestOrder {
  kind: 'equipBest';
  player: number;
  units: number[];
}

/** The equipment panel (I): one item (or 0 to take it off) for one slot of one unit. */
export interface EquipItemOrder {
  kind: 'equipItem';
  player: number;
  unit: number;
  slot: number;
  item: number;
}

/** F4 Auto-Equip on (1) or off (0). */
export interface AutoEquipOrder {
  kind: 'autoEquip';
  player: number;
  on: number;
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

/** Earthworks: variant 0 an earth bank, 1 an earth ramp (level at x0/z0's end to level2 at the far end along axis), 2 fill, 3 a lumber ramp, 4 a stone ramp. */
export interface EarthworkOrder extends UnitsOrder {
  kind: 'earthwork';
  variant: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  level: number;
  level2: number;
  axis: number;
}

/** Specialist training at a building (Table 7: Archery at the Barracks is skill 1). */
export interface TrainSkillOrder extends UnitsOrder {
  kind: 'trainSkill';
  building: number;
  skill: number;
}

/** Debug: puts items into a player's equipment stock. */
export interface DebugGiveOrder {
  kind: 'debugGive';
  player: number;
  item: number;
  count: number;
}

/** Debug: a threat at a point (wu) for the player: a lair, a goblin village, a tribe's band, a territorial creature, a blood night or fog (threats/debug.ts DebugThreat). */
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

/** N Hunt an animal; auto (double-tapped) keeps hunting game near where each warrior stands. Workers in the selection haul. */
export interface HuntOrder extends UnitsOrder {
  kind: 'hunt';
  /** The animal, or 0 with auto for the nearest game. */
  target: number;
  auto: number;
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

/** Milestone 8: warriors trained to ride mount tamed horses (target: one horse; 0: each the nearest free one). */
export interface MountOrder extends UnitsOrder {
  kind: 'mount';
  target: number;
}

/** Riders get down and their horses go back to their Stables. */
export interface DismountOrder extends UnitsOrder {
  kind: 'dismount';
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

/** Haul what waits at a mineshaft to the drop-offs, over and over. */
export interface HaulOrder extends UnitsOrder {
  kind: 'haul';
  building: number;
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

export type Order =
  | CastOrder
  | HuntOrder
  | TameOrder
  | EatOrder
  | HitchOrder
  | MountOrder
  | DismountOrder
  | CrewOrder
  | MendOrder
  | ProspectOrder
  | HaulOrder
  | RationsOrder
  | DontEatOrder
  | AttackOrder
  | AttackMoveOrder
  | PatrolOrder
  | HoldOrder
  | EquipBestOrder
  | EquipItemOrder
  | AutoEquipOrder
  | LockOrder
  | DigOrder
  | EarthworkOrder
  | TrainSkillOrder
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
  | MoveOrder
  | StopOrder
  | FollowOrder
  | GatherOrder
  | BuildOrder
  | WorkOrder
  | RepairAllOrder
  | ReturnCargoOrder
  | DropoffOrder
  | EnterOrder
  | UnloadOrder
  | AssignOrder
  | RefuelOrder
  | TrainRankOrder
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
  returnCargo: [],
  dropoff: ['building'],
  enter: ['building'],
  unload: ['building', 'unit'],
  assign: ['building'],
  refuel: ['building'],
  trainRank: ['building'],
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
  equipBest: [],
  equipItem: ['unit', 'slot', 'item'],
  autoEquip: ['on'],
  lock: ['lock'],
  dig: ['x0', 'z0', 'x1', 'z1', 'level', 'level2', 'tunnel'],
  earthwork: ['variant', 'x0', 'z0', 'x1', 'z1', 'level', 'level2', 'axis'],
  trainSkill: ['building', 'skill'],
  debugGive: ['item', 'count'],
  debugSpawn: ['mob', 'x', 'z'],
  debugThreat: ['what', 'x', 'z'],
  hunt: ['target', 'auto'],
  cast: ['spell', 'target', 'x', 'z', 'auto'],
  tame: ['target'],
  eat: ['building'],
  hitch: ['target'],
  mount: ['target'],
  dismount: [],
  crew: ['target'],
  mend: ['target'],
  prospect: ['x', 'z'],
  haul: ['building'],
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
};

const WITH_UNITS = new Set<OrderKindName>(['move', 'stop', 'follow', 'gather', 'build', 'work', 'repairAll', 'returnCargo', 'dropoff', 'enter', 'assign', 'refuel', 'trainRank', 'attack', 'attackMove', 'patrol', 'hold', 'equipBest', 'lock', 'dig', 'earthwork', 'trainSkill', 'hunt', 'tame', 'eat', 'hitch', 'prospect', 'haul', 'cast', 'mount', 'dismount', 'crew', 'mend']);

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
    case 'earthwork':
      if (Math.abs(o.x1 - o.x0) > 63 || Math.abs(o.z1 - o.z0) > 63) throw new Error('a dig covers at most 64 x 64 columns');
      return;
    case 'debugGive':
      if (o.count < 1 || o.count > 1000) throw new Error('debug give count out of range');
      return;
    case 'rations':
      if (o.rations < 0 || o.rations > 2) throw new Error('rations must be 0 to 2');
      return;
    case 'dontEat':
      if (o.res < 0 || o.res > 255 || (o.on !== 0 && o.on !== 1)) throw new Error('bad Don\'t eat toggle');
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
    case 'rally':
      if (typeof o.add !== 'boolean' || !['ground', 'unit', 'node'].includes(o.point)) throw new Error('bad rally point');
      return;
    default:
      return;
  }
}
