// The neutral peoples' factions in the world (Neutral villages and trade;
// Halflings; Runkin; Elves; Dwarves; mercenary camps). Each village, camp,
// colony, city, caravan and the one Elf kingdom is a faction: a record in
// state.peoples and its people, beasts and buildings as entities whose group
// is the faction's id. A cell is looked at once, the first time the players
// come near it (as the goblin villages are): the Halfling village sites kept
// at world generation (Table 9), the Elf kingdom's cell, and by the seed a
// Runkin camp, a Dwarf colony or city, a mercenary camp or a wandering Elf
// caravan. Peoples are placed in peaceful games too: they are not monsters.

import { buildingCentre } from '../buildings/lights.ts';
import { cos16, floorDiv, isqrt, length2d, sin16, TRIG_ONE, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { hash32 } from '../rng.ts';
import { PEOPLES, standY, UnitKind, type SimState } from '../state.ts';
import { addAnimal } from '../animals/animals.ts';
import { WAND_GEAR } from '../units/kits.ts';
import { addMob, vanish } from '../combat/mob-ai.ts';
import { MANA_SCALE, School } from '../magic/spells.ts';
import { Role } from '../threats/types.ts';
import { Band, CELL_RING_SHIFT, type Cell } from '../world/layout.ts';
import {
  APART_WU, BAND_SIZE_PCT, ELF_KINGDOM_RING_INTO_DEEPWOODS, FactionKind, GROVESINGER, HALFLING_WAR_OXEN, KEEP_AWAY_WU, KIND_PEOPLE, LAYOUTS, LEANS, MERC_MAX, MERC_MIN,
  MERC_UNITS, ONE_IN, PeopleUnit, peopleUnitSpec, Status,
} from './data.ts';
import { fillStock } from './stock.ts';
import { seat } from '../mounts/riding.ts';
import { addEngine } from '../siege/engines.ts';
import { factionById, type Faction } from './types.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;
/** Salts for the seed's choices, apart from every other system's. */
const SALT = { cell: 0x70656f70, kingdom: 0x656c666b, city: 0x64776366, place: 0x706c6163, name: 0x6e616d65 } as const;

// ----- who belongs to a faction -----

/** A faction's living members of every kind (people, beasts, buildings, its wagon), in index order. */
export function factionMembers(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.group[i] === id && e.owner[i] === PEOPLES && e.hp[i]! > 0) out.push(i);
  return out;
}

/** Whether an entity is one of the peoples' persons (not a beast or a building). */
export function isPerson(state: SimState, i: number): boolean {
  const k = state.entities.kind[i];
  return state.entities.owner[i] === PEOPLES && (k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage);
}

/** A faction's living people. */
export function peopleOf(state: SimState, id: number): number[] {
  return factionMembers(state, id).filter((i) => isPerson(state, i));
}

/** A faction's living fighters (warriors and Grovesingers). */
export function fightersOf(state: SimState, id: number): number[] {
  const e = state.entities;
  return peopleOf(state, id).filter((i) => e.kind[i] !== UnitKind.Worker);
}

/** A faction's standing buildings (and an Elf caravan's wagon). */
export function structuresOf(state: SimState, id: number): number[] {
  const e = state.entities;
  return factionMembers(state, id).filter((i) => e.kind[i] === UnitKind.Mob);
}

/** A faction's beasts and livestock. */
export function beastsOf(state: SimState, id: number): number[] {
  const e = state.entities;
  return factionMembers(state, id).filter((i) => e.kind[i] === UnitKind.Animal && e.calledUntil[i] === 0);
}

// ----- making them -----

