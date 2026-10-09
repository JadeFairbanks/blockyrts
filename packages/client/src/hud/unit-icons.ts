// One picture per kind of unit and building, the same in the selection grid,
// the production queue and the training buttons (patch notes 1: "the queue
// icon matches the unit's selection icon"; no more letters for workers and
// mages). Troops show their weapon: the kit's training busts by troop type
// and weapon tier. Creatures, animals and the peoples use their portraits.
import { BuildingKind, engineSpec, MAIN_BASE_TIER_LEVELS, mobSpec, peopleUnitSpec, School, speciesSpec, Troop, weaponTiers, type GodSpawn } from '@blockyrts/sim';
import { firstKit } from './kit-icons.ts';

/** A troop's picture by type and weapon tier (Troops and gear: the weapon ladders). */
export function troopIconFile(troop: number, wTier: number): string {
  switch (troop) {
    case Troop.Close:
      return wTier <= 1 ? 'icon_train_warrior_club' : wTier === 2 ? 'icon_train_warrior_axe' : 'icon_train_warrior_sword';
    case Troop.Long:
      return wTier >= 7 ? 'icon_train_warrior_halberd' : wTier === 6 ? 'icon_train_warrior_pike' : 'icon_train_warrior_spear';
    case Troop.Ranger:
      return wTier >= 8 ? 'icon_train_warrior_musket' : wTier === 7 ? 'icon_train_warrior_crossbow' : wTier >= 2 ? 'icon_train_warrior_bow' : 'icon_train_warrior_sling';
    case Troop.Brawler:
      return 'icon_train_warrior_mace';
    case Troop.Cavalry:
      return 'icon_train_warrior_mounted';
    case Troop.Crew:
      return 'icon_train_warrior_cannon_crew';
    case Troop.Dreadnought:
      // Patch 5: the brawler's mace-man stands in until the Dreadnought has a picture of his own.
      return 'icon_train_warrior_mace';
    default:
      return 'icon_train_warrior_club';
  }
}

export const WORKER_ICON = 'icon_train_worker_labourer';
export const SUPPORT_MAGE_ICON = 'icon_train_mage_support';
export const BATTLE_MAGE_ICON = 'icon_train_mage_battle';

/** Models the kit has no picture of, and the nearest it has (the catalogue borrows the hen for the wild birds too). */
const MODEL_STAND_INS: Record<string, string> = {
  wild_goose: 'portrait_hen',
  pheasant: 'portrait_hen',
  cannon_bronze: 'icon_train_cannon',
  cannon_iron: 'icon_train_cannon',
  cannon_dwarf: 'icon_train_cannon',
  dwarf_cannon_crew: 'icon_train_warrior_cannon_crew',
  bomb_keg: 'icon_gunpowder',
};

/**
 * A catalogue model's picture: its portrait, or a near one for a model named
 * with a prefix (chicken_hen is the hen). Lairs and the peoples' buildings
 * have none: their portrait is the rendered still.
 */
export function modelIconFile(model: string): string {
  const bare = model.replace(/^(chicken|fish|wild)_/, '');
  return firstKit(`icon_train_${bare}`, `portrait_${model}`, `portrait_${bare}`, MODEL_STAND_INS[model] ?? '');
}

