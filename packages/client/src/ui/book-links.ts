// The addresses of How to Play and the patch notes (the part after #), so a
// link can open either straight from outside the game and the browser's
// Back button leaves them. Kept apart from the screens themselves, which
// load only when opened.
export const HOW_TO_PLAY_HASH = '#how-to-play';
export const PATCH_NOTES_HASH = '#patch-notes';

/** Which of the two screens an address opens, if either: the How to Play page's own address after the slash. */
export function bookFromHash(hash: string): { book: 'how-to-play'; slug: string } | { book: 'patch-notes' } | null {
  if (hash === PATCH_NOTES_HASH) return { book: 'patch-notes' };
  if (hash === HOW_TO_PLAY_HASH || hash.startsWith(`${HOW_TO_PLAY_HASH}/`)) {
    let slug = hash.slice(HOW_TO_PLAY_HASH.length + 1);
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // A broken address opens the front page.
      slug = '';
    }
    return { book: 'how-to-play', slug };
  }
  return null;
}
