// How the sim's exports map onto the editor: which group each belongs in,
// which are engine plumbing rather than balance, what unit and what kind of
// reference each key holds, and readable names. Everything not listed here
// still shows (under "Other numbers"), so a new table is never hidden.

import type { UnitId } from './units.ts';

export interface GroupSpec {
  id: string;
  label: string;
  blurb: string;
}

/** The editor's top menu, in the blueprint's order. */
export const GROUPS: readonly GroupSpec[] = [
  { id: 'buildings', label: 'Buildings and levels', blurb: 'Every building and each of its levels: cost, build work, health, supply, what it needs and what it unlocks.' },
  { id: 'research', label: 'Research', blurb: 'Research steps: what each needs first, its fee, its time and what it opens.' },
  { id: 'units', label: 'Units and ranks', blurb: 'Workers and warriors: health, speed, sight, training, ranks and experience, carrying.' },
  { id: 'tools', label: 'Tools', blurb: 'Workers\' tool kits by tier (Table 2c): the tool tier each job gets, a worker\'s blow, cost and time to make; how fast each tool tier works, and the prospecting hammer.' },
  { id: 'melee', label: 'Melee weapons', blurb: 'Table 2d. Close melee (one-handed, with a shield from the armour) and long melee and cavalry (two-handed, a critical in the outer third of reach) by tier: damage, swing time, reach, cost and time to make.' },
  { id: 'ranged', label: 'Ranged weapons', blurb: 'Table 2e. The ranger\'s ladder from sling to musket and the brawler\'s pistol and cutlass: damage, attack time, range, spread, cost and time to make; what flies and how. Ammunition is unlimited.' },
  { id: 'armour', label: 'Armour and shields', blurb: 'Table 3. Armour by tier for every troop (body, helmet and boots in one) and close melee\'s shields, which come with the armour: protection, block, cost and time to make.' },
  { id: 'training', label: 'Training and upgrades', blurb: 'Table 7. What a troop, worker or mage costs to train, what each material tier needs (forge level and research), upgrade time and refund, and specialist training.' },
  { id: 'wands', label: 'Wands and robes', blurb: 'Table 13. Mages\' wands (spell power and extra mana) and robes (protection and mana regain) by tier: cost, time to make and what they need.' },
  { id: 'magic', label: 'Mages and spells', blurb: 'Mage ranks, mana and refill, the combat pause, rank training at the Magi Sanctum, and every spell (Table 13): mana, cooldown, range, power, radius and duration.' },
  { id: 'siege', label: 'Mounts, siege and guns', blurb: 'Mounts and charges (Table 14): health, armour, heights, paces, the charge run and knockback, the mounted rules and the riders\' upkeep; siege engines and cannons (Table 2f): health, damage, range, reload, crew, haul and push speeds, munitions, recipes, and the Citadel\'s cannon ports.' },
  { id: 'recipes', label: 'Recipes', blurb: 'What production buildings turn into what: inputs, outputs, time and where.' },
  { id: 'food', label: 'Food and rations', blurb: 'Eating, healing, starving, cooking and the upkeep of units and facilities.' },
  { id: 'animals', label: 'Animals', blurb: 'Wild and tame animals: health, speed, meat and hides, taming and breeding.' },
  { id: 'loot', label: 'Loot, hunting and gathering', blurb: 'What kills drop and who carries it: the loot bag, how near units pick loot up by themselves, how long it lies, when a find is remarked on; how far Hunt and Gather go from home (back by nightfall), what Gather fetches and how far into the unknown it looks, and fighters coming to a worker\'s help.' },
  { id: 'mobs', label: 'Mobs and nights', blurb: 'Night monsters, the first night, spawning, blood and fog nights, special attacks.' },
  { id: 'lairs', label: 'Lairs, tribes and villages', blurb: 'Lairs and their hoards, hostile tribe bands, goblin villages and war.' },
  { id: 'peoples', label: 'Neutral peoples and trade', blurb: 'Halflings, Runkin, Elves and Dwarves, and the mercenary camps: their villages and people, what they pay and sell (Table 19), daily limits and restock, moods, war, surrender and plunder, raids, caravans and hiring.' },
  { id: 'land', label: 'Claimed land and lights', blurb: 'Claimed land round buildings and lights, outlying lights and relighting. Lights need no fuel (Patch 2).' },
  { id: 'resources', label: 'Resources and trade', blurb: 'Every resource: weight, nutrition and the starting stock; trade values and trinkets.' },
  { id: 'world', label: 'World and terrain', blurb: 'Trees, rocks and other props, materials, mining and prospecting, digging and movement over terrain.' },
  { id: 'questions', label: 'Questions', blurb: 'The yes-or-no questions units and buildings ask their owner (Patch 2): how long one waits for an answer, how many a player has open at once, how hurt a unit is before it asks to eat, and how near others must stand for one to speak for them.' },
  { id: 'pacing', label: 'Pacing', blurb: 'The day and night clock and the other timings everything else counts in.' },
  { id: 'other', label: 'Other numbers', blurb: 'Numbers in the sim that no other group claims yet. New tables show up here until they are given a home.' },
  { id: 'tables', label: 'Blueprint tables (read only)', blurb: 'The blueprint\'s numbered tables as the sim reads them, for reference. Change these through the blueprint, not here.' },
];

/** Modules that hold no balance at all: maths, serialisation, ids, the state layout. */
export const SKIP_MODULES: ReadonlySet<string> = new Set([
  'index.ts', 'fixed.ts', 'trig-table.ts', 'serialize.ts', 'bytes.ts', 'rng.ts', 'replay.ts', 'step.ts', 'commands.ts',
  'data/tables.ts', 'data/table-types.ts', 'world/chunk.ts', 'world/serialize-world.ts', 'world/delta.ts', 'world/noise.ts',
  'nav/path.ts', 'threats/debug.ts', 'threats/types.ts', 'buildings/store.ts', 'combat/fields.ts', 'combat/space.ts',
  'magic/cast.ts', 'units/names.ts', 'peoples/orders.ts', 'peoples/hooks.ts', 'peoples/speech.ts', 'peoples/types.ts',
]);

