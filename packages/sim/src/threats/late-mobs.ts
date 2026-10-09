// The night mobs from night 25 to 110 and what they do beyond walking,
// biting and shooting (the mob roster 5.7 to 5.25): the plague bearer's
// miasma, the gravewing's snatch, the bone colossus's boulders at towers,
// the hollow priest's curse and raised dead, the cinderling's fire, the
// hellhound's breath, the fiend's fury, the chain fiend's hook, the void
// stalker's cloak and ambush, the juggernaut's heat and weak back, the void
// witch's drain, hex and blink, the drake's breath, the archfiend's command
// and summons, the Rift colossus's slam and beam, and the Rift-touched
// beasts' stings and rams. Morvath's spells are here too; when he comes and
// goes is threats/boss.ts. Every number the roster leaves open is (s).

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, isLit, snuffLight } from '../buildings/lights.ts';
import { garrisonRoom, type Building } from '../buildings/store.ts';
import { clockAt } from '../clock.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { MONSTERS, UnitKind, standY, type SimState } from '../state.ts';
import { WALKER } from '../nav/grid.ts';
import { bodyHeight, dealtTenths, forward, gap, gapToBuilding, halfWidth, hurtBuilding, hurtUnit, inArc, Side, sideOf, wholeDamage } from '../combat/combat.ts';
import { Shot } from '../combat/items.ts';
import { addMob, combatTroop, engageUnit, inheritRole, lateHooks, playerUnit, turnedOnTroops } from '../combat/mob-ai.ts';
import { blowTenths, Demon, FLY_HEIGHT, Mob, mobSpec, Strike, type MobSpec } from '../combat/mobs.ts';
import { buildingTop, FIRE, launch, POISON } from '../combat/projectiles.ts';
import { knockBack } from '../mounts/riding.ts';
import { leaveBuilding } from '../units/behaviour.ts';
import { smoulder } from './burns.ts';
import { necromancerAct } from './necromancer.ts';
import { Role } from './types.ts';
import { MarkKind, markOn } from './marks.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

/** The roster's numbers for the late mobs' abilities ((s) where it gives none). */
export const LATE = {
  /** Plague bearer: 1 a second within 6 m, and no natural healing while in it. */
  miasma: { radius: 6 * M, perSecond: 1 },
  /** Gravewing (and the Rift griffin): a lone worker (nobody else of its side within 6 m), within 30 m; dropped from 6 m for 38 (40 before Patch 5's 5% cut), held 2 s; low for 2 s while it swoops. */
  snatch: { damageTenths: 380, loneWu: 6 * M, huntWu: 30 * M, heldSteps: 2 * SEC, lowSteps: 2 * SEC },
  /** Bone colossus: a boulder at a tower or parapet within 20 m, every 8 s, for 23.8 (25 before Patch 5's 5% cut). */
  boulder: { range: 20 * M, cooldown: 8 * SEC, damageTenths: 238 },
  /** Hollow priest: a zombie every 12 s, up to 6 at a time, raised within 3 m. */
  raise: { cooldown: 12 * SEC, most: 6, within: 3 * M },
  /** Hellhound: a 5 m cone of fire, 11.4 a second for 2 s (12 before Patch 5's 5% cut), every 8 s; it sets wood alight. */
  breath: { reach: 5 * M, perSecondTenths: 114, steps: 2 * SEC, cooldown: 8 * SEC },
  /** Fiend: below 30% health it attacks 40% faster. */
  fury: { belowPct: 30, fasterPct: 40 },
  /** Chain fiend: a unit on a tower, parapet or wall top within 10 m, pulled down for 14.3 (15 before Patch 5's 5% cut), every 8 s. */
  hook: { range: 10 * M, damageTenths: 143, cooldown: 8 * SEC },
  /** Void stalker: unseen beyond 4 m until it attacks, unless in the light; its first strike does triple damage. */
  cloak: { seenWu: 4 * M, ambushMul: 3 },
  /** Infernal juggernaut: 4.8 a second within 3 m of its sides (5 before Patch 5's 5% cut); double damage from behind. */
  heat: { radius: 3 * M, perSecondTenths: 48 },
  /** Void witch: empties the mana of the players' mages within 10 m every 15 s; blinks up to 15 m every 10 s when a foe is within 4 m. */
  hex: { radius: 10 * M, cooldown: 15 * SEC },
  blink: { distance: 15 * M, cooldown: 10 * SEC, threat: 4 * M },
  /** Abyssal drake: its breath hits everything within 1.5 m of a 12 m line. */
  line: { width: floorDiv(3 * M, 2) },
  /** Archfiend: demons within 15 m get 20% extra damage and speed; 4 cinderlings every 20 s. */
  command: { radius: 15 * M, bonusBp: 2000 },
  summon: { count: 4, cooldown: 20 * SEC },
  /** Rift colossus: a 30 m beam at a tower or wall for 200, every 10 s. */
  beam: { range: 30 * M, damage: 200, cooldown: 10 * SEC },
  /** Rift scorpion: every other hit stings for 9.5 more and 28.5 poison over 5 s (10 and 30 before Patch 5's 5% cut); Rift hornet: a sting slows by 30% for 3 s. */
  sting: { damageTenths: 95, poisonTenths: 285 },
  hornet: { slowBp: 3000, steps: 3 * SEC },
  /** Morvath: every torch within 30 m goes out; the Rift opens every 60 s for 30 s, a red demon every 3 s; violet ruin every 20 s, 3 s of warning, 300 in 20 m. */
  crown: { radius: 30 * M },
  rift: { cooldown: 60 * SEC, open: 30 * SEC, every: 3 * SEC },
  ruin: { radius: 20 * M, damage: 300, warning: 3 * SEC, cooldown: 20 * SEC },
  /**
   * Morvath's staff (Jade's Patch 5 MB-4): 200 to his target (his row), and
   * 100 to everyone else within 1 m of it, his own monsters too; he takes in
   * every point it drains from them, and none from the players' units.
   */
  staff: { splashTenths: 1000, radius: M },
  /** His wings (MB-4): once, as he takes to the air, he drains up to 500 from the players' units within 12 m over 5 s (s: 12 m), and takes it in. */
  wings: { total: 500, steps: 5 * SEC, radius: 12 * M },
} as const;

