// Unit speech (Unit speech and the message panel): what units say as
// events. The players' own units speak to their player (into the panel and
// as a bubble); another people's units speak as bubbles, and their
// important lines reach the panel of each player with a unit near enough
// to hear them. Random remarks are the client's alone (never state).

import { length2d, STEPS_PER_SECOND } from '../fixed.ts';
import { PEOPLES, UnitKind, type SimEvent, type SimState } from '../state.ts';
import { mobSpec } from '../combat/mobs.ts';
import { RANK_NAMES } from '../combat/combat.ts';
import { Role } from '../threats/types.ts';
import { FactionKind, LEADER_NAMES, peopleUnitSpec, SPEECH_NEAR_WU } from './data.ts';
import { factionById } from './types.ts';

/** A player's units say "under attack" at most once per 10 s, and one unit at most once per 30 s (s). */
const ATTACKED_PLAYER_GAP = 10 * STEPS_PER_SECOND;
const ATTACKED_UNIT_GAP = 30 * STEPS_PER_SECOND;

/** Not state: when each player's units and each unit last said they were under attack. */
const attackedAt = new WeakMap<SimState, { players: number[]; units: Map<number, number> }>();

/** The name a unit speaks under in the message panel. */
export function speakerName(state: SimState, i: number): string {
  const e = state.entities;
  if (e.role[i] === Role.Mercenary) return `Mercenary ${peopleUnitSpec(e.mob[i]!).name.toLowerCase()}`;
  if (e.owner[i] === PEOPLES) {
    const f = factionById(state.peoples, e.group[i]!);
    if (f && f.leader === e.id[i]) return LEADER_NAMES[f.kind] ?? 'Elder';
    if (e.kind[i] === UnitKind.Mob) return f?.kind === FactionKind.ElfCaravan ? LEADER_NAMES[FactionKind.ElfCaravan]! : mobSpec(e.mob[i]!).name;
    if (e.kind[i] === UnitKind.Animal) return 'Animal';
    return peopleUnitSpec(e.mob[i]!).name;
  }
  const rank = e.rank[i]!;
  if (e.kind[i] === UnitKind.Warrior) return `Warrior (${RANK_NAMES.warrior[rank] ?? 'Recruit'})`;
  if (e.kind[i] === UnitKind.Mage) return `Mage (${RANK_NAMES.mage[rank] ?? 'Novice Acolyte'})`;
  return `Worker (${RANK_NAMES.worker[rank] ?? 'Labourer'})`;
}

/**
 * One of the players' units says something to its player; urgent lines ping
 * the minimap and flash the panel. A quiet line only tells what the unit is
 * doing: it shows as a bubble and stays out of the panel, as random remarks
 * do (Jade's play-test notes).
 */
export function say(state: SimState, i: number, text: string, urgent = false, quiet = false): void {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length) return;
  const ev: SimEvent = { player, kind: 'speech', text, speaker: e.id[i]!, name: speakerName(state, i), urgent, x: e.x[i]!, z: e.z[i]! };
  if (quiet) ev.quiet = true;
  state.events.push(ev);
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
 * player only (`player`), as the trade menu's answers are.
 */
export function sayForeign(state: SimState, i: number, text: string, important: boolean, player = -1, faction = 0): void {
  if (!text || i < 0) return;
  const e = state.entities;
  const x = e.x[i]!;
  const z = e.z[i]!;
  state.events.push({
    player, kind: 'speech', text, speaker: e.id[i]!, name: speakerName(state, i), foreign: true, important, near: important ? hearers(state, x, z) : 0, x, z,
    faction: faction || e.group[i]!,
  });
}

/** A player's unit was hurt by an enemy: it says so, now and then (Unit speech: triggered speech). */
export function sayAttacked(state: SimState, i: number): void {
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
  const line = e.kind[i] === UnitKind.Worker ? 'Help! I am being attacked!' : e.kind[i] === UnitKind.Mage ? 'I am under attack!' : 'We are under attack!';
  say(state, i, line, true);
}