/** Single exports that are plumbing, ids or names rather than balance. */
export const SKIP_EXPORTS: ReadonlySet<string> = new Set([
  'state.ts:UNIT_FIELDS', 'state.ts:PLAYER_FIELDS', 'state.ts:MONSTERS', 'state.ts:NEUTRAL', 'state.ts:WILD', 'state.ts:NO_CARRY',
  'state.ts:FOG_INTERVAL_STEPS', 'units/behaviour.ts:ARRIVED', 'units/behaviour.ts:FAILED', 'units/behaviour.ts:MOVING',
  'units/behaviour.ts:PATH_SEARCHES_PER_STEP', 'units/tools.ts:TOOL_FIELDS', 'buildings/chains.ts:STRETCH_DIRS',
  // Building shapes (one per level) and an enter order's flag: layout and plumbing, not balance.
  'buildings/footprints.ts:FOOTPRINTS', 'units/unit-orders.ts:ENTER_TOP',
  // The peoples' names, lines and id offsets: words and plumbing, not balance. The special trinket multiplier is a copy of rules.ts's.
  'peoples/data.ts:PEOPLE_NAMES', 'peoples/data.ts:PERSON_NAMES', 'peoples/data.ts:FACTION_KIND_NAMES', 'peoples/data.ts:KIND_PEOPLE',
  'peoples/data.ts:CAT_COUNT', 'peoples/data.ts:CAT_NAMES', 'peoples/data.ts:REFUSE', 'peoples/data.ts:LIVE_GOODS', 'peoples/data.ts:ENGINE_GOODS',
  'peoples/data.ts:LINES', 'peoples/data.ts:TREE_WARNING_LINES', 'peoples/data.ts:REPARATIONS_PAID_LINE', 'peoples/data.ts:MERC_LINES',
  'peoples/data.ts:REMARKS', 'peoples/data.ts:NAME_PARTS', 'peoples/data.ts:ELF_KINGDOM_NAME', 'peoples/data.ts:LEADER_NAMES',
  'peoples/data.ts:SPECIAL_TRINKET_MULT_TENTHS', 'peoples/data.ts:THINK_STEPS', 'peoples/data.ts:RECAMP_SEARCH_CELLS', 'peoples/trade.ts:UNTIL_DAWN',
  'combat/mob-ai.ts:MOB_SEARCHES_PER_STEP', 'combat/fight.ts:SKILL_ARCHERY', 'animals/animals.ts:STOCK_CHECK_STEPS',
  'economy/resources.ts:RESOURCE_COUNT',
  // The food kinds' lists (which goods are meats and fish, in the inventory's order) and the meal accounts' unit.
  'economy/food-kinds.ts:MEATS', 'economy/food-kinds.ts:FISHES', 'economy/food.ts:QUARTERS',
  'economy/resources.ts:TRINKET_BASE', 'economy/resources.ts:FOODS', 'economy/resources.ts:TRINKET_METALS', 'economy/resources.ts:TRINKET_TIERS',
  'world/materials.ts:MATERIAL_COUNT', 'world/world.ts:CHUNK_CACHE_BUDGET', 'world/world.ts:FOG_TILES_PER_CHUNK', 'world/world.ts:FOG_TILE_COLUMNS',
  'world/layout.ts:CELL_RING_SHIFT', 'world/layout.ts:BAND_NAMES', 'world/layout.ts:EDGE_NAMES', 'world/layout.ts:LOOK_NAMES',
  'buildings/mining.ts:RATING_NAMES', 'buildings/placement.ts:BLOCKED_TEXT', 'economy/food.ts:RATIONS_TEXT', 'clock.ts:PERIOD_NAMES',
  'clock.ts:NO_BLOOD', 'combat/combat.ts:RANK_NAMES', 'rules.ts:BP', 'rules.ts:XP_TENTHS', 'rules.ts:VP_SOFTWOOD_LUMBER',
  'commands.ts:FLOW_FIELD_GROUP', 'nav/grid.ts:WALKER', 'nav/grid.ts:PERSON', 'nav/grid.ts:PERSON_ARMOURED', 'nav/grid.ts:CLIMBER',
  'nav/grid.ts:CLIMBER_PLAN', 'nav/grid.ts:MOB_PLAN', 'nav/grid.ts:SWIMMER', 'nav/grid.ts:WHEELS', 'world/props.ts:PROPS:check',
  // Mana's fixed-point scale, the rank count, and tables worked out from MAGE_RANKS.
  'magic/spells.ts:MANA_SCALE', 'magic/spells.ts:MAGE_TOP_RANK', 'magic/mages.ts:MAGE_XP_TENTHS', 'magic/mages.ts:MAGE_RANK_NAMES',
  // The engines' shot ids and the list of engines a player can make.
  'siege/data.ts:ENGINE_SHOT', 'siege/data.ts:PLAYER_ENGINES',
  // Troops and gear: the troop types' names and keys, the top tiers (the tables' lengths), and the gear catalogue, which
  // is worked out from the kit tables (change the kit rows instead) or holds the peoples' fixed gear.
  'units/kits.ts:TROOP_TYPES', 'units/kits.ts:TROOP_NAMES', 'units/kits.ts:TROOP_TIER_NAMES', 'units/kits.ts:TROOP_KEYS', 'units/kits.ts:TOP_TIER', 'units/kits.ts:TOP_MAGE_TIER',
  'units/kits.ts:GEAR', 'units/kits.ts:PeopleGear', 'units/kits.ts:CLOSE_GEAR', 'units/kits.ts:LONG_GEAR', 'units/kits.ts:RANGER_GEAR',
  'units/kits.ts:PISTOL_GEAR', 'units/kits.ts:ARMOUR_GEAR', 'units/kits.ts:SHIELD_GEAR', 'units/kits.ts:TOOL_GEAR', 'units/kits.ts:WAND_GEAR',
  'units/kits.ts:ROBE_GEAR',
]);

