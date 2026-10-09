// Canonical serialisation of the whole simulation state. The same bytes are
// hashed for desync checks, kept as snapshots for rejoin and replay, and will
// become the entity section of the save format.

import { ByteReader, ByteWriter, fnv1a32 } from './bytes.ts';
import { STREAM_NAMES, Xoshiro128, type Streams } from './rng.ts';
import { BuildingStore, buildingFields, readBuildings, writeBuildings } from './buildings/store.ts';
import { RESOURCE_COUNT } from './economy/resources.ts';
import { attachNav, EntityStore, newPlayer, PLAYER_FIELDS, UNIT_FIELDS, type Loot, type PendingSpawn, type PlayerState, type Projectile, type SimState, type Site } from './state.ts';

/** The fields of each record kind, in the order they are written (every one an i32). */
const PROJECTILE_FIELDS = ['shot', 'side', 'shooter', 'owner', 'faction', 'x0', 'y0', 'z0', 'vx', 'vy', 'vz', 'age', 'damage', 'flags', 'mark'] as const satisfies ReadonlyArray<keyof Projectile>;
const SPAWN_FIELDS = ['at', 'mob', 'player', 'group', 'x', 'z', 'placed', 'role', 'ax', 'az', 'src', 'gear'] as const satisfies ReadonlyArray<keyof PendingSpawn>;
const SITE_FIELDS = ['id', 'owner', 'kind', 'x0', 'z0', 'x1', 'z1', 'level', 'level2', 'axis'] as const satisfies ReadonlyArray<keyof Site>;
const LOOT_FIELDS = ['id', 'res', 'amt', 'x', 'y', 'z', 'at', 'by', 'owner', 'brag', 'src'] as const satisfies ReadonlyArray<keyof Loot>;
import { readUnitOrder, writeUnitOrder, type UnitOrder } from './units/unit-orders.ts';
import { readWorld, writeWorld } from './world/serialize-world.ts';
import { colKey, colKeyX, colKeyZ } from './world/world.ts';
import { floorDiv } from './fixed.ts';
import type { Burn, DuskReading, Keeper, Ruin, ThreatState, TribeBand, Village, WildPatch } from './threats/types.ts';
import { FACTION_FIELDS, FACTION_LISTS, type Faction, type Offer, type PeoplesState } from './peoples/types.ts';

const RUIN_FIELDS = ['mob', 'x', 'z', 'at'] as const satisfies ReadonlyArray<keyof Ruin>;
const VILLAGE_FIELDS = ['id', 'cell', 'x', 'z', 'band', 'size', 'mage', 'war', 'warned', 'razed', 'rebuildAt', 'raided', 'seen'] as const satisfies ReadonlyArray<keyof Village>;
const BAND_FIELDS = ['id', 'tribe', 'x', 'z', 'camp', 'campX', 'campZ', 'target', 'sawAt'] as const satisfies ReadonlyArray<keyof TribeBand>;
const BURN_FIELDS = ['building', 'until', 'perSecond'] as const satisfies ReadonlyArray<keyof Burn>;
const DUSK_FIELDS = ['townPm', 'provokedPm', 'depthPm', 'ax', 'az', 'band', 'building'] as const satisfies ReadonlyArray<keyof DuskReading>;
const WILD_FIELDS = ['px', 'pz', 'group', 'size'] as const satisfies ReadonlyArray<keyof WildPatch>;
const KEEPER_FIELDS = ['id', 'kind', 'x', 'z', 'r', 'mode', 'unit', 'cx', 'cz', 'pi', 'next', 'roam', 'greeted', 'seen', 'since', 'still', 'riled'] as const satisfies ReadonlyArray<keyof Keeper>;

function writeRecords<T>(w: ByteWriter, list: readonly T[], fields: readonly string[]): void {
  w.u32(list.length);
  for (const rec of list) for (const f of fields) w.i32((rec as Record<string, number>)[f]!);
}

