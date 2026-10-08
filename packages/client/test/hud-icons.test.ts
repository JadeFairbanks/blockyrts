// Patch notes 1, HUD: pictures instead of words on the command card, one
// picture per kind of unit and building everywhere (selection grid, queue,
// training buttons), the doing-now marker, and the queue's live countdown.
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
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
import { actionIcon, equipIcon, productIcon, spellIcon } from '../src/hud/card-icons.ts';
import { doingActions, orderAction } from '../src/hud/doing.ts';
import { troopPanelFiles } from '../src/hud/icons.ts';
import { hasKit } from '../src/hud/kit-icons.ts';
import { queueSeconds, queueText, timeWords } from '../src/hud/queue-clock.ts';
import { buildingIconFile, modelIconFile, selectableIconFile, troopIconFile } from '../src/hud/unit-icons.ts';

const drawn = (icon: ButtonIcon | undefined, what: string): void => {
  expect(icon, what).toBeDefined();
  for (const l of icon!.layers) expect(hasKit(l.file), `${what}: ${l.file}`).toBe(true);
};

describe('one picture per thing', () => {
  it('draws every building at every level', () => {
    for (const kind of Object.values(BuildingKind)) {
      for (let level = 1; level <= 10; level++) expect(hasKit(buildingIconFile(kind, level)), `kind ${kind} level ${level}`).toBe(true);
    }
    // Patch 5: the main base's four tiers are drawn as the old levels 1, 3, 6 and 10.
    expect(buildingIconFile(BuildingKind.MainBase, 2)).toBe('icon_main_base_l3');
    expect(buildingIconFile(BuildingKind.MainBase, 4)).toBe('icon_main_base_l10');
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

  it('draws every command, each spell of ours and Upgrade equipment', () => {
    const actions = [
      'attack', 'patrol', 'move', 'gather', 'returnCargo', 'repair', 'dig', 'prospect', 'build', 'port',
      'unload', 'rally', 'craft', 'cancel', 'cancelBuild', 'back', 'hunt', 'eat', 'mageRank', 'retrain', 'hitch',
      'cart', 'deeper', 'shallower', 'tunnel', 'markArea', 'trainWorker', 'trainSupportMage', 'trainBattleMage',
    ];
    for (const a of actions) drawn(actionIcon(a, ''), a);
    // Jade's Patch 2 cuts Stop, Hold, Enter, the lock, Cannon crew and the two build menus' own buttons; Patch 3 a worker's rank training.
    for (const a of ['stop', 'hold', 'enter', 'lock', 'train', 'buildBasic', 'buildAdvanced', 'rankUp']) expect(actionIcon(a, ''), a).toBeUndefined();
    drawn(actionIcon('more', 'More 2/3'), 'more');
    expect(actionIcon('more', 'More 2/3')!.tag).toBe('2/3');
    expect(actionIcon('cancel', 'Done')!.badge).toBe('ok');
    for (const s of SPELLS) if (s.school !== School.Grove) drawn(spellIcon(s.id), s.name);
    for (const kind of ['worker', 'warrior', 'mage'] as const) {
      drawn(equipIcon(kind), `${kind} equipment`);
      expect(equipIcon(kind).badge).toBe('max');
    }
    // The weapon in front, the armour behind, each shifted to its side.
    expect(equipIcon('warrior').layers.map((l) => l.shift)).toEqual(['left', 'right']);
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
    expect(orderAction({ t: 'kitUp', line: Line.Armour } as never, 'warrior')).toBe('equip');
    expect(orderAction({ t: 'build' } as never, 'worker')).toBe('build');
    expect(orderAction({ t: 'port' } as never, 'engine:7')).toBe('port');
    expect(orderAction({ t: 'hold' } as never, 'warrior')).toBeNull();
    expect(orderAction({ t: 'train' } as never, 'mage:battle')).toBe('mageRank');
    // A worker's train order (from a save before Patch 3) marks nothing; an artillery crewman retraining marks Retrain.
    expect(orderAction({ t: 'train' } as never, 'worker')).toBeNull();
    expect(orderAction({ t: 'retrain', b: 0 } as never, 'warrior:crew')).toBe('retrain');
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

  it('counts down from the steps left the sim sends, and is on hold when it sends none', () => {
    expect(queueSeconds(40 * S, 0)).toBe(40);
    // Steps run since the sim said so are already spent.
    expect(queueSeconds(40 * S, S / 2)).toBe(39.5);
    expect(queueSeconds(5, 100)).toBe(0);
    expect(queueSeconds(0, 0)).toBeNull();
  });
});
