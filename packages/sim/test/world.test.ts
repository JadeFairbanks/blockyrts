import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addWarrior,
  Band,
  bandRings,
  BuildingKind,
  CELL_RING_SHIFT,
  blocksWalking,
  chunkKeyX,
  chunkKeyZ,
  cloneState,
  createWorld,
  CYCLE_STEPS,
  DIG_LIMIT_UNITS,
  getTable,
  hashState,
  Mat,
  NO_WATER,
  PROPS,
  PropShape,
  Res,
  Species,
  speciesSpec,
  Stage,
  step,
  stockCell,
  Tool,
  Troop,
  revealVision,
  UnitKind,
  WILD,
  World,
  WorldGen,
  WorldLayout,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type GeneratedChunk,
  type SimState,
} from '../src/index.ts';

const passable = (e: { type: number; gaps: readonly unknown[] }): boolean => !blocksWalking(e.type as never) || e.gaps.length > 0;

describe('cell layout', () => {
  for (const players of [1, 4, 8]) {
    it(`keeps every cell open on at least two sides and neighbours symmetric (${players} players)`, () => {
      const layout = new WorldLayout(1234, players);
      let cells = 0;
      for (let ring = 0; ring < 14; ring++) {
        for (let k = 0; k < layout.ringCellCount(ring); k++) {
          const id = ring * 65536 + k;
          const c = layout.cell(id);
          cells++;
          expect(c.edges.filter(passable).length, `cell ${id}`).toBeGreaterThanOrEqual(Math.min(2, c.edges.length));
          for (const n of c.neighbours) {
            expect(layout.neighboursOf(n)).toContain(id);
            const ab = layout.edge(id, n);
            const ba = layout.edge(n, id);
            expect(ab.type).toBe(ba.type);
            expect(ab.gaps.length).toBe(ba.gaps.length);
          }
        }
      }
      expect(cells).toBeGreaterThan(150);
    });
  }

  it('puts the bands in depth order with the basin as the Heartland', () => {
    const layout = new WorldLayout(1, 1);
    const b = layout.bands;
    expect(layout.bandOfRing(0)).toBe(0);
    expect(b.fringe).toBe(1);
    expect(b.deepwoods).toBeGreaterThan(b.fringe);
    expect(b.barrens).toBeGreaterThan(b.deepwoods);
    expect(b.deadlands).toBe(b.barrens + 3);
    expect(layout.basinIds().length).toBe(1);
    expect(new WorldLayout(1, 4).basinIds().length).toBe(2);
    expect(new WorldLayout(1, 8).basinIds().length).toBe(3);
  });
});

function chunkBytes(g: GeneratedChunk): string {
  const c = g.columns;
  return [Array.from(c.layers.subarray(0, c.start[4095]! * 3 + c.count[4095]! * 3)).join(','), Array.from(c.water).join(','), Array.from(c.source).join(','), JSON.stringify(g.props)].join('|');
}

describe('world generation', () => {
  it('is a pure function of seed, players and chunk position, whatever the order chunks are made in', () => {
    const coords: Array<[number, number]> = [];
    for (let cz = -3; cz <= 3; cz += 2) for (let cx = -3; cx <= 3; cx += 2) coords.push([cx, cz]);
    coords.push([40, -35], [-90, 12]);
    const a = new WorldGen(new WorldLayout(77, 2));
    const b = new WorldGen(new WorldLayout(77, 2));
    const first = coords.map(([x, z]) => chunkBytes(a.generateChunk(x, z)));
    const second = [...coords].reverse().map(([x, z]) => chunkBytes(b.generateChunk(x, z))).reverse();
    expect(second).toEqual(first);
    // A different seed gives different land.
    const c = new WorldGen(new WorldLayout(78, 2));
    expect(chunkBytes(c.generateChunk(5, 5))).not.toEqual(chunkBytes(a.generateChunk(5, 5)));
  });

  it('gives each player a flat pocket with its own water, far enough from the others', () => {
    for (const players of [1, 3, 8]) {
      const w = new World(9, players);
      const pockets = w.gen.start.pockets;
      expect(pockets.length).toBe(players);
      for (const p of pockets) {
        const h = w.topAt(p.x, p.z);
        for (const [dx, dz] of [[-20, 0], [20, 0], [0, -20], [0, 20], [14, 14]] as const) expect(Math.abs(w.topAt(p.x + dx, p.z + dz) - h)).toBeLessThanOrEqual(1);
        // Streams meander up to 10 columns either side of their line.
        let wet = 0;
        for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) if (w.waterAt(p.water.x + dx, p.water.z + dz) !== NO_WATER) wet++;
        expect(wet).toBeGreaterThan(20);
        for (const q of pockets) {
          if (q === p) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z) * 0.45;
          expect(d).toBeGreaterThan(75);
        }
      }
    }
  });
});

