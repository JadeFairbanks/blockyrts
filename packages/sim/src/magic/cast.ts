// Casting (Magic; Table 13; Combat: projectile and non-projectile spells;
// Technical decisions: spells and mana inside the fixed-point step). A spell
// takes 1 s to cast standing still (Counterspell answers at once); its mana
// and cooldown are paid when it lands, so a cast broken off by a new order
// costs nothing. Non-projectile spells need a clear line of sight to begin
// and then always land; projectile spells need a clear shot, as archers do,
// and really fly. Each effect is a function in EFFECTS keyed by the spell
// table's `effect`, so a new spell is a row in spells.ts and, only when no
// effect fits, a new function here.
//
// Mages fight from the fight layer (combat/fight.ts calls mageStep): idle,
// on Stop, attack-moving, patrolling or holding, a support mage heals hurt
// units by herself and a battle mage throws Arcane bolts at what she picks
// as a warrior would; a battle mage who knows Counterspell stops any enemy
// spell cast within range whatever she is doing. Every other spell is cast
// from its command card button (or hotkey) on a target, or double-tapped to
// let each mage pick her own. Out of mana, a mage taps with her wand.

import { buildingSpec } from '../buildings/data.ts';
import { garrisonRoom, type Building } from '../buildings/store.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { damageTaken, withBonus } from '../rules.ts';
import { OrderKind, PEOPLES, sightOf, UnitKind, WILD, type Projectile, type SimState } from '../state.ts';
import { factionById, warFaction } from '../peoples/types.ts';
import { armourOf, bodyHeight, canReach, gainXp, gap, halfWidth, hostile, hurtBuilding, hurtUnit, meleeOf, shotMayHit, Side, sideOf, startSwing } from '../combat/combat.ts';
import { chase, face, pickTarget, stepToward, targetLost, validTarget } from '../combat/fight.ts';
import { hasResearch, Research, Shot } from '../combat/items.ts';
import { Slot } from '../units/kits.ts';
import { cancelSpell, castingSpell } from '../combat/mob-ai.ts';
import { buildingTop, clearLob, fireAt, HAND_HEIGHT, lineOfSight, ProjectileFlag } from '../combat/projectiles.ts';
import { smoulder } from '../threats/burns.ts';
import { moveSpeed, resetWalk, walkTo } from '../units/behaviour.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { inCombat, spellPowerBp } from './mages.ts';
import { CAST_STEPS, FIREBALL_BURN, FIREBALL_SPLASH, FIREBALL_WOOD_MULTIPLIER, MAGE_LEASH_WU, MANA_SCALE, School, Spell, SPELLS, spellSpec, type SpellSpec } from './spells.ts';

const M = WU_PER_METRE;
/** A mage's spell cooldowns sit in the unit's cooldown list after the goblin abilities' ids. */
const COOL_BASE = 100;
/** A beam breaks when its target gets this much farther than the spell's range. */
const BEAM_SLACK_WU = 2 * M;
/** A mage walks this much inside a spell's range before she casts, so a target taking a step does not send her walking again. */
const RANGE_MARGIN_WU = M;
/** How long a cast order waits for a clear line or for her to get there before it gives up (s). */
const CAST_ORDER_STEPS = 30 * STEPS_PER_SECOND;
/** A support mage heals a unit by herself when it misses at least half a heal (s). */
const AUTO_HEAL_SHARE = 2;
/** Healed health, in a support mage's tally, worth 2 tenths of experience: 1 XP per 25 healed in combat (rules HEAL_PER_XP). */
const HEAL_XP_STEP = 5;
const HEAL_XP_TENTHS = 2;

// ----- what a mage knows and can cast -----

/** Whether a mage knows a spell: her school, her rank, and Hexcraft for Warding and Counterspell. */
export function knowsSpell(state: SimState, i: number, spell: number): boolean {
  const e = state.entities;
  const s = SPELLS[spell];
  if (!s || e.kind[i] !== UnitKind.Mage || e.school[i] !== s.school || e.rank[i]! < s.rank) return false;
  return !s.hexcraft || hasResearch(state.players[e.owner[i]!]?.research ?? 0, Research.Hexcraft);
}

/** The step a mage's spell is ready again (0 when she never cast it). */
export function spellReadyAt(state: SimState, i: number, spell: number): number {
  const list = state.entities.cools[i]!;
  for (let k = 0; k < list.length; k += 2) if (list[k] === COOL_BASE + spell) return list[k + 1]!;
  return 0;
}

function startCooldown(state: SimState, i: number, s: SpellSpec): void {
  const list = state.entities.cools[i]!;
  const until = state.step + s.cooldown;
  for (let k = 0; k < list.length; k += 2) {
    if (list[k] !== COOL_BASE + s.id) continue;
    list[k + 1] = until;
    return;
  }
  list.push(COOL_BASE + s.id, until);
}

