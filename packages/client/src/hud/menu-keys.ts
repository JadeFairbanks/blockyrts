// The build menu and the K menus (smelting, making, research, slaughter,
// engines), and their hotkeys. Jade's Patch 4: no key follows the grid any
// more; a menu's buttons are on letters named after them, shown on each
// button and rebound in the settings like every other command (Command card
// and hotkeys: "Two buttons on the same card never share a letter"). The
// build menu's letters are picked by hand (s); a K menu's come from its
// products' names by one rule (menuLetters). Esc is Back and + turns a long
// menu's page (s).
import { BUILDINGS, BuildingKind, buildingSpec, productsOf, productSpec, RESEARCH_PRODUCT, TROOP_PRODUCT, type BuildingSpec } from '@blockyrts/sim';
import type { Action } from '../input/bindings.ts';

/** The buildings of the build menu in its order: one kind, or a submenu's kinds (Defences, Lights) sharing a place. */
export function menuSlots(): BuildingSpec[][] {
  const out: BuildingSpec[][] = Array.from({ length: Math.max(...BUILDINGS.map((b) => b.slot)) }, () => []);
  for (const b of BUILDINGS) if (b.slot > 0) out[b.slot - 1]!.push(b);
  return out;
}

/** Where a defence sits in the Defences submenu: walls, then gates, then towers, each wood, hardwood, stone. */
function defenceRank(spec: BuildingSpec): number {
  return spec.defence === 'gate' ? 1 : spec.defence === 'tower' ? 2 : 0;
}

/** The choices of a submenu: each building, each way of a gate, in menu order. */
export function submenuChoices(specs: readonly BuildingSpec[]): Array<{ spec: BuildingSpec; variant: number; name: string }> {
  const out: Array<{ spec: BuildingSpec; variant: number; name: string }> = [];
  for (const spec of [...specs].sort((a, b) => defenceRank(a) - defenceRank(b))) {
    if (spec.variants) spec.variants.forEach((name, v) => out.push({ spec, variant: v, name }));
    else out.push({ spec, variant: 0, name: spec.name });
  }
  return out;
}

/** Each building kind's name in the sim's BuildingKind ('Farm', 'WallHardwood'), which stays put when kinds are added or cut. */
const KIND_NAMES: ReadonlyMap<number, string> = new Map(Object.entries(BuildingKind).map(([name, kind]) => [kind, name]));

/** A building kind's name in binding names: its BuildingKind name, so a rebound key keeps its building when the list of kinds changes (Patch 5). */
export function kindName(kind: number): string {
  return KIND_NAMES.get(kind) ?? String(kind);
}

/** A product's name in binding names: its name in lower case, words joined by dashes ('bronze-ingots-10'). */
export function productName(product: number): string {
  return productSpec(product)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The binding name of a building (or one way of a gate) in the build menu;
 * also its button's action. Patch 5: by the building's name, not its number,
 * which shifted one along when the earthworks went.
 */
export function placeAction(kind: number, variant: number): string {
  return `build-${kindName(kind)}-${variant}`;
}

/** The binding name of the button opening a build submenu. */
export function submenuAction(group: string): string {
  return `menu-${group.toLowerCase()}`;
}

/** The binding name of a product in a building's K menu (the same product can sit in two menus: rope at the Big House and the Workshop), by names as placeAction (Patch 5). */
export function makeAction(kind: number, product: number): string {
  return `make-${kindName(kind)}-${productName(product)}`;
}

/** The page turn of a menu too long for the card (More). */
export const MORE_ACTION = 'more';

/**
 * Letters no menu button takes by default: Follow (L), Everyone Home (J) and
 * the Peoples panel (O) are on the HUD whatever the card shows, and their
 * buttons answer first.
 */
export const HUD_LETTERS: ReadonlySet<string> = new Set(['L', 'J', 'O']);

/**
 * The build menu's letters (s, Jade's Patch 4): the first letter of the name
 * where it is free, the buildings built most often first, else a letter from
 * the name. Gates list a letter per way, in variant order.
 */
const PLACE_KEYS: Readonly<Record<number, string | readonly string[]>> = {
  [BuildingKind.MainBase]: 'H',
  [BuildingKind.Farm]: 'F',
  [BuildingKind.Barn]: 'R',
  [BuildingKind.Storehouse]: 'S',
  [BuildingKind.FishingDock]: 'I',
  [BuildingKind.Workshop]: 'W',
  [BuildingKind.Forge]: 'G',
  [BuildingKind.ArtilleryWorkshop]: 'A',
  [BuildingKind.Barracks]: 'B',
  [BuildingKind.MagiSanctum]: 'M',
  [BuildingKind.ScholarsLodge]: 'C',
  [BuildingKind.Mineshaft]: 'N',
  // Patch 5: V, for the Tavern's T is the Lights' and its other letters are taken.
  [BuildingKind.Tavern]: 'V',
  // Defences: walls on W and their material, gates and towers on letters of their names.
  [BuildingKind.Wall]: 'W',
  [BuildingKind.WallHardwood]: 'H',
  [BuildingKind.WallStone]: 'S',
  [BuildingKind.Gate]: ['G', 'F'],
  [BuildingKind.GateHardwood]: ['A', 'D'],
  [BuildingKind.GateStone]: ['E', 'U'],
  [BuildingKind.Tower]: 'T',
  [BuildingKind.TowerHardwood]: 'R',
  [BuildingKind.TowerStone]: 'N',
  // Lights: B then T then T is a torch post.
  [BuildingKind.TorchPost]: 'T',
  [BuildingKind.Bonfire]: 'B',
};

/** The submenus' letters (s): D for Defences; T for Lights, as L is Follow. */
const SUBMENU_KEYS: Readonly<Record<string, string>> = { Defences: 'D', Lights: 'T' };

/** What a submenu holds, for its button's name in the settings. */
const SUBMENU_NAMES: Readonly<Record<string, string>> = { Defences: 'Defences (walls, gates, towers)', Lights: 'Lights (torch post, bonfire)' };

function placeKey(kind: number, variant: number): string {
  const k = PLACE_KEYS[kind];
  const letter = typeof k === 'string' ? k : (k?.[variant] ?? '');
  return letter ? `Key${letter}` : '';
}

/** Words a letter is never taken from the start of. */
const SMALL_WORDS = new Set(['A', 'AN', 'AND', 'FROM', 'OF', 'OR', 'THE', 'TO']);

/**
 * Letters for a menu's buttons, in order (s, Jade's Patch 4): each takes the
 * first free initial of a word of its name, else the first free letter of
 * its name; with none free it is a click only (''), as its letter would mean
 * nothing. A word every button shares ("Slaughter" at the Barn) and a count
 * in brackets do not count. Never J, L or O (HUD_LETTERS).
 */
export function menuLetters(names: readonly string[]): string[] {
  const words = names.map((n) =>
    n
      .replace(/\([^)]*\)/g, ' ')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((w) => w !== '' && !SMALL_WORDS.has(w)),
  );
  const shared = names.length > 1 ? new Set(words[0]!.filter((w) => words.every((ws) => ws.includes(w)))) : new Set<string>();
  const taken = new Set(HUD_LETTERS);
  return words.map((all) => {
    const own = all.filter((w) => !shared.has(w));
    const ws = own.length > 0 ? own : all;
    const order = [...ws.map((w) => w[0]!), ...ws.join('')];
    const c = order.find((x) => !taken.has(x));
    if (!c) return '';
    taken.add(c);
    return c;
  });
}

