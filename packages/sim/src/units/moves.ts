// How the players' units get over the land (Patch 5, Jade's GP-16 and
// GP-18). Every unit on foot (no cavalry, no engines) has a Run/Walk button:
// it starts at Walk, and running is 40% faster than walking and costs food,
// 1 for every 50 m each unit runs, a debt that stays with the unit until
// the 50 m are run. Foot units walk 15% slower than before (and engines go
// 15% slower too, siege/data.ts). Humanoid units climb faces of land and
// rock (never walls or buildings, which block their columns) at a fifth of
// their walking pace, by themselves, wherever a path needs it: fighters up
// to 4 m, workers and woodsmen up to 7 m. Everyone jumps 20% higher than
// before; a horse jumps 2.5 m; the Dreadnought jumps 1.5 m and never
// climbs. Each kind of unit gets about by one row of GAITS. (The foot walk
// itself is state.ts FOOT_WALK_BP, the engines' siege/data.ts
// ARTILLERY_PACE_BP.)

import { payFood } from '../economy/food.ts';
import { floorDiv, headingTowards, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { Mount } from '../mounts/data.ts';
import { PERSON, type Mover } from '../nav/grid.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { onWheels } from './weight.ts';

/** The ways the players' units get about: one row of GAITS each. */
export const Gait = { Worker: 0, Woodsman: 1, Fighter: 2, Cavalry: 3, Dreadnought: 4, Engine: 5 } as const;
export type Gait = (typeof Gait)[keyof typeof Gait];

export interface GaitSpec {
  id: Gait;
  name: string;
  /** On foot: it has the Run/Walk button (GP-16: "No artillery and no cavalry"). */
  runs: boolean;
  /** Food it pays for every RUN_FOOD_METRES it runs. */
  runFood: number;
  /** Its walk, and so its run, against a standard foot unit's, bp (units/behaviour.ts moveSpeed). */
  paceBp: number;
  /**
   * The highest rise it jumps (or walks up), the deepest drop it jumps down,
   * and the highest face it climbs up or down, terrain units of 11.25 cm (the
   * land rises in whole units, so 45 cm + 20% = 54 cm is 5 units, 56 cm).
   */
  jump: number;
  drop: number;
  climb: number;
}

/** 40% faster running (GP-16), bp on top of the walk. */
export const RUN_BONUS_BP = 4000;
/** Running is paid for every 50 m (GP-16), in food; the distance as wu. */
export const RUN_FOOD_METRES = 50;
const RUN_PAID_WU = RUN_FOOD_METRES * WU_PER_METRE;
/** Climbing goes at a fifth of the walking pace (GP-18: "Climbing moves 5x as slowly as walking"). */
export const CLIMB_SLOW = 5;

/**
 * Patch 5's gaits (GP-16, GP-18, GP-21 and Jade's answers of 2026-10-08:
 * climbing is for land and rock only; the Dreadnought never climbs, jumps
 * 1.5 m, walks and runs 20% slower than standard and pays double for
 * running). Jumps were 4 units (45 cm) for everyone on foot; drops stay
 * 9 units (1 m), and a horse comes down what it jumps up.
 */
export const GAITS: readonly GaitSpec[] = [
  // Workers climb up to 7 m (62 units, 6.98 m).
  { id: Gait.Worker, name: 'Worker', runs: true, runFood: 1, paceBp: 10000, jump: 5, drop: 9, climb: 62 },
  // Woodsmen climb as workers do (the Woodsman thread gives its unit this row).
  { id: Gait.Woodsman, name: 'Woodsman', runs: true, runFood: 1, paceBp: 10000, jump: 5, drop: 9, climb: 62 },
  // Troops on foot, mages and artillery crewmen climb up to 4 m (35 units, 3.94 m).
  { id: Gait.Fighter, name: 'Fighter on foot', runs: true, runFood: 1, paceBp: 10000, jump: 5, drop: 9, climb: 35 },
  // A horse jumps 2.5 m (22 units, 2.48 m); cavalry never climbs or runs (it is already faster than a runner).
  { id: Gait.Cavalry, name: 'Cavalry', runs: false, runFood: 0, paceBp: 10000, jump: 22, drop: 22, climb: 0 },
  // The Dreadnought jumps 1.5 m (13 units, 1.46 m) and never climbs (the Tavern thread gives its unit this row).
  { id: Gait.Dreadnought, name: 'Dreadnought', runs: true, runFood: 2, paceBp: 8000, jump: 13, drop: 13, climb: 0 },
  // Engines roll (nav/grid.ts WHEELS): no running, jumping or climbing, at their own pace (siege/data.ts ARTILLERY_PACE_BP).
  { id: Gait.Engine, name: 'Siege engine', runs: false, runFood: 0, paceBp: 10000, jump: 0, drop: 0, climb: 0 },
];

export function gaitSpec(g: number): GaitSpec {
  return GAITS[g] ?? GAITS[Gait.Fighter]!;
}

/** Which row of GAITS one of the players' units goes by. */
export function gaitOf(state: SimState, i: number): Gait {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Engine) return Gait.Engine;
  if (e.mount[i] === Mount.Horse) return Gait.Cavalry;
  if (e.kind[i] === UnitKind.Worker) return Gait.Worker;
  return Gait.Fighter;
}

