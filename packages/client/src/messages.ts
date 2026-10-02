// Messages between the page and the sim worker. Local to the client; the
// network protocol lives in @blockyrts/protocol.
import type { ChunkDelta, ClaimShapes, HitEvent, Order, RallyPoint, SimEvent, Site, UnitOrder } from '@blockyrts/sim';

export type ToWorker =
  | { type: 'start'; seed: number; players: number }
  | { type: 'order'; order: Order }
  /** Placement tiles for a building at these footprint corners (global columns); answered with 'placed'. */
  | { type: 'place'; id: number; kind: number; variant: number; spots: Array<[number, number]> }
  /** Debug: steps per tick multiplier (1, 4 or 16). */
  | { type: 'speed'; factor: number };

/**
 * Per-entity record in a state message (all int32): id, owner, kind, x, y, z,
 * heading, order, hp, maxHp, rank, chopping tool, carryRes, carryAmt, inside, act,
 * then what it fights with (mob kind, the items in each slot, a lit torch,
 * the swing under way), its state flags, lock, skills, shots left and target,
 * a hop under way, a worker's other tools by job and the one in its hand,
 * and a mage's school, mana, the spell she is casting, her beam and the
 * spells on her.
 */
export const STATE_STRIDE = 47;
export const S = {
  id: 0,
  owner: 1,
  kind: 2,
  x: 3,
  y: 4,
  z: 5,
  heading: 6,
  order: 7,
  hp: 8,
  maxHp: 9,
  rank: 10,
  /** A worker's tool item for each job (ToolJob: chop, break, build, cut), or 0. */
  toolChop: 11,
  carryRes: 12,
  carryAmt: 13,
  inside: 14,
  act: 15,
  mob: 16,
  weapon: 17,
  backup: 18,
  ranged: 19,
  shield: 20,
  boots: 21,
  torch: 22,
  /** 0, or 1 + the slot it is swinging or shooting with (Slot). */
  swing: 23,
  flags: 24,
  lock: 25,
  skills: 26,
  ammo: 27,
  target: 28,
  armour: 29,
  helmet: 30,
  boltCase: 31,
  kit: 32,
  /** A worker's working animal, or an animal's worker (entity id), or 0. */
  partner: 33,
  /** The arrows or bolts loaded (Item), or 0. */
  ammoItem: 34,
  /** Steps left of a hop up or down a rise (Moving over the land), or 0, and the rise it makes, wu. */
  hop: 35,
  hopRise: 36,
  toolBreak: 37,
  toolBuild: 38,
  toolCut: 39,
  /** The tool item a worker has in hand for what it is doing now, or 0. */
  toolHand: 40,
  /** Mages: support or battle (School), mana and the bar's most (whole points). */
  school: 41,
  mana: 42,
  maxMana: 43,
  /** 0, or 1 + the spell being cast (Spell). */
  cast: 44,
  /** The unit a Beam is held on (entity id), or 0. */
  beam: 45,
  /** Spells on the unit now (SpellOn bits). */
  spells: 46,
} as const;

/** Bits of S.spells: what support spells (and a Stumble hex) are on a unit. */
export const SpellOn = { Quicken: 1, Fortify: 2, Rally: 4, Warding: 8, Healing: 16, Hexed: 32 } as const;

/** Bits of S.flags. */
export const UnitFlag = { Climbing: 1, Fleeing: 2, Slowed: 4, Held: 8, Hurt: 16, Young: 32, Starving: 64, Male: 128 } as const;

/** Per projectile in a state message (int32): where it is, where it will be next step (wu), its Shot and flags. */
export const SHOT_STRIDE = 8;

export interface StateMessage {
  type: 'state';
  step: number;
  /** Latest desync hash and the step it was taken at. */
  hash: number;
  hashStep: number;
  count: number;
  /** count * STATE_STRIDE int32 values, transferred. */
  data: Int32Array;
  /** Projectiles in flight: SHOT_STRIDE int32 values each, transferred. */
  shots: Int32Array;
  /** Hits, swings and deaths since the last state message, for particles and sounds. */
  hits: HitEvent[];
}

/** Land, water or props changed in these chunks; the mesh workers apply them to their mirror worlds. */
export interface DeltasMessage {
  type: 'deltas';
  step: number;
  deltas: ChunkDelta[];
}

