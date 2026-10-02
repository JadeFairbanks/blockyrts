// How ranged attacks hit (suggested, Combat): projectiles really fly. Each
// step a projectile moves along its arc and checks the whole stretch it has
// just travelled, in small pieces, for the first solid thing: an enemy, a
// building, a tree or the ground. Friendly units are passed through. Aim
// leads a moving target, with a spread that shrinks with rank. All of it is
// integer maths and the 'combat' stream.

import { buildingSpec } from '../buildings/data.ts';
import type { Building } from '../buildings/store.ts';
import { floorDiv, isqrt, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { rankSpreadReductionBp } from '../rules.ts';
import { OrderKind, UnitKind, type Projectile, type SimState } from '../state.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { isTree } from '../world/props.ts';
import { bodyHeight, forward, halfWidth, hurtBuilding, hurtUnit, Side, sideOf } from './combat.ts';
import { SHOTS } from './items.ts';
import { WEB } from './mobs.ts';
import { smoulder, SPARK } from '../threats/burns.ts';

/** Gravity, wu per step per step: 9.8 m/s2 at 20 steps a second. Even, so half of it times k squared stays whole. */
export const GRAVITY = 196;
/** A projectile still flying after 8 s is gone. */
const MAX_AGE = 8 * STEPS_PER_SECOND;
/** Each step's stretch is checked in pieces no longer than half a column (22 cm). */
const PIECE_WU = WU_PER_COLUMN >> 1;
/** Shots leave a person's hand at 1.4 m. */
export const HAND_HEIGHT = floorDiv(WU_PER_METRE * 14, 10);

/** Spell: a spell that flies (Spark toss, a mana bolt, an Arcane bolt, a Fireball): Warding halves it (Table 13). */
export const ProjectileFlag = { Blunt: 1, Fire: 2, Web: 4, Poison: 8, Spell: 16 } as const;

/** Venom on an arrow or bolt: 15 more damage over 5 s (s), on top of the hit. */
export const POISON = { damage: 15, steps: 5 * STEPS_PER_SECOND };

/** Where a projectile is at a given age. */
export function projectileAt(p: Projectile, age: number): [number, number, number] {
  const g = SHOTS[p.shot]!.arcs ? GRAVITY : 0;
  return [p.x0 + p.vx * age, p.y0 + p.vy * age - (g >> 1) * age * age, p.z0 + p.vz * age];
}

/** The top of a building's solid part, wu. */
export function buildingTop(b: Building): number {
  return b.y * WU_PER_TERRAIN_UNIT + floorDiv(buildingSpec(b.kind).heightCm * WU_PER_METRE, 100);
}

/** Not state: tree columns with their heights, per chunk, for the current step. */
const treeCache = { step: -1, chunks: new Map<number, Map<number, number>>() };

/** The height of the tree on a column, wu, or 0 (Walls, trees and ranged attacks). */
function treeAt(state: SimState, x: number, z: number): number {
  if (treeCache.step !== state.step || treeCache.chunks.size > 256) {
    treeCache.step = state.step;
    treeCache.chunks.clear();
  }
  const cx = x >> CHUNK_SHIFT;
  const cz = z >> CHUNK_SHIFT;
  const key = (cz + 0x8000) * 0x10000 + (cx + 0x8000);
  let m = treeCache.chunks.get(key);
  if (!m) {
    m = new Map();
    for (const p of state.world.props(cx, cz, state.step)) {
      if (!isTree(p.kind) || p.stage === 0) continue;
      const h = p.stage === 1 ? floorDiv(WU_PER_METRE * 3, 2) : floorDiv(5 * WU_PER_METRE * Math.max(400, p.size), 1000);
      m.set(p.lz * 64 + p.lx, p.y * WU_PER_TERRAIN_UNIT + h);
    }
    treeCache.chunks.set(key, m);
  }
  return m.get((z - (cz << CHUNK_SHIFT)) * 64 + (x - (cx << CHUNK_SHIFT))) ?? 0;
}

/** Flight times an arcing shot tries, in percent of the flattest: a higher lob clears a wall in the way (Finding a clear shot). */
const LOBS = [100, 150, 200, 300] as const;

/**
 * The velocity that carries a shot from (x0, y0, z0) to (x1, y1, z1): steps
 * in flight and the velocity. The flattest arc flies at the shot's speed; a
 * lob takes longer and so climbs higher.
 */
function solve(shot: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, lobPct = 100): { t: number; vx: number; vy: number; vz: number } {
  const spec = SHOTS[shot]!;
  const d = length2d(x1 - x0, z1 - z0);
  const flat = Math.max(1, floorDiv(d + spec.speed - 1, spec.speed));
  const t = spec.arcs ? Math.max(1, floorDiv(flat * lobPct, 100)) : flat;
  const g = spec.arcs ? GRAVITY : 0;
  return { t, vx: floorDiv(x1 - x0, t), vz: floorDiv(z1 - z0, t), vy: floorDiv(y1 - y0 + (g >> 1) * t * t, t) };
}

/** A target's ground velocity, wu per step: its heading at its speed while it is on the move. */
function velocityOf(state: SimState, t: number): [number, number] {
  const e = state.entities;
  const o = e.order[t]!;
  const moving = o === OrderKind.Move || o === OrderKind.Carry || o === OrderKind.Swim || o === OrderKind.Flee;
  const flying = e.kind[t] === UnitKind.Mob && o !== OrderKind.Attack && o !== OrderKind.Idle && o !== OrderKind.Climb;
  if (!moving && !flying) return [0, 0];
  const [fx, fz] = forward(e.heading[t]!);
  const sp = e.speed[t]!;
  return [floorDiv(fx * sp, 65536), floorDiv(fz * sp, 65536)];
}

/**
 * Fires a shot at a target unit: it aims at where the target will be when
 * the shot arrives (two passes of the lead), plus a random miss up to the
 * spread share of the distance, less 10% a rank for the players' units.
 */
export function fireAt(state: SimState, shooter: number, fromX: number, fromY: number, fromZ: number, t: number, shot: number, damage: number, spreadBp: number, flags: number): void {
  const e = state.entities;
  let ax = e.x[t]!;
  let az = e.z[t]!;
  const ay = e.y[t]! + (bodyHeight(state, t) >> 1);
  const [vx, vz] = velocityOf(state, t);
  for (let pass = 0; pass < 2; pass++) {
    const s = solve(shot, fromX, fromY, fromZ, ax, ay, az);
    ax = e.x[t]! + vx * s.t;
    az = e.z[t]! + vz * s.t;
  }
  const d = length2d(ax - fromX, az - fromZ);
  let spread = floorDiv(d * spreadBp, 10000);
  if (sideOf(state, shooter) === Side.Players) spread = floorDiv(spread * (10000 - Math.min(9000, rankSpreadReductionBp(e.rank[shooter]!))), 10000);
  if (spread > 0) {
    ax += state.rng.combat.range(-spread, spread);
    az += state.rng.combat.range(-spread, spread);
  }
  launch(state, shooter, fromX, fromY, fromZ, ax, ay, az, shot, damage, flags, clearLob(state, shot, fromX, fromY, fromZ, ax, ay, az, false));
}

export function launch(state: SimState, shooter: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, shot: number, damage: number, flags: number, lobPct = 100): void {
  const e = state.entities;
  const s = solve(shot, x0, y0, z0, x1, y1, z1, lobPct);
  state.projectiles.push({
    shot, side: sideOf(state, shooter), shooter: e.id[shooter]!, owner: e.owner[shooter]!,
    x0, y0, z0, vx: s.vx, vy: s.vy, vz: s.vz, age: 0, damage, flags,
  });
  state.hits.push({ look: 'shot', x: x0, y: y0, z: z0, id: e.id[shooter]! });
}

/**
 * Finding a clear shot: the flattest arc from a point to a target point
 * that flies clear of walls and buildings (all of them, or with `ownOnly`
 * only the shooter's side's, as the players' units check), as a lob in
 * percent; 0 when none is clear. Arcing shots go over a wall when the
 * target is far enough away for a lob to clear it.
 */
export function clearLob(state: SimState, shot: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ownOnly: boolean): number {
  const lobs = SHOTS[shot]!.arcs ? LOBS : LOBS.slice(0, 1);
  for (const lob of lobs) if (clearPath(state, shot, x0, y0, z0, x1, y1, z1, lob, ownOnly)) return lob;
  return ownOnly ? 0 : 100;
}

/** Whether any lob clears every building in the way (monsters picking a target they can hit). */
export function hasClearLob(state: SimState, shot: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const lobs = SHOTS[shot]!.arcs ? LOBS : LOBS.slice(0, 1);
  for (const lob of lobs) if (clearPath(state, shot, x0, y0, z0, x1, y1, z1, lob, false)) return true;
  return false;
}

function clearPath(state: SimState, shot: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, lob: number, ownOnly: boolean): boolean {
  const s = solve(shot, x0, y0, z0, x1, y1, z1, lob);
  const p: Projectile = { shot, side: 0, shooter: 0, owner: 0, x0, y0, z0, vx: s.vx, vy: s.vy, vz: s.vz, age: 0, damage: 0, flags: 0 };
  const startBuilding = state.buildings.solidAt(floorDiv(x0, WU_PER_COLUMN), floorDiv(z0, WU_PER_COLUMN));
  const endBuilding = state.buildings.solidAt(floorDiv(x1, WU_PER_COLUMN), floorDiv(z1, WU_PER_COLUMN));
  for (let k = 0; k < s.t; k++) {
    const [ax, ay, az] = projectileAt(p, k);
    const [bx, by, bz] = projectileAt(p, k + 1);
    const n = Math.max(1, floorDiv(length2d(bx - ax, bz - az) + PIECE_WU - 1, PIECE_WU));
    for (let q = 1; q <= n; q++) {
      const x = ax + floorDiv((bx - ax) * q, n);
      const y = ay + floorDiv((by - ay) * q, n);
      const z = az + floorDiv((bz - az) * q, n);
      const id = state.buildings.solidAt(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN));
      if (id === 0 || id === startBuilding || id === endBuilding) continue;
      const b = state.buildings.get(id);
      if (!b || y >= buildingTop(b)) continue;
      if (ownOnly && b.owner >= state.players.length) continue;
      return false;
    }
  }
  return true;
}

