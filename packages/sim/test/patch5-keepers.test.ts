// Jade's Patch 5 keepers (picks in blueprint/patch5-mobs-picks.md): a Bog
// guardian in every bog with its silver nuggets and doubled bog iron
// (MB-11, MB-12), and a Fae Guardian over every large mana crystal (MF-1 to
// MF-12).

import { describe, expect, it } from 'vitest';
import {
  BOG_LINES,
  colKey,
  COLUMNS_PER_CHUNK,
  createWorld,
  deserializeState,
  FAE_LINES,
  KEEPER_LOOT,
  KeeperAsk,
  keeperLoot,
  KeeperMode,
  keeperRuns,
  keeperWarns,
  landAt,
  metresToColumns,
  Mob,
  mobSpec,
  Moves,
  openQuestions,
  PropKind,
  QUESTION_FOREVER,
  Res,
  Role,
  serializeState,
  step,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type AskInfo,
  type Keeper,
  type SimEvent,
  type SimState,
} from '../src/index.ts';
import { giveOrder } from '../src/units/behaviour.ts';
import { ARMOUR_KITS, CLOSE_KITS, LONG_KITS, RANGER_KITS, ROBE_KITS, TOOL_GEAR, WAND_KITS } from '../src/units/kits.ts';
import { hash2 } from '../src/world/noise.ts';
import { ToolJob } from '../src/world/props.ts';
import { Band } from '../src/world/layout.ts';

const M = WU_PER_METRE;

/** Runs the sim a number of steps, gathering what was said and asked. */
function run(s: SimState, n: number, until?: () => boolean): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < n; k++) {
    step(s);
    out.push(...s.events.filter((x) => x.kind === 'speech' || x.kind === 'question'));
    if (until?.()) break;
  }
  return out;
}

function answer(s: SimState, q: AskInfo, player: number, yes: boolean, who: number): void {
  step(s, [{ kind: 'answer', player, ask: q.id, yes: yes ? 1 : 0, q: q.q, who, units: q.units, res: -1 }]);
}

/** A prop of a kind in the chunks round a column: its chunk and index. */
function propNear(s: SimState, gx: number, gz: number, kind: number, near: (x: number, z: number) => boolean = () => true): { cx: number; cz: number; i: number } {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (gx >> 6) + dx;
      const cz = (gz >> 6) + dz;
      const recs = s.world.propRecords(cx, cz);
      const i = recs.findIndex((r) => r.kind === kind && near(cx * COLUMNS_PER_CHUNK + r.lx, cz * COLUMNS_PER_CHUNK + r.lz));
      if (i >= 0) return { cx, cz, i };
    }
  }
  throw new Error('no such prop');
}

function workers(s: SimState, player = 0): number[] {
  const e = s.entities;
  return [...Array(e.count).keys()].filter((i) => e.kind[i] === UnitKind.Worker && e.owner[i] === player && e.hp[i]! > 0);
}

