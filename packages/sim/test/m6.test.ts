import { describe, expect, it } from 'vitest';
import {
  Ability,
  addMage,
  beginSpell,
  BuildingKind,
  buildingCentre,
  canCast,
  CYCLE_STEPS,
  DAY_STEPS,
  DebugThreat,
  deserializeState,
  DUSK_STEPS,
  hashState,
  isLit,
  Item,
  knowsSpell,
  MAGE_RANKS,
  MANA_SCALE,
  Mob,
  placeBuilding,
  Product,
  Res,
  Research,
  RESEARCH_PRODUCT,
  CRAFT_PRODUCT,
  createWorld,
  School,
  serializeState,
  setMageRank,
  spellReadyAt,
  SPELLS,
  Spell,
  spellsKnown,
  spend,
  SpellWith,
  step,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';
import { readFileSync } from 'node:fs';

const M = WU_PER_METRE;
const SEC = 20;

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

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

function sanctum(s: SimState): Building {
  const b = bigHouse(s);
  return placeBuilding(s, 0, BuildingKind.MagiSanctum, 0, b.x + 16, b.z, true);
}

function warrior(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior) return i;
  throw new Error('no warrior');
}

function mages(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mage) out.push(i);
  return out;
}

/** A mob of a kind spawned at a spot (wu), by index. */
function spawn(s: SimState, mob: number, x: number, z: number): number {
  run(s, 1, [{ kind: 'debugSpawn', player: 0, mob, x, z }]);
  const e = s.entities;
  let last = -1;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === mob) last = i;
  return last;
}

function toNight(s: SimState, night: number): void {
  s.step = night * CYCLE_STEPS + DAY_STEPS + DUSK_STEPS;
}

describe('the Magi Sanctum', () => {
  it('trains a Novice Acolyte for 50 food and a wand in 60 s', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    p.pool[Res.Sticks] = 20;
    p.pool[Res.CopperIngot] = 2;
    p.pool[Res.Meat] = 200;
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: CRAFT_PRODUCT + Item.Wand, count: 1 }]);
    runUntil(s, () => p.items[Item.Wand]! > 0, 20 * SEC + 5);
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: Product.BattleMage, count: 1 }]);
    expect(p.items[Item.Wand]).toBe(0);
    const took = runUntil(s, () => mages(s).length > 0, 60 * SEC + 5);
    expect(took).toBeGreaterThanOrEqual(60 * SEC - 2);
    const [m] = mages(s);
    const e = s.entities;
    expect(e.school[m!]).toBe(School.Battle);
    expect(e.rank[m!]).toBe(1);
    expect(e.hp[m!]).toBe(70);
    expect(e.mana[m!]).toBe(100 * MANA_SCALE);
    expect(e.weapon[m!]).toBe(Item.Wand);
  });

  it('researches Hexcraft, which teaches Warding and Counterspell from rank 2', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    p.pool[Res.Hexstone] = 6;
    p.pool[Res.Herbs] = 20;
    const [x, z] = buildingCentre(b);
    const support = addMage(s, 0, x + 10 * M, z, School.Support);
    const battle = addMage(s, 0, x + 12 * M, z, School.Battle);
    setMageRank(s, support, 2);
    setMageRank(s, battle, 2);
    expect(spellsKnown(School.Support, 2, false)).toEqual([Spell.Heal, Spell.Quicken]);
    expect(knowsSpell(s, battle, Spell.Counterspell)).toBe(false);
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: RESEARCH_PRODUCT + Research.Hexcraft, count: 1 }]);
    runUntil(s, () => (p.research & (1 << Research.Hexcraft)) !== 0, 90 * SEC + 5);
    expect(knowsSpell(s, support, Spell.Warding)).toBe(true);
    expect(knowsSpell(s, battle, Spell.Counterspell)).toBe(true);
    // A Novice Acolyte does not know them yet.
    const novice = addMage(s, 0, x + 14 * M, z, School.Battle);
    expect(knowsSpell(s, novice, Spell.Counterspell)).toBe(false);
  });

  it('trains a mage to Acolyte, and gives a rank wand once her experience is banked', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    p.pool[Res.Meat] = 200;
    const [x, z] = buildingCentre(b);
    const m = addMage(s, 0, x + 8 * M, z, School.Support);
    const e = s.entities;
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    runUntil(s, () => e.rank[m] === 2, 90 * SEC);
    expect(e.maxHp[m]).toBe(80);
    // Mage needs 300 experience and her rank wand.
    setMageRank(s, m, 3);
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    const texts: string[] = [];
    run(s, 40);
    texts.push(...s.events.map((ev) => ev.text));
    expect(e.rank[m]).toBe(3);
    e.xp[m] = MAGE_RANKS[3]!.xp * 10;
    p.items[Item.WandMage] = 1;
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    runUntil(s, () => e.rank[m] === 4, 60 * SEC);
    expect(e.weapon[m]).toBe(Item.WandMage);
    expect(p.items[Item.Wand]).toBe(1);
    expect(e.maxHp[m]).toBe(100);
  });
});

function createPeaceful(): SimState {
  return createWorld(1, { peaceful: true });
}

