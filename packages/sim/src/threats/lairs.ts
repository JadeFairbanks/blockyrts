// Lairs (Lairs; Table 15; Table 8 lair cadence): placed at dusk, for each
// player, in a cell next to their claimed land with no player building, at
// least 40 m from claimed land, where the land offers the lair's kind a
// spot (cave mouths at the foot of ridges, nests in caves or dead forest,
// and unlit tunnels the players dug count as caves). A lair stands with its
// guardians awake; attacking it wakes its sleepers. At night its share of
// the wave comes out of its mouth. When it falls its ruin stays, its hoard
// goes to the side that broke it, the warriors near it gain experience, and
// no lair is placed near it for 10 days.

import { claimShapes, dist2, isLit, type ClaimShapes } from '../buildings/lights.ts';
import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { clockOf, Period } from '../clock.ts';
import { costText, Res, type Cost } from '../economy/resources.ts';
import { cos16, floorDiv, isqrt, length2d, sin16, TRIG_ONE, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { LAIR_CLEAR_RADIUS_M, LAIR_CLEAR_XP_TENTHS } from '../rules.ts';
import { hash32 } from '../rng.ts';
import { MONSTERS, sourceDistance2, UnitKind, VISION_STRIDE, type SimState } from '../state.ts';
import { Band, Look } from '../world/layout.ts';
import { gainXp } from '../combat/combat.ts';
import { addMob } from '../combat/mob-ai.ts';
import { isLair, mobSpec } from '../combat/mobs.ts';
import { barrierSpot, cellAt, occupiedCells } from './cells.ts';
import {
  CLEARED_RADIUS_WU, CLEARED_WAIT_STEPS, HOARD_ROLLS, LAIR_CLAIM_GAP_WU, LAIR_GAP_WU, LAIR_UNIT_GAP_WU, lairCap, lairDue, LAIRS, lairSpec, LairSite, RIFT_SEEN_WU, type LairSpec,
} from './data.ts';
import { rollDropList } from './loot.ts';
import { dropLoot } from '../units/loot.ts';
import { Role } from './types.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;
/** Guardians stand 4 m out from the lair's middle, sleepers come out 3 m from it (s). */
const GUARD_POST_WU = 4 * M;
const WAKE_WU = 3 * M;
/** A tunnel counts as unlit with no lit light within 10 m of its mouth (s). */
const TUNNEL_DARK_WU = 10 * M;
/** The one valuable a hoard holds, by band (Table 15). */
const HOARD_VALUABLE: readonly Res[] = [Res.Silver, Res.Gold, Res.Emeralds, Res.Rubies, Res.Diamonds];

/** Every live lair's index. */
export function liveLairs(state: SimState): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.hp[i]! > 0 && isLair(e.mob[i]!)) out.push(i);
  return out;
}

/** The night it is now, for a mob's strength: tonight from dusk on, else last night. */
export function nightNow(state: SimState): number {
  const c = clockOf(state);
  return Math.max(0, c.cycle - (c.period === Period.Night || c.period === Period.Dusk ? 0 : 1));
}

interface Places {
  shapes: ClaimShapes[];
  units: Array<[number, number]>;
  lairs: Array<[number, number]>;
}

function placesNow(state: SimState): Places {
  const e = state.entities;
  const units: Array<[number, number]> = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i]! < state.players.length && e.kind[i] !== UnitKind.Animal) units.push([e.x[i]!, e.z[i]!]);
  const lairs: Array<[number, number]> = liveLairs(state).map((i) => [e.x[i]!, e.z[i]!]);
  return { shapes: state.players.map((_, p) => claimShapes(state, p)), units, lairs };
}

/** Squared distance, wu, from a point to claimed land (0 inside it). */
function claimGap2(s: ClaimShapes, x: number, z: number): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const [cx, cz, r] of s.circles) {
    const out = Math.max(0, isqrt(dist2(x, z, cx, cz)) - r);
    best = Math.min(best, out * out);
  }
  for (const [x0, z0, x1, z1] of s.rects) {
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return best;
}

