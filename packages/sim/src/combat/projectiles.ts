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
import { OrderKind, PEOPLES, UnitKind, type Projectile, type SimState } from '../state.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { isTree } from '../world/props.ts';
import { bodyHeight, forward, halfWidth, hurtBuilding, hurtUnit, shotMayHit, Side, sideOf } from './combat.ts';
import { SHOTS } from './items.ts';
import { isStructure } from './mobs.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { WEB } from './mobs.ts';
import { smoulder, SPARK } from '../threats/burns.ts';
import { fireballBurst } from '../magic/cast.ts';

/** Gravity, wu per step per step: 9.8 m/s2 at 20 steps a second. Even, so half of it times k squared stays whole. */
export const GRAVITY = 196;
/** A projectile still flying after 8 s is gone. */
const MAX_AGE = 8 * STEPS_PER_SECOND;
/** Each step's stretch is checked in pieces no longer than half a column (22 cm). */
const PIECE_WU = WU_PER_COLUMN >> 1;
/** Shots leave a person's hand at 1.4 m. */
export const HAND_HEIGHT = floorDiv(WU_PER_METRE * 14, 10);

/**
 * Spell: a spell that flies (Spark toss, a mana bolt, an Arcane bolt, a
 * Fireball): Warding halves it (Table 13). Burst: a Fireball, which bursts
 * where it stops (magic/cast.ts fireballBurst).
 */
/** Bit 8 was a venom-coated arrow's, which nothing ever fired; Patch 2 cut it with the Herbalist hut. */
export const ProjectileFlag = { Blunt: 1, Fire: 2, Web: 4, Spell: 16, Burst: 32, Siege: 64, Pierce: 128 } as const;

/** Milestone 8. Siege: an engine's shot, which does its damage against walls to the foes' structures too (lairs, huts) (s). Pierce: a ballista bolt goes on through one more foe behind its first. */

/** Poison from a bite or a sting works over 5 s (roster 6.1), on top of the hit. */
export const POISON = { steps: 5 * STEPS_PER_SECOND };

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
 * Where each flyer was before its move this step (runMob notes it), so a
 * shot meets a flyer in its swoop wherever it is along the step, as it
 * meets one holding still, not only where it ends the step.
 */
const flights = new WeakMap<SimState, { step: number; from: Map<number, readonly [number, number, number]> }>();

/** Notes where a flyer is before it moves this step. */
export function noteFlight(state: SimState, i: number): void {
  let f = flights.get(state);
  if (!f || f.step !== state.step) {
    f = { step: state.step, from: new Map() };
    flights.set(state, f);
  }
  const e = state.entities;
  f.from.set(e.id[i]!, [e.x[i]!, e.y[i]!, e.z[i]!]);
}

/** Where a flyer was before its move this step, if noted. */
function flightFrom(state: SimState, i: number): readonly [number, number, number] | undefined {
  const f = flights.get(state);
  return f && f.step === state.step ? f.from.get(state.entities.id[i]!) : undefined;
}

/** Where a flyer will be after some more steps of its own, the first at a step given (mob-ai.ts flyerAhead, set in step.ts): its swoop is no straight run to lead. */
export const aimHooks: { ahead: (state: SimState, t: number, from: number, moves: number) => [number, number, number] | null } = { ahead: () => null };

/**
 * Fires a shot at a target unit: it aims at where the target will be when
 * the shot arrives (two passes of the lead; a flyer where its swoop takes
 * it when the shot gets there), plus a random miss up to the spread share
 * of the distance, less 10% a rank for the players' units.
 */
export function fireAt(state: SimState, shooter: number, fromX: number, fromY: number, fromZ: number, t: number, shot: number, damage: number, spreadBp: number, flags: number): void {
  const e = state.entities;
  let ax = e.x[t]!;
  let az = e.z[t]!;
  const mid = bodyHeight(state, t) >> 1;
  let ay = e.y[t]! + mid;
  // A flyer's spot after a flight of so many steps: a shot reaches its mark in its flight's last step, and a target later in the step's order than the shooter has its own move this step still to come.
  const flyerAt = (steps: number): [number, number, number] | null => (t > shooter ? aimHooks.ahead(state, t, state.step, steps) : aimHooks.ahead(state, t, state.step + 1, steps - 1));
  let steps = solve(shot, fromX, fromY, fromZ, ax, ay, az).t;
  const ahead = flyerAt(steps);
  if (ahead) {
    // A swoop changes its height step by step: lead it until the flight time to the spot settles.
    let at = ahead;
    for (let pass = 0; pass < 4; pass++) {
      const next = solve(shot, fromX, fromY, fromZ, at[0], at[1] + mid, at[2]).t;
      if (next === steps) break;
      steps = next;
      at = flyerAt(steps)!;
    }
    ax = at[0];
    ay = at[1] + mid;
    az = at[2];
  } else {
    const [vx, vz] = velocityOf(state, t);
    for (let pass = 0; pass < 2; pass++) {
      const s = solve(shot, fromX, fromY, fromZ, ax, ay, az);
      ax = e.x[t]! + vx * s.t;
      az = e.z[t]! + vz * s.t;
    }
  }
  const d = length2d(ax - fromX, az - fromZ);
  let spread = floorDiv(d * spreadBp, 10000);
  if (sideOf(state, shooter) === Side.Players) spread = floorDiv(spread * (10000 - Math.min(9000, rankSpreadReductionBp(e.rank[shooter]!))), 10000);
  if (spread > 0) {
    const ox = state.rng.combat.range(-spread, spread);
    const oz = state.rng.combat.range(-spread, spread);
    // The miss is to the side of where a flyer is when the shot gets there.
    const final = ahead ? solve(shot, fromX, fromY, fromZ, ax + ox, ay, az + oz).t : steps;
    const at = final !== steps ? flyerAt(final) : null;
    if (at) {
      ax = at[0];
      ay = at[1] + mid;
      az = at[2];
    }
    ax += ox;
    az += oz;
  }
  launch(state, shooter, fromX, fromY, fromZ, ax, ay, az, shot, damage, flags, clearLob(state, shot, fromX, fromY, fromZ, ax, ay, az, false));
}

