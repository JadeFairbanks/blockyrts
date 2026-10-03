// The interface kit's pictures (packages/assets/src/ui): the 32 px command,
// training, building, research and gear icons and the 64 px portraits, each
// as its own file fetched the first time the HUD shows it. The HUD's buttons,
// the selection grid and the production queue draw from here, so the same
// thing always has the same picture (patch notes 1: standardised icons).
const URLS = import.meta.glob<string>(['../../../assets/src/ui/icon_*.png', '../../../assets/src/ui/portrait_*.png'], {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

const PREFIX = '../../../assets/src/ui/';

/** A kit picture's URL in the build (the file name without .png), or '' when the kit has none by that name. */
export function kitUrl(file: string): string {
  return URLS[`${PREFIX}${file}.png`] ?? '';
}

/** Whether the kit has a picture by that name. */
export function hasKit(file: string): boolean {
  return kitUrl(file) !== '';
}

/** The first of these pictures the kit has, or ''. */
export function firstKit(...files: string[]): string {
  for (const f of files) if (hasKit(f)) return f;
  return '';
}
