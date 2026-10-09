// How to Play's guides: the premise and how to play, in plain words. Every
// number in them comes from the game's own data, so a guide stays right
// when the balance changes. [[Page name]] links to a page of numbers by its
// title (How to Play's tests check that every link finds its page).
import {
  BAND_NAMES,
  BARN_YARD_WU,
  BLESSED_EVERY_NIGHTS,
  BOOST_PCT,
  BOOST_QUEUE_LIMIT,
  BOOST_STEPS,
  BOSS_RETURN_NIGHTS,
  BuildingKind,
  BUILDINGS,
  CIRCLE_BANDS,
  CIRCLES_PER_BAND_MAX,
  CLIMB_SLOW,
  costText,
  CRYSTAL_GUARDS,
  CRYSTAL_STAND_IN,
  CYCLE_STEPS,
  DAWN_STEPS,
  DAY_STEPS,
  DREADNOUGHT,
  DREADNOUGHT_KIT,
  DUSK_STEPS,
  ENCOUNTERS,
  FERTILIZE_BONEMEAL,
  FOG_CHANCE_PCT,
  FOG_FROM_NIGHT,
  Gait,
  GAITS,
  GIFT_GOLD,
  GIFT_ROSES,
  GIFT_SILVER,
  GRAZE_SAVES_PM,
  HAWTHORNE_GROW_NIGHTS,
  HAWTHORNE_M,
  HAWTHORNE_PCT,
  HEADLESS,
  KEEPERS,
  MEAL_STEPS,
  MOBS,
  MUSHROOM_SPREAD,
  NECROMANCER,
  NIGHT_STEPS,
  NIGHT_WORK_BASE_M,
  NIGHT_WORK_TROOP_M,
  NUTRITION_PER_CYCLE,
  PAN_FLUTE_RADIUS_M,
  PAN_FLUTE_USES,
  PLATFORM_MEN,
  Quest,
  QUEST_REACH_M,
  QUEST_REPEAT_STEPS,
  QUESTS,
  rewardText,
  RUN_BONUS_BP,
  RUN_FOOD_METRES,
  SILVER_PER_GOLD,
  SPECIES,
  SPELLS,
  STEPS_PER_SECOND,
  TAVERN,
  TRADE_RANGE_WU,
  TRAINING,
  WOODS,
  WOODSMAN,
  WU_PER_METRE,
  WU_PER_TERRAIN_UNIT,
} from '@blockyrts/sim';
import { UNITS, type UnitId } from '@blockyrts/balance';
import { MODEL_PICTURE } from './book.ts';


export interface GuidePart {
  heading?: string;
  /** Paragraphs; [[Page name]] links to that page. */
  paragraphs: readonly string[];
  /** A short list after the paragraphs. */
  bullets?: readonly string[];
  /** A picture beside the part: a screenshot of the game (shot_*, shown wide), a kit picture without its extension, or a model (MODEL_PICTURE). */
  picture?: string;
}

export interface Guide {
  id: string;
  title: string;
  /** One line for the list of guides. */
  summary: string;
  /** The guide's picture: a screenshot of the game (shot_*), shown as its banner, a kit picture, or a model (MODEL_PICTURE). */
  picture: string;
  parts: readonly GuidePart[];
}

const secs = (steps: number): number => Math.round(steps / STEPS_PER_SECOND);
const minutes = (steps: number): string => {
  const s = secs(steps);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} seconds`;
  return r === 0 ? `${m} minute${m === 1 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'} ${r} seconds`;
};
/** Seconds as minutes, to the half minute: "2 minutes", "3.5 minutes". */
const mins = (s: number): string => {
  const m = Math.round((s / 60) * 2) / 2;
  return `${m} minute${m === 1 ? '' : 's'}`;
};
/** A height in terrain units in words: centimetres under a metre, else metres to the half. */
const height = (units: number): string => {
  const m = (units * WU_PER_TERRAIN_UNIT) / WU_PER_METRE;
  return m < 1 ? `${Math.round(m * 100)} cm` : `${Math.round(m * 2) / 2} m`;
};
const metres = (wu: number): number => Math.round(wu / WU_PER_METRE);
const pct = (bp: number): string => `${bp / 100}%`;
/** A cost in words, "118 lumber, 45 stone", with ingots and crystals counted in the plural. */
const costWords = (cost: Parameters<typeof costText>[0]): string =>
  costText(cost).replace(/\b(\d+) ([a-z ]*?(ingot|crystal))\b/g, (all, n: string, name: string) => (n === '1' ? all : `${n} ${name}s`));
const list = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** The night monsters come: the latest first night of any kind in the monster table. */
const lastMonster = MOBS.reduce((a, b) => (b.firstNight > a.firstNight ? b : a), MOBS[0]!);
const lastName = lastMonster.name.split(',')[0]!;
const mob = (name: string) => MOBS.find((m) => m.name.startsWith(name))!;