/** A building's picture by kind and level (the main base's tiers). */
export function buildingIconFile(kind: number, level: number): string {
  const l = Math.max(1, level);
  switch (kind) {
    case BuildingKind.MainBase:
      // Patch 5: four tiers, each drawn as the old level it stands on.
      return `icon_main_base_l${MAIN_BASE_TIER_LEVELS[Math.min(l, MAIN_BASE_TIER_LEVELS.length) - 1]!}`;
    case BuildingKind.Farm:
      return 'icon_crop_field_t1';
    case BuildingKind.Barn:
      // The pen and barn's picture stands in until the red barn's comes (Patch 2).
      return 'icon_pen_barn';
    case BuildingKind.Storehouse:
      return 'icon_storehouse';
    case BuildingKind.FishingDock:
      return 'icon_fishing_dock';
    case BuildingKind.Wall:
      return 'icon_wall_softwood';
    case BuildingKind.WallHardwood:
      return 'icon_wall_hardwood';
    case BuildingKind.WallStone:
      return 'icon_wall_stone';
    case BuildingKind.Gate:
      return 'icon_gate_softwood';
    case BuildingKind.GateHardwood:
      return 'icon_gate_hardwood';
    case BuildingKind.GateStone:
      return 'icon_gate_stone';
    case BuildingKind.Tower:
      return 'icon_tower_softwood';
    case BuildingKind.TowerHardwood:
      return 'icon_tower_hardwood';
    case BuildingKind.TowerStone:
      return 'icon_tower_stone';
    case BuildingKind.Workshop:
      return 'icon_workshop_t1';
    case BuildingKind.TorchPost:
      return 'icon_torch_post';
    case BuildingKind.Bonfire:
      // The campfire's picture stands in until the bonfire has its own.
      return 'icon_cooking_campfire';
    case BuildingKind.ScholarsLodge:
      return 'icon_scholars_lodge';
    case BuildingKind.MagiSanctum:
      return 'icon_magi_sanctum';
    case BuildingKind.Barracks:
      return 'icon_barracks';
    case BuildingKind.ArtilleryWorkshop:
      // The gunnery yard's picture stands in, as its model does (Patch 2).
      return 'icon_gunnery_yard';
    case BuildingKind.Mineshaft:
      return 'icon_mineshaft_t1';
    case BuildingKind.Forge:
      return 'icon_forge_l1';
    case BuildingKind.Tavern:
      // Patch 5: the timber farmhouse's picture stands in until the Tavern has its own.
      return 'icon_farmhouse_t2';
    default:
      return 'icon_storehouse';
  }
}

/** What a unit reads for its picture: the troop type and weapon tier of a warrior. */
export interface UnitLook {
  troop: number;
  wTier: number;
}

/**
 * A selectable's picture by its type key (selection/types.ts and the world
 * view's keys): 'worker', 'warrior', 'mage:support', 'building:kind:level',
 * 'engine:id', 'animal:wild|own:id', 'mob:id', 'people:mob', 'merc:mob',
 * 'peoples:mob' and 'ruin:mob'. A warrior needs its kit (`look`). Resource
 * nodes and anything unknown have none ('').
 */
export function selectableIconFile(typeKey: string, look?: UnitLook | null): string {
  if (typeKey === 'worker') return WORKER_ICON;
  if (typeKey === 'warrior') return troopIconFile(look?.troop ?? Troop.Close, look?.wTier ?? 1);
  if (typeKey === 'warrior:crew') return troopIconFile(Troop.Crew, 0);
  if (typeKey === 'warrior:dreadnought') return troopIconFile(Troop.Dreadnought, 0);
  if (typeKey === 'mage:support') return SUPPORT_MAGE_ICON;
  if (typeKey === 'mage:battle') return BATTLE_MAGE_ICON;
  const [head, a, b] = typeKey.split(':');
  const n = Number(head === 'animal' ? b : a);
  switch (head) {
    case 'building':
      return buildingIconFile(Number(a), Number(b));
    case 'engine':
      return modelIconFile(engineSpec(n).model);
    case 'animal':
      return modelIconFile(speciesSpec(n).model);
    case 'mob':
    case 'peoples':
    case 'ruin':
      return modelIconFile(mobSpec(n).model);
    case 'people':
    case 'merc':
      return modelIconFile(peopleUnitSpec(n).model);
    default:
      return '';
  }
}

/** The picture of something godmode places (the debugger's spawn grid, Jade's Patch 5): the players' units as their training buttons show them, the rest by their model ('' for none). */
export function godSpawnIconFile(g: GodSpawn): string {
  switch (g.what) {
    case 'worker':
      return WORKER_ICON;
    case 'troop':
      return troopIconFile(g.id, weaponTiers(g.id)[1]);
    case 'mage':
      return g.id === School.Battle ? BATTLE_MAGE_ICON : SUPPORT_MAGE_ICON;
    case 'crewman':
      return troopIconFile(Troop.Crew, 0);
    default:
      return modelIconFile(g.model);
  }
}