/** Whether a lair may stand at a spot: far enough from claimed land, the players' units, other lairs and fresh ruins, on standable land. */
function spotFree(state: SimState, places: Places, x: number, z: number): boolean {
  if (!state.nav.standable(floorDiv(x, COL), floorDiv(z, COL), WALKER)) return false;
  for (const s of places.shapes) if (claimGap2(s, x, z) < LAIR_CLAIM_GAP_WU * LAIR_CLAIM_GAP_WU) return false;
  for (const [ux, uz] of places.units) if (dist2(x, z, ux, uz) < LAIR_UNIT_GAP_WU * LAIR_UNIT_GAP_WU) return false;
  for (const [lx, lz] of places.lairs) if (dist2(x, z, lx, lz) < LAIR_GAP_WU * LAIR_GAP_WU) return false;
  for (const r of state.threats.ruins) {
    if (state.step - r.at < CLEARED_WAIT_STEPS && dist2(x, z, r.x, r.z) < CLEARED_RADIUS_WU * CLEARED_RADIUS_WU) return false;
  }
  return true;
}

/** Unlit tunnels the players dug, as cave sites (Keeping digging fair): no lit light near the mouth. */
function darkTunnels(state: SimState): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const t of state.threats.tunnels) {
    let lit = false;
    for (const b of state.buildings.list) {
      if (!buildingSpec(b.kind).light || !isLit(b)) continue;
      const [bx, bz] = buildingCentre(b);
      if (dist2(bx, bz, t.x, t.z) <= TUNNEL_DARK_WU * TUNNEL_DARK_WU) {
        lit = true;
        break;
      }
    }
    if (!lit) out.push([t.x, t.z]);
  }
  return out;
}

/** Spots in a cell where a lair of a kind could stand, best first. */
function spotsFor(state: SimState, spec: LairSpec, cellId: number, night: number, tunnels: Array<[number, number]>): Array<[number, number]> {
  const layout = state.world.layout;
  const cell = layout.cell(cellId);
  const out: Array<[number, number]> = [];
  const inCell = (x: number, z: number): boolean => cellAt(state, x, z) === cellId;
  if (spec.site !== LairSite.Any) {
    // Caves first: a cave mouth or a dark tunnel in this cell; then, for cave mouths, the foot of a ridge or cliff; nests also take dead forest.
    const cave = barrierSpot(layout, cellId, true);
    if (cave) out.push(cave);
    for (const t of tunnels) if (inCell(t[0], t[1])) out.push(t);
    if (spec.site === LairSite.Barrier) {
      const foot = barrierSpot(layout, cellId, false);
      if (foot) out.push(foot);
      return out;
    }
    if (cell.look !== Look.DeadLand) return out;
  }
  // Anywhere in the cell: tries spread round its middle, from the seed (ruins are kept as sites and come first).
  for (const r of state.threats.ruins) if (inCell(r.x, r.z)) out.push([r.x, r.z]);
  const spread = Math.max(20, floorDiv(cell.size * 2, 5));
  for (let t = 0; t < 8; t++) {
    const h = hash32(state.seed ^ 0x6c616972, cellId, night, t);
    const x = cell.x + ((h & 0xffff) % (spread * 2 + 1)) - spread;
    const z = cell.z + (((h >>> 16) & 0xffff) % (spread * 2 + 1)) - spread;
    out.push([x * COL + (COL >> 1), z * COL + (COL >> 1)]);
  }
  return out;
}

/** A lair kind for a cell on a night: among those unlocked for the cell's band, weighted to the newest (3 for those of the last 10 nights). */
function pickKind(state: SimState, night: number, band: Band, skip: Set<number>): LairSpec | undefined {
  const open = LAIRS.filter((l) => l.firstNight <= night && l.minBand <= band && !skip.has(l.mob));
  if (open.length === 0) return undefined;
  let total = 0;
  for (const l of open) total += l.firstNight > night - 10 ? 3 : 1;
  let r = state.rng.spawns.nextInt(total);
  for (const l of open) {
    const w = l.firstNight > night - 10 ? 3 : 1;
    if (r < w) return l;
    r -= w;
  }
  return open[0];
}

/**
 * At dusk (Table 8 lair cadence): each player still in gets a new lair on
 * its nights while under the cap, in a cell next to their claimed cells
 * that holds no player building (or one farther out when there is none).
 */