function readRecordList<T>(r: ByteReader, fields: readonly string[]): T[] {
  const out: T[] = [];
  const n = r.u32();
  for (let k = 0; k < n; k++) {
    const rec: Record<string, number> = {};
    for (const f of fields) rec[f] = r.i32();
    out.push(rec as T);
  }
  return out;
}

function writeThreats(w: ByteWriter, t: ThreatState): void {
  writeRecords(w, t.ruins, RUIN_FIELDS);
  writeRecords(w, t.villages, VILLAGE_FIELDS);
  for (const v of t.villages) {
    w.u8(v.kills.length);
    for (const k of v.kills) w.i32(k);
  }
  writeRecords(w, t.bands, BAND_FIELDS);
  writeRecords(w, t.burns, BURN_FIELDS);
  writeRecords(w, t.dusk, DUSK_FIELDS);
  w.i32(t.fog);
  const keys = [...t.checked].sort((a, b) => a - b);
  w.u32(keys.length);
  for (const k of keys) w.i32(k);
  w.u32(t.tunnels.length);
  for (const m of t.tunnels) {
    w.i32(m.x);
    w.i32(m.z);
  }
  w.i32(t.bossNext);
  w.i32(t.bossHp);
  w.i32(t.bossId);
  writeRecords(w, t.wild, WILD_FIELDS);
  const guarded = [...t.guarded].sort((a, b) => a - b);
  w.u32(guarded.length);
  for (const k of guarded) {
    w.i32(colKeyX(k));
    w.i32(colKeyZ(k));
  }
  writeRecords(w, t.keepers, KEEPER_FIELDS);
}

function readThreats(r: ByteReader): ThreatState {
  const ruins = readRecordList<Ruin>(r, RUIN_FIELDS);
  const villages = readRecordList<Village>(r, VILLAGE_FIELDS);
  for (const v of villages) {
    const n = r.u8();
    v.kills = [];
    for (let k = 0; k < n; k++) v.kills.push(r.i32());
  }
  const bands = readRecordList<TribeBand>(r, BAND_FIELDS);
  const burns = readRecordList<Burn>(r, BURN_FIELDS);
  const dusk = readRecordList<DuskReading>(r, DUSK_FIELDS);
  const fog = r.i32();
  const checked = new Set<number>();
  const n = r.u32();
  for (let k = 0; k < n; k++) checked.add(r.i32());
  const tunnels: Array<{ x: number; z: number }> = [];
  const nt = r.u32();
  for (let k = 0; k < nt; k++) tunnels.push({ x: r.i32(), z: r.i32() });
  const bossNext = r.i32();
  const bossHp = r.i32();
  const bossId = r.i32();
  const wild = readRecordList<WildPatch>(r, WILD_FIELDS);
  const guarded = new Set<number>();
  const ng = r.u32();
  for (let k = 0; k < ng; k++) {
    const x = r.i32();
    guarded.add(colKey(x, r.i32()));
  }
  const keepers = readRecordList<Keeper>(r, KEEPER_FIELDS);
  return { ruins, villages, bands, burns, dusk, fog, checked, tunnels, bossNext, bossHp, bossId, wild, guarded, keepers };
}

/** The threats as canonical text for diffing: each record as its fields in serialisation order. */
function threatsJson(t: ThreatState): string {
  const rows = <T,>(list: readonly T[], fields: ReadonlyArray<keyof T>): unknown[] => list.map((r) => fields.map((f) => r[f]));
  return JSON.stringify({
    ruins: rows(t.ruins, RUIN_FIELDS), villages: rows(t.villages, VILLAGE_FIELDS), kills: t.villages.map((v) => v.kills), bands: rows(t.bands, BAND_FIELDS),
    burns: rows(t.burns, BURN_FIELDS), dusk: rows(t.dusk, DUSK_FIELDS), fog: t.fog, checked: [...t.checked].sort((a, b) => a - b), tunnels: t.tunnels.map((m) => [m.x, m.z]),
    boss: [t.bossNext, t.bossHp, t.bossId], wild: rows(t.wild, WILD_FIELDS), guarded: [...t.guarded].sort((a, b) => a - b), keepers: rows(t.keepers, KEEPER_FIELDS),
  });
}

