// The Citadel's engine platform (Patch 5, Jade's CT-3). Where the Citadel's
// pointed tower stood, its highest point is a flat platform. The Citadel's
// Build defense menu builds a fixed engine up there (FIXED_ENGINES: the
// mobile engines' numbers, cost and time, on braces instead of wheels), which
// never comes down. It comes with its crew of garrison artillery crewmen, who
// stay up there with it for good; the engine and its crew are hurt and killed
// apart, by flyers and ranged attackers only. The same menu upgrades the
// engine to one higher on the ladder, for the difference in cost and time (it
// cannot fire while the upgrade builds), and trains a garrison crewman while
// the engine is short of one. While no engine stands there, up to 4 regular
// units may (units/top.ts).

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { footprintDims, type Platform } from '../buildings/footprints.ts';
import { ENGINE_PRODUCT, Product, TROOP_PRODUCT, type Building, type QueueItem } from '../buildings/store.ts';
import { giveFood } from '../economy/food.ts';
import type { Cost, Res } from '../economy/resources.ts';
import { floorDiv } from '../fixed.ts';
import type { SimState } from '../state.ts';
import { stopUnit } from '../units/behaviour.ts';
import { menOnTop, platformEngine, postAt, spreadTop, topRoom } from '../units/top.ts';
import { CITADEL_LEVEL, type Engine, engineSpec, engineUpgrade, FIXED_ENGINES, UPGRADE_MIN_TIME_BP, upgradeClimbs, upgradeOf } from './data.ts';
import { addCrewman, addEngine, crewSworn } from './engines.ts';

/** A Citadel's engine platform, or undefined for any other building (or one not finished). */
export function platformOf(b: Building): Platform | undefined {
  if (!b.complete || b.kind !== BuildingKind.MainBase || b.level < CITADEL_LEVEL) return undefined;
  return footprintDims(b.kind, b.variant, b.level).platform;
}

/** What a Citadel makes for its platform (Build defense): each fixed engine, each upgrade up the ladder, and the garrison crewman. */
export function platformProducts(): number[] {
  const out = FIXED_ENGINES.map((id) => ENGINE_PRODUCT + id);
  for (const from of FIXED_ENGINES) for (const to of FIXED_ENGINES) if (upgradeClimbs(from, to)) out.push(ENGINE_PRODUCT + engineUpgrade(from, to));
  out.push(Product.GarrisonCrewman);
  return out;
}

/** An upgrade's cost: what the new engine takes beyond the old one, resource by resource (Jade: "the resources ... difference"). */
export function upgradeCost(from: Engine, to: Engine): Cost {
  const had = engineSpec(from).cost;
  const out: Array<readonly [Res, number]> = [];
  for (const [res, n] of engineSpec(to).cost) {
    const before = had.find(([r]) => r === res)?.[1] ?? 0;
    if (n > before) out.push([res, n - before]);
  }
  return out;
}

/** An upgrade's time: the difference, but at least UPGRADE_MIN_TIME_BP of the new engine's time (s). */
export function upgradeSteps(from: Engine, to: Engine): number {
  const steps = engineSpec(to).steps;
  return Math.max(steps - engineSpec(from).steps, floorDiv(steps * UPGRADE_MIN_TIME_BP, 10000));
}

/** Garrison crewmen an upgrade brings: the new engine's crew beyond the old one's (Jade: from one crewman to two, the second comes with it). */
export function upgradeCrew(from: Engine, to: Engine): number {
  return Math.max(0, engineSpec(to).crew - engineSpec(from).crew);
}

/** The fixed engine or upgrade queued at a Citadel for its platform, if any. */
function platformQueued(b: Building): QueueItem | undefined {
  return b.queue.find((q) => q.product >= ENGINE_PRODUCT && q.product < TROOP_PRODUCT);
}

/** Crewmen the fixed engine on a Citadel's platform is short: its crew less those crewing it and the garrison crewmen queued for it. */
export function crewShort(state: SimState, b: Building, engine: number): number {
  const queued = b.queue.filter((q) => q.product === Product.GarrisonCrewman).length;
  return engineSpec(state.entities.mob[engine]!).crew - crewSworn(state, engine).length - queued;
}

const lower = (name: string): string => name.toLowerCase();
const article = (name: string): string => (/^[aeiou]/i.test(name) ? 'An' : 'A');

/**
 * Why a Citadel cannot make one of its platform's products for a player now,
 * or '' (what productProblem asks besides the tier, the research and the
 * stock): an Artillery workshop to use (Jade: "the ability to make" the
 * mobile one), the platform free for an engine or holding the one an upgrade
 * starts from, nothing else queued for it, and an engine short of crew.
 */
export function platformProblem(state: SimState, b: Building, product: number, user: number): string {
  if (!platformOf(b)) return 'Only a Citadel has an engine platform.';
  const e = state.entities;
  const on = platformEngine(state, b.id);
  const name = on >= 0 ? engineSpec(e.mob[on]!).name : '';
  if (product === Product.GarrisonCrewman) {
    if (on < 0) return 'There is no fixed engine on the engine platform to crew.';
    return crewShort(state, b, on) > 0 ? '' : `The ${lower(name)} has its full crew.`;
  }
  const up = upgradeOf(product - ENGINE_PRODUCT);
  const workshop = state.buildings.list.some((w) => w.complete && w.kind === BuildingKind.ArtilleryWorkshop && (w.owner === user || (w.shared !== 0 && state.players[user]!.out === 0)));
  if (!workshop) return 'Needs an Artillery workshop.';
  const queued = platformQueued(b);
  if (queued) return upgradeOf(queued.product - ENGINE_PRODUCT) ? `The ${lower(name || 'engine')} is being upgraded.` : 'An engine is already being built for the engine platform.';
  if (!up) return on >= 0 ? `${article(name)} ${lower(name)} already stands on the engine platform. Upgrade it instead.` : '';
  if (on < 0) return 'There is no engine on the engine platform to upgrade.';
  if (e.mob[on] !== up.from) return `The engine platform holds ${article(name).toLowerCase()} ${lower(name)}.`;
  return '';
}

