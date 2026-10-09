// The stone circles' living things through the days: the Moon Roses open on
// a Bright Night and shut at daybreak (SCA-8), an Ancient Seed's sapling grows
// into a Sweet Hawthorne (SC-8), and farms and animals near a Sweet Hawthorne
// do better (SC-9: hawthorneNear, for the farms' and the breeding's own code).

import { COLUMNS_PER_CHUNK, length2d, WU_PER_COLUMN } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { fairyHooks, HAWTHORNE_M } from '../buildings/farm-boost.ts';
import type { SimState } from '../state.ts';
import { CHUNK_SHIFT, chunkKey, NO_WATER } from '../world/chunk.ts';
import { Mat } from '../world/materials.ts';
import { PropKind, PROPS } from '../world/props.ts';
import { brightAt } from './bright.ts';
import { CircleProp, CircleType, DRESSING, HAWTHORNE_FRUIT, circleMetres as m, ROSES_PER_BUSH } from './data.ts';
import { circlePieces, circleSites, pieceSlot } from './place.ts';

const COL = WU_PER_COLUMN;
const N = COLUMNS_PER_CHUNK;
/** Farthest out any circle's Sweet Hawthornes stand, wu. */
const HAWTHORNE_REACH = m(Math.max(...DRESSING.flat().filter((r) => r.prop === CircleProp.Hawthorne).map((r) => r.maxM)) + 1);

// ----- the Moon Roses (SCA-8) -----

/** As night falls: the Moon Roses open wherever the night is bright, ROSES_PER_BUSH on each bush. */
export function openRoses(state: SimState, night: number): void {
  const layout = state.world.layout;
  for (const s of circleSites(layout)) {
    if (s.type !== CircleType.Lunar || !brightAt(state, s.x, s.z, night)) continue;
    for (const p of circlePieces(layout, s.id)) {
      if (p.prop !== CircleProp.MoonRose) continue;
      const at = pieceSlot(layout, p);
      state.world.restock(at.cx, at.cz, at.index, ROSES_PER_BUSH);
    }
  }
}

/** At daybreak every open Moon Rose shuts, picked or not. */
export function shutRoses(state: SimState): void {
  const layout = state.world.layout;
  for (const s of circleSites(layout)) {
    if (s.type !== CircleType.Lunar) continue;
    for (const p of circlePieces(layout, s.id)) {
      if (p.prop !== CircleProp.MoonRose) continue;
      const at = pieceSlot(layout, p);
      if (state.world.propChanges.get(chunkKey(at.cx, at.cz))?.has(at.index)) state.world.restock(at.cx, at.cz, at.index, 0);
    }
  }
}

// ----- the Sweet Hawthorne (SC-8, SC-9) -----

/** A prop of a kind standing on a column now: its chunk and index, or null. */
export function propOn(state: SimState, gx: number, gz: number, kind: number): { cx: number; cz: number; index: number; amount: number } | null {
  const cx = gx >> CHUNK_SHIFT;
  const cz = gz >> CHUNK_SHIFT;
  for (const v of state.world.props(cx, cz, state.step)) {
    if (v.kind === kind && cx * N + v.lx === gx && cz * N + v.lz === gz) return { cx, cz, index: v.index, amount: v.amount };
  }
  return null;
}

/** Why an Ancient Seed cannot be planted on a column ('' when it can): SC-8, "in grass or dirt". */
export function plantSpotProblem(state: SimState, gx: number, gz: number): string {
  const w = state.world;
  const cx = gx >> CHUNK_SHIFT;
  const cz = gz >> CHUNK_SHIFT;
  const c = w.columns(cx, cz);
  const i = (gz - cz * N) * N + (gx - cx * N);
  const mat = c.topMaterial(i);
  if (c.water[i] !== NO_WATER) return 'An Ancient Seed cannot be planted in water.';
  if (mat !== Mat.Grass && mat !== Mat.DryGrass && mat !== Mat.Soil) return 'An Ancient Seed is planted in grass or dirt.';
  if (w.builtOn?.(gx, gz)) return 'Something is built there.';
  for (const v of w.props(cx, cz, state.step)) if (cx * N + v.lx === gx && cz * N + v.lz === gz) return 'Something already grows there.';
  return '';
}