/** A support and a battle mage beside the warrior, the warrior hurt, and a zombie 15 m off; at night. */
function skirmish(): { s: SimState; support: number; battle: number; w: number; zombie: number } {
  const s = createPeaceful();
  toNight(s, 1);
  const e = s.entities;
  const w = warrior(s);
  const support = addMage(s, 0, e.x[w]! + 2 * M, e.z[w]!, School.Support);
  const battle = addMage(s, 0, e.x[w]! - 2 * M, e.z[w]!, School.Battle);
  e.hp[w] = 40;
  const zombie = spawn(s, Mob.Zombie, e.x[battle]! - 15 * M, e.z[battle]!);
  return { s, support, battle, w, zombie };
}

describe('Heal and Arcane bolt', () => {
  it('heal a hurt warrior and hurt a zombie by themselves, inside the step', () => {
    const { s, support, battle, w, zombie } = skirmish();
    const e = s.entities;
    const zid = e.id[zombie]!;
    const zhp = e.hp[zombie]!;
    run(s, 2 * SEC);
    expect(e.hp[w]).toBeGreaterThan(40);
    expect(e.mana[support]).toBeLessThan(100 * MANA_SCALE);
    const z = e.indexOf(zid);
    expect(z < 0 || e.hp[z]! < zhp).toBe(true);
    expect(spellReadyAt(s, battle, Spell.ArcaneBolt)).toBeGreaterThan(0);
  });

  it('gives the same hashes on two runs, and after a save and load mid-cast', () => {
    const a = skirmish().s;
    const b = skirmish().s;
    for (let k = 0; k < 15; k++) {
      step(a);
      step(b);
    }
    expect(hashState(a)).toBe(hashState(b));
    const c = deserializeState(serializeState(a));
    for (let k = 0; k < 200; k++) {
      step(a);
      step(c);
    }
    expect(hashState(c)).toBe(hashState(a));
  });
});

describe('Counterspell', () => {
  it("cancels a goblin mage's Snuff while it is cast; its mana is still spent", () => {
    for (const counter of [false, true]) {
      const s = createWorld(1);
      const e = s.entities;
      const w = warrior(s);
      run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Village, x: e.x[w]! + 60 * M, z: e.z[w]! }]);
      let g = -1;
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.GoblinMage) g = i;
      const torch = placeBuilding(s, 0, BuildingKind.TorchPost, 0, Math.floor(e.x[g]! / WU_PER_COLUMN) + 20, Math.floor(e.z[g]! / WU_PER_COLUMN), true);
      torch.fuelUntil = s.step + 5000;
      s.players[0]!.research |= 1 << Research.Hexcraft;
      if (counter) {
        const m = addMage(s, 0, e.x[g]! - 10 * M, e.z[g]!, School.Battle);
        setMageRank(s, m, 2);
        expect(canCast(s, m, Spell.Counterspell)).toBe(true);
      }
      const before = e.mana[g]!;
      spend(s, g, Ability.Snuff);
      beginSpell(s, g, torch.id, SpellWith.Snuff);
      run(s, 2 * SEC);
      expect(isLit(torch, s.step)).toBe(counter);
      expect(e.mana[g]!).toBeLessThan(before);
    }
  });
});

describe('a Grand Magician', () => {
  it('keeps up a bolt every 4 s', () => {
    const s = createPeaceful();
    toNight(s, 1);
    const e = s.entities;
    const w = warrior(s);
    const m = addMage(s, 0, e.x[w]! + 4 * M, e.z[w]! + 4 * M, School.Battle);
    setMageRank(s, m, 6);
    // From an empty bar: what she can keep up, not what she starts with.
    e.mana[m] = 0;
    const z = spawn(s, Mob.Zombie, e.x[m]! + 14 * M, e.z[m]!);
    e.hp[z] = 1_000_000;
    e.maxHp[z] = 1_000_000;
    e.heldUntil[z] = 1 << 30;
    let bolts = 0;
    const mid = e.id[m]!;
    for (let k = 0; k < 160 * SEC; k++) {
      step(s);
      for (const h of s.hits) if (h.look === 'shot' && h.id === mid) bolts++;
    }
    expect(bolts).toBeGreaterThanOrEqual(40);
  });
});

describe('the spell table', () => {
  it('matches Table 13 in docs/blueprint.md', () => {
    const doc = readFileSync(new URL('../../../docs/blueprint.md', import.meta.url), 'utf8');
    const head = doc.indexOf('| **Spell', doc.indexOf('#### Table 13: Mage spells and mana'));
    const rows = doc.slice(head, doc.indexOf('\n\n', head)).split('\n').slice(2);
    expect(rows.length).toBe(SPELLS.length);
    for (const s of SPELLS) {
      const row = rows.find((r) => r.startsWith(`| ${s.name} (${s.clip})`));
      expect(row, s.name).toBeDefined();
      const cells = row!.split('|').map((c) => c.trim());
      expect(cells[2]).toBe(s.school === School.Support ? 'support' : 'battle');
      expect(cells[3]!.startsWith(String(s.rank))).toBe(true);
      expect(cells[4]!.startsWith(String(s.mana))).toBe(true);
      expect(cells[5]!.startsWith(`${s.cooldown / SEC} s`)).toBe(true);
      expect(cells[6]!.startsWith(`${s.range / M} m`)).toBe(true);
      expect(cells[7]).toBe(s.projectile ? 'yes' : 'no');
    }
    for (const r of MAGE_RANKS) expect(doc).toContain(`| Support mage | ${r.rank} ${r.name} | ${r.xp === 0 ? '0' : `${r.xp} (s)`} | ${r.health} (s) |`);
  });
});