/** Why a mage cannot cast a spell now, or '' (for the command card's greyed buttons and the order's alerts). */
export function spellProblem(state: SimState, i: number, spell: number): string {
  const e = state.entities;
  const s = SPELLS[spell];
  if (!s || e.kind[i] !== UnitKind.Mage) return 'Only mages cast spells.';
  if (e.school[i] !== s.school) return `Only ${s.school === School.Battle ? 'battle' : 'support'} mages cast ${s.name}.`;
  if (e.rank[i]! < s.rank) return `Learned at rank ${s.rank}.`;
  if (s.hexcraft && !hasResearch(state.players[e.owner[i]!]?.research ?? 0, Research.Hexcraft)) return 'Needs Hexcraft researched at a Magi Sanctum.';
  if (e.mana[i]! < s.mana * MANA_SCALE) return `Not enough mana (${s.mana}).`;
  if (spellReadyAt(state, i, spell) > state.step) return 'Not ready yet.';
  return '';
}

export function canCast(state: SimState, i: number, spell: number): boolean {
  return spellProblem(state, i, spell) === '';
}

/** A spell's healing or damage from this mage: the table's amount and her spell power. */
export function spellAmount(state: SimState, i: number, s: SpellSpec): number {
  return withBonus(s.amount, spellPowerBp(state, i));
}

// ----- targets -----

/** Where a mage's spells leave from: her wand hand, or the top of the tower or parapet she stands on. */
function eye(state: SimState, i: number): [number, number, number] {
  const e = state.entities;
  const b = e.inside[i] ? state.buildings.get(e.inside[i]!) : undefined;
  if (b) return [e.x[i]!, buildingTop(b) + HAND_HEIGHT, e.z[i]!];
  return [e.x[i]!, e.y[i]! + HAND_HEIGHT, e.z[i]!];
}

/** A unit on the caster's side a support spell may be cast on, alive and outside: the players' units for theirs, her own people for a Grovesinger. */
function ally(state: SimState, i: number, j: number): boolean {
  const e = state.entities;
  if (j < 0 || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.kind[j] === UnitKind.Wanderer) return false;
  const side = sideOf(state, i);
  if (sideOf(state, j) !== side) return false;
  return side !== Side.Peoples || sameFaction(state.peoples, e.group[i]!, e.group[j]!);
}

/** Whether two of the peoples' groups stand together (a caravan with its kingdom). */
function sameFaction(ps: SimState['peoples'], a: number, b: number): boolean {
  if (a === b) return true;
  const fa = factionById(ps, a);
  const fb = factionById(ps, b);
  return !!fa && !!fb && warFaction(ps, fa).id === warFaction(ps, fb).id;
}

/** One of the players' fighting kinds, which support mages look after by themselves. */
function person(state: SimState, j: number): boolean {
  const k = state.entities.kind[j];
  return k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage;
}

/** Whether a spell's target unit is still one it may land on. */
function targetOk(state: SimState, i: number, s: SpellSpec, t: number, ordered: boolean): boolean {
  if (t < 0) return false;
  if (s.target === 'ally') return ally(state, i, t);
  if (s.target === 'counter') return validTarget(state, i, t) && castingSpell(state, t);
  return validTarget(state, i, t, ordered);
}

/** Whether a mage can cast at a unit or spot from where she stands: in range, and a clear shot or line of sight. */
function canReachWith(state: SimState, i: number, s: SpellSpec, t: number, x: number, z: number): boolean {
  const e = state.entities;
  const d = t >= 0 ? gap(state, i, t) : length2d(x - e.x[i]!, z - e.z[i]!);
  if (d > s.range) return false;
  if (t === i) return true;
  const [ox, oy, oz] = eye(state, i);
  if (t >= 0) {
    const ty = e.y[t]! + (bodyHeight(state, t) >> 1);
    return s.projectile ? clearLob(state, s.id === Spell.Fireball ? Shot.Fireball : s.id === Spell.ThornVolley ? Shot.Thorn : Shot.ArcaneBolt, ox, oy, oz, e.x[t]!, ty, e.z[t]!, true) > 0 : lineOfSight(state, ox, oy, oz, e.x[t]!, ty, e.z[t]!);
  }
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  return lineOfSight(state, ox, oy, oz, x, state.nav.level(cx, cz) * WU_PER_TERRAIN_UNIT + M, z);
}

// ----- casting -----

/** Begins casting: she stands and faces it for the cast time (Quicken and Stumble hex change it); Counterspell lands at once. */
export function beginCast(state: SimState, i: number, s: SpellSpec, t: number, x: number, z: number): void {
  const e = state.entities;
  e.castSpell[i] = s.id + 1;
  e.castTarget[i] = t >= 0 ? e.id[t]! : 0;
  e.castX[i] = t >= 0 ? e.x[t]! : x;
  e.castZ[i] = t >= 0 ? e.z[t]! : z;
  if (t >= 0 && t !== i) face(state, i, t);
  else if (t < 0) faceSpot(state, i, x, z);
  resetWalk(state, i);
  if (s.target === 'counter') {
    e.castAt[i] = state.step;
    resolveCast(state, i);
    return;
  }
  e.castAt[i] = state.step + castTime(state, i);
  e.order[i] = OrderKind.Cast;
}

/** The cast time for this mage now: 1 s, slower under a Stumble hex, faster under Quicken. */
function castTime(state: SimState, i: number): number {
  const e = state.entities;
  let steps = CAST_STEPS;
  if (e.hexUntil[i]! > state.step) steps = floorDiv(steps * 5, 4);
  if (e.quickUntil[i]! > state.step) steps = floorDiv(steps * 10000, 10000 + spellSpec(Spell.Quicken).bp);
  return Math.max(1, steps);
}

