// Pictures for the command card (patch notes 1: "small images instead of
// words, crossed swords instead of Attack"). Plain commands map by action;
// the card's training, making, building and upgrade buttons ask for their
// own picture here with what they know (the product, the building, the kit).
// The words stay in the tooltip, which says a little more than the old face.
import { dreadnoughtOf, engineSpec, mageOf, productSpec, recipeSpec, Research, School, SPELLS, speciesSpec, Troop, troopOf, Product, RESEARCH_PRODUCT, type BuildingSpec } from '@blockyrts/sim';
import type { ButtonIcon, IconBadge } from './buttons.ts';
import { goodIcon } from './inventory-icons.ts';
import { BATTLE_MAGE_ICON, buildingIconFile, modelIconFile, SUPPORT_MAGE_ICON, troopIconFile, WORKER_ICON } from './unit-icons.ts';

const one = (file: string, badge?: IconBadge, tag?: string): ButtonIcon => ({ layers: [{ file }], ...(badge ? { badge } : {}), ...(tag ? { tag } : {}) });
/** Two pictures side by side, the first behind and to the left. */
const pair = (back: string, front: string, badge: IconBadge, backFilter?: string): ButtonIcon => ({
  layers: [{ file: back, shift: 'left', ...(backFilter ? { filter: backFilter } : {}) }, { file: front, shift: 'right' }],
  badge,
});

/** Two swords, one mirrored: crossed. */
export const ATTACK_ICON: ButtonIcon = { layers: [{ file: 'icon_cmd_attack' }, { file: 'icon_cmd_attack', mirror: true }] };

const ACTION_ICONS: Record<string, ButtonIcon> = {
  attack: ATTACK_ICON,
  patrol: one('icon_cmd_patrol'),
  move: one('icon_cmd_move'),
  gather: one('icon_cmd_gather'),
  returnCargo: one('icon_cmd_return_cargo'),
  repair: one('icon_cmd_repair'),
  dig: one('icon_cmd_dig'),
  prospect: one('icon_cmd_prospect'),
  build: one('icon_cmd_build_basic'),
  unload: one('icon_cmd_unload_all'),
  rally: one('icon_cmd_rally'),
  craft: one('icon_cmd_craft'),
  cancel: one('icon_cmd_cancel'),
  cancelBuild: one('icon_cmd_cancel'),
  back: one('icon_cmd_back'),
  hunt: one('icon_cmd_hunt'),
  eat: one('icon_food'),
  mageRank: one('icon_rank_mage_adept_acolyte', 'up'),
  hitch: one('icon_train_horse'),
  // Patch 2: the artillery crewman's Crew order shows the engine it goes to; its training button is its own bust.
  crew: one('icon_train_cannon'),
  trainCrewman: one(troopIconFile(Troop.Crew, 0)),
  // Patch 5: the Citadel's Build defense menu.
  buildDefense: one('icon_train_cannon'),
  // Patch 3: Retrain shows what the crewman becomes.
  retrain: one(WORKER_ICON, 'up'),
  cart: one('icon_hand_cart'),
  deeper: one('icon_cmd_dig', 'down'),
  shallower: one('icon_cmd_dig', 'up'),
  tunnel: one('icon_cmd_enter'),
  markArea: one('icon_cmd_dig', 'ok'),
  trainWorker: one(WORKER_ICON),
  trainSupportMage: one(SUPPORT_MAGE_ICON),
  trainBattleMage: one(BATTLE_MAGE_ICON),
};

const WALK_ICON: ButtonIcon = one('icon_cmd_move', undefined, 'Walk');
const RUN_ICON: ButtonIcon = { layers: [{ file: 'icon_cmd_move', shift: 'left' }, { file: 'icon_cmd_move', shift: 'right' }], tag: 'Run' };

/** A spell's picture: its own card icon (Table 13). */
export function spellIcon(spell: number): ButtonIcon | undefined {
  const s = SPELLS[spell];
  return s ? one(s.icon) : undefined;
}

/**
 * A command's picture by its action, for the buttons that did not get one of
 * their own. The face tells the few that change with the state apart: Done
 * against Cancel, Cart back, Let go, a page of a long menu.
 */
export function actionIcon(action: string, face: string): ButtonIcon | undefined {
  if (action === 'more') {
    const page = /(\d+\/\d+)/.exec(face)?.[1];
    return { layers: [{ file: 'icon_cmd_back', mirror: true }], ...(page ? { tag: page } : {}) };
  }
  if (action === 'cancel' && face === 'Done') return one('icon_cmd_cancel', 'ok');
  // Patch 5's Run/Walk: one boot walking, two boots running.
  if (action === 'pace') return face === 'Run' ? RUN_ICON : WALK_ICON;
  if (action === 'cart' && face !== 'Cart') return one('icon_hand_cart', 'down');
  if (action === 'hitch' && face === 'Let go') return one('icon_train_horse', 'cross');
  if (action.startsWith('spell')) return spellIcon(Number(action.slice(5)));
  return ACTION_ICONS[action];
}

