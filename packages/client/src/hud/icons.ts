// Pictures for the troop panel (Troops and gear: picture buttons and tier
// dropdowns with icons), drawn from the interface kit like the command card
// and the selection grid (patch notes 1: one picture per thing). Each weapon
// and armour tier shows its own piece where the kit draws one; the few the
// kit lacks borrow the nearest and say which in a tint (Patch 5's icon batch
// drew every new kit piece; an empty slot shows greyed).
import { RANGER_KITS, Shot, Troop } from '@blockyrts/sim';
import { kitUrl } from './kit-icons.ts';
import { troopIconFile } from './unit-icons.ts';

/** A kit picture and the tint it takes, as a button's picture layer. */
export interface Pic {
  file: string;
  filter?: string;
}

const NONE = 'grayscale(1) opacity(0.4)';

/** Close melee by tier: fists, cudgel, flint hand-axe, copper and bronze short swords, iron and steel swords, the basket-hilted broadsword. */
const CLOSE: readonly Pic[] = [
  { file: 'icon_club', filter: NONE },
  { file: 'icon_club' },
  { file: 'icon_axe_war_flint' },
  { file: 'icon_sword_copper_short' },
  { file: 'icon_sword_short_bronze' },
  { file: 'icon_sword_iron_wrought' },
  { file: 'icon_sword_iron_refined' },
  { file: 'icon_sword_steel_steel' },
  { file: 'icon_sword_basket_hilt' },
];

/** Long melee and cavalry by tier: the spears, the crude iron spear, the iron pike, the steel halberd, the Zweihänder. */
const LONG: readonly Pic[] = [
  { file: 'icon_spear_hardwood', filter: NONE },
  { file: 'icon_spear_hardwood' },
  { file: 'icon_spear_flint' },
  { file: 'icon_spear' },
  { file: 'icon_spear_bronze' },
  { file: 'icon_spear_iron_crude' },
  { file: 'icon_pike_steel' },
  { file: 'icon_halberd_steel' },
  { file: 'icon_zweihander' },
];

/** The ranger's one ladder: sling, longbow, the recurve bow at 3 to 6, crossbow, musket. */
const RANGER: readonly Pic[] = [
  { file: 'icon_sling', filter: NONE },
  { file: 'icon_sling' },
  { file: 'icon_bow' },
  { file: 'icon_bow_recurve' },
  { file: 'icon_bow_recurve' },
  { file: 'icon_bow_recurve' },
  { file: 'icon_bow_recurve' },
  { file: 'icon_crossbow_steel_steel' },
  { file: 'icon_musket_steel' },
];

/** The brawler's flintlock pistol. */
const BRAWLER: Pic = { file: 'icon_pistol' };

/** Armour by tier: none, the leather jerkin, the boiled-leather cuirass, copper and bronze scale, mail, the iron coat of plates, the two harnesses. */
const ARMOUR: readonly Pic[] = [
  { file: 'icon_armour_leather', filter: NONE },
  { file: 'icon_armour_leather' },
  { file: 'icon_armour_leather_boiled' },
  { file: 'icon_armour_copper_scale' },
  { file: 'icon_armour_bronze_scale' },
  { file: 'icon_armour_iron_mail_iron_wrought' },
  { file: 'icon_armour_iron_plates' },
  { file: 'icon_armour_steel_plate_steel' },
  { file: 'icon_armour_steel_plate_hq_steel' },
];

function img(p: Pic, size: number): string {
  const url = kitUrl(p.file);
  if (!url) return '';
  const style = `width:${size}px;height:${size}px${p.filter ? `;filter:${p.filter}` : ''}`;
  return `<img class="icon" src="${url}" alt="" draggable="false" style="${style}">`;
}

/** A troop type's picture: the training bust for the weapon tier it would train. */
export function troopIcon(troop: number, wTier: number, size = 28): string {
  return img({ file: troopIconFile(troop, wTier) }, size);
}

/** A weapon tier's picture for a troop type, as a layer (Patch 2's card slots and tier strip). */
export function weaponPic(troop: number, tier: number): Pic {
  const t = Math.max(0, Math.min(8, tier));
  switch (troop) {
    case Troop.Close:
      return CLOSE[t]!;
    case Troop.Long:
    case Troop.Cavalry:
      return LONG[t]!;
    case Troop.Ranger:
      return RANGER[t]!;
    case Troop.Brawler:
      // The flintlock pistol (its cutlass is the tier 8 close-melee row, drawn as a cutlass).
      return BRAWLER;
    default:
      return CLOSE[0]!;
  }
}