function faceSpot(state: SimState, i: number, x: number, z: number): void {
  const e = state.entities;
  if (x !== e.x[i] || z !== e.z[i]) e.heading[i] = headingTowards(x - e.x[i]!, z - e.z[i]!);
}

/** The cast is done: pay for it and carry it out, or let it go if its target is gone (nothing paid). */
function resolveCast(state: SimState, i: number): void {
  const e = state.entities;
  const s = spellSpec(e.castSpell[i]! - 1);
  e.castSpell[i] = 0;
  e.castAt[i] = 0;
  const t = e.castTarget[i] ? e.indexOf(e.castTarget[i]!) : -1;
  e.castTarget[i] = 0;
  if (s.target !== 'point' && !targetOk(state, i, s, t, true)) return;
  if (e.mana[i]! < s.mana * MANA_SCALE || spellReadyAt(state, i, s.id) > state.step) return;
  e.mana[i] = e.mana[i]! - s.mana * MANA_SCALE;
  startCooldown(state, i, s);
  const x = t >= 0 ? e.x[t]! : e.castX[i]!;
  const z = t >= 0 ? e.z[t]! : e.castZ[i]!;
  EFFECTS[s.effect](state, i, s, t, x, z);
  if (!s.projectile) {
    const y = t >= 0 ? e.y[t]! + (bodyHeight(state, t) >> 1) : state.nav.level(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN)) * WU_PER_TERRAIN_UNIT;
    state.hits.push({ look: 'spell', spell: s.id, x, y, z, id: t >= 0 ? e.id[t]! : e.id[i]! });
  }
}

/** Every unit of the caster's side within a radius of a spot, in index order. */
function alliesNear(state: SimState, i: number, x: number, z: number, radius: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (const j of state.grid.near(x, z, radius)) {
    if (!ally(state, i, j) || length2d(e.x[j]! - x, e.z[j]! - z) > radius + halfWidth(state, j)) continue;
    out.push(j);
  }
  return out.sort((a, b) => a - b);
}

/** Every enemy of a mage within a radius of a spot, in index order. */
function enemiesNear(state: SimState, i: number, x: number, z: number, radius: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (const j of state.grid.near(x, z, radius)) {
    if (j === i || e.hp[j]! <= 0 || e.inside[j] !== 0 || !hostile(state, i, j)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > radius + halfWidth(state, j)) continue;
    out.push(j);
  }
  return out.sort((a, b) => a - b);
}

type Effect = (state: SimState, i: number, s: SpellSpec, t: number, x: number, z: number) => void;

