// The game version on the main menu. The Deploy workflow sets
// VITE_GAME_VERSION (deploy/scripts/game-version.ts); a local build shows the
// version the next deploy will take, marked as a dev build.
import file from '../../../version.json';

const deployed = (import.meta.env.VITE_GAME_VERSION as string | undefined) ?? '';
export const GAME_VERSION = deployed !== '' ? deployed : `${file.stage} ${file.next} (dev build)`;