/** The buildings with a K menu, in the build menu's order (Patch 5: not one that makes a single good, which is on its card as Make rope or Make sticks). */
const MAKERS: readonly number[] = BUILDINGS.filter((b) => b.slot > 0 && makeList(b.kind).length > 0 && !makesOne(b.kind))
  .sort((a, b) => a.slot - b.slot)
  .map((b) => b.kind);

/** The products of a building kind's K menu, in its order: everything it makes but workers, troops and mages. */
export function makeList(kind: number): number[] {
  return productsOf({ kind, complete: true, level: 1 } as Parameters<typeof productsOf>[0]).filter((p) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT);
}

/** Whether a building kind makes one good and no research, so its card has Make <good> on K and no menu (Patch 5). */
export function makesOne(kind: number): boolean {
  const list = makeList(kind);
  return list.length === 1 && productSpec(list[0]!).recipe !== undefined;
}

/** Every K menu's default letters, by binding name. */
const MAKE_KEYS: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const kind of MAKERS) {
    const list = makeList(kind);
    const letters = menuLetters(list.map((p) => productSpec(p).name));
    list.forEach((p, k) => out.set(makeAction(kind, p), letters[k] ? `Key${letters[k]}` : ''));
  }
  return out;
})();

/** The build menu's buttons as hotkeys, for the settings list: the menu, then each submenu (a group each, as each fills the card alone). */
export function buildMenuActions(): Action[] {
  const out: Action[] = [];
  const slots = menuSlots();
  for (const specs of slots) {
    const group = specs[0]?.group;
    if (group) out.push({ id: submenuAction(group), name: SUBMENU_NAMES[group] ?? group, key: `Key${SUBMENU_KEYS[group] ?? ''}`, group: 'Build menu' });
    else if (specs[0]) out.push({ id: placeAction(specs[0].kind, 0), name: specs[0].name, key: placeKey(specs[0].kind, 0), group: 'Build menu' });
  }
  out.push({ id: MORE_ACTION, name: 'More: the next page of a menu too long for the card (build and K menus)', key: 'Equal', group: 'Build menu' });
  for (const specs of slots) {
    const group = specs[0]?.group;
    if (!group) continue;
    for (const c of submenuChoices(specs)) out.push({ id: placeAction(c.spec.kind, c.variant), name: c.name, key: placeKey(c.spec.kind, c.variant), group: `Build menu: ${group}` });
  }
  return out;
}

/** Every K menu's products as hotkeys, for the settings list: a group per building. */
export function makeMenuActions(): Action[] {
  const out: Action[] = [];
  for (const kind of MAKERS) {
    for (const p of makeList(kind)) out.push({ id: makeAction(kind, p), name: productSpec(p).name, key: MAKE_KEYS.get(makeAction(kind, p)) ?? '', group: `${buildingSpec(kind).name} menu` });
  }
  return out;
}
