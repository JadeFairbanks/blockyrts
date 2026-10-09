// How to Play's guides: the premise and how to play, in plain words. Every
// number in them comes from the game's own data, so a guide stays right
// when the balance changes. [[Page name]] links to a page of numbers by its
// title (How to Play's tests check that every link finds its page).
import { CYCLE_STEPS, DAWN_STEPS, DAY_STEPS, DUSK_STEPS, MEAL_STEPS, MOBS, NIGHT_STEPS, NUTRITION_PER_CYCLE, Quest, QUEST_REACH_M, QUEST_REPEAT_STEPS, QUESTS, rewardText, STEPS_PER_SECOND } from '@blockyrts/sim';
import { UNITS, type UnitId } from '@blockyrts/balance';
import { unitHint } from './article.ts';

export interface GuidePart {
  heading?: string;
  /** Paragraphs; [[Page name]] links to that page. */
  paragraphs: readonly string[];
  /** A short list after the paragraphs. */
  bullets?: readonly string[];
  /** A picture beside the part: an interface-kit file, without .png. */
  picture?: string;
}

export interface Guide {
  id: string;
  title: string;
  /** One line for the list of guides. */
  summary: string;
  /** The guide's picture: a big scene (loading_*, menu_background) or a kit icon. */
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

/** The night monsters come: the latest first night of any kind in the monster table. */
const lastMonster = MOBS.reduce((a, b) => (b.firstNight > a.firstNight ? b : a), MOBS[0]!);
const lastName = lastMonster.name.split(',')[0]!;

const UNIT_LINES: ReadonlyArray<readonly [UnitId, string]> = [
  ['seconds', 'Times are in seconds of game time.'],
  ['workerSeconds', 'Building work is in worker-seconds:'],
  ['health', 'Health is in health points (HP).'],
  ['percentBp', 'Armour and chances are in percent:'],
  ['metresWu', 'Distances are in metres, the size of the world around you:'],
  ['speed', 'Speeds are in metres a second:'],
  ['lbTenths', 'Weights are in pounds (lb):'],
  ['xpTenths', 'Experience is in experience points (XP):'],
  ['nutrition', 'Food is in nutrition:'],
];

/** A quest's row, its reward in words, and how many it asks to kill. */
const quest = (id: number) => QUESTS.find((q) => q.id === id)!;
const reward = (id: number): string => rewardText(quest(id));
const kills = (id: number): number => {
  const n = quest(id).need;
  return n.t === 'mobs' || n.t === 'animals' ? n.n : 0;
};
const repeatDays = Math.round(QUEST_REPEAT_STEPS / CYCLE_STEPS);

export const GUIDES: readonly Guide[] = [
  {
    id: 'premise',
    title: 'The premise',
    summary: 'What Survive and Conquer is, and what you are trying to do.',
    picture: 'menu_background',
    parts: [
      {
        paragraphs: [
          'Survive and Conquer is a survival strategy game for one to eight players working together. You start with a handful of workers and warriors beside a [[Big House]] in an endless, wild world.',
          'By day you gather wood, stone and food, build up your base, research better metals and train troops. By night the monsters come, and they come every night, more of them and stronger ones as the nights go on.',
          `There is no last night. New kinds of monster keep joining the waves, all the way to ${lastName}, who first comes on night ${lastMonster.firstNight}. How long can you hold?`,
        ],
        picture: 'loading_2_wall',
      },
      {
        heading: 'Playing together',
        paragraphs: [
          'Each player has a base of their own, close to the others. The waves grow with the number of players, so friends share the danger as well as the work.',
          'Beyond your walls live other peoples: Halflings, Runkin, Elves and Dwarves, who trade with you, and lairs and tribes that will not.',
        ],
        picture: 'loading_3_dwarf_gate',
      },
    ],
  },
  {
    id: 'day-and-night',
    title: 'Day and night',
    summary: `One day lasts ${minutes(CYCLE_STEPS)}: day, dusk, night and dawn.`,
    picture: 'loading_1_oak',
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
        heading: 'Eating',
        paragraphs: [
          `Your people eat every ${minutes(MEAL_STEPS)}, ${NUTRITION_PER_CYCLE} nutrition each a day, from the food in your stores. Food also heals the wounded. See [[Eating and healing]] for every number.`,
        ],
        picture: 'icon_farm_fare',
      },
    ],
  },
  {
    id: 'reading-numbers',
    title: 'Reading the numbers',
    summary: 'What the units on every page mean.',
    picture: 'icon_scriptorium',
    parts: [
      {
        paragraphs: [
          'Every page in How to Play shows the numbers the game itself uses, so they are always up to date. Hold the pointer over a number to see what its unit means.',
        ],
        bullets: UNIT_LINES.map(([unit, line]) => (line.endsWith(':') ? `${line} ${unitHint(unit)}.` : line) + (UNITS[unit].suffix ? ` Shown as "${UNITS[unit].suffix}".` : '')),
      },
      {
        heading: 'Zero and none',
        paragraphs: ['Numbers that are zero for a thing, and switches that are off, are gathered on one line at the end of each part of a page, so the numbers that matter stand out.'],
      },
    ],
  },
  {
    id: 'quests',
    title: 'Quests',
    summary: 'The tasks the peoples give, and how to take them on and claim their rewards.',
    picture: 'portrait_halfling_male',
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
];
