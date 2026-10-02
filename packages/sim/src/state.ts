// The simulation state. Units live in struct-of-arrays typed arrays and are
// always iterated by index, so every machine visits them in the same order;
// each unit's order list and path are plain integer arrays beside them.
// Buildings are records in id order (buildings/store.ts) and every player
// has one shared resource pool.

import { BuildingKind, BUILDING_SIGHT_M, buildingSpec, footprintDims, levelSpec } from './buildings/data.ts';
import { BuildingStore, footprintRect, solidRect, type Building } from './buildings/store.ts';
import { RESOURCE_COUNT, STARTING_STOCK } from './economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from './fixed.ts';
import { NavGrid } from './nav/grid.ts';
import { Pathfinder } from './nav/path.ts';
import { createStreams, hash32, type Streams } from './rng.ts';
import type { UnitOrder } from './units/unit-orders.ts';
import { Tool } from './world/props.ts';
import { World } from './world/world.ts';

/** Owner value for entities that belong to no player. */
export const NEUTRAL = 255;

/**
 * What a unit is doing, for the renderer's animation: idle, walking, or one
 * of the work clips. Idle and Move keep M0's values.
 */
export const OrderKind = {
  Idle: 0,
  Move: 1,
  /** Chopping a tree or building (the worker's chop clip). */
  Chop: 2,
  /** Working a rock, quarrying. */
  Mine: 3,
  /** Hoeing a field or picking plants. */
  Farm: 4,
  /** Swimming. */
  Swim: 5,
  /** Walking with a load. */
  Carry: 6,
} as const;
export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

/** What an entity is. Warriors join in M3; wanderers are M0's test of the RNG streams. */
export const UnitKind = {
  Worker: 0,
  Warrior: 1,
  Wanderer: 2,
} as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

/** Sight in wu by kind (Table 1: worker 20 m, warrior 24 m; suggested). */
export const SIGHT_WU = [20 * WU_PER_METRE, 24 * WU_PER_METRE, 12 * WU_PER_METRE] as const;

/** Walking speed of a worker: 3 m/s, as wu per step (1,200). */
export const WALK_SPEED_WU = floorDiv(3 * WU_PER_METRE, STEPS_PER_SECOND);

/** Table 1, worker rank 1 (Labourer): 60 health. */
export const WORKER_HEALTH = 60;

type Column = Uint32Array | Int32Array | Uint16Array | Uint8Array;
type ColumnType = 'u32' | 'i32' | 'u16' | 'u8';

/** Every per-unit scalar, with its storage type; serialisation and the desync diff walk this list. */
export const UNIT_FIELDS = [
  ['id', 'u32'],
  ['owner', 'u8'],
  ['kind', 'u8'],
  /** Position in wu; x east, y up, z south (three.js axes). */
  ['x', 'i32'],
  ['y', 'i32'],
  ['z', 'i32'],
  /** 16-bit heading; 0 faces -Z. */
  ['heading', 'u16'],
  /** Speed in wu per step. */
  ['speed', 'i32'],
  /** OrderKind: what it looks like it is doing. */
  ['order', 'u8'],
  /** Where its current path ends, wu. */
  ['targetX', 'i32'],
  ['targetZ', 'i32'],
  /** For wanderers: the step at which a new destination is chosen; 0 means never. */
  ['wanderAt', 'u32'],
  ['hp', 'i32'],
  ['maxHp', 'i32'],
  /** Rank 1 to 5 (Table 1). */
  ['rank', 'u8'],
  /** Tool tier (props.ts Tool); every worker starts with hardwood tools. */
  ['tool', 'u8'],
  /** What it carries (a resource id) and how much; carryRes 255 when empty. */
  ['carryRes', 'u8'],
  ['carryAmt', 'u16'],
  /** The building it is inside, or 0. */
  ['inside', 'u32'],
  /** Phase of the current order (behaviour.ts Act). */
  ['act', 'u8'],
  /** Work done towards the current job, steps. */
  ['timer', 'i32'],
  /** The node it last gathered from, to go back to after a drop-off; nodeI -1 for none. */
  ['nodeCx', 'i32'],
  ['nodeCz', 'i32'],
  ['nodeI', 'i32'],
  /** Next waypoint in its path. */
  ['pathAt', 'u16'],
  /** 1 when its path reaches the goal, 0 when it only gets as near as it can. */
  ['pathOk', 'u8'],
  /** Failed path attempts in a row. */
  ['stuck', 'u8'],
  /** Step at which to try again when waiting. */
  ['waitUntil', 'u32'],
] as const satisfies ReadonlyArray<readonly [string, ColumnType]>;

