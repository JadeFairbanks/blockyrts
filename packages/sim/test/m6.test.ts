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
  FOODS,
  hashState,
  isLit,
  knowsSpell,
  Line,
  MAGE_RANK_TRAINING,
  MAGE_RANKS,
  manaCap,
  MANA_SCALE,
  mageProduct,
  Mob,
  placeBuilding,
  pendingKitUp,
  Product,
  productProblem,
  Res,
  Research,
  RESEARCH_PRODUCT,
  ROBE_GEAR,
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
  upgradeProgress,
  WAND_GEAR,
  WAND_KITS,
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
  it('trains a Novice Acolyte for 50 food, a hazel wand and a homespun robe in 60 s and the kit\'s 20 s', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    // Patch 2: the Sanctum trains from its cards, with the wand and robe picked (tier 1 of each here).
    const hazel = mageProduct(School.Battle, 1, 1);
    expect(productProblem(s, b, Product.BattleMage)).toBe('This building cannot make that.');
    // Troops and gear: the kit is paid from the pool when she is queued; without it, the reason.
    p.pool[Res.Sticks] = 0;
    p.pool[Res.Flax] = 6;
    p.pool[Res.Venison] = 200;
    expect(productProblem(s, b, hazel)).toMatch(/^Not enough resources/);
    p.pool[Res.Sticks] = 20;
    expect(productProblem(s, b, hazel)).toBe('');
    const food = (): number => FOODS.reduce<number>((n, f) => n + p.pool[f]!, 0);
    const before = food();
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: hazel, count: 1 }]);
    expect(p.pool[Res.Sticks]).toBe(15);
    expect(p.pool[Res.Flax]).toBe(3);
    expect(food()).toBeLessThan(before);
    const took = runUntil(s, () => mages(s).length > 0, 80 * SEC + 5);
    expect(took).toBeGreaterThanOrEqual(80 * SEC - 2);
    const [m] = mages(s);
    const e = s.entities;
    expect(e.school[m!]).toBe(School.Battle);
    expect(e.rank[m!]).toBe(1);
    expect(e.hp[m!]).toBe(70);
    expect(e.mana[m!]).toBe(100 * MANA_SCALE);
    expect([e.wTier[m!], e.aTier[m!]]).toEqual([1, 1]);
    expect(e.weapon[m!]).toBe(WAND_GEAR[1]);
    expect(e.armour[m!]).toBe(ROBE_GEAR[1]);
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

  it('trains a mage to Acolyte, and to Mage for 2 mana crystals once her experience is banked; no rank wand', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    p.pool[Res.Venison] = 200;
    p.pool[Res.ManaCrystal] = 0;
    const [x, z] = buildingCentre(b);
    const m = addMage(s, 0, x + 8 * M, z, School.Support);
    const e = s.entities;
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    runUntil(s, () => e.rank[m] === 2, 90 * SEC);
    expect(e.maxHp[m]).toBe(80);
    // Mage needs 300 experience.
    setMageRank(s, m, 3);
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    run(s, 40);
    expect(e.rank[m]).toBe(3);
    // Banked, but no crystals: she is sent back with the reason.
    e.xp[m] = MAGE_RANKS[3]!.xp * 10;
    const texts: string[] = [];
    step(s, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    texts.push(...s.events.map((ev) => ev.text));
    for (let k = 0; k < 20 * SEC && !texts.some((t) => t.includes('mana crystals')); k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(texts).toContain('Training a support mage to Mage needs 2 mana crystals.');
    expect(e.rank[m]).toBe(3);
    // With 2 crystals she trains; the crystals are spent and her wand is the one she had.
    p.pool[Res.ManaCrystal] = 3;
    const wand = e.weapon[m]!;
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: b.id }]);
    runUntil(s, () => e.rank[m] === 4, 60 * SEC);
    expect(p.pool[Res.ManaCrystal]).toBe(1);
    expect(e.weapon[m]).toBe(wand);
    expect(e.wTier[m]).toBe(1);
    expect(e.maxHp[m]).toBe(100);
  });

  it('pays 2, 5 and 10 mana crystals for the ranks from Mage up, and no food', () => {
    const combat = MAGE_RANK_TRAINING.filter((t) => t.combat);
    expect(combat.map((t) => [t.rank, t.crystals, t.food])).toEqual([
      [4, 2, 0],
      [5, 5, 0],
      [6, 10, 0],
    ]);
  });

  it('upgrades a mage\'s wand at a Magi Sanctum: paid when ordered, half the wand\'s make time beside it', () => {
    const s = createPeaceful();
    const b = sanctum(s);
    const p = s.players[0]!;
    // The copper-tipped wand needs a Casting Hearth; this one stands far off, so the Sanctum is nearer.
    const base = bigHouse(s);
    placeBuilding(s, 0, BuildingKind.Forge, 0, base.x - 60, base.z, true);
    const [x, z] = buildingCentre(b);
    const m = addMage(s, 0, x + 8 * M, z, School.Battle);
    const e = s.entities;
    const id = e.id[m]!;
    p.pool[Res.Sticks] = 5;
    p.pool[Res.CopperIngot] = 0;
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [id], line: Line.Weapon, max: 0 }]);
    expect(pendingKitUp(s, m, Line.Weapon)).toBeUndefined();
    p.pool[Res.CopperIngot] = 1;
    const cap = manaCap(s, m);
    run(s, 1, [{ kind: 'upgradeKit', player: 0, units: [id], line: Line.Weapon, max: 0 }]);
    const o = pendingKitUp(s, m, Line.Weapon)!;
    expect(o.b).toBe(b.id);
    expect([p.pool[Res.Sticks], p.pool[Res.CopperIngot]]).toEqual([0, 0]);
    runUntil(s, () => upgradeProgress(s, m)[1] > 0, 30 * SEC);
    expect(upgradeProgress(s, m)[1]).toBe((WAND_KITS[2]!.timeS * SEC) / 2);
    runUntil(s, () => e.wTier[m] === 2, 20 * SEC);
    expect(e.weapon[m]).toBe(WAND_GEAR[2]);
    expect(e.aTier[m]).toBe(1);
    expect(manaCap(s, m)).toBe(cap + WAND_KITS[2]!.mana * MANA_SCALE);
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

