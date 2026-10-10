// Jade's Patch 7: the bog by the main base "needs to look like a bog with the
// different textures, and also have shallow pools of water". Checked on
// generated land: the base's bog and a bog out in the land are mud, hold
// shallow pools a unit can wade, no pool's water stands above the dry ground
// beside it, and the bog iron, silver nuggets and bog pears stay on dry mud.
import { describe, expect, it } from 'vitest';
import { CHUNK_SHIFT, Mat, NO_WATER, PropKind, WADE_UNITS, WATER_PER_UNIT, World, type Bog } from '../src/index.ts';

const N = 1 << CHUNK_SHIFT;

function look(w: World, bog: Bog) {
  const at = (x: number, z: number) => {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    const c = w.columns(cx, cz);
    const i = (z - cz * N) * N + (x - cx * N);
    return { top: c.top(i), water: c.water[i]!, mat: c.topMaterial(i) };
  };
  let inner = 0;
  let mud = 0;
  let wet = 0;
  let deepest = 0;
  let shallowest = Infinity;
  let walls = 0;
  for (let z = bog.z - bog.r - 4; z <= bog.z + bog.r + 4; z++) {
    for (let x = bog.x - bog.r - 4; x <= bog.x + bog.r + 4; x++) {
      const c = at(x, z);
      if (Math.hypot(x - bog.x, z - bog.z) <= bog.r - 3) {
        inner++;
        if (c.mat === Mat.Mud) mud++;
      }
      if (c.water === NO_WATER) continue;
      wet++;
      const depth = c.water / WATER_PER_UNIT - c.top;
      deepest = Math.max(deepest, depth);
      shallowest = Math.min(shallowest, depth);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = at(x + dx, z + dz);
        if (n.water === NO_WATER && n.top * WATER_PER_UNIT < c.water) walls++;
      }
    }
  }
  const props: Array<{ kind: number; wet: boolean }> = [];
  for (let cz = (bog.z - bog.r) >> CHUNK_SHIFT; cz <= (bog.z + bog.r) >> CHUNK_SHIFT; cz++) {
    for (let cx = (bog.x - bog.r) >> CHUNK_SHIFT; cx <= (bog.x + bog.r) >> CHUNK_SHIFT; cx++) {
      for (const r of w.propRecords(cx, cz)) {
        const x = cx * N + r.lx;
        const z = cz * N + r.lz;
        if (Math.hypot(x - bog.x, z - bog.z) > bog.r + 3) continue;
        if (r.kind === PropKind.BogIron || r.kind === PropKind.SilverNugget || r.kind === PropKind.BogPearBush) props.push({ kind: r.kind, wet: at(x, z).water !== NO_WATER });
      }
    }
  }
  return { inner, mud, wet, deepest, shallowest, walls, props };
}

describe('the bogs (Patch 7)', () => {
  const w = new World(1, 1);
  const pocket = w.gen.start.pockets[0]!;
  const bogs = w.gen.bogsNear(pocket.x, pocket.z, 400);
  const home = bogs.find((b) => b.x === pocket.iron.x && b.z === pocket.iron.z)!;
  const far = bogs.find((b) => b !== home)!;

  it('draws the bog by the main base as mud, not grass', () => {
    expect(pocket.bog).toBe(true);
    const l = look(w, home);
    expect(l.mud).toBe(l.inner);
  });

  for (const [name, which] of [['by the main base', () => home], ['out in the land', () => far]] as const) {
    it(`gives the bog ${name} shallow pools a unit wades, with no water standing above dry ground`, () => {
      const l = look(w, which());
      expect(l.wet).toBeGreaterThan(l.inner / 5);
      expect(l.shallowest).toBeGreaterThanOrEqual(1);
      expect(l.deepest).toBeLessThanOrEqual(3);
      expect(l.deepest).toBeLessThan(WADE_UNITS);
      expect(l.walls).toBe(0);
    });

    it(`keeps the bog iron, silver nuggets and bog pears ${name} on dry ground`, () => {
      const l = look(w, which());
      expect(l.props.filter((p) => p.kind === PropKind.BogIron)).toHaveLength(1);
      expect(l.props.filter((p) => p.kind === PropKind.SilverNugget).length).toBeGreaterThanOrEqual(3);
      expect(l.props.filter((p) => p.kind === PropKind.BogPearBush)).toHaveLength(2);
      expect(l.props.filter((p) => p.wet)).toEqual([]);
    });
  }
});
