// What the night's mobs do each step (Threats: night mobs; Monsters and
// terrain; the mob roster's abilities for nights 0 to 20; Day and night:
// sunburn and fleeing at dawn). A mob goes for the players' units that come
// within its sight and otherwise follows its kind's field to the town,
// attacking what stands in its way: walkers chew through, climbers go over
// (slowly, and not over a shut gate lit by a torch), flyers come straight
// in, and bombers blow up against walls, barriers or a crowd of troops.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, dist2, isLit } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { CLIMBER, WALKER, type Mover } from '../nav/grid.ts';
import { pointGoal, TILE_COLUMNS } from '../nav/path.ts';
import { burnThisStep } from '../rules.ts';
import { MONSTERS, OrderKind, SIGHT_WU, standY, UnitKind, type SimState } from '../state.ts';
import { Mat } from '../world/materials.ts';
import { blast, BOMB_BUILDINGS, BOMB_UNITS, dealt, OVER_WALL_REACH, wallBetween, forward, gap, gapToBuilding, hurtBuilding, hurtUnit, Side, sideOf, bodyHeight } from './combat.ts';
import { costAt, fieldFor, MobClass, nextStep, UNREACHED } from './fields.ts';
import { Shot } from './items.ts';
import { BLAST, CLUSTER, ENGULF_STEPS, FLY_HEIGHT, GRASP, HOWL, Mob, mobSpec, Moves, SHOUT, Sun, SUNBURN_PER_MILLE_PER_SECOND, SWOOP_HEIGHT, WEB, type MobSpec } from './mobs.ts';
import { fireAt, hasClearLob, ProjectileFlag } from './projectiles.ts';

/** How far a mob notices the players' units: its sight, 12 m. */
const AGGRO_WU = SIGHT_WU[UnitKind.Mob];
/** It gives a unit up once it is this much farther away. */
const GIVE_UP_WU = AGGRO_WU + 8 * WU_PER_METRE;
/** Bats and hounds look farther for their prey (s): hounds run past the front line to reach workers. */
const HUNT_WU = 30 * WU_PER_METRE;
/** Goblins go for lit torches within this distance first (s). */
const TORCH_HUNT_WU = 40 * WU_PER_METRE;
/** Fine path searches the mobs may make each step, shared (s). */
export const MOB_SEARCHES_PER_STEP = 6;
/** A fine path is looked for again after this long. */
const REPATH_STEPS = 40;
/** A mob running from the sun is gone after this long, or once this far from the town (s). */
const FLEE_STEPS = 15 * STEPS_PER_SECOND;
const FLEE_GONE_WU = 80 * WU_PER_METRE;
/** A bomber goes off when this close to a unit of the crowd it went for. */
const BOMB_REACH_WU = floorDiv(WU_PER_METRE * 3, 2);
/** Hit tolerance at the key moment, as for the players' units. */
const TOLERANCE = WU_PER_METRE >> 1;
/** What a mob's attack under way is aimed at (atkWith). */
const With = { Unit: 0, Building: 1, Shot: 3, Web: 5 } as const;

/** Not state: fine path searches made this step (reset by the step function). */
export const mobBudget = { searches: 0 };

export function classOf(spec: MobSpec): MobClass | -1 {
  if (spec.moves === Moves.Climber) return MobClass.Climber;
  if (spec.moves === Moves.Breaker) return MobClass.Breaker;
  if (spec.moves === Moves.Walker) return MobClass.Walker;
  return -1;
}

function moverOf(spec: MobSpec): Mover {
  return spec.moves === Moves.Climber ? CLIMBER : WALKER;
}

/** The middle of a player's town: their main base, else their first building, else null. */
export function townCentre(state: SimState, player: number): [number, number] | null {
  let first: Building | null = null;
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    if (b.kind === 0) return buildingCentre(b);
    first ??= b;
  }
  return first ? buildingCentre(first) : null;
}

function groundAt(state: SimState, x: number, z: number): number {
  return state.world.topAt(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN)) * WU_PER_TERRAIN_UNIT;
}