/** An armour tier's picture, as a layer. */
export function armourPic(tier: number): Pic {
  return ARMOUR[Math.max(0, Math.min(8, tier))]!;
}

/** Close melee's shields by shield row (SHIELD_KITS): wood, the boiled-leather targe, the iron-rimmed and steel heaters, the steel rotella. */
const SHIELD: readonly Pic[] = [
  { file: 'icon_shield_wood_iron_bloom', filter: NONE },
  { file: 'icon_shield_wood_iron_bloom' },
  { file: 'icon_shield_targe' },
  { file: 'icon_shield_iron_kite_iron_refined' },
  { file: 'icon_shield_steel_heater_steel' },
  { file: 'icon_shield_rotella' },
];

/** A shield row's picture (0: none, greyed). */
export function shieldPic(row: number): Pic {
  return SHIELD[Math.max(0, Math.min(SHIELD.length - 1, row))]!;
}

/** A ranger's poison tips (Patch 5): poisoned arrows on a bow, poisoned bolts on a crossbow. */
export function tipsPic(weaponTier: number): Pic {
  return { file: RANGER_KITS[weaponTier]?.shot === Shot.Bolt ? 'icon_bolt_poison_steel' : 'icon_arrow_poison_flint' };
}

/** Wands by tier, 1 to 6: the kit's six rank wands in order (hazel to the archstaff). */
const WAND: readonly string[] = ['icon_wand_novice_acolyte', 'icon_wand_acolyte', 'icon_wand_adept_acolyte', 'icon_wand_mage', 'icon_wand_master_mage', 'icon_wand_grand_magician'];

/** A wand tier's picture (0: none, greyed). */
export function wandPic(tier: number): Pic {
  return tier <= 0 ? { file: WAND[0]!, filter: NONE } : { file: WAND[Math.min(WAND.length, tier) - 1]! };
}

/** A robe tier's picture, 1 to 6 (the model thread's robes; the purple-tinted leather stands in where one is missing). */
export function robePic(tier: number): Pic {
  const t = Math.max(1, Math.min(6, tier));
  const file = `icon_robe_${t}`;
  if (tier > 0 && kitUrl(file)) return { file };
  return { file: 'icon_armour_leather', filter: `hue-rotate(230deg) saturate(1.4)${tier <= 0 ? ' grayscale(1) opacity(0.4)' : ''}` };
}

/** A worker's tool kit by tier: the wooden axe, then the kit's tool sets (stone and flint to carbon steel). */
const TOOLS: readonly Pic[] = [
  { file: 'icon_tool_set_stone', filter: NONE },
  { file: 'icon_axe_hardwood' },
  { file: 'icon_tool_set_flint' },
  { file: 'icon_tool_set_copper' },
  { file: 'icon_tool_set_bronze' },
  { file: 'icon_tool_set_iron_wrought' },
  { file: 'icon_tool_set_iron_refined' },
  { file: 'icon_tool_set_steel' },
  { file: 'icon_tool_set_hq_steel' },
];

/** A tool kit tier's picture. */
export function toolPic(tier: number): Pic {
  return TOOLS[Math.max(0, Math.min(8, tier))]!;
}

/** A weapon tier's picture for a troop type. */
export function weaponIcon(troop: number, tier: number, size = 20): string {
  return img(weaponPic(troop, tier), size);
}

/** An armour tier's picture (greyed leather for none). */
export function armourIcon(tier: number, size = 20): string {
  return img(ARMOUR[Math.max(0, Math.min(8, tier))]!, size);
}

/** The "best affordable" choice's picture. */
export function autoIcon(size = 20): string {
  return img({ file: 'icon_util_auto_equip' }, size);
}

/** The kit file names behind the troop panel's pictures, for the test that every one exists. */
export function troopPanelFiles(): string[] {
  return [...CLOSE, ...LONG, ...RANGER, BRAWLER, ...ARMOUR, ...SHIELD, ...TOOLS].map((p) => p.file).concat(WAND, [1, 2, 3, 4, 5, 6].map((t) => `icon_robe_${t}`), 'icon_util_auto_equip');
}

/** Puts an icon in front of a button's face text. */
export function setIcon(el: HTMLElement, html: string): void {
  let host = el.querySelector<HTMLElement>(':scope > .icon-host');
  if (!host) {
    host = document.createElement('span');
    host.className = 'icon-host';
    el.prepend(host);
  }
  if (host.innerHTML !== html) host.innerHTML = html;
}
