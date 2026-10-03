// Wall and tunnel chains (Controls: Building placement, "Wall chains";
// Digging and prospecting, "Tunnel chains"): the stretch geometry the sim and
// the client share, a wall chain clicked out in several directions, stretches
// skipping what is in the way and cut short by the stock, and a tunnel chain
// turning corners under a hill that units then walk through.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  createWorld,
  deserializeState,
  hashState,
  Mat,
  NO_FLOOR,
  PERSON,
  placeBuilding,
  placementBlocked,
  Res,
  serializeState,
  SiteKind,
  snapStretch,
  step,
  stretchCells,
  stretchEnd,
  TOOL_GEAR,
  ToolJob,
  TUNNEL_HEIGHT_UNITS,
  TUNNEL_WIDTH_COLUMNS,
  validateOrder,
  WALL_STRETCH_MAX_COLUMNS,
  WU_PER_COLUMN,
  WU_PER_TERRAIN_UNIT,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
const WORKERS = [0, 1, 2, 3];

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

/** Every event text n steps make. */
function texts(s: SimState, n: number, orders: Order[] = []): string[] {
  const out: string[] = [];
  step(s, orders);
  out.push(...s.events.map((v) => v.text));
  for (let k = 1; k < n; k++) {
    step(s);
    out.push(...s.events.map((v) => v.text));
  }
  return out;
}

/** A flat, open, explored patch w by h columns near the first worker. */
function flatSpot(s: SimState, w: number, h: number): { x: number; z: number; y: number } {
  const x0 = col(s.entities.x[0]!);
  const z0 = col(s.entities.z[0]!);
  for (let r = 6; r < 120; r += 2) {
    for (const [x, z] of [[x0 + r, z0], [x0 - r - w, z0], [x0, z0 + r], [x0, z0 - r - h], [x0 + r, z0 + r], [x0 - r - w, z0 - r - h]] as const) {
      const y = s.world.topAt(x, z);
      let ok = true;
      for (let dz = -2; dz < h + 2 && ok; dz++) {
        for (let dx = -2; dx < w + 2 && ok; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (s.world.topAt(cx, cz) !== y || s.nav.flags(cx, cz) !== 0 || s.buildings.footprintAt(cx, cz) !== 0 || !s.world.isExplored(cx >> 2, cz >> 2)) ok = false;
          for (const p of s.world.props(cx >> 6, cz >> 6, s.step)) if ((cx >> 6) * 64 + p.lx === cx && (cz >> 6) * 64 + p.lz === cz && p.stage > 0) ok = false;
        }
      }
      if (ok) return { x, z, y };
    }
  }
  throw new Error('no flat spot');
}

const ids = (s: SimState): number[] => WORKERS.map((i) => s.entities.id[i]!);
const wallAt = (s: SimState, x: number, z: number): boolean => s.buildings.list.some((b) => b.kind === BuildingKind.Wall && b.x === x && b.z === z);
const walls = (s: SimState): Array<[number, number]> => s.buildings.list.filter((b) => b.kind === BuildingKind.Wall).map((b) => [b.x, b.z]);

