// Patch 5's pathing (Jade's GP-22): units find their way out of a crowded or
// walled village through a gate or a gap, round long obstacles and traps, a
// long way in legs, through a tunnel, and round the 3 m boulders (climbers
// may climb them). A unit that still cannot find its way says where it is
// stuck and why, once a minute at most, to its owner only.
import { describe, expect, it } from 'vitest';
import {
  BOULDER_HALF,
  BOULDER_RISE_UNITS,
  Blocked,
  BuildingKind,
  createWorld,
  Gait,
  gaitMover,
  Mat,
  PERSON,
  placeBuilding,
  placementBlocked,
  pointGoal,
  step,
  STUCK_SAY_AGAIN_STEPS,
  TUNNEL_HEIGHT_UNITS,
  WU_PER_COLUMN,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
const UNITS = [0, 1, 2, 3, 4, 5, 6];

function run(s: SimState, n: number, orders: Order[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  step(s, orders);
  out.push(...s.events);
  for (let k = 1; k < n; k++) {
    step(s);
    out.push(...s.events);
  }
  return out;
}

/** A square ring of walls round a column: open on its east side by a gate, a gap, or shut. */
function ring(s: SimState, cx: number, cz: number, r: number, open: 'gate' | 'gap' | 'none'): void {
  for (let d = -r; d <= r; d++) {
    for (const [x, z] of [[cx + d, cz - r], [cx + d, cz + r], [cx - r, cz + d], [cx + r, cz + d]] as const) {
      if (x === cx + r && z >= cz - 3 && z <= cz + 2 && open !== 'none') continue;
      if (s.buildings.footprintAt(x, z) !== 0) continue;
      placeBuilding(s, 0, BuildingKind.Wall, 0, x, z, true);
    }
  }
  if (open === 'gate') placeBuilding(s, 0, BuildingKind.Gate, 1, cx + r, cz - 3, true);
}

/** Sends the first seven units to a column and runs until they have all stopped; returns the farthest any ended from it (columns) and what was said. */
function trip(s: SimState, gx: number, gz: number, steps: number): { far: number; said: SimEvent[] } {
  const e = s.entities;
  const ids = UNITS.map((i) => e.id[i]!);
  const said = run(s, 1, [{ kind: 'move', player: 0, units: ids, x: centre(gx), z: centre(gz) }]);
  for (let k = 0; k < steps && !UNITS.every((i) => e.queue[i]!.length === 0); k++) said.push(...run(s, 1));
  const far = Math.max(...UNITS.map((i) => Math.max(Math.abs(col(e.x[i]!) - gx), Math.abs(col(e.z[i]!) - gz))));
  return { far, said };
}

/** A fresh peaceful world and the column its first unit stands on. */
function start(): { s: SimState; x: number; z: number; y: number } {
  const s = createWorld(1, { peaceful: true });
  const x = col(s.entities.x[0]!);
  const z = col(s.entities.z[0]!);
  return { s, x, z, y: s.world.topAt(x, z) };
}

/** The group's spread at the goal: seven units stand within this of the point they were sent to (columns). */
const SPREAD = 6;

describe("Patch 5's pathing (GP-22)", () => {
  it('leaves a walled village by its gate, or by a gap in its wall, and crosses a crowded one', () => {
    for (const open of ['gate', 'gap'] as const) {
      const { s, x, z } = start();
      ring(s, x, z, 22, open);
      expect(trip(s, x - 50, z, 6000).far).toBeLessThanOrEqual(SPREAD);
    }
    const { s, x, z } = start();
    for (let dz = -30; dz <= 30; dz += 9) {
      for (let dx = -30; dx <= 30; dx += 9) {
        if (Math.abs(dx) < 10 && Math.abs(dz) < 10) continue;
        if (placementBlocked(s, 0, BuildingKind.Storehouse, x + dx, z + dz) === Blocked.None) placeBuilding(s, 0, BuildingKind.Storehouse, 0, x + dx, z + dz, true);
      }
    }
    expect(trip(s, x - 60, z + 40, 6000).far).toBeLessThanOrEqual(SPREAD);
  });

  it('walks round a long ridge too high to climb, and back out of a U-shaped trap', () => {
    {
      const { s, x, z, y } = start();
      s.world.editBox(x + 30, z - 120, x + 32, z + 40, y - 20, y + 120, Mat.Stone);
      expect(trip(s, x + 60, z, 12000).far).toBeLessThanOrEqual(SPREAD);
    }
    const { s, x, z, y } = start();
    s.world.editBox(x + 30, z - 60, x + 32, z + 60, y - 20, y + 120, Mat.Stone);
    s.world.editBox(x - 40, z - 62, x + 32, z - 60, y - 20, y + 120, Mat.Stone);
    s.world.editBox(x - 40, z + 60, x + 32, z + 62, y - 20, y + 120, Mat.Stone);
    expect(trip(s, x + 60, z, 12000).far).toBeLessThanOrEqual(SPREAD);
  });

  it('goes a long way in legs, planning each at the end of the last', () => {
    const { s, x, z } = start();
    const r = s.paths.find(PERSON, x, z, pointGoal(x + 330, z + 50));
    expect(r.more).toBe(true);
    expect(trip(s, x + 330, z + 50, 20000).far).toBeLessThanOrEqual(SPREAD);
  });

  it('takes a tunnel through a ridge rather than the long way round (BG-6)', () => {
    const { s, x, z, y } = start();
    // A 15 m stone ridge 180 m long, and a tunnel through it at ground level.
    s.world.editBox(x + 30, z - 200, x + 34, z + 200, y - 20, y + 130, Mat.Stone);
    s.world.editBox(x + 30, z - 1, x + 34, z + 1, y, y + TUNNEL_HEIGHT_UNITS, Mat.Air);
    expect(s.nav.under(x + 32, z)).toBe(y);
    const r = s.paths.find(PERSON, x, z, pointGoal(x + 60, z));
    expect(r.reached).toBe(true);
    // Its points are the path's turns, one in the tunnel's mouth at most a few columns off its line.
    for (let k = 0; k < r.points.length; k += 2) expect(Math.abs(r.points[k + 1]! - z)).toBeLessThan(10);
    expect(trip(s, x + 60, z, 6000).far).toBeLessThanOrEqual(SPREAD);
  });

  it('raises a standing boulder 3 m on the walk map: walkers go round, climbers may climb it, and mined away it is ground again', () => {
    const { s, x, z } = start();
    // The nearest boulder to the start.
    let found: { cx: number; cz: number; bx: number; bz: number; by: number } | null = null;
    for (let r = 0; r < 12 && !found; r++) {
      for (let cz = (z >> 6) - r; cz <= (z >> 6) + r && !found; cz++) {
        for (let cx = (x >> 6) - r; cx <= (x >> 6) + r && !found; cx++) {
          const b = s.world.boulders(cx, cz);
          if (b.length > 0) found = { cx, cz, bx: cx * 64 + b[0]!, bz: cz * 64 + b[1]!, by: b[2]! };
        }
      }
    }
    expect(found).not.toBeNull();
    const { cx, cz, bx, bz, by } = found!;
    for (let ring = 0; ring <= BOULDER_HALF; ring++) expect(s.nav.level(bx + ring, bz)).toBe(by + BOULDER_RISE_UNITS[ring]!);
    expect(s.nav.level(bx + BOULDER_HALF + 1, bz)).toBeLessThan(by + 5);
    // A walker's way past it, west to east, keeps off its footprint.
    const r = s.paths.find(PERSON, bx - 8, bz, pointGoal(bx + 8, bz));
    expect(r.reached).toBe(true);
    for (let k = 0; k < r.points.length; k += 2) {
      const on = Math.abs(r.points[k]! - bx) <= BOULDER_HALF && Math.abs(r.points[k + 1]! - bz) <= BOULDER_HALF;
      expect(on).toBe(false);
    }
    // A worker climbs onto it from its foot; a fighter too (3 m is under its 4 m); a warhorse does not.
    expect(s.nav.climbFrom(bx + BOULDER_HALF + 1, bz, 0, bx + BOULDER_HALF, bz, gaitMover(Gait.Worker))).toBe(true);
    expect(s.nav.climbFrom(bx + BOULDER_HALF + 1, bz, 0, bx + BOULDER_HALF, bz, gaitMover(Gait.Fighter))).toBe(true);
    expect(s.nav.stepCost(bx + BOULDER_HALF + 1, bz, bx + BOULDER_HALF, bz, gaitMover(Gait.Cavalry))).toBe(-1);
    // Mined away, its footprint is ground again.
    const index = s.world.propRecords(cx, cz).findIndex((p) => cx * 64 + p.lx === bx && cz * 64 + p.lz === bz);
    while (s.world.harvest(cx, cz, index, 1000, s.step) > 0);
    expect(s.world.boulders(cx, cz).length).toBe(0);
    expect(s.nav.level(bx, bz)).toBeLessThan(by + 5);
  });

  it('a unit shut in says where it is stuck and why, to its owner, once a minute at most', () => {
    const { s, x, z } = start();
    const e = s.entities;
    ring(s, x, z, 22, 'none');
    const id = e.id[0]!;
    const said = run(s, 400, [{ kind: 'move', player: 0, units: [id], x: centre(x - 30), z: centre(z) }]);
    const stuck = said.filter((v) => v.stuck);
    expect(stuck.length).toBe(1);
    expect(stuck[0]!.player).toBe(0);
    expect(stuck[0]!.speaker).toBe(id);
    expect(stuck[0]!.urgent).toBe(true);
    expect(stuck[0]!.text).toMatch(/^I'm stuck to the [a-z-]+, about \d+ m from our main base: there are walls and buildings all round me, and I can't figure out how to get out\.$/);
    // The same order again within the minute: no second line; after it, the line again.
    expect(run(s, 400, [{ kind: 'move', player: 0, units: [id], x: centre(x - 30), z: centre(z) }]).some((v) => v.stuck)).toBe(false);
    run(s, STUCK_SAY_AGAIN_STEPS);
    expect(run(s, 400, [{ kind: 'move', player: 0, units: [id], x: centre(x - 30), z: centre(z) }]).some((v) => v.stuck)).toBe(true);
  });

  it('says why when shut in by faces of land too high to climb, or sent somewhere shut off', () => {
    {
      // A 9 m hollow of stone round the unit: over a worker's 7 m climb.
      const { s, x, z, y } = start();
      const e = s.entities;
      for (const [x0, z0, x1, z1] of [[x - 5, z - 5, x + 5, z - 4], [x - 5, z + 4, x + 5, z + 5], [x - 5, z - 5, x - 4, z + 5], [x + 4, z - 5, x + 5, z + 5]] as const) {
        s.world.editBox(x0, z0, x1, z1, y - 10, y + 80, Mat.Stone);
      }
      const said = run(s, 400, [{ kind: 'move', player: 0, units: [e.id[0]!], x: centre(x - 30), z: centre(z) }]);
      expect(said.find((v) => v.stuck)?.text).toMatch(/there are faces of land and rock too high for me to climb all round me/);
    }
    const { s, x, z } = start();
    const e = s.entities;
    ring(s, x - 50, z, 15, 'none');
    const said = run(s, 2000, [{ kind: 'move', player: 0, units: [e.id[0]!], x: centre(x - 50), z: centre(z) }]);
    expect(said.find((v) => v.stuck)?.text).toMatch(/: there are walls and buildings all round where you sent me, and I can't figure out a way there\.$/);
    expect(said.some((v) => v.text === 'I cannot reach that.')).toBe(false);
  });
});