/** What each spell does when it lands (Table 13). */
export const EFFECTS: Record<SpellSpec['effect'], Effect> = {
  heal(state, i, s, t) {
    const e = state.entities;
    e.healLeft[t] = (e.healUntil[t]! > state.step ? e.healLeft[t]! : 0) + spellAmount(state, i, s);
    e.healUntil[t] = state.step + s.steps;
    e.healFrom[t] = e.id[i]!;
  },
  quicken(state, i, s, t) {
    state.entities.quickUntil[t] = state.step + s.steps;
  },
  fortify(state, i, s, _t, x, z) {
    for (const j of alliesNear(state, i, x, z, s.radius)) {
      state.entities.fortUntil[j] = state.step + s.steps;
    }
  },
  rally(state, i, s, _t, x, z) {
    const e = state.entities;
    for (const j of alliesNear(state, i, x, z, s.radius)) {
      e.rallyUntil[j] = state.step + s.steps;
      // Cured of poison and hexes.
      e.dotLeft[j] = 0;
      e.dotUntil[j] = 0;
      e.hexUntil[j] = 0;
    }
  },
  ward(state, i, s, _t, x, z) {
    for (const j of alliesNear(state, i, x, z, s.radius)) {
      state.entities.wardUntil[j] = state.step + s.steps;
    }
  },
  bolt(state, i, s, t) {
    const [x, y, z] = eye(state, i);
    fireAt(state, i, x, y, z, t, Shot.ArcaneBolt, spellAmount(state, i, s), 0, ProjectileFlag.Spell);
  },
  fireball(state, i, s, t) {
    const [x, y, z] = eye(state, i);
    fireAt(state, i, x, y, z, t, Shot.Fireball, spellAmount(state, i, s), 0, ProjectileFlag.Spell | ProjectileFlag.Fire | ProjectileFlag.Burst);
  },
  beam(state, i, s, t) {
    const e = state.entities;
    // The whole beam is worked out through the target's armour now, then handed out step by step.
    const raw = floorDiv(spellAmount(state, i, s) * s.steps, STEPS_PER_SECOND);
    e.beamLeft[i] = damageTaken({ damage: raw, armourBp: armourOf(state, t), projectile: false });
    e.beamTarget[i] = e.id[t]!;
    e.beamUntil[i] = state.step + s.steps;
  },
  blast(state, i, s, _t, x, z) {
    const e = state.entities;
    const damage = spellAmount(state, i, s);
    for (const j of enemiesNear(state, i, x, z, s.radius)) hurtUnit(state, j, { damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false, spell: true });
  },
  counter(state, _i, _s, t) {
    cancelSpell(state, t);
  },
  root(state, i, s, _t, x, z) {
    const e = state.entities;
    for (const j of enemiesNear(state, i, x, z, s.radius)) {
      // Rooted where it stands: as a slime's hold, it cannot act until let go.
      e.heldUntil[j] = Math.max(e.heldUntil[j]!, state.step + s.steps);
      cancelSpell(state, j);
    }
  },
  thorns(state, i, s, t) {
    const e = state.entities;
    const [x, y, z] = eye(state, i);
    // One thorn at the target and one at each of the nearest others round it, the rest at the target again.
    const near = enemiesNear(state, i, e.x[t]!, e.z[t]!, s.radius).filter((j) => j !== t);
    near.sort((a, b) => gap(state, t, a) - gap(state, t, b) || e.id[a]! - e.id[b]!);
    const targets = [t, ...near.slice(0, s.bp - 1)];
    for (let k = 0; k < s.bp; k++) fireAt(state, i, x, y, z, targets[k % targets.length]!, Shot.Thorn, spellAmount(state, i, s), THORN_SPREAD_BP, ProjectileFlag.Spell);
  },
  bark(state, i, s, _t, x, z) {
    for (const j of alliesNear(state, i, x, z, s.radius)) state.entities.barkUntil[j] = state.step + s.steps;
  },
  bloom(state, i, s, _t, x, z) {
    const e = state.entities;
    for (const j of alliesNear(state, i, x, z, s.radius)) {
      e.healLeft[j] = (e.healUntil[j]! > state.step ? e.healLeft[j]! : 0) + spellAmount(state, i, s);
      e.healUntil[j] = state.step + s.steps;
      e.healFrom[j] = e.id[i]!;
    }
  },
  wild(state, i, s, _t, x, z) {
    const e = state.entities;
    for (const j of state.grid.near(x, z, s.radius)) {
      if (e.kind[j] !== UnitKind.Animal || e.owner[j] !== WILD || e.hp[j]! <= 0 || length2d(e.x[j]! - x, e.z[j]! - z) > s.radius) continue;
      // It fights for her people for a while (peoples/ai.ts runs it), then goes wild again.
      e.owner[j] = PEOPLES;
      e.group[j] = e.group[i]!;
      e.calledUntil[j] = state.step + s.steps;
      e.target[j] = 0;
      e.homeX[j] = e.x[i]!;
      e.homeZ[j] = e.z[i]!;
    }
  },
};

/** Thorns spread a little as arrows do (s). */
const THORN_SPREAD_BP = 500;

/**
 * A Fireball bursts where it stops (projectiles.ts): 15 to every other
 * enemy within 2 m, never the players' own units; a building it hits takes
 * three times the hit if wooden (and smoulders 8 a second for 5 s), 30 if stone.
 */
export function fireballBurst(state: SimState, p: Projectile, x: number, y: number, z: number, hit: number, b: Building | null): void {
  const e = state.entities;
  const s = spellSpec(Spell.Fireball);
  const caster = e.indexOf(p.shooter);
  const splash = caster >= 0 ? floorDiv(FIREBALL_SPLASH * p.damage, s.amount) : FIREBALL_SPLASH;
  state.hits.push({ look: 'spell', spell: Spell.Fireball, x, y, z, id: p.shooter });
  for (const j of state.grid.near(x, z, s.radius)) {
    if (j === hit || e.hp[j]! <= 0 || e.inside[j] !== 0) continue;
    if (sideOf(state, j) === Side.Wild || !shotMayHit(state, p.side, p.faction, p.owner, j)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > s.radius + halfWidth(state, j)) continue;
    hurtUnit(state, j, { damage: splash, from: p.shooter, projectile: false, blunt: false, pierce: false, spell: true });
  }
  if (!b) return;
  if (buildingSpec(b.kind).wooden === false) hurtBuilding(state, b, s.vsWalls, x, y, z);
  else {
    hurtBuilding(state, b, p.damage * FIREBALL_WOOD_MULTIPLIER, x, y, z);
    smoulder(state, b, FIREBALL_BURN.perSecond, FIREBALL_BURN.steps);
  }
}

/** One step of a Beam held on a unit: its share of the damage, until it ends or the target is gone, too far or out of sight. */
function beamStep(state: SimState, i: number): boolean {
  const e = state.entities;
  const s = spellSpec(Spell.Beam);
  const t = e.indexOf(e.beamTarget[i]!);
  const [ox, oy, oz] = eye(state, i);
  if (!validTarget(state, i, t, true) || gap(state, i, t) > s.range + BEAM_SLACK_WU || !lineOfSight(state, ox, oy, oz, e.x[t]!, e.y[t]! + (bodyHeight(state, t) >> 1), e.z[t]!)) {
    e.beamUntil[i] = 0;
    e.beamTarget[i] = 0;
    e.beamLeft[i] = 0;
    return false;
  }
  const left = e.beamUntil[i]! - state.step;
  const d = floorDiv(e.beamLeft[i]! + left - 1, left);
  e.beamLeft[i] = e.beamLeft[i]! - d;
  face(state, i, t);
  e.order[i] = OrderKind.Cast;
  if (d > 0) hurtUnit(state, t, { damage: d, from: e.id[i]!, projectile: false, blunt: false, pierce: false, spell: true, exact: true });
  if (left <= 1) {
    e.beamUntil[i] = 0;
    e.beamTarget[i] = 0;
    e.beamLeft[i] = 0;
  }
  return true;
}