const BP = 10000;

/** Whether a mob is a demon a command lifts (roster 2: red and purple). */
function isDemon(state: SimState, j: number): boolean {
  const e = state.entities;
  return e.kind[j] === UnitKind.Mob && mobSpec(e.mob[j]!).demon !== Demon.None;
}

/** Whether a point is inside the light of a lit torch or building. */
export function inLight(state: SimState, x: number, z: number): boolean {
  for (const b of state.buildings.list) {
    const light = buildingSpec(b.kind).light;
    if (!light || !isLit(b)) continue;
    const [lx, lz] = buildingCentre(b);
    const r = light.lightM * M;
    if (length2d(lx - x, lz - z) <= r) return true;
  }
  return false;
}

/** A void stalker unseen by a unit at this distance: it has not attacked yet, it is beyond 4 m, and no light shows it. */
export function cloaked(state: SimState, j: number, distance: number): boolean {
  const e = state.entities;
  // A Satyr Trickster vanished (SCS-2): unseen until he comes back, whatever the light.
  if (e.kind[j] === UnitKind.Mob && e.mob[j] === Mob.SatyrTrickster) return markOn(state, e.id[j]!, MarkKind.Vanished) >= 0;
  if (e.kind[j] !== UnitKind.Mob || e.mob[j] !== Mob.VoidStalker || e.strikes[j] !== 0) return false;
  return distance > LATE.cloak.seenWu && !inLight(state, e.x[j]!, e.z[j]!);
}

/** Damage a hit on a mob takes from where it came (the juggernaut's weak back: double from behind; the barrow knight's shield wall: 60% of projectile damage from the front). */
export function facingBp(state: SimState, i: number, fromX: number, fromZ: number, projectile: boolean): number {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob) return BP;
  const m = e.mob[i]!;
  if (m === Mob.InfernalJuggernaut && !inFront(state, i, fromX, fromZ)) return 2 * BP;
  if (m === Mob.BarrowKnight && projectile && inFront(state, i, fromX, fromZ)) return BP - 6000;
  return BP;
}

