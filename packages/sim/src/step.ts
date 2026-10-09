// The step function: the only way the simulation advances. Inputs in, state
// changed in place, a small result out.

import { computeEnclosed, outlyingLights } from './buildings/lights.ts';
import { installCrewHooks, updateBuildings } from './buildings/production.ts';
import { updateMines } from './buildings/mining.ts';
import { updateTaverns } from './buildings/tavern.ts';
import { updateDreadnoughts } from './units/dreadnought.ts';
import { clockAt, Period, periodMessage, periodStarting } from './clock.ts';
import { applyOrders } from './commands.ts';
import { clamp, floorDiv, HASH_INTERVAL_STEPS, headingTowards, length2d, WU_PER_METRE } from './fixed.ts';
import type { Order } from './orders.ts';
import { hashState } from './serialize.ts';
import { FOG_INTERVAL_STEPS, NEUTRAL, OrderKind, revealVision, UnitKind, visionSources, type SimState } from './state.ts';
import { Act, leaveBuilding, resetWalk, runUnit } from './units/behaviour.ts';
import { autoDropoff, updateLoot } from './units/loot.ts';
import { hurtHooks, settleDeaths } from './combat/combat.ts';
import { installDeathHooks, updateElimination } from './combat/deaths.ts';
import { forgetSideSight, onUnitHurt } from './combat/fight.ts';
import { flyerAhead, mobBudget, runMob, updateSun } from './combat/mob-ai.ts';
import { aimHooks, updateProjectiles } from './combat/projectiles.ts';
import { updateSpawns } from './combat/spawn.ts';
import { updateFood } from './economy/food.ts';
import { installAnimalHooks, runAnimal, stockHooks, updateAnimals } from './animals/animals.ts';
import { installFoes } from './threats/foes.ts';
import { onFoeHurt, threatsAtPeriod, updateThreats } from './threats/update.ts';
import { checkCell } from './threats/villages.ts';
import { updateSeen } from './threats/lairs.ts';
import { guardSpring, updateSprings } from './threats/springs.ts';
import { updateMagic } from './magic/cast.ts';
import { refillMages } from './magic/mages.ts';
import { peoplesAtPeriod, runBeast, runWagon, updatePeoples } from './peoples/ai.ts';
import { checkPeoples } from './peoples/factions.ts';
import { peoplesHooks } from './peoples/hooks.ts';
import { onQuestKill, updateQuests } from './peoples/quests.ts';
import { onPeoplesDeath, onSalvage, onTreeCut, recampIn } from './peoples/war.ts';
import { trackRuns } from './mounts/riding.ts';
import { runEngine } from './siege/engines.ts';
import { installLateMobs } from './threats/late-mobs.ts';
import { installEncounters } from './threats/encounters.ts';
import { brightTonight } from './threats/bright.ts';
import { mountHooks } from './mounts/riding.ts';
import { rearRider } from './peoples/factions.ts';
import { onTop } from './units/top.ts';
import { crewHooks, updateQuestions } from './units/questions.ts';
import { releaseSheltered } from './units/night-work.ts';
import { updateSpacing } from './units/spacing.ts';
import { updateWorkAsks } from './units/work-asks.ts';
import { updateMakeAsks } from './units/make-asks.ts';
import { circlesAtPeriod } from './circles/update.ts';
import { updateGods } from './debug/god.ts';

installDeathHooks();
installAnimalHooks();
// Handed in from here: production importing the questions would close an import loop through the units' gear.
installCrewHooks(crewHooks);
installFoes();
installLateMobs();
installEncounters();
mountHooks.rearRider = rearRider;
stockHooks.chunk = guardSpring;
stockHooks.cell = (state, cellId) => {
  checkCell(state, cellId);
  // Runkin who left a camp settle in the cell they went to; else the cell may hold one of the peoples.
  if (recampIn(state, cellId)) state.peoples.checked.add(cellId);
  else checkPeoples(state, cellId);
};
peoplesHooks.death = onPeoplesDeath;
peoplesHooks.salvage = onSalvage;
peoplesHooks.wagon = runWagon;
peoplesHooks.beast = runBeast;
peoplesHooks.treeCut = onTreeCut;
peoplesHooks.kill = onQuestKill;
aimHooks.ahead = flyerAhead;
hurtHooks.unit = (state, i, from, fresh) => {
  onUnitHurt(state, i, from, fresh);
  onFoeHurt(state, i, from);
};

/** How far a wanderer strays per leg, and how far from the origin it may roam. */
const WANDER_LEG_WU = 15 * WU_PER_METRE;
const WANDER_BOUND_WU = 40 * WU_PER_METRE;

export interface StepResult {
  /** The step number the state has now reached. */
  step: number;
  /** The state hash, present every HASH_INTERVAL_STEPS steps (the desync hook). */
  hash?: number;
}

