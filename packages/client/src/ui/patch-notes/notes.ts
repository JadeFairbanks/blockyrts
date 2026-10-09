// The patch notes players read on the site: one entry per patch, newest
// first, each split into Bug fixes, Balance, Gameplay and content, and
// Quality of life. They are written for players, as any game's patch notes
// are: plain English, every changed number given exactly, no names of
// people and nothing about tools only the developers use. A new patch goes
// at the top of PATCH_NOTES; the one below it then keeps its own version
// and date.

export type NoteCategory = 'bugFixes' | 'balance' | 'gameplay' | 'qol';

/** The categories in the order a patch shows them. */
export const NOTE_CATEGORIES: ReadonlyArray<{ id: NoteCategory; title: string; picture: string }> = [
  { id: 'bugFixes', title: 'Bug fixes', picture: 'icon_cmd_repair' },
  { id: 'balance', title: 'Balance', picture: 'icon_status_fortified' },
  { id: 'gameplay', title: 'Gameplay and content', picture: 'icon_cmd_attack' },
  { id: 'qol', title: 'Quality of life', picture: 'icon_status_quickened' },
];

export interface PatchNoteItem {
  /** A short lead in bold, such as the feature's name. */
  title?: string;
  text: string;
  /** Exact numbers or steps, one line each. */
  details?: readonly string[];
  /** A picture beside the change: an interface-kit file, without .png. */
  picture?: string;
}

export interface PatchNote {
  /** "Patch 5". */
  name: string;
  /** The game version it went live as. The newest patch leaves it out and shows the game's own version. */
  version?: string;
  /** The day it went live, YYYY-MM-DD. */
  date?: string;
  /** One line under the name. */
  headline: string;
  intro?: readonly string[];
  changes: Partial<Record<NoteCategory, readonly PatchNoteItem[]>>;
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    name: 'Patch 5',
    headline: 'A new way to learn the game, and a home for every update.',
    intro: ['The full list of this update’s changes is on its way. Here is what is new on the main menu.'],
    changes: {
      gameplay: [
        {
          title: 'Quests',
          text: 'The peoples now have quests for you. Once you have met a Halfling village, Runkin camp, Dwarf colony or Dwarf city, or the Elves, and are at peace with them, their leader asks over their head whether you will take on their task. Answer Yes with one of your units within 15 m of the leader to take it, and come back with a unit when it is done to claim the reward, straight into your inventory.',
          details: [
            'Halflings, the Bog Pear: bring the Village elder a bog pear from a bog. While you hold one, the elder offers to take it for 50 farm fare (100 food), 50 softwood lumber and 50 stone. Hint: "It\'s in a bog. Duh."',
            'Runkin, the Raid: wipe out the band of gnolls, kobolds or hobgoblins nearest the camp, which your minimap pings when you take the quest, and come back for 10 leather and 4 bronze ingots.',
            'Elves, Fae Guardians: kill 2 Fae Guardians, then come back to the Elf steward or any caravan master for 3 basket-hilted broadswords, 3 fluted Gothic harnesses and 3 steel rotellas, all carbon steel. Hint: "Fae Guardians protect mana stones. They are flying so swords won\'t be much help."',
            'Dwarf colonies, Griffin Hunt: kill 2 griffins for 15 silver ingots. Dwarf cities, Minotaur Hunt: kill 2 minotaurs for 8 gold ingots. Each pings the nearest beast when taken.',
            'Each player has their own copy of every quest: another player\'s progress never counts for you. A quest stays open until you claim it, and comes back 20 days after you do.',
            'A people at war with you offers no quest and takes no claims until there is peace again.',
          ],
          picture: 'portrait_halfling_male',
        },
      ],
      qol: [
        {
          title: 'Quest menu',
          text: 'A small ! button right above the messages button opens your quests: what each asks, how far along you are, the reward, and a Hint that shows a tip or pings your target on the minimap. It starts folded, and a number on it counts quests you have taken or finished and not looked at yet.',
          details: ["Under your quests it also tracks the stone circles: the Moon Goddess's blessing and the nights to your next Bright Night."],
          picture: 'icon_scriptorium',
        },
        {
          title: 'How to Play',
          text: 'A new How to Play button on the main menu opens a guide to the whole game: the premise, guides on how to play, and a page for every building, unit, weapon, piece of armour, spell, recipe, item, animal and monster.',
          details: [
            'Every page shows that thing’s numbers straight from the game: costs, build and training times, health, damage, ranges, speeds and more, so they are always up to date.',
            'Search any page by name from the search box, or browse the sections in the sidebar.',
            'Pages link to each other: a resource’s page shows what drops it, what makes it and what it is used for.',
            'The address follows the page you are reading, so the browser’s Back button works and you can share a link to any page.',
          ],
          picture: 'icon_scriptorium',
        },
        {
          title: 'Patch notes',
          text: 'The main menu now shows the latest update by name, with a mark until you have read its notes, and a Patch notes button that lists every update from this one on, newest first.',
        },
      ],
    },
  },
];

/** The newest patch. */
export const LATEST_PATCH: PatchNote = PATCH_NOTES[0]!;

const SEEN_KEY = 'sac.patch-notes-seen';

/** Whether this browser has opened the newest patch's notes. */
export function latestSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === LATEST_PATCH.name;
  } catch {
    return false;
  }
}

export function markLatestSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_PATCH.name);
  } catch {
    // Storage may be off (a private window): the mark just stays.
  }
}
