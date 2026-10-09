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
      return wTier >= 8 ? 'icon_train_warrior_zweihander' : wTier === 7 ? 'icon_train_warrior_halberd' : wTier === 6 ? 'icon_train_warrior_pike' : 'icon_train_warrior_spear';
    case Troop.Ranger:
      return wTier >= 8 ? 'icon_train_warrior_musket' : wTier === 7 ? 'icon_train_warrior_crossbow' : wTier >= 2 ? 'icon_train_warrior_bow' : 'icon_train_warrior_sling';
    case Troop.Brawler:
      return 'icon_train_warrior_brawler';
    case Troop.Cavalry:
      return 'icon_train_warrior_mounted';
    case Troop.Crew:
      return 'icon_train_warrior_cannon_crew';
    case Troop.Woodsman:
      // Patch 5: rendered from his own model, woodsman.
      return 'portrait_woodsman';
    case Troop.Dreadnought:
      // Patch 5: rendered from his own model, heavy_knight.
      return 'icon_dreadnought';
    default:
      return 'icon_train_warrior_club';
  }
}

export const WORKER_ICON = 'icon_train_worker_labourer';
export const SUPPORT_MAGE_ICON = 'icon_train_mage_support';
export const BATTLE_MAGE_ICON = 'icon_train_mage_battle';

/** A mage's picture: her robe look's portrait from robe tier 1 (Patch 5, as she is drawn), else her school's training picture. */
export function mageIconFile(battle: boolean, robe: number): string {
  const own = robe > 0 ? firstKit(`portrait_mage_${battle ? 'battle' : 'support'}_${Math.min(6, robe)}`) : '';
  return own || (battle ? BATTLE_MAGE_ICON : SUPPORT_MAGE_ICON);
}

/**
 * A catalogue model's picture: its portrait, or a near one for a model named
 * with a prefix (chicken_hen is the hen), else its icon (Patch 5: the wild
 * goose, the pheasant, the cannons, the Citadel's fixed engines and the bomb
 * keg). Lairs and the peoples' buildings have none: their portrait is the
 * rendered still.
 */
export function modelIconFile(model: string): string {
  const bare = model.replace(/^(chicken|fish|wild)_/, '');
  return firstKit(`icon_train_${bare}`, `portrait_${model}`, `portrait_${bare}`, `icon_${model}`);
}

/** A building's picture by kind and level (the main base's tiers). */
export function buildingIconFile(kind: number, level: number): string {
  const l = Math.max(1, level);
  switch (kind) {
    case BuildingKind.MainBase:
      // Patch 5: four tiers, the first three drawn as the old level each stands on, the fourth as the Citadel.
      return l >= MAIN_BASE_TIER_LEVELS.length ? 'icon_main_base_citadel' : `icon_main_base_l${MAIN_BASE_TIER_LEVELS[l - 1]!}`;
    case BuildingKind.Farm:
      // Patch 5: the farm as its remade farmhouse.
      return 'icon_farmhouse_t1';
    case BuildingKind.Barn:
      return 'icon_barn';
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
      return 'icon_bonfire';
    case BuildingKind.EarthRampart:
      return 'icon_rampart_earth';
    case BuildingKind.ScholarsLodge:
      return 'icon_scholars_lodge';
    case BuildingKind.MagiSanctum:
      return 'icon_magi_sanctum';
    case BuildingKind.Barracks:
      return 'icon_barracks';
    case BuildingKind.ArtilleryWorkshop:
      // Its model keeps the gunnery yard's id (remade in Patch 5), and so does its picture.
      return 'icon_gunnery_yard';
    case BuildingKind.Mineshaft:
      return 'icon_mineshaft_t1';
    case BuildingKind.Forge:
      return 'icon_forge_l1';
    case BuildingKind.Tavern:
      return 'icon_tavern';
    default:
      return 'icon_storehouse';
  }
}

/** What a unit reads for its picture: the troop type and weapon tier of a warrior. */
export interface UnitLook {
  troop: number;
  wTier: number;
  /** The armour or robe tier: a mage's robe look (Patch 5). */
  aTier?: number;
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
  if (typeKey === 'warrior:woods') return troopIconFile(Troop.Woodsman, 1);
  if (typeKey === 'warrior:dreadnought') return troopIconFile(Troop.Dreadnought, 0);
  if (typeKey === 'mage:support') return mageIconFile(false, look?.aTier ?? 0);
  if (typeKey === 'mage:battle') return mageIconFile(true, look?.aTier ?? 0);
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