type FieldName = (typeof UNIT_FIELDS)[number][0];

function makeColumn(t: ColumnType, n: number): Column {
  switch (t) {
    case 'u32':
      return new Uint32Array(n);
    case 'i32':
      return new Int32Array(n);
    case 'u16':
      return new Uint16Array(n);
    case 'u8':
      return new Uint8Array(n);
  }
}


/** No resource carried. */
export const NO_CARRY = 255;

export class EntityStore implements Record<FieldName, Column> {
  declare id: Uint32Array;
  declare owner: Uint8Array;
  declare kind: Uint8Array;
  declare x: Int32Array;
  declare y: Int32Array;
  declare z: Int32Array;
  declare heading: Uint16Array;
  declare speed: Int32Array;
  declare order: Uint8Array;
  declare targetX: Int32Array;
  declare targetZ: Int32Array;
  declare wanderAt: Uint32Array;
  declare hp: Int32Array;
  declare maxHp: Int32Array;
  declare rank: Uint8Array;
  declare tool: Uint8Array;
  declare carryRes: Uint8Array;
  declare carryAmt: Uint16Array;
  declare inside: Uint32Array;
  declare act: Uint8Array;
  declare timer: Int32Array;
  declare nodeCx: Int32Array;
  declare nodeCz: Int32Array;
  declare nodeI: Int32Array;
  declare pathAt: Uint16Array;
  declare pathOk: Uint8Array;
  declare stuck: Uint8Array;
  declare waitUntil: Uint32Array;
  count = 0;
  capacity: number;
  /** Each unit's orders; the first is the current one. */
  queue: UnitOrder[][] = [];
  /** Each unit's path: waypoints as x, z pairs in wu. */
  path: number[][] = [];

  private readonly index = new Map<number, number>();

  constructor(capacity = 64) {
    this.capacity = capacity;
    for (const [name, t] of UNIT_FIELDS) (this as unknown as Record<string, Column>)[name] = makeColumn(t, capacity);
  }

  private grow(): void {
    const cap = this.capacity * 2;
    for (const [name, t] of UNIT_FIELDS) {
      const next = makeColumn(t, cap);
      next.set(this[name] as never);
      (this as unknown as Record<string, Column>)[name] = next;
    }
    this.capacity = cap;
  }

  /** Appends an entity and returns its index. */
  add(id: number, owner: number, x: number, y: number, z: number, speed: number, kind: number = UnitKind.Worker): number {
    if (this.count === this.capacity) this.grow();
    const i = this.count++;
    for (const [name] of UNIT_FIELDS) this[name][i] = 0;
    this.id[i] = id;
    this.owner[i] = owner;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.speed[i] = speed;
    this.order[i] = OrderKind.Idle;
    this.hp[i] = WORKER_HEALTH;
    this.maxHp[i] = WORKER_HEALTH;
    this.rank[i] = 1;
    this.tool[i] = kind === UnitKind.Worker ? Tool.Hardwood : Tool.None;
    this.carryRes[i] = NO_CARRY;
    this.nodeI[i] = -1;
    this.pathOk[i] = 1;
    this.queue[i] = [];
    this.path[i] = [];
    this.index.set(id, i);
    return i;
  }

  /** Removes an entity, keeping the others in the same order. */
  remove(id: number): void {
    const i = this.indexOf(id);
    if (i < 0) return;
    for (const [name] of UNIT_FIELDS) {
      const a = this[name];
      a.copyWithin(i, i + 1, this.count);
    }
    this.queue.splice(i, 1);
    this.path.splice(i, 1);
    this.count--;
    this.reindex();
  }