/** A mob's speed this step: hastened by a hound's howl or a goblin chief's shout. */
function mobSpeed(state: SimState, i: number, spec: MobSpec): number {
  const e = state.entities;
  let bp = 10000;
  if (e.fastUntil[i]! > state.step) bp += e.fastBp[i]!;
  if (spec.id === Mob.GoblinCutter || spec.id === Mob.GoblinSlinger) {
    for (const j of state.grid.near(e.x[i]!, e.z[i]!, SHOUT.radius)) {
      if (e.kind[j] === UnitKind.Mob && e.mob[j] === Mob.GoblinChief && e.hp[j]! > 0 && length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) <= SHOUT.radius) {
        bp += SHOUT.bonusBp;
        break;
      }
    }
  }
  return floorDiv(e.speed[i]! * bp, 10000);
}

function playerUnit(state: SimState, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.inside[j] === 0 && sideOf(state, j) === Side.Players;
}

/** The players' unit a mob goes for: the one that hurt it, else the closest in sight (hounds: workers and archers first). */
function pickUnit(state: SimState, i: number, spec: MobSpec): number {
  const e = state.entities;
  const a = e.indexOf(e.attacker[i]!);
  if (a >= 0 && playerUnit(state, a) && state.step - e.hurtAt[i]! < 5 * STEPS_PER_SECOND && gap(state, i, a) <= GIVE_UP_WU) return a;
  const hunts = spec.id === Mob.GraveHound || spec.id === Mob.CaveBat;
  const range = hunts ? HUNT_WU : AGGRO_WU;
  let best = -1;
  let bestTier = 9;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, range)) {
    if (!playerUnit(state, j)) continue;
    const d = gap(state, i, j);
    if (d > range) continue;
    // Hounds want the soft targets: workers and archers before warriors in melee.
    const soft = e.kind[j] === UnitKind.Worker || e.ranged[j] !== 0;
    const tier = spec.id === Mob.GraveHound ? (soft ? 0 : d <= AGGRO_WU ? 1 : 9) : d <= AGGRO_WU || hunts ? 0 : 9;
    if (tier === 9) continue;
    if (tier < bestTier || (tier === bestTier && (d < bestD || (d === bestD && e.id[j]! < e.id[best]!)))) {
      best = j;
      bestTier = tier;
      bestD = d;
    }
  }
  return best;
}

