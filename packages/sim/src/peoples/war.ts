// War with the peoples (Neutral villages and trade: war; Halflings; Runkin;
// Elves; Dwarves; Table 19). A player declares war after the confirmation
// pop-up (attacking one of their units at peace asks first); every player
// in the game is drawn in with them, as allies until the Allies panel comes.
// Halflings and Runkin offer to surrender once more than half of them have
// died; accepting takes the plunder and they leave (Halflings for good,
// Runkin to a new camp in a cell no one has explored), refusing fights on.
// A faction whose fighters are all dead is defeated: whoever's unit killed
// the last of them takes the plunder. Elves never surrender and send a war
// band of 6 every 2 days; an Elf who sees a player's unit cut a Deepwoods
// tree warns it three times, then the Elves are at war. Dwarves migrate at
// half, rebuild for 10 days, then raid with 6 every 3 days until paid
// reparations. Left buildings are abandoned: workers break them down for
// their materials.

import { buildingCentre } from '../buildings/lights.ts';
import { floorDiv, isqrt, length2d, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { NEUTRAL, PEOPLES, UnitKind, WILD, type SimState } from '../state.ts';
import type { Item } from '../combat/items.ts';
import { vanish } from '../combat/mob-ai.ts';
import { Mob } from '../combat/mobs.ts';
import { RESOURCES, Res, TRINKET_BASE, TRINKET_METALS } from '../economy/resources.ts';
import { giveOrder } from '../units/behaviour.ts';
import { nearestBuilding } from '../threats/foes.ts';
import { Species } from '../animals/species.ts';
import { Band } from '../world/layout.ts';
import {
  DWARF_RAID_EVERY_STEPS, DWARF_REBUILD_STEPS, ELF_RAID_EVERY_STEPS, FACTION_KIND_NAMES, FactionKind, factionName, LAYOUTS, LEAVE_WU, LINES, People, PEOPLE_NAMES,
  PeopleUnit, peopleUnitSpec, PLUNDER_GOODS, PLUNDER_TENTHS_PER_PERSON, RAID_BAND, RAID_FROM_WU, RECAMP_SEARCH_CELLS, REPARATIONS_PAID_LINE, REPARATIONS_PER_KILL_TENTHS,
  REPARATIONS_TENTHS, SALVAGE, Status, SURRENDER_DEAD_PCT, TREE_WARN_GAP_STEPS, TREE_WARN_WU, TREE_WARNING_LINES, TREE_WARNINGS, LEADER_NAMES,
} from './data.ts';
import { addPerson, beastsOf, buildFaction, fightersOf, isPerson, peopleOf, spotIn, structuresOf } from './factions.ts';
import { sayForeign } from './speech.ts';
import { resValueTenths } from './stock.ts';
import { factionById, warFaction, type Faction } from './types.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;
/** Plunder's live animals: what a village keeps as stock, not its wolves and bears. */
const LIVESTOCK: readonly number[] = [Species.Chicken, Species.Cattle, Species.Ox, Species.Horse];

/** A faction's name as the messages say it: "Bramblebottom (Halfling village)". */
export function factionTitle(f: Faction): string {
  return `${factionName(f.kind, f.seed)} (${FACTION_KIND_NAMES[f.kind]})`;
}

/** Bits of every player still in the game. */
function everyone(state: SimState): number {
  let bits = 0;
  state.players.forEach((p, k) => {
    if (!p.out) bits |= 1 << k;
  });
  return bits;
}

/** A line from a faction that has no one on the map (migrated Dwarves): to each player in `bits`. */
function sayFromAfar(state: SimState, f: Faction, text: string, bits: number): void {
  for (let p = 0; p < state.players.length; p++) {
    if (!(bits & (1 << p))) continue;
    state.events.push({ player: p, kind: 'speech', text, speaker: 0, name: LEADER_NAMES[f.kind] ?? 'Elder', foreign: true, important: true, near: 1 << p, faction: f.id, x: f.x, z: f.z });
  }
}

/** The faction's leader if alive, else any of its people (for its speech). */
function voice(state: SimState, f: Faction): number {
  const e = state.entities;
  const leader = f.leader ? e.indexOf(f.leader) : -1;
  if (leader >= 0 && e.hp[leader]! > 0) return leader;
  return peopleOf(state, f.id)[0] ?? -1;
}

/** Says a line to every player at war with it (important, so it reaches their panels). */
function sayToEnemies(state: SimState, f: Faction, text: string): void {
  const s = voice(state, f);
  if (!text) return;
  if (s < 0) {
    sayFromAfar(state, f, text, warFaction(state.peoples, f).war);
    return;
  }
  sayForeign(state, s, text, true, -1, f.id);
}

// ----- declaring war -----

/** Every faction that goes to war with this one: itself, and an Elf kingdom's caravans with it. */
function kin(state: SimState, f: Faction): Faction[] {
  const top = warFaction(state.peoples, f);
  return state.peoples.factions.filter((g) => g === top || g.parent === top.id);
}

/**
 * War between a faction and every player still in (s: the players are all
 * allies until the Allies panel). Open offers are dropped; the Elves'
 * caravans stand with their kingdom.
 */
export function declareWar(state: SimState, player: number, factionId: number, why = ''): void {
  const f0 = factionById(state.peoples, factionId);
  if (!f0 || f0.kind === FactionKind.MercCamp || f0.status === Status.Gone) return;
  const f = warFaction(state.peoples, f0);
  const bits = everyone(state);
  if ((f.war & bits) === bits) return;
  const fresh = bits & ~f.war;
  f.war |= bits;
  f.surrender = 0;
  for (const g of kin(state, f)) {
    state.peoples.offers = state.peoples.offers.filter((o) => o.faction !== g.id);
    g.met |= fresh;
  }
  if (f.kind === FactionKind.ElfKingdom && !f.nextAt) f.nextAt = state.step + ELF_RAID_EVERY_STEPS;
  for (let p = 0; p < state.players.length; p++) {
    if (!(fresh & (1 << p))) continue;
    const who = p === player ? (why || 'You have declared war on') : 'Your ally has declared war on';
    state.events.push({ player: p, kind: 'alert', text: `${who} ${factionTitle(f)}. Their people will fight yours on sight.`, x: f0.x, z: f0.z, faction: f.id, urgent: true });
  }
  sayToEnemies(state, f0, LINES[f.people as People].attacked);
}

// ----- deaths and losses -----

/** One of a faction's people or buildings died (installed as peoplesHooks.death). */
export function onPeoplesDeath(state: SimState, i: number, taker: number): void {
  const e = state.entities;
  const f = factionById(state.peoples, e.group[i]!);
  if (!f) return;
  const player = taker >= 0 && taker < state.players.length ? taker : -1;
  if (isPerson(state, i)) {
    f.dead++;
    if (player >= 0) {
      f.kills[player] = (f.kills[player] ?? 0) + 1;
      f.lastTaker = player;
    }
    if (f.leader === e.id[i]) f.leader = 0;
  }
  // A player that kills one of theirs at peace (a stray blast, a called beast) is at war with them.
  const top = warFaction(state.peoples, f);
  if (player >= 0 && !(top.war & (1 << player)) && (isPerson(state, i) || e.kind[i] === UnitKind.Mob)) declareWar(state, player, f.id, 'Blood has been spilt: you are at war with');
  if (f.status !== Status.Settled || !(top.war & everyone(state))) return;
  afterLoss(state, f);
}

/** After a loss at war: a defeat, a surrender offered, or the Dwarves leaving. */
function afterLoss(state: SimState, f: Faction): void {
  const e = state.entities;
  // The dying are still counted alive this step.
  const fighters = fightersOf(state, f.id).filter((j) => e.hp[j]! > 0);
  if (fighters.length === 0 && f.kind !== FactionKind.ElfCaravan) {
    defeat(state, f);
    return;
  }
  const half = f.dead * 100 > f.founded * SURRENDER_DEAD_PCT;
  if (!half) return;
  if ((f.people === People.Halfling || f.people === People.Runkin) && f.surrender === 0) {
    f.surrender = 1;
    sayToEnemies(state, f, LINES[f.people as People].surrender);
    for (let p = 0; p < state.players.length; p++) {
      if (f.war & (1 << p)) state.events.push({ player: p, kind: 'alert', text: `${factionTitle(f)} offer to surrender. Accept or refuse in the Peoples panel.`, x: f.x, z: f.z, faction: f.id, urgent: true });
    }
  } else if (f.kind === FactionKind.DwarfColony || f.kind === FactionKind.DwarfCity) {
    migrate(state, f);
  }
}

/** Defeated: plunder for whoever killed the last fighter, and the rest flee. */
function defeat(state: SimState, f: Faction): void {
  const taker = f.lastTaker;
  for (let p = 0; p < state.players.length; p++) {
    if (f.war & (1 << p)) state.events.push({ player: p, kind: 'alert', text: `${factionTitle(f)} has been defeated.`, x: f.x, z: f.z, faction: f.id });
  }
  if (taker >= 0) plunder(state, f, taker);
  leave(state, f, f.people === People.Runkin);
}

/** A player accepts a surrender: the plunder is theirs, the war is over, and the faction leaves. */
export function acceptSurrender(state: SimState, player: number, factionId: number): void {
  const f = factionById(state.peoples, factionId);
  if (!f || f.surrender !== 1 || !(f.war & (1 << player)) || f.status !== Status.Settled) return;
  plunder(state, f, player);
  sayToEnemies(state, f, LINES[f.people as People].leave);
  f.war = 0;
  leave(state, f, f.people === People.Runkin);
}

/** A player refuses: they fight on to the end. */
export function refuseSurrender(state: SimState, player: number, factionId: number): void {
  const f = factionById(state.peoples, factionId);
  if (!f || f.surrender !== 1 || !(f.war & (1 << player))) return;
  f.surrender = 2;
  state.events.push({ player, kind: 'info', text: `You refused the surrender of ${factionTitle(f)}. They will fight to the last.`, faction: f.id });
}

/** The fighters' weapons a faction of its size carries, item by item (plunder). */
function fightersArms(f: Faction): Item[] {
  const out: Item[] = [];
  const layout = LAYOUTS[f.kind];
  if (!layout) return out;
  for (const [unit, n] of layout.people) {
    const s = peopleUnitSpec(unit);
    if (!s.fighter) continue;
    for (let k = 0; k < n; k++) for (const it of [s.weapon, s.backup, s.ranged, s.shield]) if (it) out.push(it as Item);
  }
  return out;
}

/** Plunder (Table 11): the livestock, the fighters' weapons, and 10 vp of loot per person in food and metal. */
export function plunder(state: SimState, f: Faction, player: number): void {
  const e = state.entities;
  const p = state.players[player];
  if (!p) return;
  const parts: string[] = [];
  let beasts = 0;
  for (const j of beastsOf(state, f.id)) {
    if (!LIVESTOCK.includes(e.mob[j]!)) continue;
    e.owner[j] = player;
    e.group[j] = 0;
    e.home[j] = 0;
    beasts++;
  }
  if (beasts) parts.push(`${beasts} head of livestock`);
  const arms = fightersArms(f);
  for (const it of arms) p.items[it] = p.items[it]! + 1;
  if (arms.length) parts.push(`${arms.length} weapons and shields`);
  const [food, metal] = PLUNDER_GOODS[f.people as People];
  const half = floorDiv(PLUNDER_TENTHS_PER_PERSON * Math.max(1, f.founded), 2);
  const nf = floorDiv(half, resValueTenths(food));
  const nm = floorDiv(half, resValueTenths(metal));
  p.pool[food] = p.pool[food]! + nf;
  p.pool[metal] = p.pool[metal]! + nm;
  parts.push(`${nf} ${RESOURCES[food]!.name.toLowerCase()}`, `${nm} ${RESOURCES[metal]!.name.toLowerCase()}`);
  state.events.push({ player, kind: 'info', text: `Plunder from ${factionTitle(f)}: ${parts.join(', ')}.`, x: f.x, z: f.z, faction: f.id });
}

/** Its buildings stand empty: anyone's workers may break them down for materials. */
function abandon(state: SimState, f: Faction): void {
  const e = state.entities;
  for (const j of structuresOf(state, f.id)) {
    if (e.mob[j] === Mob.ElfCaravanWagon) {
      vanish(state, j);
      continue;
    }
    e.owner[j] = NEUTRAL;
  }
}

/** Where a faction's people walk off to: away from the players' nearest building, LEAVE_WU and more. */
function awayPoint(state: SimState, f: Faction): [number, number] {
  const b = nearestBuilding(state, f.x, f.z, 0, () => true);
  let dx = 1;
  let dz = 0;
  if (b) {
    const [bx, bz] = buildingCentre(b);
    dx = f.x - bx;
    dz = f.z - bz;
  }
  const d = Math.max(1, isqrt(dx * dx + dz * dz));
  const far = LEAVE_WU * 2;
  return [f.x + floorDiv(dx * far, d), f.z + floorDiv(dz * far, d)];
}

/**
 * The faction leaves: its people walk away and vanish, its buildings are
 * abandoned, its wolves and bears go wild. Runkin (`recamp`) look for a
 * cell no one has explored and camp there; finding none they are gone.
 */
export function leave(state: SimState, f: Faction, recamp: boolean): void {
  const e = state.entities;
  f.status = Status.Leaving;
  f.leftAt = state.step;
  f.surrender = 0;
  [f.toX, f.toZ] = awayPoint(state, f);
  state.peoples.offers = state.peoples.offers.filter((o) => o.faction !== f.id);
  for (const j of beastsOf(state, f.id)) {
    e.owner[j] = WILD;
    e.group[j] = 0;
  }
  abandon(state, f);
  f.toCell = recamp ? newCampCell(state, f) : 0;
  f.survivors = peopleOf(state, f.id).filter((j) => e.hp[j]! > 0).length;
  for (const j of peopleOf(state, f.id)) {
    e.queue[j] = [];
    e.target[j] = 0;
    giveOrder(state, j, { t: 'move', x: f.toX + ((e.id[j]! % 5) - 2) * M, z: f.toZ }, false);
  }
  sayToEnemies(state, f, LINES[f.people as People].leave);
}

/** A cell for Runkin to camp in again: one no one has come near yet, in the Heartland, Fringe or Deepwoods, nearest first; 0 for none. */
function newCampCell(state: SimState, f: Faction): number {
  const layout = state.world.layout;
  const seen = new Set<number>([f.cell]);
  let frontier = [f.cell];
  let looked = 0;
  while (frontier.length > 0 && looked < RECAMP_SEARCH_CELLS) {
    const next: number[] = [];
    for (const c of frontier) {
      for (const n of layout.neighboursOf(c)) {
        if (seen.has(n)) continue;
        seen.add(n);
        looked++;
        const cell = layout.cell(n);
        if (cell.ring > 0 && cell.band <= Band.Deepwoods && !state.peoples.checked.has(n) && !state.threats.checked.has(n)) return n;
        next.push(n);
      }
    }
    frontier = next.sort((a, b) => a - b);
  }
  return 0;
}

/** Runkin away: the players come near the cell they went to, and their new camp is there, as many as are left. */
export function recampIn(state: SimState, cellId: number): boolean {
  const f = state.peoples.factions.find((g) => g.status === Status.Away && g.toCell === cellId);
  if (!f) return false;
  const cell = state.world.layout.cell(cellId);
  const spot = spotIn(state, cell, FactionKind.RunkinCamp);
  if (!spot) return false;
  [f.x, f.z] = spot;
  f.cell = cellId;
  f.band = cell.band;
  f.status = Status.Settled;
  f.war = 0;
  f.surrender = 0;
  f.leader = 0;
  const left = f.survivors;
  buildFaction(state, f);
  // As many as walked away: the rest of the new camp's people are not there.
  const e = state.entities;
  const people = peopleOf(state, f.id);
  for (const j of people.slice(Math.max(1, left))) vanish(state, j);
  f.founded = Math.max(1, Math.min(people.length, left));
  f.dead = 0;
  if (f.leader && !people.slice(0, Math.max(1, left)).some((j) => e.id[j] === f.leader)) f.leader = e.id[people[0]!]!;
  return true;
}

/** Dwarves at half: they walk off and rebuild elsewhere, still at war, and in 10 days raid until paid reparations. */
function migrate(state: SimState, f: Faction): void {
  leave(state, f, false);
  f.rebuildUntil = state.step + DWARF_REBUILD_STEPS;
  f.nextAt = f.rebuildUntil;
  for (let p = 0; p < state.players.length; p++) {
    if (f.war & (1 << p)) state.events.push({ player: p, kind: 'alert', text: `${factionTitle(f)} have abandoned their home. They will be back for revenge unless you pay reparations (Peoples panel).`, x: f.x, z: f.z, faction: f.id });
  }
}

/** The people who walked off: gone once far enough or long enough; then the faction is away, migrated or gone. */
export function updateLeaving(state: SimState, f: Faction, leaveSteps: number): void {
  const e = state.entities;
  let left = 0;
  for (const j of peopleOf(state, f.id)) {
    if (length2d(e.x[j]! - f.x, e.z[j]! - f.z) >= LEAVE_WU || state.step - f.leftAt >= leaveSteps) vanish(state, j);
    else left++;
  }
  if (left > 0) return;
  if (f.toCell) f.status = Status.Away;
  else if (f.people === People.Dwarf && f.war !== 0) f.status = Status.Migrated;
  else f.status = Status.Gone;
}

// ----- reparations -----

/** What a player owes a Dwarf faction, tenths: 2000 vp plus 100 for each Dwarf they killed. */
export function reparationsOwed(f: Faction, player: number): number {
  return REPARATIONS_TENTHS + REPARATIONS_PER_KILL_TENTHS * (f.kills[player] ?? 0);
}

/** What reparations are paid in, in this order (Table 19): trinkets, gold, silver, gems, then food. */
function payables(): number[] {
  const out: number[] = [Res.Sunheart, Res.Moonleaf];
  for (let m = TRINKET_METALS.length - 1; m >= 0; m--) for (let t = 3; t >= 0; t--) out.push(TRINKET_BASE + m * 4 + t);
  out.push(Res.Gold, Res.Silver, Res.Diamonds, Res.Rubies, Res.Emeralds);
  for (const r of RESOURCES) if (r.nutrition > 0) out.push(r.id);
  return out;
}

/** Pays a Dwarf faction's reparations from the stock (most valuable first); peace with that player when it is enough. */
export function payReparations(state: SimState, player: number, factionId: number): void {
  const f = factionById(state.peoples, factionId);
  const p = state.players[player];
  if (!f || !p || f.people !== People.Dwarf || !(f.war & (1 << player))) return;
  const owed = reparationsOwed(f, player);
  let have = 0;
  const list = payables();
  for (const r of list) have += p.pool[r]! * resValueTenths(r);
  if (have < owed) {
    state.events.push({ player, kind: 'alert', text: `Reparations to ${factionTitle(f)} are ${floorDiv(owed, 10)} worth of trinkets, gold, silver, gems or food. You have ${floorDiv(have, 10)}.`, faction: f.id });
    return;
  }
  let left = owed;
  for (const r of list) {
    if (left <= 0) break;
    const v = resValueTenths(r);
    const n = Math.min(p.pool[r]!, floorDiv(left + v - 1, v));
    p.pool[r] = p.pool[r]! - n;
    left -= n * v;
  }
  f.war &= ~(1 << player);
  const s = voice(state, f);
  if (s >= 0) sayForeign(state, s, REPARATIONS_PAID_LINE, true, player, f.id);
  else sayFromAfar(state, f, REPARATIONS_PAID_LINE, 1 << player);
  // Peace with everyone: a migrated group stays where it went, gone from the map.
  if (f.war === 0 && f.status === Status.Migrated) f.status = Status.Gone;
}

// ----- raids -----

/** The faction's war band of 6 comes for a player: in from 70 m beyond their building nearest the faction, then at it. */
export function sendRaid(state: SimState, f: Faction, player: number): void {
  const target = nearestBuilding(state, f.x, f.z, 0, (b) => b.owner === player);
  if (!target) return;
  const [bx, bz] = buildingCentre(target);
  const dx = f.x - bx;
  const dz = f.z - bz;
  const d = Math.max(1, isqrt(dx * dx + dz * dz));
  const sx = bx + floorDiv(dx * RAID_FROM_WU, d);
  const sz = bz + floorDiv(dz * RAID_FROM_WU, d);
  const band = f.people === People.Elf ? [PeopleUnit.ElfBladewarden, PeopleUnit.ElfRanger] : [PeopleUnit.DwarfShieldbearer, PeopleUnit.DwarfHammerguard, PeopleUnit.DwarfCrossbowman];
  const e = state.entities;
  for (let k = 0; k < RAID_BAND; k++) {
    const i = addPerson(state, f, band[k % band.length]!, sx + ((k % 3) - 1) * 2 * M, sz + (floorDiv(k, 3) - 1) * 2 * M);
    e.foe[i] = player + 1;
    giveOrder(state, i, { t: 'attackMove', x: bx, z: bz }, false);
  }
  state.events.push({ player, kind: 'alert', text: `A war band of ${RAID_BAND} from ${factionTitle(f)} is coming for your buildings.`, x: sx, z: sz, faction: f.id, urgent: true });
}

/** The Elves' and the migrated Dwarves' raids, each on its own count of days. */
export function updateRaids(state: SimState, f: Faction): void {
  if (!f.nextAt || state.step < f.nextAt || f.war === 0) return;
  const elves = f.kind === FactionKind.ElfKingdom && f.status === Status.Settled;
  const dwarves = f.people === People.Dwarf && f.status === Status.Migrated && state.step >= f.rebuildUntil;
  if (!elves && !dwarves) return;
  f.nextAt = state.step + (elves ? ELF_RAID_EVERY_STEPS : DWARF_RAID_EVERY_STEPS);
  for (let p = 0; p < state.players.length; p++) if (f.war & (1 << p) && !state.players[p]!.out) sendRaid(state, f, p);
}

// ----- the Elves' trees -----

/** A player's unit cut a tree: an Elf within 30 m in the Deepwoods warns it, at most every 20 s; the third warning is war (installed as peoplesHooks.treeCut). */
export function onTreeCut(state: SimState, i: number, x: number, z: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length) return;
  const layout = state.world.layout;
  if (layout.cell(layout.nearest(floorDiv(x, COL), floorDiv(z, COL))).band !== Band.Deepwoods) return;
  let elf = -1;
  for (const j of state.grid.near(x, z, TREE_WARN_WU)) {
    if (e.owner[j] !== PEOPLES || !isPerson(state, j) || e.hp[j]! <= 0 || peopleUnitSpec(e.mob[j]!).people !== People.Elf) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > TREE_WARN_WU) continue;
    if (elf < 0 || e.id[j]! < e.id[elf]!) elf = j;
  }
  if (elf < 0) return;
  const f = factionById(state.peoples, e.group[elf]!);
  if (!f) return;
  const top = warFaction(state.peoples, f);
  if (top.war & (1 << player)) return;
  if (top.warnings[player]! > 0 && state.step - top.warnedAt[player]! < TREE_WARN_GAP_STEPS) return;
  top.warnings[player] = top.warnings[player]! + 1;
  top.warnedAt[player] = state.step;
  top.met |= 1 << player;
  const n = top.warnings[player]!;
  if (n >= TREE_WARNINGS) {
    declareWar(state, player, top.id, 'You were warned three times about the trees. You are at war with');
    return;
  }
  sayForeign(state, elf, TREE_WARNING_LINES[n - 1]!, true, player, f.id);
  state.events.push({ player, kind: 'alert', text: `The Elves warn you off their trees (${n} of ${TREE_WARNINGS}). The third warning means war.`, x, z, faction: top.id, urgent: true });
}