describe('the guarded bogs (MB-11)', () => {
  it('put a bog within 70 m of a main base in every game, with 80 bog iron and 3 to 6 silver nuggets, and a keeper for each', () => {
    // A seed whose only pocket rolled an iron rock takes a bog all the same.
    const forced = [...Array(200).keys()].find((seed) => (hash2(seed, 0x706f636b, 10) >>> 21) % 10 >= 8)!;
    const f = createWorld(forced, { players: 1 });
    expect(f.world.gen.start.pockets[0]!.bog).toBe(true);
    const s = createWorld(5, { players: 1 });
    const p = s.world.gen.start.pockets[0]!;
    expect(p.bog).toBe(true);
    expect(Math.hypot(p.iron.x - p.x, p.iron.z - p.z)).toBeLessThanOrEqual(metresToColumns(70));
    const bog = s.world.gen.bogsNear(p.iron.x, p.iron.z, 1)[0]!;
    expect(bog).toBeDefined();
    const inBog = (x: number, z: number): boolean => Math.hypot(x - bog.x, z - bog.z) <= bog.r;
    const iron = propNear(s, p.iron.x, p.iron.z, PropKind.BogIron, inBog);
    expect(s.world.propRecords(iron.cx, iron.cz)[iron.i]!.amount).toBe(80);
    let nuggets = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (p.iron.x >> 6) + dx;
        const cz = (p.iron.z >> 6) + dz;
        for (const r of s.world.propRecords(cx, cz)) {
          if (r.kind !== PropKind.SilverNugget || !inBog(cx * COLUMNS_PER_CHUNK + r.lx, cz * COLUMNS_PER_CHUNK + r.lz)) continue;
          expect(r.amount).toBe(1);
          nuggets++;
        }
      }
    }
    expect(nuggets).toBeGreaterThanOrEqual(3);
    expect(nuggets).toBeLessThanOrEqual(6);
    // The start's workers are within 60 m: its keeper comes at once, 400 health, walking slower than a worker; none in a peaceful game.
    run(s, 10);
    const k = s.threats.keepers.find((x) => x.kind === 0 && Math.hypot(x.x / WU_PER_COLUMN - bog.x, x.z / WU_PER_COLUMN - bog.z) < 2)!;
    expect(k).toBeDefined();
    const i = s.entities.indexOf(k.id);
    expect(s.entities.mob[i]).toBe(Mob.BogGuardian);
    expect(s.entities.role[i]).toBe(Role.Keeper);
    expect(s.entities.hp[i]).toBe(400);
    expect(s.threats.guarded.has(colKey(bog.x, bog.z))).toBe(true);
    const peaceful = createWorld(5, { players: 1, peaceful: true });
    run(peaceful, 50);
    expect(peaceful.threats.keepers.length).toBe(0);
  });
});

