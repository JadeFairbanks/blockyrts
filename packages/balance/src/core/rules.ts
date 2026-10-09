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
  { id: 'training', label: 'Training and upgrades', blurb: 'Table 7. What a troop, worker or mage costs to train, what each material tier needs (Forge step and research; Patch 2: the steps come with main base levels), upgrade time and refund, and the artillery crewman\'s food and time (Patch 2).' },
  { id: 'wands', label: 'Wands and robes', blurb: 'Table 13. Mages\' wands (spell power and extra mana) and robes (protection and mana regain) by tier: cost, time to make and what they need.' },
  { id: 'magic', label: 'Mages and spells', blurb: 'Mage ranks, mana and refill, the combat pause, rank training at the Magi Sanctum, and every spell (Table 13): mana, cooldown, range, power, radius and duration.' },
  { id: 'siege', label: 'Mounts, siege and guns', blurb: 'Mounts and charges (Table 14): health, armour, heights, paces, the charge run and knockback, the mounted rules and the riders\' upkeep; siege engines and cannons (Table 2f): health, damage, range, reload, crew, haul and push speeds, and the Citadel\'s engine platform (Patch 5: its fixed engines and their upgrades). Patch 2: engines take no munitions, and every engine rolls out with its crew of artillery crewmen.' },
  { id: 'recipes', label: 'Recipes', blurb: 'What production buildings turn into what: inputs, outputs, time and where.' },
  { id: 'food', label: 'Food and rations', blurb: 'Eating, healing, starving and the upkeep of units and facilities.' },
  { id: 'animals', label: 'Animals', blurb: 'Wild and tame animals: health, speed, meat and hides, taming and breeding, and the Barn: its stalls and the farm fare its animals eat.' },
  { id: 'loot', label: 'Loot, hunting and gathering', blurb: 'What kills drop and who carries it: the loot bag, how near units pick loot up by themselves, how long it lies, when a find is remarked on; how far Hunt and Gather go from home (back by nightfall), what Gather fetches and how far into the unknown it looks, and fighters coming to a worker\'s help.' },
  { id: 'nightwork', label: 'Working through the night', blurb: 'Jade\'s Patch 4: how near a building and a troop a worker gathering by itself must be at dusk to ask "Should I keep working through the night?" instead of going home, how near the buildings it then gathers, how far one worker asks for the others, and when workers who went in for the night come out at dawn (no monster alive within this of their shelter).' },
  { id: 'mobs', label: 'Mobs and nights', blurb: 'Night monsters, the first night, spawning, fog nights, special attacks, and (Patch 4) how a monster a troop hurts turns on the nearest troop.' },
  { id: 'lairs', label: 'Lairs, tribes and villages', blurb: 'Lairs and their hoards, hostile tribe bands, goblin villages and war.' },
  { id: 'peoples', label: 'Neutral peoples and trade', blurb: 'Halflings, Runkin, Elves and Dwarves, and the mercenary camps: their villages and people, what they pay and sell (Table 19), daily limits and restock, moods, war, surrender and plunder, raids, caravans and hiring.' },
  { id: 'land', label: 'Claimed land and lights', blurb: 'Claimed land round buildings and lights, outlying lights and relighting. Lights need no fuel (Patch 2).' },
  { id: 'resources', label: 'Resources and trade', blurb: 'Every resource: weight, nutrition and the starting stock; trade values and trinkets.' },
  { id: 'world', label: 'World and terrain', blurb: 'Trees, rocks and other props, materials, mining and prospecting, digging and movement over terrain.' },
  { id: 'questions', label: 'Questions', blurb: 'The yes-or-no questions units and buildings ask their owner (Patch 2): how long one waits for an answer, how many a player has open at once, how hurt a unit is before it asks to eat and how long nothing must have hurt it first (Patch 3), and how near others must stand for one to speak for them; and (Patch 3) how many questions a click on a greyed-out button raises, and how far down their causes they go; and (Patch 4) how long a farm stands empty, a building goes unworked or a worker stands idle before it asks, and how near a worker must be to be sent.' },
  { id: 'pacing', label: 'Pacing', blurb: 'The day and night clock and the other timings everything else counts in.' },
  { id: 'other', label: 'Other numbers', blurb: 'Numbers in the sim that no other group claims yet. New tables show up here until they are given a home.' },
];

/** Modules that hold no balance at all: maths, serialisation, ids, the state layout. */
export const SKIP_MODULES: ReadonlySet<string> = new Set([
  'index.ts', 'fixed.ts', 'trig-table.ts', 'serialize.ts', 'bytes.ts', 'rng.ts', 'replay.ts', 'step.ts', 'commands.ts',
  'world/chunk.ts', 'world/serialize-world.ts', 'world/delta.ts', 'world/noise.ts',
  'nav/path.ts', 'threats/debug.ts', 'debug/god.ts', 'threats/types.ts', 'buildings/store.ts', 'combat/fields.ts', 'combat/space.ts',
  'magic/cast.ts', 'units/names.ts', 'peoples/orders.ts', 'peoples/hooks.ts', 'peoples/speech.ts', 'peoples/types.ts',
]);