/** Goblins want lit torches: the closest of the foe's lit lights within reach of their hunt, or undefined. */
function pickTorch(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  const r2 = TORCH_HUNT_WU * TORCH_HUNT_WU;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length || !isLit(b, state.step)) continue;
    const [x, z] = buildingCentre(b);
    const d = dist2(x, z, e.x[i]!, e.z[i]!);
    if (d > r2 || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Whether a shut gate is lit by one of its owner's torches (rats and spiders will not climb it). */
function litGate(state: SimState, b: Building): boolean {
  if (buildingSpec(b.kind).defence !== 'gate') return false;
  const [gx, gz] = buildingCentre(b);
  for (const l of state.buildings.list) {
    const light = buildingSpec(l.kind).light;
    if (!light || l.owner !== b.owner || !isLit(l, state.step)) continue;
    const [lx, lz] = buildingCentre(l);
    const r = light.lightM * WU_PER_METRE;
    if (dist2(lx, lz, gx, gz) <= r * r) return true;
  }
  return false;
}

const MOVED = 0;
const BLOCKED_BUILDING = 1;
const BLOCKED_LAND = 2;

/**
 * One step straight towards a point on the ground. Returns MOVED, or what
 * stood in the way: a building (its id in `blocker`) or the land.
 */
function stepMob(state: SimState, i: number, spec: MobSpec, px: number, pz: number, speed: number, blocker: { id: number }): number {
  const e = state.entities;
  const dx = px - e.x[i]!;
  const dz = pz - e.z[i]!;
  const d = length2d(dx, dz);
  if (d === 0) return MOVED;
  const s = Math.min(speed, d);
  const nx = e.x[i]! + floorDiv(dx * s, d);
  const nz = e.z[i]! + floorDiv(dz * s, d);
  e.heading[i] = headingTowards(dx, dz);
  if (spec.moves === Moves.LowFlyer) {
    e.x[i] = nx;
    e.z[i] = nz;
    e.y[i] = groundAt(state, nx, nz) + FLY_HEIGHT;
    e.order[i] = OrderKind.Move;
    return MOVED;
  }
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const ncx = floorDiv(nx, WU_PER_COLUMN);
  const ncz = floorDiv(nz, WU_PER_COLUMN);
  if (ncx !== cx || ncz !== cz) {
    const mover = moverOf(spec);
    if (state.nav.stepCost(cx, cz, ncx, ncz, mover) < 0) {
      // A building in the way (on the column ahead, or either side of a diagonal)?
      for (const [x, z] of [[ncx, ncz], [ncx, cz], [cx, ncz]] as const) {
        const b = state.buildings.solidAt(x, z);
        if (b !== 0) {
          blocker.id = b;
          return BLOCKED_BUILDING;
        }
      }
      // Slide along whichever axis is open.
      if (ncx !== cx && state.nav.stepCost(cx, cz, ncx, cz, mover) >= 0) return slide(state, i, nx, e.z[i]!);
      if (ncz !== cz && state.nav.stepCost(cx, cz, cx, ncz, mover) >= 0) return slide(state, i, e.x[i]!, nz);
      return BLOCKED_LAND;
    }
  }
  e.x[i] = nx;
  e.z[i] = nz;
  e.y[i] = standY(state, nx, nz);
  e.order[i] = OrderKind.Move;
  return MOVED;
}

function slide(state: SimState, i: number, x: number, z: number): number {
  const e = state.entities;
  e.x[i] = x;
  e.z[i] = z;
  e.y[i] = standY(state, x, z);
  e.order[i] = OrderKind.Move;
  return MOVED;
}

/**
 * Walks towards a point, round the land in the way by a short fine path
 * when going straight is blocked. Returns what blocked it, if anything.
 */
function goToward(state: SimState, i: number, spec: MobSpec, px: number, pz: number, blocker: { id: number }): number {
  const e = state.entities;
  const speed = mobSpeed(state, i, spec);
  const pts = e.path[i]!;
  // Following a detour round the land.
  if (pts.length > 0 && e.pathAt[i]! * 2 < pts.length && state.step < e.waitUntil[i]!) {
    const k = e.pathAt[i]! * 2;
    const r = stepMob(state, i, spec, pts[k]!, pts[k + 1]!, speed, blocker);
    if (r === MOVED) {
      if (e.x[i] === pts[k] && e.z[i] === pts[k + 1]) e.pathAt[i] = e.pathAt[i]! + 1;
      return MOVED;
    }
    e.path[i] = [];
    return r;
  }
  const r = stepMob(state, i, spec, px, pz, speed, blocker);
  if (r !== BLOCKED_LAND) return r;
  if (mobBudget.searches >= MOB_SEARCHES_PER_STEP) return MOVED;
  mobBudget.searches++;
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const found = state.paths.find(moverOf(spec), cx, cz, { ...pointGoal(floorDiv(px, WU_PER_COLUMN), floorDiv(pz, WU_PER_COLUMN)), max: 1 });
  if (found.points.length === 0) return BLOCKED_LAND;
  const out: number[] = [];
  for (let k = 0; k < found.points.length; k++) out.push(found.points[k]! * WU_PER_COLUMN + (WU_PER_COLUMN >> 1));
  e.path[i] = out;
  e.pathAt[i] = 0;
  e.waitUntil[i] = state.step + REPATH_STEPS;
  return MOVED;
}

/** Starts a mob's attack on a unit, a building or with a shot; it lands at 40% of its attack time. */
function begin(state: SimState, i: number, spec: MobSpec, target: number, withWhat: number, steps = spec.attackSteps): void {
  const e = state.entities;
  e.target[i] = target;
  e.atkAt[i] = state.step + Math.max(1, floorDiv(steps * 2, 5));
  e.atkNext[i] = state.step + steps;
  e.atkWith[i] = withWhat;
  e.order[i] = withWhat === With.Shot || withWhat === With.Web ? OrderKind.Shoot : OrderKind.Attack;
  // A bat swoops down to strike.
  if (spec.moves === Moves.LowFlyer && withWhat === With.Unit) e.y[i] = groundAt(state, e.x[i]!, e.z[i]!) + SWOOP_HEIGHT;
}

/** The key moment of a mob's attack. */
function land(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const what = e.atkWith[i]!;
  e.atkAt[i] = 0;
  const id = e.target[i]!;
  if (what === With.Building) {
    const b = state.buildings.get(id);
    if (!b || gapToBuilding(state, i, b) > spec.reach + TOLERANCE) return;
    let dmg = floorDiv(spec.vsWalls * e.power[i]!, 1000);
    // Rats gnaw wooden gates for double (roster).
    if (spec.id === Mob.GiantRat && buildingSpec(b.kind).defence === 'gate' && buildingSpec(b.kind).wooden !== false) dmg *= 2;
    hurtBuilding(state, b, dmg, e.x[i]!, e.y[i]! + floorDiv(spec.height, 2), e.z[i]!);
    return;
  }
  const t = e.indexOf(id);
  if (t < 0 || !playerUnit(state, t)) return;
  const fromY = e.y[i]! + floorDiv(spec.height * 2, 3);
  if (what === With.Shot) {
    const flags = spec.shot === Shot.GoblinStone ? ProjectileFlag.Blunt : 0;
    fireAt(state, i, e.x[i]!, fromY, e.z[i]!, t, spec.shot, dealt(state, i, spec.damage), spec.spreadBp, flags);
    return;
  }
  if (what === With.Web) {
    fireAt(state, i, e.x[i]!, fromY, e.z[i]!, t, Shot.Web, 0, spec.spreadBp, ProjectileFlag.Web);
    e.abilityAt[i] = state.step + WEB.cooldown;
    return;
  }
  if (!inReach(state, i, t, { ...spec, reach: spec.reach + TOLERANCE })) return;
  const blow = { damage: dealt(state, i, spec.damage), from: e.id[i]!, projectile: false, blunt: false, pierce: false };
  if (spec.arc) {
    // A bloated corpse's swing hits everything in front of it.
    const [fx, fz] = forward(e.heading[i]!);
    for (const j of state.grid.near(e.x[i]!, e.z[i]!, spec.reach + WU_PER_METRE)) {
      if (!playerUnit(state, j) || gap(state, i, j) > spec.reach + TOLERANCE || wallBetween(state, i, j)) continue;
      const dx = e.x[j]! - e.x[i]!;
      const dz = e.z[j]! - e.z[i]!;
      if (j !== t && dx * fx + dz * fz < length2d(dx, dz) * 46341) continue;
      hurtUnit(state, j, blow);
    }
  } else hurtUnit(state, t, blow);
  if (spec.id === Mob.Zombie) {
    // Grasp: slowed by 20% for 2 s.
    e.slowUntil[t] = state.step + GRASP.steps;
    e.slowBp[t] = GRASP.slowBp;
  }
  if (spec.id === Mob.Slime && e.kind[t] === UnitKind.Worker) {
    // Engulf: a worker is held still for 2 s.
    e.heldUntil[t] = state.step + ENGULF_STEPS;
    e.heldUntil[i] = state.step + ENGULF_STEPS;
  }
}

/** A bomber or a loose bomb goes off: walls and buildings within 2.5 m, units within 3 m; against bare land it caves the edge in. */
export function explode(state: SimState, i: number, breach: boolean): void {
  const e = state.entities;
  blast(state, e.x[i]!, e.y[i]! + WU_PER_METRE, e.z[i]!, BOMB_UNITS, BOMB_BUILDINGS, e.id[i]!);
  if (breach) caveIn(state, e.x[i]!, e.z[i]!, BLAST.buildingRadius);
  // Went off by itself: no loose bomb is left behind.
  e.fuseAt[i] = 1;
  e.hitters[i] = [];
  if (e.hp[i]! > 0) {
    e.hp[i] = 0;
    state.dying.push(e.id[i]!);
  }
}

/**
 * Smashing terrain into a crossing (Monsters and terrain): the columns
 * within the radius settle to their average height, the high ones knocked
 * down into the low ones, so no earth is made or lost.
 */
export function caveIn(state: SimState, x: number, z: number, radius: number): void {
  const w = state.world;
  const cols: Array<[number, number, number]> = [];
  const r = floorDiv(radius, WU_PER_COLUMN);
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  let sum = 0;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      if (state.buildings.footprintAt(cx + dx, cz + dz) !== 0) continue;
      const top = w.topAt(cx + dx, cz + dz);
      cols.push([cx + dx, cz + dz, top]);
      sum += top;
    }
  }
  if (cols.length === 0) return;
  const level = floorDiv(sum, cols.length);
  for (const [qx, qz, top] of cols) {
    if (top > level) w.editBox(qx, qz, qx, qz, level, top, Mat.Air);
    else if (top < level) w.editBox(qx, qz, qx, qz, top, level, Mat.Soil);
  }
  state.hits.push({ look: 'stone', x, y: level * WU_PER_TERRAIN_UNIT, z, id: 0 });
}