/** Heals under way on every unit: each step its share of what is left, until it is done; a support mage earns experience healing in combat. */
export function updateMagic(state: SimState): void {
  const e = state.entities;
  for (let j = 0; j < e.count; j++) {
    if (e.healUntil[j] === 0) continue;
    if (e.hp[j]! <= 0 || e.healUntil[j]! <= state.step) {
      e.healUntil[j] = 0;
      e.healLeft[j] = 0;
      continue;
    }
    const left = e.healUntil[j]! - state.step;
    const h = floorDiv(e.healLeft[j]! + left - 1, left);
    e.healLeft[j] = e.healLeft[j]! - h;
    const got = Math.min(h, e.maxHp[j]! - e.hp[j]!);
    if (got <= 0) continue;
    e.hp[j] = e.hp[j]! + got;
    const m = e.indexOf(e.healFrom[j]!);
    if (m < 0 || e.kind[m] !== UnitKind.Mage || e.hp[m]! <= 0 || !inCombat(state, j)) continue;
    const tally = e.healXp[m]! + got;
    const tenths = floorDiv(tally, HEAL_XP_STEP) * HEAL_XP_TENTHS;
    e.healXp[m] = tally % HEAL_XP_STEP;
    if (tenths > 0) gainXp(state, m, tenths);
  }
}

// ----- choosing targets by herself -----

/** The hurt unit a support mage should Heal: the one missing the most beyond heals under way, within reach, lowest id on ties. */
function healTarget(state: SimState, i: number, s: SpellSpec, radius: number): number {
  const e = state.entities;
  const amount = spellAmount(state, i, s);
  let best = -1;
  let bestMissing = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, radius)) {
    if (!ally(state, i, j) || !person(state, j)) continue;
    const missing = e.maxHp[j]! - e.hp[j]! - (e.healUntil[j]! > state.step ? e.healLeft[j]! : 0);
    if (missing * AUTO_HEAL_SHARE < amount) continue;
    if (gap(state, i, j) > radius) continue;
    if (best < 0 || missing > bestMissing || (missing === bestMissing && e.id[j]! < e.id[best]!)) {
      best = j;
      bestMissing = missing;
    }
  }
  return best;
}

/** For an area spell: the spot (a unit's place) with the most units of a kind within its radius, lowest id on ties. */
function crowdSpot(state: SimState, i: number, s: SpellSpec, radius: number, enemies: boolean): number {
  const e = state.entities;
  let best = -1;
  let bestN = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, radius)) {
    const fits = enemies ? validTarget(state, i, j) : ally(state, i, j) && person(state, j);
    if (!fits || gap(state, i, j) > radius) continue;
    const n = enemies ? enemiesNear(state, i, e.x[j]!, e.z[j]!, s.radius).length : alliesNear(state, i, e.x[j]!, e.z[j]!, s.radius).filter((k) => person(state, k)).length;
    if (best < 0 || n > bestN || (n === bestN && e.id[j]! < e.id[best]!)) {
      best = j;
      bestN = n;
    }
  }
  return best;
}