describe('the Bog guardian (MB-11, MB-12)', () => {
  it('asks before his bog is touched, fights for it, asks every player for a promise, and makes peace or war', () => {
    const s = createWorld(5, { players: 2 });
    const e = s.entities;
    run(s, 10);
    const p = s.world.gen.start.pockets[0]!;
    const bog = s.world.gen.bogsNear(p.iron.x, p.iron.z, 1)[0]!;
    const k = s.threats.keepers.find((x) => Math.hypot(x.x / WU_PER_COLUMN - bog.x, x.z / WU_PER_COLUMN - bog.z) < 2)!;
    const g = (): number => e.indexOf(k.id);
    const nugget = propNear(s, p.iron.x, p.iron.z, PropKind.SilverNugget, (x, z) => Math.hypot(x - bog.x, z - bog.z) <= bog.r);
    const [w, w2] = workers(s, 0) as [number, number];
    const wid = e.id[w]!;
    giveOrder(s, w, { t: 'gather', ...nugget }, false);
    // He greets them and asks them not to disturb the bog; once one goes to take a nugget it stops and asks, and he is outraged until the answer.
    const said = run(s, 2400, () => k.mode === KeeperMode.Asking);
    expect(said.some((x) => (BOG_LINES.greet as readonly string[]).includes(x.text))).toBe(true);
    expect(k.mode).toBe(KeeperMode.Asking);
    const outraged = said.find((x) => x.speaker === k.id && x.hold === 'held')!;
    expect(outraged.text).toContain('silver nugget');
    let q = openQuestions(s).find((x) => x.q === KeeperAsk.Gather)!;
    expect(q.units).toEqual([wid]);
    expect(q.until).toBe(QUESTION_FOREVER);
    expect(said.find((x) => x.ask?.id === q.id)!.text).toMatch(/risk angering the Bog guardian/);
    expect(e.queue[e.indexOf(wid)]).toEqual([]);
    // The question is not saved: a loaded game asks it again; the keeper's record is.
    const loaded = deserializeState(serializeState(s));
    expect(loaded.threats.keepers.find((x) => x.id === k.id)!.mode).toBe(KeeperMode.Asking);
    expect(openQuestions(loaded).length).toBe(0);
    run(loaded, 20);
    expect(openQuestions(loaded).some((x) => x.q === KeeperAsk.Gather && x.units[0] === wid)).toBe(true);
    // No: he calms down and thanks them.
    answer(s, q, 0, false, wid);
    expect(k.mode).toBe(KeeperMode.Calm);
    expect(s.events.some((x) => x.speaker === k.id && (BOG_LINES.thanks as readonly string[]).includes(x.text))).toBe(true);
    // Again, and Yes: the worker carries on; he roars, says so, and runs it down faster than it can run.
    giveOrder(s, e.indexOf(wid), { t: 'gather', ...nugget }, false);
    run(s, 600, () => k.mode === KeeperMode.Asking);
    q = openQuestions(s).find((x) => x.q === KeeperAsk.Gather)!;
    answer(s, q, 0, true, wid);
    expect(k.mode).toBe(KeeperMode.Angry);
    expect(s.hits.some((h) => h.look === 'roar' && h.id === k.id)).toBe(true);
    expect(s.events.some((x) => x.speaker === k.id && x.text === BOG_LINES.roar)).toBe(true);
    expect(e.queue[e.indexOf(wid)]![0]).toMatchObject({ t: 'gather', ...nugget });
    run(s, 2);
    expect(keeperRuns(s, g())).toBe(true);
    expect(e.fastUntil[g()]).toBeGreaterThan(s.step);
    // Walk 1.6 m/s, run 4.2 m/s: slower than a walking worker (2.55 m/s), faster than a running one (3.57 m/s).
    expect(mobSpec(Mob.BogGuardian).speed * 20 / M).toBeCloseTo(1.6, 5);
    expect((mobSpec(Mob.BogGuardian).speed * 20 * (10000 + 16250)) / 10000 / M).toBeCloseTo(4.2, 5);
    // The worker falls; he stops and asks every player for the promise, running about his bog.
    const asked = run(s, 1200, () => k.mode === KeeperMode.Pleading);
    expect(e.indexOf(wid)).toBe(-1);
    expect(k.mode).toBe(KeeperMode.Pleading);
    const pleas = openQuestions(s).filter((x) => x.q === KeeperAsk.Promise);
    expect(pleas.length).toBe(2);
    expect(asked.find((x) => x.ask?.id === pleas[0]!.id)!.text).toBe(BOG_LINES.promise);
    expect(pleas.every((x) => x.until === QUESTION_FOREVER)).toBe(true);
    run(s, 20 * 21);
    expect(keeperRuns(s, g())).toBe(true);
    // The second player promises: peace, and both questions go.
    answer(s, asked.find((x) => x.ask?.q === KeeperAsk.Promise && x.player === 1)!.ask!, 1, true, k.id);
    expect(k.mode).toBe(KeeperMode.Calm);
    expect(s.events.some((x) => x.speaker === k.id && x.text === BOG_LINES.peace)).toBe(true);
    expect(openQuestions(s).filter((x) => x.q === KeeperAsk.Promise).length).toBe(0);
    // Hurt by a unit, he goes for it; once it falls he asks again, and No is war on every player, units and buildings.
    landAt(s, w2, e.x[g()]! + 4 * M, e.z[g()]!);
    e.attacker[g()] = e.id[w2]!;
    e.hurtAt[g()] = s.step + 1;
    run(s, 2);
    expect(k.mode).toBe(KeeperMode.Angry);
    expect(k.unit).toBe(e.id[w2]);
    e.hp[w2] = 0;
    const again = run(s, 5, () => k.mode === KeeperMode.Pleading);
    const plea = again.find((x) => x.ask?.q === KeeperAsk.Promise && x.player === 0)!.ask!;
    answer(s, plea, 0, false, k.id);
    expect(k.mode).toBe(KeeperMode.War);
    const war = run(s, 20 * 40);
    expect(war.filter((x) => x.speaker === k.id && (BOG_LINES.war as readonly string[]).includes(x.text)).length).toBeGreaterThanOrEqual(2);
    expect(e.target[g()] !== 0 || e.order[g()] !== 0).toBe(true);
    expect(BOG_LINES.war.length).toBe(30);
    // His tooltip warns, every player's (the client stops it after 10 s).
    expect(keeperWarns(s, g())).toBe(true);
  });

  it('heals 2 a second on his bog and 1 off it', () => {
    const s = createWorld(5, { players: 1 });
    const e = s.entities;
    run(s, 10);
    const k = s.threats.keepers[0]!;
    const i = e.indexOf(k.id);
    e.hp[i] = 300;
    run(s, 20);
    expect(e.hp[e.indexOf(k.id)]).toBe(302);
    landAt(s, e.indexOf(k.id), k.x + k.r + 20 * M, k.z);
    k.roam = s.step + 100 * 20;
    e.targetX[e.indexOf(k.id)] = e.x[e.indexOf(k.id)]!;
    e.targetZ[e.indexOf(k.id)] = e.z[e.indexOf(k.id)]!;
    const was = e.hp[e.indexOf(k.id)]!;
    run(s, 20);
    expect(e.hp[e.indexOf(k.id)]).toBe(was + 1);
  });
});