/** Single exports that are plumbing, ids or names rather than balance. */
export const SKIP_EXPORTS: ReadonlySet<string> = new Set([
  // Patch 5: which ingots the necromancer drops and which kinds guard a mana crystal are lists of ids, told in their files' words.
  'threats/necromancer.ts:NECROMANCER_INGOTS', 'threats/guardians.ts:GUARDIAN_KINDS',
  'state.ts:UNIT_FIELDS', 'state.ts:PLAYER_FIELDS', 'state.ts:MONSTERS', 'state.ts:NEUTRAL', 'state.ts:WILD', 'state.ts:NO_CARRY',
  'state.ts:FOG_INTERVAL_STEPS', 'units/behaviour.ts:ARRIVED', 'units/behaviour.ts:FAILED', 'units/behaviour.ts:MOVING',
  'units/behaviour.ts:PATH_SEARCHES_PER_STEP', 'units/tools.ts:TOOL_FIELDS', 'buildings/chains.ts:STRETCH_DIRS',
  // Building shapes (one per level) and an enter order's flag: layout and plumbing, not balance.
  'buildings/footprints.ts:FOOTPRINTS', 'units/unit-orders.ts:ENTER_TOP', 'units/unit-orders.ts:ENTER_IN', 'units/loot.ts:HAND_ONE', 'units/loot.ts:DROPPED',
  // The peoples' names, lines and id offsets: words and plumbing, not balance. The special trinket multiplier is a copy of rules.ts's.
  'peoples/data.ts:PEOPLE_NAMES', 'peoples/data.ts:PERSON_NAMES', 'peoples/data.ts:FACTION_KIND_NAMES', 'peoples/data.ts:KIND_PEOPLE',
  'peoples/data.ts:CAT_COUNT', 'peoples/data.ts:CAT_NAMES', 'peoples/data.ts:REFUSE', 'peoples/data.ts:LIVE_GOODS', 'peoples/data.ts:ENGINE_GOODS',
  'peoples/data.ts:LINES', 'peoples/data.ts:TREE_WARNING_LINES', 'peoples/data.ts:REPARATIONS_PAID_LINE', 'peoples/data.ts:MERC_LINES',
  'peoples/data.ts:REMARKS', 'peoples/data.ts:NAME_PARTS', 'peoples/data.ts:ELF_KINGDOM_NAME', 'peoples/data.ts:LEADER_NAMES',
  'peoples/data.ts:SPECIAL_TRINKET_MULT_TENTHS', 'peoples/data.ts:THINK_STEPS', 'peoples/data.ts:RECAMP_SEARCH_CELLS', 'peoples/trade.ts:UNTIL_DAWN',
  'combat/mob-ai.ts:MOB_SEARCHES_PER_STEP', 'animals/animals.ts:STOCK_CHECK_STEPS',
  'economy/resources.ts:RESOURCE_COUNT',
  // The longest timed action the 16-bit tinker column can count (Patch 2): a storage limit, not balance.
  'units/tinker.ts:TINKER_MAX_STEPS',
  // The food kinds' lists (which goods are meats and fish, in the inventory's order) and the meal accounts' unit.
  'economy/food-kinds.ts:MEATS', 'economy/food-kinds.ts:FISHES', 'economy/food.ts:QUARTERS',
  'economy/resources.ts:TRINKET_BASE', 'economy/resources.ts:FOODS', 'economy/resources.ts:TRINKET_METALS', 'economy/resources.ts:TRINKET_TIERS',
  'world/materials.ts:MATERIAL_COUNT', 'world/world.ts:CHUNK_CACHE_BUDGET', 'world/world.ts:FOG_TILES_PER_CHUNK', 'world/world.ts:FOG_TILE_COLUMNS',
  'world/layout.ts:CELL_RING_SHIFT', 'world/layout.ts:BAND_NAMES', 'world/layout.ts:EDGE_NAMES', 'world/layout.ts:LOOK_NAMES',
  'buildings/mining.ts:RATING_NAMES', 'buildings/placement.ts:BLOCKED_TEXT', 'economy/food.ts:RATIONS_TEXT', 'clock.ts:PERIOD_NAMES',
  'combat/combat.ts:RANK_NAMES', 'rules.ts:BP', 'rules.ts:XP_TENTHS', 'rules.ts:VP_SOFTWOOD_LUMBER',
  'commands.ts:FLOW_FIELD_GROUP', 'nav/grid.ts:WALKER', 'nav/grid.ts:PERSON', 'nav/grid.ts:PERSON_ARMOURED', 'nav/grid.ts:CLIMBER',
  'nav/grid.ts:CLIMBER_PLAN', 'nav/grid.ts:MOB_PLAN', 'nav/grid.ts:SWIMMER', 'nav/grid.ts:WHEELS', 'world/props.ts:PROPS:check',
  // Mana's fixed-point scale, the rank count, and tables worked out from MAGE_RANKS.
  'magic/spells.ts:MANA_SCALE', 'magic/spells.ts:MAGE_TOP_RANK', 'magic/mages.ts:MAGE_XP_TENTHS', 'magic/mages.ts:MAGE_RANK_NAMES',
  // The engines' shot ids and the list of engines a player can make.
  'siege/data.ts:ENGINE_SHOT', 'siege/data.ts:PLAYER_ENGINES',
  // Patch 5: the engines' ids (the fixed ones are built from the mobile rows by id), the fixed ladder, the upgrade
  // products' offset and the Citadel's tier are identity, not numbers to tune.
  'siege/data.ts:Engine', 'siege/data.ts:FIXED_ENGINES', 'siege/data.ts:ENGINE_UPGRADE', 'siege/data.ts:CITADEL_LEVEL',
  // Troops and gear: the troop types' names and keys, the top tiers (the tables' lengths), and the gear catalogue, which
  // is worked out from the kit tables (change the kit rows instead) or holds the peoples' fixed gear.
  'units/kits.ts:TROOP_TYPES', 'units/kits.ts:TROOP_NAMES', 'units/kits.ts:TROOP_TIER_NAMES', 'units/kits.ts:TROOP_KEYS', 'units/kits.ts:TOP_TIER', 'units/kits.ts:TOP_MAGE_TIER',
  'units/kits.ts:GEAR', 'units/kits.ts:PeopleGear', 'units/kits.ts:CLOSE_GEAR', 'units/kits.ts:LONG_GEAR', 'units/kits.ts:RANGER_GEAR',
  'units/kits.ts:PISTOL_GEAR', 'units/kits.ts:ARMOUR_GEAR', 'units/kits.ts:SHIELD_GEAR', 'units/kits.ts:TOOL_GEAR', 'units/kits.ts:WAND_GEAR',
  'units/kits.ts:ROBE_GEAR', 'units/kits.ts:OBSIDIAN_AXE_GEAR',
  // Worker ranks (Patch 3): the rank names are words, and Work names what a worker is doing (building or gathering).
  'units/ranks.ts:WORKER_RANK_NAMES', 'units/ranks.ts:Work',
  // Working through the night (Patch 4): the question's kind, and the shelter and Gather orders' flags.
  'units/night-work.ts:NIGHT_WORK_ASK', 'units/unit-orders.ts:ENTER_NIGHT', 'units/unit-orders.ts:FORAGE_HOME', 'units/unit-orders.ts:FORAGE_NIGHT',
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
  'combat/blasts.ts': 'ranged',
  'combat/mobs.ts': 'mobs',
  'combat/threat.ts': 'mobs',
  'combat/spawn.ts': 'mobs',
  'combat/mob-ai.ts': 'mobs',
  'combat/aims.ts': 'mobs',
  'combat/combat.ts': 'units',
  'combat/fight.ts': 'units',
  'combat/deaths.ts': 'units',
  'units/behaviour.ts': 'units',
  'units/shelter.ts': 'units',
  'units/spacing.ts': 'units',
  'units/ranks.ts': 'units',
  'units/gear.ts': 'training',
  'units/questions.ts': 'questions',
  'units/greyed.ts': 'questions',
  'units/work-asks.ts': 'questions',
  'units/make-asks.ts': 'questions',
  'units/kits.ts': 'training',
  'units/weight.ts': 'units',
  'units/moves.ts': 'units',
  'units/field.ts': 'animals',
  'units/loot.ts': 'loot',
  'threats/loot.ts': 'loot',
  'units/forage.ts': 'loot',
  'units/night-work.ts': 'nightwork',
  'units/dig.ts': 'world',
  'units/repairs.ts': 'units',
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
  'threats/lair-alert.ts': 'lairs',
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
  'mounts/data.ts': 'siege',
  'mounts/riding.ts': 'siege',
  'siege/data.ts': 'siege',
  'siege/engines.ts': 'siege',
  'threats/late-mobs.ts': 'mobs',
  'threats/boss.ts': 'mobs',
  'threats/wanderers.ts': 'mobs',
  'threats/bright.ts': 'mobs',
  'threats/necromancer.ts': 'mobs',
  'threats/guardians.ts': 'mobs',
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
  // Patch 2: the Barn's stalls go with the animals, cavalry's main base level and the Forge's metal steps with training.
  'buildings/data.ts:BARN_STALLS': 'animals',
  'buildings/data.ts:CHICKENS_PER_STALL': 'animals',
  'buildings/data.ts:CAVALRY_BASE': 'training',
  'buildings/data.ts:FORGE_STEP_BASE': 'training',
  'buildings/production.ts:SLAUGHTER_STEPS': 'food',
  'buildings/production.ts:SLAUGHTERED': 'food',
  'buildings/production.ts:PRODUCTS': 'buildings',
  'buildings/recipes.ts:TRINKET_STEPS': 'resources',
  'buildings/recipes.ts:TRINKET_INGOTS': 'resources',
  'buildings/recipes.ts:TRINKET_TIER_BASE': 'resources',
  'combat/items.ts:RESEARCH': 'research',
  // Patch 2: the artillery crewman's food and time go with the other troops' training.
  'siege/data.ts:CREWMAN': 'training',
  // Patch 3: retraining a crewman as a worker goes beside his own training.
  'siege/data.ts:CREWMAN_RETRAIN_STEPS': 'training',
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
  'units/kits.ts:ARMOUR_KITS', 'units/kits.ts:SHIELD_KITS', 'units/kits.ts:WAND_KITS', 'units/kits.ts:ROBE_KITS', 'units/moves.ts:GAITS',
]);