/** Where each module's exports go; `exports` overrides a module's group for single exports. */
export const MODULE_GROUPS: Readonly<Record<string, string>> = {
  'buildings/data.ts': 'buildings',
  'buildings/placement.ts': 'buildings',
  'buildings/chains.ts': 'buildings',
  'buildings/production.ts': 'units',
  'buildings/recipes.ts': 'recipes',
  'buildings/lights.ts': 'land',
  'buildings/mining.ts': 'world',
  'combat/items.ts': 'ranged',
  'combat/projectiles.ts': 'ranged',
  'combat/mobs.ts': 'mobs',
  'combat/spawn.ts': 'mobs',
  'combat/mob-ai.ts': 'mobs',
  'combat/combat.ts': 'units',
  'combat/fight.ts': 'units',
  'combat/deaths.ts': 'units',
  'units/behaviour.ts': 'units',
  'units/gear.ts': 'training',
  'units/questions.ts': 'questions',
  'units/kits.ts': 'training',
  'units/weight.ts': 'units',
  'units/field.ts': 'animals',
  'units/loot.ts': 'loot',
  'units/forage.ts': 'loot',
  'units/dig.ts': 'world',
  'state.ts': 'units',
  'economy/food.ts': 'food',
  'economy/food-kinds.ts': 'food',
  'economy/resources.ts': 'resources',
  'animals/species.ts': 'animals',
  'animals/animals.ts': 'animals',
  'threats/data.ts': 'lairs',
  'threats/abilities.ts': 'lairs',
  'magic/spells.ts': 'magic',
  'magic/mages.ts': 'magic',
  'magic/cast.ts': 'magic',
  'threats/burns.ts': 'lairs',
  'peoples/data.ts': 'peoples',
  'peoples/stock.ts': 'peoples',
  'peoples/trade.ts': 'peoples',
  'peoples/war.ts': 'peoples',
  'peoples/ai.ts': 'peoples',
  'peoples/factions.ts': 'peoples',
  'threats/nights.ts': 'mobs',
  'threats/fog.ts': 'mobs',
  'world/materials.ts': 'world',
  'world/props.ts': 'world',
  'world/start.ts': 'world',
  'world/world.ts': 'world',
  'world/layout.ts': 'world',
  'world/generate.ts': 'world',
  'nav/grid.ts': 'world',
  'clock.ts': 'pacing',
  'rules.ts': 'units',
  'data/number-tables.ts': 'tables',
  'mounts/data.ts': 'siege',
  'mounts/riding.ts': 'siege',
  'siege/data.ts': 'siege',
  'siege/engines.ts': 'siege',
  'threats/late-mobs.ts': 'mobs',
  'threats/boss.ts': 'mobs',
  'threats/wanderers.ts': 'mobs',
};

export const EXPORT_GROUPS: Readonly<Record<string, string>> = {
  // Tunnel chains go with digging; the wall chain's stretch stays with the buildings.
  'buildings/chains.ts:TUNNEL_STRETCH_MAX_COLUMNS': 'world',
  'buildings/chains.ts:TUNNEL_WIDTH_COLUMNS': 'world',
  'buildings/chains.ts:TUNNEL_HEIGHT_UNITS': 'world',
  'buildings/chains.ts:TUNNEL_MIN_UNITS': 'world',
  'buildings/chains.ts:TUNNEL_MAX_UNITS': 'world',
  'buildings/data.ts:WORKER_TRAIN_STEPS': 'training',
  'buildings/data.ts:WORKER_FOOD': 'training',
  'buildings/data.ts:BUILDING_CLAIM_M': 'land',
  'buildings/data.ts:OUTLYING_M': 'land',
  'buildings/data.ts:RELIGHT_STEPS': 'land',
  'buildings/data.ts:FARM_HARVEST_STEPS': 'food',
  'buildings/data.ts:FARM_TIER_PER_MILLE': 'food',
  'buildings/production.ts:SLAUGHTER_STEPS': 'food',
  'buildings/production.ts:SLAUGHTERED': 'food',
  'buildings/production.ts:PRODUCTS': 'buildings',
  'buildings/recipes.ts:COOK_STEPS_PER_ITEM': 'food',
  'buildings/recipes.ts:COOK_BATCH': 'food',
  'buildings/recipes.ts:TRINKET_STEPS': 'resources',
  'buildings/recipes.ts:TRINKET_INGOTS': 'resources',
  'combat/items.ts:RESEARCH': 'research',
  'combat/spawn.ts:CLAIM_STANDOFF_M': 'mobs',
  'rules.ts:DAY_STEPS': 'pacing',
  'rules.ts:DUSK_STEPS': 'pacing',
  'rules.ts:NIGHT_STEPS': 'pacing',
  'rules.ts:DAWN_STEPS': 'pacing',
  'rules.ts:CYCLE_STEPS': 'pacing',
  'rules.ts:NUTRITION_PER_CYCLE': 'food',
  'rules.ts:TRINKET_MULTIPLIER_TENTHS': 'resources',
  'rules.ts:SPECIAL_TRINKET_MULTIPLIER_TENTHS': 'resources',
  'rules.ts:LAIR_CLEAR_XP_TENTHS': 'lairs',
  'rules.ts:LAIR_CLEAR_RADIUS_M': 'lairs',
  'rules.ts:HEX_SLOW_BP': 'lairs',
  'rules.ts:ARMOUR_CAP_BP': 'armour',
  'threats/data.ts:BLOOD_FLOOR_NIGHT': 'mobs',
  'threats/data.ts:BLOOD_SHARE_PM': 'mobs',
  'threats/data.ts:FOG_CHANCE_PCT': 'mobs',
  'threats/data.ts:FOG_FROM_NIGHT': 'mobs',
  'threats/data.ts:DEPTH_PM': 'mobs',
  'threats/data.ts:DEPTH_AHEAD': 'mobs',
  'units/behaviour.ts:RESIN_PER_SOFTWOOD_TREE': 'world',
  'units/behaviour.ts:TOOL_SPEED_PER_MILLE': 'tools',
  // Troops and gear: one group per blueprint table; TRAINING and TIER_NEEDS stay with the module's default (training).
  'units/kits.ts:TOOL_KITS': 'tools',
  'units/kits.ts:PROSPECT_TOOL_TIER': 'tools',
  'units/kits.ts:CLOSE_KITS': 'melee',
  'units/kits.ts:LONG_KITS': 'melee',
  'units/kits.ts:CRIT': 'melee',
  'units/kits.ts:RANGER_KITS': 'ranged',
  'units/kits.ts:BRAWLER_KIT': 'ranged',
  'units/kits.ts:ARMOUR_KITS': 'armour',
  'units/kits.ts:SHIELD_KITS': 'armour',
  'units/kits.ts:WAND_KITS': 'wands',
  'units/kits.ts:ROBE_KITS': 'wands',
  'economy/food.ts:FACILITY_UPKEEP': 'food',
  // Jade's play-test notes: the Hunt button's reach and trips home, and fighters guarding workers, go with loot and gathering.
  'units/field.ts:HUNT_LEASH_WU': 'loot',
  'units/field.ts:HUNT_HOME_PCT': 'loot',
  'combat/fight.ts:GUARD_HELP_M': 'loot',
};