/** The walk-map mover of each gait: the players' units pass gates and swim; ids from 16 so they never share a pathfinder cache with nav/grid.ts's. */
const MOVERS: readonly Mover[] = GAITS.map((g) => (g.id === Gait.Engine ? PERSON : { id: 16 + g.id, canSwim: true, passGates: true, clamber: g.jump, drop: g.drop, climb: g.climb }));

export function gaitMover(g: number): Mover {
  return MOVERS[g] ?? MOVERS[Gait.Fighter]!;
}

// ----- running (GP-16) -----

/** Whether a unit has the Run/Walk button: one of the players' units on foot (GP-16: no artillery, no cavalry). */
export function hasRunButton(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.owner[i]! < state.players.length && e.mount[i] === Mount.None && gaitSpec(gaitOf(state, i)).runs;
}

/** Whether a unit can run now: it has Run/Walk and is not pulling a cart (a cart goes at its own pace). */
export function canRun(state: SimState, i: number): boolean {
  return hasRunButton(state, i) && !onWheels(state, i);
}

/** Whether a unit runs now: its button is on Run, it can run, and it has paid for what it ran (with no food in store to pay, it walks until there is). */
export function runsNow(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.running[i] === 1 && e.ranWu[i]! < RUN_PAID_WU && canRun(state, i);
}

/** Pays for the last 50 m a unit ran, once it has run them: its food from its owner's store (Don't eat kept back), or nothing yet if there is not enough. */
export function payForRunning(state: SimState, i: number): void {
  const e = state.entities;
  if (e.ranWu[i]! < RUN_PAID_WU) return;
  const owner = e.owner[i]!;
  const p = owner < state.players.length ? state.players[owner] : undefined;
  if (p && payFood(p, gaitSpec(gaitOf(state, i)).runFood) === null) return;
  e.ranWu[i] = e.ranWu[i]! - RUN_PAID_WU;
}

/** Counts a step's run towards the next payment: what it moved, never more than a step at its running pace (a jump to a building's door is not a run). */
export function addRun(state: SimState, i: number, moved: number, pace: number): void {
  const e = state.entities;
  e.ranWu[i] = e.ranWu[i]! + Math.min(moved, pace);
}

// ----- climbing (GP-18) -----

/** How far from a face a climber hangs on it, wu (15 cm). */
const FACE_GAP_WU = floorDiv(15 * WU_PER_METRE, 100);

/**
 * Puts a unit onto the face between its column (cx, cz) and the straight
 * neighbour (nx, nz) it climbs to, whose floor is at toY (wu): it hangs on
 * the face from the lower side, facing it, and comes off on the far side of
 * the edge (ledgeX, ledgeZ) once it has climbed to toY.
 */
export function startClimb(state: SimState, i: number, cx: number, cz: number, nx: number, nz: number, toY: number): void {
  const e = state.entities;
  const dx = nx > cx ? 1 : nx < cx ? -1 : 0;
  const dz = nz > cz ? 1 : nz < cz ? -1 : 0;
  // The edge between the two columns, on the axis the step crosses.
  const edgeX = dx > 0 ? nx * WU_PER_COLUMN : cx * WU_PER_COLUMN;
  const edgeZ = dz > 0 ? nz * WU_PER_COLUMN : cz * WU_PER_COLUMN;
  const up = toY > e.y[i]!;
  // Going up it hangs on its own column's side of the edge; going down, on the lower column's.
  const side = up ? -1 : 1;
  if (dx !== 0) e.x[i] = edgeX + side * dx * FACE_GAP_WU;
  if (dz !== 0) e.z[i] = edgeZ + side * dz * FACE_GAP_WU;
  e.ledgeX[i] = dx !== 0 ? edgeX + dx * FACE_GAP_WU : e.x[i]!;
  e.ledgeZ[i] = dz !== 0 ? edgeZ + dz * FACE_GAP_WU : e.z[i]!;
  e.ledgeY[i] = toY;
  e.onFace[i] = 1;
  // It faces the face: ahead going up, behind it going down.
  e.heading[i] = up ? headingTowards(dx, dz) : headingTowards(-dx, -dz);
  e.order[i] = OrderKind.Climb;
}

/** One step on a face, at a fifth of the unit's walking pace (wu a step): up or down towards its ledge, and off onto it once there. */
export function climbOn(state: SimState, i: number, walkPace: number): void {
  const e = state.entities;
  const rate = Math.max(1, floorDiv(walkPace, CLIMB_SLOW));
  const y = e.y[i]!;
  const to = e.ledgeY[i]!;
  e.order[i] = OrderKind.Climb;
  if (Math.abs(to - y) > rate) {
    e.y[i] = to > y ? y + rate : y - rate;
    return;
  }
  e.x[i] = e.ledgeX[i]!;
  e.z[i] = e.ledgeZ[i]!;
  e.y[i] = to;
  e.onFace[i] = 0;
}
