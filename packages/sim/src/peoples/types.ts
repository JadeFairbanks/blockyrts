// The state the neutral peoples keep beside their units (Neutral villages
// and trade; Technical decisions 13: faction AI). A faction's people,
// beasts and buildings are entities whose group is the faction's id; this
// record holds what ties them together: who it is at war with, who has met
// and traded with it, its stock and the day's limits, the players' open
// offers, and its plans (caravans, raids, migration). Every field is an
// integer or a list of integers so it serialises and hashes like the rest.
// This module imports nothing from the rest of the sim, so combat can ask
// it who is at war with whom.

export interface Faction {
  id: number;
  /** peoples/data.ts FactionKind and People. */
  kind: number;
  people: number;
  /** The faction it belongs to for war and peace (an Elf caravan's kingdom), or 0. */
  parent: number;
  /** The cell it fills (0 for none), its middle (wu) and band. */
  cell: number;
  x: number;
  z: number;
  band: number;
  /** Its specialisation (data.ts LEANS), and a hash its name and choices come from. */
  lean: number;
  seed: number;
  /** data.ts Status. */
  status: number;
  /** 1 once its buildings and people have been placed (the Elf kingdom is known before it is found). */
  built: number;
  /** Bits by player: at war, has met it, has traded with it, has seen it (minimap). */
  war: number;
  met: number;
  traded: number;
  seen: number;
  /** Its people when founded, and how many have died; the players' kills of its people, by player (Dwarf reparations). */
  founded: number;
  dead: number;
  kills: number[];
  /** The player whose unit last killed one of its people (plunder on a defeat), or -1. */
  lastTaker: number;
  /** Surrender: 0 none, 1 offered, 2 refused (it fights on). */
  surrender: number;
  /** Its leader (an entity id; right click to trade), or 0. */
  leader: number;
  /** Per player: trade closed until this step (mood, an insult); the last offer turned down (a key), and how many times today. */
  closedUntil: number[];
  lastOffer: number[];
  declines: number[];
  /** Per player: tree warnings given (Elves), and the step of the last one. */
  warnings: number[];
  warnedAt: number[];
  /** What it sells, as (good, count) pairs, and its full counts. */
  stock: number[];
  stockMax: number[];
  /** Value traded today (tenths), by every player together (Patch 5, GP-46), and the day (cycle) the counts are for. */
  bought: number;
  day: number;
  /** When it next does something on a timer: a caravan, a raid, gaining back a person, a mercenary; 0 for none. */
  nextAt: number;
  regrowAt: number;
  /** Elves: the step each player's next caravan comes (0 for none yet). Caravans: the player it visits (-1 wandering) and the step it leaves. */
  caravanAt: number[];
  visits: number;
  leaveAt: number;
  /** Leaving: the step it set off, and where it is going (wu). Runkin away: the cell to camp in, and how many are left. */
  leftAt: number;
  toX: number;
  toZ: number;
  toCell: number;
  survivors: number;
  /** Dwarves migrated: the step their rebuilding ends. */
  rebuildUntil: number;
  /** Mercenary camp: how many it hires out when full. */
  size: number;
  /** Halfling village: war oxen still in its barn, ridden out when a war starts. */
  oxen: number;
}

/** A player's open offer to a faction, with the three answers the faction gave (each a list of (good, count) pairs). */
export interface Offer {
  faction: number;
  player: number;
  goods: number[];
  /** What the faction makes of the offer, tenths, and its three bundles. */
  worth: number;
  bundles: number[][];
}

export interface PeoplesState {
  factions: Faction[];
  offers: Offer[];
  /** Cells checked for the peoples (each is checked once, the first time the players come near). */
  checked: Set<number>;
  /** Bits by player: has met the Elves (caravans come; no more wandering caravans once anyone has). */
  elvesMet: number;
}

export function newPeoples(): PeoplesState {
  return { factions: [], offers: [], checked: new Set(), elvesMet: 0 };
}

/** The scalar fields of a faction in serialisation order, then its lists. */
export const FACTION_FIELDS = [
  'id', 'kind', 'people', 'parent', 'cell', 'x', 'z', 'band', 'lean', 'seed', 'status', 'built', 'war', 'met', 'traded', 'seen', 'founded', 'dead', 'lastTaker',
  'surrender', 'leader', 'day', 'nextAt', 'regrowAt', 'visits', 'leaveAt', 'leftAt', 'toX', 'toZ', 'toCell', 'survivors', 'rebuildUntil', 'size', 'oxen',
  'bought',
] as const satisfies ReadonlyArray<keyof Faction>;
export const FACTION_LISTS = ['kills', 'closedUntil', 'lastOffer', 'declines', 'warnings', 'warnedAt', 'stock', 'stockMax', 'caravanAt'] as const satisfies ReadonlyArray<keyof Faction>;

/** Not state: each peoples state's factions by id (rebuilt when the list changes). */
const index = new WeakMap<PeoplesState, { list: Faction[]; length: number; byId: Map<number, Faction> }>();

/** A faction by id, or undefined. */
export function factionById(ps: PeoplesState, id: number): Faction | undefined {
  if (id === 0) return undefined;
  let ix = index.get(ps);
  if (!ix || ix.list !== ps.factions || ix.length !== ps.factions.length) {
    ix = { list: ps.factions, length: ps.factions.length, byId: new Map(ps.factions.map((f) => [f.id, f])) };
    index.set(ps, ix);
  }
  return ix.byId.get(id);
}

/** The faction war and peace are decided by: the faction itself, or a caravan's kingdom. */
export function warFaction(ps: PeoplesState, f: Faction): Faction {
  return f.parent ? (factionById(ps, f.parent) ?? f) : f;
}

/** Whether faction `group` (a unit's group) is at war with a player. */
export function atWar(ps: PeoplesState, group: number, player: number): boolean {
  const f = factionById(ps, group);
  if (!f || player < 0 || player > 7) return false;
  return (warFaction(ps, f).war & (1 << player)) !== 0;
}