/** Arrays of named records: each record is an entry in the menu. The value says how to file it in a sub-menu. */
export const ENTRY_ARRAYS: ReadonlySet<string> = new Set([
  'buildings/data.ts:BUILDINGS', 'combat/items.ts:RESEARCH', 'combat/items.ts:SHOTS', 'buildings/recipes.ts:RECIPES',
  'combat/mobs.ts:MOBS', 'animals/species.ts:SPECIES', 'economy/resources.ts:RESOURCES', 'threats/data.ts:LAIRS', 'threats/data.ts:TRIBES',
  'world/materials.ts:MATERIALS', 'world/props.ts:PROPS', 'threats/abilities.ts:ABILITIES', 'buildings/production.ts:PRODUCTS',
  'magic/spells.ts:SPELLS', 'magic/spells.ts:MAGE_RANKS', 'peoples/data.ts:PEOPLE_UNITS', 'mounts/data.ts:MOUNTS', 'siege/data.ts:ENGINES',
  'units/kits.ts:TIER_NEEDS', 'units/kits.ts:TOOL_KITS', 'units/kits.ts:CLOSE_KITS', 'units/kits.ts:LONG_KITS', 'units/kits.ts:RANGER_KITS',
  'units/kits.ts:ARMOUR_KITS', 'units/kits.ts:SHIELD_KITS', 'units/kits.ts:WAND_KITS', 'units/kits.ts:ROBE_KITS',
]);

/** Single records shown as an entry of their own, like one row of an entry array. */
export const ENTRY_RECORDS: ReadonlySet<string> = new Set(['units/kits.ts:BRAWLER_KIT']);

/**
 * Troops and gear: the kit tables' sub-menus, by export. Each row is a tier of
 * kit, labelled "Tier 4: Bronze shortsword" (shields by name: their tier is
 * the armour's they come with).
 */
export const KIT_MENUS: Readonly<Record<string, string>> = {
  TIER_NEEDS: 'Material tiers', TOOL_KITS: 'Tool kits', CLOSE_KITS: 'Close melee', LONG_KITS: 'Long melee and cavalry', RANGER_KITS: 'Rangers',
  BRAWLER_KIT: 'Brawlers', ARMOUR_KITS: 'Armour', SHIELD_KITS: 'Shields (close melee)', WAND_KITS: 'Wands', ROBE_KITS: 'Robes',
};
/** Kit tables whose rows are not labelled by their tier. */
export const UNTIERED_KITS: ReadonlySet<string> = new Set(['SHIELD_KITS']);

/**
 * Rows that are placeholders, not kit: a tier with nothing in it (no long
 * weapon at tier 0, no armour, no tools, no wand). Close melee's tier 0 is
 * the fist fighter's fists and stays. Retired research is left out the same way.
 */
export const PLACEHOLDER_ROWS: ReadonlySet<string> = new Set([
  'units/kits.ts:LONG_KITS:0', 'units/kits.ts:RANGER_KITS:0', 'units/kits.ts:ARMOUR_KITS:0', 'units/kits.ts:SHIELD_KITS:0', 'units/kits.ts:TOOL_KITS:0',
  'units/kits.ts:WAND_KITS:0', 'units/kits.ts:ROBE_KITS:0',
]);


/** Kinds of thing a number can point at. Each has a list of names, and most have entries the editor can jump to. */
export type RefKind =
  | 'res' | 'mob' | 'research' | 'building' | 'gear' | 'shot' | 'tool' | 'toolJob' | 'tierNeed' | 'nature' | 'moves' | 'sun' | 'comes' | 'role'
  | 'lairSite' | 'band' | 'hit' | 'made' | 'species' | 'material' | 'digClass' | 'rations' | 'resGroup' | 'unitKind'
  | 'people' | 'faction' | 'cat' | 'peopleUnit' | 'trinketMetal';

/** Keys that hold a reference, wherever they appear; `EXPORT:key` overrides by export. */
export const REF_KEYS: Readonly<Record<string, RefKind>> = {
  res: 'res', fuel: 'res', mob: 'mob', guardians: 'mob', spawns: 'mob', research: 'research', research2: 'research', after: 'research',
  shot: 'shot', nature: 'nature', moves: 'moves', sun: 'sun', comes: 'comes', role: 'role', site: 'lairSite', minBand: 'band',
  bands: 'band', tameAt: 'building', tameFoods: 'res', hit: 'hit', made: 'made', group: 'resGroup', dig: 'digClass',
  'PROPS:tool': 'tool', 'SLAUGHTERED:*': 'species', 'FOODS:*': 'res', 'MEAT_BY_SPECIES:*': 'res',
  'RESEARCH:at': 'building', 'SKILL_TRAINING:at': 'building', 'ENGINES:munition': 'res', 'MOUNTS:species': 'species',
  'PEOPLE_UNITS:people': 'people', 'PEOPLE_UNITS:weapon': 'gear', 'PEOPLE_UNITS:ranged': 'gear', 'PEOPLE_UNITS:armour': 'gear', 'PEOPLE_UNITS:shield': 'gear',
  RUNKIN_WOLF: 'species', ELF_BEAR: 'species', 'TRADE_BUILDINGS:*': 'mob', 'PLUNDER_GOODS:*': 'res', 'MERC_UNITS:*': 'peopleUnit',
  // Troops and gear: a kit row's material tier, and a tool kit's tool tier for each job.
  need: 'tierNeed', 'TOOL_KITS:tools': 'tool',
};