/** A garrison crewman for an engine on its Citadel's platform, at the first free crew place up there; returns his index. */
function addPlatformCrewman(state: SimState, b: Building, engine: number, pl: Platform): number {
  const e = state.entities;
  const crew = crewSworn(state, engine);
  const places = pl.crew.map((p) => postAt(b, p));
  const free = places.find(([x, , z]) => !crew.some((j) => e.x[j] === x && e.z[j] === z)) ?? places[crew.length % places.length]!;
  const j = addCrewman(state, e.owner[engine]!, free[0], free[2], engine);
  e.inside[j] = b.id;
  e.y[j] = free[1];
  e.heading[j] = e.heading[engine]!;
  return j;
}

/** Men up top beyond the Citadel's room once an engine takes the platform come down (those on the platform first); the rest stand on the places left. */
function makeRoom(state: SimState, b: Building, pl: Platform): void {
  const e = state.entities;
  const men = menOnTop(state, b.id);
  const there = (j: number): boolean => pl.posts.some((p) => {
    const [x, , z] = postAt(b, p);
    return e.x[j] === x && e.z[j] === z;
  });
  let extra = men.length - topRoom(state, b);
  for (const j of [...men.filter(there), ...men.filter((j) => !there(j))]) {
    if (extra-- <= 0) break;
    stopUnit(state, j);
  }
  spreadTop(state, b);
}

/** A fixed engine is done: it stands on the Citadel's platform with its full crew at their places (Jade: "you get the first one(s) with the engine"). */
export function spawnFixedEngine(state: SimState, b: Building, kind: number, owner: number): void {
  const pl = platformOf(b);
  if (!pl) return;
  const e = state.entities;
  const [x, y, z] = postAt(b, pl.engine);
  const i = addEngine(state, owner, kind, x, z);
  e.inside[i] = b.id;
  e.y[i] = y;
  const spec = engineSpec(kind);
  for (let k = 0; k < spec.crew; k++) addPlatformCrewman(state, b, i, pl);
  makeRoom(state, b, pl);
  const crew = spec.crew === 1 ? 'its garrison crewman' : `its ${spec.crew} garrison crewmen`;
  state.events.push({ player: owner, kind: 'info', text: `${article(spec.name)} ${lower(spec.name)} stands on the Citadel's engine platform, with ${crew}. It never leaves it.`, x, z });
}

/** A garrison crewman is trained: up to the platform's engine if it is still short of crew; false if it is not (he comes out as an artillery crewman instead). */
export function spawnGarrisonCrewman(state: SimState, b: Building): boolean {
  const pl = platformOf(b);
  const on = platformEngine(state, b.id);
  if (!pl || on < 0) return false;
  const spec = engineSpec(state.entities.mob[on]!);
  if (crewSworn(state, on).length >= spec.crew) return false;
  const j = addPlatformCrewman(state, b, on, pl);
  const e = state.entities;
  state.events.push({ player: e.owner[j]!, kind: 'info', text: `A garrison crewman is up on the engine platform, crewing the ${lower(spec.name)}.`, x: e.x[j]!, z: e.z[j]! });
  return true;
}

/**
 * An upgrade is done: the engine on the platform becomes the new one, keeping
 * the damage it had taken (s), and going from one crewman to two with the one
 * still alive brings the second (Jade). With the engine gone, or another one
 * up there, what was paid comes back.
 */
export function finishUpgrade(state: SimState, b: Building, item: QueueItem): void {
  const up = upgradeOf(item.product - ENGINE_PRODUCT);
  if (!up) return;
  const e = state.entities;
  const on = platformEngine(state, b.id);
  const pl = platformOf(b);
  const [cx, cz] = buildingCentre(b);
  if (on < 0 || !pl || e.mob[on] !== up.from) {
    const player = state.players[item.by]!;
    for (const [res, n] of item.paid) {
      if (n < 0) giveFood(player, [[res, -n]]);
      else player.pool[res] = player.pool[res]! + n;
    }
    state.events.push({ player: item.by, kind: 'alert', text: `The upgrade to ${article(engineSpec(up.to).name).toLowerCase()} ${lower(engineSpec(up.to).name)} found no ${lower(engineSpec(up.from).name)} on the platform. What it cost is given back.`, x: cx, z: cz });
    return;
  }
  const before = engineSpec(up.from);
  const after = engineSpec(up.to);
  const lost = e.maxHp[on]! - e.hp[on]!;
  e.mob[on] = up.to;
  e.maxHp[on] = after.hp;
  e.hp[on] = Math.max(1, after.hp - lost);
  if (crewSworn(state, on).length >= before.crew) for (let k = upgradeCrew(up.from, up.to); k > 0; k--) addPlatformCrewman(state, b, on, pl);
  state.events.push({ player: item.by, kind: 'info', text: `The ${lower(before.name)} on the engine platform is now ${article(after.name).toLowerCase()} ${lower(after.name)}.`, x: e.x[on]!, z: e.z[on]! });
}
