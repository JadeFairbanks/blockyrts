// The state the threats of milestone 5 keep beside the units: cleared lair
// sites, goblin villages, hostile tribe bands, the fog night, the dusk
// reading of each player's difficulty and wood smouldering from fire. Lairs,
// huts and the creatures themselves are entities (combat/mobs.ts); these
// records hold what ties them together. Every field is an integer so the
// records serialise and hash like the rest.

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

/** A patch of the wild filled with wandering monsters tonight (threats/wanderers.ts): where it is (patch coordinates), the group its monsters came out as (0 for none), and how many came. */
export interface WildPatch {
  px: number;
  pz: number;
  group: number;
  size: number;
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

/**
 * Jade's Patch 5 (MB-11, MF-1 to MF-12): a Bog guardian keeping a bog, or a
 * Fae Guardian keeping a large mana crystal (threats/keepers.ts). It goes
 * when its keeper dies; what it kept stays marked in `guarded`.
 */
export interface Keeper {
  /** The keeper's entity id. */
  id: number;
  /** KeeperKind: 0 the Bog guardian, 1 the Fae Guardian. */
  kind: number;
  /** What it keeps: the bog's middle or the crystal's column middle, wu; the bog's reach, wu (0 for a crystal). */
  x: number;
  z: number;
  r: number;
  /** KeeperMode. */
  mode: number;
  /** The unit it is about (an entity id, 0 for none): the gatherer it asked about, or the one it is after. */
  unit: number;
  /** The gather order it stopped, to give back on Yes: the prop's chunk and index. */
  cx: number;
  cz: number;
  pi: number;
  /** The step it next says a line or looks alarmed; the step it next picks a spot to wander to. */
  next: number;
  roam: number;
  /** The step it last greeted or warned the players' units, and whether any were in its ground at its last look (1 or 0). */
  greeted: number;
  seen: number;
  /** The step its mode last changed (a blow struck before it does not count); it stands roaring until `still`. */
  since: number;
  still: number;
  /** 1 once the Fae Guardian has gone for anyone (MF-12: her tooltip stops showing). */
  riled: number;
}

export interface ThreatState {
  ruins: Ruin[];
  villages: Village[];
  bands: TribeBand[];
  burns: Burn[];
  dusk: DuskReading[];
  /** 1 + the night that is a fog night, or 0. */
  fog: number;
  /** Cells checked for a goblin village. */
  checked: Set<number>;
  /** The mouths of the tunnels the players dug, wu: unlit, they count as caves for lairs (Keeping digging fair). */
  tunnels: Array<{ x: number; z: number }>;
  /** Milestone 8: Morvath (roster 5.25): the night he comes next (110 at first), the health he withdrew with (0 for full), and his entity while out. */
  bossNext: number;
  bossHp: number;
  bossId: number;
  /** Patches of the wild filled with wandering monsters tonight, in the order they were filled; emptied at dawn (Jade's patch notes 1). */
  wild: WildPatch[];
  /** Jade's Patch 5 (MB-13): the Deadlands' mana crystals whose guardians have come (world.ts colKey of each crystal's column); never again. */
  guarded: Set<number>;
  /** Jade's Patch 5 (MB-11, MF-1): the Bog guardians and Fae Guardians alive, in the order they came (their bog's or crystal's column is in `guarded`). */
  keepers: Keeper[];
}

/** Morvath's first night (roster 5.25). */
export const BOSS_FIRST_NIGHT = 110;

export function newThreats(): ThreatState {
  return { ruins: [], villages: [], bands: [], burns: [], dusk: [], fog: 0, checked: new Set(), tunnels: [], bossNext: BOSS_FIRST_NIGHT, bossHp: 0, bossId: 0, wild: [], guarded: new Set(), keepers: [] };
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
  /** One of a neutral people's units of faction `group` (peoples/): their fighters, villagers, beasts and caravan wagons. */
  People: 6,
  /** A mercenary of camp `group`, hired by its owner for good (peoples/; Patch 5). */
  Mercenary: 7,
  /** A wandering night monster of band `group` (threats/wanderers.ts): it roams round its spot (homeX, homeZ) in the wild and goes only for prey close by. */
  Wild: 8,
  /** Jade's Patch 5 (MB-13): a guardian of the Deadlands' mana crystal at (homeX, homeZ) (threats/guardians.ts): keeps within 5 m of it, chases 8 m. */
  Guardian: 9,
  /** Jade's Patch 5 (MB-11, MF-1): the Bog guardian of a bog or the Fae Guardian of a large mana crystal, its Keeper record in state.threats.keepers (threats/keepers.ts). */
  Keeper: 10,
} as const;
export type Role = (typeof Role)[keyof typeof Role];
