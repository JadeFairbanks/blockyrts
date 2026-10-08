// The URL of an interface-kit picture by file name, for How to Play and the
// patch notes: the HUD's own icons and portraits, plus the minimap marks and
// the big scenes these pages use.
import { kitUrl } from '../../hud/kit-icons.ts';

const MORE = import.meta.glob<string>(
  ['../../../../assets/src/ui/minimap_*.png', '../../../../assets/src/ui/loading_*.png', '../../../../assets/src/ui/menu_background.png'],
  { eager: true, query: '?no-inline', import: 'default' },
);

/** A kit picture's URL (the file name without .png), or '' when the kit has none. */
export function pictureUrl(file: string): string {
  if (!file) return '';
  return kitUrl(file) || (MORE[`../../../../assets/src/ui/${file}.png`] ?? '');
}