/** In the 180 degrees in front of a unit. */
function inFront(state: SimState, i: number, x: number, z: number): boolean {
  const e = state.entities;
  const [fx, fz] = forward(e.heading[i]!);
  return (x - e.x[i]!) * fx + (z - e.z[i]!) * fz >= 0;
}

/** A fiend in its fury attacks 40% faster. */
export function furyBp(state: SimState, i: number): number {
  const e = state.entities;
  if (e.mob[i] !== Mob.Fiend || e.hp[i]! * 100 >= e.maxHp[i]! * LATE.fury.belowPct) return BP;
  return BP + LATE.fury.fasterPct * 100;
}

// ----- each step -----

/** The late mobs' auras and timers (after the mobs moved). */
export function updateLateMobs(state: SimState): void {
  const e = state.entities;
  const second = state.step % SEC === 0;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0) continue;
    const m = e.mob[i]!;
    if (m < Mob.BarrowKnight && m !== Mob.GoblinWolfRider) continue;
    if (second && m === Mob.PlagueBearer) aura(state, i, LATE.miasma.radius, LATE.miasma.perSecond * 10, true);
    if (second && m === Mob.InfernalJuggernaut) aura(state, i, LATE.heat.radius + halfWidth(state, i), LATE.heat.perSecondTenths, false);
    if (second && m === Mob.Archfiend) command(state, i);
    if ((m === Mob.Morvath || m === Mob.MorvathAloft) && e.role[i] === 0) morvath(state, i, second);
  }
}

/** A plague bearer's miasma or a juggernaut's heat: each of the players' and the peoples' units within takes its due (in tenths), exact. */
function aura(state: SimState, i: number, radius: number, tenths: number, sick: boolean): void {
  const e = state.entities;
  const damage = wholeDamage(state, i, tenths);
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, radius)) {
    if (!playerUnit(state, j) || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > radius + halfWidth(state, j)) continue;
    hurtUnit(state, j, { damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false, exact: true });
    if (sick) e.sickUntil[j] = state.step + SEC + 1;
  }
}

/** The archfiend's command: demons near it hit and run 20% harder for the next second. */
function command(state: SimState, i: number): void {
  const e = state.entities;
  const r = LATE.command.radius;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.hp[j]! <= 0 || !isDemon(state, j) || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r) continue;
    e.rallyUntil[j] = state.step + SEC + 1;
    e.fastUntil[j] = state.step + SEC + 1;
    e.fastBp[j] = LATE.command.bonusBp;
  }
}

// ----- before a mob fights -----

/**
 * What a late mob does before it goes for its target: the abilities with
 * their own clocks. Returns true when it used the step. `t` is its target
 * (or -1).
 */