/** Whether a mob can reach a unit with its melee attack now. */
function inReach(state: SimState, i: number, t: number, spec: MobSpec): boolean {
  return gap(state, i, t) <= spec.reach && (spec.reach >= OVER_WALL_REACH || !wallBetween(state, i, t));
}

/** A crowd of 5 or more of the players' units within 8 m: its middle, or null. */
function crowdNear(state: SimState, i: number): [number, number] | null {
  const e = state.entities;
  let n = 0;
  let sx = 0;
  let sz = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, CLUSTER.radius)) {
    if (!playerUnit(state, j) || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > CLUSTER.radius) continue;
    n++;
    sx += e.x[j]!;
    sz += e.z[j]!;
  }
  return n >= CLUSTER.units ? [floorDiv(sx, n), floorDiv(sz, n)] : null;
}

/** What a mob does when something blocks its way: climb it, blow it up, or break it. */
function blocked(state: SimState, i: number, spec: MobSpec, r: number, blocker: { id: number }): void {
  const e = state.entities;
  if (spec.moves === Moves.Breaker) {
    explode(state, i, r === BLOCKED_LAND);
    return;
  }
  if (r !== BLOCKED_BUILDING) return;
  const b = state.buildings.get(blocker.id);
  if (!b) return;
  if (spec.moves === Moves.Climber && b.owner < state.players.length && !litGate(state, b) && startClimb(state, i, spec, b)) return;
  if (spec.vsWalls > 0 && state.step >= e.atkNext[i]!) begin(state, i, spec, b.id, With.Building);
}