/** Single records shown as an entry of their own, like one row of an entry array. */
export const ENTRY_RECORDS: ReadonlySet<string> = new Set(['units/kits.ts:BRAWLER_KIT']);

/**
 * Troops and gear: the kit tables' sub-menus, by export. Each row is a tier of
 * kit, labelled "Tier 4: Bronze shortsword" (shields too from Patch 5, a line
 * of their own).
 */
export const KIT_MENUS: Readonly<Record<string, string>> = {
  TIER_NEEDS: 'Material tiers', TOOL_KITS: 'Tool kits', CLOSE_KITS: 'Close melee', LONG_KITS: 'Long melee and cavalry', RANGER_KITS: 'Rangers',
  BRAWLER_KIT: 'Brawlers', ARMOUR_KITS: 'Armour', SHIELD_KITS: 'Shields (close melee)', WAND_KITS: 'Wands', ROBE_KITS: 'Robes',
};
/** Kit tables whose rows are not labelled by their tier (none since Patch 5 gave shields tiers of their own). */
export const UNTIERED_KITS: ReadonlySet<string> = new Set<string>();

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
  | 'people' | 'faction' | 'cat' | 'peopleUnit' | 'trinketMetal' | 'good' | 'trait';

/** Keys that hold a reference, wherever they appear; `EXPORT:key` overrides by export. */
export const REF_KEYS: Readonly<Record<string, RefKind>> = {
  res: 'res', fuel: 'res', mob: 'mob', guardians: 'mob', spawns: 'mob', research: 'research', research2: 'research', after: 'research',
  shot: 'shot', nature: 'nature', moves: 'moves', sun: 'sun', comes: 'comes', role: 'role', site: 'lairSite', minBand: 'band',
  bands: 'band', tameAt: 'building', tameFoods: 'res', hit: 'hit', made: 'made', group: 'resGroup', dig: 'digClass',
  'PROPS:tool': 'tool', 'SLAUGHTERED:*': 'species', 'FOODS:*': 'res', 'MEAT_BY_SPECIES:*': 'res',
  'RESEARCH:at': 'building', 'RECIPES:at': 'building', 'ENGINES:at': 'building', 'MOUNTS:species': 'species',
  'PEOPLE_UNITS:people': 'people', 'PEOPLE_UNITS:weapon': 'gear', 'PEOPLE_UNITS:ranged': 'gear', 'PEOPLE_UNITS:armour': 'gear', 'PEOPLE_UNITS:shield': 'gear',
  // A people's lean: the goods it sells cheap and pays extra for (resources, live animals or engines).
  'LEANS:sells': 'good', 'LEANS:lacks': 'good',
  RUNKIN_WOLF: 'species', ELF_BEAR: 'species', 'PLUNDER_GOODS:*': 'res', 'MERC_UNITS:*': 'peopleUnit',
  // Troops and gear: a kit row's material tier, and a tool kit's tool tier for each job.
  need: 'tierNeed', 'TOOL_KITS:tools': 'tool',
  // Patch 3: a mob's listed traits (combat/threat.ts Trait).
  'MOBS:traits': 'trait',
};