export function placeLairs(state: SimState, night: number): void {
  if (!lairDue(night)) return;
  const e = state.entities;
  const layout = state.world.layout;
  const occupied = occupiedCells(state);
  const tunnels = darkTunnels(state);
  for (let p = 0; p < state.players.length; p++) {
    if (state.players[p]!.out) continue;
    const live = liveLairs(state).filter((i) => e.foe[i] === p).length;
    if (live >= lairCap(night)) continue;
    const mine = [...occupied].filter(([, bits]) => bits & (1 << p)).map(([c]) => c).sort((a, b) => a - b);
    if (mine.length === 0) continue;
    const ring = (from: number[]): number[] => {
      const set = new Set<number>();
      for (const c of from) for (const n of layout.neighboursOf(c)) if (!occupied.has(n)) set.add(n);
      return [...set].sort((a, b) => a - b);
    };
    let cells = ring(mine);
    if (cells.length === 0) cells = ring([...occupied.keys()].flatMap((c) => layout.neighboursOf(c)));
    const places = placesNow(state);
    let placed = false;
    for (let tries = 0; tries < 8 && cells.length > 0 && !placed; tries++) {
      const k = state.rng.spawns.nextInt(cells.length);
      const cellId = cells[k]!;
      cells.splice(k, 1);
      const band = layout.cell(cellId).band;
      const skip = new Set<number>();
      for (let kinds = 0; kinds < LAIRS.length && !placed; kinds++) {
        const spec = pickKind(state, night, band, skip);
        if (!spec) break;
        skip.add(spec.mob);
        for (const [x, z] of spotsFor(state, spec, cellId, night, tunnels)) {
          if (!spotFree(state, places, x, z)) continue;
          addLair(state, spec, p, x, z, night);
          placed = true;
          break;
        }
      }
    }
  }
}

/** Puts a lair in the world for a player, with its guardians at their posts; returns its index. */
export function addLair(state: SimState, spec: LairSpec, player: number, x: number, z: number, night: number): number {
  const e = state.entities;
  const l = addMob(state, spec.mob, player, x, z, night);
  const id = e.id[l]!;
  e.act[l] = 0;
  spec.guardians.forEach((m, k) => {
    const a = floorDiv(k * 65536, Math.max(1, spec.guardians.length)) + 8192;
    const [gx, gz] = around(x, z, a, GUARD_POST_WU);
    addResident(state, m, player, gx, gz, night, id, x, z);
  });
  return id;
}

function around(x: number, z: number, angle: number, r: number): [number, number] {
  return [x + floorDiv(r * cos16(angle), TRIG_ONE), z + floorDiv(r * sin16(angle), TRIG_ONE)];
}

function addResident(state: SimState, mob: number, player: number, x: number, z: number, night: number, lair: number, lx: number, lz: number): number {
  const e = state.entities;
  const i = addMob(state, mob, player, x, z, night);
  e.role[i] = Role.Resident;
  e.group[i] = lair;
  e.homeX[i] = lx;
  e.homeZ[i] = lz;
  return i;
}

/** A lair attacked for the first time wakes its sleepers, who go for whoever woke them (Table 15). */
export function wakeLair(state: SimState, l: number, by: number): void {
  const e = state.entities;
  if (e.act[l] !== 0 || e.hp[l]! <= 0) return;
  e.act[l] = 1;
  const spec = lairSpec(e.mob[l]!);
  if (!spec) return;
  const night = nightNow(state);
  const list = spec.sleepers(night);
  list.forEach((m, k) => {
    const [x, z] = around(e.x[l]!, e.z[l]!, k * 8192, WAKE_WU);
    const i = addResident(state, m, e.foe[l]!, x, z, night, e.id[l]!, e.x[l]!, e.z[l]!);
    e.target[i] = by;
  });
  state.events.push({ player: e.foe[l]!, kind: 'alert', text: `The ${mobSpec(e.mob[l]!).name.toLowerCase()} is stirring: its sleepers are awake.`, x: e.x[l]!, z: e.z[l]! });
}