function act(state: SimState, i: number, spec: MobSpec, t: number): boolean {
  const e = state.entities;
  const now = state.step;
  switch (spec.id) {
    case Mob.Gravewing:
    case Mob.RiftGriffin: {
      // It goes for a lone worker when it sees one, unless a troop's blow has turned it on the troops (Jade's Patch 4).
      if (t >= 0 && (loneWorker(state, t) || (combatTroop(state, t) && turnedOnTroops(state, i)))) return false;
      const w = nearestLoneWorker(state, i);
      if (w < 0) return false;
      engageUnit(state, i, spec, w);
      return true;
    }
    case Mob.BoneColossus: {
      if (now < e.abilityAt[i]!) return false;
      const b = nearestPerch(state, i, LATE.boulder.range);
      if (!b) return false;
      const [x, z] = buildingCentre(b);
      launch(state, i, e.x[i]!, e.y[i]! + floorDiv(spec.height * 3, 4), e.z[i]!, x, buildingTop(b), z, Shot.BoneBoulder, dealtTenths(state, i, LATE.boulder.damageTenths), 0);
      e.abilityAt[i] = now + LATE.boulder.cooldown;
      e.atkNext[i] = now + spec.attackSteps;
      return true;
    }
    case Mob.HollowPriest: {
      if (now < e.abilityAt[i]!) return false;
      e.abilityAt[i] = now + LATE.raise.cooldown;
      let raised = 0;
      for (let j = 0; j < e.count; j++) if (e.kind[j] === UnitKind.Mob && e.hp[j]! > 0 && e.mob[j] === Mob.Zombie && e.group[j] === e.id[i]) raised++;
      if (raised >= LATE.raise.most) return false;
      const a = state.rng.combat.nextInt(65536);
      const [fx, fz] = forward(a);
      const z0 = addMob(state, Mob.Zombie, e.foe[i]!, e.x[i]! + floorDiv(fx * LATE.raise.within, 65536), e.z[i]! + floorDiv(fz * LATE.raise.within, 65536), nightOf(state));
      // A wandering priest's dead wander with it; the group counts what it raised.
      inheritRole(state, i, z0);
      e.group[z0] = e.id[i]!;
      state.hits.push({ look: 'burst', x: e.x[z0]!, y: e.y[z0]!, z: e.z[z0]!, id: e.id[z0]! });
      return false;
    }
    case Mob.Hellhound: {
      if (now < e.abilityAt[i]! || t < 0 || gap(state, i, t) > LATE.breath.reach) return false;
      e.abilityAt[i] = now + LATE.breath.cooldown;
      e.atkNext[i] = now + spec.attackSteps;
      breathe(state, i, LATE.breath.reach, 0, wholeDamage(state, i, LATE.breath.perSecondTenths * 2));
      return true;
    }
    case Mob.ChainFiend: {
      if (now < e.abilityAt[i]!) return false;
      const j = nearestPerched(state, i, LATE.hook.range);
      if (j < 0) return false;
      e.abilityAt[i] = now + LATE.hook.cooldown;
      e.atkNext[i] = now + spec.attackSteps;
      leaveBuilding(state, j);
      const [fx, fz] = forward(e.heading[i]!);
      e.x[j] = e.x[i]! + floorDiv(fx * M, 65536);
      e.z[j] = e.z[i]! + floorDiv(fz * M, 65536);
      e.y[j] = standY(state, e.x[j]!, e.z[j]!);
      hurtUnit(state, j, { damage: wholeDamage(state, i, LATE.hook.damageTenths), from: e.id[i]!, projectile: false, blunt: true, pierce: false, exact: true });
      state.hits.push({ look: 'shot', x: e.x[i]!, y: e.y[i]! + spec.height, z: e.z[i]!, id: e.id[i]! });
      return true;
    }
    case Mob.VoidWitch: {
      if (now >= e.abilityAt[i]! && hexMages(state, i)) {
        e.abilityAt[i] = now + LATE.hex.cooldown;
        return true;
      }
      if (now >= e.ability2At[i]! && t >= 0 && gap(state, i, t) <= LATE.blink.threat) {
        e.ability2At[i] = now + LATE.blink.cooldown;
        blink(state, i, t);
        return true;
      }
      return false;
    }
    case Mob.Archfiend: {
      if (now < e.abilityAt[i]!) return false;
      e.abilityAt[i] = now + LATE.summon.cooldown;
      for (let k = 0; k < LATE.summon.count; k++) {
        const [fx, fz] = forward(e.heading[i]! + k * 16384);
        addMob(state, Mob.Cinderling, e.foe[i]!, e.x[i]! + floorDiv(fx * 2 * M, 65536), e.z[i]! + floorDiv(fz * 2 * M, 65536), nightOf(state));
      }
      state.hits.push({ look: 'blast', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
      return false;
    }
    case Mob.RiftColossus: {
      if (now < e.ability2At[i]!) return false;
      const b = nearestDefence(state, i, LATE.beam.range);
      if (!b) return false;
      e.ability2At[i] = now + LATE.beam.cooldown;
      e.atkNext[i] = now + spec.attackSteps;
      const [x, z] = buildingCentre(b);
      hurtBuilding(state, b, LATE.beam.damage, x, buildingTop(b), z);
      state.hits.push({ look: 'spell', x: e.x[i]!, y: e.y[i]! + spec.height, z: e.z[i]!, id: e.id[i]! });
      return true;
    }
    case Mob.Necromancer:
      return necromancerAct(state, i, spec, t);
    default:
      return false;
  }
}

function nightOf(state: SimState): number {
  return clockAt(state.step).cycle;
}

/** A worker of the players' with nobody else of theirs within 6 m, out in the open. */
function loneWorker(state: SimState, j: number): boolean {
  const e = state.entities;
  if (e.kind[j] !== UnitKind.Worker || !playerUnit(state, j)) return false;
  for (const k of state.grid.near(e.x[j]!, e.z[j]!, LATE.snatch.loneWu)) {
    if (k === j || e.hp[k]! <= 0 || e.owner[k] !== e.owner[j] || e.kind[k] === UnitKind.Animal) continue;
    if (length2d(e.x[k]! - e.x[j]!, e.z[k]! - e.z[j]!) <= LATE.snatch.loneWu) return false;
  }
  return true;
}

function nearestLoneWorker(state: SimState, i: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, LATE.snatch.huntWu)) {
    if (!loneWorker(state, j)) continue;
    const d = gap(state, i, j);
    if (d > LATE.snatch.huntWu) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** The foe's nearest building that archers stand on (a tower, or a main base's parapets) within a range. */
function nearestPerch(state: SimState, i: number, range: number): Building | undefined {
  return nearestBuilding(state, i, range, (b) => garrisonRoom(b) > 0);
}

/** The foe's nearest tower or wall within a range. */
function nearestDefence(state: SimState, i: number, range: number): Building | undefined {
  return nearestBuilding(state, i, range, (b) => garrisonRoom(b) > 0 || buildingSpec(b.kind).defence === 'wall' || buildingSpec(b.kind).defence === 'gate');
}

function nearestBuilding(state: SimState, i: number, range: number, ok: (b: Building) => boolean): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.foe[i] || b.hp <= 0 || !ok(b)) continue;
    const d = gapToBuilding(state, i, b);
    if (d > range || (best && (d > bestD || (d === bestD && b.id > best.id)))) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** The nearest of the players' units up on a tower or a parapet within a range. */
