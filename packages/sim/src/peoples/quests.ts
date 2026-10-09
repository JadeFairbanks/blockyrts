// The peoples' quests (Jade's Patch 5, QV-1 to QV-34; rows in
// quest-data.ts). Each Halfling village, Runkin camp, Dwarf colony and Dwarf
// city, and the Elf kingdom, has one quest its leader gives (QV-4), to each
// player on their own (QV-11): the Elf steward and every caravan master give
// and take the Elves' one.
//
// The offer is the leader's question to every player who has met it and is
// at peace with it; it stays up over the leader until it is answered (QV-6).
// Yes takes the quest on, if one of the player's units is within 15 m of the
// leader (QV-10); No, and it is asked again a minute later. A quest stays
// open until its reward is claimed (QV-12): once the task is done (for the
// bog pear, while the player holds one, QV-20) the leader asks "Claim
// reward?", and Yes with a unit near hands the reward straight to the
// player's inventory (QV-13), taking the bog pear. The same quest comes back
// to that player 20 days after the claim (QV-11).
//
// Kills count from when the quest was taken, and only the player's own
// (peoplesHooks.kill: the player whose unit hit the mob last, or whose unit
// killed the animal). The Runkin's raid is after the tribe band nearest the
// camp when it was taken (QV-24); a band wiped out by others before the
// player killed one of it gives way to the next nearest. The Elves' quest is
// not offered in a peaceful game nor once fewer than 2 Fae Guardians are left
// in the world (coordinator's pick: they never come back).
//
// The quest state is the factions' per-player lists (types.ts); the questions
// are not state (units/questions.ts): a loaded game asks again.