/** Keys that are identity, layout or prose: shown, not edited. */
export const READ_ONLY_KEYS: ReadonlySet<string> = new Set([
  'id', 'kind', 'live', 'comesWith', 'menu', 'slot', 'craftSlot', 'w', 'd', 'solid', 'variants', 'turns', 'product', 'key', 'colour',
  'defence', 'dropoff', 'site', 'raw', 'shape', 'trainsWorkers', 'heavy', 'oneHanded', 'tip', 'BUILDINGS:slot', 'BUILDINGS:group', 'crafts',
  'SPELLS:school', 'SPELLS:projectile', 'MAGE_RANKS:rank', 'MAGE_RANK_TRAINING:rank', 'PEOPLE_UNITS:people',
  // The peoples' gear is fixed rows of the gear catalogue (Troops and gear), not numbers to tune here.
  'PEOPLE_UNITS:weapon', 'PEOPLE_UNITS:ranged', 'PEOPLE_UNITS:armour', 'PEOPLE_UNITS:shield',
  // A kit row's tier is its place in the table, and its material tier follows from it (a shield's from the armour it comes with).
  'need', 'TIER_NEEDS:tier', 'TOOL_KITS:tier', 'CLOSE_KITS:tier', 'LONG_KITS:tier', 'RANGER_KITS:tier', 'BRAWLER_KIT:tier', 'ARMOUR_KITS:tier',
  'SHIELD_KITS:tier', 'WAND_KITS:tier', 'ROBE_KITS:tier',
  // A growth stage's place in the order (world/props.ts Stage): the stages are named by it.
  'TREE_GROWTH:stage', 'HAZEL_GROWTH:stage', 'PLANT_GROWTH:stage',
  // Patch 3: a night monster's threat is worked out from its numbers and traits (combat/threat.ts), never set by hand;
  // the reach that strikes over walls mirrors the combat rule (combat.ts OVER_WALL_REACH), set there.
  'MOBS:threatTenths', 'THREAT:overWallReachCm',
  // Patch 5: which mobile engine a fixed one is built from; its numbers are that engine's, tuned there.
  'ENGINES:mobile',
]);