function nearestPerched(state: SimState, i: number, range: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (let j = 0; j < e.count; j++) {
    if (e.inside[j] === 0 || e.hp[j]! <= 0 || e.owner[j] !== e.foe[i]) continue;
    const b = state.buildings.get(e.inside[j]!);
    if (!b || garrisonRoom(b) === 0) continue;
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (d > range + floorDiv(WU_PER_COLUMN * 3, 2)) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** A void witch's hex: the players' mages within 10 m lose all their mana. True when one was there. */
function hexMages(state: SimState, i: number): boolean {
  const e = state.entities;
  let any = false;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, LATE.hex.radius)) {
    if (e.kind[j] !== UnitKind.Mage || !playerUnit(state, j) || e.mana[j]! <= 0) continue;
    if (length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > LATE.hex.radius) continue;
    e.mana[j] = 0;
    any = true;
    state.hits.push({ look: 'spell', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: e.id[j]! });
  }
  return any;
}

/** A void witch blinks up to 15 m straight away from the foe at her side, to where she can stand. */
function blink(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const dx = e.x[i]! - e.x[t]!;
  const dz = e.z[i]! - e.z[t]!;
  const d = Math.max(1, length2d(dx, dz));
  for (let k = 4; k >= 1; k--) {
    const step = floorDiv(LATE.blink.distance * k, 4);
    const x = e.x[i]! + floorDiv(dx * step, d);
    const z = e.z[i]! + floorDiv(dz * step, d);
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    if (state.buildings.solidAt(cx, cz) !== 0 || !state.nav.standable(cx, cz, WALKER)) continue;
    state.hits.push({ look: 'spell', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    e.x[i] = x;
    e.z[i] = z;
    e.y[i] = standY(state, x, z);
    e.path[i] = [];
    return;
  }
}

/**
 * Breath in front of a mob: a hellhound's 5 m cone (width 0) or a drake's
 * 12 m line (its width), set as burning damage over 2 s on everything of the
 * players' and the peoples' in it, and wood in it set alight.
 */
function breathe(state: SimState, i: number, reach: number, width: number, total: number): void {
  const e = state.entities;
  const [fx, fz] = forward(e.heading[i]!);
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, reach + 2 * M)) {
    if (!playerUnit(state, j)) continue;
    const dx = e.x[j]! - e.x[i]!;
    const dz = e.z[j]! - e.z[i]!;
    const along = floorDiv(dx * fx + dz * fz, 65536);
    if (along < 0 || along > reach + halfWidth(state, j)) continue;
    if (width > 0 ? Math.abs(floorDiv(dx * fz - dz * fx, 65536)) > width + halfWidth(state, j) : !inArc(state, i, e.x[j]!, e.z[j]!)) continue;
    e.dotLeft[j] = (e.dotUntil[j]! > state.step ? e.dotLeft[j]! : 0) + total;
    e.dotUntil[j] = state.step + LATE.breath.steps;
    e.dotFrom[j] = e.id[i]!;
  }
  for (const b of state.buildings.list) {
    if (b.hp <= 0 || buildingSpec(b.kind).wooden === false) continue;
    const [bx, bz] = buildingCentre(b);
    const along = floorDiv((bx - e.x[i]!) * fx + (bz - e.z[i]!) * fz, 65536);
    if (along < 0 || along > reach + 2 * M || length2d(bx - e.x[i]!, bz - e.z[i]!) > reach + 2 * M) continue;
    smoulder(state, b, FIRE.perSecond, FIRE.steps);
  }
  state.hits.push({ look: 'blast', x: e.x[i]! + floorDiv(fx * (reach >> 1), 65536), y: e.y[i]! + M, z: e.z[i]! + floorDiv(fz * (reach >> 1), 65536), id: e.id[i]! });
}

