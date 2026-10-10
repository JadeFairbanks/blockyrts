// Unit speech (Unit speech and the message panel): what units say as
// events. Every line is a bubble over its speaker; which lines also reach a
// player's message panel is the client's call (Patch 2, What reaches chat:
// the speaker is the player's own and the line is urgent). Another people's
// units speak as bubbles too. Random remarks are the client's alone (never
// state). The questions units and buildings ask (Patch 2) live in
// units/questions.ts; what is said here hands over to them through askHooks.

import { floorDiv, length2d, STEPS_PER_SECOND } from '../fixed.ts';
import { PEOPLES, UnitKind, type BubbleHold, type SimEvent, type SimState } from '../state.ts';
import { mobSpec } from '../combat/mobs.ts';
import { speciesSpec } from '../animals/species.ts';
import { unitTitleOf } from '../units/names.ts';
import { Role } from '../threats/types.ts';
import { engineSpec } from '../siege/data.ts';
import { buildingName } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { FactionKind, LEADER_NAMES, peopleUnitSpec, SPEECH_NEAR_WU } from './data.ts';
import { factionById } from './types.ts';
import { RISEN_NAME } from '../units/effects.ts';

/** A player's units say "under attack" at most once per 10 s, and one unit at most once per 30 s (s). */
const ATTACKED_PLAYER_GAP = 10 * STEPS_PER_SECOND;
const ATTACKED_UNIT_GAP = 30 * STEPS_PER_SECOND;

/** Not state: when each player's units and each unit last said they were under attack. */
const attackedAt = new WeakMap<SimState, { players: number[]; units: Map<number, number> }>();

/**
 * The questions (units/questions.ts, Patch 2) that speech and the rest of
 * the sim hand over to, set when that module loads (it needs this one).
 */
export const askHooks: {
  /** A man up top who wants to get down to `foe` asks to; false when he cannot ask now (his player has 3 open). */
  down: (state: SimState, i: number, foe: number) => boolean;
  /** A gatherer working by hand ran out of `res` nearby. */
  ranOut: (state: SimState, i: number, res: number) => void;
  /** A player's unit fell: an engine it crewed may ask for another. */
  fell: (state: SimState, i: number) => void;
} = { down: () => false, ranOut: () => {}, fell: () => {} };

/** Not state: the units with a question open, by entity id (their quiet lines wait). */
const askingAt = new WeakMap<SimState, Set<number>>();

/** The units with a question open now (entity ids), for units/questions.ts to keep. */
export function asking(state: SimState): Set<number> {
  let s = askingAt.get(state);
  if (!s) {
    s = new Set();
    askingAt.set(state, s);
  }
  return s;
}

/** The name a unit speaks under in the message panel. */
export function speakerName(state: SimState, i: number): string {
  const e = state.entities;
  if (e.role[i] === Role.Mercenary) return `Mercenary ${peopleUnitSpec(e.mob[i]!).name.toLowerCase()}`;
  if (e.role[i] === Role.Risen) return RISEN_NAME;
  if (e.owner[i] === PEOPLES) {
    const f = factionById(state.peoples, e.group[i]!);
    if (f && f.leader === e.id[i]) return LEADER_NAMES[f.kind] ?? 'Elder';
    if (e.kind[i] === UnitKind.Mob) return f?.kind === FactionKind.ElfCaravan ? LEADER_NAMES[FactionKind.ElfCaravan]! : mobSpec(e.mob[i]!).name;
    if (e.kind[i] === UnitKind.Animal) return 'Animal';
    return peopleUnitSpec(e.mob[i]!).name;
  }
  if (e.kind[i] === UnitKind.Engine) return engineSpec(e.mob[i]!).name;
  return unitTitleOf(state, i);
}

/**
 * One of the players' units says something to its player. An urgent line
 * needs the player now (an order failed, danger or harm, or it stopped and
 * will not carry on alone): it goes to its owner's message panel too, pings
 * the minimap and flashes the panel (Patch 2, What reaches chat). A quiet
 * line only tells what the unit is doing, and waits while the unit has a
 * question open (Patch 2, round 3).
 */