/** Keys whose text is the record's own words for the tooltip; other strings show as notes. */
export const TEXT_KEYS: Readonly<Record<string, string>> = {
  purpose: 'Purpose', gives: 'Gives or unlocks', opens: 'Opens', needs: 'Also needs', comesWith: 'Comes with', later: 'Comes later',
  source: 'Where it comes from', tooltip: 'Tooltip', row: 'Blueprint row', yields: 'Yields', resource: 'Gives',
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
  'WAVE_AIMS:baseM': 'A base: buildings within', 'WAVE_AIMS:openM': 'Out in the open: farther outside every base than', 'WAVE_AIMS:partyM': 'A party: units within',
  'WAVE_AIMS:buildingWorth': 'Worth to the waves: a building', 'WAVE_AIMS:unitWorth': 'Worth to the waves: a unit out in the open',
  'WAVE_AIMS:edgeSpreadM': 'Comes out at most this much farther than the nearest edge', 'WAVE_AIMS:baseReachM': 'Takes up the town\'s paths within',
  'PERCH_ATTACK:steps': 'Shot at from a building this lately', 'PERCH_ATTACK:withinWu': 'Breaks that building within',
  // Patch 5: Morvath's staff and wings, the necromancer, the mana crystal guardians.
  'staff:splashTenths': 'Staff splash', 'staff:radius': 'Staff splash within', 'wings:steps': 'Wings drain over', 'wings:total': 'Wings drain at most', 'wings:radius': 'Wings drain within',
  'NECROMANCER:summonSteps': 'Summons every', 'NECROMANCER:summonMin': 'Summons at least', 'NECROMANCER:summonMax': 'Summons at most', 'NECROMANCER:ringM': 'They rise round him within',
  'NECROMANCER:bubbleS': 'His bubbles stay', 'NECROMANCER:gearMin': 'Drops: weapons or armours, at least', 'NECROMANCER:gearMax': 'Drops: weapons or armours, at most',
  'NECROMANCER:gearLowTier': 'Drops: lowest tier', 'NECROMANCER:gearHighTier': 'Drops: highest tier (or the highest a player can make)',
  'NECROMANCER:ingotMin': 'Drops: ingots, at least', 'NECROMANCER:ingotMax': 'Drops: ingots, at most', 'NECROMANCER:boneMin': 'Drops: bones, at least', 'NECROMANCER:boneMax': 'Drops: bones, at most',
  'NECROMANCER:crystalPm': 'Drops: a mana crystal, chance',
  'CRYSTAL_GUARDS:min': 'Guardians a crystal, at least', 'CRYSTAL_GUARDS:max': 'Guardians a crystal, at most', 'CRYSTAL_GUARDS:leashM': 'Keep within', 'CRYSTAL_GUARDS:chaseM': 'Chase no farther than',
  'CRYSTAL_GUARDS:wakeM': 'Come when a unit first comes within', 'CRYSTAL_GUARDS:postM': 'Stand round it at', 'CRYSTAL_GUARDS:everySteps': 'Looked for every',
  speed10: 'Walking speed', walkShoot: 'Shoots while walking', fighter: 'Fighter (villagers flee instead)', ringWu: 'Buildings stand this far out',
  structures: 'Buildings', animals: 'Animals kept', good: 'Good', 'STOCK:count': 'Held when full', 'CARAVAN_GOODS:count': 'Held when full',
  'STOCK:pct': 'Sells at (of its worth)', 'CARAVAN_GOODS:pct': 'Sells at (of its worth)', price: 'Set price', daily: 'Refills every dawn',
  LAIR_PING_STEPS: 'Minimap ping at a new lair lasts',
  sells: 'Sells cheap', lacks: 'Pays extra for', LEAVE_WU: 'Leave distance', LEAVE_STEPS: 'Leave after',
  // Making room (Jade's Patch 3: anti-clumping).
  SPACING_PM: 'Bodies stand apart by (of their two half widths; 0 turns it off)', SPACING_SLACK_WU: 'Near enough to leave be',
  SPREAD_SPEED_WU: 'Steps aside at up to', SPREAD_PULL_PM: 'Makes up each step (of the overlap left)',
  SPACING_SCAN: 'Most bodies one looks at a step', SPACING_NEIGHBOURS: 'Most bodies one makes room from at once', FOLLOW_WU: 'Followers keep within',
  'GROVESINGER:treeWu': 'Counts as near a tree within',
  'GROVESINGER:nearTreeRefill': 'Refill near trees (hundredths a second)', 'GROVESINGER:barrenRefill': 'Refill in the Barrens (hundredths a second)',
  'ONE_IN:runkin': 'Runkin camps', 'ONE_IN:colony': 'Dwarf colonies', 'ONE_IN:city': 'Dwarf cities', 'ONE_IN:merc': 'Mercenary camps', 'ONE_IN:caravan': 'Elf caravans',
  RUNKIN_WOLF: 'Runkin camp animal', ELF_BEAR: 'Elf kingdom animal', ONE_IN: 'Found in one cell in so many (0 for never)',
  res: 'Resource', hexcraft: 'Needs Hexcraft', projectile: 'Flies (walls and trees stop it)', auto: 'Cast by herself', bp: 'Strength',
  refill: 'Refill (hundredths of a point a second)', crystals: 'Mana crystals', amount: 'Healing or damage', 'RESEARCH:at': 'Researched at',
  'melee:min': 'Shortest reach', 'ranged:min': 'Shortest range', ws: 'Build work', hp: 'Health', health: 'Health', damageTenths: 'Damage', poisonTenths: 'Poison over 5 s', perSecondTenths: 'Damage a second', vsWalls: 'Damage to walls', threatTenths: 'Threat', xpTenths: 'Experience',
  chancePm: 'Chance', weightTenthsLb: 'Weight', needsBase: 'Main base level needed', research: 'Research needed', research2: 'Also needs research',
  after: 'Research needed first', forge: 'Forge step needed first (1 any Forge; 2 to 4 its main base level)', made: 'Must have made first', supply: 'Supply given', shelters: 'Shelters at night',
  workers: 'Worker places', perDay: 'Made a day per farmer', steps: 'Time', attackSteps: 'Time between attacks', reach: 'Reach', range: 'Range',
  speed: 'Speed', climbSpeed: 'Climbing speed', walk: 'Walking speed', run: 'Running speed', armourBp: 'Armour', pierceBp: 'Damage taken from piercing',
  bluntBp: 'Damage taken from blunt', spreadBp: 'Spread', blockBp: 'Shield block', firstNight: 'First night', halfWidth: 'Half width', height: 'Height',
  heightCm: 'Height', lightM: 'Light radius', claimM: 'Claimed radius', outlyingHalves: 'Counts against the dusk light limit (2 whole, 1 half)',
  makes: 'Makes', tier: 'Tier', cost: 'Cost', inputs: 'Inputs (any one way)', outputs: 'Outputs', at: 'Made at', madeAt: 'Made at', recipes: 'Recipe (any one way)',
  drops: 'Drops', loot: 'Loot', min: 'Least', max: 'Most', meat: 'Meat', extra: 'Also gives', perCell: 'Per cell', groupMin: 'Group of at least',
  groupMax: 'Group of at most', tameFood: 'Bait to tame', tameFoods: 'Tamed with', tameSteps: 'Time to tame', tameAt: 'Kept at', upkeep: 'Upkeep a day',
  barnFeed: 'Farm fare eaten a day in a Barn', cartTenthsLb: 'Cart load', cartSpeed: 'Cart speed', packTenthsLb: 'Pack load', yield: 'Yield', perLoad: 'Per load',
  loadSteps: 'Time per load', gatherers: 'Gatherers at once', regrowSteps: 'Regrows after', seeds: 'Seeds', mana: 'Mana', cooldown: 'Cooldown', fuse: 'Fuse',
  damage: 'Damage', radius: 'Radius', unit: 'Damage to units', unitRadius: 'Radius on units', building: 'Damage to buildings', buildingRadius: 'Radius on buildings',
  bonusBp: 'Bonus', slowBp: 'Slow', poison: 'Poison', undead: 'Undead', arc: 'Shoots in an arc', arcs: 'Flies in an arc', guard: 'Guards', chase: 'Chases', roam: 'Roams',
  venom: 'Venom', swim: 'Swims', food: 'Food', load: 'Load', skill: 'Skill needed', blunt: 'Blunt', units: 'Units', glows: 'Glows', nutrition: 'Nutrition',
  crop: 'Crop', crafts: 'Works with no workers', sightBonusM: 'Extra sight inside', slots: 'Ranged slots', wooden: 'Wooden', light: 'Light',
  trot: 'Trot', gallop: 'Gallop', chargeRun: 'Straight gallop before a charge', shoulderCm: 'Shoulder height', minRange: 'Shortest range', reloadSteps: 'Reload',
  crew: 'Crew needed', crewSkill: 'Crew skill needed (16 = cannon crew)', pushed: 'Pushed by its crew', pierce: 'Pierces a second target', powder: 'Uses gunpowder',
  reachBonus: 'Extra reach mounted', leash: 'Chases no farther than', bowSpreadMul: 'Bow spread times', farShareBp: 'Thrown 2 m when no taller than this share of the shoulder',
  dig: 'Dig class', regrow: 'Regrows', smoulderPerSecond: 'Smoulder damage a second', smoulderSteps: 'Smoulder time', perSecond: 'Burn a second', seconds: 'Burn seconds',
  base: 'Main base level needed', rank: 'Rank', minBand: 'Shallowest band', guardians: 'Guardians', spawns: 'Spawns at night', bands: 'Bands', nature: 'Nature',
  moves: 'Moves as', sun: 'In the sun', comes: 'Comes', role: 'Role', shot: 'Shot', hit: 'Hit', tool: 'Tool tier', group: 'Group',
  // Troops and gear (units/kits.ts).
  timeS: 'Time to make', need: 'Material tier', swingDs: 'Swing time', reachCm: 'Reach', attackDs: 'Time between shots', rangeM: 'Range',
  spreadPct: 'Spread (of the range)', protectionPct: 'Protection', blockPct: 'Shield block', fromArmour: 'Comes with armour tier',
  tools: 'Tool tier for each job', powerPct: 'Spell power', 'WAND_KITS:mana': 'Extra mana', regainPct: 'Extra mana regain', 'TOOL_KITS:damage': 'A worker\'s damage',
  'CRIT:outerPm': 'Outer share of reach that crits', 'CRIT:bonusPct': 'Critical damage bonus', troopFood: 'Troop food', troopS: 'Troop training time',
  upgradeTimePm: 'Least upgrade time (of the new piece\'s time to make)', fitTimePm: 'Time to put on a ready item (of the piece\'s time to make)',
  PROSPECT_TOOL_TIER: 'Tool kit tier with the prospecting hammer',
  'SWOOP:diveSpeed': 'Dive speed', 'SWOOP:climbSpeed': 'Climb speed', 'SWOOP:pullMinPct': 'Pulls off to at least (of its striking distance)',
  'SWOOP:pullMaxPct': 'Pulls off to at most (of its striking distance)', 'SWOOP:pullLowCm': 'Pulls up to at least', 'SWOOP:pullHighCm': 'Pulls up to at most',
  WILD_PATCH_M: 'Wild patch size', WILD_SAMPLES: 'Spots tested per side of a patch',
  WILD_PAIR_PCT: 'Chance of a pair', WILD_RARITY_POWER: 'Rarity power (weight 1 / threat to this)', WILD_HORDE_GROW_NIGHTS: 'Group grows by one every (nights)',
  WILD_WEAK_THREAT_TENTHS: 'Weak enough to come as a group (threat at most)', WILD_LIGHT_TIMES: 'Keeps outside this many light radii',
  WILD_TURN_DEG: 'Stroll turns at most (degrees)', WILD_LOOK_STEPS: 'Looks round for prey every',
  // Gather (units/forage.ts).
  'FORAGE_GOODS:base': 'Main base level needed', 'FORAGE_GOODS:forge': 'Forge step needed (1 any Forge; 2 to 4 its main base level)', 'FORAGE_GOODS:plenty': 'Wanted until the stock holds',
  LOOT_BOSS_HP: 'Rare and powerful from this much health',
  // Patch 3: threat worked out from a monster's numbers (combat/threat.ts), the lairs' budgets and the wanderers' density.
  'MOBS:threatTenths': 'Threat (worked out)', traits: 'Traits', splitsInto: 'Splits into when it dies',
  'THREAT:unitHealth': 'One threat point: effective health', 'THREAT:unitDpsTenths': 'One threat point: damage a second',
  'THREAT:healthParts': 'Health counts (parts)', 'THREAT:damageParts': 'Damage counts (parts)',
  'THREAT:pierceSharePct': 'Players\' blows that pierce', 'THREAT:bluntSharePct': 'Players\' blows that are blunt', 'THREAT:shotSharePct': 'Players\' blows that fly (a shield blocks)',
  'THREAT:arcTargetsTenths': 'A sweeping arc lands on (units)', 'THREAT:slamTargetsTenths': 'A slam lands on (units)', 'THREAT:lineTargetsTenths': 'A line of breath lands on (units)',
  'THREAT:blastTargetsTenths': 'A bomber\'s blast lands on (units)', 'THREAT:splashTargetsTenths': 'A shot\'s splash lands on (more units)',
  'THREAT:wallsPct': 'Damage to walls counts as damage to units', 'THREAT:onceSeconds': 'A blast it dies in counts over',
  'THREAT:speedPctPerMs': 'Speed: per metre a second over the reference', 'THREAT:speedRefTenths': 'Speed: the reference', 'THREAT:speedMinPct': 'Speed: at least', 'THREAT:speedMaxPct': 'Speed: at most',
  'THREAT:rangedMaxPct': 'A ranged attack adds up to', 'THREAT:rangedFullM': 'A ranged attack adds the most from', 'THREAT:overWallReachCm': 'Reach that strikes over walls',
  // The night's budget, term by term (Jade's formula: 12 + (n - 1) + 3n + 0.04n²).
  'NIGHT_BUDGET:startTenths': 'Start (the 12)', 'NIGHT_BUDGET:rampTenths': 'Each night after the first, extra (the n − 1)',
  'NIGHT_BUDGET:perNightTenths': 'Each night (the 3n)', 'NIGHT_BUDGET:curveThousandths': 'Curve (the 0.04n²)', 'NIGHT_BUDGET:scalePct': 'Whole budget scaled',
  // Turning on the troops (Jade's Patch 4).
  'TROOP_AGGRO:steps': 'A troop\'s blow turns a monster on the troops for',
  'TROOP_AGGRO:lookWu': 'It looks for the nearest troop at least this far (as far as the troop that hit it if farther; halved on a fog night)',
  TRAIT_PCT: 'What each trait adds', LAIR_BUDGET_PCT: 'Each lair sends a night (of its own threat)', WILD_DENSITY_PCT: 'How many wanderers (of Patch 1\'s)',
  // Worker ranks (Patch 3) and retraining a crewman.
  WORKER_XP_TENTHS: 'Experience needed for each rank', WORKER_HEALTH_BY_RANK: 'Health by rank',
  BUILD_XP_TENTHS_PER_MINUTE: 'Experience for a minute of building (starting tools)',
  GATHER_XP_TENTHS_PER_MINUTE: 'Experience for a minute of gathering (starting tools)',
  CREWMAN_RETRAIN_STEPS: 'Retraining a crewman as a worker takes',
  // Working through the night (Patch 4).
  NIGHT_WORK_BUILDING_M: 'Asks at dusk when within this of a building', NIGHT_WORK_TROOP_M: '...and within this of a troop',
  NIGHT_WORK_REACH_M: 'Working on, gathers only within this of a building', NIGHT_WORK_SPEAK_FOR_M: 'One worker asks for the others within',
  DAWN_CLEAR_M: 'Out at dawn once no monster is alive within this of the shelter', DAWN_LOOK_STEPS: 'Sheltering workers look out every',
  // Work that waits (Patch 4): an empty farm, a building no one works on, an idle worker.
  FARM_EMPTY_ASK_STEPS: 'An empty farm asks for a worker after', SITE_UNWORKED_ASK_STEPS: 'A building no one works on asks for a builder after',
  WORKER_IDLE_ASK_STEPS: 'An idle worker asks for work after', WORK_ASK_NEAR_M: 'A worker counts as nearby within',
  // Plants' growth stages (world/props.ts).
  fromPm: 'Reached at (of its growing time)', sizePm: 'Drawn at (of full size)', yieldPm: 'Holds (of its full yield)',
  buildOver: 'Buildings can go over it', clearSteps: 'Time a builder takes to pull it up (0: trampled)',
  // Stone outcrops (Patch 4): the Heartland's scatter and each base's own.
  HEARTLAND_STONE_OUTCROPS_PER_10000: 'Stone outcrops in the Heartland, per 10,000 spots',
  START_OUTCROP_NEAR_M: 'Each base\'s stone outcrop, nearest its Big House\'s middle', START_OUTCROP_FAR_M: 'Each base\'s stone outcrop, farthest from its middle',
};