/** Climbs over a building: slow, and the mob comes down on its far side. */
function startClimb(state: SimState, i: number, spec: MobSpec, b: Building): boolean {
  const e = state.entities;
  const [fx, fz] = forward(e.heading[i]!);
  let x = e.x[i]!;
  let z = e.z[i]!;
  // March on in the direction it faces until past the building.
  for (let k = 0; k < 24; k++) {
    x += floorDiv(fx * (WU_PER_COLUMN >> 1), 65536);
    z += floorDiv(fz * (WU_PER_COLUMN >> 1), 65536);
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    if (state.buildings.solidAt(cx, cz) !== 0) continue;
    if (!state.nav.standable(cx, cz, WALKER)) return false;
    const height = floorDiv(buildingSpec(b.kind).heightCm * WU_PER_METRE, 100);
    e.climbUntil[i] = state.step + Math.max(1, floorDiv(height, Math.max(1, spec.climbSpeed)));
    e.climbX[i] = x;
    e.climbZ[i] = z;
    e.y[i] = b.y * WU_PER_TERRAIN_UNIT + (height >> 1);
    e.order[i] = OrderKind.Climb;
    return true;
  }
  return false;
}

/** Sends a mob for its foe's town along its kind's field. */
function marchOnTown(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const blocker = { id: 0 };
  const cls = classOf(spec);
  const town = townCentre(state, e.foe[i]!);
  if (!town) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  let px = town[0];
  let pz = town[1];
  if (cls !== -1) {
    const f = fieldFor(state, e.foe[i]!, cls);
    const tx = floorDiv(e.x[i]!, WU_PER_COLUMN * TILE_COLUMNS);
    const tz = floorDiv(e.z[i]!, WU_PER_COLUMN * TILE_COLUMNS);
    if (f) {
      const here = costAt(f, tx, tz);
      if (here === 0) {
        // At a building it came for: break it.
        const b = goalNear(state, i);
        if (b) {
          if (gapToBuilding(state, i, b) <= spec.reach) {
            if (spec.moves === Moves.Breaker) explode(state, i, false);
            else if (state.step >= e.atkNext[i]!) begin(state, i, spec, b.id, With.Building);
            return;
          }
          [px, pz] = buildingCentre(b);
        }
      } else if (here !== UNREACHED) {
        const next = nextStep(state, f, tx, tz);
        if (next) [px, pz] = next;
      }
    }
  }
  const r = goToward(state, i, spec, px, pz, blocker);
  if (r !== MOVED) blocked(state, i, spec, r, blocker);
}