  /** Index of an entity id, or -1. */
  indexOf(id: number): number {
    return this.index.get(id) ?? -1;
  }

  /** Rebuilds the id lookup after the arrays were filled directly. */
  reindex(): void {
    this.index.clear();
    for (let i = 0; i < this.count; i++) this.index.set(this.id[i]!, i);
  }
}

/** One player's side: the shared resource pool (Resources: all resources go into one shared pool). */
export interface PlayerState {
  pool: Int32Array;
}

/** Something the players should hear about: the message panel's alerts, built-and-trained notes, the idle gatherer cue. */
export interface SimEvent {
  /** Player it is for, or -1 for everyone. */
  player: number;
  kind: 'alert' | 'info' | 'idle' | 'period';
  text: string;
  /** Where it happened, wu (the Space key jumps there); absent for none. */
  x?: number;
  z?: number;
}

export interface SimState {
  seed: number;
  step: number;
  nextEntityId: number;
  rng: Streams;
  entities: EntityStore;
  /** The land: generated from the seed, plus every change players made. */
  world: World;
  players: PlayerState[];
  buildings: BuildingStore;
  /** Coarse tiles inside barrier-enclosed regions that hold a player building (claimed land), sorted; recomputed at dusk and when buildings finish. */
  enclosed: number[];
  /** Not state: the walk map and pathfinder over the land and buildings (pure caches). */
  nav: NavGrid;
  paths: Pathfinder;
  /** Not state: what happened this step, for the players' message panels. */
  events: SimEvent[];
}

export interface WorldOptions {
  /** Players, 1 to 8: the start basin's size and one pocket each (Table 9). */
  players?: number;
  /** Workers each player starts with: 4 (Premise, Starting setup). */
  playerUnits?: number;
  /** Neutral units that wander on their own, drawing on the 'ai' stream (M0's test of the streams). */
  wanderers?: number;
  /** Start without the Big House (tests). */
  noBase?: boolean;
}

/** Fresh nav caches over a state's world and buildings. */
export function attachNav(state: Omit<SimState, 'nav' | 'paths' | 'events'> & Partial<SimState>): SimState {
  const nav = new NavGrid(state.world, state.buildings);
  const s = state as SimState;
  s.nav = nav;
  s.paths = new Pathfinder(nav);
  s.events = [];
  state.world.builtOn = (x, z) => state.buildings.footprintAt(x, z) !== 0;
  return s;
}

/** Adds a building record with the next id. */
export function placeBuilding(state: SimState, owner: number, kind: number, variant: number, x: number, z: number, complete: boolean): Building {
  const spec = footprintDims(kind, variant);
  // The floor stands at the height of the footprint's middle column.
  const y = state.world.topAt(x + (spec.w >> 1), z + (spec.d >> 1));
  const b: Building = {
    id: state.nextEntityId++,
    owner,
    kind,
    variant,
    level: 1,
    x,
    z,
    y,
    hp: complete ? levelSpec(kind, 1).health : 0,
    progress: 0,
    complete,
    upgrading: 0,
    upProgress: 0,
    repairAcc: 0,
    queue: [],
    rally: [],
    fuelUntil: 0,
    doneAt: complete ? state.step : 0,
    farmAcc: 0,
    alerted: 0,
  };
  const [x0, z0, x1, z1] = footprintRect(b);
  state.world.clearProps(x0, z0, x1, z1);
  state.buildings.add(b, (key) => state.world.touchNav(key));
  // Units standing where its solid part goes step out to its south side.
  const [sx0, sz0, sx1, sz1] = solidRect(b);
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.inside[i] !== 0) continue;
    const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
    const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
    if (cx < sx0 || cx > sx1 || cz < sz0 || cz > sz1) continue;
    e.z[i] = (sz1 + 1) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    e.y[i] = standY(state, e.x[i]!, e.z[i]!);
    e.path[i] = [];
    e.pathOk[i] = 2;
  }
  return b;
}