export function say(state: SimState, i: number, text: string, urgent = false, quiet = false, hold?: BubbleHold): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length) return;
  if (quiet && askingAt.get(state)?.has(e.id[i]!)) return;
  const ev: SimEvent = { player, kind: 'speech', text, speaker: e.id[i]!, name: speakerName(state, i), urgent, x: e.x[i]!, z: e.z[i]! };
  if (quiet) ev.quiet = true;
  if (hold) ev.hold = hold;
  state.events.push(ev);
}

/**
 * What a unit says as it sits down to a timed action (units/tinker.ts), in
 * the present tense ("Upgrading to bronze scale armour."): a quiet line whose
 * bubble stays up for as long as its progress bar runs (Jade's Patch 3).
 * Call it on the step the unit sits down, the step its bar starts.
 */
export function sayTinkering(state: SimState, i: number, text: string): void {
  say(state, i, text, false, true, 'bar');
}

/** Not state: when each unit last said each kind of quiet line (chatter). */
const chatterAt = new WeakMap<SimState, Map<number, number>>();

/**
 * A quiet line from a unit, unless that unit said a line of the same kind
 * (`kind`, a small number) less than `gap` steps ago; returns whether it was
 * said. What units say is not state, so neither is when they said it.
 */
export function chatter(state: SimState, i: number, kind: number, gap: number, text: string): boolean {
  let m = chatterAt.get(state);
  if (!m) {
    m = new Map();
    chatterAt.set(state, m);
  }
  const key = state.entities.id[i]! * 16 + kind;
  const last = m.get(key);
  if (last !== undefined && state.step - last < gap && state.step >= last) return false;
  m.set(key, state.step);
  if (m.size > 4096) m.clear();
  say(state, i, text, false, true);
  return true;
}

/** The players with a unit within hearing of a point (bits). */
export function hearers(state: SimState, x: number, z: number): number {
  const e = state.entities;
  let bits = 0;
  for (const j of state.grid.near(x, z, SPEECH_NEAR_WU)) {
    const o = e.owner[j]!;
    if (o >= state.players.length || e.hp[j]! <= 0 || length2d(e.x[j]! - x, e.z[j]! - z) > SPEECH_NEAR_WU) continue;
    bits |= 1 << o;
  }
  return bits;
}

/**
 * Another people's unit says something: a bubble for whoever sees it; an
 * important line also reaches the panel of the players near enough. To one
 * player only (`player`), as the trade menu's answers are. `hold` keeps its
 * bubble up longer than usual (BubbleHold).
 */
export function sayForeign(state: SimState, i: number, text: string, important: boolean, player = -1, faction = 0, hold?: BubbleHold): void {
  if (!text || i < 0) return;
  const e = state.entities;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const ev: SimEvent = {
    player, kind: 'speech', text, speaker: e.id[i]!, name: speakerName(state, i), foreign: true, important, near: important ? hearers(state, x, z) : 0, x, z,
    faction: faction || e.group[i]!,
  };
  if (hold) ev.hold = hold;
  state.events.push(ev);
}

/**
 * A player's unit was hurt by an enemy, the unit at index `a`: it says so,
 * now and then, naming the enemy whose blow made it speak (Unit speech:
 * triggered speech; Jade's Patch 3: "We are under attack from a zombie!").
 */
export function sayAttacked(state: SimState, i: number, a: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length) return;
  let t = attackedAt.get(state);
  if (!t) {
    t = { players: [], units: new Map() };
    attackedAt.set(state, t);
  }
  if (state.step - (t.players[player] ?? -ATTACKED_PLAYER_GAP) < ATTACKED_PLAYER_GAP) return;
  if (state.step - (t.units.get(e.id[i]!) ?? -ATTACKED_UNIT_GAP) < ATTACKED_UNIT_GAP) return;
  t.players[player] = state.step;
  t.units.set(e.id[i]!, state.step);
  if (t.units.size > 512) t.units.clear();
  const foe = aFoe(state, a);
  const line = e.kind[i] === UnitKind.Worker ? `Help! I am being attacked by ${foe}!` : e.kind[i] === UnitKind.Mage ? `I am under attack from ${foe}!` : `We are under attack from ${foe}!`;
  say(state, i, line, true);
}

/**
 * An enemy as a unit names it in a sentence (Jade's Patch 3): "a zombie",
 * "an ash golem", "a wolf", "a Halfling spearman" (the peoples' names keep
 * their capitals), or a boss by its name alone ("Morvath").
 */
