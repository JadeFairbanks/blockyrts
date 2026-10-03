// Pictures for the troop panel (Troops and gear: picture buttons and tier
// dropdowns with icons), drawn from the interface kit like the command card
// and the selection grid (patch notes 1: one picture per thing). Each weapon
// and armour tier shows its own piece where the kit draws one; the few the
// kit lacks borrow the nearest and say which in a tint.
import { Troop } from '@blockyrts/sim';
import { kitUrl } from './kit-icons.ts';
import { troopIconFile } from './unit-icons.ts';

interface Pic {
  file: string;
  filter?: string;
}

const NONE = 'grayscale(1) opacity(0.4)';

/** Close melee by tier: fists, cudgel, flint hand-axe, copper and bronze short swords, iron and steel swords. */
const CLOSE: readonly Pic[] = [
  { file: 'icon_club', filter: NONE },
  { file: 'icon_club' },
  { file: 'icon_axe_war_flint' },
  { file: 'icon_sword_short' },
  { file: 'icon_sword_short_bronze' },
  { file: 'icon_sword_iron_wrought' },
  { file: 'icon_sword_iron_refined' },
  { file: 'icon_sword_steel_steel' },
  { file: 'icon_sword_steel_hq_steel' },
];

/** Long melee and cavalry by tier: the spears, the iron pike, the steel halberd, the Zweihänder. */
const LONG: readonly Pic[] = [
  { file: 'icon_spear_hardwood', filter: NONE },
  { file: 'icon_spear_hardwood' },
  { file: 'icon_spear_flint' },
  { file: 'icon_spear' },
  { file: 'icon_spear_bronze' },
  { file: 'icon_spear', filter: 'grayscale(0.8) brightness(0.85)' },
  { file: 'icon_pike_steel' },
  { file: 'icon_halberd_steel' },
  { file: 'icon_halberd_hq_steel' },
];

/** The ranger's one ladder: sling, longbow, the recurve bow at 3 to 6, crossbow, musket. */
const RANGER: readonly Pic[] = [
  { file: 'icon_sling', filter: NONE },
  { file: 'icon_sling' },
  { file: 'icon_bow' },
  { file: 'icon_bow' },
  { file: 'icon_bow' },
  { file: 'icon_bow' },
  { file: 'icon_bow' },
  { file: 'icon_crossbow_steel_steel' },
  { file: 'icon_musket_steel' },
];

/** Armour by tier: none, the two leathers, copper and bronze scale, mail, plates, the two harnesses. */
const ARMOUR: readonly Pic[] = [
  { file: 'icon_armour_leather', filter: NONE },
  { file: 'icon_armour_leather' },
  { file: 'icon_armour_leather', filter: 'brightness(0.72) saturate(1.2)' },
  { file: 'icon_armour_bronze_scale', filter: 'hue-rotate(-14deg) saturate(1.35)' },
  { file: 'icon_armour_bronze_scale' },
  { file: 'icon_armour_iron_mail_iron_wrought' },
  { file: 'icon_armour_iron_mail_iron_refined' },
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

function weaponPic(troop: number, tier: number): Pic {
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
      // The flintlock pistol and cutlass: the cutlass is the tier 8 close-melee blade.
      return CLOSE[8]!;
    default:
      return CLOSE[0]!;
  }
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
  return [...CLOSE, ...LONG, ...RANGER, ...ARMOUR].map((p) => p.file).concat('icon_util_auto_equip');
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
