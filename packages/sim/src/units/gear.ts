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
import { ceilDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { isDark } from '../clock.ts';
import { payNutrition } from '../economy/resources.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { hasResearch, Item, ITEMS, itemSpec, RESEARCH, Research, Skill, Slot, type ItemSpec } from '../combat/items.ts';
import { bestTools, heldTools, putOnTool } from './tools.ts';
import { Act, besideBuilding, resetWalk, walkTo } from './behaviour.ts';
import { KEEP, type UnitOrder } from './unit-orders.ts';
import { Role } from '../threats/types.ts';
import { animalsAt } from '../animals/animals.ts';
import { Species } from '../animals/species.ts';
import { RIDING } from '../mounts/data.ts';

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
  [Slot.Armour]: 'armour',
  [Slot.Helmet]: 'helmet',
  [Slot.Case]: 'boltCase',
  [Slot.Kit]: 'kit',
};
const SLOTS = [Slot.Tool, Slot.Weapon, Slot.Backup, Slot.Ranged, Slot.Shield, Slot.Boots, Slot.Ammo, Slot.Torch, Slot.Armour, Slot.Helmet, Slot.Case, Slot.Kit] as const;

/** Auto-Equip hands out gear to idle units within about a 15 s run of a main base (Equipment): 45 m. */
export const AUTO_EQUIP_M = 45;
/** Auto-Equip and quiver refills are looked at every 5 s (s). */
export const GEAR_CHECK_STEPS = 5 * STEPS_PER_SECOND;
/** A unit this close to its main base's edge refills its quiver or sling stones there (s). */
const REFILL_WU = 4 * WU_PER_METRE;
/** Archery (Table 7): 40 food, 120 s at the Barracks, no research. */
export const ARCHERY = { food: 40, steps: 120 * STEPS_PER_SECOND };
/**
 * Specialist training by skill bit (Table 7): archery and the crossbow (15
 * food, 30 s, after Crossbows) at the Barracks; riding at the Stables with a
 * tamed horse in its stalls; the musket (after Muskets) and cannon crew
 * (after Cannons) at the Gunnery yard.
 */
export const SKILL_TRAINING: Readonly<Record<number, { name: string; food: number; steps: number; research: number; at: number }>> = {
  [Skill.Archery]: { name: 'archery', ...ARCHERY, research: Research.None, at: BuildingKind.Barracks },
  [Skill.Crossbow]: { name: 'the crossbow', food: 15, steps: 30 * STEPS_PER_SECOND, research: Research.Crossbows, at: BuildingKind.Barracks },
  [Skill.Riding]: { name: 'riding', food: RIDING.food, steps: RIDING.steps, research: Research.None, at: BuildingKind.Stables },
  [Skill.Musket]: { name: 'the musket', food: 30, steps: 60 * STEPS_PER_SECOND, research: Research.Muskets, at: BuildingKind.GunneryYard },
  [Skill.Cannon]: { name: 'cannon crew', food: 40, steps: 90 * STEPS_PER_SECOND, research: Research.Cannons, at: BuildingKind.GunneryYard },
};

/** Why a Stables can't teach riding now, or '' (Table 7: a tamed horse in the stalls). */
export function ridingProblem(state: SimState, b: Building): string {
  const e = state.entities;
  return animalsAt(state, b.id).some((j) => e.mob[j] === Species.Horse) ? '' : 'Riding training needs a tamed horse in the Stables.';
}

export function emptyEquip(b: number): EquipOrder {
  return { t: 'equip', b, tool: KEEP, weapon: KEEP, backup: KEEP, ranged: KEEP, shield: KEEP, boots: KEEP, ammo: KEEP, torch: KEEP, armour: KEEP, helmet: KEEP, boltCase: KEEP, kit: KEEP, reserved: 0 };
}

/** What a unit has in a slot now (for tools, the first of its tools by job). */
export function wornIn(state: SimState, i: number, slot: number): number {
  const e = state.entities;
  switch (slot) {
    case Slot.Tool:
      return heldTools(e, i)[0] ?? Item.None;
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
    case Slot.Armour:
      return e.armour[i]!;
    case Slot.Helmet:
      return e.helmet[i]!;
    case Slot.Case:
      return e.boltCase[i]!;
    case Slot.Kit:
      return e.kit[i]!;
  }
  return Item.None;
}