/** A new faction record (not yet built), with every per-player list sized. */
export function newFaction(state: SimState, kind: number, cell: number, x: number, z: number, band: number, seed: number): Faction {
  // Kept to 31 bits, so the snapshot's signed fields hold it as it is.
  seed &= 0x7fffffff;
  const people = KIND_PEOPLE[kind]!;
  const leans = kind === FactionKind.ElfKingdom || kind === FactionKind.DwarfCity || kind === FactionKind.MercCamp ? 0 : LEANS[people].length;
  const per = (): number[] => state.players.map(() => 0);
  const f: Faction = {
    id: state.nextEntityId++, kind, people, parent: 0, cell, x, z, band, lean: leans > 0 ? seed % leans : -1, seed, status: Status.Settled, built: 0,
    war: 0, met: 0, traded: 0, seen: 0, founded: 0, dead: 0, kills: per(), lastTaker: -1, surrender: 0, leader: 0,
    closedUntil: per(), lastOffer: per(), declines: per(), warnings: per(), warnedAt: per(),
    stock: [], stockMax: [], bought: 0, day: 0, nextAt: 0, regrowAt: 0,
    caravanAt: per(), visits: -1, leaveAt: 0, leftAt: 0, toX: 0, toZ: 0, toCell: 0, survivors: 0, rebuildUntil: 0, size: 0, oxen: 0,
  };
  state.peoples.factions.push(f);
  return f;
}

/** The point k of n round a faction's middle at a radius, wu. */
export function ringPoint(f: { x: number; z: number }, k: number, n: number, r: number, turn = 0): [number, number] {
  const a = (floorDiv(k * 65536, Math.max(1, n)) + turn) & 0xffff;
  return [f.x + floorDiv(r * cos16(a), TRIG_ONE), f.z + floorDiv(r * sin16(a), TRIG_ONE)];
}

/** The standable column nearest a point, as the middle of that column, wu. */
function standNear(state: SimState, x: number, z: number): [number, number] {
  const cx = floorDiv(x, COL);
  const cz = floorDiv(z, COL);
  if (state.nav.standable(cx, cz, WALKER)) return [x, z];
  for (let r = 1; r <= 12; r++) {
    for (let k = -r; k <= r; k++) {
      for (const [px, pz] of [[cx + k, cz - r], [cx + k, cz + r], [cx - r, cz + k], [cx + r, cz + k]] as const) {
        if (state.nav.standable(px, pz, WALKER)) return [px * COL + (COL >> 1), pz * COL + (COL >> 1)];
      }
    }
  }
  return [x, z];
}

/** Walking speed in wu a step from tenths of a m/s. */
function speedOf(speed10: number): number {
  return floorDiv(speed10 * M, 200);
}

/** One of a faction's people at a point; its post is where it stands. Returns its index. */
export function addPerson(state: SimState, f: Faction, unit: number, x: number, z: number): number {
  const spec = peopleUnitSpec(unit);
  const e = state.entities;
  [x, z] = standNear(state, x, z);
  const grove = unit === PeopleUnit.ElfGrovesinger;
  const kind = grove ? UnitKind.Mage : spec.fighter ? UnitKind.Warrior : UnitKind.Worker;
  const i = e.add(state.nextEntityId++, PEOPLES, x, standY(state, x, z), z, speedOf(spec.speed10), kind);
  e.mob[i] = unit;
  e.group[i] = f.id;
  e.role[i] = Role.People;
  e.hp[i] = spec.hp;
  e.maxHp[i] = spec.hp;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  e.heading[i] = hash32(f.seed, e.id[i]!) & 0xffff;
  // Villagers carry no tools: they never gather, and run from a fight.
  e.toolChop[i] = 0;
  e.toolBreak[i] = 0;
  e.toolBuild[i] = 0;
  e.toolCut[i] = 0;
  e.weapon[i] = spec.weapon;
  e.armour[i] = spec.armour;
  e.shield[i] = spec.shield;
  e.ranged[i] = spec.ranged;
  if (spec.mount) seat(state, i, spec.mount);
  if (grove) {
    e.school[i] = School.Grove;
    e.mana[i] = GROVESINGER.mana * MANA_SCALE;
    e.weapon[i] = WAND_GEAR[1]!;
  }
  state.grid.insert(e, i);
  return i;
}

