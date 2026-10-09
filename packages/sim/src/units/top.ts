// Men up top (Table 4's tower slots and main base parapets; Jade's patch
// notes 1: manning defences). Anyone on foot may man a tower or a level 3+
// main base: warriors of every kind, mages, and workers. They stand at the
// places the footprint table gives the level (footprints.ts posts), drawn
// there and seen there. Archers and mages shoot and cast from up there as
// before; men without a ranged weapon are out of reach of anything that
// walks, and fight only flyers that swoop down at them. Workers sent in go
// up top while there is room and shelter inside when it is full; Everyone
// Home and a double-tapped Enter shelter them inside. Patch 5 (Jade, CT-3):
// a Citadel's engine platform takes up to 4 more men while no fixed engine
// stands on it, and the fixed engine and its crew stand up there for good;
// air and ranged attackers can reach everything on the platform.

import { WU_PER_COLUMN, WU_PER_MODEL_UNIT, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { garrisonRoom, type Building } from '../buildings/store.ts';
import { footprintDims, type Post } from '../buildings/footprints.ts';
import { UnitKind, type SimState } from '../state.ts';
import { ENTER_TOP } from './unit-orders.ts';

/** The building a unit stands on top of, or undefined (it is out, or inside one). A fixed engine and its crew stand on their Citadel's platform. */
export function topOf(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  const id = e.inside[i]!;
  if (id === 0) return undefined;
  if (e.kind[i] === UnitKind.Engine) return state.buildings.get(id);
  const o = e.queue[i]![0];
  if (o?.t === 'crew') return platformCrew(state, i) ? state.buildings.get(id) : undefined;
  if (o?.t !== 'enter' || o.b !== id) return undefined;
  if (e.kind[i] === UnitKind.Worker && o.auto !== ENTER_TOP) return undefined;
  const b = state.buildings.get(id);
  return b && garrisonRoom(b) > 0 ? b : undefined;
}

/** Whether a unit stands on top of a building. */
export function onTop(state: SimState, i: number): boolean {
  return topOf(state, i) !== undefined;
}

/** Whether a unit may go up on a tower or a main base's top: anyone on foot (a rider gets down first, Table 1's mounted row). */
export function mayMan(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.mount[i]) return false;
  const k = e.kind[i];
  return k === UnitKind.Warrior || k === UnitKind.Mage || k === UnitKind.Worker;
}

/** The units on top of a building, by index. */
export function unitsOnTop(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) if (e.inside[j] === id && onTop(state, j)) out.push(j);
  return out;
}

/** The men on a building's top, by index: everyone up there but a fixed engine and its crew, who keep places of their own (Patch 5). */
export function menOnTop(state: SimState, id: number): number[] {
  const e = state.entities;
  return unitsOnTop(state, id).filter((j) => e.kind[j] !== UnitKind.Engine && !platformCrew(state, j));
}

/** Where a post of a building's level stands, wu. */
export function postAt(b: Building, post: Post): [number, number, number] {
  const d = footprintDims(b.kind, b.variant, b.level);
  const x0 = (b.x + d.ox) * WU_PER_COLUMN;
  const z0 = (b.z + d.oz) * WU_PER_COLUMN;
  return [x0 + post[0] * WU_PER_MODEL_UNIT, b.y * WU_PER_TERRAIN_UNIT + post[2] * WU_PER_MODEL_UNIT, z0 + post[1] * WU_PER_MODEL_UNIT];
}

/** The fixed engine on a building's platform, or -1 (Patch 5: no other engine ever stands inside a building). */
export function platformEngine(state: SimState, id: number): number {
  const e = state.entities;
  for (let j = 0; j < e.count; j++) if (e.kind[j] === UnitKind.Engine && e.inside[j] === id && e.hp[j]! > 0) return j;
  return -1;
}

/**
 * Whether a unit is a garrison artillery crewman up on a Citadel's engine
 * platform: crewing its fixed engine, or left there when that engine was
 * destroyed. Jade (CT-3): they "are stuck up there all game until killed or
 * they die", so they stay to man the next engine built there.
 */