describe('stretch geometry', () => {
  it('snaps to the nearest of eight directions, as far as the cursor reaches, up to the limit', () => {
    expect(snapStretch(0, 0, 10, 2, 64)).toEqual({ dir: 0, length: 10 });
    expect(snapStretch(0, 0, 2, 10, 64)).toEqual({ dir: 2, length: 10 });
    expect(snapStretch(0, 0, -10, -1, 64)).toEqual({ dir: 4, length: 10 });
    expect(snapStretch(0, 0, 1, -9, 64)).toEqual({ dir: 6, length: 9 });
    expect(snapStretch(0, 0, 6, 5, 64)).toEqual({ dir: 1, length: 6 });
    expect(snapStretch(0, 0, -5, 6, 64)).toEqual({ dir: 3, length: 6 });
    expect(snapStretch(0, 0, -6, -6, 64)).toEqual({ dir: 5, length: 6 });
    expect(snapStretch(0, 0, 7, -7, 64)).toEqual({ dir: 7, length: 7 });
    expect(snapStretch(3, 3, 3, 3, 64)).toEqual({ dir: 0, length: 0 });
    expect(snapStretch(0, 0, 500, 0, WALL_STRETCH_MAX_COLUMNS)).toEqual({ dir: 0, length: WALL_STRETCH_MAX_COLUMNS });
    expect(stretchEnd(2, 3, 5, 4)).toEqual([-2, -1]);
  });

  it('runs straight stretches column by column and joins diagonal ones through a side column, so nothing meets only at a corner', () => {
    expect(stretchCells(0, 0, 0, 3)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    // A diagonal wall: each step through the column beside it.
    const diag = stretchCells(0, 0, 1, 3);
    expect(diag).toEqual([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]]);
    for (let i = 1; i < diag.length; i++) expect(Math.abs(diag[i]![0] - diag[i - 1]![0]) + Math.abs(diag[i]![1] - diag[i - 1]![1])).toBe(1);
    // A tunnel 2 wide: straight runs widen to +z (or +x), diagonals join both ways.
    expect(stretchCells(0, 0, 6, 2, 2)).toEqual([[0, 0], [1, 0], [0, -1], [1, -1], [0, -2], [1, -2]]);
    const wide = stretchCells(0, 0, 3, 2, 2);
    expect(wide).toEqual([[0, 0], [-1, 0], [0, 1], [-1, 1], [-2, 1], [-1, 2], [-2, 2]]);
  });

  it('checks the stretch orders', () => {
    const ok: Order = { kind: 'wallStretch', player: 0, units: [1], building: BuildingKind.Wall, x: 0, z: 0, dir: 3, length: 10, skip: 1 };
    expect(() => validateOrder(ok)).not.toThrow();
    expect(() => validateOrder({ ...ok, dir: 8 })).toThrow();
    expect(() => validateOrder({ ...ok, length: WALL_STRETCH_MAX_COLUMNS + 1 })).toThrow();
    expect(() => validateOrder({ ...ok, skip: 2 })).toThrow();
    const t: Order = { kind: 'tunnelStretch', player: 0, units: [1], x: 0, z: 0, dir: 0, length: 4, level: 10, level2: 30 };
    expect(() => validateOrder(t)).not.toThrow();
    expect(() => validateOrder({ ...t, length: 0 })).toThrow();
    expect(() => validateOrder({ ...t, level2: 20 })).toThrow();
  });
});