/** A Halfling war ox fell: its rear rider, the archer, gets down beside the spearman (Table 14). Installed as mountHooks.rearRider. */
export function rearRider(state: SimState, i: number): void {
  const e = state.entities;
  if (e.owner[i] !== PEOPLES) return;
  const f = factionById(state.peoples, e.group[i]!);
  if (!f) return;
  const j = addPerson(state, f, PeopleUnit.HalflingArcher, e.x[i]! + M, e.z[i]!);
  e.foe[j] = e.foe[i]!;
  e.target[j] = e.target[i]!;
}

/**
 * A war starts: a Halfling village rides out its war oxen, a spearman in front
 * and an archer behind on each (doc, Table 14). The archer becomes the ox's
 * shortbow and gets down again if the ox falls (rearRider).
 */
export function fieldOxen(state: SimState, f: Faction): void {
  const e = state.entities;
  if (f.oxen <= 0) return;
  const rider = peopleUnitSpec(PeopleUnit.HalflingOxRider);
  const mine = peopleOf(state, f.id).filter((j) => e.hp[j]! > 0);
  const spears = mine.filter((j) => e.mob[j] === PeopleUnit.HalflingSpearman);
  const bows = mine.filter((j) => e.mob[j] === PeopleUnit.HalflingArcher);
  while (f.oxen > 0 && spears.length > 0 && bows.length > 0) {
    const i = spears.shift()!;
    vanish(state, bows.shift()!);
    e.mob[i] = PeopleUnit.HalflingOxRider;
    e.weapon[i] = rider.weapon;
    e.shield[i] = rider.shield;
    e.armour[i] = rider.armour;
    e.speed[i] = speedOf(rider.speed10);
    seat(state, i, rider.mount);
    f.oxen--;
  }
}

/** One of a faction's buildings (a mob that stands and can be broken), or its wagon. */
export function addStructure(state: SimState, f: Faction, mob: number, x: number, z: number): number {
  [x, z] = standNear(state, x, z);
  const i = addMob(state, mob, 0, x, z, 0);
  const e = state.entities;
  e.owner[i] = PEOPLES;
  e.group[i] = f.id;
  e.heading[i] = hash32(f.seed, e.id[i]!) & 0xffff;
  return i;
}

/** One of a faction's beasts: its livestock, Runkin wolves, Elf bears. */
export function addBeast(state: SimState, f: Faction, species: number, x: number, z: number): number {
  [x, z] = standNear(state, x, z);
  const i = addAnimal(state, species, PEOPLES, x, z, 0, hash32(f.seed, state.nextEntityId) & 1);
  state.entities.group[i] = f.id;
  return i;
}

/** How many of a row a faction of its band has: deeper is larger (s). */
function scaled(f: Faction, n: number): number {
  return floorDiv(n * (BAND_SIZE_PCT[f.band] ?? 100) + 99, 100);
}

/**
 * Builds a faction round its middle: buildings on a ring, fighters at posts
 * inside it, villagers among the buildings, beasts near the middle. Each
 * row of people and the last row of buildings (its dwellings) grow with the band.
 */