import { length2d, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { RESOURCES } from '../economy/resources.ts';
import { mobSpec } from '../combat/mobs.ts';
import { speciesSpec } from '../animals/species.ts';
import type { AnswerOrder } from '../orders.ts';
import { UnitKind, type SimState } from '../state.ts';
import { answerKinds, askForever, asksOf, closeAsksBy } from '../units/questions.ts';
import { members } from '../threats/tribes.ts';
import { KeeperKind } from '../threats/keepers.ts';
import { Role } from '../threats/types.ts';
import { CELL_RING_SHIFT } from '../world/layout.ts';
import { colKey } from '../world/world.ts';
import { factionName, FactionKind, LEADER_NAMES, Status } from './data.ts';
import { sayForeign } from './speech.ts';
import { factionById, warFaction, type Faction } from './types.ts';
import { QUEST_ASK_AGAIN_STEPS, QUEST_REACH_M, QUEST_REPEAT_STEPS, QuestAsk, questOfKind, QuestStage, QUESTS, type QuestSpec } from './quest-data.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;

// ----- the per-player lists -----

function at(list: number[], p: number): number {
  return list[p] ?? 0;
}

/** Sets a player's entry, filling any gap before it with zeros (a list sized before more players were in). */
function put(list: number[], p: number, v: number): void {
  while (list.length < p) list.push(0);
  list[p] = v;
}

/** The faction a giver's quest belongs to: an Elf caravan's kingdom, else the giver's own. */
export function questHolder(state: SimState, f: Faction): Faction {
  return f.kind === FactionKind.ElfCaravan ? warFaction(state.peoples, f) : f;
}

// ----- what the quests ask -----

/** The bands of tribesmen alive now, nearest a point first: band id and where its first tribesman stands (wu). */
function bandsBy(state: SimState, x: number, z: number): Array<[number, number, number]> {
  const e = state.entities;
  const out: Array<[number, number, number, number]> = [];
  for (const b of state.threats.bands) {
    const m = members(state, b.id);
    if (m.length === 0) continue;
    const i = m[0]!;
    out.push([b.id, e.x[i]!, e.z[i]!, length2d(e.x[i]! - x, e.z[i]! - z)]);
  }
  out.sort((a, b) => a[3] - b[3] || a[0] - b[0]);
  return out.map(([id, bx, bz]) => [id, bx, bz]);
}

/** The living wild animal of a species nearest a point (an index), or -1. */
function nearestAnimal(state: SimState, species: number, x: number, z: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Animal || e.mob[i] !== species || e.hp[i]! <= 0 || e.owner[i]! < state.players.length) continue;
    const d = length2d(e.x[i]! - x, e.z[i]! - z);
    if (best < 0 || d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * The Fae Guardians still to fall in the world, counted up to `enough`: those
 * alive, and one for each large mana crystal none has come to yet, looked for
 * from the Deadlands outward (one cell in 20 there) and then the inner bands,
 * so the count stops early. None in a peaceful game.
 */
export function faeLeft(state: SimState, enough: number): number {
  if (state.peaceful) return 0;
  const e = state.entities;
  let n = 0;
  for (const k of state.threats.keepers) {
    if (k.kind !== KeeperKind.Fae) continue;
    const i = e.indexOf(k.id);
    if (i >= 0 && e.hp[i]! > 0) n++;
  }
  const gen = state.world.gen;
  const layout = state.world.layout;
  const guarded = state.threats.guarded;
  const first = Math.min(layout.bands.deadlands, layout.ringCount);
  for (let t = 0; t < layout.ringCount && n < enough; t++) {
    const r = first + t < layout.ringCount ? first + t : first + t - layout.ringCount;
    for (let k = 0; k < layout.ringCellCount(r) && n < enough; k++) {
      const c = gen.cellFeatures(layout.cell(r * CELL_RING_SHIFT + k)).crystal;
      if (!c) continue;
      // A crystal's keeper is marked at the crystal itself, within 4 columns of its spot (threats/keepers.ts wakeKeepers).
      let seen = false;
      for (let dz = -4; dz <= 4 && !seen; dz++) for (let dx = -4; dx <= 4 && !seen; dx++) seen = guarded.has(colKey(c.x + dx, c.z + dz));
      if (!seen) n++;
    }
  }
  return Math.min(n, enough);
}

/** Whether a quest can be offered now: a band to raid, Fae Guardians enough to kill. */
function offerable(state: SimState, q: QuestSpec, holder: Faction): boolean {
  if (q.need.t === 'band') return bandsBy(state, holder.x, holder.z).length > 0;
  if (q.need.t === 'mobs') return faeLeft(state, q.need.n) >= q.need.n;
  return true;
}

/** Whether a player's quest is ready to claim: its task done, or (a good to bring) one in their inventory. */
function ready(state: SimState, q: QuestSpec, holder: Faction, p: number): boolean {
  const stage = at(holder.quest, p);
  if (q.need.t === 'bring') return stage === QuestStage.Taken && (state.players[p]!.pool[q.need.res] ?? 0) >= 1;
  return stage === QuestStage.Done;
}

/** A band's kind as the lines say it, plural ("gnolls"); "tribesmen" for none. */
function tribeOf(state: SimState, band: number): string {
  const b = state.threats.bands.find((x) => x.id === band);
  return b ? `${mobSpec(b.tribe).name.toLowerCase()}s` : 'tribesmen';
}

function words(state: SimState, text: string, holder: Faction, p: number): string {
  return text.replace(/\{tribe\}/g, tribeOf(state, at(holder.questTarget, p)));
}

/** Whether one of a player's units (a worker, warrior or mage, out in the open) is within reach of a point. */
function unitNear(state: SimState, p: number, x: number, z: number): boolean {
  const e = state.entities;
  const r = QUEST_REACH_M * M;
  for (let j = 0; j < e.count; j++) {
    if (e.owner[j] !== p || e.hp[j]! <= 0 || e.inside[j] !== 0) continue;
    const k = e.kind[j];
    if (k !== UnitKind.Worker && k !== UnitKind.Warrior && k !== UnitKind.Mage) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) <= r) return true;
  }
  return false;
}

/** The leader of a giver, alive (an index), or -1. */
function leaderOf(state: SimState, f: Faction): number {
  const e = state.entities;
  const i = f.leader ? e.indexOf(f.leader) : -1;
  return i >= 0 && e.hp[i]! > 0 ? i : -1;
}

function atPeace(state: SimState, f: Faction, p: number): boolean {
  return (warFaction(state.peoples, f).war & (1 << p)) === 0;
}

// ----- asking -----

function giverIs(f: Faction): boolean {
  return f.status === Status.Settled && f.built === 1 && f.leader !== 0;
}