/** Section titles for the rules entries, by module (otherwise the module's own first line). */
export const MODULE_TITLES: Readonly<Record<string, string>> = {
  'training:buildings/data.ts': 'Worker training', 'units:buildings/production.ts': 'Training', 'food:buildings/data.ts': 'Farms',
  'food:buildings/production.ts': 'Slaughter', 'land:buildings/data.ts': 'Claimed land and relighting', 'tools:units/behaviour.ts': 'Tool speed',
  'world:units/behaviour.ts': 'Gathering', 'food:rules.ts': 'Upkeep', 'resources:rules.ts': 'Trinket worth', 'lairs:rules.ts': 'Lair clearing and hexes',
  'armour:rules.ts': 'Armour cap', 'pacing:rules.ts': 'Day and night', 'mobs:threats/data.ts': 'Fog nights, depth', 'food:buildings/recipes.ts': 'Cooking',
  'resources:buildings/recipes.ts': 'Trinkets', 'mobs:combat/spawn.ts': 'Spawning',
  'state.ts': 'Workers and warriors', 'units/behaviour.ts': 'Work and ranks', 'units/ranks.ts': 'Worker ranks', 'buildings/production.ts': 'Training',
  'buildings/data.ts': 'Buildings', 'combat/combat.ts': 'Combat and experience', 'combat/fight.ts': 'Fighting ranges', 'rules.ts': 'General rules',
  'units/weight.ts': 'Carrying', 'units/shelter.ts': 'Sheltering in the main base', 'units/moves.ts': 'Running and climbing', 'economy/food.ts': 'Eating and healing', 'economy/food-kinds.ts': 'Meat and fish kinds', 'buildings/recipes.ts': 'Crafting and trinkets',
  'combat/mobs.ts': 'Mob abilities', 'combat/spawn.ts': 'Spawning', 'threats/data.ts': 'Lairs, tribes and villages', 'threats/lair-alert.ts': 'Lair alerts', 'world/props.ts': 'Props',
  'buildings/mining.ts': 'Mining, prospecting and fishing', 'units/dig.ts': 'Digging', 'nav/grid.ts': 'Moving over terrain', 'world/world.ts': 'Terrain',
  'world/start.ts': 'Start basins', 'world/generate.ts': 'World generation', 'clock.ts': 'Clock', 'animals/species.ts': 'Animals', 'units/field.ts': 'Hunting', 'threats/abilities.ts': 'Goblin mage spells',
  'magic/spells.ts': 'Spells and mage ranks', 'magic/mages.ts': 'Mage training and mana', 'magic/cast.ts': 'Casting',
  'siege:mounts/data.ts': 'Riding and charges', 'siege:siege/data.ts': "Siege engines and the Citadel's engine platform", 'training:siege/data.ts': 'Artillery crewman', 'mobs:threats/late-mobs.ts': 'Late night mobs\' abilities',
  'mobs:threats/boss.ts': 'Morvath', 'mounts/data.ts': 'Riding and charges', 'siege/data.ts': "Siege engines and the Citadel's engine platform", 'threats/late-mobs.ts': 'Late night mobs\' abilities',
  'threats/boss.ts': 'Morvath',
  'threats/burns.ts': 'Fire', 'combat/projectiles.ts': 'Projectiles', 'combat/blasts.ts': 'Blasts and craters', 'economy/resources.ts': 'Resources', 'buildings/lights.ts': 'Lights',
  'buildings/placement.ts': 'Placement', 'buildings/chains.ts': 'Wall chains', 'world:buildings/chains.ts': 'Tunnel chains', 'world/layout.ts': 'World layout', 'combat/mob-ai.ts': 'Mob behaviour',
  'units/loot.ts': 'Loot', 'units/forage.ts': 'Gather, and how far from home', 'loot:units/field.ts': 'Hunt', 'loot:combat/fight.ts': 'Guarding workers',
  'tools:units/kits.ts': 'Prospecting', 'melee:units/kits.ts': 'Long melee criticals', 'training:units/kits.ts': 'Training and upgrading',
  'threats/wanderers.ts': 'Wandering night monsters', 'mobs:threats/wanderers.ts': 'Wandering night monsters',
  'combat/aims.ts': 'Waves: the bases and parties they go for', 'mobs:combat/aims.ts': 'Waves: the bases and parties they go for',
  'threats/necromancer.ts': 'The necromancer', 'mobs:threats/necromancer.ts': 'The necromancer',
  'threats/guardians.ts': 'Mana crystal guardians', 'mobs:threats/guardians.ts': 'Mana crystal guardians',
  'units/spacing.ts': 'Making room (bodies standing on one another)',
  'units/night-work.ts': 'Working through the night',
  'units/work-asks.ts': 'Work that waits: an empty farm, an unworked building, an idle worker',
  'units/make-asks.ts': 'The Workshop\'s offer to make something',
  'threats/loot.ts': 'Weapons, armour and shields in the night waves',
  'combat/threat.ts': 'Threat: how each monster\'s threat is worked out', 'mobs:combat/threat.ts': 'Threat: how each monster\'s threat is worked out',
};

