// Each good's picture in the inventory grid: the catalogue's 32 x 32 interface
// icons (packages/assets/src/ui, wishlist section K), drawn at their own size
// so the pixels stay crisp. An icon may still take a tint (a good borrowing a
// near one's icon, as obsidian borrows flint's) or have a solid background
// keyed out.
import {
  ARMOUR_KITS,
  BRAWLER_KIT,
  CLOSE_KITS,
  LONG_KITS,
  RANGER_KITS,
  Res,
  ROBE_KITS,
  SHIELD_KITS,
  TOOL_KITS,
  TRINKET_METALS,
  TRINKET_TIERS,
  trinketRes,
  Troop,
  WAND_KITS,
  type Piece,
} from '@blockyrts/sim';
import { armourPic, robePic, shieldPic, toolPic, wandPic, weaponPic, type Pic } from './icons.ts';
import { kitUrl } from './kit-icons.ts';

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
// Each kind of meat and fish its own picture (patch 1); trout keeps the old fish.
set(Res.Venison, 'meat_venison');
set(Res.BoarMeat, 'meat_boar');
set(Res.HareMeat, 'meat_hare');
set(Res.GooseMeat, 'meat_goose');
set(Res.PheasantMeat, 'meat_pheasant');
set(Res.Beef, 'meat_beef');
set(Res.Chicken, 'meat_chicken');
set(Res.HorseMeat, 'meat_horse');
set(Res.WolfMeat, 'meat_wolf');
set(Res.LynxMeat, 'meat_lynx');
set(Res.BadgerMeat, 'meat_badger');
set(Res.BearMeat, 'meat_bear');
set(Res.FrogLegs, 'meat_frog');
set(Res.CrabMeat, 'meat_crab');
set(Res.CrocodileMeat, 'meat_crocodile');
set(Res.GriffinMeat, 'meat_griffin');
set(Res.MinotaurMeat, 'meat_minotaur');
set(Res.RatMeat, 'meat_rat');
set(Res.Trout, 'fish');
set(Res.Salmon, 'fish_salmon');
set(Res.Catfish, 'fish_catfish');
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
set(Res.Sticks, 'hardwood_sticks');
set(Res.Clay, 'clay');
set(Res.Sand, 'sand');
set(Res.Charcoal, 'charcoal');
set(Res.Saltpetre, 'saltpetre');
set(Res.Sulphur, 'sulphur');
set(Res.FarmFare, 'farm_fare');
set(Res.Flax, 'flax');
set(Res.Hides, 'hides');
set(Res.Bone, 'bone');
set(Res.Bonemeal, 'bonemeal');
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
set(Res.HardenedLeather, 'hardened_leather');
set(Res.WroughtIron, 'ingot_iron_wrought');
set(Res.HandCart, 'hand_cart');
set(Res.CarbonSteel, 'ingot_carbon_steel');
set(Res.Gunpowder, 'gunpowder');
set(Res.OxCart, 'ox_cart');
set(Res.Bandage, 'bandage');
set(Res.Remedy, 'healing_remedy');
TRINKET_METALS.forEach((metal, m) =>
  TRINKET_TIERS.forEach((tier, t) => set(trinketRes(m, t + 1), `trinket_${tier.toLowerCase()}_${metal.toLowerCase()}`)),
);
// Moonleaf is made of silver and emeralds, Sunheart of gold and rubies.
set(Res.Moonleaf, 'trinket_moonleaf_silver');
set(Res.Sunheart, 'trinket_sunheart_gold');
// Patch 5's Stone Circle goods and the satyrs' hand-axe, each its own picture (the icon batch).
set(Res.Bluestone, 'bluestone');
set(Res.MoonRose, 'moon_rose');
set(Res.ObsidianHandAxe, 'axe_hand_obsidian');
set(Res.Obsidian, 'obsidian');
set(Res.PoisonTips, 'arrow_poison_flint');
// Patch 5 (Jade's GP-1): weapons, armour, shields, tools, wands and robes are goods in the stock, each with the picture its slot shows.
const KIT_PICS: ReadonlyArray<readonly [readonly Piece[], (tier: number) => Pic]> = [
  [CLOSE_KITS, (t) => weaponPic(Troop.Close, t)],
  [LONG_KITS, (t) => weaponPic(Troop.Long, t)],
  [RANGER_KITS, (t) => weaponPic(Troop.Ranger, t)],
  [[BRAWLER_KIT], () => weaponPic(Troop.Brawler, 8)],
  [ARMOUR_KITS, armourPic],
  [SHIELD_KITS, shieldPic],
  [TOOL_KITS, toolPic],
  [WAND_KITS, wandPic],
  [ROBE_KITS, robePic],
];
for (const [table, picOf] of KIT_PICS) {
  for (const p of table) {
    for (const r of p.items) {
      if (ICONS.has(r)) continue;
      const pic = picOf(p.tier);
      ICONS.set(r, { file: pic.file, ...(pic.filter ? { tint: pic.filter } : {}) });
    }
  }
}
// Patch 7's looted pieces: until the icons rendered from their models come in, each borrows the picture
// of the ladder piece it goes on as (the loop above), or of the nearest piece where it goes on as none
// (the Dreadnought's weapons and armour, and the pieces that fit nobody). Witchwood borrows the sticks', tinted.
set(Res.MinotaurGreatAxe, 'axe_hq_steel');
set(Res.ArchfiendGreatsword, 'zweihander');
set(Res.BogGuardianClub, 'club');
set(Res.MorvathStaff, 'wand_grand_magician');
set(Res.FiendShoulderPlate, 'armour_iron_plates');
set(Res.MinotaurBracers, 'armour_steel_plate_steel');
set(Res.GoblinLeathers, 'armour_leather');
set(Res.GoblinChiefHelmet, 'helmet_bronze');
set(Res.ArchfiendPlate, 'armour_steel_plate_hq_steel');
set(Res.JuggernautPlating, 'armour_iron_plates');
set(Res.HalflingIronCap, 'helmet_iron_nasal_iron_refined');
set(Res.DwarfPlate, 'armour_steel_plate_steel');
set(Res.DwarfMail, 'armour_iron_mail_iron_refined');
set(Res.HeavySpikedMace, 'mace_iron_refined');
set(Res.Witchwood, 'hardwood_sticks', { tint: 'hue-rotate(250deg) saturate(1.6) brightness(0.8)' });
// Jade's Patch 5 wild foods (GP-30, GP-31).
set(Res.BlackBerries, 'black_berries');
set(Res.Raspberries, 'raspberries');
set(Res.Blueberries, 'blueberries');
set(Res.Mushrooms, 'mushrooms');
set(Res.BogPear, 'bog_pear');
// Patch 5's stone circles: each rendered from Jade's own model of it.
set(Res.AncientSeed, 'ancient_seed');
set(Res.HawthorneFruit, 'hawthorne_fruit');
set(Res.PanFlute, 'pan_flute');
set(Res.BluestoneTrinket, 'trinket_bluestone');
set(Res.Honey, 'honey');
set(Res.EnchantedWine, 'enchanted_wine');
set(Res.HawthorneCider, 'hawthorne_cider');
set(Res.MoonIdol, 'moon_idol');
set(Res.HeadlessIdol, 'headless_idol');


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
    '../../../assets/src/ui/icon_{softwood_lumber,hardwood_lumber,hardwood_sticks,planks,resin,medicinal_herbs,moon_rose,stone,flint,obsidian,marble,bluestone,earth,clay,sand,coal,charcoal}.png',
    '../../../assets/src/ui/icon_{copper_ore,tin_ore,bog_iron,iron_rock,vein_iron_ore,lead_ore,saltpetre,sulphur,silver,gold,emerald,ruby,diamond,hexstone,mana_crystal}.png',
    '../../../assets/src/ui/icon_ingot_{copper,tin,bronze,pig_iron,iron_refined,iron_wrought,steel,carbon_steel}.png',
    '../../../assets/src/ui/icon_meat_{venison,boar,hare,goose,pheasant,beef,chicken,horse,wolf,lynx,badger,bear,frog,crab,crocodile,griffin,minotaur,rat}.png',
    '../../../assets/src/ui/icon_fish{,_salmon,_catfish}.png',
    '../../../assets/src/ui/icon_{eggs,farm_fare,bandage,healing_remedy}.png',
    '../../../assets/src/ui/icon_{black_berries,raspberries,blueberries,mushrooms,bog_pear}.png',
    '../../../assets/src/ui/icon_{hides,leather,hardened_leather,flax,rope,feathers,bone,bonemeal,spider_silk,venom,demon_horn,bricks,glass,gunpowder}.png',
    '../../../assets/src/ui/icon_{hand_cart,ox_cart,food,supply}.png',
    '../../../assets/src/ui/icon_trinket_{token,charm,brooch,heirloom}_{copper,tin,bronze,iron,steel,silver,gold}.png',
    '../../../assets/src/ui/icon_trinket_{moonleaf_silver,sunheart_gold,bluestone}.png',
    '../../../assets/src/ui/icon_{ancient_seed,hawthorne_fruit,pan_flute,honey,enchanted_wine,hawthorne_cider,moon_idol,headless_idol}.png',
  ],
  { eager: true, query: '?no-inline', import: 'default' },
);

/** An icon file's URL in the build, or '' if the build left it out (gear borrows the interface kit's pictures, all in the build). */
export function iconUrl(file: string): string {
  return URLS[`../../../assets/src/ui/${file}.png`] ?? kitUrl(file);
}
