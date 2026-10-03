// What happens when things fall (mob roster 5.2 to 5.6: drops, the slime's
// split, the bloated corpse's burst, the bomber's loose bomb; goblins'
// loot; Buildings: a wall torch falls with its wall), and when a player is
// out of the game (Winning, losing and score; When a player is eliminated).

import { BuildingKind, buildingSpec } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { wallBeside } from '../buildings/placement.ts';
import type { Building } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { floorDiv, WU_PER_METRE } from '../fixed.ts';
import { MONSTERS, NEUTRAL, NO_CARRY, PEOPLES, UnitKind, type SimState } from '../state.ts';
import { peoplesHooks } from '../peoples/hooks.ts';
import { killXpTenths } from '../rules.ts';
import { destroyBuilding, dropQueue, isFarm } from '../units/behaviour.ts';
import { blast, BURST_BLAST, deathHooks, fallText, shareKillXp } from './combat.ts';
import { addMob } from './mob-ai.ts';
import { BLAST, isLair, Mob, mobSpec } from './mobs.ts';
import { clearLair } from '../threats/lairs.ts';
import { rollDrops } from '../threats/loot.ts';
import { Role } from '../threats/types.ts';
import { onVillageLoss } from '../threats/villages.ts';

/** A broken wall says so at most once every 5 s per player. */
const WALL_ALERT_STEPS = 100;
/** Not state: when each player last heard that a wall broke. */
const wallAlerts = new WeakMap<SimState, number[]>();

function onMobDeath(state: SimState, i: number, taker: number): void {
  const e = state.entities;
  const spec = mobSpec(e.mob[i]!);
  const now = clockAt(state.step, state.blood);
  const night = now.cycle - (now.period === Period.Night || now.period === Period.Dusk ? 0 : 1);
  if (taker >= 0 && taker < state.players.length) {
    const pool = state.players[taker]!.pool;
    // Drops: now and then, never on every kill; one roll per row on the 'combat' stream.
    rollDrops(state, spec.drops, taker);
    // A goblin gives back what it took from a worker.
    if (e.carryAmt[i]! > 0 && e.carryRes[i] !== NO_CARRY) pool[e.carryRes[i]!] = pool[e.carryRes[i]!]! + e.carryAmt[i]!;
  }
  // A people's building or wagon falls; one they left gives its materials to the workers who broke it down.
  if (e.owner[i] === PEOPLES) peoplesHooks.death(state, i, taker);
  else if (e.owner[i] === NEUTRAL && e.group[i] !== 0 && hitByWorker(state, i) && taker >= 0) peoplesHooks.salvage(state, i, taker);
  // A lair falls (its hoard and the warriors' experience); a village counts its losses towards war.
  if (isLair(spec.id)) clearLair(state, i, taker);
  else if (e.owner[i] === MONSTERS && (e.role[i] === Role.Village || (e.role[i] === Role.Structure && e.group[i] !== 0))) onVillageLoss(state, i, taker, hitByWorker(state, i));
  const x = e.x[i]!;
  const z = e.z[i]!;
  switch (spec.id) {
    case Mob.Slime: {
      // Splits into two small slimes.
      for (const dx of [-WU_PER_METRE >> 1, WU_PER_METRE >> 1]) addMob(state, Mob.SmallSlime, e.foe[i]!, x + dx, z, Math.max(0, night));
      break;
    }
    case Mob.BloatedCorpse:
      // Bursts, even when the sun killed it.
      blast(state, x, e.y[i]! + WU_PER_METRE, z, BURST_BLAST, null, e.id[i]!);
      break;
    case Mob.SkeletonBomber:
      // Killed before it went off: its bomb rolls loose and goes off 2 s later.
      if (e.fuseAt[i] !== 1 && e.hp[i] === 0) {
        const k = addMob(state, Mob.BombKeg, e.foe[i]!, x, z, Math.max(0, night));
        e.fuseAt[k] = state.step + BLAST.fuse;
      }
      break;
    case Mob.BombKeg:
      // A loose bomb that is hit goes off at once.
      if (e.fuseAt[i] !== 1) blast(state, x, e.y[i]! + WU_PER_METRE, z, { damage: BLAST.unit, radius: BLAST.unitRadius }, { damage: BLAST.building, radius: BLAST.buildingRadius }, e.id[i]!);
      break;
  }
}

/** Whether a worker was among the units that hit it lately (workers breaking down a hut). */
function hitByWorker(state: SimState, i: number): boolean {
  const e = state.entities;
  const list = e.hitters[i]!;
  for (let k = 0; k < list.length; k += 2) {
    const j = e.indexOf(list[k]!);
    if (j >= 0 && e.kind[j] === UnitKind.Worker) return true;
  }
  return false;
}

function onUnitDeath(state: SimState, i: number): void {
  const e = state.entities;
  // One of the peoples: their losses, the killers' experience (health / 50, as daytime foes) and their war.
  if (e.owner[i] === PEOPLES) {
    peoplesHooks.death(state, i, shareKillXp(state, i, killXpTenths(null, e.maxHp[i]!)));
    return;
  }
  // Gear set aside for it goes back to the stock; what it wore is lost with it.
  dropQueue(state, i);
  // A goblin that killed a worker takes its load.
  if (e.kind[i] === UnitKind.Worker && e.carryAmt[i]! > 0) {
    const a = e.indexOf(e.attacker[i]!);
    if (a >= 0 && e.kind[a] === UnitKind.Mob && (e.mob[a] === Mob.GoblinCutter || e.mob[a] === Mob.GoblinSlinger || e.mob[a] === Mob.GoblinChief) && e.carryAmt[a] === 0) {
      e.carryRes[a] = e.carryRes[i]!;
      e.carryAmt[a] = e.carryAmt[i]!;
    }
  }
}