describe('the cast order', () => {
  it('sends one mage with the mana, walks her into range, and double-tapped sends every mage', () => {
    const s = createPeaceful();
    const e = s.entities;
    const w = warrior(s);
    const a = addMage(s, 0, e.x[w]! + 2 * M, e.z[w]!, School.Support);
    const b = addMage(s, 0, e.x[w]! - 2 * M, e.z[w]!, School.Support);
    const battle = addMage(s, 0, e.x[w]!, e.z[w]! + 2 * M, School.Battle);
    setMageRank(s, a, 2);
    setMageRank(s, b, 2);
    // The nearer mage is short of mana, so the other one goes.
    e.mana[a] = 5 * MANA_SCALE;
    const ids = [a, b, battle].map((i) => e.id[i]!);
    run(s, 1, [{ kind: 'cast', player: 0, units: ids, spell: Spell.Quicken, target: e.id[w]!, x: 0, z: 0, auto: 0 }]);
    runUntil(s, () => e.quickUntil[w]! > s.step, 3 * SEC);
    expect(spellReadyAt(s, b, Spell.Quicken)).toBeGreaterThan(0);
    expect(spellReadyAt(s, a, Spell.Quicken)).toBe(0);
    expect(e.mana[a]).toBeLessThan(15 * MANA_SCALE);

    // A target 30 m off: she walks until it is in range, then casts.
    e.quickUntil[w] = 0;
    e.x[w] = e.x[w]! + 30 * M;
    e.mana[a] = 100 * MANA_SCALE;
    e.hp[w] = 40;
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[a]!], spell: Spell.Heal, target: e.id[w]!, x: 0, z: 0, auto: 0 }]);
    const x0 = e.x[a]!;
    runUntil(s, () => e.healLeft[w]! > 0 || e.hp[w]! > 40, 20 * SEC);
    expect(e.x[a]!).toBeGreaterThan(x0 + 10 * M);

    // Double-tapped Heal: every support mage that knows it picks a target herself.
    run(s, 1, [{ kind: 'cast', player: 0, units: ids, spell: Spell.Heal, target: 0, x: 0, z: 0, auto: 1 }]);
    expect(e.queue[a]!.length + e.queue[b]!.length).toBeGreaterThan(0);
    expect(e.queue[battle]!.some((o) => o.t === 'cast')).toBe(false);
  });

  it('tells the player when none of the mages knows the spell', () => {
    const s = createPeaceful();
    const e = s.entities;
    const w = warrior(s);
    const m = addMage(s, 0, e.x[w]! + 2 * M, e.z[w]!, School.Battle);
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[m]!], spell: Spell.Fireball, target: e.id[w]!, x: 0, z: 0, auto: 0 }]);
    expect(s.events.some((v) => v.kind === 'alert' && v.text === 'Learned at rank 3.')).toBe(true);
    expect(e.queue[m]!.length).toBe(0);
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
    const lines = doc.slice(head, doc.indexOf('\n\n', head)).split('\n');
    const header = lines[0]!.split('|').map((c) => c.replace(/\*/g, '').trim());
    // Columns by their header, so a column added to the table (the keys) does not shift the checks.
    const col = (name: string): number => header.findIndex((h) => h === name || h.startsWith(`${name} (`));
    const rows = lines.slice(2);
    // The players' spells are the table's rows; the Grovesinger's five are its own row below it (milestone 7).
    const players = SPELLS.filter((s) => s.school !== School.Grove);
    expect(rows.length).toBe(players.length);
    for (const s of players) {
      const row = rows.find((r) => r.startsWith(`| ${s.name} (${s.clip})`));
      expect(row, s.name).toBeDefined();
      const cells = row!.split('|').map((c) => c.trim());
      const at = (name: string): string => cells[col(name)]!;
      expect(at('Mage')).toBe(s.school === School.Support ? 'support' : 'battle');
      expect(at('From rank').startsWith(String(s.rank))).toBe(true);
      expect(at('Mana').startsWith(String(s.mana))).toBe(true);
      expect(at('Cooldown').startsWith(`${s.cooldown / SEC} s`)).toBe(true);
      expect(at('Range').startsWith(`${s.range / M} m`)).toBe(true);
      expect(at('Projectile')).toBe(s.projectile ? 'yes' : 'no');
    }
    for (const r of MAGE_RANKS) expect(doc).toContain(`| Support mage | ${r.rank} ${r.name} | ${r.xp === 0 ? '0' : `${r.xp} (s)`} | ${r.health} (s) |`);
  });
});