// ----- strikes and hits -----

/** A ranged attack that does not fly: a hollow priest's curse, a void witch's draining beam, a drake's breath. */
function strike(state: SimState, i: number, spec: MobSpec, t: number): void {
  const e = state.entities;
  const damage = dealtTenths(state, i, blowTenths(state.rng.combat, spec));
  if (spec.strike === Strike.Breath) {
    breathe(state, i, spec.range, LATE.line.width, damage);
    return;
  }
  const d = hurtUnit(state, t, { damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false, spell: true });
  state.hits.push({ look: 'spell', x: e.x[t]!, y: e.y[t]! + floorDiv(bodyHeight(state, t), 2), z: e.z[t]!, id: e.id[t]! });
  // Drain heals her by what it took.
  if (spec.strike === Strike.Drain && d > 0) e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + d);
}

/** What a late mob's melee hit does beside its damage. `d` is what it did. */
function hit(state: SimState, i: number, spec: MobSpec, t: number, d: number): void {
  const e = state.entities;
  e.strikes[i] = Math.min(255, e.strikes[i]! + 1);
  if (spec.id === Mob.Morvath || spec.id === Mob.MorvathAloft) staffSplash(state, i, t);
  if (e.hp[t]! <= 0) return;
  // A ram or a cleave throws the smaller back (Rift beetle, Rift minotaur, demon brute, Rift colossus).
  if (spec.knockWu > 0 && bodyHeight(state, t) < spec.height) knockBack(state, i, t, spec.knockWu);
  switch (spec.id) {
    case Mob.Gravewing:
    case Mob.RiftGriffin: {
      // The snatch: carried up and dropped from 6 m.
      const drop = wholeDamage(state, i, LATE.snatch.damageTenths);
      if (e.kind[t] === UnitKind.Worker && d < drop) {
        hurtUnit(state, t, { damage: drop - d, from: e.id[i]!, projectile: false, blunt: true, pierce: false, exact: true });
        e.heldUntil[t] = state.step + LATE.snatch.heldSteps;
      }
      break;
    }
    case Mob.RiftScorpion:
      if ((e.strikes[i]! & 1) === 0) {
        hurtUnit(state, t, { damage: dealtTenths(state, i, LATE.sting.damageTenths), from: e.id[i]!, projectile: false, blunt: false, pierce: true });
        e.dotLeft[t] = (e.dotUntil[t]! > state.step ? e.dotLeft[t]! : 0) + wholeDamage(state, i, LATE.sting.poisonTenths);
        e.dotUntil[t] = state.step + POISON.steps;
        e.dotFrom[t] = e.id[i]!;
      }
      break;
    case Mob.RiftHornet:
      e.slowUntil[t] = state.step + LATE.hornet.steps;
      e.slowBp[t] = LATE.hornet.slowBp;
      break;
  }
}

