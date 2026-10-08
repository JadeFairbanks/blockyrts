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
      qol: [
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
