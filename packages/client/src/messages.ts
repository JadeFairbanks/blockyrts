// Messages between the page and the sim worker. Local to the client; the
// network protocol lives in @blockyrts/protocol.
import type { OutgoingFrame, WireFrame } from '@blockyrts/protocol';
import type { ChunkDelta, ClaimShapes, HitEvent, Order, RallyPoint, SimEvent, Site, UnitOrder } from '@blockyrts/sim';

/** An online match's lockstep set-up: this client's relay slot, each sim player's slot, the epoch, the playing slots and the input delay. */
export interface NetStart {
  slot: number;
  seats: number[];
  epoch: number;
  activeSlots: number;
  inputDelay: number;
  /** Joining a match under way: the first step this page still sends, and the frames already relayed. */
  nextFrameStep?: number | undefined;
  frames?: WireFrame[] | undefined;
}

export type ToWorker =
  /** A new world from the seed, or `snapshot` (the sim's serialised state) to carry on from; `player` is the local player's index. */
  | { type: 'start'; seed: number; players: number; player: number; snapshot?: Uint8Array | undefined; net?: NetStart | undefined }
  /** Replace the state with a snapshot and carry on from the relay's frames (a rejoin, or a reload after a desync). */
  | ({ type: 'load'; snapshot: Uint8Array; frames: WireFrame[]; nextFrameStep: number } & NetStart)
  /** A rejoin that keeps this state: the frames missed. */
  | { type: 'resume'; epoch: number; frames: WireFrame[]; nextFrameStep: number; activeSlots: number; inputDelay: number }
  | { type: 'frames'; frames: WireFrame[] }
  | { type: 'inputDelay'; steps: number }
  /** Alone: the menu's pause; online: the relay's. */
  | { type: 'pause'; paused: boolean }
  /** The state now, serialised, for a save or another player's rejoin. */
  | { type: 'snapshot'; id: number }
  | { type: 'order'; order: Order }
  /** Placement tiles for a building at these footprint corners (global columns); answered with 'placed'. */
  | { type: 'place'; id: number; kind: number; variant: number; spots: Array<[number, number]> }
  /** Debug: steps per tick multiplier (1, 4 or 16); alone only. */
  | { type: 'speed'; factor: number };

/**
 * Per-entity record in a state message (all int32): id, owner, kind, x, y, z,
 * heading, order, hp, maxHp, rank, chopping tool, carryRes, carryAmt, inside, act,
 * then what it fights with (mob kind, the gear in each slot, its troop type
 * and its weapon and armour tiers, the swing under way), its state flags,
 * lock, skills, an engine's shots left and target, an upgrade under way,
 * a hop under way, a worker's other tools by job and the one in its hand,
 * and a mage's school, mana, the spell she is casting, her beam and the
 * spells on her; the faction of one of the neutral peoples' units; what it
 * rides and the mount's health; an engine's crew standing by and whether
 * something hauls it; its meal and hunger; a timed action under way.
 */
export const STATE_STRIDE = 58;
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
  /** A worker's tool for each job (ToolJob: chop, break, build, cut), a gear id, or 0. */
  toolChop: 11,
  carryRes: 12,
  carryAmt: 13,
  inside: 14,
  act: 15,
  mob: 16,
  /** Gear ids (units/kits.ts GEAR) in the weapon, ranged, shield and armour slots. */
  weapon: 17,
  /** Troops: the type (Troop), fixed when trained; 0 for everything else. */
  troop: 18,
  ranged: 19,
  shield: 20,
  /** The weapon (tool kit, wand) and armour (robe) tiers of a troop, worker or mage. */
  wTier: 21,
  aTier: 22,
  /** 0, or 1 + the slot it is swinging or shooting with (Slot). */
  swing: 23,
  flags: 24,
  lock: 25,
  /**
   * A unit that ranks (worker, troop, mage): its experience and the
   * experience its next rank needs, whole points, both counted from nothing
   * as Table 1 writes them (a Hand has 50 or more and needs 150 for Master
   * worker); the need is 0 at the top rank, both 0 for what never ranks
   * (Patch 3, sim combat.ts rankXp). The middle HUD's XP bar reads them.
   * Before Patch 2, 26 and 27 held a warrior's trained skills and a cannon's
   * powder charges.
   */
  xp: 26,
  xpNext: 27,
  target: 28,
  armour: 29,
  /** An upgrade under way (Upgrading units): per mille of its bar (0 until the unit is beside the building), its line + 1 (0 for none) and the tier it goes to. */
  upDone: 30,
  upLine: 31,
  /** A worker's cart (Res.HandCart or Res.OxCart), or 0. */
  kit: 32,
  /** A worker's working animal, or an animal's worker (entity id), or 0. */
  partner: 33,
  upTo: 34,
  /** Steps left of a hop up or down a rise (Moving over the land), or 0, and the rise it makes, wu. */
  hop: 35,
  hopRise: 36,
  toolBreak: 37,
  toolBuild: 38,
  toolCut: 39,
  /** The tool a worker has in hand for what it is doing now (gear id), or 0. */
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
  /** The faction id of one of the peoples' units or buildings (also of one they left, and a hired mercenary), else its group. */
  group: 47,
  /** What the unit rides (Mount), or 0, and the mount's health and most. */
  mount: 48,
  mountHp: 49,
  mountMax: 50,
  /** Engines: the crew standing by it now, plus 1000 when a horse or ox hauls it. */
  crew: 51,
  /** A unit that eats: its meal in quarters of nutrition (economy/food.ts mealQuarters), or 0 for one that eats nothing; and the step it began starving, or 0. */
  meal: 52,
  hungry: 53,
  /** A timed action beside a building (Jade's Patch 2, sim units/tinker.ts): the steps done and the steps it takes, 0 when the unit is not sitting at one. */
  tinkerDone: 54,
  tinkerOf: 55,
  /** Close melee's shield tier (Patch 5, GP-26), and 1 when a bow or crossbow ranger has poison tips on. */
  sTier: 56,
  tips: 57,
} as const;

