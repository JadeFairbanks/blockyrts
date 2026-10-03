// The worker's view of the neutral peoples for the local player: what the
// trade menu and the Peoples panel show (Neutral villages and trade). Runs in
// the sim worker; reads the state, never changes it.
import {
  CAT_COUNT,
  DAILY_BUY_TENTHS,
  FactionKind,
  factionTitle,
  fightersOf,
  inReach,
  isDark,
  LEANS,
  offerOf,
  PAY_PCT,
  People,
  payPct,
  peopleOf,
  reparationsOwed,
  Status,
  tradeProblem,
  warFaction,
  type Faction,
  type SimState,
} from '@blockyrts/sim';
import type { PeopleInfo } from './messages.ts';

/** Whether a player knows a faction: seen or met, at war with it, or visited by its caravan. Gone ones drop out. */
function known(f: Faction, top: Faction, player: number): boolean {
  const bit = 1 << player;
  if (!f.built) return false;
  if (f.status === Status.Away || f.status === Status.Gone) return false;
  // Migrated Dwarves stay listed while they are owed reparations.
  if (f.status === Status.Migrated) return (top.war & bit) !== 0;
  return ((f.seen | f.met | top.war) & bit) !== 0 || (f.kind === FactionKind.ElfCaravan && f.visits === player);
}

/** The goods it has today, as (good, count) pairs. */
function inStockNow(f: Faction): number[] {
  const out: number[] = [];
  for (let k = 0; k < f.stock.length; k += 2) if (f.stock[k + 1]! > 0) out.push(f.stock[k]!, f.stock[k + 1]!);
  return out;
}

function hireWhy(s: SimState, f: Faction, player: number): string {
  if (f.status !== Status.Settled) return 'They have gone.';
  if (isDark(s.step, s.blood)) return 'Mercenaries hire out by day only.';
  if (f.survivors <= 0) return 'Nobody here for hire today.';
  if (!inReach(s, f, player)) return 'Bring one of your units within 15 m of the camp.';
  return '';
}

/** The factions a player knows, for the HUD. */
export function peoplesInfo(s: SimState, player: number): PeopleInfo[] {
  const out: PeopleInfo[] = [];
  const me = s.players[player]!;
  const mine: number[] = [];
  me.pool.forEach((n, r) => {
    if (n > 0) mine.push(r);
  });
  const e = s.entities;
  for (const f of s.peoples.factions) {
    const top = warFaction(s.peoples, f);
    if (!known(f, top, player)) continue;
    const bit = 1 << player;
    const war = (top.war & bit) !== 0;
    const merc = f.kind === FactionKind.MercCamp;
    const people = f.people as People;
    const o = offerOf(s, f.id, player);
    const standing = peopleOf(s, f.id).filter((j) => e.hp[j]! > 0);
    const wants = merc ? [] : [...PAY_PCT[people]];
    const room: number[] = [];
    for (let c = 0; c < CAT_COUNT; c++) room.push(Math.max(0, DAILY_BUY_TENTHS - (f.bought[c] ?? 0)));
    const pays: number[] = [];
    if (!merc) for (const g of mine) pays.push(g, payPct(f, g));
    out.push({
      id: f.id,
      kind: f.kind,
      people: f.people,
      status: f.status,
      title: factionTitle(f),
      lean: f.lean >= 0 ? (LEANS[people][f.lean]?.name ?? '') : '',
      x: f.x,
      z: f.z,
      war,
      met: ((f.met | top.met) & bit) !== 0,
      traded: (f.traded & bit) !== 0,
      leader: f.leader,
      fighters: fightersOf(s, f.id).filter((j) => e.hp[j]! > 0).length,
      standing: standing.length,
      founded: f.founded,
      surrender: war && f.surrender === 1,
      owed: war && f.people === People.Dwarf ? reparationsOwed(top, player) : 0,
      tradeWhy: merc ? 'Mercenaries only hire out their swords.' : tradeProblem(s, f, player),
      stock: merc ? [] : inStockNow(f),
      wants,
      room,
      pays,
      offer: o ? { goods: [...o.goods], worth: o.worth, bundles: o.bundles.map((b) => [...b]) } : null,
      hire: merc ? { left: f.survivors, size: f.size, why: hireWhy(s, f, player) } : null,
      visiting: f.kind === FactionKind.ElfCaravan && f.visits === player,
    });
  }
  return out;
}
