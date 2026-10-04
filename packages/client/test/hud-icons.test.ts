// Patch notes 1, HUD: pictures instead of words on the command card, one
// picture per kind of unit and building everywhere (selection grid, queue,
// training buttons), the doing-now marker, and the queue's live countdown.
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  CRAFT_PACE,
  ENGINE_PRODUCT,
  ENGINES,
  Line,
  MOBS,
  PEOPLE_UNITS,
  Product,
  RECIPE_PRODUCT,
  RECIPES,
  RESEARCH,
  RESEARCH_PRODUCT,
  School,
  SLAUGHTER_PRODUCT,
  SLAUGHTERED,
  SPECIES,
  SPELLS,
  STEPS_PER_SECOND,
  Troop,
  TROOP_TYPES,
  troopProduct,
} from '@blockyrts/sim';
import type { ButtonIcon } from '../src/hud/buttons.ts';
import { actionIcon, productIcon, spellIcon, upgradeIcon } from '../src/hud/card-icons.ts';
import { doingActions, orderAction } from '../src/hud/doing.ts';
import { troopPanelFiles } from '../src/hud/icons.ts';
import { hasKit } from '../src/hud/kit-icons.ts';
import { guessSteps, QueueClock, queueText, STALL_STEPS, timeWords } from '../src/hud/queue-clock.ts';
import { buildingIconFile, modelIconFile, selectableIconFile, troopIconFile } from '../src/hud/unit-icons.ts';

const drawn = (icon: ButtonIcon | undefined, what: string): void => {
  expect(icon, what).toBeDefined();
  for (const l of icon!.layers) expect(hasKit(l.file), `${what}: ${l.file}`).toBe(true);
};

describe('one picture per thing', () => {
  it('draws every building at every level, and each earthwork', () => {
    for (const kind of Object.values(BuildingKind)) {
      for (let level = 1; level <= 10; level++) expect(hasKit(buildingIconFile(kind, level)), `kind ${kind} level ${level}`).toBe(true);
    }
    for (let v = 0; v < 5; v++) expect(hasKit(buildingIconFile(BuildingKind.Earthworks, 1, v))).toBe(true);
    expect(buildingIconFile(BuildingKind.MainBase, 4)).toBe('icon_main_base_l4');
    // Patch 2: only the main base keeps levels; every other building has its one picture.
    expect(buildingIconFile(BuildingKind.Forge, 9)).toBe('icon_forge_l1');
  });

  it('draws every troop type at every weapon tier, and the troop panel pieces', () => {
    for (const t of TROOP_TYPES) for (let w = 0; w <= 8; w++) expect(hasKit(troopIconFile(t, w)), `troop ${t} tier ${w}`).toBe(true);
    for (const f of troopPanelFiles()) expect(hasKit(f), f).toBe(true);
    expect(troopIconFile(Troop.Ranger, 1)).toBe('icon_train_warrior_sling');
    expect(troopIconFile(Troop.Ranger, 7)).toBe('icon_train_warrior_crossbow');
    expect(troopIconFile(Troop.Long, 6)).toBe('icon_train_warrior_pike');
  });

  it('shows the same picture in the queue as in the selection grid (no letters for workers and mages)', () => {
    expect(productIcon(Product.Worker)!.layers[0]!.file).toBe(selectableIconFile('worker'));
    expect(productIcon(Product.SupportMage)!.layers[0]!.file).toBe(selectableIconFile('mage:support'));
    expect(productIcon(Product.BattleMage)!.layers[0]!.file).toBe(selectableIconFile('mage:battle'));
    for (const t of TROOP_TYPES) {
      for (const w of [1, 4, 8]) {
        expect(productIcon(troopProduct(t, w, 2))!.layers[0]!.file, `troop ${t} tier ${w}`).toBe(selectableIconFile('warrior', { troop: t, wTier: w }));
      }
    }
  });

  it('draws everything a building can make', () => {
    const products = [
      Product.Worker,
      Product.SupportMage,
      Product.BattleMage,
      ...RESEARCH.map((_, i) => RESEARCH_PRODUCT + i),
      ...RECIPES.map((_, i) => RECIPE_PRODUCT + i),
      ...SLAUGHTERED.map((s) => SLAUGHTER_PRODUCT + s),
      ...ENGINES.map((_, i) => ENGINE_PRODUCT + i),
    ];
    for (const p of products) drawn(productIcon(p), `product ${p}`);
  });

  it('draws every unit and animal, ours, the peoples and the creatures', () => {
    for (const s of SPECIES) expect(modelIconFile(s.model), s.name).not.toBe('');
    for (const u of PEOPLE_UNITS) expect(modelIconFile(u.model), u.name).not.toBe('');
    for (const e of ENGINES) expect(modelIconFile(e.model), e.name).not.toBe('');
    // Lairs and the peoples' buildings are drawn by the portrait's still render instead.
    const structure = /^(lair_|goblin_(hut|fire|totem|wolf_pen)|halfling_|runkin_(tent|drying|wolf_den|fire)|elf_(hall|tree|bear_pen|gate|caravan)|dwarf_(house|forge|mineshaft|hall|city))/;
    for (const m of MOBS) if (!structure.test(m.model)) expect(modelIconFile(m.model), m.name).not.toBe('');
  });

  it('draws every command, each spell of ours and the upgrades', () => {
    const actions = [
      'attack', 'stop', 'hold', 'patrol', 'move', 'gather', 'returnCargo', 'repair', 'dig', 'prospect', 'build',
      'enter', 'unload', 'rally', 'craft', 'cancel', 'cancelBuild', 'back', 'hunt', 'eat', 'rankUp', 'mageRank', 'train', 'hitch',
      'cart', 'deeper', 'shallower', 'tunnel', 'markArea', 'trainWorker', 'trainSupportMage', 'trainBattleMage',
    ];
    for (const a of actions) drawn(actionIcon(a, ''), a);
    for (const face of ['Auto', 'Melee', 'Ranged']) drawn(actionIcon('lock', face), `lock ${face}`);
    drawn(actionIcon('more', 'More 2/3'), 'more');
    expect(actionIcon('more', 'More 2/3')!.tag).toBe('2/3');
    expect(actionIcon('cancel', 'Done')!.badge).toBe('ok');
    for (const s of SPELLS) if (s.school !== School.Grove) drawn(spellIcon(s.id), s.name);
    for (const kind of ['worker', 'warrior', 'mage'] as const) {
      for (const weapon of [true, false]) {
        drawn(upgradeIcon(kind, weapon, false), `${kind} upgrade`);
        expect(upgradeIcon(kind, weapon, true).badge).toBe('max');
      }
    }
  });

  it('crosses two swords for Attack', () => {
    const a = actionIcon('attack', 'Attack')!;
    expect(a.layers).toHaveLength(2);
    expect(a.layers[1]!.mirror).toBe(true);
  });
});