export function platformCrew(state: SimState, i: number): boolean {
  const e = state.entities;
  const o = e.queue[i]![0];
  if (o?.t !== 'crew' || e.inside[i] === 0) return false;
  const k = e.indexOf(o.id);
  if (k >= 0 && e.kind[k] === UnitKind.Engine && e.hp[k]! > 0) return e.inside[k] === e.inside[i];
  const b = state.buildings.get(e.inside[i]!);
  return b !== undefined && footprintDims(b.kind, b.variant, b.level).platform !== undefined;
}

/** Garrison crewmen up on a Citadel's platform whose fixed engine was destroyed, waiting for the next one. */
export function strandedCrew(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) {
    const o = e.queue[j]![0];
    if (e.inside[j] !== id || e.hp[j]! <= 0 || o?.t !== 'crew' || !platformCrew(state, j)) continue;
    const k = e.indexOf(o.id);
    if (k < 0 || e.hp[k]! <= 0) out.push(j);
  }
  return out;
}

/** Whether a unit stands on a Citadel's engine platform: its fixed engine, that engine's crew, or one of the men standing there. */
export function onPlatform(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.inside[i] === 0) return false;
  if (e.kind[i] === UnitKind.Engine || platformCrew(state, i)) return true;
  const b = topOf(state, i);
  const pl = b ? footprintDims(b.kind, b.variant, b.level).platform : undefined;
  if (!b || !pl) return false;
  return pl.posts.some((p) => {
    const [x, , z] = postAt(b, p);
    return e.x[i] === x && e.z[i] === z;
  });
}

/** The places for men on a building's top: its level's posts, then the Citadel's platform places while no fixed engine stands there (Patch 5). */
export function topPosts(state: SimState, b: Building): readonly Post[] {
  const d = footprintDims(b.kind, b.variant, b.level);
  if (!d.platform || garrisonRoom(b) === 0 || platformEngine(state, b.id) >= 0) return d.posts;
  return [...d.posts, ...d.platform.posts];
}

/** How many men a building's top takes now (garrisonRoom, and the Citadel's platform while no engine stands on it). */
export function topRoom(state: SimState, b: Building): number {
  const room = garrisonRoom(b);
  return room === 0 ? 0 : Math.max(room, topPosts(state, b).length);
}

/** Where the n-th man on a building's top stands, wu: its places in turn (the middle of its footprint if it has none). */
export function topPost(state: SimState, b: Building, n: number): [number, number, number] {
  const posts = topPosts(state, b);
  const post = posts[n % Math.max(1, posts.length)];
  if (!post) {
    const d = footprintDims(b.kind, b.variant, b.level);
    return [(b.x + d.ox) * WU_PER_COLUMN + ((d.w * WU_PER_COLUMN) >> 1), b.y * WU_PER_TERRAIN_UNIT, (b.z + d.oz) * WU_PER_COLUMN + ((d.d * WU_PER_COLUMN) >> 1)];
  }
  return postAt(b, post);
}

/** The first post on a building's top that no one else up there stands on, for unit i coming up. */
export function freePost(state: SimState, b: Building, i: number): [number, number, number] {
  const e = state.entities;
  const others = menOnTop(state, b.id).filter((j) => j !== i);
  const n = Math.max(1, topPosts(state, b).length);
  for (let k = 0; k < n; k++) {
    const p = topPost(state, b, k);
    if (!others.some((j) => e.x[j] === p[0] && e.z[j] === p[2])) return p;
  }
  return topPost(state, b, others.length);
}

/** Puts everyone on a building's top on its posts, in index order (after it levels up and its posts move); the platform's engine and crew keep their own places. */
export function spreadTop(state: SimState, b: Building): void {
  const e = state.entities;
  menOnTop(state, b.id).forEach((j, n) => {
    [e.x[j], e.y[j], e.z[j]] = topPost(state, b, n);
  });
}