/** Keys shown first in a record, in this order; the rest follow in source order. */
export const KEY_ORDER: readonly string[] = [
  'levels', 'cost', 'recipes', 'inputs', 'outputs', 'makes', 'ws', 'steps', 'health', 'hp', 'damage', 'damageTenths', 'attackSteps', 'reach', 'range',
  'speed', 'walk', 'run', 'armourBp', 'melee', 'ranged', 'firstNight', 'needsBase', 'research', 'research2', 'after', 'forge', 'made', 'madeAt', 'at',
  'supply', 'shelters', 'workers', 'light', 'crop',
];

/** Unit by key; `EXPORT:key` overrides by export, and a bare export name sets a scalar's unit. */
export const KEY_UNITS: Readonly<Record<string, UnitId>> = {
  speed10: 'speedTenths', price: 'vpTenths',
  ws: 'workerSeconds', 'SPELLS:bp': 'percentBp', hp: 'health', health: 'health', damage: 'damage', damageTenths: 'damageTenths', poisonTenths: 'damageTenths', perSecondTenths: 'damageTenths', vsWalls: 'damage', threatTenths: 'tenths', xpTenths: 'xpTenths',
  chancePm: 'percentPm', weightTenthsLb: 'lbTenths', needsBase: 'level', forge: 'level', supply: 'count', shelters: 'count', workers: 'count',
  reach: 'metresWu', range: 'metresWu', radius: 'metresWu', halfWidth: 'metresWu', height: 'metresWu', unitRadius: 'metresWu', buildingRadius: 'metresWu',
  'melee:min': 'metresWu', speed: 'speed', climbSpeed: 'speed', walk: 'speed', run: 'speed', cartSpeed: 'speed', heightCm: 'metresCm', lightM: 'metres',
  claimM: 'metres', sightBonusM: 'metres', firstNight: 'night', cartTenthsLb: 'lbTenths', packTenthsLb: 'lbTenths',
  meat: 'count', makes: 'count', perCell: 'count', groupMin: 'count', groupMax: 'count', tameFood: 'count', upkeep: 'nutrition', barnFeed: 'nutrition',
  nutrition: 'nutrition', food: 'nutrition', tier: 'level', base: 'level', rank: 'level', mana: 'number', smoulderPerSecond: 'damage', perSecond: 'damage',
  seconds: 'number', extra: 'number', runFood: 'nutrition',
  trot: 'speed', gallop: 'speed', chargeRun: 'metresWu', shoulderCm: 'metresCm', minRange: 'metresWu', reachBonus: 'metresWu', sight: 'metresWu', leash: 'metresWu',
  far: 'metresWu', near: 'metresWu', 'ENGINES:horse': 'speed', 'ENGINES:ox': 'speed', 'ENGINES:pushed': 'speed', 'ENGINES:crew': 'count',
  // Troops and gear: the kit tables are written in the blueprint's own units.
  timeS: 'wholeSeconds', troopS: 'wholeSeconds', swingDs: 'deciseconds', attackDs: 'deciseconds',
  reachCm: 'metresCm', rangeM: 'metres', troopFood: 'nutrition', fromArmour: 'level',
  'WAND_KITS:mana': 'number', PROSPECT_TOOL_TIER: 'level',
  // The swoop (Jade's patch notes 1) and the wandering night monsters.
  'SWOOP:diveSpeed': 'speed', 'SWOOP:climbSpeed': 'speed', 'SWOOP:pullLowCm': 'metresCm', 'SWOOP:pullHighCm': 'metresCm',
  WILD_FROM_NIGHT: 'night', WILD_HORDE_FROM_NIGHT: 'night', WILD_HORDE_PCT_PER_NIGHT: 'percent', WILD_HORDE_MIN: 'count', WILD_HORDE_MAX: 'count',
  WILD_CAP_PER_PLAYER: 'count', SPACING_SCAN: 'count', SPACING_NEIGHBOURS: 'count',
  'FORAGE_GOODS:base': 'level', 'FORAGE_GOODS:forge': 'level', 'FORAGE_GOODS:plenty': 'count', LOOT_BOSS_HP: 'health',
  // Patch 3: the threat algorithm's weights (combat/threat.ts).
  'THREAT:unitHealth': 'health', 'THREAT:unitDpsTenths': 'tenths', 'THREAT:healthParts': 'number', 'THREAT:damageParts': 'number',
  'THREAT:onceSeconds': 'wholeSeconds', 'THREAT:speedRefTenths': 'speedTenths', 'THREAT:rangedFullM': 'metres', 'THREAT:overWallReachCm': 'metresCm',
  'NIGHT_BUDGET:startTenths': 'tenths', 'NIGHT_BUDGET:rampTenths': 'tenths', 'NIGHT_BUDGET:perNightTenths': 'tenths', 'NIGHT_BUDGET:curveThousandths': 'thousandths',
  BUILD_XP_TENTHS_PER_MINUTE: 'xpTenths', GATHER_XP_TENTHS_PER_MINUTE: 'xpTenths',
  // Patch 5: what the waves go for (combat/aims.ts) and the towers they break.
  'WAVE_AIMS:baseM': 'metres', 'WAVE_AIMS:openM': 'metres', 'WAVE_AIMS:partyM': 'metres', 'WAVE_AIMS:edgeSpreadM': 'metres', 'WAVE_AIMS:baseReachM': 'metres',
  'WAVE_AIMS:buildingWorth': 'number', 'WAVE_AIMS:unitWorth': 'number',
  // Patch 5: Morvath's staff and wings, the necromancer, the mana crystal guardians.
  'staff:splashTenths': 'damageTenths', 'wings:total': 'health',
  'NECROMANCER:ringM': 'metres', 'NECROMANCER:bubbleS': 'wholeSeconds', 'NECROMANCER:summonMin': 'count', 'NECROMANCER:summonMax': 'count',
  'NECROMANCER:gearMin': 'count', 'NECROMANCER:gearMax': 'count', 'NECROMANCER:ingotMin': 'count', 'NECROMANCER:ingotMax': 'count', 'NECROMANCER:boneMin': 'count', 'NECROMANCER:boneMax': 'count',
  'CRYSTAL_GUARDS:min': 'count', 'CRYSTAL_GUARDS:max': 'count', 'CRYSTAL_GUARDS:leashM': 'metres', 'CRYSTAL_GUARDS:chaseM': 'metres', 'CRYSTAL_GUARDS:wakeM': 'metres', 'CRYSTAL_GUARDS:postM': 'metres',
};