export function aFoe(state: SimState, j: number): string {
  const e = state.entities;
  let name: string;
  if (j < 0) name = 'enemy';
  else if (e.kind[j] === UnitKind.Animal) name = speciesSpec(e.mob[j]!).name.toLowerCase();
  else if (e.kind[j] === UnitKind.Mob) {
    name = mobSpec(e.mob[j]!).name;
    // Morvath, the Hollow Crown: one of him, by his name.
    const comma = name.indexOf(',');
    if (comma >= 0) return name.slice(0, comma);
    name = name.toLowerCase();
  } else if (e.kind[j] === UnitKind.Engine) name = engineSpec(e.mob[j]!).name.toLowerCase();
  else if (e.owner[j] === PEOPLES || e.role[j] === Role.Mercenary || e.role[j] === Role.People) name = peopleUnitSpec(e.mob[j]!).name;
  else name = unitTitleOf(state, j).toLowerCase();
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** A man up top with nothing to shoot says so while monsters are at the base: a player's men at most once per 20 s, one man at most once per 90 s (s). */
const UP_TOP_PLAYER_GAP = 20 * STEPS_PER_SECOND;
const UP_TOP_UNIT_GAP = 90 * STEPS_PER_SECOND;

/** Not state: when each player's men up top and each of them last spoke up. */
const upTopAt = new WeakMap<SimState, { players: number[]; units: Map<number, number> }>();

/**
 * A man on a tower or a main base's top with no bow or gun sees an enemy
 * close (Jade's patch notes 1): "I'm not much help up here!", a bubble only
 * (Patch 2: nothing to do about it), and a warrior one time in three asks
 * to get down to foe, the nearest enemy on the ground, instead (Patch 2,
 * round 3's question; -1 when only flyers are near: they are not down
 * there). With 3 questions of his player's open he waits his turn.
 */
export function sayUpTop(state: SimState, i: number, foe: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length) return;
  let t = upTopAt.get(state);
  if (!t) {
    t = { players: [], units: new Map() };
    upTopAt.set(state, t);
  }
  if (state.step - (t.players[player] ?? -UP_TOP_PLAYER_GAP) < UP_TOP_PLAYER_GAP) return;
  if (state.step - (t.units.get(e.id[i]!) ?? -UP_TOP_UNIT_GAP) < UP_TOP_UNIT_GAP) return;
  const eager = foe >= 0 && e.kind[i] === UnitKind.Warrior && (e.id[i]! + floorDiv(state.step, UP_TOP_UNIT_GAP)) % 3 === 0;
  if (eager && !askHooks.down(state, i, foe)) return;
  t.players[player] = state.step;
  t.units.set(e.id[i]!, state.step);
  if (t.units.size > 512) t.units.clear();
  if (!eager) say(state, i, "I'm not much help up here!", false, true);
}

/**
 * A player's building says something to its player (Patch 2: buildings get
 * bubbles too, over the middle of the roof), as a unit's say does.
 */
export function sayBuilding(state: SimState, b: Building, text: string, urgent = false, hold?: BubbleHold): void {
  if (b.owner >= state.players.length) return;
  const [x, z] = buildingCentre(b);
  const ev: SimEvent = { player: b.owner, kind: 'speech', text, building: b.id, name: buildingName(b.kind, b.level, b.variant), urgent, x, z };
  if (hold) ev.hold = hold;
  state.events.push(ev);
}

/** What a man calls the enemy he sees: "those zombies", or a boss by name. */
export function foesName(state: SimState, j: number): string {
  const e = state.entities;
  if (e.kind[j] !== UnitKind.Mob) return 'them';
  const name = e.owner[j] === PEOPLES ? speakerName(state, j) : mobSpec(e.mob[j]!).name;
  // Morvath, the Hollow Crown: one of him, by his name.
  const comma = name.indexOf(',');
  if (comma >= 0) return name.slice(0, comma);
  return `those ${plural(name.toLowerCase())}`;
}

/** An English plural for a monster's name. */
function plural(name: string): string {
  if (name.endsWith('us')) return `${name.slice(0, -2)}i`;
  if (/(s|sh|ch|x)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}