/** An enemy casting a spell within a radius, the nearest (lowest id on ties), or -1. */
function casterNear(state: SimState, i: number, radius: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  const [ox, oy, oz] = eye(state, i);
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, radius)) {
    if (!castingSpell(state, j) || !hostile(state, i, j)) continue;
    const d = gap(state, i, j);
    if (d > radius || !lineOfSight(state, ox, oy, oz, e.x[j]!, e.y[j]! + (bodyHeight(state, j) >> 1), e.z[j]!)) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/**
 * A double-tapped spell: the target a mage picks herself, as a unit, or -1
 * with the spot in out. Heal the most hurt; Quicken a unit that is
 * fighting (the nearest), else the nearest warrior; area help where most
 * units stand; bolts, beams and fireballs at the warrior's own pick; Area
 * blast where most enemies stand; Counterspell the nearest enemy caster.
 */
function autoTarget(state: SimState, i: number, s: SpellSpec, out: { x: number; z: number }): number | null {
  const e = state.entities;
  const radius = Math.max(s.range, sightOf(state, i));
  switch (s.effect) {
    case 'heal': {
      const t = healTarget(state, i, s, radius);
      return t >= 0 ? t : null;
    }
    case 'quicken': {
      let best = -1;
      let bestScore = 0;
      for (const j of state.grid.near(e.x[i]!, e.z[i]!, radius)) {
        if (!ally(state, i, j) || e.kind[j] !== UnitKind.Warrior || gap(state, i, j) > radius) continue;
        const score = (e.target[j] !== 0 ? 0 : radius * 2) + gap(state, i, j);
        if (best < 0 || score < bestScore || (score === bestScore && e.id[j]! < e.id[best]!)) {
          best = j;
          bestScore = score;
        }
      }
      return best >= 0 ? best : null;
    }
    case 'fortify':
    case 'rally':
    case 'ward':
    case 'blast': {
      const j = crowdSpot(state, i, s, radius, s.effect === 'blast');
      if (j < 0) return null;
      out.x = e.x[j]!;
      out.z = e.z[j]!;
      return -1;
    }
    case 'counter': {
      const t = casterNear(state, i, s.range);
      return t >= 0 ? t : null;
    }
    default: {
      const t = pickTarget(state, i, radius);
      return t >= 0 ? t : null;
    }
  }
}

// ----- the fight layer for mages -----

const enum Mode {
  None,
  Idle,
  Seek,
  Hold,
}

function modeOf(o: UnitOrder | undefined): Mode {
  if (!o) return Mode.Idle;
  if (o.t === 'attackMove' || o.t === 'patrol') return Mode.Seek;
  if (o.t === 'hold') return Mode.Hold;
  return Mode.None;
}

/** The wand tap: up close only (Table 1: 3 every 1.5 s). */
function tap(state: SimState, i: number, t: number): boolean {
  const e = state.entities;
  const w = meleeOf(state, i);
  if (!canReach(state, i, t, w)) return false;
  face(state, i, t);
  if (state.step >= e.atkNext[i]!) startSwing(state, i, e.id[t]!, w.attackSteps, Slot.Weapon);
  else e.order[i] = OrderKind.Idle;
  return true;
}

/** Walks towards a spot until within `reach` of it. */
function approach(state: SimState, i: number, x: number, z: number, reach: number): void {
  const e = state.entities;
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  const goal = { ...pointGoal(cx, cz), max: Math.max(1, floorDiv(reach, WU_PER_COLUMN)) };
  if (walkTo(state, i, goal) !== 0) {
    resetWalk(state, i);
    stepToward(state, i, x, z, moveSpeed(state, i));
  }
  e.order[i] = OrderKind.Move;
}

/**
 * A battle mage fights one target: an Arcane bolt when it is ready and she
 * has a clear shot, closing in to find one; else her wand if it is close;
 * else she waits for the next bolt (or, told to attack it, walks up to tap
 * it when her mana is gone).
 */
function fightWithBolts(state: SimState, i: number, t: number, canMove: boolean, ordered: boolean): boolean {
  const e = state.entities;
  const s = spellSpec(Spell.ArcaneBolt);
  const d = gap(state, i, t);
  // Bolts by herself only while the table says so (spells.ts auto); told to attack, she always may.
  const known = knowsSpell(state, i, s.id) && (s.auto || ordered);
  const mana = e.mana[i]! >= s.mana * MANA_SCALE;
  if (known && mana) {
    if (d <= s.range && canReachWith(state, i, s, t, 0, 0)) {
      face(state, i, t);
      if (spellReadyAt(state, i, s.id) <= state.step) beginCast(state, i, s, t, 0, 0);
      else e.order[i] = OrderKind.Idle;
      return true;
    }
    if (!canMove) return tap(state, i, t);
    chase(state, i, t, Math.max(meleeOf(state, i).reach, Math.min(s.range - RANGE_MARGIN_WU, d - 2 * M)));
    return true;
  }
  if (tap(state, i, t)) return true;
  face(state, i, t);
  if (!canMove) return false;
  // Waiting in range for her mana; told to attack, she walks up and taps instead.
  if (!ordered && d <= s.range) return true;
  chase(state, i, t, meleeOf(state, i).reach);
  return true;
}

/** Inside a building that is not a tower or parapet (training, sheltering): she casts nothing. */
function insideOther(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.inside[i] === 0) return false;
  const b = state.buildings.get(e.inside[i]!);
  return !b || garrisonRoom(b) === 0;
}

/** Carries out a cast order: walk into range and sight, wait out the cooldown, then cast. */
function runCastOrder(state: SimState, i: number, o: Extract<UnitOrder, { t: 'cast' }>): boolean {
  const e = state.entities;
  const s = SPELLS[o.spell];
  const done = (why?: string): boolean => {
    if (why) state.events.push({ player: e.owner[i]!, kind: 'alert', text: why, x: e.x[i]!, z: e.z[i]! });
    e.queue[i]!.shift();
    resetWalk(state, i);
    return false;
  };
  if (!s || !knowsSpell(state, i, o.spell)) return done();
  // Given up after 30 s without a way to reach it (s), so an unreachable target never holds her for good.
  if (o.until === 0) o.until = state.step + CAST_ORDER_STEPS;
  else if (state.step >= o.until) return done(`Could not find a clear line to cast ${s.name}.`);
  let t = -1;
  let x = o.x;
  let z = o.z;
  if (o.auto) {
    const spot = { x: 0, z: 0 };
    const pick = autoTarget(state, i, s, spot);
    if (pick === null) return done(`No target for ${s.name} nearby.`);
    t = pick;
    if (t >= 0) o.id = e.id[t]!;
    else {
      x = spot.x;
      z = spot.z;
    }
    // Picked once: from here on it is an ordinary cast.
    o.auto = 0;
    o.x = x;
    o.z = z;
  } else if (s.target !== 'point') {
    t = e.indexOf(o.id);
    if (!targetOk(state, i, s, t, true)) return done();
  }
  if (e.mana[i]! < s.mana * MANA_SCALE) return done(`Not enough mana for ${s.name}.`);
  if (!canReachWith(state, i, s, t, x, z)) {
    if (e.inside[i] !== 0) return done(`Out of range for ${s.name}.`);
    // In range but the line is blocked: she closes in until she can see it.
    const d = t >= 0 ? gap(state, i, t) : length2d(x - e.x[i]!, z - e.z[i]!);
    const reach = Math.max(M, Math.min(s.range - RANGE_MARGIN_WU, d - 2 * M));
    if (t >= 0) chase(state, i, t, reach);
    else approach(state, i, x, z, reach);
    return true;
  }
  if (spellReadyAt(state, i, s.id) > state.step) {
    // Waiting out the cooldown in reach is not getting stuck.
    o.until = state.step + CAST_ORDER_STEPS;
    if (t >= 0 && t !== i) face(state, i, t);
    e.order[i] = OrderKind.Idle;
    return true;
  }
  e.queue[i]!.shift();
  beginCast(state, i, s, t, x, z);
  return true;
}

