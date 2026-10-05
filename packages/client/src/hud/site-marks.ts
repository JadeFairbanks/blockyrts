// How marked digs, tunnels and earthworks show on the overlay (Jade's Patch 4;
// Controls: Dig). The full see-through box shows only while a selected worker
// has the site in its orders, digging it now or lined up after its current
// job. Every other site is traced by one thin dotted line instead: round the
// edge of a dug or heaped area, on the land beside it, and along the middle of
// a tunnel at its floor, joined from stretch to stretch so a chain reads as one
// path. Either way any worker can still be right-clicked onto it to help.

import { SiteKind, STRETCH_DIRS, stretchBetween, type Site, type UnitOrder } from '@blockyrts/sim';
import { COLUMN_M, UNIT_M } from '../world/mesher.ts';

/**
 * One straight run of a site's dotted trace, in metres. `y` is its height, or
 * null to lie on the land, looked up just outside the area: (nx, nz) points
 * outward.
 */
export interface TraceRun {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number | null;
  nx: number;
  nz: number;
}

/** How far outside an area its trace looks up the land, metres: the next column over, so the line rides the rim of a dig or the foot of a heap (s). */
export const TRACE_NUDGE_M = 0.05;
/** How far over the land or a tunnel's floor the trace is drawn, metres: as the light and claim rings (s). */
export const TRACE_LIFT_M = 0.08;
/** A joined corner of a tunnel chain lies within this many columns of the column the stretches share; anything further is drawn as a plain link (s). */
const JOIN_REACH_COLUMNS = 2;

/** The sites in these units' order lists: what the selected workers are digging or heaping now, or have lined up after it. */
export function sitesInOrders(ids: Iterable<number>, queues: ReadonlyMap<number, readonly UnitOrder[]>): Set<number> {
  const out = new Set<number>();
  for (const id of ids) for (const o of queues.get(id) ?? []) if (o.t === 'dig') out.add(o.site);
  return out;
}

/** The four sides of an area of columns, clockwise from its north-west corner, each with its outward side. */
function edgeRuns(x0: number, z0: number, x1: number, z1: number, y: number | null): TraceRun[] {
  const w = x0 * COLUMN_M;
  const e = (x1 + 1) * COLUMN_M;
  const n = z0 * COLUMN_M;
  const s = (z1 + 1) * COLUMN_M;
  return [
    { ax: w, az: n, bx: e, bz: n, y, nx: 0, nz: -1 },
    { ax: e, az: n, bx: e, bz: s, y, nx: 1, nz: 0 },
    { ax: e, az: s, bx: w, bz: s, y, nx: 0, nz: 1 },
    { ax: w, az: s, bx: w, bz: n, y, nx: -1, nz: 0 },
  ];
}

/**
 * The middle of a tunnel chain's stretch, from its anchor column to its end
 * column, metres. A straight stretch's extra columns lie on its +x or +z side
 * (stretchCells), so its middle is half its width over; a diagonal's straddle
 * the line through its columns' centres.
 */
function middleLine(s: Site): { ax: number; az: number; bx: number; bz: number; dx: number; dz: number } {
  const [dx, dz] = STRETCH_DIRS[stretchBetween(s.x0, s.z0, s.x1, s.z1).dir]!;
  const w = Math.max(1, s.axis);
  const ox = dx === 0 ? w / 2 : 0.5;
  const oz = dz === 0 ? w / 2 : 0.5;
  return { ax: (s.x0 + ox) * COLUMN_M, az: (s.z0 + oz) * COLUMN_M, bx: (s.x1 + ox) * COLUMN_M, bz: (s.z1 + oz) * COLUMN_M, dx, dz };
}

/**
 * The dotted trace of each site, by site id. A dig, bank, fill or ramp is
 * traced round its edge on the land; a marked tunnel round its edge at its
 * floor; a tunnel chain's stretch along its middle at its floor, and where
 * one stretch starts on the column another ends on at the same floor, both
 * meet at the corner their middles make, so the chain is one unbroken path.
 */
export function siteTraces(sites: readonly Site[]): Map<number, TraceRun[]> {
  const out = new Map<number, TraceRun[]>();
  const lines: Array<{ s: Site; m: ReturnType<typeof middleLine>; run: TraceRun; joined: boolean }> = [];
  for (const s of sites) {
    if (s.kind === SiteKind.TunnelLine && (s.x0 !== s.x1 || s.z0 !== s.z1)) {
      const m = middleLine(s);
      const run: TraceRun = { ax: m.ax, az: m.az, bx: m.bx, bz: m.bz, y: s.level * UNIT_M + TRACE_LIFT_M, nx: 0, nz: 0 };
      lines.push({ s, m, run, joined: false });
      out.set(s.id, [run]);
    } else if (s.kind === SiteKind.TunnelLine) {
      // A stretch of no length is the anchor's columns alone (stretchCells): round them at the floor.
      out.set(s.id, edgeRuns(s.x0, s.z0, s.x0, s.z0 + Math.max(1, s.axis) - 1, s.level * UNIT_M + TRACE_LIFT_M));
    } else if (s.kind === SiteKind.Tunnel) out.set(s.id, edgeRuns(s.x0, s.z0, s.x1, s.z1, s.level * UNIT_M + TRACE_LIFT_M));
    else out.set(s.id, edgeRuns(s.x0, s.z0, s.x1, s.z1, null));
  }
  const ends = new Map<string, Array<(typeof lines)[number]>>();
  for (const l of lines) {
    const k = `${l.s.x1},${l.s.z1},${l.s.level}`;
    const at = ends.get(k);
    if (at) at.push(l);
    else ends.set(k, [l]);
  }
  for (const next of lines) {
    const prev = ends.get(`${next.s.x0},${next.s.z0},${next.s.level}`)?.find((l) => l !== next && !l.joined);
    if (!prev) continue;
    prev.joined = true;
    const p = prev.m;
    const n = next.m;
    const cross = p.dx * n.dz - p.dz * n.dx;
    if (cross !== 0) {
      // Where the two middles cross: prev's line from its anchor, next's from its own.
      const t = ((n.ax - p.ax) * n.dz - (n.az - p.az) * n.dx) / cross;
      const x = p.ax + p.dx * t;
      const z = p.az + p.dz * t;
      const jx = (next.s.x0 + 0.5) * COLUMN_M;
      const jz = (next.s.z0 + 0.5) * COLUMN_M;
      if (Math.hypot(x - jx, z - jz) <= JOIN_REACH_COLUMNS * COLUMN_M) {
        prev.run.bx = x;
        prev.run.bz = z;
        next.run.ax = x;
        next.run.az = z;
        continue;
      }
    }
    // Middles that run the same way already meet; otherwise a short link joins them.
    if (prev.run.bx !== next.run.ax || prev.run.bz !== next.run.az) out.get(next.s.id)!.unshift({ ax: prev.run.bx, az: prev.run.bz, bx: next.run.ax, bz: next.run.az, y: next.run.y, nx: 0, nz: 0 });
  }
  return out;
}
