// Marked digs on the overlay (Jade's Patch 4): the full see-through box only
// while a selected worker has the dig in its orders; otherwise one thin dotted
// line traces it, round the edge of an area on the land beside it and along
// the middle of a tunnel at its floor, a chain's stretches meeting at their
// corners.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SiteKind, TUNNEL_WIDTH_COLUMNS, type Site, type UnitOrder } from '@blockyrts/sim';
import { siteTraces, sitesInOrders, TRACE_LIFT_M, type TraceRun } from '../src/hud/site-marks.ts';
import { COLUMN_M, UNIT_M } from '../src/world/mesher.ts';
import { DOT_EVERY_M, DOT_M, Overlay } from '../src/world/overlay.ts';

const C = COLUMN_M;

function site(id: number, kind: number, x0: number, z0: number, x1: number, z1: number, level = -9, level2 = 0, axis = 0): Site {
  return { id, owner: 0, kind, x0, z0, x1, z1, level, level2, axis };
}

/** A tunnel chain's stretch, 2 columns wide, floor at 0. */
function stretch(id: number, x0: number, z0: number, x1: number, z1: number, level = 0): Site {
  return site(id, SiteKind.TunnelLine, x0, z0, x1, z1, level, level + 20, TUNNEL_WIDTH_COLUMNS);
}

/** A run's ends, in columns, rounded. */
function cols(r: TraceRun): [number, number, number, number] {
  const k = (v: number): number => Math.round((v / C) * 1000) / 1000;
  return [k(r.ax), k(r.az), k(r.bx), k(r.bz)];
}

describe('which digs show in full', () => {
  const queues = new Map<number, UnitOrder[]>([
    [1, [{ t: 'dig', site: 5 }, { t: 'dig', site: 7 }]],
    [2, [{ t: 'dig', site: 9 }]],
    [3, [{ t: 'move', x: 0, z: 0 }]],
  ]);

  it('takes the digs a selected worker is on now and those lined up after it', () => {
    expect([...sitesInOrders([1], queues)].sort()).toEqual([5, 7]);
  });

  it('leaves out digs only unselected workers are on, and orders that are not digs', () => {
    expect([...sitesInOrders([1, 3], queues)].sort()).toEqual([5, 7]);
    expect(sitesInOrders([3], queues).size).toBe(0);
    expect(sitesInOrders([], queues).size).toBe(0);
  });

  it('counts every selected worker', () => {
    expect([...sitesInOrders([1, 2], queues)].sort()).toEqual([5, 7, 9]);
  });

  it('ignores units with no orders listed (not the local player\'s)', () => {
    expect(sitesInOrders([42], queues).size).toBe(0);
  });
});

describe('the dotted trace of an area', () => {
  it('goes round a dig on the land, each side looking up the land outside it', () => {
    const runs = siteTraces([site(1, SiteKind.Dig, 2, 3, 5, 4)]).get(1)!;
    expect(runs.map(cols)).toEqual([
      [2, 3, 6, 3],
      [6, 3, 6, 5],
      [6, 5, 2, 5],
      [2, 5, 2, 3],
    ]);
    expect(runs.every((r) => r.y === null)).toBe(true);
    expect(runs.map((r) => [r.nx, r.nz])).toEqual([
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]);
  });

  it('traces a marked tunnel round its edge at its floor', () => {
    const runs = siteTraces([site(1, SiteKind.Tunnel, 0, 0, 3, 1, -20, 0)]).get(1)!;
    expect(runs).toHaveLength(4);
    for (const r of runs) expect(r.y).toBeCloseTo(-20 * UNIT_M + TRACE_LIFT_M);
  });
});