describe('wall chains', () => {
  it('builds a chain of stretches in several directions from one anchor, the workers going from the anchor outward', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 12, 12);
    s.players[0]!.pool[Res.SoftwoodLumber] = 200;
    const base = { player: 0, units: ids(s), building: BuildingKind.Wall };
    // Click, click east 6, click south 5, click north-west 3: one order per stretch.
    run(s, 1, [
      { kind: 'wallStretch', ...base, x, z, dir: 0, length: 0, skip: 0 },
      { kind: 'wallStretch', ...base, x, z, dir: 0, length: 6, skip: 1, queued: true },
      { kind: 'wallStretch', ...base, x: x + 6, z, dir: 2, length: 5, skip: 1, queued: true },
      { kind: 'wallStretch', ...base, x: x + 6, z: z + 5, dir: 5, length: 3, skip: 1, queued: true },
    ]);
    const want = [...stretchCells(x, z, 0, 6), ...stretchCells(x + 6, z, 2, 5).slice(1), ...stretchCells(x + 6, z + 5, 5, 3).slice(1)];
    expect(want.length).toBe(7 + 5 + 6);
    // Each worker has every wall queued once, in chain order.
    const q = s.entities.queue[0]!.map((o) => (o.t === 'build' ? [o.x, o.z] : o.t === 'work' ? 'work' : o.t));
    expect(q.length).toBe(want.length);
    expect(q.slice(1)).toEqual(want.slice(1));
    // The first wall started is the anchor's.
    runUntil(s, () => s.buildings.list.some((b) => b.kind === BuildingKind.Wall), 2000);
    expect(walls(s)).toEqual([[x, z]]);
    runUntil(s, () => walls(s).length === want.length && s.buildings.list.filter((b) => b.kind === BuildingKind.Wall).every((b) => b.complete), 30000);
    for (const [cx, cz] of want) expect(wallAt(s, cx, cz)).toBe(true);
    expect(s.players[0]!.pool[Res.SoftwoodLumber]).toBe(200 - want.length);
    // Beside the diagonal no step cuts round a corner of it.
    for (let k = 0; k < 3; k++) {
      const [ax, az] = [x + 5 - k, z + 6 - k];
      expect(s.nav.stepCost(ax, az, ax - 1, az - 1, PERSON)).toBe(-1);
    }
  });

  it('skips columns that cannot take a wall and goes on past them', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 12, 4);
    s.players[0]!.pool[Res.SoftwoodLumber] = 50;
    // A torch post in the way, on the third column.
    placeBuilding(s, 0, BuildingKind.TorchPost, 0, x + 2, z, true);
    const said = texts(s, 2, [{ kind: 'wallStretch', player: 0, units: ids(s), building: BuildingKind.Wall, x, z, dir: 0, length: 6, skip: 0 }]);
    expect(said.some((t) => t.includes('One column of that stretch cannot take a wall'))).toBe(true);
    const q = s.entities.queue[0]!.map((o) => (o.t === 'build' ? `${o.x - x},${o.z - z}` : o.t));
    expect(q.filter((o) => o !== 'work')).not.toContain('2,0');
    expect(q.length).toBe(6);
  });

  it('places as far as the stock allows from the anchor, counting what is planned already, and says so', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 12, 4);
    s.players[0]!.pool[Res.SoftwoodLumber] = 8;
    const base = { player: 0, units: ids(s), building: BuildingKind.Wall };
    const said = texts(s, 1, [
      { kind: 'wallStretch', ...base, x, z, dir: 0, length: 5, skip: 0 },
      // The second stretch finds 6 of the 8 planned already.
      { kind: 'wallStretch', ...base, x: x + 5, z, dir: 2, length: 5, skip: 1, queued: true },
    ]);
    expect(said).toContain('Enough softwood lumber for 2 of the 5 walls in that stretch: they are planned from its start.');
    const planned = s.entities.queue[1]!.filter((o) => o.t === 'build' || o.t === 'work');
    expect(planned.length).toBe(8);
    expect(s.entities.queue[1]!.filter((o) => o.t === 'build').slice(-2).map((o) => (o.t === 'build' ? [o.x, o.z] : null))).toEqual([[x + 5, z + 1], [x + 5, z + 2]]);
    // Nothing left: the next stretch is refused with the reason.
    const none = texts(s, 1, [{ kind: 'wallStretch', ...base, x: x + 5, z: z + 5, dir: 4, length: 3, skip: 1, queued: true }]);
    expect(none.some((t) => t.startsWith('Not enough softwood lumber for another softwood wall'))).toBe(true);
    expect(s.entities.queue[1]!.filter((o) => o.t === 'build' || o.t === 'work').length).toBe(8);
  });

  it('passes over walls standing in its way without a word, so a chain closes on its anchor or goes on from an old wall', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 12, 4);
    s.players[0]!.pool[Res.SoftwoodLumber] = 50;
    placeBuilding(s, 0, BuildingKind.Wall, 0, x, z, true);
    placeBuilding(s, 0, BuildingKind.Wall, 0, x + 3, z, true);
    const said = texts(s, 2, [{ kind: 'wallStretch', player: 0, units: ids(s), building: BuildingKind.Wall, x, z, dir: 0, length: 6, skip: 0 }]);
    expect(said.filter((t) => t.includes('cannot take a wall'))).toEqual([]);
    const q = s.entities.queue[0]!.map((o) => (o.t === 'build' ? o.x - x : -1)).filter((d) => d >= 0);
    expect(q.sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 6]);
  });

  it('is not stopped by a plant beside a column, only on it', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [cx, cz] = [col(e.x[0]!) >> 6, col(e.z[0]!) >> 6];
    let checked = 0;
    for (const p of s.world.props(cx, cz, s.step)) {
      if (p.stage === 0) continue;
      const [px, pz] = [cx * 64 + p.lx, cz * 64 + p.lz];
      if (!s.world.isExplored(px >> 2, pz >> 2)) continue;
      expect(placementBlocked(s, 0, BuildingKind.Wall, px, pz)).toBe(Blocked.Node);
      // A plant one step off the diagonal used to land on the tile of a 1 x 1 spot.
      for (const [nx, nz] of [[px + 1, pz - 1], [px - 1, pz + 1], [px + 2, pz - 2]] as const) {
        const here = s.world.props(nx >> 6, nz >> 6, s.step).some((q) => q.stage > 0 && (nx >> 6) * 64 + q.lx === nx && (nz >> 6) * 64 + q.lz === nz);
        if (here) continue;
        expect(placementBlocked(s, 0, BuildingKind.Wall, nx, nz)).not.toBe(Blocked.Node);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('ignores a stretch of a building that is not a wall', () => {
    const s = createWorld(1, { peaceful: true });
    const { x, z } = flatSpot(s, 4, 4);
    s.players[0]!.pool[Res.SoftwoodLumber] = 50;
    s.players[0]!.pool[Res.Resin] = 50;
    run(s, 1, [{ kind: 'wallStretch', player: 0, units: ids(s), building: BuildingKind.TorchPost, x, z, dir: 0, length: 3, skip: 0 }]);
    expect(s.entities.queue[0]!.some((o) => o.t === 'build')).toBe(false);
  });
});

describe('tunnel chains', () => {
  /** A soil hill 3.4 m tall from (x + 6, z) to (x + 26, z + 20), and four workers with steel picks waiting at its west foot. */
  function hill(): { s: SimState; x: number; z: number; y: number } {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const { x, z, y } = flatSpot(s, 32, 24);
    s.world.editBox(x + 6, z, x + 26, z + 20, y, y + 30, Mat.Soil);
    for (const i of WORKERS) e.toolBreak[i] = TOOL_GEAR[8]![ToolJob.Break]!;
    run(s, 1, [{ kind: 'move', player: 0, units: ids(s), x: centre(x + 2), z: centre(z + 4) }]);
    run(s, 400);
    return { s, x, z, y };
  }

  it('digs a chain of stretches level under the hill, turning corners and running diagonally, and units walk through it', () => {
    const { s, x, z, y } = hill();
    const e = s.entities;
    const roof = y + TUNNEL_HEIGHT_UNITS;
    const base = { player: 0, units: ids(s), level: y, level2: roof };
    // Into the face east 8, south 6, south-east 4, then east out of the far side.
    const legs: Array<[number, number, number, number]> = [
      [x + 6, z + 4, 0, 8],
      [x + 14, z + 4, 2, 6],
      [x + 14, z + 10, 1, 4],
      [x + 18, z + 14, 0, 10],
    ];
    run(s, 1, legs.map(([lx, lz, dir, length], k): Order => ({ kind: 'tunnelStretch', ...base, x: lx, z: lz, dir, length, queued: k > 0 })));
    expect(s.sites.length).toBe(4);
    expect(s.sites.every((t) => t.kind === SiteKind.TunnelLine && t.axis === TUNNEL_WIDTH_COLUMNS)).toBe(true);
    // Each worker digs the stretches in turn.
    expect(e.queue[0]!.map((o) => (o.t === 'dig' ? o.site : -1))).toEqual(s.sites.map((t) => t.id));
    runUntil(s, () => s.sites.length <= 2, 60000);
    // Saved and loaded in the middle, it ends the same.
    const copy = deserializeState(serializeState(s));
    runUntil(s, () => s.sites.length === 0, 60000);
    while (copy.step < s.step) step(copy);
    expect(hashState(copy)).toBe(hashState(s));
    // Every column of the chain has a floor under the hill with the tunnel's headroom; the hill above stays.
    for (const [lx, lz, dir, length] of legs) {
      for (const [cx, cz] of stretchCells(lx, lz, dir, length, TUNNEL_WIDTH_COLUMNS)) {
        if (cx > x + 26) continue;
        expect(s.nav.under(cx, cz)).toBe(y);
        expect(s.nav.roof(cx, cz)).toBe(roof);
        expect(s.world.topAt(cx, cz)).toBe(y + 30);
      }
    }
    expect(s.nav.under(x + 10, z + 2)).toBe(NO_FLOOR);
    // Only stretches that ran under ground are caves.
    expect(s.threats.tunnels.length).toBe(4);
    // A worker walks to the corner deep under the hill (no other way in), standing on the tunnel's floor...
    const id = e.id[0]!;
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 16), z: centre(z + 12) }]);
    runUntil(s, () => col(e.x[0]!) === x + 16 && col(e.z[0]!) === z + 12, 4000);
    expect(e.y[0]).toBe(y * WU_PER_TERRAIN_UNIT);
    // ...and out of the far side.
    run(s, 1, [{ kind: 'move', player: 0, units: [id], x: centre(x + 29), z: centre(z + 14) }]);
    let lowest = Infinity;
    runUntil(s, () => {
      if (col(e.x[0]!) > x + 20 && col(e.x[0]!) < x + 26) lowest = Math.min(lowest, e.y[0]!);
      return col(e.x[0]!) === x + 29 && col(e.z[0]!) === z + 14;
    }, 4000);
    expect(lowest).toBe(y * WU_PER_TERRAIN_UNIT);
  });

  it('turns down a stretch with nothing to dig, and gives right-clicked workers the stretch already marked', () => {
    const { s, x, z, y } = hill();
    const base = { player: 0, level: y, level2: y + TUNNEL_HEIGHT_UNITS };
    // West of the hill the ground is open from the floor up: nothing to dig.
    const said = texts(s, 1, [{ kind: 'tunnelStretch', ...base, units: ids(s), x: x + 5, z: z + 4, dir: 4, length: 4 }]);
    expect(said).toContain('Nothing to dig along that stretch at the tunnel\'s height.');
    expect(s.sites.length).toBe(0);
    run(s, 1, [{ kind: 'tunnelStretch', ...base, units: ids(s).slice(0, 2), x: x + 6, z: z + 4, dir: 0, length: 5 }]);
    run(s, 1, [{ kind: 'tunnelStretch', ...base, units: ids(s).slice(2), x: x + 6, z: z + 4, dir: 0, length: 5 }]);
    expect(s.sites.length).toBe(1);
    expect(s.entities.queue[3]![0]).toEqual({ t: 'dig', site: s.sites[0]!.id });
  });
});