describe('Table 5 records', () => {
  const table = getTable('5');
  const col = (name: string): number => table.columns.indexOf(name);
  // A stone outcrop takes the hardwood digging stick (or a stone maul); copper and tin take a stone maul (Table 2c).
  // The table's bloom iron is the wrought-iron tier (Troops and gear).
  const toolText: Record<number, RegExp> = { [Tool.Hardwood]: /^hardwood( digging stick or stone maul \(s\))?$/, [Tool.Stone]: /^stone maul \(s\)$/, [Tool.Flint]: /^flint$/, [Tool.Copper]: /^copper$/, [Tool.Bronze]: /^bronze$/, [Tool.WroughtIron]: /^(bloom|wrought) iron$/ };
  for (const p of PROPS) {
    it(`${p.name} matches "${p.row}"`, () => {
      const row = table.rows.find((r) => r[0]!.text === p.row);
      expect(row, p.row).toBeTruthy();
      const text = (c: string): string => row![col(c)]!.text;
      const all = row!.map((c) => c.text).join(' | ');
      for (const s of p.check) expect(all).toContain(s);
      if (p.yield === 0) {
        // Dead trees give no lumber; a carcass or a fish stretch holds what its animal or water gives.
        expect(text('Yield per node')).toMatch(/no lumber|meat|per 4 m2/);
        return;
      }
      if (!p.check.some((s) => text('Yield per node').includes(s))) expect(parseInt(text('Yield per node'), 10)).toBe(p.yield);
      if (!p.check.some((s) => text('Per load').includes(s))) expect(parseInt(text('Per load'), 10)).toBe(p.perLoad);
      if (!p.check.some((s) => text('Time per load').includes(s))) expect(text('Time per load')).toBe(`${p.loadSteps / 20} s`);
      expect(parseInt(text('Gatherers'), 10)).toBe(p.gatherers);
      expect(text('Tool needed')).toMatch(toolText[p.tool]!);
      const regrowth = text('Regrowth');
      const m = /(\d+) (min|hours|days)/.exec(regrowth);
      if (!m) {
        expect(regrowth).toMatch(/^none/);
        expect(p.regrowSteps).toBe(0);
      } else {
        const n = Number(m[1]);
        const steps = m[2] === 'min' ? n * 60 * 20 : m[2] === 'hours' ? n * 3600 * 20 : n * CYCLE_STEPS;
        expect(p.regrowSteps).toBe(steps);
        if (p.shape === PropShape.Tree) expect(regrowth.includes('2 seeds') ? 2 : p.seeds).toBe(p.seeds);
      }
    });
  }
});

