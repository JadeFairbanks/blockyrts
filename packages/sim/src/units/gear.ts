// Equipment on units (Equipment: equipping units, choosing by hand,
// Auto-Equip, Refurbishing; Bows and crossbows: quivers refilled at a main
// base) and specialist training (Table 7: Archery at the Barracks). Equip
// Best hands out the best items in stock to the most capable units first
// and takes them from the stock at once; hand-picked items are taken only
// when the unit reaches the main base, if they are still there. Units walk
// to the nearest main base to collect their gear and hand in what it
// replaces, then go back to what they were doing.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { solidRect, type Building } from '../buildings/store.ts';
import { Res } from '../economy/resources.ts';
import { length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { isDark } from '../clock.ts';
import { payNutrition } from '../economy/resources.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { SKILL_ARCHERY } from '../combat/fight.ts';
import { Item, ITEMS, itemSpec, Slot, toolItem, type ItemSpec } from '../combat/items.ts';
import { Tool } from '../world/props.ts';
import { Act, besideBuilding, resetWalk, walkTo } from './behaviour.ts';
import { KEEP, type UnitOrder } from './unit-orders.ts';

type EquipOrder = Extract<UnitOrder, { t: 'equip' }>;

/** The equip order's field for each slot. */
const SLOT_FIELD: Record<number, keyof EquipOrder> = {
  [Slot.Tool]: 'tool',
  [Slot.Weapon]: 'weapon',
  [Slot.Backup]: 'backup',
  [Slot.Ranged]: 'ranged',
  [Slot.Shield]: 'shield',
  [Slot.Boots]: 'boots',
  [Slot.Ammo]: 'ammo',
  [Slot.Torch]: 'torch',
};
const SLOTS = [Slot.Tool, Slot.Weapon, Slot.Backup, Slot.Ranged, Slot.Shield, Slot.Boots, Slot.Ammo, Slot.Torch] as const;

/** Auto-Equip hands out gear to idle units within about a 15 s run of a main base (Equipment): 45 m. */
export const AUTO_EQUIP_M = 45;
/** Auto-Equip and quiver refills are looked at every 5 s (s). */
export const GEAR_CHECK_STEPS = 5 * STEPS_PER_SECOND;
/** A unit this close to its main base's edge refills its quiver or sling stones there (s). */
const REFILL_WU = 4 * WU_PER_METRE;
/** Archery (Table 7): 40 food, 120 s at the Barracks, after Flint tools. */
export const ARCHERY = { food: 40, steps: 120 * STEPS_PER_SECOND };

export function emptyEquip(b: number): EquipOrder {
  return { t: 'equip', b, tool: KEEP, weapon: KEEP, backup: KEEP, ranged: KEEP, shield: KEEP, boots: KEEP, ammo: KEEP, torch: KEEP, reserved: 0 };
}

/** What a unit has in a slot now (a tool as its item). */
export function wornIn(state: SimState, i: number, slot: number): number {
  const e = state.entities;
  switch (slot) {
    case Slot.Tool:
      return toolItem(e.tool[i]!);
    case Slot.Weapon:
      return e.weapon[i]!;
    case Slot.Backup:
      return e.backup[i]!;
    case Slot.Ranged:
      return e.ranged[i]!;
    case Slot.Shield:
      return e.shield[i]!;
    case Slot.Boots:
      return e.boots[i]!;
    case Slot.Ammo:
      return e.ammoItem[i]!;
    case Slot.Torch:
      return e.torchUntil[i]! > state.step ? Item.HandTorch : Item.None;
  }
  return Item.None;
}

/** Puts an item in a slot, and hands what was there back to the stock. */
function wear(state: SimState, i: number, slot: number, item: number): void {
  const e = state.entities;
  const stock = state.players[e.owner[i]!]!.items;
  const old = wornIn(state, i, slot);
  // A burning torch and spent arrows are not handed back.
  if (old && slot !== Slot.Torch && slot !== Slot.Ammo) stock[old] = stock[old]! + 1;
  switch (slot) {
    case Slot.Tool:
      e.tool[i] = item ? itemSpec(item).tool! : e.kind[i] === UnitKind.Worker ? Tool.None : Tool.None;
      break;
    case Slot.Weapon:
      e.weapon[i] = item;
      break;
    case Slot.Backup:
      e.backup[i] = item;
      break;
    case Slot.Ranged: {
      // Arrows left in a quiver go back when the bow does.
      if (old === Item.Bow && e.ammo[i]! > 0 && e.ammoItem[i]) stock[e.ammoItem[i]!] = stock[e.ammoItem[i]!]! + e.ammo[i]!;
      e.ranged[i] = item;
      e.ammo[i] = 0;
      e.ammoItem[i] = 0;
      if (item === Item.JavelinsFlint) e.ammo[i] = itemSpec(item).ranged!.load;
      break;
    }
    case Slot.Shield:
      e.shield[i] = item;
      break;
    case Slot.Boots:
      e.boots[i] = item;
      break;
    case Slot.Ammo:
      e.ammoItem[i] = item;
      break;
    case Slot.Torch:
      e.torchUntil[i] = item ? state.step + itemSpec(item).burnSteps! : 0;
      break;
  }
}

/** Gives the reserved items of a dropped equip order back to the stock (a new order, Stop, or death). */
export function refundEquip(state: SimState, owner: number, o: UnitOrder): void {
  if (o.t !== 'equip' || owner >= state.players.length) return;
  const stock = state.players[owner]!.items;
  for (const slot of SLOTS) {
    const v = o[SLOT_FIELD[slot]!] as number;
    if (v === KEEP || v === 0 || (o.reserved & (1 << slot)) === 0) continue;
    stock[v] = stock[v]! + 1;
  }
}

/** A player's main base nearest a unit, or undefined. */
export function nearestMainBase(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || b.kind !== BuildingKind.MainBase || !b.complete) continue;
    const [x, z] = buildingCentre(b);
    const d = dist2(x, z, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Walks to the main base and takes the gear. */
export function runEquip(state: SimState, i: number, o: EquipOrder): boolean {
  const e = state.entities;
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !b.complete) {
    b = nearestMainBase(state, i);
    if (!b) {
      refundEquip(state, e.owner[i]!, o);
      return true;
    }
    o.b = b.id;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === 0) return false;
  if (r === 2) {
    refundEquip(state, e.owner[i]!, o);
    state.events.push({ player: e.owner[i]!, kind: 'alert', text: 'A unit cannot reach the main base to collect its equipment.', x: e.x[i]!, z: e.z[i]! });
    return true;
  }
  const stock = state.players[e.owner[i]!]!.items;
  for (const slot of SLOTS) {
    let v = o[SLOT_FIELD[slot]!] as number;
    if (v === KEEP) continue;
    const reserved = (o.reserved & (1 << slot)) !== 0;
    if (!reserved && v !== 0) {
      // Hand-picked: still in the stock? Workers' tools go first come, first served.
      if (v === BEST_TOOL) v = bestToolInStock(state, e.owner[i]!, e.tool[i]!);
      if (v === Item.None && o.tool === BEST_TOOL && slot === Slot.Tool) continue;
      if (stock[v]! <= 0) {
        if (o.tool !== BEST_TOOL || slot !== Slot.Tool) state.events.push({ player: e.owner[i]!, kind: 'speech', text: `That ${itemSpec(v).name.toLowerCase()} is gone!`, x: e.x[i]!, z: e.z[i]! });
        continue;
      }
      stock[v] = stock[v]! - 1;
      if (slot !== Slot.Tool || o.tool !== BEST_TOOL) e.picked[i] = e.picked[i]! | (1 << slot);
    }
    wear(state, i, slot, v);
  }
  o.reserved = 0;
  refill(state, i);
  return true;
}

/** Marks a worker's tool slot "the best tool in stock when it arrives". */
export const BEST_TOOL = 254;

function bestToolInStock(state: SimState, player: number, current: number): number {
  const stock = state.players[player]!.items;
  let best = 0;
  let bestTier = itemSpec(toolItem(current)).tier;
  for (const it of ITEMS) {
    if (it.slot !== Slot.Tool || !it.tool || stock[it.id]! <= 0) continue;
    if (it.tier > bestTier) {
      best = it.id;
      bestTier = it.tier;
    }
  }
  return best;
}

/** Fills a quiver from the arrows in stock, and a sling from the stone pool, at a main base. */
export function refill(state: SimState, i: number): void {
  const e = state.entities;
  const p = state.players[e.owner[i]!]!;
  const id = e.ranged[i]!;
  if (!id) return;
  const r = itemSpec(id).ranged!;
  if (r.munition === 'arrows') {
    if (e.ammo[i]! >= r.load) return;
    // The same arrows first, else the best tips in stock.
    let kind = e.ammoItem[i]!;
    if (!kind || (e.ammo[i] === 0 && p.items[kind]! <= 0)) kind = p.items[Item.ArrowsFire]! > 0 ? Item.ArrowsFire : Item.ArrowsFlint;
    if (e.ammo[i]! > 0 && kind !== e.ammoItem[i]) return;
    const take = Math.min(r.load - e.ammo[i]!, p.items[kind]!);
    if (take <= 0) return;
    p.items[kind] = p.items[kind]! - take;
    e.ammo[i] = e.ammo[i]! + take;
    e.ammoItem[i] = kind;
  } else if (r.munition === 'stone') {
    if (e.ammo[i]! > 0 || p.pool[Res.Stone]! <= 0) return;
    p.pool[Res.Stone] = p.pool[Res.Stone]! - 1;
    e.ammo[i] = r.load;
  }
}

/** Tier, then damage (or block or armour), for comparing two items of a slot. */
function score(it: ItemSpec): number {
  const strength = it.melee?.damage ?? it.ranged?.damage ?? it.blockBp ?? it.armourBp ?? 0;
  return it.tier * 100000 + strength;
}

function better(a: number, b: number): boolean {
  if (!a) return false;
  if (!b) return true;
  return score(itemSpec(a)) > score(itemSpec(b));
}

/** The best item in stock for a slot that a unit can use and that beats what it has, or 0. */
function bestFor(state: SimState, i: number, slot: number, filter: (it: ItemSpec) => boolean, current: number): number {
  const stock = state.players[state.entities.owner[i]!]!.items;
  let best = 0;
  for (const it of ITEMS) {
    if (it.id === Item.None || it.slot !== slot || stock[it.id]! <= 0 || !filter(it)) continue;
    if (better(it.id, best || current) && (best === 0 || better(it.id, best))) best = it.id;
  }
  return best;
}

/**
 * Equip Best (Q) on some units: the most capable first (highest rank, then
 * the lowest id), each gets the best item in stock it can use for every
 * slot not chosen by hand. Items are taken from the stock now. Each unit
 * with something to collect walks to the nearest main base, then carries on.
 */
export function equipBest(state: SimState, player: number, units: readonly number[]): number {
  const e = state.entities;
  const order = [...units].sort((a, b) => e.rank[b]! - e.rank[a]! || e.id[a]! - e.id[b]!);
  const stock = state.players[player]!.items;
  let sent = 0;
  for (const i of order) {
    const base = nearestMainBase(state, i);
    if (!base) {
      state.events.push({ player, kind: 'alert', text: 'There is no main base to collect equipment at.' });
      return sent;
    }
    const o = emptyEquip(base.id);
    const pending = e.queue[i]!.find((q) => q.t === 'equip') as EquipOrder | undefined;
    const has = (slot: number): number => {
      const v = pending ? (pending[SLOT_FIELD[slot]!] as number) : KEEP;
      return v !== KEEP && v !== BEST_TOOL ? v : wornIn(state, i, slot);
    };
    const free = (slot: number): boolean => (e.picked[i]! & (1 << slot)) === 0;
    const take = (slot: number, item: number): void => {
      if (!item) return;
      stock[item] = stock[item]! - 1;
      (o as unknown as Record<string, number>)[SLOT_FIELD[slot]!] = item;
      o.reserved |= 1 << slot;
    };
    if (e.kind[i] === UnitKind.Worker) {
      // Workers' tools: first come, first served at the main base.
      if (free(Slot.Tool) && bestToolInStock(state, player, e.tool[i]!)) o.tool = BEST_TOOL;
    } else {
      if (free(Slot.Weapon)) take(Slot.Weapon, bestFor(state, i, Slot.Weapon, (it) => !!it.melee, has(Slot.Weapon)));
      const primary = o.weapon !== KEEP ? o.weapon : has(Slot.Weapon);
      const polearm = primary ? (itemSpec(primary).melee?.min ?? 0) > 0 : false;
      // A polearm's backup is the best one-handed weapon; a one-handed fighter takes a shield instead.
      if (polearm && free(Slot.Backup)) take(Slot.Backup, bestFor(state, i, Slot.Weapon, (it) => !!it.melee?.oneHanded, has(Slot.Backup)));
      if (!polearm && free(Slot.Shield)) take(Slot.Shield, bestFor(state, i, Slot.Shield, () => true, has(Slot.Shield)));
      const archer = (e.skills[i]! & SKILL_ARCHERY) !== 0;
      if (free(Slot.Ranged)) {
        const current = has(Slot.Ranged);
        // A thrown-out bundle of javelins is replaced like an empty hand.
        take(Slot.Ranged, bestFor(state, i, Slot.Ranged, (it) => !it.ranged!.needsArchery || archer, current));
      }
    }
    if (free(Slot.Boots)) take(Slot.Boots, bestFor(state, i, Slot.Boots, () => true, has(Slot.Boots)));
    const anything = o.reserved !== 0 || o.tool === BEST_TOOL;
    const quiver = e.ranged[i] === Item.Bow && e.ammo[i]! < itemSpec(Item.Bow).ranged!.load && (stock[Item.ArrowsFlint]! > 0 || stock[Item.ArrowsFire]! > 0);
    if (!anything && !quiver) continue;
    if (pending) {
      // Already on its way: fold the new picks into that trip.
      for (const slot of SLOTS) {
        const f = SLOT_FIELD[slot]!;
        const v = o[f] as number;
        if (v === KEEP) continue;
        const old = pending[f] as number;
        if (old !== KEEP && old !== BEST_TOOL && (pending.reserved & (1 << slot)) !== 0) stock[old] = stock[old]! + 1;
        (pending as unknown as Record<string, number>)[f] = v;
        if ((o.reserved & (1 << slot)) !== 0) pending.reserved |= 1 << slot;
      }
    } else {
      collect(state, i, o);
    }
    sent++;
  }
  return sent;
}

/** Sends a unit to collect gear in front of whatever it was doing. */
export function collect(state: SimState, i: number, o: EquipOrder): void {
  const e = state.entities;
  e.queue[i]!.unshift(o);
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  e.target[i] = 0;
  resetWalk(state, i);
}

/**
 * Choosing by hand (I): one item for one slot of one unit (0 takes the slot
 * off). It is not reserved: if it is gone by the time the unit arrives, the
 * unit says so.
 */
export function handPick(state: SimState, i: number, slot: number, item: number): void {
  const e = state.entities;
  const base = nearestMainBase(state, i);
  if (!base) {
    state.events.push({ player: e.owner[i]!, kind: 'alert', text: 'There is no main base to collect equipment at.' });
    return;
  }
  if (item && itemSpec(item).slot !== (slot === Slot.Backup ? Slot.Weapon : slot)) return;
  if (slot === Slot.Backup && item && !itemSpec(item).melee?.oneHanded) return;
  const pending = e.queue[i]!.find((q) => q.t === 'equip') as EquipOrder | undefined;
  const o = pending ?? emptyEquip(base.id);
  const f = SLOT_FIELD[slot]!;
  if (pending && (pending.reserved & (1 << slot)) !== 0) {
    const old = pending[f] as number;
    if (old && old !== KEEP) state.players[e.owner[i]!]!.items[old]! += 1;
    pending.reserved &= ~(1 << slot);
  }
  (o as unknown as Record<string, number>)[f] = item;
  if (item === 0) e.picked[i] = e.picked[i]! | (1 << slot);
  if (!pending) collect(state, i, o);
}

/**
 * Every 5 s: units next to their main base top up their quivers and slings,
 * and by day, with Auto-Equip on, idle units within 45 m of a main base get
 * the best gear in stock.
 */
export function updateGear(state: SimState): void {
  if (state.step % GEAR_CHECK_STEPS !== 0) return;
  const e = state.entities;
  const day = !isDark(state.step);
  const auto: number[][] = state.players.map(() => []);
  const r2 = AUTO_EQUIP_M * WU_PER_METRE;
  for (let i = 0; i < e.count; i++) {
    const p = e.owner[i]!;
    if (p >= state.players.length || e.inside[i] !== 0 || e.kind[i] === UnitKind.Wanderer || e.kind[i] === UnitKind.Mob) continue;
    const base = nearestMainBase(state, i);
    if (!base) continue;
    const [bx, bz] = buildingCentre(base);
    const d2 = dist2(bx, bz, e.x[i]!, e.z[i]!);
    if (e.ranged[i] && e.target[i] === 0 && edgeGap(base, e.x[i]!, e.z[i]!) <= REFILL_WU) refill(state, i);
    if (day && state.players[p]!.autoEquip && e.queue[i]!.length === 0 && e.target[i] === 0 && d2 <= r2 * r2) auto[p]!.push(i);
  }
  auto.forEach((units, p) => {
    if (units.length > 0) equipBest(state, p, units);
  });
}

/** Distance from a point to a building's solid part, wu. */
function edgeGap(b: Building, x: number, z: number): number {
  const [x0, z0, x1, z1] = solidRect(b);
  const c = WU_PER_COLUMN;
  const dx = x < x0 * c ? x0 * c - x : x > (x1 + 1) * c ? x - (x1 + 1) * c : 0;
  const dz = z < z0 * c ? z0 * c - z : z > (z1 + 1) * c ? z - (z1 + 1) * c : 0;
  return length2d(dx, dz);
}

// ----- specialist training -----

/** Archery at the Barracks (Table 7): the unit goes in, pays 40 food, and comes out trained. */
export function runSkill(state: SimState, i: number, o: Extract<UnitOrder, { t: 'skill' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !b.complete || b.kind !== BuildingKind.Barracks || e.kind[i] !== UnitKind.Warrior) return true;
  if ((e.skills[i]! & SKILL_ARCHERY) !== 0) return true;
  if (e.inside[i] !== b.id) {
    if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
    const r = walkTo(state, i, besideBuilding(b));
    if (r === 0) return false;
    if (r === 2) return true;
    // One warrior trains at a time; the next waits beside the Barracks (s).
    for (let j = 0; j < e.count; j++) {
      if (j !== i && e.inside[j] === b.id && e.queue[j]![0]?.t === 'skill') {
        e.order[i] = OrderKind.Idle;
        return false;
      }
    }
    if ((state.players[b.owner]!.research & 2) === 0) {
      state.events.push({ player: b.owner, kind: 'alert', text: 'Archery needs Flint tools researched first.', x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    if (!payNutrition(state.players[b.owner]!.pool, ARCHERY.food)) {
      state.events.push({ player: b.owner, kind: 'alert', text: `Not enough food to train archery (${ARCHERY.food} food).`, x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    e.inside[i] = b.id;
    const [x, z] = buildingCentre(b);
    e.x[i] = x;
    e.z[i] = z;
    e.act[i] = Act.Inside;
    e.timer[i] = 0;
  }
  e.order[i] = OrderKind.Idle;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < ARCHERY.steps) return false;
  e.skills[i] = e.skills[i]! | SKILL_ARCHERY;
  state.events.push({ player: b.owner, kind: 'info', text: `A warrior has learned archery at the ${buildingName(b.kind, b.level, b.variant).toLowerCase()}.`, x: e.x[i]!, z: e.z[i]! });
  return true;
}