/**
 * The fight layer for a mage, run before her orders (combat/fight.ts).
 * Returns true when it took the step.
 */
export function mageStep(state: SimState, i: number): boolean {
  const e = state.entities;
  // Counterspell: by herself, whatever she is doing (her own cast is dropped for it, costing nothing), when she knows it and it is ready.
  if (spellSpec(Spell.Counterspell).auto && e.school[i] === School.Battle && e.castSpell[i] !== Spell.Counterspell + 1 && canCast(state, i, Spell.Counterspell) && !insideOther(state, i)) {
    const c = casterNear(state, i, spellSpec(Spell.Counterspell).range);
    if (c >= 0) beginCast(state, i, spellSpec(Spell.Counterspell), c, 0, 0);
  }
  if (e.castSpell[i] !== 0) {
    if (state.step < e.castAt[i]!) {
      e.order[i] = OrderKind.Cast;
      return true;
    }
    resolveCast(state, i);
  }
  if (e.beamUntil[i]! > state.step && beamStep(state, i)) return true;
  const inside = e.inside[i] !== 0 ? state.buildings.get(e.inside[i]!) : undefined;
  const garrisoned = !!inside && garrisonRoom(inside) > 0;
  if (inside && !garrisoned) return false;
  const o = e.queue[i]![0];
  if (o?.t === 'cast') return runCastOrder(state, i, o);
  if (o?.t === 'attack') {
    const t = e.indexOf(o.id);
    if (!validTarget(state, i, t, true) || targetLost(state, i, t)) {
      e.queue[i]!.shift();
      e.target[i] = 0;
      resetWalk(state, i);
      return false;
    }
    e.target[i] = o.id;
    if (e.school[i] === School.Battle) return fightWithBolts(state, i, t, true, true);
    if (tap(state, i, t)) return true;
    chase(state, i, t, meleeOf(state, i).reach);
    return true;
  }
  const mode = garrisoned ? Mode.Hold : modeOf(o);
  if (mode === Mode.None) {
    e.target[i] = 0;
    e.chasing[i] = 0;
    return false;
  }
  const hold = mode === Mode.Hold;
  if (e.school[i] === School.Grove) return groveStep(state, i, hold);
  // A support mage heals by herself.
  if (e.school[i] === School.Support) {
    const s = spellSpec(Spell.Heal);
    if (s.auto && canCast(state, i, s.id)) {
      const t = healTarget(state, i, s, s.range);
      if (t >= 0 && canReachWith(state, i, s, t, 0, 0)) {
        beginCast(state, i, s, t, 0, 0);
        return true;
      }
    }
    if (garrisoned) return false;
    // Up close she taps with her wand; she never goes looking for a fight.
    const t = pickTarget(state, i, meleeOf(state, i).reach + M);
    if (t >= 0 && tap(state, i, t)) return true;
    return hold;
  }
  // A battle mage picks targets as a warrior does, within her bolt's range, and goes no more than 15 m after them.
  const range = spellSpec(Spell.ArcaneBolt).range;
  const acquire = hold ? range : mode === Mode.Seek ? Math.max(range, sightOf(state, i)) : range;
  let t = e.indexOf(e.target[i]!);
  if (!validTarget(state, i, t) || gap(state, i, t) > acquire + MAGE_LEASH_WU) t = -1;
  if (t >= 0 && !hold && e.chasing[i] === 1 && length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > MAGE_LEASH_WU && gap(state, i, t) > range) {
    t = -1;
    e.chasing[i] = mode === Mode.Idle ? 2 : 0;
  }
  if (t < 0) {
    e.target[i] = 0;
    const away = e.chasing[i] === 2 && length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > MAGE_LEASH_WU >> 1;
    t = away ? -1 : pickTarget(state, i, acquire, mode === Mode.Seek);
    if (t >= 0 && e.chasing[i] !== 1) {
      if (e.chasing[i] === 0) {
        e.homeX[i] = e.x[i]!;
        e.homeZ[i] = e.z[i]!;
      }
      e.chasing[i] = 1;
    }
  }
  if (t < 0) {
    if (e.chasing[i] === 1) e.chasing[i] = mode === Mode.Idle ? 2 : 0;
    if (e.chasing[i] === 2 && !garrisoned) {
      if (length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) <= M) {
        e.chasing[i] = 0;
        resetWalk(state, i);
        return false;
      }
      approach(state, i, e.homeX[i]!, e.homeZ[i]!, 0);
      return true;
    }
    return hold && !garrisoned;
  }
  e.target[i] = e.id[t]!;
  const fought = fightWithBolts(state, i, t, !hold, false);
  if (!fought) e.target[i] = 0;
  return garrisoned ? false : fought || hold;
}

