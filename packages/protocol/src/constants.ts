// Numbers and names the client and the server must agree on.

/** Bumped whenever a message layout changes, so mismatched clients refuse to join. */
export const PROTOCOL_VERSION = 4;

/** Up to 8 players play together (Multiplayer and saving). */
export const MAX_PLAYERS = 8;

/** The sim runs 20 steps a second; hashes are compared every 20 steps (technical decision 2). */
export const STEPS_PER_SECOND = 20;
export const HASH_INTERVAL_STEPS = 20;

/** Input delay in steps: 4 by default, raised to round trip + 2 steps, at most 12 (technical decision 3). */
export const DEFAULT_INPUT_DELAY = 4;
export const MAX_INPUT_DELAY = 12;

/** The relay keeps the last two minutes of frames for rejoin (technical decision 3). */
export const FRAME_LOG_STEPS = 120 * STEPS_PER_SECOND;

/** Timings from technical decision 3, in milliseconds. */
export const HEARTBEAT_INTERVAL_MS = 1000;
export const DROP_AFTER_MS = 3000;
export const HOST_CHOICE_AFTER_MS = 30_000;

/** Join codes: 6 characters from an alphabet with no look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The WebSocket path on the game server, and the invite link path a code resolves through. */
export const RELAY_PATH = '/relay';
export const JOIN_LINK_PATH = '/join/';

/** Longest chat line, in characters. */
export const MAX_CHAT_LENGTH = 200;
/** Largest orders payload in one frame, in bytes. */
export const MAX_FRAME_ORDER_BYTES = 4096;
/** Largest save file accepted anywhere: the 50 MB hard limit per slot (technical decision 4). */
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;
/** Saved games per account may use 500 MB (technical decision 4). */
export const ACCOUNT_SAVE_QUOTA_BYTES = 500 * 1024 * 1024;
/** Rolling autosaves kept per match (technical decision 4). */
export const AUTOSAVES_PER_MATCH = 3;

/**
 * The eight player colours offered in the lobby, in slot order of first pick.
 * Placeholder blue (52, 96, 178) on models is recoloured to these.
 */
export const PLAYER_COLOURS = [
  { name: 'Blue', hex: '#3460b2' },
  { name: 'Red', hex: '#c0392b' },
  { name: 'Green', hex: '#3f9b3a' },
  { name: 'Yellow', hex: '#e0b62c' },
  { name: 'Purple', hex: '#7d4bb5' },
  { name: 'Orange', hex: '#e07a24' },
  { name: 'Teal', hex: '#22a3a0' },
  { name: 'Pink', hex: '#d965a6' },
] as const;

/** Guests appear as "Guest" and a random 4-digit number (Accounts and guests). */
export const GUEST_NAME_PREFIX = 'Guest ';

/** Name of the session cookie the API sets. */
export const SESSION_COOKIE = 'sac_session';