export function buildFaction(state: SimState, f: Faction): void {
  const layout = LAYOUTS[f.kind]!;
  const ring = f.kind === FactionKind.ElfCaravan ? layout.ringWu : floorDiv(layout.ringWu * (BAND_SIZE_PCT[f.band] ?? 100), 100);
  const turn = f.seed & 0xffff;
  const rows = layout.structures.map(([mob, n], k) => [mob, k === layout.structures.length - 1 && f.kind !== FactionKind.ElfCaravan ? scaled(f, n) : n] as const);
  let total = 0;
  for (const [, n] of rows) total += n;
  let k = 0;
  for (const [mob, n] of rows) {
    for (let c = 0; c < n; c++) {
      // The first building (the inn, the fire, the hall, the wagon) stands in the middle.
      const [x, z] = k === 0 ? [f.x, f.z] : ringPoint(f, k - 1, total - 1, ring, turn);
      addStructure(state, f, mob, x, z);
      k++;
    }
  }
  const people: Array<[number, number]> = [];
  if (f.kind === FactionKind.MercCamp) {
    const units = MERC_UNITS[f.band as 1 | 2];
    if (units) people.push([units[2], 1]);
  } else for (const [unit, n] of layout.people) people.push([unit, f.kind === FactionKind.ElfCaravan ? n : scaled(f, n)]);
  let fighters = 0;
  let villagers = 0;
  for (const [unit, n] of people) if (peopleUnitSpec(unit).fighter) fighters += n;
  else villagers += n;
  let fk = 0;
  let vk = 0;
  for (const [unit, n] of people) {
    for (let c = 0; c < n; c++) {
      const fighter = peopleUnitSpec(unit).fighter;
      const [x, z] = fighter ? ringPoint(f, fk++, Math.max(1, fighters), ring >> 1, turn + 4096) : ringPoint(f, vk++, Math.max(1, villagers), floorDiv(ring * 3, 4), turn + 8192);
      const i = addPerson(state, f, unit, x, z);
      if (!f.leader && !fighter) f.leader = state.entities.id[i]!;
    }
  }
  if (f.kind === FactionKind.HalflingVillage) f.oxen = scaled(f, HALFLING_WAR_OXEN);
  if (!f.leader) {
    const first = peopleOf(state, f.id)[0];
    if (first !== undefined) f.leader = state.entities.id[first]!;
  }
  let bk = 0;
  let beasts = 0;
  for (const [, n] of layout.animals) beasts += n;
  for (const [species, n] of layout.animals) {
    for (let c = 0; c < n; c++) {
      const [x, z] = ringPoint(f, bk++, Math.max(1, beasts), ring >> 2, turn + 12288);
      addBeast(state, f, species, x, z);
    }
  }
  // A Dwarf city's own cannons stand inside its gate (the first ring building), side by side (s).
  if (layout.engines.length > 0) {
    const [gx, gz] = ringPoint(f, 0, total - 1, floorDiv(ring * 7, 10), turn);
    let c = 0;
    for (const [kind, n] of layout.engines) {
      for (let k2 = 0; k2 < n; k2++, c++) {
        const side = (c & 1 ? 1 : -1) * (floorDiv(c, 2) + 1) * 3 * M;
        const j = addEngine(state, PEOPLES, kind, gx + side, gz);
        state.entities.group[j] = f.id;
      }
    }
  }
  f.built = 1;
  f.founded = peopleOf(state, f.id).length;
  if (f.kind === FactionKind.MercCamp) {
    f.size = MERC_MIN + ((f.seed >>> 4) % (MERC_MAX - MERC_MIN + 1));
    f.survivors = f.size;
  }
  fillStock(f);
}

// ----- where they are -----

/** Whether a faction may stand round a middle: standable, away from the players, and apart from other factions and goblin villages. */
export function roomFor(state: SimState, x: number, z: number, keepAway = KEEP_AWAY_WU): boolean {
  if (!state.nav.standable(floorDiv(x, COL), floorDiv(z, COL), WALKER)) return false;
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i]! < state.players.length && length2d(e.x[i]! - x, e.z[i]! - z) < keepAway) return false;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const [bx, bz] = buildingCentre(b);
    if (length2d(bx - x, bz - z) < keepAway) return false;
  }
  for (const f of state.peoples.factions) if (f.built && f.status !== Status.Gone && length2d(f.x - x, f.z - z) < APART_WU) return false;
  for (const v of state.threats.villages) if (length2d(v.x - x, v.z - z) < APART_WU) return false;
  return true;
}

/** A middle for a faction in a cell, wu: a seeded spot near the cell's site that has room; null for none. */
export function spotIn(state: SimState, cell: Cell, salt: number, keepAway = KEEP_AWAY_WU): [number, number] | null {
  const spread = Math.max(8, floorDiv(cell.size, 4));
  for (let k = 0; k < 8; k++) {
    const h = hash32(state.seed ^ SALT.place ^ salt, cell.id, k);
    const x = (cell.x + ((h & 0xffff) % (spread * 2 + 1)) - spread) * COL + (COL >> 1);
    const z = (cell.z + (((h >>> 16) & 0xffff) % (spread * 2 + 1)) - spread) * COL + (COL >> 1);
    if (roomFor(state, x, z, keepAway)) return [x, z];
  }
  return null;
}

