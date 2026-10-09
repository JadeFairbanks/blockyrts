// The debug tools' threats (M5's tester checks): a lair of any kind, a
// goblin village, a tribe's band or a territorial creature at a point, and
// fog now. Also M6's mage tools: a finished Magi Sanctum, two mages' kit
// materials and crystals, and experience for every mage's next rank. And
// M8's: a Barn with horses (the Stables before Patch 2), a siege kit, a gun
// kit, a Citadel, each night mob from night 25 on, Morvath, and a late
// night's wave (what the dark edge's budget buys on nights 30, 50, 85 and
// 105) at once.

import { clockOf, Period } from '../clock.ts';
import { floorDiv, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pickNight } from '../combat/spawn.ts';
import { placeBuilding, refitBuilding, UnitKind, WILD, type SimState } from '../state.ts';
import { BuildingKind, FORGE_STEP_BASE, levelSpec } from '../buildings/data.ts';
import { footprintDims } from '../buildings/footprints.ts';
import { Res } from '../economy/resources.ts';
import { Research } from '../combat/items.ts';
import { addMob } from '../combat/mob-ai.ts';
import { maxHealth } from '../buildings/store.ts';
import { CITADEL_LEVEL, Engine } from '../siege/data.ts';
import { addEngine, addFullCrew } from '../siege/engines.ts';
import { summonBoss } from './boss.ts';
import { BOSS_FIRST_NIGHT } from './types.ts';
import { MAGE_XP_TENTHS, mageGainXp } from '../magic/mages.ts';
import { MAGE_TOP_RANK } from '../magic/spells.ts';
import { addAnimal } from '../animals/animals.ts';
import { Species } from '../animals/species.ts';
import { Mob, mobSpec } from '../combat/mobs.ts';
import { cellAt } from './cells.ts';
import { LAIRS } from './data.ts';
import { addLair, nightNow } from './lairs.ts';
import { startFog } from './nights.ts';
import { spawnBand } from './tribes.ts';
import { buildVillage } from './villages.ts';
import { spreadTop } from '../units/top.ts';

/** The player's first main base, finished at a tier (at least the one it has), its health full and its top manned as that level has it. */
function raiseMainBase(state: SimState, player: number, level: number): void {
  const b = state.buildings.list.find((q) => q.owner === player && q.kind === BuildingKind.MainBase);
  if (!b) return;
  b.level = Math.max(b.level, level);
  b.complete = true;
  b.upgrading = 0;
  b.hp = maxHealth(b);
  refitBuilding(state, b);
  spreadTop(state, b);
}

/** What a debugThreat order makes: lairs 0 to 7 in Table 15's order, then the rest. */
export const DebugThreat = {
  Lair: 0,
  Village: 10,
  Gnolls: 11,
  Kobolds: 12,
  Hobgoblins: 13,
  Fog: 21,
  /** Territorial creatures from 30: beetle, hornet nest, viper, scorpion, griffin, minotaur. */
  Creature: 30,
  /** A finished Magi Sanctum centred on the spot. */
  Sanctum: 40,
  /** The sticks and flax for two new mages' wands and robes, 20 mana crystals for rank-ups, 200 farm fare, and the hexstone and herbs for Hexcraft in the pool. */
  MageKit: 41,
  /** Every one of the player's mages gets the experience for her next rank (and rises to it by herself up to Adept Acolyte). */
  MageXp: 42,
  /** A finished Barn centred on the spot with 2 grown horses and an ox in its stalls, and 100 farm fare (Patch 2: the Stables' tool). */
  Barn: 50,
  /** A catapult, a ballista and a bronze cannon at the spot, each with its full crew of artillery crewmen, a finished Artillery workshop south of them to train more, 100 farm fare, and Siege engines, Gunpowder, Muskets and Cannons researched (Patch 2: no munitions). */
  SiegeKit: 51,
  /** The carbon steel, planks, flint and gunpowder for four musket rangers' kits, and the gun research done (Patch 2: no cannon crew training; artillery crewmen crew cannons). */
  GunKit: 52,
  /** The player's main base becomes a finished Citadel (tier 4) with its engine platform (Patch 5). */
  Citadel: 53,
  /** A finished Barracks and Forge at the spot, the main base raised to tier 3 if lower (the Forge's steel step), the materials of every tier, 300 farm fare, and the research every tier needs (Troops and gear). */
  TroopKit: 54,
  /** A finished Mineshaft centred on the spot and a finished Storehouse beside it, Deep Mining I researched and the main base raised to tier 3 if lower (Patch 2: assign workers and watch them carry their bags). */
  MineKit: 55,
  /** Night mobs from night 25 on, in roster order from 60 (LATE_MOBS). */
  LateMob: 60,
  /** Morvath, the Hollow Crown. */
  Morvath: 90,
  /** The dark edge's wave of one of WAVE_NIGHTS from 91, spawned at the spot now. */
  Wave: 91,
} as const;

/** The nights the debug Wave button shows the budget of. */
export const WAVE_NIGHTS = [30, 50, 85, 105] as const;

