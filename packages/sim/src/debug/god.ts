// The debugger's godmode and its tools (Jade's Patch 5, EX-7 to EX-11). A
// player in godmode builds and makes anything at once, pays nothing and needs
// nothing first: the pool is filled with GOD_STOCK of everything each step,
// the player's own stock kept aside and put back when godmode ends; the
// waivers sit where each requirement is checked (isGod in state.ts). The
// player can also place any unit, engine, animal, mob or lair where the
// cursor is: the players' units are theirs, the wild stay wild and the
// monsters are the player's foes. The debugger's other buttons: every unit
// to its top rank, everything healed, chosen units killed, monsters cleared
// round a point, and the Elf kingdom found and shown. What can be placed is
// data (GOD_SPAWNS), in the order the debugger's grid shows it.

import { floorDiv, WU_PER_METRE } from '../fixed.ts';
import { addAnimal } from '../animals/animals.ts';
import { SPECIES, Species, speciesSpec } from '../animals/species.ts';
import { BuildingKind } from '../buildings/data.ts';
import { maxHealth } from '../buildings/store.ts';
import { WARRIOR_XP_TENTHS } from '../combat/combat.ts';
import { addMob } from '../combat/mob-ai.ts';
import { isStructure, Mob, MOBS, mobSpec } from '../combat/mobs.ts';
import { isAnyRes } from '../economy/food-kinds.ts';
import { RESOURCES } from '../economy/resources.ts';
import { addMage, MAGE_XP_TENTHS, manaCap, setMageRank } from '../magic/mages.ts';
import { MAGE_TOP_RANK, School } from '../magic/spells.ts';
import { Mount } from '../mounts/data.ts';
import { seatOnHorse } from '../mounts/riding.ts';
import { buildFaction, checkPeoples, elfKingdom, elfKingdomCell } from '../peoples/factions.ts';
import { ENGINES } from '../siege/data.ts';
import { addCrewman, addEngine, addFullCrew } from '../siege/engines.ts';
import { addWarrior, isGod, MONSTERS, standY, UnitKind, WALK_SPEED_WU, WARRIOR_HEALTH_BY_RANK, WILD, type SimState } from '../state.ts';
import { bossIndex, summonBoss } from '../threats/boss.ts';
import { LAIRS } from '../threats/data.ts';
import { addLair, nightNow } from '../threats/lairs.ts';
import { BOSS_FIRST_NIGHT } from '../threats/types.ts';
import { addDreadnought, isDreadnought } from '../units/dreadnought.ts';
import { hasShield, TOP_MAGE_TIER, TOP_SHIELD_TIER, TOP_TIER, Troop, TROOP_TYPES, troopTierName, weaponTiers } from '../units/kits.ts';
import { setWorkerRank, WORKER_XP_TENTHS } from '../units/ranks.ts';

/** What a godmode pool holds of every resource, filled again each step. */
export const GOD_STOCK = 100_000;
/** The top rank of a worker and of a troop (Table 1). */
const TOP_RANK = 5;
/** How far round the Elf kingdom its button reveals the land, and round a point Clear monsters reaches. */
export const ELF_REVEAL_WU = 80 * WU_PER_METRE;
export const CLEAR_FOES_WU = 60 * WU_PER_METRE;

/** What a godmode placement makes. */
export type GodWhat = 'worker' | 'troop' | 'mage' | 'crewman' | 'engine' | 'animal' | 'mob' | 'boss' | 'lair';

/** One thing godmode can place: its name for the grid, what it is and its number there (a troop type, a school, an engine, a species, a mob, a lair in LAIRS), and its catalogue model ('' for the players' own units, which the client draws from their kind). */
export interface GodSpawn {
  name: string;
  what: GodWhat;
  id: number;
  model: string;
  /** Whose it is once placed: the placing player's, the wild's, or the monsters' (sent against the placing player). */
  side: 'player' | 'wild' | 'monsters';
}

/** Mobs that are only ever part of something else: a lair's or a village's buildings, a dead bomber's keg, the Elf caravan's wagon, Morvath's second form. */
function placeableMob(mob: number): boolean {
  return !isStructure(mob) && mob !== Mob.BombKeg && mob !== Mob.ElfCaravanWagon && mob !== Mob.MorvathAloft;
}

/** Animals kept in a Barn come as the player's own, as a trade's do; the rest come wild. */
function domestic(species: number): boolean {
  return speciesSpec(species).tameAt.includes(BuildingKind.Barn);
}