export function launch(state: SimState, shooter: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, shot: number, damage: number, flags: number, lobPct = 100): void {
  const e = state.entities;
  const s = solve(shot, x0, y0, z0, x1, y1, z1, lobPct);
  state.projectiles.push({
    shot, side: sideOf(state, shooter), shooter: e.id[shooter]!, owner: e.owner[shooter]!, faction: e.owner[shooter] === PEOPLES ? e.group[shooter]! : 0,
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
  const p: Projectile = { shot, side: 0, shooter: 0, owner: 0, faction: 0, x0, y0, z0, vx: s.vx, vy: s.vy, vz: s.vz, age: 0, damage: 0, flags: 0 };
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

/**
 * Line of sight from one point to another (Combat: non-projectile spells
 * need it to cast): no ground, building or tree in between, checked every
 * half column. The buildings the two ends stand on or in do not count.
 */
export function lineOfSight(state: SimState, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const n = Math.max(1, floorDiv(length2d(x1 - x0, z1 - z0) + PIECE_WU - 1, PIECE_WU));
  const startBuilding = state.buildings.solidAt(floorDiv(x0, WU_PER_COLUMN), floorDiv(z0, WU_PER_COLUMN));
  const endBuilding = state.buildings.solidAt(floorDiv(x1, WU_PER_COLUMN), floorDiv(z1, WU_PER_COLUMN));
  for (let q = 1; q < n; q++) {
    const x = x0 + floorDiv((x1 - x0) * q, n);
    const y = y0 + floorDiv((y1 - y0) * q, n);
    const z = z0 + floorDiv((z1 - z0) * q, n);
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    const ground = state.world.topAt(cx, cz) * WU_PER_TERRAIN_UNIT;
    if (y < ground) return false;
    const id = state.buildings.solidAt(cx, cz);
    if (id !== 0 && id !== startBuilding && id !== endBuilding) {
      const b = state.buildings.get(id);
      if (b && b.hp > 0 && y < buildingTop(b)) return false;
    }
    const tree = treeAt(state, cx, cz);
    if (tree > 0 && y < tree && y > ground) return false;
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
        if (!shotMayHit(state, p.side, p.faction, p.owner, j)) continue;
        let jx = e.x[j]!;
        let jy = e.y[j]!;
        let jz = e.z[j]!;
        // A flyer in its swoop is where it is at that point of its move this step.
        const was = e.lowUntil[j]! > state.step ? flightFrom(state, j) : undefined;
        if (was) {
          jx = was[0] + floorDiv((jx - was[0]) * q, n);
          jy = was[1] + floorDiv((jy - was[1]) * q, n);
          jz = was[2] + floorDiv((jz - was[2]) * q, n);
        }
        const hw = halfWidth(state, j);
        if (Math.abs(jx - x) > hw || Math.abs(jz - z) > hw) continue;
        if (y < jy || y > jy + bodyHeight(state, j)) continue;
        if (hit < 0 || e.id[j]! < e.id[hit]!) hit = j;
      }
      if (hit >= 0) {
        if (p.flags & ProjectileFlag.Web) {
          e.slowUntil[hit] = state.step + WEB.steps;
          e.slowBp[hit] = WEB.slowBp;
          state.hits.push({ look: 'slime', x, y, z, id: e.id[hit]! });
        } else {
          const spell = (p.flags & ProjectileFlag.Spell) !== 0;
          const damage = p.flags & ProjectileFlag.Siege && e.kind[hit] === UnitKind.Mob && isStructure(e.mob[hit]!) ? SHOTS[p.shot]!.vsWalls : p.damage;
          hurtUnit(state, hit, { damage, from: p.shooter, projectile: true, blunt: (p.flags & ProjectileFlag.Blunt) !== 0, pierce: (p.flags & ProjectileFlag.Blunt) === 0 && !spell, spell });
          if (p.flags & ProjectileFlag.Pierce) pierceOn(state, p, hit);
        }
        if (p.flags & ProjectileFlag.Burst) fireballBurst(state, p, x, y, z, hit, null);
        splash(state, p, x, y, z, hit);
        done = true;
        break;
      }
      const cx = floorDiv(x, WU_PER_COLUMN);
      const cz = floorDiv(z, WU_PER_COLUMN);
      const bid = state.buildings.solidAt(cx, cz);
      if (bid !== 0 && bid !== startBuilding) {
        const b = state.buildings.get(bid);
        if (b && y < buildingTop(b)) {
          if (p.flags & ProjectileFlag.Burst) {
            fireballBurst(state, p, x, y, z, -1, b);
            done = true;
            break;
          }
          const sp = SHOTS[p.shot]!;
          const wooden = buildingSpec(b.kind).wooden !== false;
          hurtBuilding(state, b, wooden && sp.vsWoodBp ? floorDiv(sp.vsWalls * sp.vsWoodBp, 10000) : sp.vsWalls, x, y, z);
          // A fire bolt sets dry wood smouldering (Table 17: Spark toss).
          if (p.flags & ProjectileFlag.Fire && p.side !== Side.Players) smoulder(state, b, SPARK.smoulderPerSecond, SPARK.smoulderSteps);
          splash(state, p, x, y, z, -1);
          done = true;
          break;
        }
      }
      const tree = treeAt(state, cx, cz);
      if (tree > 0 && y < tree && y > state.world.topAt(cx, cz) * WU_PER_TERRAIN_UNIT) {
        state.hits.push({ look: 'wood', x, y, z, id: 0 }, { look: 'shake', x: cx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), y, z: cz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), id: 0 });
        if (p.flags & ProjectileFlag.Burst) fireballBurst(state, p, x, y, z, -1, null);
        splash(state, p, x, y, z, -1);
        done = true;
        break;
      }
      if (y < state.world.topAt(cx, cz) * WU_PER_TERRAIN_UNIT) {
        state.hits.push({ look: 'stone', x, y, z, id: 0 });
        if (p.flags & ProjectileFlag.Burst) fireballBurst(state, p, x, y, z, -1, null);
        splash(state, p, x, y, z, -1);
        done = true;
        break;
      }
    }
    if (!done && p.age < MAX_AGE) keep.push(p);
  }
  state.projectiles = keep;
}


