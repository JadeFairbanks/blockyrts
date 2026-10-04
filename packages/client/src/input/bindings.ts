// Hotkeys by action, with the player's own bindings on top (Command card and
// hotkeys: "All hotkeys can be rebound in the settings menu. Rebinding
// changes the key shown on each button."). Keys are binding names as keyId
// gives them: letters by the character they type ('KeyA'), the rest by
// physical code ('F1', 'Backspace'). The build menu grid keys follow the key
// position instead and are not rebound.
import { School, SCHOOL_NAMES, SPELLS } from '@blockyrts/sim';

export interface Action {
  id: string;
  name: string;
  key: string;
  /** Where it applies, for the settings list. */
  group: 'Units' | 'Workers' | 'Mages' | 'Buildings' | 'Camera and selection' | 'Players';
}

export const ACTIONS: readonly Action[] = [
  // Jade's Patch 2 cut Stop (S), Hold Position (H), Enter (E), the four weapon and armour upgrades (Q, X, Z, V), the lock (Y) and Cannon crew training (U).
  { id: 'attack', name: 'Attack', key: 'KeyA', group: 'Units' },
  { id: 'patrol', name: 'Patrol', key: 'KeyP', group: 'Units' },
  { id: 'move', name: 'Move', key: 'KeyM', group: 'Units' },
  // Upgrade equipment takes the old Upgrade weapon key (s).
  { id: 'equip', name: 'Upgrade equipment (the best weapon, then armour, the stock pays for)', key: 'KeyQ', group: 'Units' },
  { id: 'hitch', name: 'Hitch an animal or let it go (siege engines and cannons)', key: 'KeyR', group: 'Units' },
  { id: 'port', name: 'Into a cannon port (cannons)', key: 'KeyE', group: 'Units' },
  { id: 'hunt', name: 'Hunt (warriors go out after game, home by nightfall)', key: 'KeyN', group: 'Units' },
  { id: 'eat', name: 'Eat at a building', key: 'KeyF', group: 'Units' },
  // Patch 2: the artillery crewman's own order, on a key no other unit card uses here (s).
  { id: 'crew', name: 'Crew an engine (artillery crewmen)', key: 'KeyC', group: 'Units' },
  // Patch 3: an artillery crewman retrains as a worker; W for worker, a key no unit card uses (s). Workers' Upgrade rank (U) is gone: they rank up by working.
  { id: 'retrain', name: 'Retrain as a worker (artillery crewmen)', key: 'KeyW', group: 'Units' },
  { id: 'deeper', name: 'Dig or heap: deeper or higher', key: 'Equal', group: 'Workers' },
  { id: 'shallower', name: 'Dig or heap: shallower or lower', key: 'Minus', group: 'Workers' },
  { id: 'gather', name: 'Gather (workers fetch what the camp needs, home by nightfall)', key: 'KeyG', group: 'Workers' },
  { id: 'returnCargo', name: 'Unload (take what they carry to a drop-off)', key: 'KeyC', group: 'Workers' },
  { id: 'repair', name: 'Repair', key: 'KeyR', group: 'Workers' },
  { id: 'dig', name: 'Dig', key: 'KeyD', group: 'Workers' },
  { id: 'prospect', name: 'Prospect', key: 'KeyT', group: 'Workers' },
  { id: 'build', name: 'Build', key: 'KeyB', group: 'Workers' },
  { id: 'cart', name: 'Fetch a cart from the main base, or hand it back', key: 'KeyX', group: 'Workers' },
  // Each spell on its letter in Table 13; the two schools never share a card, so R, F and the rest serve both.
  // The players' spells (the Elves' Grovesingers cast their own, never on a key).
  ...SPELLS.filter((s) => s.school !== School.Grove).map((s): Action => ({ id: spellAction(s.id), name: `${s.name} (${SCHOOL_NAMES[s.school]!.toLowerCase()}s)`, key: `Key${s.key}`, group: 'Mages' })),
  { id: 'mageRank', name: 'Upgrade rank (train at a Magi Sanctum)', key: 'KeyU', group: 'Mages' },
  { id: 'rally', name: 'Set Rally Point', key: 'KeyR', group: 'Buildings' },
  { id: 'upgrade', name: 'Upgrade building', key: 'KeyG', group: 'Buildings' },
  { id: 'unload', name: 'Unload All', key: 'KeyU', group: 'Buildings' },
  { id: 'cancelBuild', name: 'Cancel construction or upgrade', key: 'KeyX', group: 'Buildings' },
  { id: 'trainWorker', name: 'Train Worker', key: 'KeyW', group: 'Buildings' },
  // The troop types (Troops and gear): L is Follow and G a building's upgrade, so long melee is on Q (s).
  { id: 'trainClose', name: 'Train Close melee (Barracks, main base)', key: 'KeyA', group: 'Buildings' },
  { id: 'trainLong', name: 'Train Long melee (Barracks, main base)', key: 'KeyQ', group: 'Buildings' },
  { id: 'trainRanger', name: 'Train Ranger (Barracks, main base)', key: 'KeyN', group: 'Buildings' },
  { id: 'trainBrawler', name: 'Train Brawler (Barracks)', key: 'KeyB', group: 'Buildings' },
  { id: 'trainCavalry', name: 'Train Cavalry (Barracks)', key: 'KeyC', group: 'Buildings' },
  { id: 'trainSupportMage', name: 'Train Support mage', key: 'KeyS', group: 'Buildings' },
  { id: 'trainBattleMage', name: 'Train Battle mage', key: 'KeyM', group: 'Buildings' },
  { id: 'trainCrewman', name: 'Train Artillery crewman (Artillery workshop)', key: 'KeyE', group: 'Buildings' },
  { id: 'craft', name: 'Smelting, research, making or slaughter menu', key: 'KeyK', group: 'Buildings' },
  { id: 'idle', name: 'Idle Gatherer', key: 'F1', group: 'Camera and selection' },
  { id: 'army', name: 'Select Army', key: 'F2', group: 'Camera and selection' },
  { id: 'clear', name: 'Clear selection', key: 'F3', group: 'Camera and selection' },
  { id: 'townhall', name: 'Town Hall', key: 'Backspace', group: 'Camera and selection' },
  // Jade's patch notes 1: Space centres the camera on the selection, so the latest urgent message moves to F4 (s).
  { id: 'centre', name: 'Centre on the selection', key: 'Space', group: 'Camera and selection' },
  { id: 'urgent', name: 'Latest urgent message', key: 'F4', group: 'Camera and selection' },
  { id: 'follow', name: 'Follow', key: 'KeyL', group: 'Camera and selection' },
  { id: 'home', name: 'Everyone Home', key: 'KeyJ', group: 'Camera and selection' },
  { id: 'rations', name: 'Rations', key: 'F9', group: 'Camera and selection' },
  { id: 'peoples', name: 'Peoples panel', key: 'KeyO', group: 'Camera and selection' },
  { id: 'subgroup', name: 'Next subgroup', key: 'Tab', group: 'Camera and selection' },
  // Milestone 9 (s): keys no unit or building card uses. Chat stays on Enter.
  { id: 'allies', name: 'Allies panel', key: 'BracketLeft', group: 'Players' },
  { id: 'send', name: 'Send resources', key: 'BracketRight', group: 'Players' },
  { id: 'ping', name: 'Map ping', key: 'Backslash', group: 'Players' },
  { id: 'pause', name: 'Pause', key: 'Pause', group: 'Players' },
];

/** The binding name of a spell's button. */
export function spellAction(spell: number): string {
  return `spell${spell}`;
}

const DEFAULTS = new Map(ACTIONS.map((a) => [a.id, a.key]));

/** Grid keys of the build menus by slot, as physical codes (the same position on any layout). */
export const GRID_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'] as const;

/** The key bound to an action: the player's binding, else the default. */
export function keyFor(bindings: Readonly<Record<string, string>>, action: string): string {
  return bindings[action] ?? DEFAULTS.get(action) ?? '';
}

/** Keeps only known actions bound to plausible key names. */
export function sanitizeBindings(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === null || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (DEFAULTS.has(k) && typeof v === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v)) out[k] = v;
  }
  return out;
}

/** Other actions in the same group already on a key (shown as a warning when rebinding). */
export function clashes(bindings: Readonly<Record<string, string>>, action: string, key: string): string[] {
  const a = ACTIONS.find((x) => x.id === action);
  if (!a) return [];
  return ACTIONS.filter((x) => x.id !== action && x.group === a.group && keyFor(bindings, x.id) === key).map((x) => x.name);
}