function writeList(w: ByteWriter, list: readonly number[]): void {
  w.u32(list.length);
  for (const v of list) w.i32(v);
}

function readList(r: ByteReader): number[] {
  const out: number[] = [];
  const n = r.u32();
  for (let k = 0; k < n; k++) out.push(r.i32());
  return out;
}

function writePeoples(w: ByteWriter, ps: PeoplesState): void {
  writeRecords(w, ps.factions, FACTION_FIELDS);
  for (const f of ps.factions) for (const l of FACTION_LISTS) writeList(w, f[l]);
  w.u32(ps.offers.length);
  for (const o of ps.offers) {
    w.i32(o.faction);
    w.i32(o.player);
    w.i32(o.worth);
    writeList(w, o.goods);
    w.u8(o.bundles.length);
    for (const b of o.bundles) writeList(w, b);
  }
  writeList(w, [...ps.checked].sort((a, b) => a - b));
  w.i32(ps.elvesMet);
}

function readPeoples(r: ByteReader): PeoplesState {
  const factions = readRecordList<Faction>(r, FACTION_FIELDS);
  for (const f of factions) for (const l of FACTION_LISTS) f[l] = readList(r);
  const offers: Offer[] = [];
  const n = r.u32();
  for (let k = 0; k < n; k++) {
    const faction = r.i32();
    const player = r.i32();
    const worth = r.i32();
    const goods = readList(r);
    const bundles: number[][] = [];
    const nb = r.u8();
    for (let b = 0; b < nb; b++) bundles.push(readList(r));
    offers.push({ faction, player, worth, goods, bundles });
  }
  const checked = new Set(readList(r));
  const elvesMet = r.i32();
  return { factions, offers, checked, elvesMet };
}

/** The peoples as canonical text for diffing. */
function peoplesJson(ps: PeoplesState): string {
  return JSON.stringify({
    factions: ps.factions.map((f) => [...FACTION_FIELDS.map((k) => f[k]), ...FACTION_LISTS.map((k) => f[k])]),
    offers: ps.offers.map((o) => [o.faction, o.player, o.worth, o.goods, o.bundles]),
    checked: [...ps.checked].sort((a, b) => a - b),
    elvesMet: ps.elvesMet,
  });
}

const MAGIC = 0x53434153; // "SACS" read little-endian
/**
 * 17: Patch 2, the fourteen buildings (building kinds, resources and recipes
 * renumbered), each unit's timed action (the tinker column) and the unit a
 * shot was aimed at (projectile mark). 18: Jade's mini patch, the world 30%
 * smaller and the main bases 10 to 15 m apart (a snapshot's land and start
 * pockets no longer match its seed). 19: Patch 3 (Jade's balance changes and
 * the patch's other threads). 20: Jade's mini balance (a building keeps what
 * was paid to start it, for an exact refund of "any lumber"). 21: Patch 4, one
 * bump for the whole patch (its stone outcrops change the land a seed makes, so
 * an older snapshot's land no longer matches its seed). 22: Patch 5's foundations
 * (four main base tiers, no blood nights, no earthworks, ramps or gravel). 23:
 * Patch 5's debugger (godmode keeps each player's own stock aside). 24:
 * Patch 5's trade (a settlement's day of trade is one number; bluestone and
 * Moon Roses join the resources). 25: Patch 5's controls (a worker's
 * autorepair switch). 26: Patch 5's defences (the cannon ports' order gone, a
 * unit's order types renumbered). 27: Patch 5's run, climb and jump (each
 * unit's Run/Walk setting, the run it owes food for, and the face it is
 * climbing; the crude stairs' order gone). 28: Patch 5's mobs (Morvath's wing
 * drain on each unit, the Deadlands' guarded mana crystals). 29: Patch 5's
 * gear (close melee's shield and a ranger's poison tips on every unit, the
 * shield in a troop's product and a Barracks padlock). 30: Patch 5's digging
 * (a dig order's layer and missed columns, and digs drawn upwards). 31:
 * Patch 5's keepers (each Bog guardian's and Fae Guardian's record). Every
 * patch raises it, and a snapshot from any other version is refused, never
 * carried over (Jade, Patch 2: a standing rule).
 */