/** Upgrade equipment (Jade's Patch 2): the weapon in front of the armour with the double arrow of the best (a worker's tools alone, a mage's wand before her robe). */
export function equipIcon(kind: 'worker' | 'warrior' | 'mage'): ButtonIcon {
  if (kind === 'worker') return one('icon_tool_set_bronze', 'max');
  if (kind === 'mage') return pair('icon_robe_3', 'icon_wand_adept_acolyte', 'max');
  return pair('icon_armour_bronze_scale', 'icon_sword_iron_wrought', 'max');
}

/** A research step's picture (the kit draws the main ones; the rest show the lodge's books). */
const RESEARCH_ICONS: Partial<Record<number, string>> = {
  [Research.FlintTools]: 'icon_research_flint_tools',
  [Research.Bronze]: 'icon_research_bronze',
  [Research.DeepMining1]: 'icon_research_mineshaft_1',
  [Research.DeepMining2]: 'icon_research_mineshaft_2',
  [Research.DeepMining3]: 'icon_research_mineshaft_3',
  [Research.Halberds]: 'icon_research_halberds',
  [Research.Crossbows]: 'icon_research_crossbows',
  [Research.Hexcraft]: 'icon_hexstone',
  [Research.SiegeEngines]: 'icon_research_siege_engines',
  [Research.Steel]: 'icon_research_steel',
  [Research.CarbonSteel]: 'icon_research_hq_steel',
  [Research.SteelCrossbow]: 'icon_research_steel_crossbow',
  [Research.Gunpowder]: 'icon_research_gunpowder',
  [Research.Muskets]: 'icon_research_muskets',
  [Research.Cannons]: 'icon_research_cannons',
};

/** What a product's button shows: the unit it trains, the good it makes, the step it researches, the engine it builds. */
export function productIcon(product: number): ButtonIcon | undefined {
  if (product === Product.Worker) return one(WORKER_ICON);
  if (product === Product.SupportMage) return one(SUPPORT_MAGE_ICON);
  if (product === Product.BattleMage) return one(BATTLE_MAGE_ICON);
  if (product === Product.Crewman || product === Product.GarrisonCrewman) return one(troopIconFile(Troop.Crew, 0));
  const t = troopOf(product);
  if (t) return one(troopIconFile(t.troop, t.w));
  if (dreadnoughtOf(product)) return one(troopIconFile(Troop.Dreadnought, 0));
  const m = mageOf(product);
  if (m) return one(m.school === School.Battle ? BATTLE_MAGE_ICON : SUPPORT_MAGE_ICON);
  if (product < RESEARCH_PRODUCT) return undefined;
  const ps = productSpec(product);
  if (ps.research !== undefined) return one(RESEARCH_ICONS[ps.research] ?? 'icon_scriptorium');
  if (ps.engine !== undefined) {
    // A fixed engine shows the engine it is built from (Patch 5); an upgrade has the arrow.
    const spec = engineSpec(ps.engine);
    return one(modelIconFile(engineSpec(spec.mobile >= 0 ? spec.mobile : spec.id).model), ps.upgrade !== undefined ? 'up' : undefined);
  }
  if (ps.slaughter !== undefined) return one(modelIconFile(speciesSpec(ps.slaughter).model));
  if (ps.recipe !== undefined) {
    const out = recipeSpec(ps.recipe).outputs[0]?.[0];
    const icon = out === undefined ? undefined : goodIcon(out);
    return icon ? { layers: [{ file: icon.file, ...(icon.tint ? { filter: icon.tint } : {}) }] } : undefined;
  }
  return undefined;
}

/** A building's button in a build menu: the building's picture. */
export function buildIcon(spec: BuildingSpec): ButtonIcon {
  return one(buildingIconFile(spec.kind, 1));
}

/** A building's Upgrade button: the next level's picture with an arrow. */
export function buildingUpgradeIcon(kind: number, nextLevel: number): ButtonIcon {
  return one(buildingIconFile(kind, nextLevel), 'up');
}

/** A troop type's training button: the bust for the kit it would train now. */
export function trainTroopIcon(troop: number, wTier: number): ButtonIcon {
  return one(troopIconFile(troop, wTier));
}
