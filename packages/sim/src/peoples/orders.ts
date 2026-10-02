// The players' orders to the peoples (trade, war, surrender, reparations,
// hiring) and the debug buttons that place a people near the camera.

import { floorDiv, WU_PER_COLUMN } from '../fixed.ts';
import type { Order } from '../orders.ts';
import type { SimState } from '../state.ts';
import { hire } from './ai.ts';
import { CARAVAN_EVERY_STEPS, FactionKind } from './data.ts';
import { buildFaction, elfKingdom, foundFaction, wanderingCaravan } from './factions.ts';
import { makeOffer, takeBundle, withdrawOffer } from './trade.ts';
import { acceptSurrender, declareWar, payReparations, refuseSurrender } from './war.ts';
import { hash32 } from '../rng.ts';
import { Res, trinketRes } from '../economy/resources.ts';

type PeoplesOrder = Extract<Order, { kind: 'tradeOffer' | 'tradeTake' | 'tradeWithdraw' | 'declareWar' | 'surrender' | 'reparations' | 'hire' | 'debugPeoples' }>;

/** The debug button for an Elf caravan visiting now (beyond the faction kinds), and for meeting the Elves. */
export const DEBUG_CARAVAN = 7;
export const DEBUG_MEET_ELVES = 8;
/** The debug button for goods to trade and hire with: silver, Copper Tokens, Bronze Charms and gold. */
export const DEBUG_TRADE_KIT = 9;

export function peoplesOrder(state: SimState, o: PeoplesOrder): void {
  switch (o.kind) {
    case 'tradeOffer':
      makeOffer(state, o.player, o.faction, o.goods);
      break;
    case 'tradeTake':
      takeBundle(state, o.player, o.faction, o.bundle);
      break;
    case 'tradeWithdraw':
      withdrawOffer(state, o.player, o.faction);
      break;
    case 'declareWar':
      declareWar(state, o.player, o.faction);
      break;
    case 'surrender':
      if (o.accept) acceptSurrender(state, o.player, o.faction);
      else refuseSurrender(state, o.player, o.faction);
      break;
    case 'reparations':
      payReparations(state, o.player, o.faction);
      break;
    case 'hire':
      hire(state, o.player, o.faction, o.count);
      break;
    case 'debugPeoples':
      debugPeoples(state, o.player, o.what, o.x, o.z);
      break;
  }
}

/**
 * Debug: a people at a point (wu), as if found there: a Halfling village, a
 * Runkin camp, the Elf kingdom (moved here if not yet built), a wandering
 * Elf caravan, a Dwarf colony or city, a mercenary camp; or an Elf caravan
 * coming to the player now; or the player meeting the Elves (caravans start).
 */
export function debugPeoples(state: SimState, player: number, what: number, x: number, z: number): void {
  const layout = state.world.layout;
  const cell = layout.cell(layout.nearest(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN)));
  const h = hash32(state.seed ^ 0x64656267, state.step, what);
  if (what === DEBUG_TRADE_KIT) {
    const p = state.players[player];
    if (!p) return;
    for (const [r, n] of [[Res.Silver, 20], [trinketRes(0, 1), 6], [trinketRes(2, 2), 2], [Res.Gold, 5]] as const) p.pool[r] = p.pool[r]! + n;
    state.events.push({ player, kind: 'info', text: 'Debug: 20 silver, 6 Copper Tokens, 2 Bronze Charms and 5 gold added.' });
    return;
  }
  if (what === DEBUG_MEET_ELVES || what === DEBUG_CARAVAN) {
    const k = elfKingdom(state);
    k.met |= 1 << player;
    state.peoples.elvesMet |= 1 << player;
    // The kingdom's caravan comes now (by day), or, just met, in 5 days.
    if (what === DEBUG_CARAVAN) k.caravanAt[player] = Math.max(1, state.step);
    else if (!k.caravanAt[player]) k.caravanAt[player] = state.step + CARAVAN_EVERY_STEPS;
    state.events.push({ player, kind: 'info', text: what === DEBUG_CARAVAN ? 'Debug: an Elf caravan sets off for your main base (by day).' : 'Debug: you have met the Elves; their caravan comes in 5 days.' });
    return;
  }
  if (what === FactionKind.ElfCaravan) {
    wanderingCaravan(state, cell, x, z, h);
    return;
  }
  if (what === FactionKind.ElfKingdom) {
    const k = elfKingdom(state);
    if (k.built) return;
    k.x = x;
    k.z = z;
    k.cell = cell.id;
    k.band = cell.band;
    buildFaction(state, k);
    return;
  }
  if (what < 0 || what > FactionKind.MercCamp) return;
  foundFaction(state, what, cell, x, z, h);
}

