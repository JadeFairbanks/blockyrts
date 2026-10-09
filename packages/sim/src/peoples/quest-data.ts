// The peoples' quests (Jade's Patch 5, QV-1 to QV-34) as data rows: who
// gives each, what it asks, its hint, its reward and what the giver says.
// The Halflings', the Runkin's and the Elves' are Jade's (QV-16 to QV-32);
// the two Dwarf quests are the thread's, as QV-34 asks ("one quest for
// dwarves (2 different ones for dwarf strongholds) ... Dwarves pay in
// precious metal ingots"). Picks are in blueprint/patch5-peoples-picks.md.

import { STEPS_PER_SECOND } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { Res, type Cost } from '../economy/resources.ts';
import { Mob } from '../combat/mobs.ts';
import { Species } from '../animals/species.ts';
import { FactionKind } from './data.ts';

/** The quests, one to a people (QV-4: "One feature each"), the Dwarves' one to each kind of stronghold. */
export const Quest = {
  /** Halflings (QV-16 to QV-21): bring the Village elder a bog pear. */
  BogPear: 0,
  /** Runkin (QV-22 to QV-26): kill a nearby band of gnolls, kobolds or hobgoblins. */
  Raid: 1,
  /** Elves (QV-27 to QV-32): kill 2 Fae Guardians. */
  Fae: 2,
  /** Dwarf colony (QV-34, s): kill 2 griffins. */
  Griffins: 3,
  /** Dwarf city (QV-34, s): kill 2 minotaurs. */
  Minotaurs: 4,
} as const;
export type Quest = (typeof Quest)[keyof typeof Quest];

/** A quest's stage for one player (Faction.quest): on offer (or waiting for its next turn, Faction.questAt), taken, done and waiting to be claimed. */
export const QuestStage = { Open: 0, Taken: 1, Done: 2 } as const;

/** The quests' questions (units/questions.ts kinds; answer orders take 1 to 31): take it on, and claim the reward. */
export const QuestAsk = { Offer: 21, Claim: 22 } as const;

/** QV-11: "they can do the same quest again after 20 more days go by", counted from the claim. */
export const QUEST_REPEAT_STEPS = 20 * CYCLE_STEPS;
/** QV-10: "the player needs a unit close to the quest giver to take on a quest or to accept it" (s: 15 m). */
export const QUEST_REACH_M = 15;
/** No to an offer or a claim: asked again this much later (s: 1 minute). */
export const QUEST_ASK_AGAIN_STEPS = 60 * STEPS_PER_SECOND;

/** What a quest asks: a good brought back, a tribe band wiped out, or kills of mobs or wild animals counted from when it was taken. */
export type QuestNeed =
  | { t: 'bring'; res: number }
  | { t: 'band' }
  | { t: 'mobs'; mobs: readonly number[]; n: number }
  | { t: 'animals'; species: number; n: number };

export interface QuestSpec {
  id: Quest;
  /** The kinds of faction whose leader gives it (FactionKind); an Elf caravan's quest is its kingdom's. */
  givers: readonly number[];
  /** Its name in the quest menu. */
  title: string;
  need: QuestNeed;
  reward: Cost;
  /** The quest menu's Hint: a tooltip, or (ping) the minimap pings what to kill, with the tooltip when nothing is about. */
  hint: string;
  ping: boolean;
  /** What the giver says, in its question and when it is taken and claimed. `{tribe}` is the band's kind, plural ("gnolls"). */
  offer: string;
  taken: string;
  claim: string;
  thanks: string;
  /** The quest menu's task line, before its progress. */
  task: string;
}

const Q = Quest;

