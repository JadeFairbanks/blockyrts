// Digging (Digging; Table 10; Keeping digging fair). A dig marks a box of columns and a floor; workers
// take bites off the top of the columns, one terrain unit at a time, each
// bite's time in proportion to its volume at the tool tier's rate for the
// material, varying a quarter either way. Every bite gives one of what it
// carved (Earth from soil), which the worker carries like a gatherer's load:
// a full load goes to the nearest drop-off and the worker comes back to the
// dig (Patch 4; before it, every bite went straight to the pool). Patch 5
// took out the earthworks (banks, fill and ramps heaped from the pool). A
// tunnel chain's stretch is a line of columns instead of a box.

import { stretchBetween, stretchCells, stretchEnd, TUNNEL_WIDTH_COLUMNS } from '../buildings/chains.ts';
import { Res } from '../economy/resources.ts';
import { floorDiv, headingTowards, length2d, WU_PER_COLUMN } from '../fixed.ts';
import { NO_CARRY, OrderKind, SiteKind, tunnelSite, UnitKind, type Loot, type SimState, type Site } from '../state.ts';
import { DigClass, Mat, MATERIALS } from '../world/materials.ts';
import { Tool, ToolJob } from '../world/props.ts';
import { digFloor } from '../world/world.ts';
import { Act, ARRIVED, columnCentre, FAILED, MOVING, resetWalk, toDropoff, walkTo } from './behaviour.ts';
import { bagRoom } from './loot.ts';
import { Work, workXp } from './ranks.ts';
import { toolTier } from './tools.ts';
import type { UnitOrder } from './unit-orders.ts';
import { carryCapacity } from './weight.ts';

/** Table 10: dig rates in thousandths of a cubic metre per worker-minute, by the tier of the worker's digging tool (Tool order) and dig class; no flint tool digs. */
const RATES: Record<number, readonly number[]> = {
  [DigClass.Soil]: [0, 500, 580, 0, 600, 700, 800, 900, 1000, 1100],
  [DigClass.Loose]: [0, 400, 460, 0, 500, 550, 650, 700, 800, 900],
  [DigClass.Rock]: [0, 0, 5, 0, 10, 30, 65, 90, 117, 130],
};
/** One bite: a column 11.25 cm deep, 0.0228 m3, as millionths of a cubic metre (Table 10 (s)). */
const BITE_MICRO_M3 = 22781;
/** A worker reaches columns up to 4 away (1.8 m) from where it stands (s). */
const REACH_COLUMNS = 4;
/** A tunnel's worker stands within 9 units (1 m) above or below its floor (s). */
const TUNNEL_REACH_UNITS = 9;
/** A box is at most 64 columns (29 m) a side, so one order stays a sensible size. */
export const SITE_MAX_COLUMNS = 64;

/** The rate a tool tier carves a material at, thousandths of a cubic metre a minute; 0 when it cannot (marble needs bronze). */
export function digRate(tool: number, mat: number): number {
  const info = MATERIALS[mat];
  if (!info || info.dig === DigClass.None) return 0;
  if (mat === Mat.Marble && tool < Tool.Bronze) return 0;
  return RATES[info.dig]![tool] ?? 0;
}

/** Steps a bite takes at a rate, with the bite's own size (750 to 1250 per mille). */
export function biteSteps(rate: number, sizePm: number): number {
  return Math.max(1, floorDiv(BITE_MICRO_M3 * 1200 * sizePm, rate * 1000 * 1000));
}

/** The resource carving a material gives. */
function yieldOf(mat: number): number {
  switch (mat) {
    case Mat.Sand:
      return Res.Sand;
    case Mat.Clay:
      return Res.Clay;
    case Mat.Stone:
    case Mat.Basalt:
      return Res.Stone;
    case Mat.Marble:
      return Res.Marble;
    case Mat.CopperOre:
      return Res.CopperOre;
    case Mat.TinOre:
      return Res.TinOre;
    case Mat.IronRock:
      return Res.IronRock;
    case Mat.VeinIron:
      return Res.VeinIron;
    case Mat.Coal:
      return Res.Coal;
    default:
      return Res.Earth;
  }
}