describe('the dotted trace of a tunnel chain', () => {
  it('runs a straight stretch along its middle, half its width over, at its floor', () => {
    const [r] = siteTraces([stretch(1, 0, 0, 10, 0, -9)]).get(1)!;
    expect(cols(r!)).toEqual([0.5, 1, 10.5, 1]);
    expect(r!.y).toBeCloseTo(-9 * UNIT_M + TRACE_LIFT_M);
    const [n] = siteTraces([stretch(2, 4, 8, 4, 2)]).get(2)!;
    expect(cols(n!)).toEqual([5, 8.5, 5, 2.5]);
  });

  it('runs a diagonal stretch through its columns\' centres', () => {
    const [r] = siteTraces([stretch(1, 0, 0, 5, 5)]).get(1)!;
    expect(cols(r!)).toEqual([0.5, 0.5, 5.5, 5.5]);
  });

  it('meets the next stretch at the corner of their middles', () => {
    // East, then south from the column it ends on.
    const t = siteTraces([stretch(1, 0, 0, 10, 0), stretch(2, 10, 0, 10, 10)]);
    expect(cols(t.get(1)![0]!)).toEqual([0.5, 1, 11, 1]);
    expect(cols(t.get(2)![0]!)).toEqual([11, 1, 11, 10.5]);
    // East, then north-east.
    const d = siteTraces([stretch(1, 0, 0, 10, 0), stretch(2, 10, 0, 15, -5)]);
    expect(cols(d.get(1)![0]!)).toEqual([0.5, 1, 10, 1]);
    expect(cols(d.get(2)![0]!)).toEqual([10, 1, 15.5, -4.5]);
    expect(d.get(2)).toHaveLength(1);
  });

  it('joins whichever order the stretches come in, and closes a loop', () => {
    const loop = [stretch(1, 0, 0, 10, 0), stretch(2, 10, 0, 10, 10), stretch(3, 10, 10, 0, 10), stretch(4, 0, 10, 0, 0)];
    const t = siteTraces([...loop].reverse());
    const runs = loop.map((s) => t.get(s.id)!);
    expect(runs.every((r) => r.length === 1)).toBe(true);
    // Each stretch ends where the next begins, all the way round.
    for (let k = 0; k < 4; k++) {
      const a = runs[k]![0]!;
      const b = runs[(k + 1) % 4]![0]!;
      expect([a.bx, a.bz]).toEqual([b.ax, b.az]);
    }
    expect(cols(runs[0]![0]!)).toEqual([1, 1, 11, 1]);
  });

  it('carries straight on when the next stretch runs the same way', () => {
    const t = siteTraces([stretch(1, 0, 0, 10, 0), stretch(2, 10, 0, 20, 0)]);
    expect(cols(t.get(1)![0]!)).toEqual([0.5, 1, 10.5, 1]);
    expect(cols(t.get(2)![0]!)).toEqual([10.5, 1, 20.5, 1]);
    expect(t.get(2)).toHaveLength(1);
  });

  it('does not join stretches at different floors, or that only pass near each other', () => {
    const t = siteTraces([stretch(1, 0, 0, 10, 0, 0), stretch(2, 10, 0, 10, 10, -9)]);
    expect(cols(t.get(1)![0]!)).toEqual([0.5, 1, 10.5, 1]);
    expect(cols(t.get(2)![0]!)).toEqual([11, 0.5, 11, 10.5]);
    const u = siteTraces([stretch(1, 0, 0, 10, 0), stretch(2, 11, 0, 11, 10)]);
    expect(cols(u.get(2)![0]!)).toEqual([12, 0.5, 12, 10.5]);
  });

  it('goes round a stretch of no length at its floor', () => {
    const runs = siteTraces([stretch(1, 3, 3, 3, 3, -9)]).get(1)!;
    expect(runs.map(cols)).toEqual([
      [3, 3, 4, 3],
      [4, 3, 4, 5],
      [4, 5, 3, 5],
      [3, 5, 3, 3],
    ]);
  });
});

describe('the dotted line', () => {
  function draw(fn: (o: Overlay) => void): Float32Array {
    const scene = new THREE.Scene();
    const o = new Overlay(scene);
    o.begin();
    fn(o);
    o.end();
    const lines = scene.children[0] as THREE.LineSegments;
    const n = lines.geometry.drawRange.count;
    if (n === 0) return new Float32Array(0);
    return (lines.geometry.getAttribute('position').array as Float32Array).slice(0, n * 3);
  }

  it('puts a 15 cm dot about every column, the first and last centred on the ends', () => {
    expect(DOT_M).toBe(0.15);
    expect(DOT_EVERY_M).toBe(COLUMN_M);
    const p = draw((o) => o.dotted(0, 0, 4.5, 0, () => 1, new THREE.Color(1, 1, 1)));
    // 10 gaps of 45 cm: 11 dots, two ends each; the end ones are half dots.
    expect(p.length / 3).toBe(22);
    expect([p[0], p[3]]).toEqual([0, expect.closeTo(0.075, 5)]);
    expect([p[6], p[9]]).toEqual([expect.closeTo(0.375, 5), expect.closeTo(0.525, 5)]);
    expect([p[60], p[63]]).toEqual([expect.closeTo(4.425, 5), expect.closeTo(4.5, 5)]);
    for (let k = 1; k < p.length; k += 3) expect(p[k]).toBe(1);
  });

  it('looks up the height at each end of each dot', () => {
    const p = draw((o) => o.dotted(0, 0, 0, 0.9, (x, z) => z * 10, new THREE.Color(1, 1, 1)));
    for (let k = 0; k < p.length; k += 3) expect(p[k + 1]).toBeCloseTo(p[k + 2]! * 10, 4);
  });

  it('draws nothing for a line of no length', () => {
    expect(draw((o) => o.dotted(1, 1, 1, 1, () => 0, new THREE.Color(1, 1, 1))).length).toBe(0);
  });
});