const UNIT_LINES: ReadonlyArray<readonly [UnitId, string]> = [
  ['seconds', 'Times are in seconds of game time.'],
  ['workerSeconds', 'Building work is in worker-seconds: one worker for that many seconds, or two workers for half as long.'],
  ['health', 'Health is in health points (HP).'],
  ['percentBp', 'Armour and chances are in percent.'],
  ['metresWu', 'Distances are in metres, the size of the world around you.'],
  ['speed', 'Speeds are in metres a second.'],
  ['lbTenths', 'Weights are in pounds.'],
  ['xpTenths', 'Experience is in experience points (XP).'],
  ['nutrition', 'Food is in nutrition, what a unit eats.'],
];

/** A quest's row, its reward in words, and how many it asks to kill. */
const quest = (id: number) => QUESTS.find((q) => q.id === id)!;
const reward = (id: number): string => rewardText(quest(id));
const kills = (id: number): number => {
  const n = quest(id).need;
  return n.t === 'mobs' || n.t === 'animals' ? n.n : 0;
};
const repeatDays = Math.round(QUEST_REPEAT_STEPS / CYCLE_STEPS);

// The main base's tiers, and what each tier lets you build.
const building = (kind: number) => BUILDINGS.find((b) => b.kind === kind)!;
const BASE = building(BuildingKind.MainBase);
const tierName = (tier: number): string => BASE.levels[tier - 1]?.name ?? `tier ${tier}`;
const opensAt = (tier: number): string[] =>
  BUILDINGS.filter((b) => b.live && b.kind !== BuildingKind.MainBase && (b.levels[0]?.needsBase ?? 0) === tier).map((b) => b.name);
const tavern = building(BuildingKind.Tavern);
const tavernTier = tavern.levels[0]!.needsBase;
/** What its other way to pay swaps: the lines of `alt` not in its cost, for the lines of its cost not in `alt`. */
const tavernAlt = (tavern.levels[0]!.alt ?? []).filter(([r]) => !tavern.levels[0]!.cost.some(([c]) => c === r));
const tavernSwapped = tavern.levels[0]!.cost.filter(([r]) => !(tavern.levels[0]!.alt ?? []).some(([a]) => a === r));

const gait = (g: number) => GAITS[g]!;
const tame = (name: string): number => SPECIES.find((s) => s.name === name)?.tameFood ?? 0;
const spell = (name: string) => SPELLS.find((s) => s.name === name)!;
const dreadTiers = DREADNOUGHT.capByTier.map((n, tier) => ({ n, tier })).filter((x) => x.n > 0 && x.tier > 0);