/**
 * Builds a new game: the world from the seed and player count, and in each
 * player's pocket a level 1 Big House with four workers round it, hardwood
 * tools and the starting stock (Premise, Starting setup; Table 6 and 9).
 */
export function createWorld(seed: number, options: WorldOptions = {}): SimState {
  const playerUnits = options.playerUnits ?? 4;
  const wanderers = options.wanderers ?? 0;
  const world = new World(seed, options.players ?? 1);
  const state = attachNav({
    seed: seed >>> 0,
    step: 0,
    nextEntityId: 1,
    rng: createStreams(seed),
    entities: new EntityStore(),
    world,
    players: [],
    buildings: new BuildingStore(),
    enclosed: [],
  });
  for (let p = 0; p < world.players; p++) {
    const pool = new Int32Array(RESOURCE_COUNT);
    for (const [res, n] of STARTING_STOCK) pool[res] = n;
    state.players.push({ pool });
  }
  // Workers first, so each player's units have the lowest ids (1 to 4 for the first player).
  for (const pocket of world.gen.start.pockets) {
    const px = pocket.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const pz = pocket.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    for (let n = 0; n < playerUnits; n++) {
      const id = state.nextEntityId++;
      // A loose row 5 to 8 m south of the Big House's middle, outside its footprint.
      const h = hash32(state.seed, 1, pocket.player, n);
      const x = px + ((h & 0xffff) % (2 * WU_PER_METRE)) - WU_PER_METRE + (n - (playerUnits >> 1)) * 2 * WU_PER_METRE;
      const z = pz + (((h >>> 16) & 0xffff) % (3 * WU_PER_METRE)) + 5 * WU_PER_METRE;
      state.entities.add(id, pocket.player, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Worker);
    }
  }
  if (!options.noBase) {
    const spec = buildingSpec(BuildingKind.MainBase);
    for (const pocket of world.gen.start.pockets) placeBuilding(state, pocket.player, BuildingKind.MainBase, 0, pocket.x - (spec.w >> 1), pocket.z - (spec.d >> 1), true);
  }
  const spread = 40 * WU_PER_METRE;
  const half = 20 * WU_PER_METRE;
  for (let n = 0; n < wanderers; n++) {
    const id = state.nextEntityId++;
    const x = (hash32(state.seed, 1, n) % spread) - half;
    const z = (hash32(state.seed, 2, n) % spread) - half;
    const i = state.entities.add(id, NEUTRAL, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Wanderer);
    state.entities.wanderAt[i] = 1 + (hash32(state.seed, 3, n) % 40);
  }
  revealAroundUnits(state);
  return state;
}

/** The height a unit stands at on the column under (x, z), wu: its walk level, or lower in deep water (it swims). */
export function standY(state: SimState, x: number, z: number): number {
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  const level = state.nav.level(cx, cz);
  const deep = (state.nav.flags(cx, cz) & 4) !== 0;
  return (deep ? level - 6 : level) * WU_PER_TERRAIN_UNIT;
}

/** Every player's units and buildings mark the land within their sight explored (fog of war). */
export function revealAroundUnits(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    const owner = e.owner[i]!;
    if (owner === NEUTRAL || e.inside[i] !== 0) continue;
    state.world.reveal(owner, e.x[i]!, e.z[i]!, SIGHT_WU[e.kind[i]! as 0 | 1 | 2] ?? SIGHT_WU[0]);
  }
  for (const b of state.buildings.list) {
    const s = footprintDims(b.kind, b.variant);
    const cx = (b.x * 2 + s.w) * (WU_PER_COLUMN >> 1);
    const cz = (b.z * 2 + s.d) * (WU_PER_COLUMN >> 1);
    state.world.reveal(b.owner, cx, cz, BUILDING_SIGHT_M * WU_PER_METRE + ((Math.max(s.w, s.d) * WU_PER_COLUMN) >> 1));
  }
}

/** Steps between fog updates from unit sight. */
export const FOG_INTERVAL_STEPS = 10;