/** The night mobs from night 25 on (roster 5.7 to 5.24), in the debug cycler's order. */
export const LATE_MOBS: readonly Mob[] = [
  Mob.BarrowKnight, Mob.PlagueBearer, Mob.Gravewing, Mob.BoneColossus, Mob.HollowPriest, Mob.Cinderling, Mob.Hellhound, Mob.Fiend, Mob.Scorchwing,
  Mob.DemonBrute, Mob.Flamecaller, Mob.ChainFiend, Mob.VoidStalker, Mob.InfernalJuggernaut, Mob.VoidWitch, Mob.AbyssalDrake, Mob.Archfiend, Mob.RiftColossus,
  Mob.RiftScorpion, Mob.RiftCentipede, Mob.RiftHornet, Mob.RiftBeetle, Mob.RiftGriffin, Mob.RiftMinotaur,
];

const CREATURES = [Species.GiantBeetle, Species.GiantHornet, Species.Viper, Species.GiantScorpion, Species.Griffin, Species.Minotaur] as const;
const TRIBE_MOBS = [Mob.Gnoll, Mob.Kobold, Mob.Hobgoblin] as const;

/** The coming night: tonight from day to dusk, else tomorrow's. */
function comingNight(state: SimState): number {
  const c = clockOf(state);
  return c.period === Period.Day || c.period === Period.Dusk ? c.cycle : c.cycle + 1;
}

