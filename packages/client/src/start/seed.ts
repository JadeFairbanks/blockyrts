// Seed and player count parsing for the start screen and the URL. Pure.

export const MAX_SEED = 4294967295;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;

/** A seed typed by the player: a whole number 0..4294967295 (spaces and thousands separators allowed), or null. */
export function parseSeed(text: string): number | null {
  const t = text.trim().replace(/[\s,_]/g, '');
  if (!/^\d{1,10}$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_SEED ? n : null;
}

export function parsePlayers(text: string | null): number | null {
  if (text === null || !/^\s*\d+\s*$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_PLAYERS && n <= MAX_PLAYERS ? n : null;
}

/** A random seed from a 0..1 random source. */
export function randomSeed(rand: () => number = Math.random): number {
  return Math.floor(rand() * (MAX_SEED + 1)) >>> 0;
}

export interface StartOptions {
  seed: number;
  players: number;
}

/** ?seed=N&players=N skips the start screen; players defaults to 1. Null when the URL has no valid seed. */
export function startFromUrl(search: string): StartOptions | null {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText === null ? null : parseSeed(seedText);
  if (seed === null) return null;
  return { seed, players: parsePlayers(params.get('players')) ?? 1 };
}