/** The material and its bottom of the solid unit a dig takes next from a column, or null when it is done. */
function nextBite(state: SimState, s: Site, x: number, z: number): { mat: number; y: number } | null {
  const w = state.world;
  const layers = w.columnAt(x, z);
  const limit = digFloor(w.naturalTop(x, z));
  if (s.kind === SiteKind.Dig) {
    const top = layers[layers.length - 2]!;
    if (top <= s.level || top - 1 < limit) return null;
    return { mat: layers[layers.length - 1]!, y: top - 1 };
  }
  // A tunnel: the highest solid unit between its floor and roof.
  for (let k = layers.length - 3; k >= 0; k -= 3) {
    const y0 = layers[k]!;
    const y1 = layers[k + 1]!;
    const lo = Math.max(y0, s.level, limit);
    const hi = Math.min(y1, s.level2);
    if (hi > lo) return { mat: layers[k + 2]!, y: hi - 1 };
  }
  return null;
}

/** What the next bite off a column of a dig or tunnel gives, or -1 when the column is done. */
function yieldAt(state: SimState, s: Site, x: number, z: number): number {
  const bite = nextBite(state, s, x, z);
  return bite ? yieldOf(bite.mat) : -1;
}

/** Whether a column of a site still needs work, and can take it now (no unit or building on it). */
function needsWork(state: SimState, s: Site, x: number, z: number): boolean {
  if (state.buildings.footprintAt(x, z) !== 0) return false;
  return nextBite(state, s, x, z) !== null;
}

function occupied(state: SimState, x: number, z: number, except: number): boolean {
  const e = state.entities;
  for (let j = 0; j < e.count; j++) {
    if (j === except || e.inside[j] !== 0) continue;
    if (floorDiv(e.x[j]!, WU_PER_COLUMN) === x && floorDiv(e.z[j]!, WU_PER_COLUMN) === z) return true;
  }
  return false;
}

/** The columns of a site: its box, or a tunnel stretch's line from its anchor. */
export function siteCells(s: Site): Array<[number, number]> {
  if (s.kind === SiteKind.TunnelLine) {
    const { dir, length } = stretchBetween(s.x0, s.z0, s.x1, s.z1);
    return stretchCells(s.x0, s.z0, dir, length, s.axis);
  }
  const out: Array<[number, number]> = [];
  for (let z = s.z0; z <= s.z1; z++) for (let x = s.x0; x <= s.x1; x++) out.push([x, z]);
  return out;
}

/** Columns other diggers on the same site are working now. */
function taken(state: SimState, site: number, except: number): Set<number> {
  const e = state.entities;
  const out = new Set<number>();
  for (let j = 0; j < e.count; j++) {
    if (j === except || e.act[j] !== Act.Work) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'dig' && o.site === site) out.add(e.climbZ[j]! * 0x100000 + e.climbX[j]!);
  }
  return out;
}

/**
 * The column of a site a worker should take next: the nearest that needs
 * work and is free. A worker back from a drop-off
 * takes up the column it left if it can, as a gatherer goes back to its
 * node; one carrying a load (`want`, or -1) takes the nearest whose next
 * bite gives more of the same, if there is one, so a load fills with one
 * kind as a gatherer's does (s).
 */
function pickColumn(state: SimState, s: Site, i: number, want: number): [number, number] | null {
  const e = state.entities;
  const ux = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const uz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const busy = taken(state, s.id, i);
  const back = want < 0;
  let best: [number, number] | null = null;
  let bestD = 0;
  let bestMatch = false;
  for (const [x, z] of siteCells(s)) {
    if (busy.has(z * 0x100000 + x)) continue;
    if (back && x === e.climbX[i] && z === e.climbZ[i] && needsWork(state, s, x, z)) return [x, z];
    const d = (x - ux) * (x - ux) + (z - uz) * (z - uz);
    if (best && d >= bestD && (bestMatch || want < 0)) continue;
    if (!needsWork(state, s, x, z)) continue;
    const match = want >= 0 && yieldAt(state, s, x, z) === want;
    if (best && (match ? bestMatch && d >= bestD : bestMatch || d >= bestD)) continue;
    best = [x, z];
    bestD = d;
    bestMatch = match;
  }
  return best;
}