function onBuildingFall(state: SimState, b: Building): void {
  const spec = buildingSpec(b.kind);
  if (spec.defence === 'wall' || spec.defence === 'gate') {
    let last = wallAlerts.get(state);
    if (!last) {
      last = [];
      wallAlerts.set(state, last);
    }
    if (state.step - (last[b.owner] ?? -WALL_ALERT_STEPS) >= WALL_ALERT_STEPS) {
      last[b.owner] = state.step;
      const [x, z] = buildingCentre(b);
      state.events.push({ player: b.owner, kind: 'alert', text: fallText(b), x, z });
    }
  }
  destroyBuilding(state, b.id);
  // A wall torch with no wall left beside it falls too (Table 18: dies with its wall).
  if (spec.defence === 'wall') {
    for (const t of state.buildings.list) {
      if (t.kind !== BuildingKind.WallTorch || t.hp <= 0) continue;
      if (Math.abs(t.x - b.x) > 1 || Math.abs(t.z - b.z) > 1) continue;
      if (!wallBeside(state, t.x, t.z)) {
        t.hp = 0;
        state.falling.push(t.id);
      }
    }
  }
}

/** Installs the death hooks. */
export function installDeathHooks(): void {
  deathHooks.mob = onMobDeath;
  deathHooks.unit = onUnitDeath;
  deathHooks.building = onBuildingFall;
}

// ----- losing -----

/** Whether a player can still make workers: a main base or a farm of theirs stands (finished). */
function canMakeWorkers(state: SimState, player: number): boolean {
  for (const b of state.buildings.list) {
    if (b.owner !== player || !b.complete) continue;
    if (b.kind === BuildingKind.MainBase || isFarm(b.kind)) return true;
  }
  return false;
}

function hasWorkers(state: SimState, player: number): boolean {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.kind[i] === UnitKind.Worker && e.hp[i]! > 0) return true;
  return false;
}

/**
 * The score: nights survived, counted as the dawns reached (Winning,
 * losing and score). Night n is survived once its dawn begins.
 */
export function nightsSurvived(step: number, blood: readonly number[] = []): number {
  const c = clockAt(step, blood);
  return c.cycle + (c.period === Period.Dawn ? 1 : 0);
}

/**
 * Each step: a player with no workers and no main base or farm is out
 * (eliminate). When every player is out the game is over, with the nights
 * survived as the score.
 */
export function updateElimination(state: SimState): void {
  if (state.over) return;
  for (let p = 0; p < state.players.length; p++) {
    const ps = state.players[p]!;
    if (ps.out || hasWorkers(state, p) || canMakeWorkers(state, p)) continue;
    eliminate(state, p, state.players.length > 1 ? `Player ${p + 1} has been eliminated.` : 'Your last worker has fallen and nothing is left to train more.');
  }
  if (state.players.every((ps) => ps.out)) {
    state.over = state.step;
    const n = nightsSurvived(state.step, state.blood);
    state.events.push({ player: -1, kind: 'alert', text: `The game is over. Nights survived: ${n}.` });
  }
}

/**
 * A player leaves the match for good: eliminated, or gone with the host
 * choosing to carry on without them (When a player is eliminated or leaves).
 * Their resources are split evenly among the players left (any
 * remainder to the lowest-numbered). Their buildings and units become shared
 * by every remaining player: the next player still in owns them (and feeds
 * the units and gets what they gather, s), and any remaining player may
 * command the units and use the buildings, paying with their own resources;
 * the buildings keep the research their old owner had, for anyone using them.
 */
export function eliminate(state: SimState, p: number, text: string): void {
  const ps = state.players[p];
  if (!ps || ps.out) return;
  // The step it happened (at least 1: 0 means still in).
  ps.out = Math.max(1, state.step);
  ps.share = 0;
  const left: number[] = [];
  for (let q = 0; q < state.players.length; q++) if (!state.players[q]!.out) left.push(q);
  state.events.push({ player: -1, kind: 'alert', text });
  if (left.length === 0) return;
  const list = ps.pool;
  for (let r = 0; r < list.length; r++) {
    const n = list[r]!;
    if (n <= 0) continue;
    const each = floorDiv(n, left.length);
    left.forEach((q, k) => {
      const to = state.players[q]!.pool;
      to[r] = to[r]! + each + (k < n - each * left.length ? 1 : 0);
    });
    list[r] = 0;
  }
  const heir = left[0]!;
  state.buildings.rev++;
  for (const b of state.buildings.list) {
    if (b.owner === p) {
      b.owner = heir;
      b.shared = 1;
      b.tech |= ps.research;
    }
    // What they had queued anywhere is finished for the heir.
    for (const q of b.queue) if (q.by === p) q.by = heir;
  }
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] === p) {
      e.owner[i] = heir;
      e.shared[i] = 1;
    }
    if (e.kind[i] === UnitKind.Mob && e.foe[i] === p) e.foe[i] = heir;
  }
}
