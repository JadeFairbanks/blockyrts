// The simulation state. Entities live in struct-of-arrays typed arrays and are
// always iterated by index, so every machine visits them in the same order.

import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from './fixed.ts';
import { createStreams, hash32, type Streams } from './rng.ts';

/** Owner value for entities that belong to no player. */
export const NEUTRAL = 255;

export const OrderKind = {
  Idle: 0,
  Move: 1,
} as const;
export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

/** Walking speed of a worker: 3 m/s, as wu per step (1,200). */
export const WALK_SPEED_WU = floorDiv(3 * WU_PER_METRE, STEPS_PER_SECOND);

export class EntityStore {
  count = 0;
  capacity: number;
  id: Uint32Array;
  owner: Uint8Array;
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
  add(id: number, owner: number, x: number, y: number, z: number, speed: number): number {
    if (this.count === this.capacity) this.grow();
    const i = this.count++;
    this.id[i] = id;
    this.owner[i] = owner;
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
}

export interface WorldOptions {
  /** Units owned by player 0 that take move orders. */
  playerUnits?: number;
  /** Neutral units that wander on their own, drawing on the 'ai' stream. */
  wanderers?: number;
}

/**
 * Builds the M0 test world: a seed, a step counter and a handful of entities
 * scattered within 20 m of the origin. Placement uses the stateless coordinate
 * hash, the way world generation will.
 */
export function createWorld(seed: number, options: WorldOptions = {}): SimState {
  const playerUnits = options.playerUnits ?? 5;
  const wanderers = options.wanderers ?? 8;
  const state: SimState = {
    seed: seed >>> 0,
    step: 0,
    nextEntityId: 1,
    rng: createStreams(seed),
    entities: new EntityStore(),
  };
  const spread = 40 * WU_PER_METRE;
  const half = 20 * WU_PER_METRE;
  for (let n = 0; n < playerUnits + wanderers; n++) {
    const id = state.nextEntityId++;
    const x = (hash32(state.seed, 1, n) % spread) - half;
    const z = (hash32(state.seed, 2, n) % spread) - half;
    const owner = n < playerUnits ? 0 : NEUTRAL;
    const i = state.entities.add(id, owner, x, 0, z, WALK_SPEED_WU);
    if (owner === NEUTRAL) state.entities.wanderAt[i] = 1 + (hash32(state.seed, 3, n) % 40);
  }
  return state;
}