// ----- the Elf Grovesinger -----

/** Mending bloom goes where at least this many of her people miss 20 health, or one misses half (s). */
const BLOOM_CROWD = 2;
const BLOOM_MISSING = 20;

/** The ally of hers to centre a Mending bloom on: where the most hurt allies stand, lowest id on ties; -1 for none worth it. */
function bloomSpot(state: SimState, i: number, s: SpellSpec): number {
  const e = state.entities;
  const hurt = (j: number): boolean => person(state, j) && e.maxHp[j]! - e.hp[j]! - (e.healUntil[j]! > state.step ? e.healLeft[j]! : 0) >= BLOOM_MISSING;
  let best = -1;
  let bestN = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, s.range)) {
    if (!ally(state, i, j) || !hurt(j) || gap(state, i, j) > s.range) continue;
    const n = alliesNear(state, i, e.x[j]!, e.z[j]!, s.radius).filter(hurt).length;
    const low = e.hp[j]! * 2 < e.maxHp[j]!;
    if (n < BLOOM_CROWD && !low) continue;
    if (best < 0 || n > bestN || (n === bestN && e.id[j]! < e.id[best]!)) {
      best = j;
      bestN = n;
    }
  }
  return best;
}

/** Whether a wild animal that can fight is within a radius of a point. */
function wildNear(state: SimState, x: number, z: number, radius: number): boolean {
  const e = state.entities;
  for (const j of state.grid.near(x, z, radius)) {
    if (e.kind[j] === UnitKind.Animal && e.owner[j] === WILD && e.hp[j]! > 0 && length2d(e.x[j]! - x, e.z[j]! - z) <= radius) return true;
  }
  return false;
}

/** Casts a spell on an ally's or enemy's spot if she can from here; true when she began. */
function castAtUnit(state: SimState, i: number, spell: number, j: number): boolean {
  const s = spellSpec(spell);
  if (j < 0 || !canCast(state, i, spell)) return false;
  const e = state.entities;
  const x = e.x[j]!;
  const z = e.z[j]!;
  if (s.target !== 'point') {
    if (!canReachWith(state, i, s, j, 0, 0)) return false;
    beginCast(state, i, s, j, 0, 0);
    return true;
  }
  if (!canReachWith(state, i, s, -1, x, z)) return false;
  beginCast(state, i, s, -1, x, z);
  return true;
}

/**
 * An Elf Grovesinger fights by herself (Elves: they work differently from
 * the players' mages): a Mending bloom where her people are hurt, then,
 * with an enemy in reach, Barkskin where her people stand, Rootbind where
 * most enemies stand, Call of the wild when wild beasts are near, and Thorn
 * volleys; up close her wand. Her people's AI keeps her near her post.
 */
function groveStep(state: SimState, i: number, hold: boolean): boolean {
  const e = state.entities;
  if (castAtUnit(state, i, Spell.MendingBloom, canCast(state, i, Spell.MendingBloom) ? bloomSpot(state, i, spellSpec(Spell.MendingBloom)) : -1)) return true;
  const thorns = spellSpec(Spell.ThornVolley);
  let t = e.indexOf(e.target[i]!);
  if (!validTarget(state, i, t) || gap(state, i, t) > thorns.range + MAGE_LEASH_WU) t = pickTarget(state, i, thorns.range);
  if (t < 0) {
    e.target[i] = 0;
    return hold;
  }
  e.target[i] = e.id[t]!;
  if (canCast(state, i, Spell.Barkskin) && castAtUnit(state, i, Spell.Barkskin, crowdSpot(state, i, spellSpec(Spell.Barkskin), spellSpec(Spell.Barkskin).range, false))) return true;
  if (canCast(state, i, Spell.Rootbind) && castAtUnit(state, i, Spell.Rootbind, crowdSpot(state, i, spellSpec(Spell.Rootbind), spellSpec(Spell.Rootbind).range, true))) return true;
  if (canCast(state, i, Spell.CallOfTheWild) && wildNear(state, e.x[i]!, e.z[i]!, spellSpec(Spell.CallOfTheWild).radius) && castAtUnit(state, i, Spell.CallOfTheWild, i)) return true;
  if (castAtUnit(state, i, Spell.ThornVolley, t)) return true;
  if (tap(state, i, t)) return true;
  face(state, i, t);
  if (hold || gap(state, i, t) <= thorns.range - RANGE_MARGIN_WU) {
    e.order[i] = OrderKind.Idle;
    return true;
  }
  chase(state, i, t, thorns.range - RANGE_MARGIN_WU);
  return true;
}