export function siteOf(state: SimState, id: number): Site | undefined {
  return state.sites.find((s) => s.id === id);
}

/** Ends a site once nothing in it needs work. */
function finishIfDone(state: SimState, s: Site): boolean {
  const cells = siteCells(s);
  for (const [x, z] of cells) if (needsWork(state, s, x, z)) return false;
  state.sites = state.sites.filter((t) => t.id !== s.id);
  const [x, z] = [columnCentre((s.x0 + s.x1) >> 1), columnCentre((s.z0 + s.z1) >> 1)];
  const what = tunnelSite(s.kind) ? 'The tunnel' : 'The dig';
  state.events.push({ player: s.owner, kind: 'info', text: `${what} is finished.`, x, z });
  // Its diggers take what they still carry to a drop-off before they stop.
  const e = state.entities;
  for (let j = 0; j < e.count; j++) {
    const o = e.queue[j]![0];
    if (o?.t === 'dig' && o.site === s.id && e.act[j] !== Act.ToDrop) leaveDig(state, j);
  }
  // A finished tunnel is a cave while it stays unlit (Keeping digging fair: cave-type lairs can appear in it);
  // a chain's stretch only where it runs under ground, not where it cut through open land.
  if (s.kind === SiteKind.Tunnel || (s.kind === SiteKind.TunnelLine && cells.some(([cx, cz]) => state.world.topAt(cx, cz) >= s.level2))) state.threats.tunnels.push({ x, z });
  return true;
}

/** Sends a digger off with its load: to the nearest drop-off, then back to the dig (or done, if the dig has finished meanwhile). */
function homeWithLoad(state: SimState, i: number): boolean {
  const e = state.entities;
  e.act[i] = Act.ToDrop;
  resetWalk(state, i);
  return false;
}

/** Whether a digger's dig order goes on after it leaves a column: on its way to a drop-off. */
function stillGoing(state: SimState, i: number, o: UnitOrder): boolean {
  return state.entities.act[i] === Act.ToDrop || state.entities.queue[i]![0] !== o;
}

/** A digger back from a drop-off picks up what of its side's lies on the ground at the dig first (a fallen worker's load), if it has room. */
function fetchSpoil(state: SimState, s: Site, i: number): boolean {
  const e = state.entities;
  let best: Loot | null = null;
  let bestD = 0;
  for (const l of state.loot) {
    if (l.owner !== e.owner[i] || l.src !== 0 || l.amt <= 0 || bagRoom(state, i, l.res) === 0) continue;
    const x = floorDiv(l.x, WU_PER_COLUMN);
    const z = floorDiv(l.z, WU_PER_COLUMN);
    if (x < s.x0 - 1 || x > s.x1 + 1 || z < s.z0 - 1 || z > s.z1 + 1) continue;
    const d = length2d(l.x - e.x[i]!, l.z - e.z[i]!);
    if (best && d >= bestD) continue;
    best = l;
    bestD = d;
  }
  if (!best) return false;
  e.queue[i]!.unshift({ t: 'loot', id: best.id, hand: 0, back: 0, x: 0, z: 0 });
  e.act[i] = Act.Start;
  resetWalk(state, i);
  return true;
}

/**
 * A digger leaving a dig (finished, or with nothing left it can take or
 * reach): its load goes to a drop-off first, as a gatherer's last load goes
 * home. Whether its dig order is over now (false: it is on its way). [Patch
 * 4's crude stairs out of the pit went with Patch 5 (GP-17): a worker climbs
 * out, units/moves.ts.]
 */
function leaveDig(state: SimState, i: number): boolean {
  if (state.entities.carryAmt[i]! > 0) return homeWithLoad(state, i);
  return true;
}

/**
 * One step of a worker on a dig or tunnel. A digger carries what
 * it carves as a gatherer carries its load (Patch 4, Jade: "they should
 * still be required to, and then return to their task just like with
 * gathering"): 25 lb of it, or a cart's or pack's load, then to the nearest
 * main base or Storehouse and back to the dig, and the last load home when
 * the dig is finished.
 */
