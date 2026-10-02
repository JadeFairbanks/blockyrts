// The state the threats of milestone 5 keep beside the units: cleared lair
// sites, goblin villages, hostile tribe bands, the blood night triggers
// spent, the fog night, the dusk reading of each player's difficulty and
// wood smouldering from fire. Lairs, huts and the creatures themselves are
// entities (combat/mobs.ts); these records hold what ties them together.
// Every field is an integer so the records serialise and hash like the rest.

/** A destroyed lair: its ruin stays (the lair's destroyed model), and no lair is placed near it for 10 days. */
export interface Ruin {
  /** The lair's mob id (combat/mobs.ts), whose destroyed version is drawn. */
  mob: number;
  x: number;
  z: number;
  /** The step it fell. */
  at: number;
}

/** A goblin village (Goblin villages; Table 17). Its huts, fire pit and totem are entities in group `id`. */
export interface Village {
  id: number;
  /** The cell it fills, and its middle, wu. */
  cell: number;
  x: number;
  z: number;
  band: number;
  /** Huts it rebuilds up to. */
  size: number;
  /** 1 when it has a goblin mage. */
  mage: number;
  /** Bits by player: at war, warned that one more kill means war, and has broken one of its buildings. */
  war: number;
  warned: number;
  razed: number;
  /** The players' kills of its goblins, by player. */
  kills: number[];
  /** The step it next rebuilds a hut while at peace. */
  rebuildAt: number;
  /** The last day (cycle) its warband marched. */
  raided: number;
  /** Bits by player: seen (shown on the minimap). */
  seen: number;
}

/** A roaming band of a hostile tribe (Hostile tribes; Table 16). Its tribesmen are entities in group `id`. */
export interface TribeBand {
  id: number;
  /** The tribe's mob id. */
  tribe: number;
  /** Where it is roaming to, wu. */
  x: number;
  z: number;
  /** 1 while camped for the night, at (campX, campZ). */
  camp: number;
  campX: number;
  campZ: number;
  /** The entity it is chasing (0 for none), and the last step a tribesman saw it. */
  target: number;
  sawAt: number;
}

/** Wood smouldering after a fire bolt or a fire arrow: burn per second until a step. */
export interface Burn {
  building: number;
  until: number;
  perSecond: number;
}

/** A player's difficulty as read at dusk (Rising difficulty; Table 8 budget factors and depth weighting). */
export interface DuskReading {
  /** Town and provoked factors, per mille. */
  townPm: number;
  provokedPm: number;
  /** Depth weight added to the budget, per mille of the base budget (capped at 1000). */
  depthPm: number;
  /** The deepest of the player's units and buildings outside the Heartland, its band, and its building (0 for a unit). */
  ax: number;
  az: number;
  band: number;
  building: number;
}

export interface ThreatState {
  ruins: Ruin[];
  villages: Village[];
  bands: TribeBand[];
  burns: Burn[];
  dusk: DuskReading[];
  /** Bits by depth band whose blood night is spent. */
  bloodSpent: number;
  /** 1 + the night that is a fog night, or 0. */
  fog: number;
  /** Cells checked for a goblin village. */
  checked: Set<number>;
  /** The mouths of the tunnels the players dug, wu: unlit, they count as caves for lairs (Keeping digging fair). */
  tunnels: Array<{ x: number; z: number }>;
}

export function newThreats(): ThreatState {
  return { ruins: [], villages: [], bands: [], burns: [], dusk: [], bloodSpent: 0, fog: 0, checked: new Set(), tunnels: [] };
}

/** What a mob is doing in the world besides the night attack (its role field). */
export const Role = {
  /** A night mob marching on its foe's town. */
  Night: 0,
  /** A night mob sent for a point (homeX, homeZ): the depth weighting's extras and the dusk goblins. */
  Aimed: 1,
  /** A lair's guardian or a woken sleeper: keeps to its lair (group), in the lair's shade by day. */
  Resident: 2,
  /** A hostile tribesman of band `group`. */
  Tribe: 3,
  /** A goblin of village `group`. */
  Village: 4,
  /** A lair, hut, fire pit or totem: it stands and is broken. */
  Structure: 5,
} as const;
export type Role = (typeof Role)[keyof typeof Role];