/** Bits of S.spells: what support spells (and a Stumble hex) are on a unit. */
export const SpellOn = { Quicken: 1, Fortify: 2, Rally: 4, Warding: 8, Healing: 16, Hexed: 32 } as const;

/** Bits of S.flags (OnTop: up on a tower or a main base's top, drawn there though it is inside). */
export const UnitFlag = { Climbing: 1, Fleeing: 2, Slowed: 4, Held: 8, Hurt: 16, Young: 32, Starving: 64, Male: 128, Charging: 256, Cloaked: 512, Swooping: 1024, Shared: 2048, OnTop: 4096, AutoRepair: 8192 } as const;

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

/** Explored fog tiles for these chunks, the whole side's (the players share what they explore): 16 x 16 bits each. */
export interface FogMessage {
  type: 'fog';
  chunks: Array<[number, number, Uint8Array]>;
}

/**
 * What the players' side sees now (the sim's visionSources): VISION_STRIDE
 * numbers per source, the owner, the rectangle x0, z0, x1, z1 it sees out
 * from (a point for a unit) and how far, all wu. Land within that reach of a
 * source is seen; every player sees all of it.
 */
export interface VisionMessage {
  type: 'vision';
  step: number;
  sources: Int32Array;
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
  /**
   * Production queue: product, and for the first only the per mille done and
   * the steps it has left at the sim's own pace now (0 while it is on hold);
   * a stack being scrapped (Patch 5) has `count`, how many are left with the
   * one under way.
   */
  queue: Array<{ product: number; done: number; stepsLeft: number; count?: number }>;
  rally: RallyPoint[];
  /** Lights: lit now (from Patch 2 a light burns without fuel until something puts it out). */
  lit: boolean;
  /** Workers assigned (farmers, mill hands) and at work now. */
  assigned: number;
  working: number;
  /** Units in it: sheltering inside, and up on its top (also in `up`). */
  inside: number[];
  /** The units up on its top (towers, a main base from tier 2), entity ids. */
  up: number[];
  /** The panel's status line. */
  status: string;
  name: string;
  /** Own buildings: why the next level cannot be ordered now, or ''. */
  upgradeWhy: string;
  /** Own finished buildings: everything they make, with why it cannot be queued now ('' when it can). */
  products: Array<[number, string]>;
  /** Inherited from a player who left: every player still in may use it (When a player is eliminated or leaves). */
  shared: boolean;
  /** Mineshafts: what is dug out and waits for the next miner's bag (Patch 2), and the prospect rating (0 unknown, else 1 + Rating). */
  stock: Array<[number, number]>;
  rating: number;
  /** Barns: animals that live there. */
  herd: number;
  /**
   * Barracks and main bases (own and usable): each troop type it
   * trains, with the panel's default weapon and armour tiers (the Lock's
   * combination, else the best the stock pays for; close melee's shield
   * after them from Patch 5) and the Lock (0 off, else 1 + shield x 100 +
   * weapon x 10 + armour).
   */
  troops: Array<{ troop: number; w: number; a: number; s: number; lock: number }>;
  /**
   * A Magi Sanctum (own and usable): each school it trains on its cards
   * (Patch 2), with the default wand and robe tiers (the padlock's kit, else
   * the best the stock pays for, wand first) and the padlock, as `troops`.
   */
  mages?: Array<{ school: number; w: number; a: number; lock: number }>;
  /** Barracks: tamed, grown horses free in the nearest Barn that has one (each new cavalry takes one, Patch 2). */
  horses: number;
  /** Finished farms: the harvest the panel's progress bar fills towards, or null (production.ts farmHarvest). */
  farm: FarmInfo | null;
}