export function runDig(state: SimState, i: number, o: Extract<UnitOrder, { t: 'dig' }>): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker) return true;
  const s = siteOf(state, o.site);
  if (e.act[i] === Act.ToDrop) {
    // To the drop-off, and back.
    const r = e.carryAmt[i]! > 0 ? toDropoff(state, i, null) : ARRIVED;
    if (r === MOVING) return false;
    if (r === FAILED || !s) return true;
    e.act[i] = Act.Start;
    resetWalk(state, i);
    // Back at the dig, what it left on the ground there comes first.
    if (fetchSpoil(state, s, i)) return false;
  }
  // The dig is gone (finished, or called off) with something still in hand: home with it.
  if (!s || s.owner !== e.owner[i]) return e.carryAmt[i]! > 0 ? homeWithLoad(state, i) : true;
  // What it carries off the dig, or -1.
  const load = e.carryAmt[i]! > 0 && e.carryRes[i] !== NO_CARRY ? e.carryRes[i]! : -1;
  if (e.act[i] === Act.Start || (e.act[i] === Act.Work && !needsWork(state, s, e.climbX[i]!, e.climbZ[i]!))) {
    // It came with a full load: to the drop-off first.
    if (load >= 0 && e.carryAmt[i]! >= carryCapacity(state, i, load)) return homeWithLoad(state, i);
    const c = pickColumn(state, s, i, load);
    if (!c) {
      if (finishIfDone(state, s)) return !stillGoing(state, i, o);
      // No column free for it now: its last load goes home first.
      return leaveDig(state, i);
    }
    // Carrying what no column left gives (another layer, or a load from before the dig): home with it first, then back (s).
    if (load >= 0 && yieldAt(state, s, c[0], c[1]) !== load) return homeWithLoad(state, i);
    e.climbX[i] = c[0];
    e.climbZ[i] = c[1];
    e.act[i] = Act.Walk;
    e.timer[i] = 0;
    resetWalk(state, i);
  }
  const cx = e.climbX[i]!;
  const cz = e.climbZ[i]!;
  if (e.act[i] === Act.Walk) {
    // In a tunnel the worker stands near its floor, in the passage or at the face, not on the hill above it.
    const goal = tunnelSite(s.kind) ? { x0: cx, z0: cz, x1: cx, z1: cz, min: 1, max: REACH_COLUMNS, ylo: s.level - TUNNEL_REACH_UNITS, yhi: s.level + TUNNEL_REACH_UNITS } : { x0: cx, z0: cz, x1: cx, z1: cz, min: 1, max: REACH_COLUMNS };
    const r = walkTo(state, i, goal);
    if (r === 0) return false;
    if (r === 2) {
      // That column cannot be reached from here: try another next step.
      e.act[i] = Act.Start;
      if ((e.stuck[i] = e.stuck[i]! + 1) > 6) {
        state.events.push({ player: s.owner, kind: 'alert', text: 'A worker cannot reach the dig.', x: e.x[i]!, z: e.z[i]! });
        return leaveDig(state, i);
      }
      return false;
    }
    e.act[i] = Act.Work;
    e.timer[i] = 0;
    e.waitUntil[i] = 0;
  }
  // Working: face the column and swing.
  const tx = columnCentre(cx);
  const tz = columnCentre(cz);
  if (length2d(tx - e.x[i]!, tz - e.z[i]!) > 0) e.heading[i] = headingTowards(tx - e.x[i]!, tz - e.z[i]!);
  e.order[i] = OrderKind.Dig;
  if (occupied(state, cx, cz, i)) return false;
  if (e.waitUntil[i] === 0) {
    // A new bite: how long it takes (Table 10, the bite's size from the 'ai' stream).
    const bite = nextBite(state, s, cx, cz);
    // Done, or a layer of something other than its load: another column, or home with the load (s).
    if (!bite || (load >= 0 && yieldOf(bite.mat) !== load)) {
      e.act[i] = Act.Start;
      return false;
    }
    const rate = digRate(toolTier(e, i, ToolJob.Break), bite.mat);
    if (rate === 0) {
      const what = bite.mat === Mat.Marble ? 'Marble needs a bronze pickaxe or better.' : MATERIALS[bite.mat]!.dig === DigClass.Rock ? 'Rock needs a stone maul or better.' : 'Digging needs a digging stick, a stone maul or a pickaxe.';
      state.events.push({ player: s.owner, kind: 'alert', text: `These tools cannot dig ${MATERIALS[bite.mat]!.name}. ${what}`, x: tx, z: tz });
      return true;
    }
    e.waitUntil[i] = biteSteps(rate, 750 + state.rng.ai.nextInt(501));
  }
  e.timer[i] = e.timer[i]! + 1;
  // Digging counts as building work for a worker's rank (Patch 3).
  workXp(state, i, Work.Build);
  if (e.timer[i]! < e.waitUntil[i]!) return false;
  e.timer[i] = 0;
  e.waitUntil[i] = 0;
  const bite = nextBite(state, s, cx, cz);
  if (bite) {
    const res = yieldOf(bite.mat);
    // Something else turned up under its load since the bite began: another column, or home with the load.
    if (e.carryAmt[i]! > 0 && e.carryRes[i] !== res) {
      e.act[i] = Act.Start;
      return false;
    }
    state.world.editBox(cx, cz, cx, cz, bite.y, bite.y + 1, Mat.Air);
    e.carryAmt[i] = e.carryAmt[i]! + 1;
    e.carryRes[i] = res;
    state.hits.push({ look: bite.mat >= Mat.Stone && bite.mat !== Mat.Ash && bite.mat !== Mat.DeadEarth ? 'stone' : 'shake', x: tx, y: bite.y * 900, z: tz, id: e.id[i]! });
  }
  if (!needsWork(state, s, cx, cz)) {
    e.act[i] = Act.Start;
    if (finishIfDone(state, s)) return !stillGoing(state, i, o);
  }
  // A full load (25 lb, or a cart's or pack's) goes to the nearest drop-off, and the worker comes back.
  if (e.carryAmt[i]! > 0 && e.carryAmt[i]! >= carryCapacity(state, i, e.carryRes[i]!)) return homeWithLoad(state, i);
  return false;
}