/** Suffixes in export names that give a scalar its unit. Checked in order. */
/** Units for every number in a table, by export (after the key's own unit). */
export const EXPORT_UNITS: Readonly<Record<string, UnitId>> = {
  RES_VALUE_TENTHS: 'vpTenths', LIVE_VALUE_TENTHS: 'vpTenths', TRINKET_METAL_TENTHS: 'vpTenths',
  DAILY_TRADE_TENTHS: 'vpTenths', REPARATIONS_TENTHS: 'vpTenths', REPARATIONS_PER_KILL_TENTHS: 'vpTenths', PLUNDER_TENTHS_PER_PERSON: 'vpTenths',
  MERC_UNITS: 'number', ONE_IN: 'number',
};

/** What the keys or indices of a table stand for, by export: one kind per level, null where they are plain positions. */
export const INDEX_REFS: Readonly<Record<string, ReadonlyArray<RefKind | null>>> = {
  BAND_SIZE_PCT: ['band'], BAND_STOCK_PCT: ['band'], ONE_IN: [null, 'band'], PAY_PCT: ['people', 'cat'], LEANS: ['people'],
  // Patch 5 trade (GP-46, BL-4): a day of trade by kind of settlement, what each people pays for a few goods, a mercenary's price by band.
  DAILY_TRADE_TENTHS: ['faction'], GOOD_PAY_PCT: ['res', 'people'], HIRE_SILVER: ['band'],
  STOCK: ['faction'], LAYOUTS: ['faction'], PLUNDER_GOODS: ['people'], RES_VALUE_TENTHS: ['res'],
  LIVE_VALUE_TENTHS: ['species'], SALVAGE: ['mob'], MERC_UNITS: ['band'], TRINKET_METAL_TENTHS: ['trinketMetal'],
  BUILDING_SIGHT_M: ['building'], TRAIT_PCT: ['trait'],
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