/** Puts the offer or the claim to a player over a giver's leader, when its turn has come; `tribe` is the nearest band's kind, or '' when the quest cannot be offered now. */
function askFor(state: SimState, f: Faction, q: QuestSpec, i: number, p: number, tribe: string): void {
  const holder = questHolder(state, f);
  const bit = 1 << p;
  if (!(holder.met & bit) || !atPeace(state, f, p) || state.step < at(holder.questAt, p)) return;
  const e = state.entities;
  const who = e.id[i]!;
  const stage = at(holder.quest, p);
  if (stage === QuestStage.Open) {
    if (!tribe || asksOf(state, who, p, QuestAsk.Offer)) return;
    askForever(state, {
      player: p, who, building: false, q: QuestAsk.Offer, units: [who], foreign: true,
      text: q.offer.replace(/\{tribe\}/g, tribe),
      yes: `Take on "${q.title}" (a unit of yours must be within ${QUEST_REACH_M} m).`,
      no: 'Not now.',
      holds: () => at(holder.quest, p) === QuestStage.Open && atPeace(state, f, p),
    });
    return;
  }
  if (!ready(state, q, holder, p) || asksOf(state, who, p, QuestAsk.Claim)) return;
  askForever(state, {
    player: p, who, building: false, q: QuestAsk.Claim, units: [who], foreign: true,
    text: words(state, q.claim, holder, p),
    yes: `Claim reward: ${rewardText(q)}${q.need.t === 'bring' ? ` for 1 ${RESOURCES[q.need.res]!.name.toLowerCase()}` : ''} (a unit of yours must be within ${QUEST_REACH_M} m).`,
    no: 'Not yet.',
    holds: () => ready(state, q, holder, p) && atPeace(state, f, p),
  });
}

/** A good's name for a count of it: "4 bronze ingots", "3 fluted gothic harnesses", "50 stone". */
function countOf(res: number, n: number): string {
  const name = RESOURCES[res]!.name.toLowerCase();
  if (n === 1) return `1 ${name}`;
  if (/harness$/.test(name)) return `${n} ${name}es`;
  return /(ingot|sword|rotella|shield|pear)$/.test(name) ? `${n} ${name}s` : `${n} ${name}`;
}