/**
 * Where a shot with a splash lands (Table 2f's catapult and cannons; the
 * roster's boulder, pitch and hellfire): every unit it may hit within the
 * radius but the one it struck takes the splash; burning pitch sets wood
 * within it alight.
 */
function splash(state: SimState, p: Projectile, x: number, y: number, z: number, struck: number): void {
  const sp = SHOTS[p.shot]!;
  if (!sp.splash || !sp.splashRadius) return;
  const e = state.entities;
  const r = sp.splashRadius;
  state.hits.push({ look: 'blast', x, y, z, id: p.shooter });
  for (const j of state.grid.near(x, z, r + 2 * WU_PER_METRE)) {
    if (j === struck || e.hp[j]! <= 0 || e.inside[j] !== 0 || !shotMayHit(state, p.side, p.faction, p.owner, j)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > r + halfWidth(state, j)) continue;
    hurtUnit(state, j, { damage: sp.splash, from: p.shooter, projectile: false, blunt: true, pierce: false });
  }
  if (!sp.ignite || p.side === Side.Players) return;
  for (const b of state.buildings.list) {
    if (b.hp <= 0 || buildingSpec(b.kind).wooden === false) continue;
    const [bx, bz] = buildingCentre(b);
    if (length2d(bx - x, bz - z) <= r + 2 * WU_PER_METRE) smoulder(state, b, FIRE.perSecond, FIRE.steps);
  }
}

/** Wood set alight by the demons' fire (roster: the cinderling's ignite, 8 a second for 10 s). */
export const FIRE = { perSecond: 8, steps: 10 * STEPS_PER_SECOND };

/** A ballista bolt goes on through the nearest foe within 10 m behind the one it hit, along its flight (s). */
function pierceOn(state: SimState, p: Projectile, hit: number): void {
  const e = state.entities;
  const len = Math.max(1, length2d(p.vx, p.vz));
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[hit]!, e.z[hit]!, 10 * WU_PER_METRE)) {
    if (j === hit || e.hp[j]! <= 0 || e.inside[j] !== 0 || !shotMayHit(state, p.side, p.faction, p.owner, j)) continue;
    const dx = e.x[j]! - e.x[hit]!;
    const dz = e.z[j]! - e.z[hit]!;
    const along = floorDiv(dx * p.vx + dz * p.vz, len);
    if (along <= 0 || along > 10 * WU_PER_METRE) continue;
    const side = Math.abs(floorDiv(dx * p.vz - dz * p.vx, len));
    if (side > halfWidth(state, j) + (WU_PER_METRE >> 1)) continue;
    if (best < 0 || along < bestD) {
      best = j;
      bestD = along;
    }
  }
  if (best >= 0) hurtUnit(state, best, { damage: p.damage, from: p.shooter, projectile: true, blunt: false, pierce: true });
}