export function debugThreat(state: SimState, player: number, what: number, x: number, z: number): void {
  if (what >= DebugThreat.Lair && what < DebugThreat.Lair + LAIRS.length) {
    addLair(state, LAIRS[what - DebugThreat.Lair]!, player, x, z, nightNow(state));
    return;
  }
  if (what === DebugThreat.Village) {
    const cell = cellAt(state, x, z);
    buildVillage(state, cell, x, z, state.world.layout.cell(cell).band, 5, true);
    state.threats.checked.add(cell);
    return;
  }
  if (what >= DebugThreat.Gnolls && what <= DebugThreat.Hobgoblins) {
    spawnBand(state, clockOf(state).cycle, { tribe: TRIBE_MOBS[what - DebugThreat.Gnolls]!, x, z });
    return;
  }
  if (what === DebugThreat.Fog) {
    startFog(state, comingNight(state));
    return;
  }
  if (what === DebugThreat.Sanctum) {
    const d = footprintDims(BuildingKind.MagiSanctum, 0);
    placeBuilding(state, player, BuildingKind.MagiSanctum, 0, floorDiv(x, WU_PER_COLUMN) - (d.w >> 1), floorDiv(z, WU_PER_COLUMN) - (d.d >> 1), true);
    return;
  }
  const p = state.players[player];
  if (what === DebugThreat.MageKit && p) {
    // Two new mages' hazel wands and homespun robes, and the crystals for their rank-ups.
    p.pool[Res.Sticks] = p.pool[Res.Sticks]! + 10;
    p.pool[Res.Flax] = p.pool[Res.Flax]! + 6;
    p.pool[Res.ManaCrystal] = p.pool[Res.ManaCrystal]! + 20;
    p.pool[Res.FarmFare] = p.pool[Res.FarmFare]! + 200;
    // What Hexcraft costs at the Sanctum.
    p.pool[Res.Hexstone] = p.pool[Res.Hexstone]! + 6;
    p.pool[Res.Herbs] = p.pool[Res.Herbs]! + 20;
    return;
  }
  if (what === DebugThreat.MageXp) {
    const e = state.entities;
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== player || e.kind[i] !== UnitKind.Mage || e.rank[i]! >= MAGE_TOP_RANK) continue;
      // As if earned in combat: she rises by herself to Adept Acolyte, and is told to train at a Sanctum above that.
      const need = MAGE_XP_TENTHS[e.rank[i]! + 1]! - e.xp[i]!;
      if (need > 0) mageGainXp(state, i, need);
    }
    return;
  }
  if (what === DebugThreat.Barn && p) {
    const d = footprintDims(BuildingKind.Barn, 0);
    const b = placeBuilding(state, player, BuildingKind.Barn, 0, floorDiv(x, WU_PER_COLUMN) - (d.w >> 1), floorDiv(z, WU_PER_COLUMN) - (d.d >> 1), true);
    for (const [species, k2] of [[Species.Horse, 0], [Species.Horse, 1], [Species.Ox, 2]] as const) {
      const h = addAnimal(state, species, player, x + (k2 - 1) * 2 * WU_PER_COLUMN, z + (d.d + 2) * (WU_PER_COLUMN >> 1), 0, k2 & 1);
      state.entities.home[h] = b.id;
    }
    p.pool[Res.FarmFare] = p.pool[Res.FarmFare]! + 100;
    return;
  }
  if (what === DebugThreat.SiegeKit && p) {
    for (const [kind, k2] of [[Engine.Catapult, -1], [Engine.Ballista, 0], [Engine.BronzeCannon, 1]] as const) addFullCrew(state, addEngine(state, player, kind, x + k2 * 5 * WU_PER_COLUMN, z));
    const d = footprintDims(BuildingKind.ArtilleryWorkshop, 0);
    placeBuilding(state, player, BuildingKind.ArtilleryWorkshop, 0, floorDiv(x, WU_PER_COLUMN) - (d.w >> 1), floorDiv(z, WU_PER_COLUMN) + 4, true);
    p.pool[Res.FarmFare] = p.pool[Res.FarmFare]! + 100;
    for (const r of [Research.SiegeEngines, Research.Gunpowder, Research.Muskets, Research.Cannons]) p.research |= 1 << r;
    return;
  }
  if (what === DebugThreat.GunKit && p) {
    // Four musket rangers' kits (Table 2e: a musket takes 1 gunpowder) and the research for them and for cannons.
    for (const [r, n] of [[Res.CarbonSteel, 4], [Res.Planks, 8], [Res.Flint, 4], [Res.Gunpowder, 4]] as const) p.pool[r] = p.pool[r]! + n;
    for (const r of [Research.Steel, Research.CarbonSteel, Research.Gunpowder, Research.Muskets, Research.Cannons]) p.research |= 1 << r;
    return;
  }
  if (what === DebugThreat.TroopKit && p) {
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    const bd = footprintDims(BuildingKind.Barracks, 0);
    placeBuilding(state, player, BuildingKind.Barracks, 0, cx - bd.w - 1, cz - (bd.d >> 1), true);
    placeBuilding(state, player, BuildingKind.Forge, 0, cx + 1, cz - (footprintDims(BuildingKind.Forge, 0).d >> 1), true);
    raiseMainBase(state, player, FORGE_STEP_BASE[FORGE_STEP_BASE.length - 1]!);
    const stock: ReadonlyArray<readonly [Res, number]> = [
      [Res.CopperIngot, 20], [Res.BronzeIngot, 20], [Res.WroughtIron, 20], [Res.IronIngot, 20], [Res.SteelIngot, 20], [Res.CarbonSteel, 20],
      [Res.Leather, 40], [Res.HardenedLeather, 20], [Res.Flax, 20], [Res.Rope, 10], [Res.Feathers, 20], [Res.Gunpowder, 20],
      [Res.Planks, 30], [Res.HardwoodLumber, 30], [Res.Flint, 20], [Res.Sticks, 40], [Res.FarmFare, 300],
    ];
    for (const [r, n] of stock) p.pool[r] = p.pool[r]! + n;
    for (const r of [Research.Bronze, Research.Steel, Research.CarbonSteel, Research.Crossbows, Research.Gunpowder, Research.Muskets]) p.research |= 1 << r;
    return;
  }
  if (what === DebugThreat.MineKit && p) {
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    const md = footprintDims(BuildingKind.Mineshaft, 0);
    placeBuilding(state, player, BuildingKind.Mineshaft, 0, cx - (md.w >> 1), cz - (md.d >> 1), true);
    placeBuilding(state, player, BuildingKind.Storehouse, 0, cx + (md.w >> 1) + 4, cz - (footprintDims(BuildingKind.Storehouse, 0).d >> 1), true);
    raiseMainBase(state, player, levelSpec(BuildingKind.Mineshaft, 1).needsBase);
    p.research |= 1 << Research.DeepMining1;
    return;
  }
  if (what === DebugThreat.Citadel) {
    raiseMainBase(state, player, CITADEL_LEVEL);
    return;
  }
  const late = what - DebugThreat.LateMob;
  if (late >= 0 && late < LATE_MOBS.length) {
    const mob = LATE_MOBS[late]!;
    addMob(state, mob, player, x, z, Math.max(nightNow(state), mobSpec(mob).firstNight));
    return;
  }
  const wave = what - DebugThreat.Wave;
  if (wave >= 0 && wave < WAVE_NIGHTS.length) {
    const night = WAVE_NIGHTS[wave]!;
    const mobs = pickNight(state, night);
    mobs.forEach((mob, q) => addMob(state, mob, player, x + ((q % 8) - 4) * 2 * WU_PER_METRE, z + (floorDiv(q, 8) - 2) * 2 * WU_PER_METRE, night));
    const count = new Map<number, number>();
    for (const m of mobs) count.set(m, (count.get(m) ?? 0) + 1);
    const list = [...count].map(([m, n]) => `${n} ${mobSpec(m).name.toLowerCase()}`).join(', ');
    state.events.push({ player, kind: 'info', text: `Night ${night}'s wave: ${list}.`, x, z });
    return;
  }
  if (what === DebugThreat.Morvath) {
    summonBoss(state, player, x, z, Math.max(nightNow(state), BOSS_FIRST_NIGHT));
    return;
  }
  const k = what - DebugThreat.Creature;
  if (k >= 0 && k < CREATURES.length) {
    const species = CREATURES[k]!;
    const n = species === Species.GiantHornet ? 4 : 1;
    for (let q = 0; q < n; q++) addAnimal(state, species, WILD, x + q * 6000, z, 0, q & 1);
  }
}
