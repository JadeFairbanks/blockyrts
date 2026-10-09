// Stuck units (Jade's Patch 5, GP-22): a player's unit whose walk fails
// looks round itself. Shut in on every side (walls, faces of land too high
// for it to climb, drops, deep water), or sent somewhere it cannot find a way
// to, it says where it is stuck and why, as a bubble and an urgent line under
// its name in its owner's message panel, marked `stuck`: the owner's minimap
// pings it every 5 s until they look at it (the client, hud/shell.ts). Other
// players never see it. The look only tells: it changes nothing in the sim.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { TOP, Walk, type Mover, type NavGrid } from '../nav/grid.ts';
import type { Goal } from '../nav/path.ts';
import { directions } from '../peoples/factions.ts';
import { speakerName } from '../peoples/speech.ts';
import type { SimState } from '../state.ts';

/** How far a look reaches each way, columns (s): about 29 m; a place it cannot close in that is open. */
const LOOK_REACH = 64;
/** How many columns a look takes in before it counts the place as open (s): a walled yard of about 50 m by 50 m. */
const LOOK_COLUMNS = 12000;
/** A unit says it is stuck at most once a minute (s). */
export const STUCK_SAY_AGAIN_STEPS = 60 * STEPS_PER_SECOND;
/** A look that finds the unit free waits this long before the next (s). */
const LOOK_AGAIN_STEPS = 10 * STEPS_PER_SECOND;
/** A move that ends farther than this from where the unit was sent counts as stuck, columns (s: 5 m). */
const MISSED_COLUMNS = 11;

/** Why a unit is stuck: what stands between it and the way out (or round where it was sent). */
export const Why = { Walls: 0, Climb: 1, Drop: 2, Water: 3, Steep: 4 } as const;
const WHY_TEXT: readonly string[] = [
  'walls and buildings',
  'faces of land and rock too high for me to climb',
  'drops too deep for me to climb down',
  'deep water',
  'slopes too steep for wheels',
];

const W = 2 * LOOK_REACH + 1;
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];

/** Not state: scratch for the looks (a node's stamp when it was reached, and the queue). */
const seen = new Uint32Array(W * W * 2);
const queue = new Int32Array(LOOK_COLUMNS + 1);
let stamp = 0;

interface Look {
  /** Whether the place reaches past the look's reach: not shut in. */
  open: boolean;
  /** Why a shut-in place is shut in (Why). */
  why: number;
}

/** Not state: the last look, so a group whose walks fail together looks once (a unit inside the place it took in shares its answer). */
let last: { state: SimState; step: number; epoch: number; mover: number; x0: number; z0: number; stamp: number; look: Look } | null = null;

/**
 * Whether a place is shut in for a mover, from a column's walk level: a
 * flood over straight steps (a diagonal one needs both beside it open, so
 * they reach no more), out to LOOK_REACH columns or LOOK_COLUMNS of them.
 * Shut in, the commonest thing on its edge says why.
 */
function look(state: SimState, x: number, z: number, layer: number, m: Mover): Look {
  const nav = state.nav;
  const epoch = state.world.navEpoch;
  if (last && last.state === state && last.step === state.step && last.epoch === epoch && last.mover === m.id) {
    const lx = x - last.x0;
    const lz = z - last.z0;
    if (lx >= 0 && lz >= 0 && lx < W && lz < W && seen[(lz * W + lx) * 2 + layer] === last.stamp) return last.look;
  }
  if (++stamp >= 0xfffffff0) {
    seen.fill(0);
    stamp = 1;
  }
  const x0 = x - LOOK_REACH;
  const z0 = z - LOOK_REACH;
  let n = 0;
  const start = (LOOK_REACH * W + LOOK_REACH) * 2 + layer;
  seen[start] = stamp;
  queue[n++] = start;
  let open = false;
  for (let q = 0; q < n && !open; q++) {
    const k = queue[q]!;
    const l = k & 1;
    const c = k >> 1;
    const lx = c % W;
    const lz = floorDiv(c, W);
    for (let d = 0; d < 4; d++) {
      const nx = lx + DX[d]!;
      const nz = lz + DZ[d]!;
      const lb = nav.layerTo(x0 + lx, z0 + lz, l, x0 + nx, z0 + nz, m);
      if (lb < 0) continue;
      if (nx < 0 || nz < 0 || nx >= W || nz >= W || n >= LOOK_COLUMNS) {
        open = true;
        break;
      }
      const nk = (nz * W + nx) * 2 + lb;
      if (seen[nk] === stamp) continue;
      seen[nk] = stamp;
      queue[n++] = nk;
    }
  }
  let why: number = Why.Walls;
  if (!open) {
    // The edge: every step from a column reached to a column reached on neither walk level.
    const count = [0, 0, 0, 0, 0];
    for (let q = 0; q < n; q++) {
      const k = queue[q]!;
      const c = k >> 1;
      const lx = c % W;
      const lz = floorDiv(c, W);
      for (let d = 0; d < 4; d++) {
        const nx = lx + DX[d]!;
        const nz = lz + DZ[d]!;
        const nc = nz * W + nx;
        if (nx >= 0 && nz >= 0 && nx < W && nz < W && (seen[nc * 2] === stamp || seen[nc * 2 + 1] === stamp)) continue;
        const w = whyNot(nav, x0 + lx, z0 + lz, k & 1, x0 + nx, z0 + nz, m);
        count[w] = count[w]! + 1;
      }
    }
    for (let w = 1; w < count.length; w++) if (count[w]! > count[why]!) why = w;
  }
  const result = { open, why };
  last = { state, step: state.step, epoch, mover: m.id, x0, z0, stamp, look: result };
  return result;
}