/** A mob's blow on a building: a cinderling's sets wood burning. */
function onBuilding(state: SimState, _i: number, spec: MobSpec, b: Building): void {
  if (spec.id === Mob.Cinderling) smoulder(state, b, FIRE.perSecond, FIRE.steps);
}

/** The first strike from a void stalker that was hidden does triple damage. */
function hitMul(state: SimState, i: number, spec: MobSpec): number {
  return spec.id === Mob.VoidStalker && state.entities.strikes[i] === 0 ? LATE.cloak.ambushMul : 1;
}

// ----- Morvath -----

/** Morvath's spells on their clocks, and his second form at half health. */
function morvath(state: SimState, i: number, second: boolean): void {
  const e = state.entities;
  const now = state.step;
  // Crown of night: every torch within 30 m goes out.
  if (second) {
    for (const b of state.buildings.list) {
      if (!isLit(b)) continue;
      const [x, z] = buildingCentre(b);
      if (length2d(x - e.x[i]!, z - e.z[i]!) <= LATE.crown.radius) snuffLight(b);
    }
  }
  // Second form: he spreads his wings and, once, drains the life of those round him.
  if (e.mob[i] === Mob.Morvath && e.hp[i]! * 2 <= e.maxHp[i]!) {
    e.mob[i] = Mob.MorvathAloft;
    e.speed[i] = mobSpec(Mob.MorvathAloft).speed;
    e.y[i] = standY(state, e.x[i]!, e.z[i]!) + FLY_HEIGHT;
    e.drainUntil[i] = now + LATE.wings.steps;
    e.drainLeft[i] = LATE.wings.total;
    state.events.push({ player: e.foe[i]!, kind: 'alert', text: 'Morvath spreads his wings and drains the life of all near him. Only bows, guns and magic can reach him now.', x: e.x[i]!, z: e.z[i]! });
  }
  if (e.drainLeft[i]! > 0 && now < e.drainUntil[i]! && (e.drainUntil[i]! - now) % SEC === 0) wingDrain(state, i);
  // Violet ruin: marked, then 3 s later it falls.
  if (e.castAt[i] !== 0 && now >= e.castAt[i]!) {
    e.castAt[i] = 0;
    ruin(state, i, e.castX[i]!, e.castZ[i]!);
  } else if (e.castAt[i] === 0 && now >= e.abilityAt[i]!) {
    const t = e.indexOf(e.target[i]!);
    const [x, z] = t >= 0 ? [e.x[t]!, e.z[t]!] : [e.x[i]!, e.z[i]!];
    e.castAt[i] = now + LATE.ruin.warning;
    e.castX[i] = x;
    e.castZ[i] = z;
    e.abilityAt[i] = now + LATE.ruin.cooldown;
    state.hits.push({ look: 'spell', x, y: standY(state, x, z), z, id: e.id[i]! });
    state.events.push({ player: e.foe[i]!, kind: 'alert', text: 'Morvath calls down violet ruin. Get clear of the mark!', x, z });
  }
  // Open the Rift: red demons for 30 s.
  if (now >= e.ability2At[i]!) {
    e.ability2At[i] = now + LATE.rift.cooldown;
    e.beamUntil[i] = now + LATE.rift.open;
    state.hits.push({ look: 'summon', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    state.events.push({ player: e.foe[i]!, kind: 'alert', text: 'Morvath opens the Rift. Demons pour through.', x: e.x[i]!, z: e.z[i]! });
  }
  if (now < e.beamUntil[i]! && (e.beamUntil[i]! - now) % LATE.rift.every === 0) {
    const night = nightOf(state);
    const red = RED.filter((m) => mobSpec(m).firstNight <= night);
    const mob = red[state.rng.combat.nextInt(red.length)]!;
    const [fx, fz] = forward(e.heading[i]!);
    addMob(state, mob, e.foe[i]!, e.x[i]! - floorDiv(fx * 4 * M, 65536), e.z[i]! - floorDiv(fz * 4 * M, 65536), night);
  }
}

/** Life drained into Morvath: white motes from where it was taken, one for every 2 health, and his health back by as much. */
function drainInto(state: SimState, i: number, j: number, d: number): void {
  if (d <= 0) return;
  const e = state.entities;
  state.hits.push({ look: 'drain', x: e.x[j]!, y: e.y[j]! + floorDiv(bodyHeight(state, j), 2), z: e.z[j]!, id: e.id[j]!, to: e.id[i]!, n: Math.max(1, floorDiv(d, 2)) });
  e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + d);
}

/**
 * Morvath's staff splash (MB-4): everyone within 1 m of where his blow fell
 * but the one it struck takes 100 (with his strength over the nights), the
 * players' and the peoples' units and his own monsters alike; what it takes
 * from his own he takes in.
 */
function staffSplash(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const x = e.x[t]!;
  const z = e.z[t]!;
  const r = LATE.staff.radius;
  state.hits.push({ look: 'violet', x, y: standY(state, x, z), z, id: e.id[i]! });
  const damage = dealtTenths(state, i, LATE.staff.splashTenths);
  for (const j of state.grid.nearOthers(x, z, r + 2 * M)) {
    if (j === t || j === i || e.hp[j]! <= 0 || length2d(e.x[j]! - x, e.z[j]! - z) > r + halfWidth(state, j)) continue;
    const own = e.kind[j] === UnitKind.Mob && e.owner[j] === MONSTERS && e.role[j] !== Role.Structure;
    if (!own && !playerUnit(state, j)) continue;
    const d = hurtUnit(state, j, { damage, from: e.id[i]!, projectile: false, blunt: true, pierce: false });
    if (own) drainInto(state, i, j, d);
  }
}

/** A second of Morvath's wing drain: a fifth of what is left shared among the players' units within 12 m, nearest first for any odd point, taken in. */
function wingDrain(state: SimState, i: number): void {
  const e = state.entities;
  const seconds = Math.max(1, floorDiv(e.drainUntil[i]! - state.step + SEC - 1, SEC));
  const share = floorDiv(e.drainLeft[i]! + seconds - 1, seconds);
  e.drainLeft[i] = e.drainLeft[i]! - share;
  const r = LATE.wings.radius;
  const near: Array<[number, number]> = [];
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r + 2 * M)) {
    if (!playerUnit(state, j) || sideOf(state, j) !== Side.Players) continue;
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (d <= r + halfWidth(state, j)) near.push([j, d]);
  }
  if (near.length === 0) return;
  near.sort((a, b) => a[1] - b[1] || e.id[a[0]]! - e.id[b[0]]!);
  const each = floorDiv(share, near.length);
  let odd = share - each * near.length;
  for (const [j] of near) {
    const want = each + (odd > 0 ? 1 : 0);
    if (odd > 0) odd--;
    if (want <= 0) continue;
    drainInto(state, i, j, hurtUnit(state, j, { damage: want, from: e.id[i]!, projectile: false, blunt: false, pierce: false, spell: true, exact: true }));
  }
}