export const SNAPSHOT_VERSION = 31;
/** What a player reads when a save is from an older version of the game (Jade's standing rule from Patch 2). */
export const OLD_SAVE_TEXT = 'That save is from an older version of the game. Start a new game.';

function writeField(w: ByteWriter, t: string, v: number): void {
  if (t === 'u32') w.u32(v);
  else if (t === 'i32') w.i32(v);
  else if (t === 'u16') w.u16(v);
  else w.u8(v);
}

function readField(r: ByteReader, t: string): number {
  if (t === 'u32') return r.u32();
  if (t === 'i32') return r.i32();
  if (t === 'u16') return r.u16();
  return r.u8();
}

export function serializeState(state: SimState): Uint8Array {
  const w = new ByteWriter(1024 + state.entities.count * 96);
  w.u32(MAGIC);
  w.u16(SNAPSHOT_VERSION);
  w.u32(state.seed);
  w.u32(state.step);
  w.u32(state.nextEntityId);
  w.u8(STREAM_NAMES.length);
  for (const name of STREAM_NAMES) {
    for (const word of state.rng[name].getState()) w.u32(word);
  }
  const e = state.entities;
  const n = e.count;
  w.u32(n);
  // Column by column, in index order.
  for (const [name, t] of UNIT_FIELDS) {
    const col = e[name];
    for (let i = 0; i < n; i++) writeField(w, t, col[i]!);
  }
  for (let i = 0; i < n; i++) {
    const q = e.queue[i]!;
    w.u16(q.length);
    for (const o of q) writeUnitOrder(w, o);
    const p = e.path[i]!;
    w.u16(p.length);
    for (const v of p) w.i32(v);
    const h = e.hitters[i]!;
    w.u16(h.length);
    for (const v of h) w.u32(v);
    const c = e.cools[i]!;
    w.u16(c.length);
    for (const v of c) w.u32(v);
    const g = e.bag[i]!;
    w.u16(g.length);
    for (const v of g) w.i32(v);
  }
  w.u8(state.players.length);
  for (const p of state.players) {
    w.u8(p.pool.length);
    for (const v of p.pool) w.i32(v);
    for (const f of PLAYER_FIELDS) w.i32(p[f]);
    for (const v of p.open) w.i32(v);
    for (const v of p.kept) w.u8(v);
    for (const v of p.godPool) w.i32(v);
  }
  writeBuildings(w, state.buildings);
  w.u32(state.enclosed.length);
  for (const k of state.enclosed) {
    // Keys are below 2^51: written as two words.
    w.u32(k % 0x100000000);
    w.u32(floorDiv(k, 0x100000000));
  }
  w.u32(state.projectiles.length);
  for (const p of state.projectiles) for (const f of PROJECTILE_FIELDS) w.i32(p[f]);
  w.u32(state.spawns.length);
  for (const p of state.spawns) for (const f of SPAWN_FIELDS) w.i32(p[f]);
  w.u32(state.sites.length);
  for (const p of state.sites) for (const f of SITE_FIELDS) w.i32(p[f]);
  w.u32(state.loot.length);
  for (const p of state.loot) for (const f of LOOT_FIELDS) w.i32(p[f]);
  for (const set of [state.stockedCells, state.stockedChunks]) {
    const keys = [...set].sort((a, b) => a - b);
    w.u32(keys.length);
    for (const k of keys) {
      w.u32(k % 0x100000000);
      w.u32(floorDiv(k, 0x100000000));
    }
  }
  w.u32(state.over);
  w.u8(state.peaceful);
  writeThreats(w, state.threats);
  writePeoples(w, state.peoples);
  writeWorld(w, state.world);
  return w.finish();
}