describe('the doing-now marker', () => {
  it('marks the action of each unit\'s current order', () => {
    expect(orderAction({ t: 'attackMove', x: 0, z: 0 } as never, 'warrior')).toBe('attack');
    expect(orderAction({ t: 'dropoff' } as never, 'worker')).toBe('gather');
    expect(orderAction({ t: 'kitUp', line: Line.Armour } as never, 'warrior')).toBe('upgradeArmour');
    expect(orderAction({ t: 'train' } as never, 'mage:battle')).toBe('mageRank');
    expect(orderAction({ t: 'train' } as never, 'worker')).toBe('rankUp');
    expect(orderAction(undefined, 'worker')).toBeNull();
  });

  it('collects one mark per action over the subgroup, none for idle units', () => {
    const set = doingActions([{ t: 'move' } as never, undefined, { t: 'gather' } as never, { t: 'follow' } as never], 'worker');
    expect([...set].sort()).toEqual(['gather', 'move']);
  });
});

describe('the queue countdown', () => {
  const S = STEPS_PER_SECOND;

  it('reads the words the patch notes ask for, with no percentage', () => {
    expect(queueText(true, 12.2)).toBe('Complete in 13 seconds. Click to cancel; full refund.');
    expect(queueText(true, 0.4)).toBe('Complete in 1 second. Click to cancel; full refund.');
    expect(queueText(false, 5)).toBe('Waiting in the queue. Click to cancel; full refund.');
    expect(queueText(true, null)).toMatch(/^On hold/);
    expect(queueText(true, 30)).not.toMatch(/%/);
  });

  it('says long times in minutes and seconds, singular where it is one', () => {
    expect(timeWords(119)).toBe('119 seconds');
    expect(timeWords(120)).toBe('2 minutes');
    expect(timeWords(181)).toBe('3 minutes 1 second');
    expect(timeWords(0)).toBe('0 seconds');
  });

  it('guesses from the item\'s own time until the pace is seen, then counts down from the pace', () => {
    const c = new QueueClock();
    expect(c.secondsLeft(7, Product.Worker, 0, 100, 40 * S)).toBe(40);
    // 10 per mille a second: one change sets the baseline, the next the pace.
    c.note(7, Product.Worker, 0, 100);
    c.note(7, Product.Worker, 10, 100 + S);
    c.note(7, Product.Worker, 20, 100 + 2 * S);
    expect(c.secondsLeft(7, Product.Worker, 20, 100 + 2 * S, null)).toBeCloseTo(98, 5);
    // Half a second later with no new change it still counts down.
    expect(c.secondsLeft(7, Product.Worker, 20, 100 + 2 * S + S / 2, null)).toBeCloseTo(97.5, 5);
  });

  it('goes on hold when the item stops moving, and starts over for a new item', () => {
    const c = new QueueClock();
    c.note(3, Product.Worker, 0, 0);
    c.note(3, Product.Worker, 100, S);
    c.note(3, Product.Worker, 200, 2 * S);
    expect(c.secondsLeft(3, Product.Worker, 200, 2 * S + STALL_STEPS + 1, null)).toBeNull();
    c.note(3, Product.SupportMage, 0, 3 * S);
    expect(c.secondsLeft(3, Product.SupportMage, 0, 3 * S, 50 * S)).toBe(50);
    c.keep(new Set());
    expect(c.secondsLeft(3, Product.SupportMage, 0, 3 * S, null)).toBeNull();
  });

  it('times crafting at the workerless pace and the main base\'s rope at its own (Patch 2: no hands needed)', () => {
    const rope = RECIPES.find((r) => r.name === 'Rope')!;
    expect(guessSteps(RECIPE_PRODUCT + rope.id, BuildingKind.Workshop)).toBe(rope.steps / CRAFT_PACE);
    expect(guessSteps(RECIPE_PRODUCT + rope.id, BuildingKind.MainBase)).toBe(rope.steps);
    expect(guessSteps(Product.Worker, BuildingKind.MainBase)).toBeGreaterThan(0);
  });
});
