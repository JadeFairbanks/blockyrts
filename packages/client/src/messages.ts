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
 * heading, order, hp, maxHp, rank, tool, carryRes, carryAmt, inside, act,
 * then what it fights with (mob kind, the items in each slot, a lit torch,
 * the swing under way), its state flags, lock, skills, shots left and target.
 */
export const STATE_STRIDE = 34;
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
  tool: 11,
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
} as const;

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
}

export interface PlacedMessage {
  type: 'placed';
  id: number;
  kind: number;
  /** Per spot: its corner, a tile per footprint column (0 free, else a Blocked reason) and the first reason. */
  spots: Array<{ x: number; z: number; tiles: Uint8Array; blocked: number }>;
}

export type FromWorker = StateMessage | DeltasMessage | FogMessage | InfoMessage | PlacedMessage;