/** Keys that are identity, layout or prose: shown, not edited. */
export const READ_ONLY_KEYS: ReadonlySet<string> = new Set([
  'id', 'kind', 'live', 'comesWith', 'menu', 'slot', 'craftSlot', 'w', 'd', 'solid', 'variants', 'turns', 'product', 'key', 'colour',
  'defence', 'dropoff', 'site', 'raw', 'shape', 'trainsWorkers', 'heavy', 'oneHanded', 'tip', 'BUILDINGS:slot',
  'SPELLS:school', 'SPELLS:projectile', 'MAGE_RANKS:rank', 'MAGE_RANK_TRAINING:rank', 'PEOPLE_UNITS:people',
  // The peoples' gear is fixed rows of the gear catalogue (Troops and gear), not numbers to tune here.
  'PEOPLE_UNITS:weapon', 'PEOPLE_UNITS:ranged', 'PEOPLE_UNITS:armour', 'PEOPLE_UNITS:shield',
  // A kit row's tier is its place in the table, and its material tier follows from it (a shield's from the armour it comes with).
  'need', 'TIER_NEEDS:tier', 'TOOL_KITS:tier', 'CLOSE_KITS:tier', 'LONG_KITS:tier', 'RANGER_KITS:tier', 'BRAWLER_KIT:tier', 'ARMOUR_KITS:tier',
  'SHIELD_KITS:tier', 'WAND_KITS:tier', 'ROBE_KITS:tier',
  // A growth stage's place in the order (world/props.ts Stage): the stages are named by it.
  'TREE_GROWTH:stage', 'HAZEL_GROWTH:stage', 'PLANT_GROWTH:stage',
]);

/** Keys whose text is the record's own words for the tooltip; other strings show as notes. */
export const TEXT_KEYS: Readonly<Record<string, string>> = {
  purpose: 'Purpose', gives: 'Gives or unlocks', opens: 'Opens', needs: 'Also needs', comesWith: 'Comes with', later: 'Comes later',
  source: 'Where it comes from', tooltip: 'Tooltip', row: 'Blueprint row', yields: 'Yields', resource: 'Gives', munition: 'Loads',
  ammoFor: 'Ammunition for', youngVariant: 'Young look', short: 'Short name', text: 'Tooltip', called: 'Called in the game',
};
/** Strings never shown, and `EXPORT:key` values of any kind (a stock row's good: its title names it). */
export const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'name', 'model', 'STOCK:good', 'CARAVAN_GOODS:good',
  // A tool kit's words and looks for each job, and the kit pieces a product carries (they are the kit rows, shown under their own groups).
  'TOOL_KITS:names', 'TOOL_KITS:models', 'PRODUCTS:pieces',
]);