describe('terrain edits, water, regrowth and fog', () => {
  it('carves no deeper than the dig limit and builds solid ranges', () => {
    const w = new World(5, 1);
    const p = w.gen.start.pockets[0]!;
    const x = p.x + 10;
    const z = p.z - 12;
    const top = w.topAt(x, z);
    expect(w.editBox(x, z, x + 2, z, -500, top + 1, Mat.Air)).toBe(3);
    expect(w.topAt(x, z)).toBe(Math.min(0, w.naturalTop(x, z)) - DIG_LIMIT_UNITS);
    expect(w.editBox(x, z + 3, x, z + 3, top, top + 9, Mat.Stone)).toBe(1);
    expect(w.topAt(x, z + 3)).toBe(top + 9);
    expect(w.columnAt(x, z + 3).slice(-3)).toEqual([top, top + 9, Mat.Stone]);
    // Doing the same again changes nothing.
    expect(w.editBox(x, z + 3, x, z + 3, top, top + 9, Mat.Stone)).toBe(0);
  });

  it('lets a dug channel fill from a pond, keeping the volume, and settles nearly flat', () => {
    const w = new World(1, 2);
    const pond = w.gen.start.pockets[0]!.water;
    expect(pond.kind).toBe('pond');
    const volume = (): number => {
      let v = 0;
      for (let z = pond.z - 20; z <= pond.z + 20; z++) {
        for (let x = pond.x - 20; x <= pond.x + 60; x++) {
          const wl = w.waterAt(x, z);
          if (wl !== NO_WATER) v += wl - w.topAt(x, z) * 32;
        }
      }
      return v;
    };
    const before = volume();
    w.editBox(pond.x + 7, pond.z - 1, pond.x + 40, pond.z + 1, -6, 4, Mat.Air);
    let steps = 0;
    while (w.waterActive.size > 0 && steps < 5000) {
      w.flowWater();
      steps++;
    }
    expect(w.waterActive.size).toBe(0);
    // Water reached the end of the channel and nothing was made or lost.
    expect(w.waterAt(pond.x + 40, pond.z)).not.toBe(NO_WATER);
    expect(volume()).toBe(before);
    // Neighbouring columns differ by at most one 32nd of a terrain unit.
    for (let x = pond.x + 8; x < pond.x + 40; x++) expect(Math.abs(w.waterAt(x, pond.z) - w.waterAt(x + 1, pond.z))).toBeLessThanOrEqual(1);
  });

  it('keeps a stream at its level while it fills a channel', () => {
    const w = new World(1, 2);
    const s = w.gen.start.pockets[1]!.water;
    expect(s.kind).toBe('stream');
    const level = w.waterAt(s.x, s.z);
    w.editBox(s.x + 2, s.z - 1, s.x + 27, s.z + 1, -6, 4, Mat.Air);
    for (let n = 0; n < 3000 && w.waterActive.size > 0; n++) w.flowWater();
    expect(w.waterAt(s.x, s.z)).toBe(level);
    expect(w.waterAt(s.x + 27, s.z)).not.toBe(NO_WATER);
  });

  it('regrows a hazel bush from the stump and drops seeds from a felled tree', () => {
    const w = new World(1, 2);
    // Find a hazel bush and a full-grown pine near the first pocket.
    let hazel: [number, number, number] | null = null;
    let tree: [number, number, number] | null = null;
    for (let cz = -4; cz <= 2 && !(hazel && tree); cz++) {
      for (let cx = -3; cx <= 3; cx++) {
        for (const v of w.props(cx, cz, 0)) {
          if (!hazel && v.kind === 3 && v.amount > 0) hazel = [cx, cz, v.index];
          if (!tree && v.kind === 0 && v.stage === Stage.Full) tree = [cx, cz, v.index];
        }
      }
    }
    expect(hazel && tree).toBeTruthy();
    const [hx, hz, hi] = hazel!;
    expect(w.harvest(hx, hz, hi, 100, 1000)).toBe(10);
    expect(w.props(hx, hz, 1001).find((v) => v.index === hi)!.amount).toBe(0);
    expect(w.harvest(hx, hz, hi, 100, 1001)).toBe(0);
    expect(w.props(hx, hz, 1000 + 2 * CYCLE_STEPS).find((v) => v.index === hi)!.amount).toBe(10);

    const [tx, tz, ti] = tree!;
    const seedsBefore = [...w.addedProps.values()].reduce((n, l) => n + l.length, 0);
    expect(w.harvest(tx, tz, ti, 5, 2000)).toBe(5);
    expect(w.harvest(tx, tz, ti, 100, 2001)).toBe(15);
    expect(w.props(tx, tz, 2002).find((v) => v.index === ti)).toBeUndefined();
    const seeds = [...w.addedProps.values()].flat();
    expect(seeds.length - seedsBefore).toBeGreaterThanOrEqual(1);
    expect(seeds.length - seedsBefore).toBeLessThanOrEqual(2);
    // The seeds grow: a seed now, a sapling later, a full tree after an hour.
    const at = (step: number): number[] => {
      const out: number[] = [];
      for (const [key, list] of w.addedProps) {
        const cx = chunkKeyX(key);
        const cz = chunkKeyZ(key);
        const views = w.props(cx, cz, step);
        for (const v of views.slice(views.length - list.length)) out.push(v.stage);
      }
      return out;
    };
    expect(at(2002).every((s) => s === Stage.Seed)).toBe(true);
    expect(at(2001 + 30 * 60 * 20).every((s) => s === Stage.Sapling)).toBe(true);
    expect(at(2001 + 60 * 60 * 20).every((s) => s === Stage.Full)).toBe(true);
  });

  it('marks land explored around every player\'s units, one picture for the side, and the debug reveal', () => {
    const state = createWorld(2, { players: 2 });
    const w = state.world;
    const e = state.entities;
    const tile = (x: number): number => Math.floor(x / 4);
    // Both pockets are explored in the one picture the players share.
    for (const p of w.gen.start.pockets) expect(w.isExplored(tile(p.x), tile(p.z + 20))).toBe(true);
    // A worker of each player 45 m north of its Big House, far past the house's 20 m: the land
    // 15 m beyond it is explored by the worker alone, in the same picture.
    for (const p of w.gen.start.pockets) {
      let worker = -1;
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Worker && e.owner[i] === p.player) worker = i;
      e.x[worker] = p.x * WU_PER_COLUMN;
      e.z[worker] = (p.z + 100) * WU_PER_COLUMN;
      expect(w.isExplored(tile(p.x), tile(p.z + 133))).toBe(false);
    }
    revealVision(state);
    for (const p of w.gen.start.pockets) expect(w.isExplored(tile(p.x), tile(p.z + 133))).toBe(true);
    expect(w.isExplored(tile(5000), tile(0))).toBe(false);
    w.reveal(5000 * WU_PER_COLUMN, 0, 50 * 8000);
    expect(w.isExplored(tile(5000), tile(0))).toBe(true);
    expect(w.isExplored(tile(5000 + 150), tile(0))).toBe(false);
  });
});