/** Everything godmode can place, in the grid's order: the players' units at their top kit, engines with their crews, animals, mobs (Morvath among them), then lairs with their guardians. */
export const GOD_SPAWNS: readonly GodSpawn[] = [
  { name: 'Worker', what: 'worker', id: 0, model: '', side: 'player' },
  // Patch 5: the Dreadnought too, hired at the Tavern.
  ...[...TROOP_TYPES, Troop.Dreadnought].map((t): GodSpawn => ({ name: troopTierName(t, weaponTiers(t)[1]), what: 'troop', id: t, model: '', side: 'player' })),
  { name: 'Support mage', what: 'mage', id: School.Support, model: '', side: 'player' },
  { name: 'Battle mage', what: 'mage', id: School.Battle, model: '', side: 'player' },
  { name: 'Artillery crewman', what: 'crewman', id: 0, model: '', side: 'player' },
  ...ENGINES.map((s): GodSpawn => ({ name: s.name, what: 'engine', id: s.id, model: s.model, side: 'player' })),
  ...SPECIES.map((s): GodSpawn => ({ name: s.name, what: 'animal', id: s.id, model: s.model, side: domestic(s.id) ? 'player' : 'wild' })),
  ...MOBS.filter((m) => placeableMob(m.id)).map((m): GodSpawn => ({ name: m.name, what: m.id === Mob.Morvath ? 'boss' : 'mob', id: m.id, model: m.model, side: 'monsters' })),
  ...LAIRS.map((l, k): GodSpawn => ({ name: mobSpec(l.mob).name, what: 'lair', id: k, model: mobSpec(l.mob).model, side: 'monsters' })),
];

/** Turns godmode on or off for a player: on, the pool's stock is kept aside and the pool filled; off, the kept stock comes back as it was. */
export function setGod(state: SimState, player: number, on: boolean): void {
  const p = state.players[player];
  if (!p || (p.god === 1) === on) return;
  if (on) {
    p.godPool.set(p.pool);
    p.god = 1;
    fillPool(state, player);
  } else {
    p.pool.set(p.godPool);
    p.godPool.fill(0);
    p.god = 0;
  }
  state.events.push({ player, kind: 'info', text: on ? 'Godmode on: everything is built and made at once, for nothing.' : 'Godmode off: your own stock is back.' });
}

function fillPool(state: SimState, player: number): void {
  const pool = state.players[player]!.pool;
  // "Meat", "fish" and "any lumber" stand for several kinds in a cost and are never held themselves.
  for (let r = 0; r < RESOURCES.length; r++) if (!isAnyRes(r)) pool[r] = GOD_STOCK;
}

/** Each step: every player in godmode has a full pool again, whatever the last step spent. */
export function updateGods(state: SimState): void {
  for (let p = 0; p < state.players.length; p++) if (state.players[p]!.god === 1) fillPool(state, p);
}

/** Places one of GOD_SPAWNS at a point (wu) for a player in godmode. */
export function godPlace(state: SimState, player: number, what: number, x: number, z: number): void {
  const s = GOD_SPAWNS[what];
  if (!s || !isGod(state, player)) return;
  const e = state.entities;
  switch (s.what) {
    case 'worker': {
      const i = e.add(state.nextEntityId++, player, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Worker);
      e.heading[i] = 32768;
      e.homeX[i] = x;
      e.homeZ[i] = z;
      break;
    }
    case 'troop': {
      if (s.id === Troop.Dreadnought) {
        e.heading[addDreadnought(state, player, x, z)] = 32768;
        break;
      }
      // At the top of its ladder: carbon steel, or the brawler's one kit, close melee with the top shield (Patch 5); cavalry on a horse.
      const i = addWarrior(state, player, x, z, s.id, weaponTiers(s.id)[1], TOP_TIER, hasShield(s.id) ? TOP_SHIELD_TIER : 0);
      e.heading[i] = 32768;
      if (s.id === Troop.Cavalry) seatOnHorse(state, i, Mount.Horse, speciesSpec(Species.Horse).hp, 0, 0);
      break;
    }
    case 'mage':
      e.heading[addMage(state, player, x, z, s.id, TOP_MAGE_TIER, TOP_MAGE_TIER)] = 32768;
      break;
    case 'crewman':
      addCrewman(state, player, x, z);
      break;
    case 'engine':
      addFullCrew(state, addEngine(state, player, s.id, x, z));
      break;
    case 'animal':
      addAnimal(state, s.id, s.side === 'player' ? player : WILD, x, z, 0, state.nextEntityId & 1);
      break;
    case 'mob':
      addMob(state, s.id, player, x, z, Math.max(nightNow(state), mobSpec(s.id).firstNight));
      break;
    case 'boss':
      if (bossIndex(state) >= 0) state.events.push({ player, kind: 'alert', text: 'Morvath is already here.' });
      else summonBoss(state, player, x, z, Math.max(nightNow(state), BOSS_FIRST_NIGHT));
      break;
    case 'lair':
      addLair(state, LAIRS[s.id]!, player, x, z, nightNow(state));
      break;
  }
}