/** Why a mover cannot step from a walk level of a column to its neighbour (Why). */
function whyNot(nav: NavGrid, ax: number, az: number, la: number, bx: number, bz: number, m: Mover): number {
  const f = nav.flags(bx, bz);
  if (f & Walk.Blocked && !m.ignoreBuildings && !(m.passGates && f & Walk.Gate)) return Why.Walls;
  if (f & Walk.Deep && !m.canSwim) return Why.Water;
  if (m.wheels) return Why.Steep;
  return nav.level(bx, bz) > nav.levelOf(ax, az, la) ? Why.Climb : Why.Drop;
}

/** Where a spot (wu) lies from a player's main base, for a stuck unit's line: " to the north-east, about 40 m from our main base", or nothing with no main base. */
function whereText(state: SimState, player: number, x: number, z: number): string {
  const base = state.buildings.list.find((b) => b.owner === player && b.complete && b.kind === BuildingKind.MainBase && b.hp > 0);
  if (!base) return '';
  const [bx, bz] = buildingCentre(base);
  return ` to the ${directions(bx, bz, x, z)} from our main base`;
}

/** How far a column is outside a goal's area, columns (along the farther axis). */
function outside(goal: Goal, x: number, z: number): number {
  return Math.max(goal.x0 - x, x - goal.x1, goal.z0 - z, z - goal.z1, 0);
}

/**
 * A player's unit whose walk failed (units/behaviour.ts walkTo): it looks
 * round itself, at most once in LOOK_AGAIN_STEPS, and if it is shut in,
 * or a move left it well short of where it was sent, it says so, at most
 * once a minute.
 */
export function noteStuck(state: SimState, i: number, goal: Goal, m: Mover): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length || state.step < e.stuckSaid[i]!) return;
  const nav = state.nav;
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const self = look(state, cx, cz, nav.layerAt(cx, cz, floorDiv(e.y[i]!, WU_PER_TERRAIN_UNIT)), m);
  const where = whereText(state, player, e.x[i]!, e.z[i]!);
  let text: string | null = null;
  if (!self.open) text = `I'm stuck${where}: there are ${WHY_TEXT[self.why]} all round me, and I can't figure out how to get out.`;
  else {
    const t = e.queue[i]![0]?.t;
    if ((t === 'move' || t === 'attackMove') && outside(goal, cx, cz) > goal.max + MISSED_COLUMNS) {
      const there = look(state, floorDiv(goal.x0 + goal.x1, 2), floorDiv(goal.z0 + goal.z1, 2), TOP, m);
      text = there.open
        ? `I'm stuck${where}: I can't figure out a way to where you sent me.`
        : `I'm stuck${where}: there are ${WHY_TEXT[there.why]} all round where you sent me, and I can't figure out a way there.`;
    }
  }
  if (text === null) {
    e.stuckSaid[i] = state.step + LOOK_AGAIN_STEPS;
    return;
  }
  e.stuckSaid[i] = state.step + STUCK_SAY_AGAIN_STEPS;
  state.events.push({ player, kind: 'alert', text, x: e.x[i]!, z: e.z[i]!, speaker: e.id[i]!, name: speakerName(state, i), urgent: true, stuck: true });
}

/** Whether a unit has just said it is stuck, this step (its order's own "I cannot reach that." then stays unsaid). */
export function saidStuckNow(state: SimState, i: number): boolean {
  return state.entities.stuckSaid[i] === state.step + STUCK_SAY_AGAIN_STEPS;
}