export const QUESTS: readonly QuestSpec[] = [
  {
    id: Q.BogPear, givers: [FactionKind.HalflingVillage], title: 'The Bog Pear',
    need: { t: 'bring', res: Res.BogPear },
    // QV-21: "about 100 food (as farm fare), 50 lumber and 50 stone": farm fare is 2 food apiece.
    reward: [[Res.FarmFare, 50], [Res.SoftwoodLumber, 50], [Res.Stone, 50]],
    hint: "It's in a bog. Duh.", ping: false,
    offer: "I've a craving only a bog pear can cure. Bring me one and I'll fill your stores with farm fare, lumber and stone!",
    taken: 'Splendid! Bog pears grow in the bogs. Mind whoever keeps them.',
    claim: 'Is that a bog pear? Hand it over and your reward is yours!',
    thanks: "What a beauty! Here's your farm fare, lumber and stone, as promised.",
    task: 'Find a bog pear and bring it to the Village elder.',
  },
  {
    id: Q.Raid, givers: [FactionKind.RunkinCamp], title: 'The Raid',
    need: { t: 'band' },
    reward: [[Res.Leather, 10], [Res.BronzeIngot, 4]],
    hint: 'The band is marked on your minimap.', ping: true,
    offer: 'A band of {tribe} prowls too near our camp. Wipe them out, then come back to me for 10 leather and 4 bronze ingots.',
    taken: "I've marked them on your map. Come back to me when the last of them falls.",
    claim: 'The {tribe} are broken! Come, take what we promised.',
    thanks: 'Ten leather and four bronze ingots, as promised. Our camp sleeps easier.',
    task: 'Kill the band of {tribe} marked on your minimap, then come back to the Camp elder.',
  },
  {
    id: Q.Fae, givers: [FactionKind.ElfKingdom, FactionKind.ElfCaravan], title: 'Fae Guardians',
    need: { t: 'mobs', mobs: [Mob.FaeGuardian, Mob.FaeGuardianAloft], n: 2 },
    // QV-32: "3 weapons, 3 sets of armour and 3 shields, all of the highest steel tier": carbon steel (s), a swordsman's set.
    reward: [[Res.BasketHiltedBroadsword, 3], [Res.FlutedGothicHarness, 3], [Res.SteelRotella, 3]],
    hint: "Fae Guardians protect mana stones. They are flying so swords won't be much help.", ping: false,
    offer: 'The Fae Guardians grow ever bolder. Slay two of them and come back to the Elf steward or a caravan master: three swords, three harnesses and three shields of carbon steel are yours.',
    taken: 'Two of them, then. Come back to any of us when it is done.',
    claim: 'Two Fae Guardians fallen? Then claim your steel!',
    thanks: 'Three swords, three harnesses and three shields, the finest carbon steel. Wear them well.',
    task: 'Kill 2 Fae Guardians, then bring a unit to the Elf steward or a caravan master.',
  },
  {
    id: Q.Griffins, givers: [FactionKind.DwarfColony], title: 'Griffin Hunt',
    need: { t: 'animals', species: Species.Griffin, n: 2 },
    reward: [[Res.Silver, 15]],
    hint: 'Griffins nest in the Barrens and the Deadlands.', ping: true,
    offer: 'Griffins keep swooping on our miners. Kill two of them and come back: the colony pays 15 silver ingots.',
    taken: "Good! I've marked the nearest one on your map.",
    claim: 'Two griffins down? The colony pays its debts!',
    thanks: 'Fifteen silver ingots, counted twice. Our miners thank you.',
    task: 'Kill 2 griffins, then come back to the Colony foreman.',
  },
  {
    id: Q.Minotaurs, givers: [FactionKind.DwarfCity], title: 'Minotaur Hunt',
    need: { t: 'animals', species: Species.Minotaur, n: 2 },
    reward: [[Res.Gold, 8]],
    hint: 'Minotaurs roam the Deadlands.', ping: true,
    offer: 'Minotaurs prowl the Deadlands round our gates. Bring down two of them and return to me: the city pays 8 gold ingots.',
    taken: "I've marked the nearest beast on your map. Mind its horns.",
    claim: 'Two minotaurs slain? The city keeps its word!',
    thanks: 'Eight gold ingots, as the city promised. Well fought.',
    task: 'Kill 2 minotaurs, then come back to the City thane.',
  },
];

/** The quest a faction kind's leader gives, or undefined (the mercenary camps, new in Patch 5, give none). */
export function questOfKind(kind: number): QuestSpec | undefined {
  return QUESTS.find((q) => q.givers.includes(kind));
}
