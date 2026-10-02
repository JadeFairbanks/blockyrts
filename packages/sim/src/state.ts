// The simulation state. Entities live in struct-of-arrays typed arrays and are
// always iterated by index, so every machine visits them in the same order.

import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from './fixed.ts';
import { createStreams, hash32, type Streams } from './rng.ts';
import { World } from './world/world.ts';

/** Owner value for entities that belong to no player. */
export const NEUTRAL = 255;

export const OrderKind = {
  Idle: 0,
  Move: 1,
} as const;
export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

/** What an entity is. Player units are placeholders until workers (M2) and warriors (M3) arrive. */
export const UnitKind = {
  Worker: 0,
  Warrior: 1,
  /** M0's test wanderers. */
  Wanderer: 2,
} as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

/** Sight in wu by kind (Table 1: worker 20 m, warrior 24 m; suggested). */
export const SIGHT_WU = [20 * WU_PER_METRE, 24 * WU_PER_METRE, 12 * WU_PER_METRE] as const;

/** Walking speed of a worker: 3 m/s, as wu per step (1,200). */
export const WALK_SPEED_WU = floorDiv(3 * WU_PER_METRE, STEPS_PER_SECOND);

export class EntityStore {
  count = 0;
  capacity: number;
  id: Uint32Array;
  owner: Uint8Array;
  /** UnitKind. */
  kind: Uint8Array;
  /** Position in wu; x east, y up, z south (three.js axes). */
  x: Int32Array;
  y: Int32Array;
  z: Int32Array;
  /** 16-bit heading; 0 faces -Z. */
  heading: Uint16Array;
  /** Speed in wu per step. */
  speed: Int32Array;
  order: Uint8Array;
  targetX: Int32Array;
  targetZ: Int32Array;
  /** For wanderers: the step at which a new destination is chosen; 0 means never. */
  wanderAt: Uint32Array;

  private readonly index = new Map<number, number>();

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.id = new Uint32Array(capacity);
    this.owner = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.x = new Int32Array(capacity);
    this.y = new Int32Array(capacity);
    this.z = new Int32Array(capacity);
    this.heading = new Uint16Array(capacity);
    this.speed = new Int32Array(capacity);
    this.order = new Uint8Array(capacity);
    this.targetX = new Int32Array(capacity);
    this.targetZ = new Int32Array(capacity);
    this.wanderAt = new Uint32Array(capacity);
  }

  private grow(): void {
    const cap = this.capacity * 2;
    const g = <T extends Uint32Array | Uint16Array | Uint8Array | Int32Array>(a: T, make: (n: number) => T): T => {
      const n = make(cap);
      n.set(a);
      return n;
    };
    this.id = g(this.id, (n) => new Uint32Array(n));
    this.owner = g(this.owner, (n) => new Uint8Array(n));
    this.kind = g(this.kind, (n) => new Uint8Array(n));
    this.x = g(this.x, (n) => new Int32Array(n));
    this.y = g(this.y, (n) => new Int32Array(n));
    this.z = g(this.z, (n) => new Int32Array(n));
    this.heading = g(this.heading, (n) => new Uint16Array(n));
    this.speed = g(this.speed, (n) => new Int32Array(n));
    this.order = g(this.order, (n) => new Uint8Array(n));
    this.targetX = g(this.targetX, (n) => new Int32Array(n));
    this.targetZ = g(this.targetZ, (n) => new Int32Array(n));
    this.wanderAt = g(this.wanderAt, (n) => new Uint32Array(n));
    this.capacity = cap;
  }

  /** Appends an entity and returns its index. */
  add(id: number, owner: number, x: number, y: number, z: number, speed: number, kind: number = UnitKind.Worker): number {
    if (this.count === this.capacity) this.grow();
    const i = this.count++;
    this.id[i] = id;
    this.owner[i] = owner;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.heading[i] = 0;
    this.speed[i] = speed;
    this.order[i] = OrderKind.Idle;
    this.targetX[i] = 0;
    this.targetZ[i] = 0;
    this.wanderAt[i] = 0;
    this.index.set(id, i);
    return i;
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

export interface SimState {
  seed: number;
  step: number;
  nextEntityId: number;
  rng: Streams;
  entities: EntityStore;
  /** The land: generated from the seed, plus every change players made. */
  world: World;
}

export interface WorldOptions {
  /** Players, 1 to 8: the start basin's size and one pocket each (Table 9). */
  players?: number;
  /** Units each player starts with: four workers then one warrior, as placeholders until M2 and M3. */
  playerUnits?: number;
  /** Neutral units that wander on their own, drawing on the 'ai' stream (M0's test of the streams). */
  wanderers?: number;
}

/**
 * Builds a new game: the world from the seed and player count, and each
 * player's starting units standing round the Big House spot in their pocket.
 */
export function createWorld(seed: number, options: WorldOptions = {}): SimState {
  const playerUnits = options.playerUnits ?? 5;
  const wanderers = options.wanderers ?? 0;
  const world = new World(seed, options.players ?? 1);
  const state: SimState = {
    seed: seed >>> 0,
    step: 0,
    nextEntityId: 1,
    rng: createStreams(seed),
    entities: new EntityStore(),
    world,
  };
  for (const pocket of world.gen.start.pockets) {
    const px = pocket.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const pz = pocket.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    for (let n = 0; n < playerUnits; n++) {
      const id = state.nextEntityId++;
      // A loose ring 4 to 7 m round the Big House spot.
      const h = hash32(state.seed, 1, pocket.player, n);
      const x = px + ((h & 0xffff) % (6 * WU_PER_METRE)) - 3 * WU_PER_METRE + (n - 2) * 2 * WU_PER_METRE;
      const z = pz + (((h >>> 16) & 0xffff) % (6 * WU_PER_METRE)) - 3 * WU_PER_METRE + 5 * WU_PER_METRE;
      const kind = n === 4 ? UnitKind.Warrior : UnitKind.Worker;
      state.entities.add(id, pocket.player, x, world.groundY(x, z, 0), z, WALK_SPEED_WU, kind);
    }
  }
  const spread = 40 * WU_PER_METRE;
  const half = 20 * WU_PER_METRE;
  for (let n = 0; n < wanderers; n++) {
    const id = state.nextEntityId++;
    const x = (hash32(state.seed, 1, n) % spread) - half;
    const z = (hash32(state.seed, 2, n) % spread) - half;
    const i = state.entities.add(id, NEUTRAL, x, world.groundY(x, z, 0), z, WALK_SPEED_WU, UnitKind.Wanderer);
    state.entities.wanderAt[i] = 1 + (hash32(state.seed, 3, n) % 40);
  }
  revealAroundUnits(state);
  return state;
}

/** Every player's units mark the land within their sight explored (fog of war). */
export function revealAroundUnits(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    const owner = e.owner[i]!;
    if (owner === NEUTRAL) continue;
    state.world.reveal(owner, e.x[i]!, e.z[i]!, SIGHT_WU[e.kind[i]! as 0 | 1 | 2] ?? SIGHT_WU[0]);
  }
}

/** Steps between fog updates from unit sight. */
export const FOG_INTERVAL_STEPS = 10;
