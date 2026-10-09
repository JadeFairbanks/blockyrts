// What a type in the selection is worth, so a mixed selection of units and
// buildings shows the most valuable type first (patch notes 1: "defaults to
// showing the portrait and the command card of the highest level or most
// expensive unit or building", with Tab stepping through the rest). Worth is
// everything it cost: the goods (counted one for one) and the food, and for a
// building every level up to the one it stands at.
import { buildingSpec, DREADNOUGHT, dreadnoughtProduct, engineSpec, Product, productSpec, troopProduct, type Cost } from '@blockyrts/sim';

/** What the worth of a unit type reads from one unit: its troop and kit tiers. */
export interface UnitKit {
  troop: number;
  wTier: number;
  aTier: number;
}

const total = (cost: Cost): number => cost.reduce((n, [, k]) => n + k, 0);

/** A product's worth: its goods and its food. */
function productWorth(product: number): number {
  const ps = productSpec(product);
  return total(ps.cost) + ps.food;
}

/** A building's worth: every level's cost up to its own. */
export function buildingWorth(kind: number, level: number): number {
  const spec = buildingSpec(kind);
  let n = 0;
  for (let l = 0; l < Math.max(1, level) && l < spec.levels.length; l++) n += total(spec.levels[l]!.cost);
  return n;
}

/**
 * A selection type's worth. Troops share one type, so the dearest kit among
 * the selected ones counts (`kits` reads them); engines by their own cost.
 * Things the player cannot train (mobs, animals, nodes) are worth nothing.
 */
export function typeWorth(typeKey: string, kits: () => readonly UnitKit[] = () => []): number {
  if (typeKey === 'worker') return productWorth(Product.Worker);
  if (typeKey === 'mage:support') return productWorth(Product.SupportMage);
  if (typeKey === 'mage:battle') return productWorth(Product.BattleMage);
  if (typeKey === 'warrior:crew') return productWorth(Product.Crewman);
  if (typeKey === 'warrior:woods') return productWorth(Product.Woodsman);
  // Patch 5: the Dreadnought, at his price in gold.
  if (typeKey === 'warrior:dreadnought') return productWorth(dreadnoughtProduct(DREADNOUGHT.gold, 0));
  if (typeKey === 'warrior') {
    let best = 0;
    for (const k of kits()) if (k.troop > 0) best = Math.max(best, productWorth(troopProduct(k.troop, k.wTier, k.aTier)));
    return best;
  }
  if (typeKey.startsWith('building:')) {
    const [, kind, level] = typeKey.split(':');
    return buildingWorth(Number(kind), Number(level));
  }
  if (typeKey.startsWith('engine:')) return total(engineSpec(Number(typeKey.slice(7))).cost);
  return 0;
}