/** The closest of its foe's buildings to a mob, within a few metres. */
function goalNear(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.foe[i]) continue;
    const d = gapToBuilding(state, i, b);
    if (d > 6 * WU_PER_METRE || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Runs from the dawn (or with loot): away from the town, gone after a while or once far enough. */
function flee(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  e.timer[i] = e.timer[i]! + 1;
  const town = townCentre(state, e.foe[i]!) ?? [0, 0];
  const dx = e.x[i]! - town[0];
  const dz = e.z[i]! - town[1];
  if (e.timer[i]! > FLEE_STEPS || length2d(dx, dz) > FLEE_GONE_WU) {
    vanish(state, i);
    return;
  }
  const d = Math.max(1, length2d(dx, dz));
  const blocker = { id: 0 };
  goToward(state, i, spec, e.x[i]! + floorDiv(dx * 20 * WU_PER_METRE, d), e.z[i]! + floorDiv(dz * 20 * WU_PER_METRE, d), blocker);
  e.order[i] = OrderKind.Flee;
}

/** Leaves the game quietly (ran off): no death, no experience, no drops. */
export function vanish(state: SimState, i: number): void {
  const e = state.entities;
  if (e.hp[i]! < 0) return;
  e.hp[i] = -1;
  state.dying.push(e.id[i]!);
}

/** One step of one mob. */
export function runMob(state: SimState, i: number): void {
  const e = state.entities;
  if (e.hp[i]! <= 0) return;
  const spec = mobSpec(e.mob[i]!);
  e.order[i] = OrderKind.Idle;
  if (spec.id === Mob.BombKeg) {
    if (state.step >= e.fuseAt[i]!) explode(state, i, false);
    return;
  }
  // The foe was eliminated: go for whoever is left.
  if (state.players[e.foe[i]!]?.out) {
    const next = state.players.findIndex((p) => !p.out);
    if (next < 0) return;
    e.foe[i] = next;
  }
  if (e.fleeing[i]) {
    flee(state, i, spec);
    return;
  }
  if (e.climbUntil[i] !== 0) {
    if (state.step < e.climbUntil[i]!) {
      e.order[i] = OrderKind.Climb;
      return;
    }
    e.x[i] = e.climbX[i]!;
    e.z[i] = e.climbZ[i]!;
    e.y[i] = standY(state, e.x[i]!, e.z[i]!);
    e.climbUntil[i] = 0;
  }
  if (e.atkAt[i] !== 0) {
    if (state.step < e.atkAt[i]!) {
      e.order[i] = e.atkWith[i] === With.Shot || e.atkWith[i] === With.Web ? OrderKind.Shoot : OrderKind.Attack;
      return;
    }
    land(state, i, spec);
  }
  if (e.heldUntil[i]! > state.step) return;
  if (state.step < e.atkNext[i]!) {
    // Recovering from its last attack: it stands, facing its target.
    e.order[i] = OrderKind.Idle;
    return;
  }
  const blocker = { id: 0 };
  if (spec.moves === Moves.Breaker) {
    const crowd = crowdNear(state, i);
    if (crowd) {
      for (const j of state.grid.near(e.x[i]!, e.z[i]!, BOMB_REACH_WU)) {
        if (playerUnit(state, j) && gap(state, i, j) <= BOMB_REACH_WU) {
          explode(state, i, false);
          return;
        }
      }
      const r = goToward(state, i, spec, crowd[0], crowd[1], blocker);
      if (r !== MOVED) blocked(state, i, spec, r, blocker);
      return;
    }
    marchOnTown(state, i, spec);
    return;
  }
  // Goblins put out torches first.
  if (spec.id === Mob.GoblinCutter || spec.id === Mob.GoblinChief) {
    const torch = pickTorch(state, i);
    if (torch && pickUnit(state, i, spec) < 0) {
      if (gapToBuilding(state, i, torch) <= spec.reach) begin(state, i, spec, torch.id, With.Building);
      else {
        const [x, z] = buildingCentre(torch);
        const r = goToward(state, i, spec, x, z, blocker);
        if (r !== MOVED) blocked(state, i, spec, r, blocker);
      }
      return;
    }
  }
  let t = e.indexOf(e.target[i]!);
  if (t < 0 || !playerUnit(state, t) || gap(state, i, t) > GIVE_UP_WU) t = pickUnit(state, i, spec);
  if (t < 0) {
    e.target[i] = 0;
    marchOnTown(state, i, spec);
    return;
  }
  e.target[i] = e.id[t]!;
  // A bat stays down among its prey while it is close enough to strike, and climbs back up to travel.
  if (spec.moves === Moves.LowFlyer) e.y[i] = groundAt(state, e.x[i]!, e.z[i]!) + (gap(state, i, t) <= spec.reach + WU_PER_METRE ? SWOOP_HEIGHT : FLY_HEIGHT);
  if (spec.id === Mob.GraveHound && state.step >= e.abilityAt[i]!) howl(state, i);
  const d = gap(state, i, t);
  // Ranged mobs shoot from range; spiders spit web when it is ready.
  if (spec.id === Mob.GiantSpider && d <= spec.range && d > spec.reach && state.step >= e.abilityAt[i]!) {
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Web, STEPS_PER_SECOND);
    return;
  }
  if (spec.range > 0 && spec.id !== Mob.GiantSpider && d <= spec.range && d > spec.reach + WU_PER_METRE) {
    // A wall in the way of every arc: shoot at someone else in range it can hit, if there is one.
    const better = shotAt(state, i, spec, t);
    if (better !== t) {
      t = better;
      e.target[i] = e.id[t]!;
    }
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Shot);
    return;
  }
  if (inReach(state, i, t, spec)) {
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Unit);
    return;
  }
  const r = goToward(state, i, spec, e.x[t]!, e.z[t]!, blocker);
  if (r !== MOVED) blocked(state, i, spec, r, blocker);
}