/** The Elf kingdom's cell: a seeded place round the ring one in from the Deepwoods' edge, in a Deepwoods cell. */
export function elfKingdomCell(state: SimState): number {
  const layout = state.world.layout;
  const ring = Math.min(layout.bands.deepwoods + ELF_KINGDOM_RING_INTO_DEEPWOODS, layout.bands.barrens - 1);
  const n = layout.ringCellCount(ring);
  const k = hash32(state.seed ^ SALT.kingdom) % n;
  // Since Patch 5 a ring can hold cells of two bands (a cell's band is its site's, WL-8): the first Deepwoods cell from there on.
  for (let t = 0; t < n; t++) {
    const id = ring * CELL_RING_SHIFT + ((k + t) % n);
    if (layout.bandOf(id) === Band.Deepwoods) return id;
  }
  return ring * CELL_RING_SHIFT + k;
}

/** The one Elf kingdom's record, made the first time anything needs it (a caravan, its cell). */
export function elfKingdom(state: SimState): Faction {
  const found = state.peoples.factions.find((f) => f.kind === FactionKind.ElfKingdom);
  if (found) return found;
  const cell = state.world.layout.cell(elfKingdomCell(state));
  return newFaction(state, FactionKind.ElfKingdom, cell.id, cell.x * COL + (COL >> 1), cell.z * COL + (COL >> 1), cell.band, hash32(state.seed ^ SALT.kingdom, 1));
}

/** Whether a Deadlands cell holds a Dwarf city (about 1 in 120, from the seed alone, so a colony can point the way before anyone has been there). */
export function holdsCity(state: SimState, cellId: number): boolean {
  // The band at the cell's site alone: nearestCity asks of every Deadlands cell to the world's edge, twice as
  // many since the mini patch brought the rings 30% closer, and working each one out in full took many seconds.
  const oneIn = ONE_IN.city[state.world.layout.bandOf(cellId)] ?? 0;
  return oneIn > 0 && hash32(state.seed ^ SALT.city, cellId) % oneIn === 0;
}

/** The Dwarf city cell nearest a point (wu), searching the Deadlands rings; -1 for none. */
export function nearestCity(state: SimState, x: number, z: number): number {
  const layout = state.world.layout;
  let best = -1;
  let bestD = 0;
  // From a ring before the Deadlands' first: a cell takes the band at its own site (Patch 5), so some there are Deadlands.
  for (let r = Math.max(1, layout.bands.deadlands - 1); r < layout.ringCount; r++) {
    const n = layout.ringCellCount(r);
    for (let k = 0; k < n; k++) {
      const id = r * CELL_RING_SHIFT + k;
      if (!holdsCity(state, id)) continue;
      const s = layout.site(id);
      const d = length2d(s.x * COL - x, s.z * COL - z);
      if (best < 0 || d < bestD) {
        best = id;
        bestD = d;
      }
    }
  }
  return best;
}

/** A compass direction and a distance in round tens of metres, from one point to another (wu): "north-east, about 420 m". */
export function directions(fromX: number, fromZ: number, toX: number, toZ: number): string {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const d = isqrt(dx * dx + dz * dz);
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  // The world's z grows to the south on the map (s), x to the east; 8 sectors.
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  let sector: number;
  if (az * 5 < ax * 2) sector = dx >= 0 ? 0 : 4;
  else if (ax * 5 < az * 2) sector = dz >= 0 ? 2 : 6;
  else sector = dx >= 0 ? (dz >= 0 ? 1 : 7) : dz >= 0 ? 3 : 5;
  const metres = Math.max(10, floorDiv(floorDiv(d, M) + 5, 10) * 10);
  return `${names[sector]}, about ${metres} m`;
}