describe('the Fae Guardian (MF-1 to MF-12)', () => {
  it('keeps a large crystal of 40, asks before it is mined, kills the thief, and is wrathful for good once struck', () => {
    const s = createWorld(5, { players: 1 });
    const e = s.entities;
    const gen = s.world.gen;
    const p = gen.start.pockets[0]!;
    const spot = gen.crystalsNear(p.x, p.z, metresToColumns(400)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
    const [w, w2] = workers(s) as [number, number];
    const wid = e.id[w]!;
    landAt(s, w, spot.x * WU_PER_COLUMN - 30 * M, spot.z * WU_PER_COLUMN);
    run(s, 50);
    const k = s.threats.keepers.find((x) => x.kind === 1) as Keeper;
    expect(k).toBeDefined();
    const f = (): number => e.indexOf(k.id);
    expect(e.mob[f()]).toBe(Mob.FaeGuardian);
    expect(mobSpec(Mob.FaeGuardian).moves).toBe(Moves.LowFlyer);
    expect(e.hp[f()]).toBe(300);
    expect(keeperWarns(s, f())).toBe(true);
    const gx = Math.floor(k.x / WU_PER_COLUMN);
    const gz = Math.floor(k.z / WU_PER_COLUMN);
    const crystal = propNear(s, gx, gz, PropKind.LargeManaCrystal, (x, z) => x === gx && z === gz);
    expect(s.world.propRecords(crystal.cx, crystal.cz)[crystal.i]!.amount).toBe(40);
    // A worker with a pick goes to mine it: it asks first, while she warns it off, until the answer.
    e.toolBreak[e.indexOf(wid)] = TOOL_GEAR[8]![ToolJob.Break]!;
    giveOrder(s, e.indexOf(wid), { t: 'gather', ...crystal }, false);
    const said = run(s, 600, () => k.mode === KeeperMode.Asking);
    expect(said.some((x) => x.speaker === k.id && x.text === FAE_LINES.touch && x.hold === 'held')).toBe(true);
    const q = openQuestions(s).find((x) => x.q === KeeperAsk.Gather)!;
    expect(q.until).toBe(QUESTION_FOREVER);
    expect(said.find((x) => x.ask?.id === q.id)!.text).toMatch(/risk angering the fairy/);
    // Yes: she kills whoever mines it with her bolts, 30 to all within 2 m, then settles, her tooltip gone for good.
    answer(s, q, 0, true, wid);
    expect(k.mode).toBe(KeeperMode.Defending);
    let burst = false;
    for (let n = 0; n < 1200 && e.indexOf(wid) >= 0; n++) {
      step(s);
      burst ||= s.hits.some((h) => h.look === 'fairy');
    }
    expect(burst).toBe(true);
    expect(e.indexOf(wid)).toBe(-1);
    run(s, 40);
    expect(k.mode).toBe(KeeperMode.Calm);
    expect(keeperWarns(s, f())).toBe(false);
    // Struck, she is wrathful for good: high, fast, out of a polearm's reach, running.
    landAt(s, w2, k.x - 6 * M, k.z);
    e.attacker[f()] = e.id[w2]!;
    e.hurtAt[f()] = s.step + 1;
    e.hp[f()] = 200;
    run(s, 2);
    expect(k.mode).toBe(KeeperMode.Wrath);
    expect(e.mob[f()]).toBe(Mob.FaeGuardianAloft);
    expect(mobSpec(Mob.FaeGuardianAloft).moves).toBe(Moves.HighFlyer);
    expect(keeperRuns(s, f())).toBe(true);
    // She heals 1 a second once nothing has hurt her for 10 s.
    e.hurtAt[f()] = s.step;
    const was = e.hp[f()]!;
    run(s, 9 * 20);
    expect(e.hp[f()]).toBe(was);
    run(s, 3 * 20);
    expect(e.hp[f()]).toBeGreaterThan(was);
  });

  it('stand about three to each band but the Deadlands, where one cell in 20 has one', () => {
    const s = createWorld(5, { players: 1 });
    const layout = s.world.gen.layout;
    const per = [0, 0, 0, 0];
    const deadlands = { cells: 0, crystals: 0 };
    for (let r = 0; r < layout.ringCount && deadlands.cells < 4000; r++) {
      for (let k = 0; k < layout.ringCellCount(r); k++) {
        const cell = layout.cell(r * 65536 + k);
        const has = s.world.gen.cellFeatures(cell).crystal !== null;
        if (cell.band === Band.Deadlands) {
          deadlands.cells++;
          if (has) deadlands.crystals++;
        } else if (has) per[cell.band]!++;
      }
    }
    for (const id of layout.basinIds()) if (s.world.gen.cellFeatures(layout.cell(id)).crystal) per[layout.cell(id).band]!++;
    for (const n of per) expect(n).toBeLessThanOrEqual(8);
    expect(per.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
    expect(deadlands.crystals / deadlands.cells).toBeGreaterThan(0.03);
    expect(deadlands.crystals / deadlands.cells).toBeLessThan(0.07);
  });
});

describe('what the keepers drop (MB-11, MF-6, MF-11)', () => {
  it('the Bog guardian: armour of bronze to iron, silver, gold, weapons of tier 3 to 5 and now and then a gem; the fairy: trinkets, gear, food, crystals and a wand or robe', () => {
    const s = createWorld(5, { players: 1 });
    const tiers = (kits: ReadonlyArray<{ tier: number; items: readonly number[] }>, lo: number, hi: number): Set<number> =>
      new Set(kits.filter((k) => k.tier >= lo && k.tier <= hi).flatMap((k) => k.items));
    const armour = tiers(ARMOUR_KITS, 4, 6);
    const weapons = new Set([...tiers(CLOSE_KITS, 3, 5), ...tiers(LONG_KITS, 3, 5), ...tiers(RANGER_KITS, 3, 5)]);
    const l = KEEPER_LOOT.bog;
    for (let n = 0; n < 100; n++) {
      const items = keeperLoot(s, Mob.BogGuardian)!.items;
      const count = (set: Set<number>): number => items.filter(([r]) => set.has(r)).length;
      expect(count(armour)).toBeGreaterThanOrEqual(l.armourMin);
      expect(count(armour)).toBeLessThanOrEqual(l.armourMax);
      expect(count(weapons)).toBeGreaterThanOrEqual(l.weaponsMin);
      expect(count(weapons)).toBeLessThanOrEqual(l.weaponsMax);
      const silver = items.find(([r]) => r === Res.Silver)![1];
      expect(silver).toBeGreaterThanOrEqual(10);
      expect(silver).toBeLessThanOrEqual(15);
      expect(items.find(([r]) => r === Res.Gold)?.[1] ?? 0).toBeLessThanOrEqual(2);
      expect(items.filter(([r]) => r === Res.Emeralds || r === Res.Rubies || r === Res.Diamonds).length).toBeLessThanOrEqual(1);
    }
    const mage = new Set<number>([...WAND_KITS, ...ROBE_KITS].filter((k) => k.tier > 0).flatMap((k) => k.items));
    for (let n = 0; n < 100; n++) {
      const items = keeperLoot(s, Mob.FaeGuardianAloft)!.items;
      expect(items.filter(([r]) => mage.has(r)).length).toBe(1);
      const crystals = items.find(([r]) => r === Res.ManaCrystal)![1];
      expect(crystals).toBeGreaterThanOrEqual(2);
      expect(crystals).toBeLessThanOrEqual(5);
      expect(items.some(([r]) => r === Res.BlackBerries || r === Res.Raspberries || r === Res.Blueberries)).toBe(true);
    }
    expect(keeperLoot(s, Mob.Zombie)).toBeNull();
  });
});
