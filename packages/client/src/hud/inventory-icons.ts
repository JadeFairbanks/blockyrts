// Each good's picture in the inventory grid: the catalogue's 32 x 32 interface
// icons (packages/assets/src/ui, wishlist section K), drawn at their own size
// so the pixels stay crisp. Two goods have no icon of their own yet and borrow
// a near one with a tint; the carts' icons are training buttons with a dark
// square behind them, which is keyed out when they load.
import { Res, TRINKET_METALS, TRINKET_TIERS, trinketRes } from '@blockyrts/sim';

export interface GoodIcon {
  /** The file under packages/assets/src/ui, without .png. */
  file: string;
  /** A CSS filter for a good that borrows another's icon. */
  tint?: string;
  /** The icon has a solid background to key out. */
  keyed?: boolean;
}

const ICONS = new Map<number, GoodIcon>();
const set = (res: Res, file: string, extra: Omit<GoodIcon, 'file'> = {}): void => void ICONS.set(res, { file: `icon_${file}`, ...extra });

set(Res.SoftwoodLumber, 'softwood_lumber');
set(Res.HardwoodLumber, 'hardwood_lumber');
set(Res.Herbs, 'medicinal_herbs');
set(Res.Stone, 'stone');
set(Res.Flint, 'flint');
set(Res.Coal, 'coal');
set(Res.Leather, 'leather');
set(Res.Meat, 'meat');
set(Res.Fish, 'fish');
set(Res.CopperOre, 'copper_ore');
set(Res.TinOre, 'tin_ore');
set(Res.CopperIngot, 'ingot_copper');
set(Res.TinIngot, 'ingot_tin');
set(Res.BronzeIngot, 'ingot_bronze');
set(Res.BogIron, 'bog_iron');
set(Res.IronRock, 'iron_rock');
set(Res.VeinIron, 'vein_iron_ore');
set(Res.PigIron, 'ingot_pig_iron');
set(Res.IronIngot, 'ingot_iron_refined');
set(Res.SteelIngot, 'ingot_steel');
set(Res.Eggs, 'eggs');
set(Res.Feathers, 'feathers');
set(Res.Gold, 'gold');
set(Res.Emeralds, 'emerald');
set(Res.Rubies, 'ruby');
set(Res.Diamonds, 'diamond');
set(Res.Silver, 'silver');
set(Res.Marble, 'marble');
set(Res.Earth, 'earth');
set(Res.Gravel, 'gravel');
set(Res.Sticks, 'hardwood_sticks');
set(Res.Clay, 'clay');
set(Res.Sand, 'sand');
set(Res.Charcoal, 'charcoal');
set(Res.Saltpetre, 'saltpetre');
set(Res.Sulphur, 'sulphur');
set(Res.Wheat, 'wheat');
set(Res.Potatoes, 'potatoes');
set(Res.Carrots, 'carrots');
set(Res.Corn, 'corn');
set(Res.Flax, 'flax');
set(Res.Hides, 'hides');
set(Res.Bone, 'bone');
set(Res.Resin, 'resin');
set(Res.SpiderSilk, 'spider_silk');
set(Res.DemonHorn, 'demon_horn');
set(Res.Hexstone, 'hexstone');
set(Res.Venom, 'venom');
set(Res.LeadOre, 'lead_ore');
set(Res.ManaCrystal, 'mana_crystal');
set(Res.Planks, 'planks');
set(Res.Bricks, 'bricks');
set(Res.Glass, 'glass');
set(Res.Rope, 'rope');
// No hardened leather icon yet: the leather one, darker and harder.
set(Res.HardenedLeather, 'leather', { tint: 'brightness(0.62) contrast(1.35) saturate(0.8)' });
set(Res.WroughtIron, 'ingot_iron_wrought');
set(Res.HandCart, 'train_hand_cart', { keyed: true });
// Carbon steel replaced high-quality steel (Troops and gear): its ingot, blued so it reads apart from steel.
set(Res.CarbonSteel, 'ingot_hq_steel', { tint: 'sepia(0.5) hue-rotate(175deg) saturate(2.2) brightness(0.8)' });
set(Res.Gunpowder, 'gunpowder');
set(Res.OxCart, 'train_ox_cart', { keyed: true });
set(Res.RoastMeat, 'roast_meat');
set(Res.RoastFish, 'roast_fish');
set(Res.SmokedMeat, 'smoked_meat');
set(Res.SmokedFish, 'smoked_fish');
set(Res.Bread, 'bread');
set(Res.SaltedMeat, 'salted_meat');
set(Res.SaltedFish, 'salted_fish');
set(Res.Stew, 'stew');
set(Res.Pie, 'pie');
set(Res.Bandage, 'bandage');
set(Res.Remedy, 'healing_remedy');
set(Res.LumberRamp, 'ramp_lumber');
set(Res.StoneRamp, 'ramp_stone');
set(Res.Lantern, 'lantern');
TRINKET_METALS.forEach((metal, m) =>
  TRINKET_TIERS.forEach((tier, t) => set(trinketRes(m, t + 1), `trinket_${tier.toLowerCase()}_${metal.toLowerCase()}`)),
);
// Moonleaf is made of silver and emeralds, Sunheart of gold and rubies.
set(Res.Moonleaf, 'trinket_moonleaf_silver');
set(Res.Sunheart, 'trinket_sunheart_gold');
set(Res.Cannonball, 'cannonball_iron');
set(Res.CatapultStone, 'catapult_stone');
set(Res.BallistaBolt, 'ballista_bolt');