/**
 * A lair fell: its ruin stays, its hoard goes to the side that broke it (as
 * loot where the lair stood, for its units to carry home: Jade's play-test
 * notes), and every warrior within 20 m gains 20 XP.
 */
export function clearLair(state: SimState, l: number, taker: number, killer = -1): void {
  const e = state.entities;
  const spec = lairSpec(e.mob[l]!);
  const x = e.x[l]!;
  const z = e.z[l]!;
  state.threats.ruins.push({ mob: e.mob[l]!, x, z, at: state.step });
  if (!spec) return;
  if (taker >= 0 && taker < state.players.length) {
    const got = new Map<number, number>();
    const night = nightNow(state);
    const kinds = spec.sleepers(night).length > 0 ? spec.sleepers(night) : spec.guardians;
    for (let k = 0; k < HOARD_ROLLS && kinds.length > 0; k++) rollDropList(state, mobSpec(kinds[k % kinds.length]!).drops, got);
    const band = state.world.layout.cell(cellAt(state, x, z)).band;
    const gem = HOARD_VALUABLE[band]!;
    got.set(gem, (got.get(gem) ?? 0) + 1);
    state.events.push({ player: taker, kind: 'alert', text: `The ${mobSpec(e.mob[l]!).name.toLowerCase()} is cleared. Its hoard: ${hoardText(got)}.`, x, z });
    // A hoard is always worth remarking on.
    dropLoot(state, x, z, [...got].sort((a, b) => a[0] - b[0]), { killer, owner: taker, brag: 1, src: e.mob[l]! + 1 });
  }
  const r = LAIR_CLEAR_RADIUS_M * M;
  for (const j of state.grid.near(x, z, r)) {
    if (e.kind[j] !== UnitKind.Warrior || e.hp[j]! <= 0 || length2d(e.x[j]! - x, e.z[j]! - z) > r) continue;
    gainXp(state, j, LAIR_CLEAR_XP_TENTHS);
  }
}

function hoardText(got: Map<number, number>): string {
  return costText([...got].sort((a, b) => a[0] - b[0]) as Cost);
}

/** The lairs of a player standing tonight, for the night's share. */
export function lairsOf(state: SimState, player: number): number[] {
  return liveLairs(state).filter((i) => state.entities.foe[i] === player);
}

/** What comes out of a lair at night: its kinds unlocked tonight, else (rifts) any night mob unlocked tonight. */
export function lairSpawns(mob: number): readonly number[] {
  return lairSpec(mob)?.spawns ?? [];
}

/**
 * Which players have seen each lair, hut and village (bits in `picked`):
 * once it is within the sight of any of their units or buildings, or within
 * 120 m of one at night for a glowing rift (Table 15: minimap marks). The
 * players share what they see, so the HUD shows a mark any of them has.
 */
export function updateSeen(state: SimState, sources: Int32Array): void {
  if (sources.length === 0) return;
  const e = state.entities;
  const dark = clockOf(state).period === Period.Night;
  const all = (1 << state.players.length) - 1;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.owner[i] !== MONSTERS || e.hp[i]! <= 0) continue;
    const spec = mobSpec(e.mob[i]!);
    if (spec.role !== Role.Structure || (e.picked[i]! & all) === all) continue;
    const glow = dark && lairSpec(e.mob[i]!)?.glows === true;
    for (let o = 0; o < sources.length; o += VISION_STRIDE) {
      const bit = 1 << sources[o]!;
      if (e.picked[i]! & bit) continue;
      const r = Math.max(sources[o + 5]!, glow ? RIFT_SEEN_WU : 0) + spec.halfWidth;
      if (sourceDistance2(sources, o, e.x[i]!, e.z[i]!) <= r * r) e.picked[i] = e.picked[i]! | bit;
    }
  }
  for (const v of state.threats.villages) {
    if ((v.seen & all) === all) continue;
    for (let o = 0; o < sources.length; o += VISION_STRIDE) {
      const bit = 1 << sources[o]!;
      const r = sources[o + 5]! + 12 * M;
      if ((v.seen & bit) === 0 && sourceDistance2(sources, o, v.x, v.z) <= r * r) v.seen |= bit;
    }
  }
}