// ----- salvage -----

/** Workers broke down an abandoned building: its materials go to their player (installed as peoplesHooks.salvage). */
export function onSalvage(state: SimState, i: number, taker: number): void {
  const p = state.players[taker];
  if (!p) return;
  const e = state.entities;
  const got = SALVAGE[e.mob[i]!] ?? [];
  for (const [r, n] of got) p.pool[r] = p.pool[r]! + n;
  if (got.length) state.events.push({ player: taker, kind: 'info', text: `Salvaged ${got.map(([r, n]) => `${n} ${RESOURCES[r]!.name.toLowerCase()}`).join(' and ')}.`, x: e.x[i]!, z: e.z[i]! });
}

/** Whether an entity is a building the peoples left (workers may break it down). */
export function abandoned(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob && e.owner[i] === NEUTRAL && e.group[i] !== 0 && SALVAGE[e.mob[i]!] !== undefined && e.hp[i]! > 0;
}

/** The faction an entity belongs to, if it is one of the peoples'. */
export function factionOf(state: SimState, i: number): Faction | undefined {
  const e = state.entities;
  if (e.owner[i] !== PEOPLES && !abandoned(state, i)) return undefined;
  return factionById(state.peoples, e.group[i]!);
}

/** For the Peoples panel: the people a faction is (Halflings ...). */
export function peopleName(f: Faction): string {
  return PEOPLE_NAMES[f.people as People];
}