/** A farm's next harvest as the panel shows it (Jade, patch notes 1). */
export interface FarmInfo {
  /** What comes in: the resource, how many, and their food value. */
  res: number;
  items: number;
  food: number;
  /** False where nothing comes in: no bar, only the band line. */
  grows: boolean;
  /** The bar filled, per mille, and the steps until it is full at the present pace (0 while it stands still). */
  done: number;
  stepsLeft: number;
  /** The band the Farm stands in (Patch 2: full yield in every band), or ''. */
  band: string;
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
  /** Research done, a bit per Research id, and the Forge step the town is at (what kit tiers need: sim forgeStep). */
  research: number;
  forge: number;
  /** Dig and tunnel sites of the local player. */
  sites: Site[];
  /** The step the game ended (0 while it goes on), and the nights survived. */
  over: number;
  nights: number;
  /** The local player is out of the game. */
  out: boolean;
  /**
   * F9 Rations (0 everyone, 1 troops only, 2 workers only), the foods kept
   * back with Don't eat, what is left of each food's started item (quarters
   * of nutrition, by resource), and who is starving.
   */
  rations: number;
  kept: number[];
  open: Int32Array;
  starveWorkers: boolean;
  starveTroops: boolean;
  /** Whether a fog night lies now. */
  fog: boolean;
  /** The debugger's godmode is on for the local player (Jade's Patch 5); absent when it is off. */
  god?: boolean;
  /** Destroyed lairs: the lair's mob kind and where it stood, wu. */
  ruins: Array<[number, number, number]>;
  /** Every standing lair (Patch 3: explored land or not) and the goblin villages the players have seen, for the minimap (wu). */
  marks: ThreatMark[];
  /** The local player's mages: per mage id, each spell of her school with why it cannot be cast now ('' when it can) and the steps until it is ready. */
  spells: Array<[number, Array<[number, string, number]>]>;
  /** The local player's mages: why each cannot start her next rank training for her experience or rank, or ''. */
  mageRanks: Array<[number, string]>;
  /** The neutral peoples the local player has seen, met or is at war with. */
  peoples: PeopleInfo[];
  /** Every player by sim index: whom they share control with (a bit per player), and whether they are out. */
  players: Array<{ share: number; out: boolean }>;
  /** Loot lying on explored ground (Jade's play-test notes): what and how much, where (wu), and whether the local player's side picks it up by itself. */
  loot: LootInfo[];
  /** The local player's units' loot bags: per unit id, (resource, count) pairs. */
  bags: Array<[number, Array<[number, number]>]>;
}

/** A piece of loot on the ground as the screen sees it. */
export interface LootInfo {
  id: number;
  res: number;
  amt: number;
  /** wu */
  x: number;
  y: number;
  z: number;
  /** The local player's side's (or anyone's): its units pick it up by themselves. */
  own: boolean;
}

/** One of the neutral peoples' factions as the local player knows it (the trade menu and the Peoples panel). */
export interface PeopleInfo {
  id: number;
  /** FactionKind, People and Status. */
  kind: number;
  people: number;
  status: number;
  /** "Appledell (Halfling village)", and its specialisation ('' for none). */
  title: string;
  lean: string;
  /** Its middle, wu. */
  x: number;
  z: number;
  war: boolean;
  met: boolean;
  traded: boolean;
  /** The leader's entity id (right click to trade), or 0. */
  leader: number;
  /** Fighters standing, people standing, and how many it had. */
  fighters: number;
  standing: number;
  founded: number;
  /** It offers the local player its surrender. */
  surrender: boolean;
  /** Dwarves at war: the reparations owed, tenths of a value point; else 0. */
  owed: number;
  /** Why the trade menu cannot open now ('' when it can). */
  tradeWhy: string;
  /** What it sells today: (good, count) pairs. */
  stock: number[];
  /** What it pays, percent of value, by trade category (-1 refused). */
  wants: number[];
  /** What is left of its day of trade, shared by every player, and the whole day's, tenths (Patch 5, GP-46). */
  room: number;
  day: number;
  /** What it pays for each good the local player has (good, percent) pairs, refused -1. */
  pays: number[];
  /** The local player's open offer and its three answers. */
  offer: { goods: number[]; worth: number; bundles: number[][] } | null;
  /** Mercenary camps: how many are there to hire now and when full, why none can be hired now ('' when they can), and a head's price in silver or in gold. */
  hire: { left: number; size: number; why: string; silver: number; gold: number } | null;
  /** An Elf caravan come to the local player's main base. */
  visiting: boolean;
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

/** The worker's online traffic: this player's frames to send, a hash to report, who a stalled step waits on. */
export type NetMessage =
  | { type: 'frames'; frames: OutgoingFrame[] }
  | { type: 'hash'; epoch: number; step: number; hash: number }
  | { type: 'waiting'; slots: number[]; step: number };

/** A serialised state: asked for (snapshot), or the dawn autosave. */
export interface SnapshotMessage {
  type: 'snapshot' | 'dawn';
  id?: number;
  step: number;
  night: number;
  data: Uint8Array;
}

export type FromWorker = StateMessage | DeltasMessage | FogMessage | VisionMessage | InfoMessage | PlacedMessage | NetMessage | SnapshotMessage;