/** Places a site for a player: returns it, or a reason it cannot be marked. */
export function markSite(state: SimState, owner: number, kind: number, x0: number, z0: number, x1: number, z1: number, level: number, level2: number, axis: number): Site | string {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  if (xb - xa >= SITE_MAX_COLUMNS || zb - za >= SITE_MAX_COLUMNS) return 'That area is too big to mark at once.';
  for (let z = za; z <= zb; z += 4) for (let x = xa; x <= xb; x += 4) if (!state.world.isExplored(x >> 2, z >> 2)) return 'You can only dig where you have explored.';
  return addSite(state, { owner, kind, x0: xa, z0: za, x1: xb, z1: zb, level, level2, axis });
}

/** Adds a site, or gives back the player's identical one already marked (more workers right-clicked onto it). */
function addSite(state: SimState, want: Omit<Site, 'id'>): Site {
  const same = state.sites.find((t) => t.owner === want.owner && t.kind === want.kind && t.x0 === want.x0 && t.z0 === want.z0 && t.x1 === want.x1 && t.z1 === want.z1 && t.level === want.level && t.level2 === want.level2 && t.axis === want.axis);
  if (same) return same;
  const s: Site = { id: state.nextEntityId++, ...want };
  state.sites.push(s);
  return s;
}

/**
 * Marks one stretch of a tunnel chain (Digging: tunnel chains): level from
 * (x, z), `length` columns in direction `dir`, between a floor and a roof,
 * TUNNEL_WIDTH_COLUMNS wide. Returns it, or a reason it cannot be marked.
 */
export function markTunnelStretch(state: SimState, owner: number, x: number, z: number, dir: number, length: number, level: number, level2: number): Site | string {
  const width = TUNNEL_WIDTH_COLUMNS;
  const cells = stretchCells(x, z, dir, length, width);
  for (const [cx, cz] of cells) if (!state.world.isExplored(cx >> 2, cz >> 2)) return 'You can only dig where you have explored.';
  const [x1, z1] = stretchEnd(x, z, dir, length);
  const want = { owner, kind: SiteKind.TunnelLine, x0: x, z0: z, x1, z1, level, level2, axis: width };
  if (!cells.some(([cx, cz]) => needsWork(state, { id: 0, ...want }, cx, cz))) return 'Nothing to dig along that stretch at the tunnel\'s height.';
  return addSite(state, want);
}