/** How many other targets an archer tries for a clear shot in one step. */
const CLEAR_SHOT_TRIES = 4;

/** The target, or the nearest other unit in range with a clear arc when the target has none (the clear shot search). */
function shotAt(state: SimState, i: number, spec: MobSpec, t: number): number {
  const e = state.entities;
  const fromY = e.y[i]! + floorDiv(spec.height * 2, 3);
  const clear = (j: number): boolean => hasClearLob(state, spec.shot, e.x[i]!, fromY, e.z[i]!, e.x[j]!, e.y[j]! + floorDiv(bodyHeight(state, j), 2), e.z[j]!);
  if (clear(t)) return t;
  const near: Array<[number, number]> = [];
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, spec.range)) {
    if (j === t || !playerUnit(state, j)) continue;
    const d = gap(state, i, j);
    if (d <= spec.range) near.push([d, j]);
  }
  near.sort((a, b) => a[0] - b[0] || e.id[a[1]]! - e.id[b[1]]!);
  for (const [, j] of near.slice(0, CLEAR_SHOT_TRIES)) if (clear(j)) return j;
  return t;
}

function face(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const dx = e.x[t]! - e.x[i]!;
  const dz = e.z[t]! - e.z[i]!;
  if (dx !== 0 || dz !== 0) e.heading[i] = headingTowards(dx, dz);
}