/** Plants a Sweet Hawthorne sapling on a column (the seed already paid for). */
export function plantHawthorne(state: SimState, gx: number, gz: number): void {
  state.world.addProp(gx, gz, PropKind.HawthorneSapling, hash32(state.seed, 0x68617774, gx, gz), 0, state.step);
  state.circles.planted.push(gx, gz, state.step);
}

/** Each period: a sapling planted SC-8's four to six nights ago (s: 5) becomes a Sweet Hawthorne, its first fruit on it. */
export function growPlanted(state: SimState): void {
  const list = state.circles.planted;
  const grow = PROPS[PropKind.HawthorneSapling]!.regrowSteps;
  for (let k = 0; k < list.length; k += 3) {
    const at = list[k + 2]!;
    if (at < 0 || state.step - at < grow) continue;
    const gx = list[k]!;
    const gz = list[k + 1]!;
    const sapling = propOn(state, gx, gz, PropKind.HawthorneSapling);
    if (!sapling) {
      // Pulled up or built over before it grew.
      list.splice(k, 3);
      k -= 3;
      continue;
    }
    state.world.removeProp(sapling.cx, sapling.cz, sapling.index);
    state.world.addProp(gx, gz, PropKind.SweetHawthorne, hash32(state.seed, 0x68617774, gx, gz, 1), HAWTHORNE_FRUIT, state.step);
    list[k + 2] = -1;
  }
}

/** Whether one of the circles' own Sweet Hawthornes stands on a column (not cut down). */
function circleHawthorne(state: SimState, gx: number, gz: number): boolean {
  const layout = state.world.layout;
  const x = gx * COL + (COL >> 1);
  const z = gz * COL + (COL >> 1);
  for (const s of circleSites(layout)) {
    if (length2d(s.x - x, s.z - z) > HAWTHORNE_REACH) continue;
    if (circlePieces(layout, s.id).some((p) => p.prop === CircleProp.Hawthorne && p.gx === gx && p.gz === gz)) return true;
  }
  return false;
}

/** A Sweet Hawthorne on a column was cut down: it stops counting for the farms and animals round it. */
export function hawthorneFelled(state: SimState, gx: number, gz: number): void {
  const c = state.circles;
  if (circleHawthorne(state, gx, gz)) {
    c.felled.push(gx, gz);
    return;
  }
  for (let k = 0; k < c.planted.length; k += 3) {
    if (c.planted[k] === gx && c.planted[k + 1] === gz) {
      c.planted.splice(k, 3);
      return;
    }
  }
}

function felled(state: SimState, gx: number, gz: number): boolean {
  const f = state.circles.felled;
  for (let k = 0; k < f.length; k += 2) if (f[k] === gx && f[k + 1] === gz) return true;
  return false;
}

/**
 * Whether a grown Sweet Hawthorne stands within HAWTHORNE_M of a point
 * (wu): "Farms within 30 m of the sweet hawthorne get a 35% boost to food
 * production ... Animals within 30 m of the sweet hawthorne reproduce 35%
 * more rapidly" (SC-9). The circles' own trees and the ones grown from seed.
 */
export function hawthorneNear(state: SimState, x: number, z: number): boolean {
  const r = m(HAWTHORNE_M);
  const layout = state.world.layout;
  for (const s of circleSites(layout)) {
    if (s.type === CircleType.Generic || s.type === CircleType.Boneyard || length2d(s.x - x, s.z - z) > r + HAWTHORNE_REACH) continue;
    for (const p of circlePieces(layout, s.id)) {
      if (p.prop !== CircleProp.Hawthorne || length2d(p.gx * COL + (COL >> 1) - x, p.gz * COL + (COL >> 1) - z) > r) continue;
      if (!felled(state, p.gx, p.gz)) return true;
    }
  }
  const pl = state.circles.planted;
  for (let k = 0; k < pl.length; k += 3) {
    if (pl[k + 2] === -1 && length2d(pl[k]! * COL + (COL >> 1) - x, pl[k + 1]! * COL + (COL >> 1) - z) <= r) return true;
  }
  return false;
}

// The farms' harvest and the animals' breeding ask it (buildings/farm-boost.ts, animals/animals.ts).
fairyHooks.hawthorneNear = hawthorneNear;