/** Puts an item in a slot, and hands what was there back to the stock. */
function wear(state: SimState, i: number, slot: number, item: number): void {
  const e = state.entities;
  const stock = state.players[e.owner[i]!]!.items;
  // A tool goes into every job it does, and hands in the tools it pushes out.
  if (slot === Slot.Tool) {
    putOnTool(e, i, item, stock);
    return;
  }
  const old = wornIn(state, i, slot);
  // A burning torch and spent arrows are not handed back.
  if (old && slot !== Slot.Torch && slot !== Slot.Ammo) stock[old] = stock[old]! + 1;
  switch (slot) {
    case Slot.Weapon:
      e.weapon[i] = item;
      break;
    case Slot.Backup:
      e.backup[i] = item;
      break;
    case Slot.Ranged: {
      // Arrows left in a quiver, and bolts in a case, go back when the bow or crossbow does.
      if (old && e.ammo[i]! > 0 && e.ammoItem[i]) stock[e.ammoItem[i]!] = stock[e.ammoItem[i]!]! + e.ammo[i]!;
      e.ranged[i] = item;
      e.ammo[i] = 0;
      e.ammoItem[i] = 0;
      if (item && itemSpec(item).ranged!.munition === 'self') e.ammo[i] = itemSpec(item).ranged!.load;
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
    case Slot.Armour:
      e.armour[i] = item;
      break;
    case Slot.Helmet:
      e.helmet[i] = item;
      break;
    case Slot.Case:
      // Bolts left in the case go back with it.
      if (!item && e.ammo[i]! > 0 && e.ammoItem[i] && itemSpec(e.ammoItem[i]!).ammoFor === 'bolts') {
        stock[e.ammoItem[i]!] = stock[e.ammoItem[i]!]! + e.ammo[i]!;
        e.ammo[i] = 0;
        e.ammoItem[i] = 0;
      }
      e.boltCase[i] = item;
      break;
    case Slot.Kit:
      e.kit[i] = item;
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
    const v = o[SLOT_FIELD[slot]!] as number;
    if (v === KEEP) continue;
    // Equip Best's tools: the best for each job still in the stock, first come, first served.
    if (slot === Slot.Tool && v === BEST_TOOL) {
      bestTools(e, i, stock, true);
      continue;
    }
    const reserved = (o.reserved & (1 << slot)) !== 0;
    if (!reserved && v !== 0) {
      // Hand-picked: still in the stock?
      if (stock[v]! <= 0) {
        state.events.push({ player: e.owner[i]!, kind: 'speech', text: `That ${itemSpec(v).name.toLowerCase()} is gone!`, x: e.x[i]!, z: e.z[i]! });
        continue;
      }
      stock[v] = stock[v]! - 1;
      e.picked[i] = e.picked[i]! | (1 << slot);
    }
    wear(state, i, slot, v);
  }
  o.reserved = 0;
  refill(state, i);
  return true;
}

/** Marks a worker's tool slot "the best tools in stock for each job when it arrives". */
export const BEST_TOOL = 254;

/** The best arrows or bolts in stock for a weapon: the highest tip first, poison and fire last (s). */
function bestMunition(stock: Int32Array, kind: 'arrows' | 'bolts'): number {
  let best = 0;
  let bestScore = -1;
  for (const it of ITEMS) {
    if (it.ammoFor !== kind || stock[it.id]! <= 0) continue;
    const sc = it.poison || it.fire ? 0 : 1 + (it.tip ?? 0);
    if (sc > bestScore) {
      best = it.id;
      bestScore = sc;
    }
  }
  return best;
}

/** Fills a quiver or a bolt case from the stock, and a sling from the stone pool, at a main base. */
export function refill(state: SimState, i: number): void {
  const e = state.entities;
  const p = state.players[e.owner[i]!]!;
  const id = e.ranged[i]!;
  if (!id) return;
  const r = itemSpec(id).ranged!;
  if (r.munition === 'arrows' || r.munition === 'bolts') {
    if (e.ammo[i]! >= r.load) return;
    // Bolts are carried in a case (Table 2e).
    if (r.munition === 'bolts' && !e.boltCase[i]) return;
    // The same arrows first, else the best in stock.
    let kind = e.ammoItem[i]!;
    if (!kind || (e.ammo[i] === 0 && p.items[kind]! <= 0)) kind = bestMunition(p.items, r.munition);
    if (!kind || (e.ammo[i]! > 0 && kind !== e.ammoItem[i])) return;
    const take = Math.min(r.load - e.ammo[i]!, p.items[kind]!);
    if (take <= 0) return;
    p.items[kind] = p.items[kind]! - take;
    e.ammo[i] = e.ammo[i]! + take;
    e.ammoItem[i] = kind;
  } else if (r.munition === 'stone') {
    if (e.ammo[i]! > 0 || p.pool[Res.Stone]! <= 0) return;
    p.pool[Res.Stone] = p.pool[Res.Stone]! - 1;
    e.ammo[i] = r.load;
  } else if (r.munition === 'powder') {
    // A musket's charges ride in a powder horn and its balls in a shot pouch (Table 2e): each unit of gunpowder and of lead shot is 10 shots.
    if (e.ammo[i]! >= r.load || e.boltCase[i] !== Item.PowderHorn || e.kit[i] !== Item.ShotPouch) return;
    const units = Math.min(ceilDiv(r.load - e.ammo[i]!, SHOTS_PER_UNIT), p.pool[Res.Gunpowder]!, p.pool[Res.LeadShot]!);
    if (units <= 0) return;
    p.pool[Res.Gunpowder] = p.pool[Res.Gunpowder]! - units;
    p.pool[Res.LeadShot] = p.pool[Res.LeadShot]! - units;
    e.ammo[i] = Math.min(r.load, e.ammo[i]! + units * SHOTS_PER_UNIT);
  }
}

/** Shots in one gunpowder (10 charges) and one lead shot (10 balls) (Table 12). */
export const SHOTS_PER_UNIT = 10;

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

/** What a mage may wear (Table 1: leather at most): boots, leather armour and a leather cap. */
export function mageWears(it: ItemSpec): boolean {
  return (it.slot === Slot.Boots || it.slot === Slot.Armour || it.slot === Slot.Helmet) && it.tier <= 2;
}

/**
 * Equip Best (Q) on some units: the most capable first (highest rank, then
 * the lowest id), each gets the best item in stock it can use for every
 * slot not chosen by hand. Items are taken from the stock now. Each unit
 * with something to collect walks to the nearest main base, then carries on.
 */
export function equipBest(state: SimState, player: number, units: readonly number[]): number {
  const e = state.entities;
  // Mercenaries bring their own gear (Table 11): Equip Best passes them by.
  const order = units.filter((i) => e.role[i] !== Role.Mercenary).sort((a, b) => e.rank[b]! - e.rank[a]! || e.id[a]! - e.id[b]!);
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
      if (free(Slot.Tool) && bestTools(e, i, stock, false) > 0) o.tool = BEST_TOOL;
    } else if (e.kind[i] === UnitKind.Mage) {
      // Mages keep their wands and wear leather at most (Table 1).
      if (free(Slot.Armour)) take(Slot.Armour, bestFor(state, i, Slot.Armour, mageWears, has(Slot.Armour)));
      if (free(Slot.Helmet)) take(Slot.Helmet, bestFor(state, i, Slot.Helmet, mageWears, has(Slot.Helmet)));
    } else {
      if (free(Slot.Weapon)) take(Slot.Weapon, bestFor(state, i, Slot.Weapon, (it) => !!it.melee && !it.wand, has(Slot.Weapon)));
      const primary = o.weapon !== KEEP ? o.weapon : has(Slot.Weapon);
      const polearm = primary ? (itemSpec(primary).melee?.min ?? 0) > 0 : false;
      // A polearm's backup is the best one-handed weapon; a one-handed fighter takes a shield instead.
      if (polearm && free(Slot.Backup)) take(Slot.Backup, bestFor(state, i, Slot.Weapon, (it) => !!it.melee?.oneHanded && !it.wand, has(Slot.Backup)));
      if (!polearm && free(Slot.Shield)) take(Slot.Shield, bestFor(state, i, Slot.Shield, () => true, has(Slot.Shield)));
      if (free(Slot.Ranged)) {
        const current = has(Slot.Ranged);
        // A thrown-out bundle of javelins is replaced like an empty hand.
        take(Slot.Ranged, bestFor(state, i, Slot.Ranged, (it) => (e.skills[i]! & it.ranged!.skill) === it.ranged!.skill, current));
      }
      // A crossbow's bolts ride in a case; a musket's charges in a powder horn and its balls in a shot pouch.
      const shoots = o.ranged !== KEEP ? o.ranged : has(Slot.Ranged);
      const munition = shoots ? itemSpec(shoots).ranged?.munition : undefined;
      const holder = munition === 'bolts' ? Item.BoltCase : munition === 'powder' ? Item.PowderHorn : Item.None;
      if (holder && has(Slot.Case) !== holder && free(Slot.Case)) take(Slot.Case, bestFor(state, i, Slot.Case, (it) => it.id === holder, 0));
      if (munition === 'powder' && has(Slot.Kit) !== Item.ShotPouch && free(Slot.Kit)) take(Slot.Kit, bestFor(state, i, Slot.Kit, (it) => it.id === Item.ShotPouch, 0));
      if (free(Slot.Armour)) take(Slot.Armour, bestFor(state, i, Slot.Armour, () => true, has(Slot.Armour)));
      if (free(Slot.Helmet)) take(Slot.Helmet, bestFor(state, i, Slot.Helmet, () => true, has(Slot.Helmet)));
    }
    if (free(Slot.Boots)) take(Slot.Boots, bestFor(state, i, Slot.Boots, () => true, has(Slot.Boots)));
    const anything = o.reserved !== 0 || o.tool === BEST_TOOL;
    const shooter = e.ranged[i] ? itemSpec(e.ranged[i]!).ranged! : null;
    const quiver = !!shooter && (shooter.munition === 'arrows' || shooter.munition === 'bolts') && e.ammo[i]! < shooter.load && bestMunition(stock, shooter.munition) !== 0;
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
  if (e.role[i] === Role.Mercenary) return;
  const base = nearestMainBase(state, i);
  if (!base) {
    state.events.push({ player: e.owner[i]!, kind: 'alert', text: 'There is no main base to collect equipment at.' });
    return;
  }
  if (item && itemSpec(item).slot !== (slot === Slot.Backup ? Slot.Weapon : slot)) return;
  // Wands are for mages, who wear nothing heavier than leather and keep the wand they trained with.
  if (item && itemSpec(item).wand && e.kind[i] !== UnitKind.Mage) return;
  if (e.kind[i] === UnitKind.Mage && slot !== Slot.Torch && (item ? !mageWears(itemSpec(item)) : slot !== Slot.Boots && slot !== Slot.Armour && slot !== Slot.Helmet)) return;
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
  const day = !isDark(state.step, state.blood);
  const auto: number[][] = state.players.map(() => []);
  const r2 = AUTO_EQUIP_M * WU_PER_METRE;
  for (let i = 0; i < e.count; i++) {
    const p = e.owner[i]!;
    if (p >= state.players.length || e.inside[i] !== 0 || e.kind[i] === UnitKind.Wanderer || e.kind[i] === UnitKind.Mob || e.role[i] === Role.Mercenary) continue;
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

/** Specialist training at the Barracks (Table 7): the unit goes in, pays the food, and comes out trained. */
export function runSkill(state: SimState, i: number, o: Extract<UnitOrder, { t: 'skill' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  const t = SKILL_TRAINING[o.skill];
  if (!t || !b || b.owner !== e.owner[i] || !b.complete || b.kind !== t.at || e.kind[i] !== UnitKind.Warrior) return true;
  if ((e.skills[i]! & o.skill) !== 0) return true;
  if (e.inside[i] !== b.id) {
    if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
    const r = walkTo(state, i, besideBuilding(b));
    if (r === 0) return false;
    if (r === 2) return true;
    // One warrior trains at a time; the next waits beside the building (s).
    for (let j = 0; j < e.count; j++) {
      if (j !== i && e.inside[j] === b.id && e.queue[j]![0]?.t === 'skill') {
        e.order[i] = OrderKind.Idle;
        return false;
      }
    }
    const p = state.players[b.owner]!;
    if (!hasResearch(p.research, t.research as Research)) {
      state.events.push({ player: b.owner, kind: 'alert', text: `Training in ${t.name} needs ${RESEARCH[t.research]!.name} researched first.`, x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    const horse = b.kind === BuildingKind.Stables ? ridingProblem(state, b) : '';
    if (horse) {
      state.events.push({ player: b.owner, kind: 'alert', text: horse, x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    if (!payNutrition(p.pool, t.food, p.dontEat)) {
      state.events.push({ player: b.owner, kind: 'alert', text: `Not enough food to train in ${t.name} (${t.food} food).`, x: e.x[i]!, z: e.z[i]! });
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
  if (e.timer[i]! < t.steps) return false;
  e.skills[i] = e.skills[i]! | o.skill;
  state.events.push({ player: b.owner, kind: 'info', text: `A warrior has learned ${t.name} at the ${buildingName(b.kind, b.level, b.variant).toLowerCase()}.`, x: e.x[i]!, z: e.z[i]! });
  return true;
}