export function deserializeState(bytes: Uint8Array): SimState {
  const r = new ByteReader(bytes);
  if (r.u32() !== MAGIC) throw new Error('not a simulation snapshot');
  const version = r.u16();
  if (version !== SNAPSHOT_VERSION) throw new Error(OLD_SAVE_TEXT);
  const seed = r.u32();
  const step = r.u32();
  const nextEntityId = r.u32();
  const streamCount = r.u8();
  if (streamCount !== STREAM_NAMES.length) throw new Error('snapshot stream count mismatch');
  const rng = {} as Streams;
  for (const name of STREAM_NAMES) rng[name] = new Xoshiro128(r.u32(), r.u32(), r.u32(), r.u32());
  const n = r.u32();
  const e = new EntityStore(Math.max(64, n));
  e.count = n;
  for (const [name, t] of UNIT_FIELDS) {
    const col = e[name];
    for (let i = 0; i < n; i++) col[i] = readField(r, t);
  }
  for (let i = 0; i < n; i++) {
    const q: UnitOrder[] = [];
    const nq = r.u16();
    for (let k = 0; k < nq; k++) q.push(readUnitOrder(r));
    e.queue[i] = q;
    const np = r.u16();
    const p: number[] = [];
    for (let k = 0; k < np; k++) p.push(r.i32());
    e.path[i] = p;
    const nh = r.u16();
    const h: number[] = [];
    for (let k = 0; k < nh; k++) h.push(r.u32());
    e.hitters[i] = h;
    const nc = r.u16();
    const c: number[] = [];
    for (let k = 0; k < nc; k++) c.push(r.u32());
    e.cools[i] = c;
    const g: number[] = [];
    const ng = r.u16();
    for (let k = 0; k < ng; k++) g.push(r.i32());
    e.bag[i] = g;
  }
  const players: PlayerState[] = [];
  const np = r.u8();
  for (let k = 0; k < np; k++) {
    const len = r.u8();
    const pool = new Int32Array(RESOURCE_COUNT);
    for (let j = 0; j < len; j++) {
      const v = r.i32();
      if (j < RESOURCE_COUNT) pool[j] = v;
    }
    const p = newPlayer(pool);
    for (const f of PLAYER_FIELDS) p[f] = r.i32();
    for (let j = 0; j < len; j++) {
      const v = r.i32();
      if (j < RESOURCE_COUNT) p.open[j] = v;
    }
    for (let j = 0; j < len; j++) {
      const v = r.u8();
      if (j < RESOURCE_COUNT) p.kept[j] = v;
    }
    for (let j = 0; j < len; j++) {
      const v = r.i32();
      if (j < RESOURCE_COUNT) p.godPool[j] = v;
    }
    players.push(p);
  }
  const buildings = new BuildingStore();
  readBuildings(r, buildings, () => {});
  const ne = r.u32();
  const enclosed: number[] = [];
  for (let k = 0; k < ne; k++) {
    const lo = r.u32();
    enclosed.push(r.u32() * 0x100000000 + lo);
  }
  const readRecords = <T>(fields: readonly string[]): T[] => {
    const out: T[] = [];
    const n = r.u32();
    for (let k = 0; k < n; k++) {
      const rec: Record<string, number> = {};
      for (const f of fields) rec[f] = r.i32();
      out.push(rec as T);
    }
    return out;
  };
  const projectiles = readRecords<Projectile>(PROJECTILE_FIELDS);
  const spawns = readRecords<PendingSpawn>(SPAWN_FIELDS);
  const sites = readRecords<Site>(SITE_FIELDS);
  const loot = readRecords<Loot>(LOOT_FIELDS);
  const readKeys = (): Set<number> => {
    const out = new Set<number>();
    const n = r.u32();
    for (let k = 0; k < n; k++) {
      const lo = r.u32();
      out.add(r.u32() * 0x100000000 + lo);
    }
    return out;
  };
  const stockedCells = readKeys();
  const stockedChunks = readKeys();
  const over = r.u32();
  const peaceful = r.u8();
  const threats = readThreats(r);
  const peoples = readPeoples(r);
  const world = readWorld(r, seed);
  if (!r.done) throw new Error('trailing bytes in snapshot');
  e.reindex();
  return attachNav({ seed, step, nextEntityId, rng, entities: e, world, players, buildings, enclosed, projectiles, spawns, sites, loot, stockedCells, stockedChunks, over, peaceful, threats, peoples });
}

