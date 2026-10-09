// The game version on the main menu. The Deploy workflow sets
// VITE_GAME_VERSION (deploy/scripts/game-version.ts); a local build shows the
// version the next deploy will take, marked as a dev build.
import file from '../../../version.json';

const deployed = (import.meta.env.VITE_GAME_VERSION as string | undefined) ?? '';
export const GAME_VERSION = deployed !== '' ? deployed : `${file.stage} ${file.next} (dev build)`;

/**
 * The day the site was built, as yyyy-mm-dd (vite.config.ts sets it only for
 * the Deploy workflow's build), or '' in a local build. The patch notes show
 * it on the newest update when that update has no date of its own.
 */
export const BUILD_DAY = (import.meta.env.VITE_BUILD_DAY as string | undefined) ?? '';