/** A quest's reward as the lines say it: "50 farm fare, 50 softwood lumber and 50 stone". */
export function rewardText(q: QuestSpec): string {
  const parts = q.reward.map(([r, n]) => countOf(r, n));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** The raid's band, kept up: once it is gone, done if the player killed one of it, else the next nearest band (0 for none yet). */
function keepBand(state: SimState, holder: Faction, p: number): void {
  const target = at(holder.questTarget, p);
  if (target !== 0 && members(state, target).length > 0) return;
  if (target !== 0 && at(holder.questCount, p) > 0) {
    done(state, QUESTS.find((q) => q.need.t === 'band')!, holder, p);
    return;
  }
  const next = bandsBy(state, holder.x, holder.z)[0];
  put(holder.questTarget, p, next?.[0] ?? 0);
  put(holder.questCount, p, 0);
  if (next && next[0] !== target) {
    state.events.push({ player: p, kind: 'alert', text: `The band you were after is gone. A band of ${tribeOf(state, next[0])} is marked on your minimap instead.`, x: next[1], z: next[2], faction: holder.id });
  }
}

/** A quest's task is done: the claim waits at its giver. */
function done(state: SimState, q: QuestSpec, holder: Faction, p: number): void {
  put(holder.quest, p, QuestStage.Done);
  put(holder.questAt, p, 0);
  state.events.push({ player: p, kind: 'info', text: `Quest done: ${q.title}. Bring a unit to ${giverWords(holder)} to claim your reward.`, x: holder.x, z: holder.z, faction: holder.id });
}

/** Who takes a quest back, as a sentence says it: "the village elder of Bramblebottom". */
function giverWords(holder: Faction): string {
  return holder.kind === FactionKind.ElfKingdom ? 'the Elf steward or a caravan master' : `the ${LEADER_NAMES[holder.kind]!.toLowerCase()} of ${factionName(holder.kind, holder.seed)}`;
}

/** Once a second: the raids keep their bands, and each giver's leader puts its offer or its claim to each player whose turn it is. */
export function updateQuests(state: SimState): void {
  if (state.step % SEC !== 7) return;
  const ps = state.peoples;
  for (const f of ps.factions) {
    if (f.kind !== FactionKind.RunkinCamp) continue;
    for (let p = 0; p < state.players.length; p++) if (at(f.quest, p) === QuestStage.Taken) keepBand(state, f, p);
  }
  for (const f of ps.factions) {
    const q = questOfKind(f.kind);
    if (!q || !giverIs(f)) continue;
    const i = leaderOf(state, f);
    if (i < 0) continue;
    // An offer that cannot be taken now (no band about, too few Fae Guardians left) is withdrawn from everyone.
    const holder = questHolder(state, f);
    const tribe = !offerable(state, q, holder) ? '' : q.need.t === 'band' ? tribeOf(state, bandsBy(state, holder.x, holder.z)[0]![0]) : '-';
    if (!tribe) closeAsksBy(state, f.leader, [QuestAsk.Offer]);
    for (let p = 0; p < state.players.length; p++) if (!state.players[p]!.out) askFor(state, f, q, i, p, tribe);
  }
}

// ----- kills -----

/** A mob or wild animal died (installed as peoplesHooks.kill): it counts towards the quests its killer's player has taken. */
export function onQuestKill(state: SimState, i: number, taker: number): void {
  if (taker < 0 || taker >= state.players.length) return;
  const e = state.entities;
  for (const holder of state.peoples.factions) {
    if (at(holder.quest, taker) !== QuestStage.Taken) continue;
    const q = questOfKind(holder.kind);
    if (!q) continue;
    const need = q.need;
    let hit = false;
    if (need.t === 'band') hit = e.kind[i] === UnitKind.Mob && e.role[i] === Role.Tribe && e.group[i] === at(holder.questTarget, taker);
    else if (need.t === 'mobs') hit = e.kind[i] === UnitKind.Mob && need.mobs.includes(e.mob[i]!);
    else if (need.t === 'animals') hit = e.kind[i] === UnitKind.Animal && e.mob[i] === need.species;
    if (!hit) continue;
    const n = at(holder.questCount, taker) + 1;
    put(holder.questCount, taker, n);
    if ((need.t === 'mobs' || need.t === 'animals') && n >= need.n) done(state, q, holder, taker);
  }
}

// ----- answers -----

/** Where to look for what a quest asks: the band's first tribesman, or the nearest animal of the kind to its holder (wu), or null. */
export function questMark(state: SimState, q: QuestSpec, holder: Faction, p: number): [number, number] | null {
  const e = state.entities;
  if (q.need.t === 'band') {
    const m = members(state, at(holder.questTarget, p));
    return m.length > 0 ? [e.x[m[0]!]!, e.z[m[0]!]!] : null;
  }
  if (q.need.t === 'animals') {
    const a = nearestAnimal(state, q.need.species, holder.x, holder.z);
    return a >= 0 ? [e.x[a]!, e.z[a]!] : null;
  }
  return null;
}

/** Yes or No to an offer or a claim. */
function answerQuest(state: SimState, o: AnswerOrder): void {
  const e = state.entities;
  const i = e.indexOf(o.who);
  if (i < 0 || e.hp[i]! <= 0 || e.kind[i] === UnitKind.Animal) return;
  const f = factionById(state.peoples, e.group[i]!);
  const q = f ? questOfKind(f.kind) : undefined;
  const p = o.player;
  if (!f || !q || f.leader !== o.who || p < 0 || p >= state.players.length || state.players[p]!.out || !atPeace(state, f, p)) return;
  const holder = questHolder(state, f);
  const stage = at(holder.quest, p);
  const near = unitNear(state, p, e.x[i]!, e.z[i]!);
  if (o.q === QuestAsk.Offer) {
    if (stage !== QuestStage.Open) return;
    if (o.yes !== 1) {
      put(holder.questAt, p, state.step + QUEST_ASK_AGAIN_STEPS);
      return;
    }
    if (!near) {
      sayForeign(state, i, `Send one of your people to me to take this on.`, true, p, f.id);
      return;
    }
    if (!offerable(state, q, holder)) return;
    put(holder.quest, p, QuestStage.Taken);
    put(holder.questAt, p, 0);
    put(holder.questCount, p, 0);
    put(holder.questTarget, p, q.need.t === 'band' ? (bandsBy(state, holder.x, holder.z)[0]?.[0] ?? 0) : 0);
    sayForeign(state, i, words(state, q.taken, holder, p), true, p, f.id);
    state.events.push({ player: p, kind: 'info', text: `Quest taken: ${q.title}. It is in your Quests menu.`, faction: holder.id });
    // QV-25: taking the raid pings the band (and the Dwarves' hunts their nearest beast, s).
    if (q.ping) {
      const mark = questMark(state, q, holder, p);
      if (mark) state.events.push({ player: p, kind: 'alert', text: `${q.title}: ${q.need.t === 'band' ? `the band of ${tribeOf(state, at(holder.questTarget, p))}` : `the nearest ${speciesSpec((q.need as { species: number }).species).name.toLowerCase()}`} is marked on your minimap.`, x: mark[0], z: mark[1], faction: holder.id });
    }
    return;
  }
  if (o.q !== QuestAsk.Claim || !ready(state, q, holder, p)) return;
  if (o.yes !== 1) {
    put(holder.questAt, p, state.step + QUEST_ASK_AGAIN_STEPS);
    return;
  }
  if (!near) {
    sayForeign(state, i, 'Bring one of your people to me to claim it.', true, p, f.id);
    return;
  }
  const pool = state.players[p]!.pool;
  if (q.need.t === 'bring') pool[q.need.res] = pool[q.need.res]! - 1;
  for (const [r, n] of q.reward) pool[r] = pool[r]! + n;
  put(holder.quest, p, QuestStage.Open);
  put(holder.questAt, p, state.step + QUEST_REPEAT_STEPS);
  put(holder.questCount, p, 0);
  put(holder.questTarget, p, 0);
  sayForeign(state, i, q.thanks, true, p, f.id);
  state.events.push({ player: p, kind: 'info', text: `Quest reward: ${rewardText(q)}, into your inventory.`, faction: holder.id });
}

answerKinds.set(QuestAsk.Offer, answerQuest);
answerKinds.set(QuestAsk.Claim, answerQuest);

// ----- the quest menu -----

/** One of a player's quests as the quest menu shows it. */
export interface QuestView {
  /** The faction whose quest it is (the Elf kingdom for the Elves'), and the quest (quest-data.ts Quest). */
  faction: number;
  quest: number;
  title: string;
  /** Who takes it back, and where they are (wu). */
  giver: string;
  x: number;
  z: number;
  /** QuestStage: 1 taken, 2 done and waiting to be claimed (the bog pear: 1 until one is in the inventory). */
  stage: number;
  ready: boolean;
  /** What to do, how far along, and what is next. */
  task: string;
  progress: string;
  reward: string;
  /** The Hint: its tooltip, and where the minimap pings (wu) for a quest that pings, or null. */
  hint: string;
  ping: [number, number] | null;
}

/** Extra rows the quest menu tracks (Jade's decisions 3.6, QoL 3), added by the modules that own them: a title and its words, for a player. */
export const questTimerHooks: Array<(state: SimState, player: number) => Array<[string, string]>> = [];

/** A player's open quests, in the order their factions were found (not those of a people gone for good). */
export function questsView(state: SimState, player: number): QuestView[] {
  const out: QuestView[] = [];
  for (const holder of state.peoples.factions) {
    const stage = at(holder.quest, player);
    if (stage === QuestStage.Open || holder.status === Status.Gone) continue;
    const q = questOfKind(holder.kind);
    if (!q) continue;
    const isReady = ready(state, q, holder, player);
    const who = giverWords(holder);
    const giver = `${who.charAt(0).toUpperCase()}${who.slice(1)}`;
    let progress: string;
    const need = q.need;
    const n = at(holder.questCount, player);
    if (need.t === 'bring') progress = isReady ? `You have a ${RESOURCES[need.res]!.name.toLowerCase()}.` : `No ${RESOURCES[need.res]!.name.toLowerCase()} in your inventory yet.`;
    else if (need.t === 'band') {
      const left = members(state, at(holder.questTarget, player)).length;
      progress = stage === QuestStage.Done ? 'The band is wiped out.' : at(holder.questTarget, player) === 0 ? 'Waiting for a band to roam near.' : `${n} killed, ${left} left.`;
    } else progress = `${Math.min(n, need.n)} of ${need.n} killed.`;
    const mark = q.ping && !isReady ? questMark(state, q, holder, player) : null;
    out.push({
      faction: holder.id, quest: q.id, title: q.title, giver, x: holder.x, z: holder.z, stage, ready: isReady,
      task: words(state, q.task, holder, player),
      progress: isReady ? `${progress} Claim your reward from ${who}.` : progress,
      reward: rewardText(q),
      hint: q.ping && mark ? q.hint.replace('The band is', `The band of ${tribeOf(state, at(holder.questTarget, player))} is`) : q.hint,
      ping: mark,
    });
  }
  return out;
}

/** The rows the quest menu tracks for a player besides the quests (QoL 3). */
export function questTimers(state: SimState, player: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const h of questTimerHooks) rows.push(...h(state, player));
  return rows;
}