describe('world state in the snapshot', () => {
  it('round-trips edits, water, felled props, seeds and fog through the canonical bytes', () => {
    const state = createWorld(1, { players: 2 });
    const w = state.world;
    const pond = w.gen.start.pockets[0]!.water;
    w.editBox(pond.x + 7, pond.z - 1, pond.x + 30, pond.z + 1, -6, 4, Mat.Air);
    w.editBox(0, 0, 4, 4, 0, 12, Mat.Marble);
    for (let n = 0; n < 50; n++) w.flowWater();
    expect(w.waterActive.size).toBeGreaterThan(0);
    const v = w.props(0, -2, 0)[0]!;
    w.harvest(0, -2, v.index, 1000, 10);
    w.reveal(400000, 400000, 80000);
    const copy = cloneState(state);
    expect(hashState(copy)).toBe(hashState(state));
    expect(copy.world.explored.size).toBe(w.explored.size);
    expect(copy.world.topAt(2, 2)).toBe(12);
    expect(copy.world.waterAt(pond.x + 12, pond.z)).toBe(w.waterAt(pond.x + 12, pond.z));
    expect(copy.world.props(0, -2, 10).length).toBe(w.props(0, -2, 10).length);
    // Both keep flowing the same way.
    for (let n = 0; n < 200; n++) {
      w.flowWater();
      copy.world.flowWater();
    }
    expect(hashState(copy)).toBe(hashState(state));
  });

  it('changes the hash when the land changes', () => {
    const a = createWorld(1);
    const b = createWorld(1);
    expect(hashState(a)).toBe(hashState(b));
    b.world.editBox(10, 10, 10, 10, 0, 3, Mat.Stone);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('wild birds (Troops and gear: feathers for arrows and bolts)', () => {
  /** Stocks the first cells of a band with one species; returns each group's size by its home, and the bands the birds live in. */
  function stockBand(s: SimState, band: Band, species: number, cells = 8): { groups: number[]; bands: Set<number> } {
    const layout = s.world.layout;
    const [r0, r1] = bandRings(layout, band);
    let n = 0;
    for (let r = r0; r < r1; r++) for (let k = 0; k < layout.ringCellCount(r) && n < cells; k++, n++) stockCell(s, r * CELL_RING_SHIFT + k, species);
    const e = s.entities;
    const groups = new Map<string, number>();
    const bands = new Set<number>();
    for (let i = 0; i < e.count; i++) {
      if (e.kind[i] !== UnitKind.Animal || e.mob[i] !== species) continue;
      expect(e.owner[i]).toBe(WILD);
      const home = `${e.homeX[i]},${e.homeZ[i]}`;
      groups.set(home, (groups.get(home) ?? 0) + 1);
      bands.add(layout.cell(layout.nearest(Math.floor(e.homeX[i]! / WU_PER_COLUMN), Math.floor(e.homeZ[i]! / WU_PER_COLUMN))).band);
    }
    return { groups: [...groups.values()], bands };
  }

  it('puts pheasants in the Fringe woods in ones and twos, and none in the Heartland', () => {
    const s = createWorld(1, { peaceful: true });
    expect(stockBand(s, Band.Heartland, Species.Pheasant).groups).toEqual([]);
    const { groups, bands } = stockBand(s, Band.Fringe, Species.Pheasant);
    expect(groups.length).toBeGreaterThan(4);
    for (const n of groups) expect(n >= 1 && n <= 2).toBe(true);
    expect([...bands]).toEqual([Band.Fringe]);
  });

  it('puts flocks of 3 to 5 wild geese by the water in the Heartland, and none in the Fringe', () => {
    const s = createWorld(1, { peaceful: true });
    expect(stockBand(s, Band.Fringe, Species.WildGoose).groups).toEqual([]);
    // Every player's start pocket has its own water in the Heartland (above), so a game has geese.
    const { groups, bands } = stockBand(s, Band.Heartland, Species.WildGoose);
    expect(groups.length, 'no wild geese in the Heartland').toBeGreaterThan(0);
    for (const n of groups) expect(n >= 3 && n <= 5).toBe(true);
    expect([...bands]).toEqual([Band.Heartland]);
  });

  for (const [species, name] of [[Species.WildGoose, 'a wild goose'], [Species.Pheasant, 'a pheasant']] as const) {
    it(`a slinger hunts ${name}, and the worker hauling it home brings its meat and feathers`, () => {
      const s = createWorld(1, { peaceful: true });
      const e = s.entities;
      const base = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
      const wx = base.x * WU_PER_COLUMN - 4 * WU_PER_METRE;
      const wz = base.z * WU_PER_COLUMN;
      const slinger = addWarrior(s, 0, wx, wz, Troop.Ranger, 1, 0);
      let worker = -1;
      for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) worker = i;
      const bird = addAnimal(s, species, WILD, wx + 10 * WU_PER_METRE, wz + 4 * WU_PER_METRE, 0, 0);
      const spec = speciesSpec(species);
      expect(spec.extra).toEqual([[Res.Feathers, species === Species.WildGoose ? 3 : 2]]);
      const pool = s.players[0]!.pool;
      const feathers = pool[Res.Feathers]!;
      step(s, [{ kind: 'dontEat', player: 0, res: Res.Meat, on: 1 }]);
      const meat = pool[Res.Meat]!;
      step(s, [{ kind: 'hunt', player: 0, units: [e.id[slinger]!, e.id[worker]!], target: e.id[bird]!, auto: 0 }]);
      for (let k = 0; k < 6000 && pool[Res.Feathers] === feathers; k++) step(s);
      expect(pool[Res.Feathers]).toBe(feathers + spec.extra[0]![1]);
      for (let k = 0; k < 2000 && pool[Res.Meat] === meat; k++) step(s);
      expect(pool[Res.Meat]).toBe(meat + spec.meat);
    });
  }
});