/** Every worker, troop and mage of the player's to the top of its ladder at once, health full. */
export function maxRanks(state: SimState, player: number): void {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    const kind = e.kind[i]!;
    if (kind === UnitKind.Worker) {
      e.xp[i] = Math.max(e.xp[i]!, WORKER_XP_TENTHS[TOP_RANK]!);
      setWorkerRank(state, i, TOP_RANK);
    } else if (kind === UnitKind.Warrior) {
      // The Dreadnought has no ranks (Patch 5); his 200 health stays his own.
      if (isDreadnought(e, i)) continue;
      e.xp[i] = Math.max(e.xp[i]!, WARRIOR_XP_TENTHS[TOP_RANK]!);
      e.rank[i] = TOP_RANK;
      e.maxHp[i] = WARRIOR_HEALTH_BY_RANK[TOP_RANK]!;
    } else if (kind === UnitKind.Mage) {
      e.xp[i] = Math.max(e.xp[i]!, MAGE_XP_TENTHS[MAGE_TOP_RANK]!);
      setMageRank(state, i, MAGE_TOP_RANK);
      e.mana[i] = manaCap(state, i);
    } else continue;
    e.hp[i] = e.maxHp[i]!;
    n++;
  }
  state.events.push({ player, kind: 'info', text: `Debug: ${n} unit${n === 1 ? '' : 's'} raised to the top rank.` });
}

/** Every unit and engine of the player's back to full health (a mage's mana too), and every building of theirs mended. */
export function healAll(state: SimState, player: number): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    e.hp[i] = e.maxHp[i]!;
    if (e.kind[i] === UnitKind.Mage) e.mana[i] = manaCap(state, i);
  }
  for (const b of state.buildings.list) if (b.owner === player && b.complete) b.hp = maxHealth(b);
  state.events.push({ player, kind: 'info', text: 'Debug: everything of yours is healed and mended.' });
}

/** Kills the given units outright, whoever's they are: they die as if in a fight, dropping what they would. */
export function killUnits(state: SimState, units: readonly number[]): void {
  const e = state.entities;
  for (const id of units) {
    const i = e.indexOf(id);
    if (i < 0 || e.hp[i]! <= 0) continue;
    e.hp[i] = 0;
    state.dying.push(id);
  }
}

/** Every monster within CLEAR_FOES_WU of a point leaves quietly (no drops, no experience), lairs and the villages' buildings aside. */
export function clearFoes(state: SimState, player: number, x: number, z: number): void {
  const e = state.entities;
  const r2 = CLEAR_FOES_WU * CLEAR_FOES_WU;
  let n = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== MONSTERS || e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0 || isStructure(e.mob[i]!)) continue;
    const dx = e.x[i]! - x;
    const dz = e.z[i]! - z;
    if (dx * dx + dz * dz > r2) continue;
    e.hp[i] = -1;
    state.dying.push(e.id[i]!);
    n++;
  }
  state.events.push({ player, kind: 'info', text: `Debug: ${n} monster${n === 1 ? '' : 's'} cleared within ${floorDiv(CLEAR_FOES_WU, WU_PER_METRE)} m.` });
}

/** The Elf kingdom, built where it stands if no one has been near it yet, its land revealed round it, and the player's camera sent there. */
export function showElves(state: SimState, player: number): void {
  checkPeoples(state, elfKingdomCell(state));
  const k = elfKingdom(state);
  if (!k.built) buildFaction(state, k);
  state.world.reveal(k.x, k.z, ELF_REVEAL_WU);
  state.events.push({ player, kind: 'info', text: 'Debug: the Elf kingdom.', x: k.x, z: k.z, look: true });
}
