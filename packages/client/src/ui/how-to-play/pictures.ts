// How to Play's pictures: the same interface-kit pictures the HUD shows for
// each building, unit, creature, good, spell and piece of gear, found from
// the data row a page is made from (in How to Play's worker, beside the
// sim's tables; the page turns file names into URLs with picture-url.ts).
// A row with a `model` (or a `mob` whose model it borrows) gets its
// portrait without being listed here, so new creatures and units have
// pictures as soon as the kit draws them.
import type { Entry, SimModules } from '@blockyrts/balance';
import { valueAt } from '@blockyrts/balance';
import { MOBS, RESEARCH_PRODUCT, School, SPELLS, Troop } from '@blockyrts/sim';
import { productIcon } from '../../hud/card-icons.ts';
import { armourPic, robePic, shieldPic, toolPic, wandPic, weaponPic, type Pic } from '../../hud/icons.ts';
import { goodIcon } from '../../hud/inventory-icons.ts';
import { BATTLE_MAGE_ICON, buildingIconFile, modelIconFile, WORKER_ICON } from '../../hud/unit-icons.ts';
import { pictureUrl } from './picture-url.ts';

export type { Pic };

const pic = (file: string | undefined): Pic | null => (file ? { file } : null);

/** A good's picture (with its tint when it borrows another good's). */
export function goodPic(res: number): Pic | null {
  const g = goodIcon(res);
  return g ? { file: g.file, ...(g.tint ? { filter: g.tint } : {}) } : null;
}

/** A building's picture at a level. */
export function buildingPic(kind: number, level: number): Pic {
  return { file: buildingIconFile(kind, level) };
}

function modelPic(model: unknown): Pic | null {
  return typeof model === 'string' && model !== '' ? pic(modelIconFile(model)) : null;
}

/** The picture for a page made from a catalog entry, or null for none. */
export function entryPic(entry: Entry, mods: SimModules): Pic | null {
  const table = String(entry.path[0]);
  const rec = valueAt(mods[entry.module] ?? {}, entry.path) as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== 'object') return null;
  const tier = typeof entry.path[1] === 'number' ? entry.path[1] : 0;
  const num = (k: string): number => (typeof rec[k] === 'number' ? (rec[k] as number) : -1);
  switch (table) {
    case 'BUILDINGS':
      return buildingPic(num('kind'), 1);
    case 'RESOURCES':
      return goodPic(num('id'));
    case 'RECIPES': {
      const out = (rec.outputs as ReadonlyArray<readonly [number, number]> | undefined)?.[0]?.[0];
      return out === undefined ? null : goodPic(out);
    }
    case 'RESEARCH':
      return pic(productIcon(RESEARCH_PRODUCT + num('id'))?.layers[0]?.file);
    case 'SPELLS': {
      // The kit draws no icons for the Elf Grovesingers' spells: their caster's portrait stands in.
      const s = SPELLS[num('id')];
      return pic(s && !pictureUrl(s.icon) && s.school === School.Grove ? 'portrait_elf_grovesinger' : s?.icon);
    }
    case 'MAGE_RANKS':
      return pic(BATTLE_MAGE_ICON);
    case 'PRODUCTS':
      return pic(productIcon(num('product'))?.layers[0]?.file ?? WORKER_ICON);
    case 'CLOSE_KITS':
      return weaponPic(Troop.Close, tier);
    case 'LONG_KITS':
      return weaponPic(Troop.Long, tier);
    case 'RANGER_KITS':
      return weaponPic(Troop.Ranger, tier);
    case 'BRAWLER_KIT':
      return weaponPic(Troop.Brawler, 8);
    case 'ARMOUR_KITS':
    case 'TIER_NEEDS':
      return armourPic(tier);
    case 'SHIELD_KITS':
      return shieldPic(tier);
    case 'TOOL_KITS':
      return toolPic(tier);
    case 'WAND_KITS':
      return wandPic(tier);
    case 'ROBE_KITS':
      return robePic(tier);
    default:
      break;
  }
  if (typeof rec.icon === 'string' && rec.icon.startsWith('icon_')) return pic(rec.icon);
  const own = modelPic(rec.model);
  if (own) return own;
  if (typeof rec.mob === 'number') return modelPic(MOBS.find((m) => m.id === rec.mob)?.model);
  return null;
}
