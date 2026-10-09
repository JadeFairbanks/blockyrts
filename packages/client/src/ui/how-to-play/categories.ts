// How to Play's sections of pages, in the order a player looks for things.
// Each section gathers one or more of the balance catalog's groups (the
// same grouping the balance tools use), so every table the sim exports has
// a home here. A group no section names lands in "More numbers", so a new
// table shows up without anyone touching this file; give it a proper home
// by adding its group id to a section below.

export interface Category {
  id: string;
  label: string;
  /** One line under the section's name on the front page. */
  blurb: string;
  /** Its picture: a file of the interface kit, without .png. */
  picture: string;
  /** The balance catalog's group ids it gathers, in this order. */
  groups: readonly string[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'buildings',
    label: 'Buildings',
    blurb: 'Everything you can build: what it costs, how long it takes, its health and what it unlocks.',
    picture: 'icon_main_base_l3',
    groups: ['buildings', 'land'],
  },
  {
    id: 'units',
    label: 'Workers and troops',
    blurb: 'Your people: health, speed, sight, ranks and experience, training and upgrades.',
    picture: 'icon_train_warrior_sword',
    groups: ['units', 'training'],
  },
  {
    id: 'gear',
    label: 'Weapons, armour and tools',
    blurb: 'Every tier of weapon, armour, shield, tool, wand and robe, with its numbers and what it takes to make.',
    picture: 'icon_sword_iron_wrought',
    groups: ['melee', 'ranged', 'armour', 'tools', 'wands'],
  },
  {
    id: 'magic',
    label: 'Mages and spells',
    blurb: 'Mage ranks, mana, and every spell: its cost, cooldown, range and power.',
    picture: 'icon_train_mage_battle',
    groups: ['magic'],
  },
  {
    id: 'siege',
    label: 'Mounts and siege engines',
    blurb: 'Horses and other mounts, charges, catapults, ballistas and cannons.',
    picture: 'icon_train_cannon',
    groups: ['siege'],
  },
  {
    id: 'research',
    label: 'Research',
    blurb: 'What each step of research costs, how long it takes and what it opens up.',
    picture: 'icon_scriptorium',
    groups: ['research'],
  },
  {
    id: 'crafting',
    label: 'Crafting',
    blurb: 'What each workshop turns into what: ingredients, results, time and where.',
    picture: 'icon_forge_l1',
    groups: ['recipes'],
  },
  {
    id: 'items',
    label: 'Items and resources',
    blurb: 'Every resource and item: where it comes from, its weight, its food value and its trade worth.',
    picture: 'icon_softwood_lumber',
    groups: ['resources'],
  },
  {
    id: 'food',
    label: 'Food and farming',
    blurb: 'Meals, healing, hunger, farms and the upkeep your people and buildings need.',
    picture: 'icon_farm_fare',
    groups: ['food'],
  },
  {
    id: 'animals',
    label: 'Animals',
    blurb: 'Wild and tame animals: health, speed, what they give, taming and the Barn.',
    picture: 'portrait_deer',
    groups: ['animals'],
  },
  {
    id: 'monsters',
    label: 'Monsters',
    blurb: 'Every creature of the night: health, damage, speed, what it drops and when it first comes.',
    picture: 'portrait_zombie',
    groups: ['mobs'],
  },
  {
    id: 'lairs',
    label: 'Lairs and tribes',
    blurb: 'Lairs and their hoards, hostile tribes and goblin villages.',
    picture: 'minimap_lair',
    groups: ['lairs'],
  },
  {
    id: 'peoples',
    label: 'Peoples and trade',
    blurb: 'Halflings, Runkin, Elves, Dwarves and mercenaries: their people, prices, moods and wars.',
    picture: 'portrait_dwarf_villager',
    groups: ['peoples'],
  },
  {
    id: 'world',
    label: 'The world',
    blurb: 'Land, trees, rocks, ores, mining, digging, how units move over the ground, and the stone circles.',
    picture: 'icon_stone',
    groups: ['world', 'circles'],
  },
  {
    id: 'rules',
    label: 'Game rules',
    blurb: 'The day and night clock, hunting and gathering, loot, working through the night and the questions your units ask.',
    picture: 'icon_cmd_gather',
    groups: ['pacing', 'loot', 'nightwork', 'questions'],
  },
  {
    id: 'more',
    label: 'More numbers',
    blurb: 'Numbers not yet sorted into a section above.',
    picture: 'icon_scriptorium',
    groups: ['other'],
  },
];

/** Where a catalog group with no section of its own goes. */
export const FALLBACK_CATEGORY = 'more';

/**
 * Catalog groups How to Play leaves out. None since Patch 5 retired the old
 * design document's tables group; every number the game uses is shown, live,
 * in the sections above.
 */
export const LEFT_OUT_GROUPS: ReadonlySet<string> = new Set<string>();

/**
 * Sub-headings for pages from a section's second and later groups that have
 * no sub-menu of their own (the "Game rules" section holds four groups).
 */
export const GROUP_HEADINGS: Readonly<Record<string, string>> = {
  land: 'Claimed land and lights',
  training: 'Training and upgrades',
  pacing: 'Day and night',
  loot: 'Hunting, gathering and loot',
  nightwork: 'Working through the night',
  questions: 'Questions your units ask',
  units: 'Units and ranks',
  circles: 'Stone circles',
};

/** The catalog's sub-menu names, as How to Play's sidebar shows them. */
export const MENU_NAMES: Readonly<Record<string, string>> = {
  'Rules and settings': 'Rules',
  // Monsters, by what they are to a player.
  'Night mobs': 'Night monsters',
  'Resident mobs': 'Lair residents',
  'Tribe mobs': 'Tribesmen',
  'Village mobs': 'Goblin villagers',
  'Structure mobs': 'Lairs and buildings',
  'People mobs': "The peoples' wagons",
  'Encounter mobs': "The stone circles' keepers",
  // Animals, by how they act.
  'Shy animals': 'Shy',
  'Fights back animals': 'Fight back when hurt',
  'Pack animals': 'Hunt in packs',
  'Stalker animals': 'Stalkers',
  'Territorial animals': 'Territorial',
  'Torch breaker animals': 'Break torches',
  'Bear animals': 'Bears',
  'Nest animals': 'Guard their nests',
  'Hunter animals': 'Hunters',
  // Goods.
  'Goods resources': 'Goods',
  'Trinkets resources': 'Trinkets',
  'Food resources': 'Food',
  'Gear resources': 'Gear',
};

export function categoryOf(group: string): string {
  return CATEGORIES.find((c) => c.groups.includes(group))?.id ?? FALLBACK_CATEGORY;
}