/** Places and builds a new faction of a kind in a cell at a spot. */
export function foundFaction(state: SimState, kind: number, cell: Cell, x: number, z: number, seed: number): Faction {
  const f = newFaction(state, kind, cell.id, x, z, cell.band, seed);
  buildFaction(state, f);
  return f;
}

/**
 * A cell the players come near for the first time: the Halfling villages
 * kept for it, the Elf kingdom, and by the seed (ONE_IN, by band) a Dwarf
 * city or colony, a Runkin camp, a mercenary camp or a wandering Elf caravan.
 * A cell with a goblin village holds none of the last.
 */
export function checkPeoples(state: SimState, cellId: number): void {
  const ps = state.peoples;
  if (ps.checked.has(cellId)) return;
  ps.checked.add(cellId);
  const layout = state.world.layout;
  const cell = layout.cell(cellId);
  for (const v of state.world.gen.start.villages) {
    if (layout.nearest(v.x, v.z) !== cellId) continue;
    // Table 9's sites are kept flat and clear at generation: the village goes where its site is.
    foundFaction(state, FactionKind.HalflingVillage, cell, v.x * COL + (COL >> 1), v.z * COL + (COL >> 1), hash32(state.seed ^ SALT.name, v.x, v.z));
  }
  if (cellId === elfKingdomCell(state)) {
    const k = elfKingdom(state);
    if (!k.built) {
      const spot = spotIn(state, cell, SALT.kingdom, 0);
      if (spot) [k.x, k.z] = spot;
      buildFaction(state, k);
    }
    return;
  }
  if (cell.ring === 0 || state.threats.villages.some((v) => v.cell === cellId)) return;
  const roll = (salt: number, oneIn: number): number => (oneIn > 0 && hash32(state.seed ^ SALT.cell ^ salt, cellId) % oneIn === 0 ? hash32(state.seed ^ SALT.cell ^ salt, cellId, 1) : -1);
  const place = (kind: number, h: number, keepAway = KEEP_AWAY_WU): boolean => {
    const spot = spotIn(state, cell, kind, keepAway);
    if (!spot) return false;
    foundFaction(state, kind, cell, spot[0], spot[1], h);
    return true;
  };
  if (holdsCity(state, cellId)) {
    // The city a colony points to is always there: it keeps no distance from the players.
    place(FactionKind.DwarfCity, hash32(state.seed ^ SALT.city, cellId, 1), 0);
    return;
  }
  const options: Array<[number, number]> = [
    [FactionKind.DwarfColony, roll(1, ONE_IN.colony[cell.band] ?? 0)],
    [FactionKind.RunkinCamp, roll(2, ONE_IN.runkin[cell.band] ?? 0)],
    [FactionKind.MercCamp, roll(3, ONE_IN.merc[cell.band] ?? 0)],
  ];
  for (const [kind, h] of options) if (h >= 0 && place(kind, h)) return;
  // A wandering caravan, until any player has met the Elves.
  const h = roll(4, ONE_IN.caravan[cell.band] ?? 0);
  if (h >= 0 && ps.elvesMet === 0) {
    const spot = spotIn(state, cell, FactionKind.ElfCaravan, KEEP_AWAY_WU >> 1);
    if (spot) wanderingCaravan(state, cell, spot[0], spot[1], h);
  }
}

/** A wandering Elf caravan met before the Elves: it trades where it is found and leaves at the second dusk (s). */
export function wanderingCaravan(state: SimState, cell: Cell, x: number, z: number, h: number): Faction {
  const kingdom = elfKingdom(state);
  const f = newFaction(state, FactionKind.ElfCaravan, cell.id, x, z, cell.band, h);
  f.parent = kingdom.id;
  f.visits = -1;
  buildFaction(state, f);
  return f;
}

/** A faction by id that is still about. */
export function liveFaction(state: SimState, id: number): Faction | undefined {
  const f = factionById(state.peoples, id);
  return f && f.status !== Status.Gone ? f : undefined;
}
