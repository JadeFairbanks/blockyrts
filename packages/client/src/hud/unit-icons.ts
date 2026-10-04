// One picture per kind of unit and building, the same in the selection grid,
// the production queue and the training buttons (patch notes 1: "the queue
// icon matches the unit's selection icon"; no more letters for workers and
// mages). Troops show their weapon: the kit's training busts by troop type
// and weapon tier. Creatures, animals and the peoples use their portraits.
import { BuildingKind, engineSpec, mobSpec, peopleUnitSpec, speciesSpec, Troop } from '@blockyrts/sim';
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

/** A building's picture by kind, level and (earthworks, farms) variant. */
export function buildingIconFile(kind: number, level: number, variant = 0): string {
  const l = Math.max(1, level);
  const tier = (base: string, most: number): string => `icon_${base}${Math.min(l, most)}`;
  switch (kind) {
    case BuildingKind.MainBase:
      return tier('main_base_l', 10);
    case BuildingKind.CropField:
      return tier('crop_field_t', 3);
    case BuildingKind.VegetableFarm:
      return tier('vegetable_farm_t', 3);
    case BuildingKind.HerbBed:
      return tier('herb_bed_t', 3);
    case BuildingKind.LivestockFarm:
      return tier('livestock_farm_t', 3);
    case BuildingKind.PenBarn:
      return 'icon_pen_barn';
    case BuildingKind.LumberMill:
      return l >= 2 ? 'icon_lumber_mill_t2' : 'icon_lumber_mill';
    case BuildingKind.Storehouse:
      return 'icon_storehouse';
    case BuildingKind.FishingDock:
      return 'icon_fishing_dock';
    case BuildingKind.Tannery:
      return 'icon_tannery';
    case BuildingKind.Cooking:
      return ['icon_cooking_campfire', 'icon_cook_hut', 'icon_kitchen', 'icon_great_kitchen', 'icon_grand_kitchen'][Math.min(l, 5) - 1]!;
    case BuildingKind.HerbalistHut:
      return 'icon_herbalist_hut';
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
    case BuildingKind.Earthworks:
      // Earth bank, earth ramp, fill, lumber ramp, stone ramp.
      return ['icon_earth', 'icon_ramp_earth', 'icon_earth', 'icon_ramp_lumber', 'icon_ramp_stone'][variant] ?? 'icon_ramp_earth';
    case BuildingKind.Ramp:
      return l >= 2 ? 'icon_ramp_stone' : 'icon_ramp_lumber';
    case BuildingKind.Workshop:
      return tier('workshop_t', 4);
    case BuildingKind.TorchPost:
      return 'icon_torch_post';
    case BuildingKind.WallTorch:
      return 'icon_torch_wall';
    case BuildingKind.Bonfire:
      // The campfire's picture stands in until the bonfire has its own.
      return 'icon_cooking_campfire';
    case BuildingKind.Lantern:
      return 'icon_lantern';
    case BuildingKind.ScholarsLodge:
      return ['icon_scholars_lodge', 'icon_scriptorium', 'icon_grand_academy'][Math.min(l, 3) - 1]!;
    case BuildingKind.MagiSanctum:
      return 'icon_magi_sanctum';
    case BuildingKind.Barracks:
      return 'icon_barracks';
    case BuildingKind.Stables:
      return 'icon_stables';
    case BuildingKind.GunneryYard:
      return 'icon_gunnery_yard';
    case BuildingKind.Mineshaft:
      return tier('mineshaft_t', 3);
    case BuildingKind.Kiln:
      return 'icon_kiln';
    case BuildingKind.Forge:
      return tier('forge_l', 4);
    case BuildingKind.PowderMill:
      return 'icon_powder_mill';
    case BuildingKind.Foundry:
      return 'icon_foundry';
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