/** Readable names for keys, used before the generic split of camelCase. */
export const KEY_LABELS: Readonly<Record<string, string>> = {
  speed10: 'Walking speed', walkShoot: 'Shoots while walking', fighter: 'Fighter (villagers flee instead)', ringWu: 'Buildings stand this far out',
  structures: 'Buildings', animals: 'Animals kept', good: 'Good', 'STOCK:count': 'Held when full', 'CARAVAN_GOODS:count': 'Held when full',
  'STOCK:pct': 'Sells at (of its worth)', 'CARAVAN_GOODS:pct': 'Sells at (of its worth)', price: 'Set price', daily: 'Refills every dawn',
  sells: 'Sells cheap', lacks: 'Pays extra for', LEAVE_WU: 'Leave distance', LEAVE_STEPS: 'Leave after', 'GROVESINGER:treeWu': 'Counts as near a tree within',
  'GROVESINGER:nearTreeRefill': 'Refill near trees (hundredths a second)', 'GROVESINGER:barrenRefill': 'Refill in the Barrens (hundredths a second)',
  'ONE_IN:runkin': 'Runkin camps', 'ONE_IN:colony': 'Dwarf colonies', 'ONE_IN:city': 'Dwarf cities', 'ONE_IN:merc': 'Mercenary camps', 'ONE_IN:caravan': 'Elf caravans',
  RUNKIN_WOLF: 'Runkin camp animal', ELF_BEAR: 'Elf kingdom animal', ONE_IN: 'Found in one cell in so many (0 for never)',
  res: 'Resource', hexcraft: 'Needs Hexcraft', projectile: 'Flies (walls and trees stop it)', auto: 'Cast by herself', bp: 'Strength',
  refill: 'Refill (hundredths of a point a second)', crystals: 'Mana crystals', amount: 'Healing or damage', 'RESEARCH:at': 'Researched at',
  'melee:min': 'Shortest reach', 'ranged:min': 'Shortest range', ws: 'Build work', hp: 'Health', health: 'Health', vsWalls: 'Damage to walls', threatTenths: 'Threat', xpTenths: 'Experience',
  chancePm: 'Chance', weightTenthsLb: 'Weight', needsBase: 'Main base level needed', research: 'Research needed', research2: 'Also needs research',
  after: 'Research needed first', forge: 'Forge level needed first', made: 'Must have made first', supply: 'Supply given', shelters: 'Shelters at night',
  workers: 'Worker places', perDay: 'Made a day per farmer', steps: 'Time', attackSteps: 'Time between attacks', reach: 'Reach', range: 'Range',
  speed: 'Speed', climbSpeed: 'Climbing speed', walk: 'Walking speed', run: 'Running speed', armourBp: 'Armour', pierceBp: 'Damage taken from piercing',
  bluntBp: 'Damage taken from blunt', spreadBp: 'Spread', blockBp: 'Shield block', firstNight: 'First night', halfWidth: 'Half width', height: 'Height',
  heightCm: 'Height', lightM: 'Light radius', claimM: 'Claimed radius', outlyingHalves: 'Counts against the dusk light limit (2 whole, 1 half)',
  makes: 'Makes', tier: 'Tier', cost: 'Cost', inputs: 'Inputs (any one way)', outputs: 'Outputs', at: 'Made at', madeAt: 'Made at', recipes: 'Recipe (any one way)',
  drops: 'Drops', loot: 'Loot', min: 'Least', max: 'Most', meat: 'Meat', extra: 'Also gives', perCell: 'Per cell', groupMin: 'Group of at least',
  groupMax: 'Group of at most', tameFood: 'Food to tame', tameFoods: 'Tamed with', tameSteps: 'Time to tame', tameAt: 'Kept at', upkeep: 'Upkeep a day', grassM2: 'Grazing area',
  cropNutrition: 'Crop eaten a day', cartTenthsLb: 'Cart load', cartSpeed: 'Cart speed', packTenthsLb: 'Pack load', yield: 'Yield', perLoad: 'Per load',
  loadSteps: 'Time per load', gatherers: 'Gatherers at once', regrowSteps: 'Regrows after', seeds: 'Seeds', mana: 'Mana', cooldown: 'Cooldown', fuse: 'Fuse',
  damage: 'Damage', radius: 'Radius', unit: 'Damage to units', unitRadius: 'Radius on units', building: 'Damage to buildings', buildingRadius: 'Radius on buildings',
  bonusBp: 'Bonus', slowBp: 'Slow', poison: 'Poison', undead: 'Undead', arc: 'Shoots in an arc', arcs: 'Flies in an arc', guard: 'Guards', chase: 'Chases', roam: 'Roams',
  venom: 'Venom', swim: 'Swims', food: 'Food', load: 'Load', skill: 'Skill needed', blunt: 'Blunt', units: 'Units', glows: 'Glows', nutrition: 'Nutrition',
  crops: 'Crops', cropBands: 'Crop yield falls outside the Heartland', sightBonusM: 'Extra sight inside', slots: 'Ranged slots', wooden: 'Wooden', light: 'Light',
  trot: 'Trot', gallop: 'Gallop', chargeRun: 'Straight gallop before a charge', shoulderCm: 'Shoulder height', minRange: 'Shortest range', reloadSteps: 'Reload',
  crew: 'Crew needed', crewSkill: 'Crew skill needed (16 = cannon crew)', pushed: 'Pushed by its crew', pierce: 'Pierces a second target', powder: 'Uses gunpowder',
  reachBonus: 'Extra reach mounted', leash: 'Chases no farther than', bowSpreadMul: 'Bow spread times', farShareBp: 'Thrown 2 m when no taller than this share of the shoulder',
  dig: 'Dig class', regrow: 'Regrows', smoulderPerSecond: 'Smoulder damage a second', smoulderSteps: 'Smoulder time', perSecond: 'Burn a second', seconds: 'Burn seconds',
  base: 'Base level needed', rank: 'Rank', minBand: 'Shallowest band', guardians: 'Guardians', spawns: 'Spawns at night', bands: 'Bands', nature: 'Nature',
  moves: 'Moves as', sun: 'In the sun', comes: 'Comes', role: 'Role', shot: 'Shot', hit: 'Hit', tool: 'Tool tier', group: 'Group',
  // Troops and gear (units/kits.ts).
  timeS: 'Time to make', need: 'Material tier', swingDs: 'Swing time', reachCm: 'Reach', attackDs: 'Time between shots', rangeM: 'Range',
  spreadPct: 'Spread (of the range)', protectionPct: 'Protection', blockPct: 'Shield block', fromArmour: 'Comes with armour tier',
  tools: 'Tool tier for each job', powerPct: 'Spell power', 'WAND_KITS:mana': 'Extra mana', regainPct: 'Extra mana regain', 'TOOL_KITS:damage': 'A worker\'s damage',
  'CRIT:outerPm': 'Outer share of reach that crits', 'CRIT:bonusPct': 'Critical damage bonus', troopFood: 'Troop food', troopS: 'Troop training time',
  upgradeTimePm: 'Upgrade time (of the new piece\'s time to make)', upgradeRefundPm: 'Refund of the old piece on upgrade',
  PROSPECT_TOOL_TIER: 'Tool kit tier with the prospecting hammer',
  'SWOOP:diveSpeed': 'Dive speed', 'SWOOP:climbSpeed': 'Climb speed', 'SWOOP:pullMinPct': 'Pulls off to at least (of its striking distance)',
  'SWOOP:pullMaxPct': 'Pulls off to at most (of its striking distance)', 'SWOOP:pullLowCm': 'Pulls up to at least', 'SWOOP:pullHighCm': 'Pulls up to at most',
  WILD_PATCH_M: 'Wild patch size', WILD_SAMPLES: 'Spots tested per side of a patch',
  WILD_PAIR_PCT: 'Chance of a pair', WILD_RARITY_POWER: 'Rarity power (weight 1 / threat to this)', WILD_HORDE_GROW_NIGHTS: 'Group grows by one every (nights)',
  WILD_WEAK_THREAT_TENTHS: 'Weak enough to come as a group (threat at most)', WILD_LIGHT_TIMES: 'Keeps outside this many light radii',
  WILD_TURN_DEG: 'Stroll turns at most (degrees)', WILD_LOOK_STEPS: 'Looks round for prey every',
  // Gather (units/forage.ts).
  'FORAGE_GOODS:base': 'Main base level needed', 'FORAGE_GOODS:forge': 'Forge level needed', 'FORAGE_GOODS:plenty': 'Wanted until the stock holds',
  LOOT_BOSS_HP: 'Rare and powerful from this much health',
  // Plants' growth stages (world/props.ts).
  fromPm: 'Reached at (of its growing time)', sizePm: 'Drawn at (of full size)', yieldPm: 'Holds (of its full yield)',
  buildOver: 'Buildings can go over it', clearSteps: 'Time a builder takes to pull it up (0: trampled)',
};