function howl(state: SimState, i: number): void {
  const e = state.entities;
  e.abilityAt[i] = state.step + HOWL.cooldown;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, HOWL.radius)) {
    if (e.kind[j] !== UnitKind.Mob || e.hp[j]! <= 0 || !mobSpec(e.mob[j]!).undead) continue;
    if (length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > HOWL.radius) continue;
    e.fastUntil[j] = state.step + HOWL.steps;
    e.fastBp[j] = HOWL.bonusBp;
  }
  state.hits.push({ look: 'swing', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

// ----- spawning a mob -----

/** Adds a mob of a kind for a foe at a point, at its strength for the night; returns its index. */
export function addMob(state: SimState, mob: number, foe: number, x: number, z: number, night: number): number {
  const spec = mobSpec(mob);
  const e = state.entities;
  const id = state.nextEntityId++;
  const ground = standY(state, x, z);
  const y = spec.moves === Moves.LowFlyer ? groundAt(state, x, z) + FLY_HEIGHT : ground;
  const i = e.add(id, MONSTERS, x, y, z, spec.speed, UnitKind.Mob);
  e.mob[i] = mob;
  e.foe[i] = foe;
  const power = 1000 + 5 * Math.max(0, night - spec.firstNight);
  e.power[i] = power;
  e.hp[i] = Math.max(1, floorDiv(spec.hp * power, 1000));
  e.maxHp[i] = e.hp[i]!;
  e.rank[i] = 0;
  e.tool[i] = 0;
  state.grid.insert(e, i);
  return i;
}

// ----- the sun -----

/**
 * At dawn and by day (Day and night): most mobs lose 10% of their maximum
 * health a second in the sunlight; goblins and bats run for the dark.
 */
export function updateSun(state: SimState): void {
  const c = clockAt(state.step, state.blood);
  if (c.period !== Period.Dawn && c.period !== Period.Day) return;
  const e = state.entities;
  const k = state.step % STEPS_PER_SECOND;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0) continue;
    const spec = mobSpec(e.mob[i]!);
    if (spec.sun === Sun.Flees) {
      if (!e.fleeing[i]) {
        e.fleeing[i] = 1;
        e.timer[i] = 0;
        e.atkAt[i] = 0;
        e.target[i] = 0;
        e.path[i] = [];
      }
      continue;
    }
    const burn = burnThisStep(floorDiv(e.maxHp[i]! * SUNBURN_PER_MILLE_PER_SECOND, 1000), k);
    if (burn <= 0) continue;
    e.hp[i] = e.hp[i]! - burn;
    if (k === 0) state.hits.push({ look: 'burst', x: e.x[i]!, y: e.y[i]! + (bodyHeight(state, i) >> 1), z: e.z[i]!, id: e.id[i]! });
    if (e.hp[i]! <= 0) {
      // Burnt by the sun: nobody earns it, and it drops nothing.
      e.hp[i] = 0;
      e.hitters[i] = [];
      state.dying.push(e.id[i]!);
    }
  }
}

