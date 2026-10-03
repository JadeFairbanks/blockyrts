// Small drawn icons for the troop panel (Troops and gear: picture buttons and
// tier dropdowns with icons): one shape per troop type and kind of kit,
// tinted by the tier's material, as inline SVG so nothing has to load.
import { Troop } from '@blockyrts/sim';

/** A tier's material colour: fists, wood, flint, copper, bronze, wrought iron, iron, steel, carbon steel. */
export const TIER_COLOURS = ['#d8b090', '#a0703c', '#8a8f9a', '#c87533', '#c09a40', '#6e6a66', '#9aa0a6', '#d4dde6', '#6a7da0'] as const;
/** Armour reads as its material too, but leather and boiled leather are browns. */
const ARMOUR_COLOURS = ['#5a5a5a', '#9a6a3a', '#6e4a28', '#c87533', '#c09a40', '#6e6a66', '#9aa0a6', '#d4dde6', '#6a7da0'];

const WOOD = '#8a5a2a';

/** The shapes, drawn on a 16 x 16 grid; `m` is the material colour. */
const SHAPES: Record<string, (m: string) => string> = {
  fist: (m) => `<path d="M4 7h7a2 2 0 0 1 2 2v3a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2z" fill="${m}"/><path d="M4 7V5a1 1 0 0 1 2 0v2M6 7V4a1 1 0 0 1 2 0v3M8 7V4a1 1 0 0 1 2 0v3M10 7V5a1 1 0 0 1 2 0v3" fill="${m}" stroke="#0006" stroke-width=".5"/>`,
  club: (m) => `<path d="M3 14l6-6" stroke="${WOOD}" stroke-width="2" stroke-linecap="round"/><path d="M8 9l3-6a2.5 2.5 0 0 1 3 3l-6 3z" fill="${m}"/>`,
  sword: (m) => `<path d="M12.5 2.5L6 9" stroke="${m}" stroke-width="2.4" stroke-linecap="round"/><path d="M4 7.5l4.5 4.5" stroke="#b08a40" stroke-width="1.6"/><path d="M5.5 10.5L2.5 13.5" stroke="${WOOD}" stroke-width="1.8" stroke-linecap="round"/>`,
  spear: (m) => `<path d="M2.5 14.5L11 6" stroke="${WOOD}" stroke-width="1.6" stroke-linecap="round"/><path d="M14 2l-1 5-2.5-1.5L9 3z" fill="${m}"/>`,
  halberd: (m) => `<path d="M2.5 14.5L12 5" stroke="${WOOD}" stroke-width="1.6" stroke-linecap="round"/><path d="M14.5 1.5l-1.2 3.3-2-1.2z" fill="${m}"/><path d="M10 5.5a4 4 0 0 0 2.5 4.5l1-1.5-2-3z" fill="${m}"/>`,
  sling: (m) => `<path d="M3 3c2 5 5 8 10 10" stroke="${WOOD}" stroke-width="1" fill="none"/><ellipse cx="9" cy="10" rx="2.6" ry="1.6" transform="rotate(35 9 10)" fill="${m}"/><circle cx="9" cy="10" r="1" fill="#9a9a94"/>`,
  bow: (m) => `<path d="M4 2c7 2 7 10 0 12" stroke="${m}" stroke-width="1.8" fill="none"/><path d="M4 2v12" stroke="#ddd" stroke-width=".6"/><path d="M2 8h11" stroke="${WOOD}" stroke-width="1"/><path d="M13 8l-2-1.2v2.4z" fill="#aaa"/>`,
  crossbow: (m) => `<path d="M8 3v11" stroke="${WOOD}" stroke-width="2"/><path d="M2.5 6c3-2 8-2 11 0" stroke="${m}" stroke-width="1.8" fill="none"/><path d="M2.5 6L8 9l5.5-3" stroke="#ddd" stroke-width=".6" fill="none"/>`,
  musket: (m) => `<path d="M1.5 12.5l2.5-2 9.5-8" stroke="${m}" stroke-width="1.6" stroke-linecap="round"/><path d="M1 13l4-3.5 2 1.5-4 3z" fill="${WOOD}"/>`,
  pistol: (m) => `<path d="M3 6h10v2.2H7z" fill="${m}"/><path d="M6 7.5l-3 5.5h3l2-5z" fill="${WOOD}"/>`,
  horse: (m) => `<path d="M4 14l1-5-2-1 4-5 2 0 4 3-1 2-3-1-1 7z" fill="${m}"/><circle cx="8.2" cy="4.6" r=".6" fill="#000"/>`,
  armour: (m) => `<path d="M5 2l3 1.5L11 2l3 2-1.5 3v7h-9V7L2 4z" fill="${m}" stroke="#0006" stroke-width=".6"/>`,
  none: () => `<circle cx="8" cy="8" r="5" stroke="#888" stroke-width="1.4" fill="none"/><path d="M4.5 11.5l7-7" stroke="#888" stroke-width="1.4"/>`,
  shield: (m) => `<path d="M3 3h10v5c0 3.5-2.5 5.5-5 6.5C5.5 13.5 3 11.5 3 8z" fill="${m}" stroke="#0006" stroke-width=".6"/>`,
  auto: () => `<path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z" fill="#e8c25a"/>`,
};

function svg(shape: string, colour: string, size: number): string {
  const draw = SHAPES[shape] ?? SHAPES.none!;
  return `<svg class="icon" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${draw(colour)}</svg>`;
}

/** The shape of a troop type's weapon at a tier. */
function weaponShape(troop: number, tier: number): string {
  switch (troop) {
    case Troop.Close:
      return tier === 0 ? 'fist' : tier === 1 ? 'club' : 'sword';
    case Troop.Long:
    case Troop.Cavalry:
      return tier >= 7 ? 'halberd' : 'spear';
    case Troop.Ranger:
      return tier === 1 ? 'sling' : tier === 7 ? 'crossbow' : tier === 8 ? 'musket' : 'bow';
    case Troop.Brawler:
      return 'pistol';
  }
  return 'none';
}

/** A troop type's picture: its tier 1 look (the brawler's pistol, cavalry's horse). */
export function troopIcon(troop: number, size = 22): string {
  if (troop === Troop.Cavalry) return svg('horse', '#8a5a3a', size);
  return svg(weaponShape(troop, troop === Troop.Brawler ? 8 : troop === Troop.Ranger ? 2 : 3), TIER_COLOURS[troop === Troop.Ranger ? 2 : 6]!, size);
}

/** A weapon tier's icon for a troop type. */
export function weaponIcon(troop: number, tier: number, size = 16): string {
  return svg(weaponShape(troop, tier), TIER_COLOURS[tier] ?? '#888', size);
}

/** An armour tier's icon (none at 0). */
export function armourIcon(tier: number, size = 16): string {
  return tier === 0 ? svg('none', '', size) : svg('armour', ARMOUR_COLOURS[tier] ?? '#888', size);
}

/** The "best affordable" choice's icon. */
export function autoIcon(size = 16): string {
  return svg('auto', '', size);
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