/** M0's wanderers: neutral units that walk straight to random points, drawing on the 'ai' stream. */
function wander(state: SimState, i: number): void {
  const e = state.entities;
  const ai = state.rng.ai;
  if (e.order[i] === OrderKind.Idle) {
    const at = e.wanderAt[i]!;
    if (at !== 0 && state.step >= at) {
      e.order[i] = OrderKind.Move;
      e.targetX[i] = clamp(e.x[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
      e.targetZ[i] = clamp(e.z[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
    }
    return;
  }
  const dx = e.targetX[i]! - e.x[i]!;
  const dz = e.targetZ[i]! - e.z[i]!;
  if (dx === 0 && dz === 0) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  e.heading[i] = headingTowards(dx, dz);
  const speed = e.speed[i]!;
  const dist = length2d(dx, dz);
  if (dist <= speed) {
    e.x[i] = e.targetX[i]!;
    e.z[i] = e.targetZ[i]!;
    e.order[i] = OrderKind.Idle;
    e.wanderAt[i] = state.step + ai.range(20, 100);
  } else {
    e.x[i] = e.x[i]! + floorDiv(dx * speed, dist);
    e.z[i] = e.z[i]! + floorDiv(dz * speed, dist);
  }
  e.y[i] = state.world.groundY(e.x[i]!, e.z[i]!, e.y[i]!);
}

/** What happens as a period begins: the alert, and at dusk the outlying count and enclosures, at day the shelters empty. */
function periodChange(state: SimState): void {
  const p = periodStarting(state.step);
  if (p === -1) return;
  const c = clockAt(state.step);
  state.events.push({ player: -1, kind: 'period', text: periodMessage(c) });
  threatsAtPeriod(state, p, c.cycle);
  peoplesAtPeriod(state, p);
  circlesAtPeriod(state, p, c.cycle);
  if (p === Period.Dusk) {
    computeEnclosed(state);
    for (let player = 0; player < state.players.length; player++) {
      const { halves, limit } = outlyingLights(state, player, c.cycle);
      if (halves > limit * 2 && !brightTonight(state, player)) {
        const n = floorDiv(halves + 1, 2);
        state.events.push({ player, kind: 'alert', text: `Too many lights burn outside the base: ${n}, and the limit tonight is ${limit}. Goblins will come for them.` });
      }
    }
  }
  if (p === Period.Day) {
    // Units sent home by day (Everyone Home) come out at daybreak and carry on with what they were doing; those in for the night come out in releaseSheltered.
    const e = state.entities;
    for (let i = 0; i < e.count; i++) {
      const h = e.queue[i]![0];
      if (h?.t !== 'enter' || h.auto !== 1) continue;
      e.queue[i]!.shift();
      e.act[i] = Act.Start;
      e.timer[i] = 0;
      resetWalk(state, i);
      if (e.inside[i] !== 0) leaveBuilding(state, i);
    }
  }
}

/**
 * Advances the state by one step (50 ms of game time). `orders` are every
 * player's orders for this step; they are applied before anything moves.
 */
export function step(state: SimState, orders: readonly Order[] = []): StepResult {
  state.events = [];
  state.hits = [];
  state.dying = [];
  state.falling = [];
  state.paths.searches = 0;
  mobBudget.searches = 0;
  forgetSideSight(state);
  const e = state.entities;
  state.grid.rebuild(e, (i) => onTop(state, i));
  applyOrders(state, orders);
  // The debugger's godmode: a full pool every step (Jade's Patch 5).
  updateGods(state);
  periodChange(state);
  // Workers in for the night come out at dawn once no monster is near, or in the day (Jade's Patch 4).
  releaseSheltered(state);
  updateSpawns(state);
  updateAnimals(state);
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    if (e.owner[i] === NEUTRAL && e.kind[i] === UnitKind.Wanderer) wander(state, i);
    else if (e.kind[i] === UnitKind.Mob) runMob(state, i);
    else if (e.kind[i] === UnitKind.Animal) runAnimal(state, i);
    else if (e.kind[i] === UnitKind.Engine) runEngine(state, i);
    else runUnit(state, i);
  }
  // Bodies standing on top of one another make room (Jade's Patch 3).
  updateSpacing(state);
  trackRuns(state);
  updateProjectiles(state);
  updateSun(state);
  updateThreats(state);
  updateSprings(state);
  updatePeoples(state);
  updateQuests(state);
  updateMagic(state);
  refillMages(state);
  updateFood(state);
  updateQuestions(state);
  // Jade's Patch 4: an empty farm, a building no one works on and an idle worker ask by themselves.
  updateWorkAsks(state);
  // Patch 5 (UI-8): the Workshop offers now and then to make something the stock pays for.
  updateMakeAsks(state);
  settleDeaths(state);
  updateLoot(state);
  // Patch 5 (GP-6): units near a drop-off hand in what they carry.
  autoDropoff(state);
  updateBuildings(state);
  // Patch 5: open Taverns burn food into silver, and Dreadnoughts speak their minds.
  updateTaverns(state);
  updateDreadnoughts(state);
  updateMines(state);
  updateElimination(state);
  state.world.flowWater();
  forgetSideSight(state);
  state.step++;
  // What the players' side sees: the land in sight explored, and the lairs and villages in it found (shared by every player).
  if (state.step % FOG_INTERVAL_STEPS === 0) {
    revealVision(state);
    updateSeen(state, visionSources(state));
  }
  if (state.step % HASH_INTERVAL_STEPS === 0) return { step: state.step, hash: hashState(state) };
  return { step: state.step };
}