/** Moves every projectile one step and settles what it hits. */
export function updateProjectiles(state: SimState): void {
  const e = state.entities;
  const keep: Projectile[] = [];
  const near: number[] = [];
  for (const p of state.projectiles) {
    const [ax, ay, az] = projectileAt(p, p.age);
    const [bx, by, bz] = projectileAt(p, p.age + 1);
    p.age++;
    const n = Math.max(1, floorDiv(isqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az) + (by - ay) * (by - ay)) + PIECE_WU - 1, PIECE_WU));
    const shooter = e.indexOf(p.shooter);
    const startBuilding = state.buildings.solidAt(floorDiv(p.x0, WU_PER_COLUMN), floorDiv(p.z0, WU_PER_COLUMN));
    let done = false;
    // Candidates: units round the whole stretch.
    const mx = (ax + bx) >> 1;
    const mz = (az + bz) >> 1;
    state.grid.near(mx, mz, (length2d(bx - ax, bz - az) >> 1) + 2 * WU_PER_METRE, near);
    for (let q = 1; q <= n && !done; q++) {
      const x = ax + floorDiv((bx - ax) * q, n);
      const y = ay + floorDiv((by - ay) * q, n);
      const z = az + floorDiv((bz - az) * q, n);
      // The first enemy whose box holds the point; ties go to the lowest id.
      let hit = -1;
      for (const j of near) {
        if (e.hp[j]! <= 0 || j === shooter) continue;
        const sj = sideOf(state, j);
        if (sj === Side.None || sj === p.side) continue;
        const hw = halfWidth(state, j);
        if (Math.abs(e.x[j]! - x) > hw || Math.abs(e.z[j]! - z) > hw) continue;
        if (y < e.y[j]! || y > e.y[j]! + bodyHeight(state, j)) continue;
        if (hit < 0 || e.id[j]! < e.id[hit]!) hit = j;
      }
      if (hit >= 0) {
        if (p.flags & ProjectileFlag.Web) {
          e.slowUntil[hit] = state.step + WEB.steps;
          e.slowBp[hit] = WEB.slowBp;
          state.hits.push({ look: 'slime', x, y, z, id: e.id[hit]! });
        } else {
          const d = hurtUnit(state, hit, { damage: p.damage, from: p.shooter, projectile: true, blunt: (p.flags & ProjectileFlag.Blunt) !== 0, pierce: (p.flags & ProjectileFlag.Blunt) === 0 });
          if (d > 0 && p.flags & ProjectileFlag.Poison && e.hp[hit]! > 0) {
            e.dotLeft[hit] = (e.dotUntil[hit]! > state.step ? e.dotLeft[hit]! : 0) + POISON.damage;
            e.dotUntil[hit] = state.step + POISON.steps;
            e.dotFrom[hit] = p.shooter;
          }
        }
        done = true;
        break;
      }
      const cx = floorDiv(x, WU_PER_COLUMN);
      const cz = floorDiv(z, WU_PER_COLUMN);
      const bid = state.buildings.solidAt(cx, cz);
      if (bid !== 0 && bid !== startBuilding) {
        const b = state.buildings.get(bid);
        if (b && y < buildingTop(b)) {
          hurtBuilding(state, b, SHOTS[p.shot]!.vsWalls, x, y, z);
          // A fire bolt sets dry wood smouldering (Table 17: Spark toss).
          if (p.flags & ProjectileFlag.Fire && p.side !== Side.Players) smoulder(state, b, SPARK.smoulderPerSecond, SPARK.smoulderSteps);
          done = true;
          break;
        }
      }
      const tree = treeAt(state, cx, cz);
      if (tree > 0 && y < tree && y > state.world.topAt(cx, cz) * WU_PER_TERRAIN_UNIT) {
        state.hits.push({ look: 'wood', x, y, z, id: 0 }, { look: 'shake', x: cx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), y, z: cz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), id: 0 });
        done = true;
        break;
      }
      if (y < state.world.topAt(cx, cz) * WU_PER_TERRAIN_UNIT) {
        state.hits.push({ look: 'stone', x, y, z, id: 0 });
        done = true;
        break;
      }
    }
    if (!done && p.age < MAX_AGE) keep.push(p);
  }
  state.projectiles = keep;
}