/** Section titles for the rules entries, by module (otherwise the module's own first line). */
export const MODULE_TITLES: Readonly<Record<string, string>> = {
  'training:buildings/data.ts': 'Worker training', 'units:buildings/production.ts': 'Training', 'food:buildings/data.ts': 'Farms',
  'food:buildings/production.ts': 'Slaughter', 'land:buildings/data.ts': 'Claimed land and relighting', 'tools:units/behaviour.ts': 'Tool speed',
  'world:units/behaviour.ts': 'Gathering', 'food:rules.ts': 'Upkeep', 'resources:rules.ts': 'Trinket worth', 'lairs:rules.ts': 'Lair clearing and hexes',
  'armour:rules.ts': 'Armour cap', 'pacing:rules.ts': 'Day and night', 'mobs:threats/data.ts': 'Blood and fog nights, depth', 'food:buildings/recipes.ts': 'Cooking',
  'resources:buildings/recipes.ts': 'Trinkets', 'mobs:combat/spawn.ts': 'Spawning',
  'state.ts': 'Workers and warriors', 'units/behaviour.ts': 'Work and ranks', 'buildings/production.ts': 'Training',
  'buildings/data.ts': 'Buildings', 'combat/combat.ts': 'Combat and experience', 'combat/fight.ts': 'Fighting ranges', 'rules.ts': 'General rules',
  'units/gear.ts': 'Specialist training', 'units/weight.ts': 'Carrying', 'economy/food.ts': 'Eating and healing', 'economy/food-kinds.ts': 'Meat and fish kinds', 'buildings/recipes.ts': 'Cooking and trinkets',
  'combat/mobs.ts': 'Mob abilities', 'combat/spawn.ts': 'Spawning', 'threats/data.ts': 'Lairs, tribes and villages', 'world/props.ts': 'Props',
  'buildings/mining.ts': 'Mining, prospecting and fishing', 'units/dig.ts': 'Digging', 'nav/grid.ts': 'Moving over terrain', 'world/world.ts': 'Terrain',
  'world/start.ts': 'Start basins', 'clock.ts': 'Clock', 'animals/species.ts': 'Animals', 'units/field.ts': 'Hunting', 'threats/abilities.ts': 'Goblin mage spells',
  'magic/spells.ts': 'Spells and mage ranks', 'magic/mages.ts': 'Mage training and mana', 'magic/cast.ts': 'Casting',
  'siege:mounts/data.ts': 'Riding and charges', 'siege:siege/data.ts': 'Siege engines and cannon ports', 'mobs:threats/late-mobs.ts': 'Late night mobs\' abilities',
  'mobs:threats/boss.ts': 'Morvath', 'mounts/data.ts': 'Riding and charges', 'siege/data.ts': 'Siege engines and cannon ports', 'threats/late-mobs.ts': 'Late night mobs\' abilities',
  'threats/boss.ts': 'Morvath',
  'threats/burns.ts': 'Fire', 'combat/projectiles.ts': 'Projectiles', 'economy/resources.ts': 'Resources', 'buildings/lights.ts': 'Lights',
  'buildings/placement.ts': 'Placement', 'buildings/chains.ts': 'Wall chains', 'world:buildings/chains.ts': 'Tunnel chains', 'world/layout.ts': 'World layout', 'combat/mob-ai.ts': 'Mob behaviour',
  'units/loot.ts': 'Loot', 'units/forage.ts': 'Gather, and how far from home', 'loot:units/field.ts': 'Hunt', 'loot:combat/fight.ts': 'Guarding workers',
  'tools:units/kits.ts': 'Prospecting', 'melee:units/kits.ts': 'Long melee criticals', 'training:units/kits.ts': 'Training and upgrading',
  'threats/wanderers.ts': 'Wandering night monsters', 'mobs:threats/wanderers.ts': 'Wandering night monsters',
};

/** Keys shown first in a record, in this order; the rest follow in source order. */
export const KEY_ORDER: readonly string[] = [
  'levels', 'cost', 'recipes', 'inputs', 'outputs', 'makes', 'ws', 'steps', 'health', 'hp', 'damage', 'attackSteps', 'reach', 'range',
  'speed', 'walk', 'run', 'armourBp', 'melee', 'ranged', 'firstNight', 'needsBase', 'research', 'research2', 'after', 'forge', 'made', 'madeAt', 'at',
  'supply', 'shelters', 'workers', 'light', 'crops',
];