/** The 32-bit desync hash: FNV-1a over the canonical serialisation. */
export function hashState(state: SimState): number {
  return fnv1a32(serializeState(state));
}

/** A deep copy through the canonical bytes. */
export function cloneState(state: SimState): SimState {
  return deserializeState(serializeState(state));
}

/**
 * The first field where two states differ, as a readable path such as
 * "entities[3].x: 1200 vs 1201", or null when they are identical. Used by
 * the desync tool after a replay finds the first diverging step.
 */
export function diffStates(a: SimState, b: SimState): string | null {
  const scalar = (name: string, va: number, vb: number): string | null =>
    va === vb ? null : `${name}: ${va} vs ${vb}`;
  const head =
    scalar('seed', a.seed, b.seed) ??
    scalar('step', a.step, b.step) ??
    scalar('nextEntityId', a.nextEntityId, b.nextEntityId);
  if (head) return head;
  for (const name of STREAM_NAMES) {
    const sa = a.rng[name].getState();
    const sb = b.rng[name].getState();
    for (let k = 0; k < 4; k++) {
      const d = scalar(`rng.${name}[${k}]`, sa[k]!, sb[k]!);
      if (d) return d;
    }
  }
  const ea = a.entities;
  const eb = b.entities;
  const count = scalar('entities.count', ea.count, eb.count);
  if (count) return count;
  for (let i = 0; i < ea.count; i++) {
    for (const [f] of UNIT_FIELDS) {
      const d = scalar(`entities[${i}].${f}`, ea[f][i]!, eb[f][i]!);
      if (d) return d;
    }
    const qa = JSON.stringify(ea.queue[i]);
    const qb = JSON.stringify(eb.queue[i]);
    if (qa !== qb) return `entities[${i}].queue: ${qa} vs ${qb}`;
    const pa = JSON.stringify(ea.path[i]);
    const pb = JSON.stringify(eb.path[i]);
    if (pa !== pb) return `entities[${i}].path: ${pa} vs ${pb}`;
    const ha = JSON.stringify(ea.hitters[i]);
    const hb = JSON.stringify(eb.hitters[i]);
    if (ha !== hb) return `entities[${i}].hitters: ${ha} vs ${hb}`;
    const ca = JSON.stringify(ea.cools[i]);
    const cb = JSON.stringify(eb.cools[i]);
    if (ca !== cb) return `entities[${i}].cools: ${ca} vs ${cb}`;
    const ga = JSON.stringify(ea.bag[i]);
    const gb = JSON.stringify(eb.bag[i]);
    if (ga !== gb) return `entities[${i}].bag: ${ga} vs ${gb}`;
  }
  const players = scalar('players.length', a.players.length, b.players.length);
  if (players) return players;
  for (let p = 0; p < a.players.length; p++) {
    const pa = a.players[p]!;
    const pb = b.players[p]!;
    for (let k = 0; k < pa.pool.length; k++) {
      const d = scalar(`players[${p}].pool[${k}]`, pa.pool[k]!, pb.pool[k]!);
      if (d) return d;
    }
    for (const f of PLAYER_FIELDS) {
      const d = scalar(`players[${p}].${f}`, pa[f], pb[f]);
      if (d) return d;
    }
    for (let k = 0; k < pa.open.length; k++) {
      const d = scalar(`players[${p}].open[${k}]`, pa.open[k]!, pb.open[k]!) ?? scalar(`players[${p}].kept[${k}]`, pa.kept[k]!, pb.kept[k]!) ?? scalar(`players[${p}].godPool[${k}]`, pa.godPool[k]!, pb.godPool[k]!);
      if (d) return d;
    }
  }
  const bl = scalar('buildings.length', a.buildings.list.length, b.buildings.list.length);
  if (bl) return bl;
  for (let k = 0; k < a.buildings.list.length; k++) {
    const fa = buildingFields(a.buildings.list[k]!);
    const fb = buildingFields(b.buildings.list[k]!);
    for (const f of Object.keys(fa)) if (fa[f] !== fb[f]) return `buildings[${k}].${f}: ${fa[f]} vs ${fb[f]}`;
  }
  const en = JSON.stringify(a.enclosed) === JSON.stringify(b.enclosed) ? null : `enclosed: ${a.enclosed.length} tiles vs ${b.enclosed.length}`;
  if (en) return en;
  for (const [name, la, lb] of [['projectiles', a.projectiles, b.projectiles], ['spawns', a.spawns, b.spawns], ['sites', a.sites, b.sites], ['loot', a.loot, b.loot]] as const) {
    const ja = JSON.stringify(la);
    const jb = JSON.stringify(lb);
    if (ja !== jb) return `${name}: ${la.length} vs ${lb.length} (${ja.slice(0, 120)} vs ${jb.slice(0, 120)})`;
  }
  const ov = scalar('over', a.over, b.over) ?? scalar('peaceful', a.peaceful, b.peaceful);
  if (ov) return ov;
  const ta = threatsJson(a.threats);
  const tb = threatsJson(b.threats);
  if (ta !== tb) return `threats: ${ta.slice(0, 160)} vs ${tb.slice(0, 160)}`;
  const pa = peoplesJson(a.peoples);
  const pb = peoplesJson(b.peoples);
  if (pa !== pb) return `peoples: ${pa.slice(0, 160)} vs ${pb.slice(0, 160)}`;
  return diffWorlds(a, b);
}

/** The first difference in the world section, named by the part it falls in. */
function diffWorlds(a: SimState, b: SimState): string | null {
  const bytesOf = (s: SimState): Uint8Array => {
    const w = new ByteWriter(1024);
    writeWorld(w, s.world);
    return w.finish();
  };
  const wa = bytesOf(a);
  const wb = bytesOf(b);
  const counts = (s: SimState): [string, number][] => [
    ['edited chunks', s.world.edited.size],
    ['prop changes', s.world.propChanges.size],
    ['dropped seeds', s.world.addedProps.size],
    ['explored chunks', s.world.explored.size],
    ['water settling', s.world.waterActive.size],
  ];
  const ca = counts(a);
  const cb = counts(b);
  for (let k = 0; k < ca.length; k++) {
    if (ca[k]![1] !== cb[k]![1]) return `world.${ca[k]![0]}: ${ca[k]![1]} vs ${cb[k]![1]}`;
  }
  const len = Math.min(wa.length, wb.length);
  for (let i = 0; i < len; i++) if (wa[i] !== wb[i]) return `world byte ${i}: ${wa[i]} vs ${wb[i]}`;
  return wa.length === wb.length ? null : `world length: ${wa.length} vs ${wb.length}`;
}