/** Explored fog tiles of the local player for these chunks: 16 x 16 bits each. */
export interface FogMessage {
  type: 'fog';
  chunks: Array<[number, number, Uint8Array]>;
}

/** A building as the screen sees it. */
export interface BuildingInfo {
  id: number;
  owner: number;
  kind: number;
  variant: number;
  level: number;
  /** Footprint corner, global columns, and floor level in terrain units. */
  x: number;
  z: number;
  y: number;
  hp: number;
  maxHp: number;
  complete: boolean;
  /** Construction done, per mille. */
  built: number;
  /** Level being built as an upgrade, or 0, and how far, per mille. */
  upgrading: number;
  upgraded: number;
  /** Production queue: product and per mille done (the first only). */
  queue: Array<{ product: number; done: number }>;
  rally: RallyPoint[];
  /** Lights: lit now, and steps of fuel left. */
  lit: boolean;
  fuelLeft: number;
  /** Workers assigned (farmers, mill hands) and at work now. */
  assigned: number;
  working: number;
  /** Units sheltering inside. */
  inside: number[];
  /** The panel's status line. */
  status: string;
  name: string;
  /** Own buildings: why the next level cannot be ordered now, or ''. */
  upgradeWhy: string;
  /** Own finished buildings: everything they make, with why it cannot be queued now ('' when it can). */
  products: Array<[number, string]>;
  /** Mineshafts: what waits to be hauled, and the prospect rating (0 unknown, else 1 + Rating). */
  stock: Array<[number, number]>;
  rating: number;
  /** Livestock farms and the Stables: animals that live there. */
  herd: number;
}

/** Everything else the screen shows, once per tick. */
export interface InfoMessage {
  type: 'info';
  step: number;
  pool: Int32Array;
  supplyUsed: number;
  supplyCap: number;
  buildings: BuildingInfo[];
  /** The local player's units' order lists. */
  queues: Array<[number, UnitOrder[]]>;
  /** What happened since the last info, for the local player. */
  events: SimEvent[];
  /** The local player's claimed land, wu. */
  claims: ClaimShapes;
  /** Outlying lights (halves) against the coming night's limit. */
  outlying: { halves: number; limit: number };
  /** Per building kind: why the local player cannot order one at all, or ''. */
  buildWhy: string[];
  /** The equipment stock by item id. */
  items: Int32Array;
  /** Research done, a bit per Research id. */
  research: number;
  autoEquip: boolean;
  /** Dig and earthwork sites of the local player. */
  sites: Site[];
  /** The step the game ended (0 while it goes on), and the nights survived. */
  over: number;
  nights: number;
  /** The local player is out of the game. */
  out: boolean;
  /** F9 Rations (0 everyone, 1 troops only, 2 workers only), the Don't eat bits (one per FOODS entry), and who is starving. */
  rations: number;
  dontEat: number;
  starveWorkers: boolean;
  starveTroops: boolean;
  /** Blood nights called so far (they shift the clock), and whether a fog night lies now. */
  blood: number[];
  fog: boolean;
  /** Destroyed lairs: the lair's mob kind and where it stood, wu. */
  ruins: Array<[number, number, number]>;
  /** Lairs and goblin villages the local player has seen, for the minimap (wu). */
  marks: ThreatMark[];
  /** The local player's mages: per mage id, each spell of her school with why it cannot be cast now ('' when it can) and the steps until it is ready. */
  spells: Array<[number, Array<[number, string, number]>]>;
  /** The local player's mages: why each cannot start her next rank training for her experience or rank, or ''. */
  mageRanks: Array<[number, string]>;
}

/** A lair (its mob kind) or a goblin village (mob -1) on the minimap; war: the village is at war with the local player. */
export interface ThreatMark {
  mob: number;
  x: number;
  z: number;
  war: boolean;
}

export interface PlacedMessage {
  type: 'placed';
  id: number;
  kind: number;
  /** Per spot: its corner, a tile per footprint column (0 free, else a Blocked reason) and the first reason. */
  spots: Array<{ x: number; z: number; tiles: Uint8Array; blocked: number }>;
}

export type FromWorker = StateMessage | DeltasMessage | FogMessage | InfoMessage | PlacedMessage;