const RED: readonly Mob[] = [Mob.Cinderling, Mob.Hellhound, Mob.Fiend, Mob.DemonBrute, Mob.Flamecaller, Mob.ChainFiend];

/** Violet ruin falls: 300 to every unit of the players' and the peoples' and every building within 20 m. */
function ruin(state: SimState, i: number, x: number, z: number): void {
  const e = state.entities;
  const r = LATE.ruin.radius;
  const y = standY(state, x, z);
  state.hits.push({ look: 'blast', x, y, z, id: e.id[i]! });
  for (const j of state.grid.nearOthers(x, z, r + 2 * M)) {
    if (!playerUnit(state, j) || length2d(e.x[j]! - x, e.z[j]! - z) > r + halfWidth(state, j)) continue;
    hurtUnit(state, j, { damage: LATE.ruin.damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false, spell: true });
  }
  for (const b of state.buildings.list) {
    if (b.hp <= 0 || b.owner >= state.players.length) continue;
    const [bx, bz] = buildingCentre(b);
    if (length2d(bx - x, bz - z) <= r) hurtBuilding(state, b, LATE.ruin.damage, bx, y, bz);
  }
}

/** Installs the late mobs' abilities in the mob AI. */
export function installLateMobs(): void {
  lateHooks.act = act;
  lateHooks.strike = strike;
  lateHooks.hit = hit;
  lateHooks.building = onBuilding;
  lateHooks.hitMul = hitMul;
}