/** Unit by key; `EXPORT:key` overrides by export, and a bare export name sets a scalar's unit. */
export const KEY_UNITS: Readonly<Record<string, UnitId>> = {
  speed10: 'speedTenths', price: 'vpTenths',
  ws: 'workerSeconds', 'SPELLS:bp': 'percentBp', hp: 'health', health: 'health', damage: 'damage', vsWalls: 'damage', threatTenths: 'tenths', xpTenths: 'xpTenths',
  chancePm: 'percentPm', weightTenthsLb: 'lbTenths', needsBase: 'level', forge: 'level', supply: 'count', shelters: 'count', workers: 'count',
  reach: 'metresWu', range: 'metresWu', radius: 'metresWu', halfWidth: 'metresWu', height: 'metresWu', unitRadius: 'metresWu', buildingRadius: 'metresWu',
  'melee:min': 'metresWu', speed: 'speed', climbSpeed: 'speed', walk: 'speed', run: 'speed', cartSpeed: 'speed', heightCm: 'metresCm', lightM: 'metres',
  claimM: 'metres', sightBonusM: 'metres', grassM2: 'squareMetres', firstNight: 'night', cartTenthsLb: 'lbTenths', packTenthsLb: 'lbTenths',
  meat: 'count', makes: 'count', perCell: 'count', groupMin: 'count', groupMax: 'count', tameFood: 'nutrition', upkeep: 'nutrition', cropNutrition: 'nutrition',
  nutrition: 'nutrition', food: 'nutrition', tier: 'level', base: 'level', rank: 'level', mana: 'number', smoulderPerSecond: 'damage', perSecond: 'damage',
  seconds: 'number', extra: 'number',
  trot: 'speed', gallop: 'speed', chargeRun: 'metresWu', shoulderCm: 'metresCm', minRange: 'metresWu', reachBonus: 'metresWu', sight: 'metresWu', leash: 'metresWu',
  far: 'metresWu', near: 'metresWu', 'ENGINES:horse': 'speed', 'ENGINES:ox': 'speed', 'ENGINES:pushed': 'speed', 'ENGINES:crew': 'count',
  // Troops and gear: the kit tables are written in the blueprint's own units.
  timeS: 'wholeSeconds', troopS: 'wholeSeconds', swingDs: 'deciseconds', attackDs: 'deciseconds',
  reachCm: 'metresCm', rangeM: 'metres', troopFood: 'nutrition', fromArmour: 'level',
  'WAND_KITS:mana': 'number', PROSPECT_TOOL_TIER: 'level',
  // The swoop (Jade's patch notes 1) and the wandering night monsters.
  'SWOOP:diveSpeed': 'speed', 'SWOOP:climbSpeed': 'speed', 'SWOOP:pullLowCm': 'metresCm', 'SWOOP:pullHighCm': 'metresCm',
  WILD_FROM_NIGHT: 'night', WILD_HORDE_FROM_NIGHT: 'night', WILD_HORDE_PCT_PER_NIGHT: 'percent', WILD_HORDE_MIN: 'count', WILD_HORDE_MAX: 'count',
  WILD_CAP_PER_PLAYER: 'count',
  'FORAGE_GOODS:base': 'level', 'FORAGE_GOODS:forge': 'level', 'FORAGE_GOODS:plenty': 'count', LOOT_BOSS_HP: 'health',
};

/** Suffixes in export names that give a scalar its unit. Checked in order. */
/** Units for every number in a table, by export (after the key's own unit). */
export const EXPORT_UNITS: Readonly<Record<string, UnitId>> = {
  RES_VALUE_TENTHS: 'vpTenths', LIVE_VALUE_TENTHS: 'vpTenths', TRINKET_METAL_TENTHS: 'vpTenths',
  DAILY_BUY_TENTHS: 'vpTenths', REPARATIONS_TENTHS: 'vpTenths', REPARATIONS_PER_KILL_TENTHS: 'vpTenths', PLUNDER_TENTHS_PER_PERSON: 'vpTenths',
  MERC_UNITS: 'number', ONE_IN: 'number',
};

/** What the keys or indices of a table stand for, by export: one kind per level, null where they are plain positions. */
export const INDEX_REFS: Readonly<Record<string, ReadonlyArray<RefKind | null>>> = {
  BAND_SIZE_PCT: ['band'], BAND_STOCK_PCT: ['band'], ONE_IN: [null, 'band'], PAY_PCT: ['people', 'cat'], LEANS: ['people'],
  STOCK: ['faction'], LAYOUTS: ['faction'], PLUNDER_GOODS: ['people'], RES_VALUE_TENTHS: ['res'],
  LIVE_VALUE_TENTHS: ['species'], SALVAGE: ['mob'], MERC_UNITS: ['band'], TRINKET_METAL_TENTHS: ['trinketMetal'],
  BUILDING_SIGHT_M: ['building'],
};

/** Pair lists inside a table, by export (`EXPORT:*`) or key: what the first number of each pair names. */
export const PAIR_KEY_REFS: Readonly<Record<string, RefKind>> = {
  'SALVAGE:*': 'res', 'LAYOUTS:structures': 'mob', 'LAYOUTS:people': 'peopleUnit', 'LAYOUTS:animals': 'species',
};

/** Modules whose loose numbers split into one page per `// ----- section -----` comment. */
export const SECTION_PAGES: ReadonlySet<string> = new Set(['peoples/data.ts']);
/** Page titles for those sections, where the comment reads badly as one. */
export const SECTION_TITLES: Readonly<Record<string, string>> = {
  "the peoples' units": 'Grovesinger and beasts', "the peoples' buildings": 'Village sizes, buildings and salvage', 'where they are': 'Where they are found',
  'trade (Table 11, Table 19)': 'Trade: worth, prices, stock and leans', war: 'War, raids, caravans and hiring', speech: 'Speech',
};

export const NAME_UNITS: ReadonlyArray<readonly [RegExp, UnitId]> = [
  [/_STEPS$|Steps$|^steps$|^cooldown$|^fuse$/, 'seconds'],
  [/HEALTH/, 'health'],
  [/_FOOD$/, 'nutrition'],
  [/_SPEED(_WU)?$/, 'speed'],
  [/_BP$|Bp$/, 'percentBp'],
  [/_PER_MILLE(_PER_SECOND)?$|_PM$|PerMille$|Pm$/, 'percentPm'],
  [/_PCT$|Pct$/, 'percent'],
  [/_TENTHS_LB$|TenthsLb$/, 'lbTenths'],
  [/XP_TENTHS$/, 'xpTenths'],
  [/_TENTHS$|Tenths$/, 'tenths'],
  [/_WU$|Wu$|^GRAVITY$|_HEIGHT$|^OVER_WALL_REACH$/, 'metresWu'],
  [/_M2$/, 'squareMetres'],
  [/_M$/, 'metres'],
  [/_UNITS$/, 'number'],
];

/** Words dropped from an export's name when it becomes a label (the unit says them). */
const NAME_NOISE = new Set(['STEPS', 'BP', 'PM', 'PCT', 'TENTHS', 'LB', 'WU', 'M', 'M2', 'PER', 'MILLE']);

/** "KILL_SHARE_WINDOW_STEPS" as "Kill share window"; "attackSteps" as "Attack steps". */
export function humanise(name: string): string {
  if (/^[A-Z0-9_]+$/.test(name)) {
    const words = name.split('_').filter((w) => w !== '');
    const kept = words.filter((w, i) => !(NAME_NOISE.has(w) && i > 0 && !(w === 'PER' && words[i + 1] !== 'MILLE')));
    const s = (kept.length ? kept : words).join(' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const s = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