export const GUIDES: readonly Guide[] = [
  {
    id: 'premise',
    title: 'The premise',
    summary: 'What Survive and Conquer is, and what you are trying to do.',
    picture: 'shot_start',
    parts: [
      {
        paragraphs: [
          `Survive and Conquer is a survival strategy game for one to eight players working together. You start with a handful of workers and warriors beside a [[${tierName(1)}]] in an endless, wild world.`,
          'By day you gather wood, stone and food, build up your base, research better metals and train troops. By night the monsters come, and they come every night, more of them and stronger ones as the nights go on.',
          `There is no last night. New kinds of monster keep joining the waves, all the way to ${lastName}, who first comes on night ${lastMonster.firstNight}. How long can you hold?`,
        ],
      },
      {
        heading: 'Playing together',
        paragraphs: [
          'Each player has a base of their own, close to the others. Every player draws their own share of each night\'s monsters, so more players face more of them, and friends share the danger as well as the work.',
          'Beyond your walls live other peoples: Halflings, Runkin, Elves and Dwarves, who trade with you and give you quests, and lairs, tribes and stranger things that will not.',
        ],
        picture: `${MODEL_PICTURE}elf_hall`,
      },
    ],
  },
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Selecting units, giving orders and your first day.',
    picture: 'portrait_worker_labourer',
    parts: [
      {
        heading: 'Selecting and ordering',
        paragraphs: [
          'Left click a unit to select it, or drag a box around several. Double click one, or Ctrl and click, to select all of its kind on screen. Hold Shift to add to the selection.',
          'Right click to give an order: the ground to walk there, a tree or rock to gather it, a monster to attack it. Hold Shift to line up several orders. Every order also has a button, with its hotkey letter on it.',
        ],
        bullets: [
          'F1 finds an idle worker, F2 selects your whole army, F7 your woodsmen, and Backspace takes the camera home to your main base.',
          'Hold ` and press 1 to 0 to save a control group; press the number to select it again.',
          'Hold , or . to turn the camera, and double tap either to face north again.',
        ],
      },
      {
        heading: 'Your first day',
        paragraphs: [
          'Put your workers on wood and stone first: almost everything costs lumber and stone. Build a [[Farm]] for food and a [[Storehouse]] near far-off gathering spots so loads have less far to go.',
          'Workers carry what they gather back to a drop-off, and hand it in by themselves when they pass one. Select a single unit to see what it carries and how heavy it is; right click any item in your stockpile or on a unit to use, equip, unload, drop or scrap it.',
          'Lights claim the land round them: build torch posts and bonfires to push your land out and to see at night. See [[Claimed land and relighting]].',
        ],
      },
    ],
  },
  {
    id: 'day-and-night',
    title: 'Day and night',
    summary: `One day lasts ${minutes(CYCLE_STEPS)}: day, dusk, night and dawn.`,
    picture: `${MODEL_PICTURE}torch_post`,
    parts: [
      {
        paragraphs: [`Every day runs through four parts, ${minutes(CYCLE_STEPS)} in all:`],
        bullets: [
          `Day, ${minutes(DAY_STEPS)}: the time to gather, build and explore.`,
          `Dusk, ${minutes(DUSK_STEPS)}: bring your workers home and man the walls.`,
          `Night, ${minutes(NIGHT_STEPS)}: the monsters attack, from the dark edges of the world and from lairs nearby.`,
          `Dawn, ${minutes(DAWN_STEPS)}: monsters that burn in the sun start to burn, and it is safe to go out again soon after.`,
        ],
      },
      {
        heading: 'Nights at home',
        paragraphs: [
          'At dusk your workers head home. They shelter in a Farm or [[Barn]] with room before the main base, and right clicking the main base sends any worker inside. Troops and mages shelter in the main base too, the fighters deeper inside and the archers and mages up top; Eject brings everyone out.',
          `A worker may work on through the night only within ${NIGHT_WORK_BASE_M} m of a main base with one of your troops within ${NIGHT_WORK_TROOP_M} m. See [[Working through the night]].`,
        ],
      },
      {
        heading: 'Fog',
        paragraphs: [
          `From night ${FOG_FROM_NIGHT} on, each night has a ${FOG_CHANCE_PCT}% chance of fog: everyone sees half as far and lights reach half as far, until morning. See [[Fog nights]].`,
        ],
      },
      {
        heading: 'Eating',
        paragraphs: [
          `Your people eat every ${minutes(MEAL_STEPS)}, ${NUTRITION_PER_CYCLE} nutrition each a day, from the food in your stores. Food also heals the wounded. See [[Eating and healing]] for every number.`,
        ],
        picture: 'icon_farm_fare',
      },
    ],
  },
  {
    id: 'main-base',
    title: 'Your main base',
    summary: `The ${list(BASE.levels.map((l) => l.name))}: what each tier costs and opens.`,
    picture: 'shot_citadel',
    parts: [
      {
        paragraphs: [
          `Your main base grows through ${BASE.levels.length} tiers. Each tier makes it tougher, gives more supply for your units, and opens new buildings, research and better gear.`,
        ],
        bullets: BASE.levels.map(
          (l, i) => `Tier ${i + 1}, ${l.name}: ${i === 0 ? 'you start with it' : costWords(l.cost)}. ${l.health.toLocaleString('en-GB')} health, ${l.supply} supply.`,
        ),
      },
      {
        heading: 'What each tier opens',
        paragraphs: ['Some buildings can be built from the start; the rest wait for a tier:'],
        bullets: [0, ...BASE.levels.map((_, i) => i + 1)]
          .map((tier) => ({ tier, names: opensAt(tier) }))
          .filter((x) => x.names.length > 0)
          .map((x) => (x.tier <= 1 ? `From the start: ${list(x.names)}.` : `${tierName(x.tier)}: ${list(x.names)}.`)),
      },
      {
        heading: "The Citadel's engine platform",
        paragraphs: [
          `The ${tierName(BASE.levels.length)} has a platform on top. Build defense (D) mounts a fixed siege engine up there, at its mobile engine's cost, and it can be upgraded to the next for the difference. Garrison artillery crewmen (G) trains crewmen straight onto it, where they stay. An empty platform holds ${PLATFORM_MEN} of your other units instead. See [[Siege engines and the Citadel's engine platform]].`,
        ],
        picture: 'icon_cannon_iron_fixed',
      },
    ],
  },
  {
    id: 'food-and-farming',
    title: 'Food and farming',
    summary: 'Farms, bonemeal, eating, and what food heals.',
    picture: 'icon_farm_fare',
    parts: [
      {
        paragraphs: [
          'Food keeps your people alive and heals them. A [[Farm]] with farmers on it grows farm fare; hunters, woodsmen and a Barn bring in meat, fish, eggs and wild food. Every kind counts as food in your stores.',
          'A unit eats for the health it is missing, healing as it eats, and a unit at full health does not eat. Running costs food too. See [[Eating and healing]].',
        ],
      },
      {
        heading: 'Fertilizing',
        paragraphs: [
          `The [[Workshop]] grinds bone into bonemeal. A farm's Fertilize (F) spends ${FERTILIZE_BONEMEAL} bonemeal for ${BOOST_PCT}% more growth for ${minutes(BOOST_STEPS)}. Up to ${BOOST_QUEUE_LIMIT} boosts can wait in line, and right clicking Fertilize sets the farm to fertilize by itself whenever you have bonemeal. See [[Fertilizing farms]].`,
          `A Sweet Hawthorne, grown from an Ancient Seed found at the stone circles, makes farms within ${HAWTHORNE_M} m of it grow ${HAWTHORNE_PCT}% more.`,
        ],
        picture: 'icon_bonemeal',
      },
    ],
  },
  {
    id: 'animals',
    title: 'Animals and the Barn',
    summary: 'Taming, breeding, grazing and hunting.',
    picture: 'shot_barn',
    parts: [
      {
        heading: 'The Barn',
        paragraphs: [
          `A [[Barn]] keeps your animals and needs its barn hand on the job, tending them by day. By day the animals graze within ${metres(BARN_YARD_WU)} m of the Barn in the ${list(BAND_NAMES.slice(0, 3))}, which saves ${GRAZE_SAVES_PM / 10}% of their feed. Cavalry trained at the Barracks takes its horse from a Barn.`,
        ],
      },
      {
        heading: 'Taming and breeding',
        paragraphs: [
          `Workers tame wild chickens, cattle, horses and oxen by feeding them plant food (a chicken takes ${tame('Chicken')}, a horse ${tame('Horse')}, cattle ${tame('Cattle')} and an ox ${tame('Ox')}), then lead them home to a Barn. Animals look for a mate when they are ready and show hearts as they breed.`,
        ],
        picture: 'portrait_horse',
      },
      {
        heading: 'Hunting',
        paragraphs: [
          'Hunt sends warriors after wild animals for meat and hides; right click it to keep them hunting by themselves. Hunters pick berries on the way and go home once their bags are full. Some animals fight back, and a few hunt in packs. See [[Hunting]] and [[Wild animals]].',
        ],
        picture: 'portrait_wild_boar',
      },
    ],
  },
  {
    id: 'woodsmen',
    title: 'Woodsmen and wild food',
    summary: 'Fishing, berries and mushrooms.',
    picture: 'portrait_woodsman',
    parts: [
      {
        paragraphs: [
          `The [[Woodsman]] is trained at the [[Scholar's Lodge]] (W) for ${WOODSMAN.food} food, sticks, leather (or hides) and flax. He fishes, forages for berries, mushrooms and other wild food, and fights with a spear, any tier of long weapon, for ${WOODSMAN.damageLess} less damage than a troop. Select one to see the food he brings in against what he eats.`,
          `Only woodsmen fish. Fish swim in every stretch of water, a woodsman lands one every ${WOODS.fishS} seconds, and a stretch is never fished out. See [[The woodsman fishing and foraging]].`,
        ],
      },
      {
        heading: 'Wild food',
        paragraphs: [
          `Berry bushes (black berries, raspberries and blueberries) grow in the ${list(BAND_NAMES.slice(0, 3))} and fill up again after picking. Mushrooms grow under trees and come up again nearby ${mins(MUSHROOM_SPREAD.minS)} to ${mins(MUSHROOM_SPREAD.maxS)} after being picked, but never in the ${list(BAND_NAMES.slice(3))}.`,
        ],
        picture: 'icon_raspberries',
      },
    ],
  },
  {
    id: 'gear',
    title: 'Weapons, armour and tools',
    summary: 'Gear in your stockpile, upgrading and scrapping.',
    picture: 'icon_shield_steel_heater_steel',
    parts: [
      {
        paragraphs: [
          'Weapons, armour, shields, tool kits, wands and robes are items in your stockpile. Each kind has tiers, from wood and leather up to carbon steel, and each metal needs its research and its main base tier at the [[Forge]].',
          `Training or upgrading a unit makes its piece from materials, or, when a ready piece is in stock, puts it on in ${TRAINING.fitTimePm === 200 ? 'a fifth' : `${TRAINING.fitTimePm / 10}%`} of the time. Upgrading from materials takes ${TRAINING.upgradeTimePm / 10}% of the new piece's time. The piece a unit takes off goes to your stockpile.`,
          'Close melee troops carry a shield in a slot of its own. The [[Workshop]] scraps unwanted gear back into its full materials. See [[Training and upgrading]].',
        ],
      },
      {
        heading: 'Loot',
        paragraphs: [
          'Later night waves carry gear and drop it when they fall, at about the tier you would expect by then. Poison tips, made from venom, add poison damage to arrows and bolts and are never used up. Spider silk counts as rope, and obsidian as flint. See [[Weapons, armour and shields in the night waves]] and [[Poison tips]].',
        ],
      },
    ],
  },
  {
    id: 'troops',
    title: 'Training troops',
    summary: 'The Barracks, its troops and their kits.',
    picture: 'shot_barracks',
    parts: [
      {
        paragraphs: [
          `The [[Barracks]] trains your troops, each for ${TRAINING.troopFood} food and its gear. Its panel shows every troop with the weapon, armour and shield it will carry; better tiers open with your research and main base. Troops go by their tier names, from the club fighter up.`,
          'Troops gain experience and ranks as they fight. Cavalry needs a horse from a Barn. See [[Training]] and [[Combat and experience]].',
        ],
      },
      {
        heading: 'Repairing',
        paragraphs: [
          'Workers repair buildings for a share of their materials, in proportion to the health they restore. Right click Repair to turn on autorepair, and Repair All (F8) calls workers near a damaged building. See [[Repairs]].',
        ],
        picture: 'icon_cmd_repair',
      },
    ],
  },
  {
    id: 'defences',
    title: 'Defences and siege engines',
    summary: 'Walls, gates, towers, the earth rampart and engines.',
    picture: 'shot_siege',
    parts: [
      {
        paragraphs: [
          'The Defences menu (M) builds walls, gates and towers in wood, hardwood or stone, chained point to point. Gates let your units through; your units cannot climb walls or buildings. Towers shoot at monsters in reach, and monsters break a tower that is shooting them when no unit is in their reach.',
          `The [[Earth rampart]] is a 2 m chunk of earth, chained like a wall, for ${costWords(building(BuildingKind.EarthRampart).levels[0]!.cost)} each, as tough as one wooden wall column. Your units cannot climb it, and it cannot be dug away.`,
        ],
        picture: 'icon_rampart_earth',
      },
      {
        heading: 'Siege engines',
        paragraphs: [
          'The [[Artillery workshop]] builds catapults, ballistas and cannons, crewed by artillery crewmen. Hitch a horse or ox to move one, or let the crew push it. An engine ordered to attack something fires at it, whatever it is; on its own it picks only enemies. Cannonballs fell trees they hit and chip craters into soft ground. See [[Blasts and craters]].',
        ],
        picture: 'portrait_catapult',
      },
    ],
  },
  {
    id: 'monsters',
    title: 'Nights and monsters',
    summary: `The waves, the Necromancer and ${lastName}.`,
    picture: 'portrait_necromancer',
    parts: [
      {
        paragraphs: [
          'Every night monsters come out of the dark edge of the world and from lairs near you. They go for every base and every group of units by what it is worth, not only your main base, and go round walls unless the way round is very long.',
          'A new kind of monster joins the waves every few nights. Each has its own page under Monsters, with the night it first comes.',
        ],
      },
      {
        heading: 'The Necromancer',
        paragraphs: [
          `From night ${mob('Necromancer').firstNight}, the [[Necromancer]] raises ${NECROMANCER.summonMin} or ${NECROMANCER.summonMax} skeleton archers and zombies round him every ${secs(NECROMANCER.summonSteps)} seconds. He and his raised dead burn away at dawn. He drops ${NECROMANCER.gearMin} to ${NECROMANCER.gearMax} pieces of gear, ingots and bones, and sometimes a mana crystal.`,
        ],
        picture: 'portrait_necromancer',
      },
      {
        heading: lastName,
        paragraphs: [
          `On night ${lastMonster.firstNight} ${lastName} himself comes, with ${lastMonster.hp.toLocaleString('en-GB')} health. If he lives to see the dawn he withdraws and comes back the next night as hurt as he left; beaten, he returns ${BOSS_RETURN_NIGHTS} nights later. See [[Morvath]].`,
        ],
        picture: 'portrait_morvath',
      },
    ],
  },
  {
    id: 'mages',
    title: 'Mages and spells',
    summary: 'Battle and support mages, autocast and ranks.',
    picture: 'portrait_mage_battle',
    parts: [
      {
        paragraphs: [
          'The [[Magi Sanctum]] trains battle mages and support mages. Mages fight with spells from range, using mana that refills over time, and rise through the ranks as they train; better wands and robes add to their spells and mana.',
          `Rank training needs mana crystals; ${CRYSTAL_STAND_IN.per} demon horns can stand in for each one. See [[Spells and mage ranks]] and [[Mage training and mana]].`,
        ],
      },
      {
        heading: 'Autocast',
        paragraphs: [
          'Left click a spell to cast it at once; right click it to put it on autocast. A battle mage always keeps one attack spell on autocast, the Arcane bolt to start with, plus Counterspell. A support mage chooses freely and starts on Heal and Energy dart.',
          'Autocast heals go to units missing at least half a heal, the most hurt first; autocast buffs go, in a fight, to the most valuable unit in the most danger. A group of selected mages all cast the spell you give them.',
        ],
        bullets: [
          `Energy dart: a support mage's dart of light for ${spell('Energy dart').mana} mana.`,
          `Area blast: cast on a unit or on the ground, it hurts every unit nearby that is not a player's, for ${spell('Area blast').mana} mana.`,
        ],
        picture: 'icon_spell_arcane_bolt',
      },
    ],
  },
  {
    id: 'getting-around',
    title: 'Running, climbing and digging',
    summary: 'How units move over the land, and how to reshape it.',
    picture: 'icon_cmd_dig',
    parts: [
      {
        heading: 'Running',
        paragraphs: [
          `Every unit on foot has a Run/Walk button (H). Running is ${pct(RUN_BONUS_BP)} faster than walking and costs 1 food for every ${RUN_FOOD_METRES} m run.`,
        ],
      },
      {
        heading: 'Jumping and climbing',
        paragraphs: [
          `Units on foot jump up ${height(gait(Gait.Worker).jump)} and drop down ${height(gait(Gait.Worker).drop)}; horses clear ${height(gait(Gait.Cavalry).jump)}. Higher than that, a unit climbs when its path needs it: workers and woodsmen up to ${height(gait(Gait.Worker).climb)}, other units on foot up to ${height(gait(Gait.Fighter).climb)}, at ${CLIMB_SLOW === 5 ? 'a fifth' : `1/${CLIMB_SLOW}`} of walking pace. Cavalry, engines and the Dreadnought never climb. Units climb land and rock only: walls, buildings and the earth rampart need a gate. See [[Running and climbing]].`,
        ],
      },
      {
        heading: 'Digging',
        paragraphs: [
          'Workers dig earth with Dig: draw a box, and pick a depth. A depth below 0 draws the box upward, to take a hill away. Diggers work in layers from the high points across the whole box, and climb out of the pit with their loads. Click a cliff face to dig a tunnel into it. See [[Digging]].',
        ],
      },
    ],
  },
  {
    id: 'peoples',
    title: 'The peoples and trade',
    summary: 'Halflings, Runkin, Elves, Dwarves and mercenaries.',
    picture: `${MODEL_PICTURE}dwarf_city_gate`,
    parts: [
      {
        paragraphs: [
          'Halfling villages, Runkin camps, the Elf kingdom and its caravans, Dwarf colonies and Dwarf cities stand out in the wild, the bigger settlements farther out. Once you have met them they trade with you and give you quests. Anger them and they go to war.',
          `Trade opens from any of a people's buildings, or from its leader, with one of your units within ${metres(TRADE_RANGE_WU)} m. Elf caravans travel and have their own trade menu. Every settlement has a daily trade allowance, shared by every player and refilled at dawn. See [[Trading with the peoples]].`,
        ],
      },
      {
        heading: 'Mercenaries',
        paragraphs: [
          `Mercenary camps hire out their fighters for good, for silver or gold ingots (a gold ingot counts as ${SILVER_PER_GOLD} silver). See [[War, raids, caravans and hiring]].`,
        ],
        picture: 'icon_silver',
      },
    ],
  },
  {
    id: 'quests',
    title: 'Quests',
    summary: 'The tasks the peoples give, and how to take them on and claim their rewards.',
    picture: 'shot_quest_offer',
    parts: [
      {
        paragraphs: [
          'Every Halfling village, Runkin camp, Dwarf colony and Dwarf city, and the Elves, has a quest for you. Once you have met them and are at peace with them, their leader shows it in a bubble over their head with a Yes and a No, and keeps it there until you answer.',
          `To take a quest on, answer Yes with one of your units within ${QUEST_REACH_M} m of the leader. No, and they ask again a minute later.`,
          `When the task is done, the leader asks whether you want to claim your reward. Answer Yes with a unit within ${QUEST_REACH_M} m and the reward goes straight into your inventory.`,
          `Quests are your own: in a game with friends, each of you takes, works on and claims your own copy, and nobody else's progress counts for you. A quest stays open until you claim it, and the same leader offers it to you again ${repeatDays} days after you claim it.`,
        ],
      },
      {
        heading: 'The quest menu',
        paragraphs: [
          'The small ! button right above the messages button opens your quests: what each asks, how far along you are, the reward and a Hint. A number on the button counts quests you have taken or finished and not looked at yet.',
          "Under your quests the menu also tracks the stone circles: the Moon Goddess's blessing and the nights to your next Bright Night.",
        ],
        picture: 'shot_quest_menu',
      },
      {
        heading: 'Halflings: the Bog Pear',
        picture: 'icon_bog_pear',
        paragraphs: [
          `The Village elder craves a bog pear. Find one and bring it home: once one is in your inventory, the elder asks you to claim your reward for as long as you hold it. Claiming hands over the pear for ${reward(Quest.BogPear)}.`,
          "There is no ping for this one. The Hint says: It's in a bog. Duh.",
        ],
      },
      {
        heading: 'Runkin: the Raid',
        picture: 'portrait_kobold',
        paragraphs: [
          'The Camp elder wants the nearest band of gnolls, kobolds or hobgoblins wiped out. Taking the quest pings the band on your minimap, and the Hint pings it again wherever it has roamed. The quest is offered only while a band is about.',
          `When the last of the band falls, with at least one of them killed by your units, go back to the Camp elder to claim ${reward(Quest.Raid)}. If someone else wipes the band out before you have killed one, the next nearest band is marked instead.`,
        ],
      },
      {
        heading: 'Elves: Fae Guardians',
        picture: 'portrait_fairy',
        paragraphs: [
          `The Elf steward or any caravan master asks you to kill ${kills(Quest.Fae)} Fae Guardians, the fairies that keep the large mana crystals. Only the ones you kill after taking the quest count. Then bring a unit back to the Elf steward or any caravan master to claim ${reward(Quest.Fae)}, all of carbon steel.`,
          "There is no ping. The Hint says: Fae Guardians protect mana stones. They are flying so swords won't be much help.",
          'Fae Guardians never come back once killed, so the quest is not offered once fewer than two are left in the world, nor in a peaceful game.',
        ],
      },
      {
        heading: 'Dwarf colonies: Griffin Hunt',
        picture: 'portrait_griffin',
        paragraphs: [
          `The Colony foreman asks you to kill ${kills(Quest.Griffins)} griffins, which nest in the Barrens and the Deadlands. Taking the quest pings the nearest griffin, and the Hint pings it again. Come back to the foreman to claim ${reward(Quest.Griffins)}.`,
        ],
      },
      {
        heading: 'Dwarf cities: Minotaur Hunt',
        picture: 'portrait_minotaur',
        paragraphs: [
          `The City thane asks you to kill ${kills(Quest.Minotaurs)} minotaurs, which roam the Deadlands. Taking the quest pings the nearest minotaur, and the Hint pings it again. Come back to the thane to claim ${reward(Quest.Minotaurs)}.`,
        ],
      },
      {
        heading: 'War and quests',
        paragraphs: ['A people at war with you offers nothing and takes no claims. A quest you had taken waits until there is peace again.'],
      },
    ],
  },
  {
    id: 'stone-circles',
    title: 'Stone circles and Bright Nights',
    summary: 'The ruins in the wild, their treasures and the Moon Goddess.',
    picture: `${MODEL_PICTURE}trilithon_intact`,
    parts: [
      {
        paragraphs: [
          `Ancient stone circles stand in the ${list(CIRCLE_BANDS.map((b) => BAND_NAMES[b]!))}, up to ${CIRCLES_PER_BAND_MAX} in each, in three sizes and four kinds: plain circles, Lunar circles, Silenus circles and Boneyards. Their ruins hold bluestone, which needs iron tools or better, bones and treasure chests. See [[Stone circles]].`,
        ],
        bullets: [
          `The Ancient Seed grows into a Sweet Hawthorne in ${HAWTHORNE_GROW_NIGHTS} nights. Its fruit feeds you, farms within ${HAWTHORNE_M} m grow ${HAWTHORNE_PCT}% more, and animals near it breed ${HAWTHORNE_PCT}% faster.`,
          `The Pan Flute (${PAN_FLUTE_USES} uses) calls every animal within ${PAN_FLUTE_RADIUS_M} m to your base.`,
          'Honey, enchanted wine and hawthorne cider are good food; enchanted wine also gives a mage mana.',
        ],
      },
      {
        heading: 'The Moon Goddess and Bright Nights',
        paragraphs: [
          `Leave ${GIFT_GOLD} gold or ${GIFT_SILVER} silver and ${GIFT_ROSES} Moon Roses at a Lunar circle's altar for the Moon Goddess's blessing: one Bright Night in every ${BLESSED_EVERY_NIGHTS}, starting the next night, when your share of the waves stays away. Monsters already nearby, and waves on their way to other players, can still find you.`,
          'Moon Roses bloom only on Bright Nights, and a worker or woodsman picks them. The quest menu shows the nights to your next Bright Night.',
        ],
        picture: 'icon_moon_rose',
      },
      {
        heading: 'The Headless God Idol',
        paragraphs: [
          `Found at a Boneyard, the [[Headless God Idol]] turns one night's waves on a people of your choosing. It can be used again ${HEADLESS.everyNights} nights later.`,
        ],
      },
    ],
  },
  {
    id: 'keepers',
    title: 'Keepers of the wild',
    summary: "The guardians of bogs, crystals, springs and the circles.",
    picture: 'portrait_bog_guardian',
    parts: [
      {
        paragraphs: [
          `Some places in the wild have keepers, who come when your units first get within ${KEEPERS.wakeM} m. Once killed, they are gone for good.`,
        ],
      },
      {
        heading: 'The Bog guardian',
        paragraphs: [
          `Every bog has a keeper, a huge ogre with ${mob('Bog guardian').hp} health. Bogs hold bog iron and silver nuggets on the ground. Answer his question before you take from his bog; anger him and he hunts the offender, then asks for peace. He drops armour, weapons, silver, gold and a bog pear. See [[Bog guardian]].`,
        ],
        picture: 'portrait_bog_guardian',
      },
      {
        heading: 'The Fae Guardian',
        paragraphs: [
          `Large mana crystals stand in every band, each kept by a Fae Guardian, a fairy with ${mob('Fae Guardian').hp} health who kills anyone who mines her crystal and, once struck, flies high out of reach of swords. She drops mana crystals, a wand or robe, trinkets and gear. See [[Fae Guardian]].`,
        ],
        picture: 'portrait_fairy',
      },
      {
        heading: 'Crystal and spring guardians',
        paragraphs: [
          `Mana crystals in the ${BAND_NAMES[4]} are guarded by ${CRYSTAL_GUARDS.min} or ${CRYSTAL_GUARDS.max} ash golems or mana wraiths, who go for a gathering worker first. Hot springs are guarded by ash golems. See [[Mana crystal guardians]] and [[Hot spring guardians]].`,
        ],
        picture: 'portrait_mana_wraith',
      },
      {
        heading: "The circles' keepers",
        paragraphs: ['Each kind of stone circle has its own keepers:'],
        bullets: [
          `Lunar circles: the [[Great White Ape]], ${mob('Great White Ape').hp.toLocaleString('en-GB')} health, tends a garden, sells fruit, honey and wine for silver, and fights the night's monsters on his grounds. Take from his chests, cut his hawthorne or break his stones and he warns you first; push on and he rages, throwing your units and leaping in with a thunderclap that deals ${ENCOUNTERS.ape.leap.min} to ${ENCOUNTERS.ape.leap.max} damage to every unit within ${ENCOUNTERS.ape.leap.radiusM} m as he lands.`,
          'Silenus circles: [[Silenus]] feasts with his satyrs until struck or robbed; then they fight. Pressed hard, Silenus turns into a sabretooth tiger.',
          'Boneyards: a [[Lich]], hostile to everyone, guarded by necromancers who raise the dead as the fight begins. His Acrid Wind leaves a grave-touch that wears units down, and he drains his own followers to heal.',
        ],
        picture: 'portrait_great_white_ape',
      },
    ],
  },
  {
    id: 'tavern',
    title: 'The Tavern and the Dreadnought',
    summary: 'Turning food into silver, and hiring the Dreadnought.',
    picture: 'icon_tavern',
    parts: [
      {
        paragraphs: [
          `The [[Tavern]] needs a ${tierName(tavernTier)} and costs ${costWords(tavern.levels[0]!.cost)}${tavernAlt.length > 0 ? ` (or ${costWords(tavernAlt)} in place of the ${costWords(tavernSwapped).replace(/^\d+ /, '')})` : ''}. Open it for business (F) and it turns 1 food every ${secs(TAVERN.burnSteps)} seconds into silver, ${TAVERN.foodPerSilver} food to an ingot; withdraw whole silver ingots when you like. At night it glows and fills with figures while open.`,
        ],
        picture: 'icon_tavern',
      },
      {
        heading: 'The Dreadnought',
        paragraphs: [
          `The [[Dreadnought]] is hired at a Tavern (H) for ${DREADNOUGHT.food} food and ${DREADNOUGHT.gold} gold, or ${DREADNOUGHT.gold * DREADNOUGHT.silverPerGold} silver. He has ${DREADNOUGHT.hp} health and heavy armour, and his mace strikes every ${DREADNOUGHT_KIT.attackDs / 10} seconds, by turns a ${DREADNOUGHT_KIT.smash.damage}-damage smash and a ${DREADNOUGHT_KIT.swing.damage}-damage sweep. He walks and runs ${pct(10000 - gait(Gait.Dreadnought).paceBp)} slower than others on foot and never climbs.`,
          `You may have ${list(dreadTiers.map((x) => `${x.n} with a ${tierName(x.tier)}`))}.`,
        ],
        picture: 'icon_dreadnought',
      },
    ],
  },
  {
    id: 'the-world',
    title: 'The world and its bands',
    summary: `${BAND_NAMES.length} bands, from the ${BAND_NAMES[0]} to the ${BAND_NAMES.at(-1)}.`,
    picture: `${MODEL_PICTURE}signpost`,
    parts: [
      {
        paragraphs: [
          `The world is endless, laid out in rings round your base: the ${list([...BAND_NAMES])}. Each band out is wilder: better metals and stones, bigger settlements, and stronger animals, lairs and keepers.`,
          'Mountains, ravines, bogs, lakes and rivers shape the land. Gold and silver nodes sit on mountain slopes, coal rocks and 3 m boulders are full of stone, and flax fields, hot springs and mana crystals wait farther out. See [[World layout]] and [[Trees, plants and rocks]].',
        ],
      },
      {
        heading: 'The minimap',
        paragraphs: [
          'The minimap shows the land you have explored. Lairs and villages outside its window sit pinned to its edge, and a unit that cannot find its way pings it until you look.',
        ],
      },
    ],
  },
  {
    id: 'reading-numbers',
    title: 'Reading the numbers',
    summary: 'What the units on every page mean.',
    picture: 'shot_unit_card',
    parts: [
      {
        paragraphs: [
          'Every page in How to Play shows the numbers the game itself uses, so they are always up to date. Hold the pointer over a number to see what its unit means.',
        ],
        bullets: UNIT_LINES.map(([unit, line]) => line + (UNITS[unit].suffix ? ` Shown as "${UNITS[unit].suffix}".` : '')),
      },
      {
        heading: 'Zero and none',
        paragraphs: ['Numbers that are zero for a thing, and switches that are off, are gathered on one line at the end of each part of a page, so the numbers that matter stand out.'],
      },
    ],
  },
];
