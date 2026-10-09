// The URL of a picture by file name, for How to Play and the patch notes:
// the HUD's own icons and portraits (rendered from the game's models), the
// minimap marks, and screenshots of the game (packages/assets/src/shots,
// taken by scripts/make-shots.mjs). Screenshots are for the guides and the
// patch notes only; a page about a thing shows its icon or draws its model
// (book.ts MODEL_PICTURE has the whole rule).
import { kitUrl } from '../../hud/kit-icons.ts';

const MORE = import.meta.glob<string>(
  ['../../../../assets/src/ui/minimap_*.png'],
  { eager: true, query: '?no-inline', import: 'default' },
);
const SHOTS = import.meta.glob<string>('../../../../assets/src/shots/*.jpg', { eager: true, query: '?no-inline', import: 'default' });

/** A kit picture's URL (the file name without .png), or '' when the kit has none. */
export function pictureUrl(file: string): string {
  if (!file) return '';
  if (file.startsWith('shot_')) return SHOTS[`../../../../assets/src/shots/${file}.jpg`] ?? '';
  return kitUrl(file) || (MORE[`../../../../assets/src/ui/${file}.png`] ?? '');
}