/** A good's icon. */
export function goodIcon(res: number): GoodIcon | undefined {
  return ICONS.get(res);
}

/** The Food and Supply cells beside the grid. */
export const FOOD_ICON = 'icon_food';
export const SUPPLY_ICON = 'icon_supply';

// Only the icons above go into the build, each as its own file fetched when a slot first shows it.
const URLS = import.meta.glob<string>(
  [
    '../../../assets/src/ui/icon_{softwood_lumber,hardwood_lumber,hardwood_sticks,planks,resin,medicinal_herbs,stone,flint,marble,gravel,earth,clay,sand,coal,charcoal}.png',
    '../../../assets/src/ui/icon_{copper_ore,tin_ore,bog_iron,iron_rock,vein_iron_ore,lead_ore,saltpetre,sulphur,silver,gold,emerald,ruby,diamond,hexstone,mana_crystal}.png',
    '../../../assets/src/ui/icon_ingot_{copper,tin,bronze,pig_iron,iron_refined,iron_wrought,steel,hq_steel}.png',
    '../../../assets/src/ui/icon_{meat,fish,eggs,wheat,corn,potatoes,carrots,roast_meat,roast_fish,smoked_meat,smoked_fish,bread,salted_meat,salted_fish,stew,pie,bandage,healing_remedy}.png',
    '../../../assets/src/ui/icon_{hides,leather,flax,rope,feathers,bone,spider_silk,venom,demon_horn,bricks,glass,gunpowder,ramp_lumber,ramp_stone,lantern}.png',
    '../../../assets/src/ui/icon_{train_hand_cart,train_ox_cart,cannonball_iron,catapult_stone,ballista_bolt,food,supply}.png',
    '../../../assets/src/ui/icon_trinket_{token,charm,brooch,heirloom}_{copper,tin,bronze,iron,steel,silver,gold}.png',
    '../../../assets/src/ui/icon_trinket_{moonleaf_silver,sunheart_gold}.png',
  ],
  { eager: true, query: '?no-inline', import: 'default' },
);

/** An icon file's URL in the build, or '' if the build left it out. */
export function iconUrl(file: string): string {
  return URLS[`../../../assets/src/ui/${file}.png`] ?? '';
}
