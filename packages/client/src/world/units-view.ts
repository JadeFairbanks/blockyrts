// The people and monsters on screen (Unit models; Seeing equipment; Hit
// feedback; Combat): workers and warriors on Jade's bodies with every piece of
// their kit drawn at its tier (Patch 5, Jade: "no invisible equippable gear"):
// the weapon in hand and the other carried, shield, armour worn on the body,
// helmet, quiver or bolt case, a worker's tool for the job in hand and the
// rest of its kit hung on it, what it carries and its cart, and from rank 2
// the rank's bands on the left arm. Each task plays
// its own clip. Every night mob is on its catalogue model with the gear it is
// made with (a coloured block until the model is in the library); the
// injured and death clips, arrows, stones and webs in flight, and the little
// bursts of blood, bone, slime, splinters and dust when something is hit.
// Mages wear their school's robe at its tier (battle blue to red, support
// green to white) once it is in the library, hold their wand, play the clip
// of the spell they cast, hold a beam on a target, and at the top rank wear a
// halo: flames for battle, sparkling light for support.
// Riders sit on their mount's model at its rider slot, siege engines and
// cannons stand on their own models (a cannon in a Citadel's port on the
// roof), the Rift-touched beasts shed violet motes and a cloaked void
// stalker shows only as a shimmer. The models take the fog of war like the
// land (remembered lairs and huts darkened), and the local player's own
// units carry their ids for the hidden-unit outlines (Jade's Patch 3,
// hidden-outlines.ts). Jade's Patch 5: Morvath takes flight with his own
// clips and drains the life round him in white motes, his staff's blow
// bursts violet, the necromancer flies his crimson bolt and raises his dead
// in crimson, and a mana crystal's guardians pulse with thin blue light.
import * as THREE from 'three';
import { engineSpec, gearSpec, HOP_STEPS, MAGE_TOP_RANK, MEATS, Mob, MOBS, mobSpec, Moves, mountSpec, NEUTRAL, PEOPLES, peopleUnitSpec, NO_CARRY, OrderKind, PISTOL_GEAR, PROSPECT_TOOL_TIER, Res, RESOURCES, Role, School, Shot, SHOTS, Slot, Species, speciesSpec, Spell, SPELLS, ToolJob, TRINKET_BASE, Troop, UnitKind, WOODS, WU_PER_METRE, type HitEvent } from '@blockyrts/sim';
import { S, SHOT_STRIDE, STATE_STRIDE, Task, UnitFlag, type StateMessage } from '../messages.ts';
import { InstancedModel, MarkMode, useTeamKey, type ModelData, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import { Crescents, DreadnoughtLooks, DREADNOUGHT_M, DREADNOUGHT_MODEL, DREADNOUGHT_PARTS, isDreadnoughtRow } from './dreadnought-look.ts';
import { fowPatch, type FowUniforms } from './fog-material.ts';
import type { OwnDraw } from './hidden-outlines.ts';
import { SpellFx, wandTip } from './spell-fx.ts';
import { Hearts } from './hearts.ts';

const STEP_MS = 50;
const MAX_UNITS = 2048;
const MAX_SHOTS = 1024;
const MAX_PARTICLES = 3000;
const MAX_SMOKE = 1500;
const MAX_ATTACH = 2048;
/** Glowing bits of the top mages' halos. */
const MAX_HALO_BITS = 1024;
const HALO_BITS = 10;
/** How long the dead lie before they sink away, and how long sinking takes, seconds. */
const CORPSE_LIE_S = 4;
const CORPSE_SINK_S = 2;

/** A worker's clip at its work (Task): each its own (Patch 5, Jade's improved worker; a fisher's is timed in workerLook). */
const TASK_CLIPS: Readonly<Record<number, string>> = {
  [Task.Chop]: 'chop',
  [Task.Mine]: 'mine',
  [Task.Gather]: 'gather',
  [Task.Fish]: 'fish_wait',
  [Task.Butcher]: 'harvest',
  [Task.Field]: 'hoe',
  [Task.Clear]: 'gather',
  [Task.Build]: 'build',
  [Task.Relight]: 'light_torch',
  [Task.Prospect]: 'prospect',
  [Task.Dig]: 'dig',
  [Task.Tame]: 'tame',
};

/** A fisher casts, then waits for a bite: one fish every 10 s with any tool kit (Table 2c). */
const FISH_CYCLE_S = 10;

/** How a piece hangs from its slot: as made (in hand, on the arm, on the head), stowed on the back, or at the hip. */
const Stow = { None: 0, Back: 1, Hip: 2 } as const;

/** What a unit wears and carries: parts of its body, catalogue models at slot bones (and how), worn pieces posed by its skeleton; and its clip. */
interface Look {
  parts: string[];
  attach: Array<[string, string, number]>;
  worn: string[];
  clip: string;
  /** Seconds into the clip, where the look times it itself (a fisher's cast, a crewman's drill, a reload). */
  t?: number;
}

/** The first catalogue model of a gear id ('' for none). */
const gearModel = (id: number): string => piecesOf(id)[0] ?? '';
/** Whether a gear id is held like a polearm, in both hands: spears, pikes, halberds and the Zweihänder (the tier 8 two-handed weapon). */
const polearm = (id: number): boolean => /^(spear|pike|halberd|zweihander)/.test(gearModel(id));
/** Two-handed weapons that swing rather than thrust: the halberds and the Zweihänder. */
const SWUNG = /^(halberd|zweihander)/;

const PIECES = new Map<number, readonly string[]>();
/** A gear id's catalogue models: its model ids joined by '+' in units/kits.ts (armour with its helmet and boots), each `<id>` or `<id>@<metal>`. */
function piecesOf(id: number): readonly string[] {
  let p = PIECES.get(id);
  if (!p) {
    p = id ? gearSpec(id).model.split('+').filter((m) => m !== '') : [];
    PIECES.set(id, p);
  }
  return p;
}

/**
 * Kit pieces Jade's improved bodies carry as parts of their own, which her
 * clips move: drawn as the part when held, the catalogue model otherwise.
 */
const BODY_PROPS: Readonly<Record<string, string>> = {
  spear_flint: 'flint_spear',
  sling: 'sling',
  bow: 'bow',
  musket: 'musket',
  'sword_short@bronze': 'bronze_sword',
  shield_wood: 'wood_shield',
  quiver: 'quiver',
  bolt_case: 'bolt_case',
  linstock: 'linstock',
  axe_hardwood: 'hardwood_axe',
  'hoe@hardwood': 'hoe',
  hammer_iron: 'hammer',
  fishing_rod: 'fishing_rod',
  spade: 'spade',
};

/** Armour and boots: worn on the body, posed by its skeleton. */
const WORN = /^(armour_|boots)/;

/** The slot bone a catalogue piece hangs from as made: shields on the left arm, helmets and hats on the head, bows and pistols in the left hand, a quiver and a bolt case where they hang, the rest in the right hand. */
function slotOf(piece: string): string {
  if (piece.startsWith('shield_')) return 'slot_shield_l';
  if (piece.startsWith('helmet_') || piece.endsWith('_hat')) return 'slot_head';
  if (/^(bow|pistol)/.test(piece)) return 'slot_hand_l';
  if (piece === 'quiver') return 'slot_quiver';
  if (piece === 'bolt_case') return 'slot_hip_r';
  return 'slot_hand_r';
}

/** Puts a kit piece on a look: armour worn on the body, Jade's own part where her body holds one, else the catalogue model at its slot or stowed at `slot`. */
function wear(look: Look, piece: string, parts: readonly string[], stow: number = Stow.None, slot = ''): void {
  if (WORN.test(piece)) {
    look.worn.push(piece);
    return;
  }
  const part = BODY_PROPS[piece];
  if (stow === Stow.None && part && parts.includes(part)) {
    look.parts.push(part);
    return;
  }
  look.attach.push([piece, slot || (stow === Stow.Back ? 'slot_back' : stow === Stow.Hip ? 'slot_hip_r' : slotOf(piece)), stow]);
}

/** Long pieces stowed point up (polearms, bows and guns); the rest hilt up, blade down. */
const POINT_UP = /^(spear|pike|halberd|bow|crossbow|musket)/;
/** A stowed piece's turn from how it is held, by Stow and whether it points up: slanted across the back, straight down at the hip. */
const STOW_TURN: Readonly<Record<string, THREE.Matrix4>> = {
  [`${Stow.Back}up`]: new THREE.Matrix4().makeRotationZ(0.45).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)),
  [`${Stow.Back}down`]: new THREE.Matrix4().makeTranslation(0, 0.28, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.45)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
  [`${Stow.Hip}up`]: new THREE.Matrix4().makeRotationX(-Math.PI / 2),
  [`${Stow.Hip}down`]: new THREE.Matrix4().makeRotationX(-Math.PI / 2),
};

/** The prospecting hammer of a tool kit tier from PROSPECT_TOOL_TIER (copper; it prospects twice as fast), by its metal's look where the catalogue has one. */
const PROSPECT_HAMMERS: readonly string[] = ['', '', '', 'prospecting_hammer', 'prospecting_hammer', 'prospecting_hammer@iron_wrought', 'prospecting_hammer@iron_refined', 'prospecting_hammer@iron_refined', 'prospecting_hammer@iron_refined'];

/** A carried good's catalogue model by Res. */
const GOODS: Partial<Record<number, string>> = {
  [Res.FarmFare]: 'farm_fare',
  [Res.SoftwoodLumber]: 'log_softwood',
  [Res.HardwoodLumber]: 'log_hardwood',
  [Res.Herbs]: 'herb_bundle',
  [Res.BlackBerries]: 'black_berries',
  [Res.Raspberries]: 'raspberries',
  [Res.Blueberries]: 'blueberries',
  [Res.Mushrooms]: 'mushroom',
  [Res.MoonRose]: 'moon_rose',
  [Res.Stone]: 'stone_chunk',
  [Res.Flint]: 'flint_nodule',
  [Res.Obsidian]: 'obsidian',
  [Res.Coal]: 'coal_lump',
  [Res.Leather]: 'leather_folded',
  [Res.HardenedLeather]: 'leather_folded',
  [Res.Trout]: 'fish_carried',
  [Res.Salmon]: 'fish_carried_salmon',
  [Res.Catfish]: 'fish_carried_catfish',
  [Res.CopperOre]: 'ore_copper',
  [Res.TinOre]: 'ore_tin',
  [Res.CopperIngot]: 'ingot_copper',
  [Res.TinIngot]: 'ingot_tin',
  [Res.BronzeIngot]: 'ingot_bronze',
  [Res.BogIron]: 'ore_bog_iron',
  [Res.IronRock]: 'ore_iron_rock',
  [Res.VeinIron]: 'ore_vein_iron',
  [Res.PigIron]: 'ingot_pig_iron',
  [Res.IronIngot]: 'ingot_iron',
  [Res.WroughtIron]: 'ingot_iron',
  [Res.SteelIngot]: 'ingot_steel',
  [Res.CarbonSteel]: 'ingot_hq_steel',
  [Res.Eggs]: 'egg_basket',
  [Res.Feathers]: 'feather_bundle',
  [Res.Gold]: 'gold_nugget',
  [Res.Emeralds]: 'gem_emerald',
  [Res.Rubies]: 'gem_ruby',
  [Res.Diamonds]: 'gem_diamond',
  [Res.Silver]: 'ore_silver',
  [Res.Marble]: 'marble_block',
  [Res.Bluestone]: 'bluestone',
  [Res.Earth]: 'earth_sack',
  [Res.Sticks]: 'sticks_bundle',
  [Res.Clay]: 'clay_lump',
  [Res.Sand]: 'sand_sack',
  [Res.Charcoal]: 'charcoal_sack',
  [Res.Saltpetre]: 'saltpetre_lump',
  [Res.Sulphur]: 'sulphur_lump',
  [Res.Flax]: 'flax_bundle',
  [Res.Hides]: 'hide_rolled',
  [Res.Bone]: 'bone_bundle',
  [Res.Resin]: 'resin_pot',
  [Res.SpiderSilk]: 'spider_silk',
  [Res.DemonHorn]: 'demon_horn',
  [Res.Hexstone]: 'hexstone',
  [Res.Venom]: 'venom_vial',
  [Res.LeadOre]: 'ore_lead',
  [Res.ManaCrystal]: 'mana_crystal',
  [Res.Planks]: 'planks',
  [Res.Bricks]: 'bricks',
  [Res.Glass]: 'glass_bottle',
  [Res.Rope]: 'rope_coil',
  [Res.Gunpowder]: 'gunpowder_keg',
  [Res.Bandage]: 'bandage_roll',
  [Res.Remedy]: 'healing_remedy',
  [Res.Moonleaf]: 'trinket_moonleaf',
  [Res.Sunheart]: 'trinket_sunheart',
};
for (const m of MEATS) GOODS[m] = 'meat_haunch';
/** A metal trinket's model by its tier, and its metal's look, in Res order (resources.ts TRINKET_BASE). */
const TRINKET_KINDS = ['token', 'charm', 'brooch', 'heirloom'];
const TRINKET_METALS = ['copper', 'tin', 'bronze', 'iron', 'steel', 'silver', 'gold'];

/** The catalogue model a carried good is drawn with, '' for none. */
function goodsModel(res: number): string {
  const k = res - TRINKET_BASE;
  if (k >= 0 && k < TRINKET_KINDS.length * TRINKET_METALS.length) return `trinket_${TRINKET_KINDS[k % 4]}@${TRINKET_METALS[Math.floor(k / 4)]}`;
  return GOODS[res] ?? '';
}

/** How a carried good is held, by its model's shape: a long one (a log, planks, a bundle of sticks) on the right shoulder, one that hangs from its origin (a basket, a fish) in the hand, the rest in both arms in front. */
type Hold = 'shoulder' | 'hand' | 'arms';
function holdOf(m: ModelData): Hold {
  const b = m.boundingBox;
  if (b.max.z - b.min.z > 0.8) return 'shoulder';
  if (b.max.y < 0.05 && b.min.y < -0.15) return 'hand';
  return 'arms';
}
const HOLD_SLOTS: Readonly<Record<Hold, string>> = { shoulder: 'slot_shoulder_r', hand: 'slot_hand_l', arms: 'slot_carry' };

/** How far ahead of its worker a hand cart goes (the cart's crew slot, behind its grips), metres; and how far an ox cart's hitch is ahead of its middle. */
const HAND_CART_AHEAD_M = 1.1;
const OX_CART_HITCH_M = 3.69;

/** Colour of a monster's stand-in block: the night mobs, then (14 on) the lair guardians, the tribes, the village goblins, the lairs and the village's buildings. */
const MOB_COLOURS = [
  0x6a7a5a, 0x3a3040, 0x6a5a4a, 0x2a2a2a, 0x7ac040, 0x9ad060, 0xd8d0b8, 0x8a9a6a, 0xc8c0a8, 0x5a3a20, 0x4a7a3a, 0x5a8a4a, 0x3a6a2a, 0x4a4a5a,
  0x8a3a20, 0xc8a8d0, 0x3a2a24, 0x6a9ad8, 0xa8885a, 0x7a8a3a, 0xa04a2a, 0x5a8a3a, 0x4a7a32, 0x6a4a8a,
  0x7a7a68, 0x4a4440, 0xd8d8d0, 0x5a4a3a, 0x6a5030, 0x5a5a50, 0x8a2a1a, 0x3a1a4a, 0x7a6038, 0x3a3030, 0x8a6a3a,
  // The peoples' buildings: Halfling burrow, mill, inn, barn; Runkin tent, drying rack, wolf den, fire;
  // Elf hall, tree platform, bear pen, gate, caravan wagon; Dwarf house, forge, mineshaft, hall, city gate.
  0x7a9a4a, 0xc8b890, 0xa0703a, 0x9a3a2a, 0x9a8060, 0x8a6a40, 0x5a4a38, 0xe08a30,
  0xd8d0a0, 0x7a9a6a, 0x6a5a3a, 0x8ab070, 0xb89058, 0x8a8a90, 0x6a6a70, 0x4a4a50, 0xa0a0a8, 0x5a5a60,
];

/** Each people's colour, for their units until their models are in (Halflings, Runkin, Elves, Dwarves). */
const PEOPLE_COLOURS = [new THREE.Color(0x8ac850), new THREE.Color(0xb08050), new THREE.Color(0x50c0a8), new THREE.Color(0xa8a8b8)];


/** Colour of an animal's stand-in block, by Species (14 on: the territorial creatures). */
const ANIMAL_COLOURS = [
  0x6a4a30, 0xe8e0d0, 0x7a5030, 0x5a4030, 0xb09070, 0x9a6a3a, 0x4a3a30, 0x7a7a80, 0xc09a60, 0x6a9a40, 0x4a5a30, 0xc05030, 0x5a5a5a, 0x4a3020,
  0x2a3a4a, 0xd8b030, 0x6a7a30, 0x9a6a2a, 0xc8a050, 0x5a3020,
];

/** Particle colours and counts by hit look. */
const HIT_LOOKS: Record<string, { colour: number; n: number; speed: number; up: number }> = {
  blood: { colour: 0x8a1010, n: 6, speed: 1.6, up: 1.5 },
  bone: { colour: 0xe8e0c8, n: 6, speed: 1.8, up: 1.6 },
  slime: { colour: 0x7ac040, n: 7, speed: 1.4, up: 1.4 },
  wood: { colour: 0x8a5a2a, n: 5, speed: 1.6, up: 1.4 },
  stone: { colour: 0x9a9a94, n: 5, speed: 1.6, up: 1.8 },
  spark: { colour: 0xffd040, n: 5, speed: 2.4, up: 1.6 },
  shake: { colour: 0x4a7a3a, n: 3, speed: 0.6, up: 0.4 },
  burst: { colour: 0x6a8a30, n: 24, speed: 3.2, up: 2.4 },
  blast: { colour: 0xff8020, n: 36, speed: 5, up: 3.5 },
  death: { colour: 0x7a6a50, n: 8, speed: 1.2, up: 0.8 },
  // Patch 5: a tree a cannonball blows apart (MB-6), a wall breaker going off (BL-7), a catapult stone or boulder landing.
  fell: { colour: 0x9a6a3a, n: 18, speed: 3, up: 3.2 },
  bomb: { colour: 0xff8020, n: 40, speed: 5, up: 3.5 },
  dirt: { colour: 0x6a4a2a, n: 14, speed: 2.2, up: 2.6 },
  // Jade's Patch 5: the necromancer's bolt and his dead rising, and a summoner's call (onHits adds the violet ring and the white drain).
  crimson: { colour: 0xc0102a, n: 18, speed: 2, up: 1.8 },
  summon: { colour: 0x8a1030, n: 30, speed: 1.4, up: 2.6 },
  // Patch 5 (FR-1): the splash where a woodsman's fish comes up out of the water (world/fish-view.ts draws the fish).
  catch: { colour: 0xcfe6f2, n: 7, speed: 1.2, up: 2 },
};

/** Morvath's staff burst (Jade's Patch 5): vivid purple motes over its 1 m round where the blow lands. */
const VIOLET = { colour: 0xa030ff, n: 40, radiusM: 1 };
/** Life drained into Morvath: white motes streaming to him (the sim sends one for every 2 health). */
const DRAIN_COLOUR = 0xf4f4ff;
/** A mana crystal's guardian (Jade's Patch 5, MB-13): thin blue light rising round it, pulsing, motes a second at the peak and the pulse's length, s. */
const GUARDIAN_GLOW = { colour: 0x58a8ff, perSecond: 26, pulseS: 1.6 };

/** The gunpowder shots (Patch 5, Jade's VX-4): hot lead, barely seen by day, a bright orange streak in the dark. */
const GUNPOWDER: ReadonlySet<number> = new Set([Shot.Cannonball, Shot.BronzeCannonball, Shot.MusketBall]);

/** Seconds a gun's smoke rises after a shot (Jade's MB-7): a cannon 5, a musket 4, the brawler's pistol 3. */
const GUN_SMOKE = { cannon: 5, musket: 4, pistol: 3 };

/** A wall breaker's smoke after it goes off, seconds (Jade's BL-7). */
const BOMB_SMOKE_S = 3;

/** Shots by Shot id: length, thickness, colour. */
const SHOT_LOOKS: ReadonlyArray<{ len: number; w: number; colour: number }> = [
  { len: 0.7, w: 0.04, colour: 0x8a6a40 },
  { len: 0.1, w: 0.1, colour: 0x8a8a84 },
  { len: 1.3, w: 0.05, colour: 0x7a5a30 },
  { len: 0.7, w: 0.04, colour: 0xd8d0b8 },
  { len: 0.1, w: 0.1, colour: 0x7a7a70 },
  { len: 0.3, w: 0.3, colour: 0xf0f0e8 },
  { len: 0.7, w: 0.06, colour: 0xff8030 },
  { len: 0.45, w: 0.05, colour: 0x6a6a70 },
  { len: 0.25, w: 0.18, colour: 0xffa020 },
  { len: 0.5, w: 0.22, colour: 0x7ab8ff },
  // The mages' Arcane bolt (violet-white) and Fireball, until their spell models are in the library.
  { len: 0.32, w: 0.2, colour: 0xd8b8ff },
  { len: 0.45, w: 0.42, colour: 0xff7020 },
  // A Grovesinger's thorn.
  { len: 0.5, w: 0.06, colour: 0x5a8a30 },
  // Cannonball, catapult stone, ballista bolt, musket ball (the shots fly still; Patch 2 cut them from the stock).
  { len: 0.16, w: 0.16, colour: 0x2a2a2e },
  { len: 0.5, w: 0.5, colour: 0x8a8a84 },
  { len: 1.5, w: 0.08, colour: 0x6a4a28 },
  { len: 0.05, w: 0.05, colour: 0x5a5a60 },
  // A bone colossus's boulder, a scorchwing's burning pitch, a flamecaller's hellfire.
  { len: 0.7, w: 0.7, colour: 0xd8d0b8 },
  { len: 0.35, w: 0.35, colour: 0xff5010 },
  { len: 0.5, w: 0.45, colour: 0xff3010 },
  // A bronze cannon's shot (Patch 5, MB-8), and the necromancer's crimson bolt (Jade's Patch 5), until their models are in the library.
  { len: 0.12, w: 0.12, colour: 0x8a5a2a },
  { len: 0.5, w: 0.2, colour: 0xc0102a },
  // Patch 5: a support mage's Energy dart, pale gold light (spell-fx.ts draws it once its model is in).
  { len: 0.3, w: 0.05, colour: 0xfff0b0 },
];

/** Shots drawn with their catalogue model once it is listed: the spells' own, and every other shot's (Patch 5); the gunpowder ones trail a streak too. */
const SHOT_MODELS: Record<number, string> = {
  ...Object.fromEntries(SHOTS.map((s, i) => [i, s.model])),
  [Shot.ArcaneBolt]: SPELLS[Spell.ArcaneBolt]!.model,
  [Shot.Fireball]: SPELLS[Spell.Fireball]!.model,
  [Shot.Thorn]: SPELLS[Spell.ThornVolley]!.model,
};
/** Shot models made pointing down -Z (Jade's crimson bolt): turned about to fly head first. */
const SHOT_MODELS_BACKWARD: ReadonlySet<number> = new Set([Shot.NecroBolt]);
/** After his change, Morvath's wings stay spread this long, ms: the rest of the 5 s his wings drain (sim LATE.wings) after the 3.4 s change. */
const MORVATH_WINGS_MS = 1600;
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** A rank wand's model in a Mage's, Master Mage's or Grand Magician's hand, by Item. */
const SCHOOL_LOOKS = ['support', 'support', 'battle'];

interface Corpse {
  model: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  t0: number;
  colour: THREE.Color | null;
  /** A stand-in block's mob kind, when the model is missing. */
  mob: number;
  /** Parts it falls with (the Dreadnought's mace, Patch 5). */
  parts?: readonly string[];
}

/** One instanced model of a body with a set of parts, and how many of its instances this frame are the local player's own units, and outlined. */
interface PoolEntry {
  m: InstancedModel;
  n: number;
  own: number;
  outlined: number;
  /** The counts as of the last commit, for the outline passes after it. */
  ownDrawn: number;
  outlinedDrawn: number;
  /** Instances taken this frame for what the cursor is over (Patch 5, UI-5), marked at the commit. */
  hovered: number[];
}

/** An instance taken from a pool. */
interface PoolSlot {
  m: InstancedModel;
  i: number;
  e: PoolEntry;
}

/** Instanced models of one body, one per set of visible parts. */
class BodyPool {
  private readonly byKey = new Map<string, PoolEntry>();

  constructor(
    private readonly parent: THREE.Object3D,
    readonly model: ModelData,
    private readonly patch: ModelShaderPatch | undefined,
    /** On while the unit being drawn is under the cursor: what it takes is marked for the hover outline. */
    private readonly hoverNow: { on: boolean },
  ) {}

  /** The instance to fill for a look; parts the model does not have are skipped. */
  take(parts: readonly string[]): PoolSlot | null {
    const have = parts.filter((p) => this.model.partNames.includes(p)).sort();
    const key = have.join(',');
    let e = this.byKey.get(key);
    if (!e) {
      const m = new InstancedModel(this.model, MAX_UNITS, this.patch);
      for (const p of have) m.setPartVisible(p, true);
      this.parent.add(m.object);
      e = { m, n: 0, own: 0, outlined: 0, ownDrawn: 0, outlinedDrawn: 0, hovered: [] };
      this.byKey.set(key, e);
    }
    if (e.n >= MAX_UNITS) return null;
    if (this.hoverNow.on) e.hovered.push(e.n);
    return { m: e.m, i: e.n++, e };
  }

  /** Marks a slot as one of the local player's own units (its entity id), outlined or not. */
  mark(slot: PoolSlot, id: number, outlined: boolean): void {
    slot.m.setMark(slot.i, id, outlined);
    slot.e.own++;
    if (outlined) slot.e.outlined++;
  }

  commit(): void {
    for (const e of this.byKey.values()) {
      e.m.setCount(e.n);
      for (const i of e.hovered) e.m.setHover(i);
      e.hovered.length = 0;
      e.m.commit();
      e.n = 0;
      e.ownDrawn = e.own;
      e.outlinedDrawn = e.outlined;
      e.own = 0;
      e.outlined = 0;
    }
  }

  /**
   * Sets the pool up for an outline pass (a MarkMode): the mark material, and
   * only the models the pass needs drawn. Null puts it back as it was.
   */
  pass(mode: number | null): void {
    for (const e of this.byKey.values()) {
      const drawn = e.m.instanceCount > 0;
      e.m.useMarkMaterial(mode !== null);
      const some = mode === MarkMode.Own ? e.ownDrawn > 0 : mode === MarkMode.Hover ? e.m.hoveredCount > 0 : e.outlinedDrawn > 0;
      e.m.object.visible = drawn && (mode === null || mode === MarkMode.Ids || some);
    }
  }

  bone(name: string): number {
    return this.model.boneNames.indexOf(name);
  }
}

/**
 * Items hanging from slot bones: each item's own model with full matrices,
 * taking its unit's team colour where its texture has the key. An item still
 * loading draws nothing until it is in, and an id the catalogue lacks never
 * draws (no stand-ins, Patch 5).
 */
class AttachPool {
  private readonly meshes = new Map<string, { mesh: THREE.InstancedMesh; team: THREE.InstancedBufferAttribute; n: number }>();
  private readonly asked = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private lib: ModelLibrary | null,
  ) {}

  setLibrary(lib: ModelLibrary): void {
    this.lib = lib;
  }

  /** Whether the item is drawn now (loaded), asking for it otherwise. */
  has(id: string): boolean {
    if (this.meshes.has(id) || this.lib?.models.has(id)) return true;
    if (this.lib && !this.asked.has(id)) {
      this.asked.add(id);
      this.lib.request(id);
    }
    return false;
  }

  add(id: string, m: THREE.Matrix4, team: THREE.Color | null = null): void {
    let e = this.meshes.get(id);
    if (!e) {
      const model = this.lib?.models.get(id);
      if (!model) {
        this.has(id);
        return;
      }
      // The model's own attributes, with the team colour per instance beside them.
      const geometry = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, model.geometry.getAttribute(name));
      geometry.setIndex(model.geometry.index);
      const teamAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ATTACH * 4), 4);
      teamAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('team', teamAttr);
      const material = new THREE.MeshLambertMaterial({ map: model.texture, alphaTest: 0.5 });
      useTeamKey(material);
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_ATTACH);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      e = { mesh, team: teamAttr, n: 0 };
      this.meshes.set(id, e);
    }
    if (e.n >= MAX_ATTACH) return;
    const t = e.team.array as Float32Array;
    const k = e.n * 4;
    if (team) {
      t[k] = team.r;
      t[k + 1] = team.g;
      t[k + 2] = team.b;
      t[k + 3] = 1;
    } else t[k + 3] = 0;
    e.mesh.setMatrixAt(e.n++, m);
  }

  commit(): void {
    for (const e of this.meshes.values()) {
      e.mesh.count = e.n;
      e.mesh.instanceMatrix.needsUpdate = true;
      e.team.needsUpdate = true;
      e.n = 0;
    }
  }

  setVisible(on: boolean): void {
    for (const e of this.meshes.values()) e.mesh.visible = on;
  }
}

/**
 * The top mages' halos (Patch 5, Jade): a ring of glowing bits over the head,
 * turning, flickering flames for a battle mage and twinkling light for a
 * support mage.
 */
class Halos {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private n = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_HALO_BITS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** A halo over a head (metres, the top of the head), at time t seconds; `seed` sets one mage's halo apart from another's. */
  add(x: number, y: number, z: number, flames: boolean, t: number, seed: number): void {
    for (let k = 0; k < HALO_BITS && this.n < MAX_HALO_BITS; k++) {
      const a = t * (flames ? 1.6 : 0.9) + (k / HALO_BITS) * Math.PI * 2 + seed;
      const flicker = Math.sin(t * 9 + k * 2.3 + seed) * 0.5 + 0.5;
      const lift = flames ? 0.05 + flicker * 0.06 : 0.05;
      this.dummy.position.set(x + Math.cos(a) * 0.2, y + 0.1 + lift, z + Math.sin(a) * 0.2);
      const size = flames ? 0.05 + flicker * 0.05 : 0.025 + Math.max(0, Math.sin(t * 5 + k * 1.7 + seed)) * 0.045;
      this.dummy.scale.set(size, flames ? size * 1.6 : size, size);
      this.dummy.rotation.set(0, a, flames ? 0 : t * 3 + k);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.n, this.dummy.matrix);
      if (flames) this.colour.setHex(flicker > 0.66 ? 0xffe060 : flicker > 0.33 ? 0xff8a20 : 0xff3a10);
      else this.colour.setHex(k % 3 === 0 ? 0xfff2b0 : 0xffffff);
      this.mesh.setColorAt(this.n, this.colour);
      this.n++;
    }
  }

  commit(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.n = 0;
  }
}

/** Little cubes thrown out by hits, falling and fading; glowing ones (sparks, a muzzle's flash) are unlit, so they show in the dark. */
class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly p = new Float32Array(MAX_PARTICLES * 8); // x y z vx vy vz age life
  private readonly colours: THREE.Color[] = [];
  private n = 0;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, size = 0.07, glow = false) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), glow ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial(), MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, colour: number, n: number, speed: number, up: number, life = 0.5): void {
    const c = new THREE.Color(colour);
    for (let k = 0; k < n && this.n < MAX_PARTICLES; k++) {
      const o = this.n * 8;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.p[o] = x;
      this.p[o + 1] = y;
      this.p[o + 2] = z;
      this.p[o + 3] = Math.cos(a) * s;
      this.p[o + 4] = up * (0.5 + Math.random() * 0.5);
      this.p[o + 5] = Math.sin(a) * s;
      this.p[o + 6] = 0;
      this.p[o + 7] = life + Math.random() * life * 0.8;
      this.colours[this.n] = c;
      this.n++;
    }
  }

  /** Motes from a point that reach another as they fade (gravity allowed for), spread a little where they start. */
  stream(x: number, y: number, z: number, tx: number, ty: number, tz: number, colour: number, n: number): void {
    const c = new THREE.Color(colour);
    for (let k = 0; k < n && this.n < MAX_PARTICLES; k++) {
      const o = this.n * 8;
      const life = 0.6 + Math.random() * 0.4;
      const sx = x + (Math.random() - 0.5) * 0.4;
      const sy = y + (Math.random() - 0.5) * 0.4;
      const sz = z + (Math.random() - 0.5) * 0.4;
      this.p[o] = sx;
      this.p[o + 1] = sy;
      this.p[o + 2] = sz;
      this.p[o + 3] = (tx - sx) / life;
      this.p[o + 4] = (ty - sy) / life + 4.9 * life;
      this.p[o + 5] = (tz - sz) / life;
      this.p[o + 6] = 0;
      this.p[o + 7] = life;
      this.colours[this.n] = c;
      this.n++;
    }
  }

  update(dt: number): void {
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * 8;
      const age = p[o + 6]! + dt;
      if (age >= p[o + 7]!) continue;
      const d = w * 8;
      p[d + 3] = p[o + 3]!;
      p[d + 4] = p[o + 4]! - 9.8 * dt;
      p[d + 5] = p[o + 5]!;
      p[d] = p[o]! + p[d + 3]! * dt;
      p[d + 1] = p[o + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[o + 2]! + p[d + 5]! * dt;
      p[d + 6] = age;
      p[d + 7] = p[o + 7]!;
      this.colours[w] = this.colours[r]!;
      const s = 1 - age / p[d + 7]!;
      this.dummy.position.set(p[d]!, p[d + 1]!, p[d + 2]!);
      this.dummy.scale.setScalar(Math.max(0.2, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(w, this.dummy.matrix);
      this.mesh.setColorAt(w, this.colours[w]!);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Rising smoke (Patch 5): puffs from where a gun fired (Jade's MB-7: 3 to 5
 * seconds) or a wall breaker went off (BL-7: 3 seconds), drifting up and
 * swelling, paling and thinning out as they go.
 */
class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private readonly p = new Float32Array(MAX_SMOKE * 7); // x y z vx vz age life
  private n = 0;
  private readonly sources: Array<{ x: number; y: number; z: number; left: number; rate: number; size: number; carry: number }> = [];
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private readonly sizes = new Float32Array(MAX_SMOKE);

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), MAX_SMOKE);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Smoke rising from a point for `seconds`, puffs `size` metres across. */
  add(x: number, y: number, z: number, seconds: number, size: number): void {
    if (this.sources.length < 96) this.sources.push({ x, y, z, left: seconds, rate: 5, size, carry: 1 });
  }

  update(dt: number): void {
    for (let k = this.sources.length - 1; k >= 0; k--) {
      const s = this.sources[k]!;
      // Thick at first, thinning out in its last second.
      s.carry += s.rate * dt * Math.min(1, s.left);
      while (s.carry >= 1) {
        s.carry--;
        this.puff(s.x, s.y, s.z, s.size);
      }
      s.left -= dt;
      if (s.left <= 0) this.sources.splice(k, 1);
    }
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * 7;
      const age = p[o + 5]! + dt;
      if (age >= p[o + 6]!) continue;
      const d = w * 7;
      p[d + 3] = p[o + 3]!;
      p[d + 4] = p[o + 4]!;
      p[d] = p[o]! + p[d + 3]! * dt;
      p[d + 1] = p[o + 1]! + (0.5 + age * 0.25) * dt;
      p[d + 2] = p[o + 2]! + p[d + 4]! * dt;
      p[d + 5] = age;
      p[d + 6] = p[o + 6]!;
      this.sizes[w] = this.sizes[r]!;
      const k = age / p[d + 6]!;
      this.dummy.position.set(p[d]!, p[d + 1]!, p[d + 2]!);
      this.dummy.scale.setScalar(this.sizes[w]! * (0.4 + 1.2 * k) * (1 - k * k * k));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(w, this.dummy.matrix);
      this.mesh.setColorAt(w, this.colour.setHex(0x5a5a58).lerp(SMOKE_PALE, k));
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private puff(x: number, y: number, z: number, size: number): void {
    if (this.n >= MAX_SMOKE) return;
    const o = this.n * 7;
    this.p[o] = x + (Math.random() - 0.5) * size * 0.4;
    this.p[o + 1] = y;
    this.p[o + 2] = z + (Math.random() - 0.5) * size * 0.4;
    this.p[o + 3] = (Math.random() - 0.5) * 0.35;
    this.p[o + 4] = (Math.random() - 0.5) * 0.35;
    this.p[o + 5] = 0;
    this.p[o + 6] = 1.6 + Math.random() * 0.9;
    this.sizes[this.n] = size * (0.7 + Math.random() * 0.6);
    this.n++;
  }
}

const SMOKE_PALE = new THREE.Color(0xb8b8b2);

export interface UnitsFrame {
  curr: StateMessage;
  prev: StateMessage | null;
  /** Milliseconds since curr arrived. */
  sinceMs: number;
  now: number;
  player: number;
  colours: readonly THREE.Color[];
  neutral: THREE.Color;
  /** Whether a point (metres) is in sight of the players now (they share their vision). */
  seen(x: number, z: number): boolean;
  /** Whether a point (metres) is explored by the players: lairs, huts and ruins stay drawn there. */
  known(x: number, z: number): boolean;
  /** Destroyed lairs: the lair's mob kind and where it stood, wu. */
  ruins: ReadonlyArray<readonly [number, number, number]>;
  /** Ground height at a point, metres. */
  groundAt(x: number, z: number): number;
  /** Tells the selection where unit i stands this frame (metres, its middle). */
  place(i: number, x: number, y: number, z: number): void;
  /** Entity ids of the local player's units to outline this frame (hidden-outlines.ts). */
  outlined?: ReadonlySet<number>;
  /** Entity ids of the units the cursor is over, for their silhouette outline (Patch 5, UI-5). */
  hovered?: ReadonlySet<number>;
}

export class UnitsView {
  private lib: ModelLibrary | null = null;
  /** Every unit, creature and corpse model, in one group the outline passes draw on their own. */
  readonly bodyGroup = new THREE.Group();
  private readonly bodies = new Map<string, BodyPool>();
  private readonly hoverNow = { on: false };
  /** The fog of war on the models, when the world gives one. */
  private readonly patch: ModelShaderPatch | undefined;
  /** The local player's own units drawn this frame, where and how big (owned), out of a pool of records reused frame to frame. */
  private readonly owned: OwnDraw[] = [];
  private readonly ownedPool: OwnDraw[] = [];
  private readonly asked = new Set<string>();
  private readonly attach: AttachPool;
  private readonly halos: Halos;
  private readonly particles: Particles;
  private readonly hearts: Hearts;
  /** Sparks and a muzzle's flash (Patch 5, MB-7): unlit, tiny, so they show at night. */
  private readonly sparks: Particles;
  private readonly smoke: Smoke;
  /** A gunpowder shot in flight (VX-4): unlit streaks, faint by day and bright orange in the dark. */
  private readonly streaks: THREE.InstancedMesh;
  /** 0 by day, 1 at night (world-view sets it each frame): how a gunpowder shot shows. */
  darkness = 0;
  private readonly blocks: THREE.InstancedMesh;
  private readonly loads: THREE.InstancedMesh;
  private readonly shots: THREE.InstancedMesh;
  /** Patch 5: the magic on screen, glowing (spell-fx.ts). */
  private readonly spellFx: SpellFx;
  /** Where each unit stands this frame (metres), by entity id, while a beam is held or a spell rides on a unit. */
  private readonly where = new Map<number, THREE.Vector3>();
  /** Where each mage holding a Beam has her wand's tip this frame (Patch 5, MB-22), by entity id. */
  private readonly tips = new Map<number, THREE.Vector3>();
  private readonly dummy = new THREE.Object3D();
  private readonly mat = new THREE.Matrix4();
  private readonly corpses: Corpse[] = [];
  /** When each unit's current swing began on screen (ms), by entity id. */
  private readonly swingStart = new Map<number, number>();
  /** When each unit's last swing or shot ended (ms), by entity id: a crossbow or gun is reloaded from then. */
  private readonly shotAt = new Map<number, number>();
  /** When each woodsman last landed a fish (ms), by entity id: he casts again from then (Patch 5). */
  private readonly caughtAt = new Map<number, number>();
  /** When each animal last bred (ms), by entity id: it plays its mate clip through once from then (Patch 5, BL-10). */
  private readonly matedAt = new Map<number, number>();
  /** The woodsmen drawn last frame, by entity id: one who dies lies on his own body. */
  private readonly woodsmen = new Set<number>();
  /** Each entity's record offset in this frame's state, by id: a hauling animal finds its worker's cart and load. */
  private readonly byId = new Map<number, number>();
  /** When each unit sat down at a timed action (Jade's Patch 2 tinkering), ms, so it sits once and then tinkers. */
  private readonly tinkerStart = new Map<number, number>();
  /** The state step each engine last fired on, by entity id: its smoke is thrown once per shot. */
  private readonly fired = new Map<number, number>();
  /** The Dreadnoughts' blows and war cries (Patch 5), and his swing's crescents. */
  private readonly dread = new DreadnoughtLooks();
  private readonly crescents: Crescents;
  /** Where each soldier's gun's muzzle was last drawn, by entity id (Patch 5, MB-7): its flash and smoke start there. */
  private readonly muzzles = new Map<number, THREE.Vector3>();
  /** Each held item's slot_muzzle in its own space, or null when it has none. */
  private readonly muzzleOf = new Map<string, THREE.Vector3 | null>();
  /** Jade's Patch 5: a clip a monster plays through whatever it does (Morvath's flight and spells, a summons), by entity id, with the one after it. */
  private readonly held = new Map<number, { clip: string; t0: number; until: number; then?: { clip: string; ms: number } }>();
  /** Each Morvath's form last seen, by entity id, and where each stands now (metres), for the life drained into him. */
  private readonly forms = new Map<number, number>();
  private readonly morvathAt = new Map<number, THREE.Vector3>();
  private lastFrame = 0;

  constructor(
    private readonly scene: THREE.Scene,
    fow?: FowUniforms,
  ) {
    this.patch = fow ? { key: 'fow', apply: fowPatch(fow, false) } : undefined;
    this.bodyGroup.name = 'unit models';
    scene.add(this.bodyGroup);
    this.attach = new AttachPool(scene, null);
    this.halos = new Halos(scene);
    this.particles = new Particles(scene);
    this.hearts = new Hearts(scene);
    this.sparks = new Particles(scene, 0.03, true);
    this.smoke = new Smoke(scene);
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), MAX_SHOTS);
    this.streaks.count = 0;
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);
    this.crescents = new Crescents(scene);
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), MAX_UNITS);
    this.blocks.count = 0;
    this.blocks.frustumCulled = false;
    scene.add(this.blocks);
    this.loads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.3, 0.2), new THREE.MeshLambertMaterial(), MAX_UNITS);
    this.loads.count = 0;
    this.loads.frustumCulled = false;
    scene.add(this.loads);
    this.shots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_SHOTS);
    this.shots.count = 0;
    this.shots.frustumCulled = false;
    scene.add(this.shots);
    this.spellFx = new SpellFx(scene);
  }

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    this.attach.setLibrary(lib);
    this.spellFx.setLibrary(lib);
  }

  private body(wanted: string): BodyPool | null {
    const id = wanted;
    let b = this.bodies.get(id);
    if (b) return b;
    const model = this.lib?.models.get(id);
    if (!model) {
      // Came into view before its model loaded: load it next, and draw a block until then.
      if (this.lib && !this.asked.has(id)) {
        this.asked.add(id);
        this.lib.request(id);
      }
      return null;
    }
    b = new BodyPool(this.bodyGroup, model, this.patch, this.hoverNow);
    this.bodies.set(id, b);
    return b;
  }

  /**
   * The pool drawing a worn piece (armour and boots, a horse's tack or
   * harness) on a body: the piece's model moved by the body's bones of the
   * same names, so it takes every clip the body plays. Null until the piece
   * has loaded.
   */
  private wornPool(body: ModelData, piece: string): BodyPool | null {
    const key = `${body.id}+${piece}`;
    const have = this.bodies.get(key);
    if (have) return have;
    const model = this.lib?.models.get(piece);
    if (!model) {
      if (this.lib && !this.asked.has(piece)) {
        this.asked.add(piece);
        this.lib.request(piece);
      }
      return null;
    }
    const pool = new BodyPool(this.bodyGroup, wornOn(body, model), this.patch, this.hoverNow);
    this.bodies.set(key, pool);
    return pool;
  }

  /** Draws a worn piece on a body instance just set, in the same pose; marked as the unit's own for the outlines. */
  private wear(pool: BodyPool, piece: string, x: number, y: number, z: number, heading: number, clip: string, time: number, tint: THREE.Color | null, ownId: number, outlined: boolean): void {
    const wp = this.wornPool(pool.model, piece);
    const slot = wp?.take([]);
    if (!wp || !slot) return;
    slot.m.setInstance(slot.i, x, y, z, heading, clip, time, tint);
    if (ownId) wp.mark(slot, ownId, outlined);
  }

  /** A cart on the ground at (x, z) metres facing `heading`, rolling or standing, its load (a good's model) in its bed. */
  private drawCart(f: UnitsFrame, id: string, x: number, z: number, heading: number, moving: boolean, colour: THREE.Color | null, good: string): void {
    const pool = this.body(id);
    const slot = pool?.take([]);
    if (!pool || !slot) return;
    slot.m.setInstance(slot.i, x, f.groundAt(x, z), z, heading, moving ? 'move' : 'idle', f.now / 1000, colour);
    const b = pool.bone('slot_cargo');
    if (good && b >= 0) this.attach.add(good, slot.m.boneWorld(slot.i, b, this.mat));
  }

  /** The good a unit is carrying, if it has a model: the model id and how it is held (empty while it is loading, or for a good without one). */
  private carried(d: Int32Array, o: number): { good: string; hold: Hold | '' } {
    const res = d[o + S.carryRes]!;
    if (res === NO_CARRY || d[o + S.carryAmt]! <= 0) return { good: '', hold: '' };
    const good = goodsModel(res);
    const m = good && this.attach.has(good) ? this.lib?.models.get(good) : undefined;
    return { good, hold: m ? holdOf(m) : '' };
  }

  /** The local player's own units drawn this frame. */
  ownDraws(): readonly OwnDraw[] {
    return this.owned;
  }

  /** Sets every body model up for an outline pass (a MarkMode), or back as it was (null). */
  passPools(mode: number | null): void {
    for (const b of this.bodies.values()) b.pass(mode);
  }

  /** Hides (or shows again) what hangs on or flies round the units, which hides nothing: carried items, loads, shots, beams and bursts. */
  hideExtras(hidden: boolean): void {
    this.attach.setVisible(!hidden);
    this.halos.mesh.visible = !hidden;
    this.loads.visible = !hidden;
    this.shots.visible = !hidden;
    this.spellFx.setVisible(!hidden);
    this.particles.mesh.visible = !hidden;
    this.crescents.setVisible(!hidden);
  }

  /** Notes one of the local player's own units drawn this frame: its id, its feet (metres), its height and reach round its middle. */
  private noteOwn(id: number, x: number, y: number, z: number, h: number, r: number, outlined: boolean): void {
    let rec = this.ownedPool[this.owned.length];
    if (!rec) {
      rec = { id: 0, x: 0, y: 0, z: 0, h: 0, r: 0, outlined: false };
      this.ownedPool.push(rec);
    }
    rec.id = id;
    rec.x = x;
    rec.y = y;
    rec.z = z;
    rec.h = h;
    rec.r = r;
    rec.outlined = outlined;
    this.owned.push(rec);
  }

  /** Plays a clip through on a monster from now (its whole length), then `then` for `thenMs`. */
  private hold(id: number, clip: string, now: number, then?: { clip: string; ms: number }): void {
    this.held.set(id, then ? { clip, t0: now, until: -1, then } : { clip, t0: now, until: -1 });
  }

  /** The clip a monster plays through now and how far into it, s, or null. */
  private heldClip(id: number, model: ModelData, now: number): [string, number] | null {
    const h = this.held.get(id);
    if (!h) return null;
    const c = model.clips.get(h.clip);
    if (!c) {
      this.held.delete(id);
      return null;
    }
    if (h.until < 0) h.until = h.t0 + c.length * 1000;
    if (now >= h.until) {
      if (h.then && model.clips.has(h.then.clip)) {
        this.held.set(id, { clip: h.then.clip, t0: h.until, until: h.until + h.then.ms });
        return this.heldClip(id, model, now);
      }
      this.held.delete(id);
      return null;
    }
    return [h.clip, (now - h.t0) / 1000];
  }

  /** Morvath seen this frame: where his middle is (metres), and as he takes flight his change and wings spread while he drains (5 s in all, sim LATE.wings). */
  private noteMorvath(id: number, mob: number, x: number, y: number, z: number, now: number): void {
    const was = this.forms.get(id);
    this.forms.set(id, mob);
    const at = this.morvathAt.get(id);
    if (at) at.set(x, y, z);
    else this.morvathAt.set(id, new THREE.Vector3(x, y, z));
    if (was === Mob.Morvath && mob === Mob.MorvathAloft) this.hold(id, 'phase_two_transform', now, { clip: 'wings_spread', ms: MORVATH_WINGS_MS });
  }

  /** A mana crystal's guardian's glow: thin blue light rising up it, pulsing. */
  private guardianGlow(x: number, y: number, z: number, halfW: number, height: number, t: number, dt: number): void {
    const g = GUARDIAN_GLOW;
    const pulse = 0.5 + 0.5 * Math.sin((t / g.pulseS) * Math.PI * 2);
    let n = g.perSecond * pulse * dt;
    while (n > 0) {
      if (n < 1 && Math.random() >= n) break;
      n--;
      const a = Math.random() * Math.PI * 2;
      const px = x + Math.cos(a) * halfW * 1.1;
      const pz = z + Math.sin(a) * halfW * 1.1;
      this.particles.stream(px, y + Math.random() * height * 0.3, pz, px, y + height * (0.8 + Math.random() * 0.4), pz, g.colour, 1);
    }
  }

  /**
   * A gun going off (Patch 5, Jade's MB-7): a flash of light, a spray of tiny
   * sparks out of the muzzle along `heading` (radians, three.js rotation.y),
   * and smoke rising for `seconds`.
   */
  private gunFire(x: number, y: number, z: number, heading: number, seconds: number): void {
    const big = seconds >= GUN_SMOKE.cannon;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    this.sparks.spawn(x, y, z, 0xfff4c0, big ? 10 : 5, 0.6, 0.3, 0.08);
    for (let k = 0; k < (big ? 4 : 2); k++) {
      const a = 0.15 * k;
      this.sparks.spawn(x + fx * a, y, z + fz * a, 0xffb040, big ? 14 : 7, big ? 4.5 : 3, 1, 0.25);
    }
    this.smoke.add(x + fx * 0.2, y, z + fz * 0.2, seconds, big ? 0.7 : 0.35);
  }

  /** Where a gun held in hand (its item model's slot_muzzle) is now, for its flash and smoke when it fires. */
  private noteMuzzle(id: number, item: string, hand: THREE.Matrix4): void {
    let at = this.muzzleOf.get(item);
    if (at === undefined) {
      const model = this.lib?.models.get(item);
      if (!model) return;
      const b = model.boneNames.indexOf('slot_muzzle');
      at = b >= 0 ? new THREE.Vector3().setFromMatrixPosition(model.restWorld[b]!) : null;
      this.muzzleOf.set(item, at);
    }
    if (!at) return;
    const v = this.muzzles.get(id) ?? new THREE.Vector3();
    this.muzzles.set(id, v.copy(at).applyMatrix4(hand));
  }

  /** Hits and deaths of one state message: particles now, the dead kept to play their death clip. A gun's shot leaving gets its flash and smoke (`who` finds the shooter: a pistol smokes less than a musket). */
  onHits(hits: readonly HitEvent[], seen: (x: number, z: number) => boolean, now: number, who?: (id: number) => { kind: number; ranged: number; x: number; z: number } | null): void {
    for (const h of hits) {
      const x = h.x / WU_PER_METRE;
      const y = h.y / WU_PER_METRE;
      const z = h.z / WU_PER_METRE;
      if (!seen(x, z)) continue;
      // An animal leaves a carcass where it fell, drawn with the props.
      if (h.look === 'death' && h.kind !== undefined && h.kind !== UnitKind.Animal) {
        // The Dreadnought falls as himself, with his mace (Patch 5).
        const dread = h.kind === UnitKind.Warrior && h.troop === Troop.Dreadnought;
        const model = h.kind === UnitKind.Mob ? mobSpec(h.mob ?? 0).model : dread ? DREADNOUGHT_MODEL : h.kind === UnitKind.Warrior ? (this.woodsmen.has(h.id) ? 'woodsman' : 'warrior') : h.kind === UnitKind.Mage ? 'mage' : 'worker';
        this.corpses.push({ model, x, y, z, heading: ((h.heading ?? 0) / 65536) * Math.PI * 2, t0: now, colour: null, mob: h.kind === UnitKind.Mob ? (h.mob ?? 0) : -1, ...(dread ? { parts: DREADNOUGHT_PARTS } : {}) });
      }
      if (h.look === 'sweep') this.crescents.spawn(x, y, z, ((h.heading ?? 0) / 65536) * Math.PI * 2, now);
      if (h.look === 'warcry') this.dread.cry(h.id, now);
      if (h.look === 'catch') this.caughtAt.set(h.id, now);
      // Two animals breeding (Patch 5, Jade's BL-10): a heart over each.
      if (h.look === 'heart') {
        this.hearts.spawn(x, y + speciesSpec(h.mob ?? 0).height / WU_PER_METRE + 0.3, z, now);
        this.matedAt.set(h.id, now);
      }
      const look = HIT_LOOKS[h.look];
      if (look) this.particles.spawn(x, y + (h.look === 'death' ? 0.2 : 0), z, look.colour, look.n, look.speed, look.up);
      // Jade's Patch 5: Morvath's staff bursts violet over its 1 m, the life he drains streams to him, and a summoner or Morvath at his spell plays its clip through.
      if (h.look === 'violet') {
        for (let k = 0; k < VIOLET.n; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * VIOLET.radiusM;
          this.particles.spawn(x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, VIOLET.colour, 1, 0.5, 1.6);
        }
      }
      if (h.look === 'drain' && h.to !== undefined) {
        const to = this.morvathAt.get(h.to);
        if (to) this.particles.stream(x, y, z, to.x, to.y, to.z, DRAIN_COLOUR, Math.min(60, h.n ?? 1));
      }
      if (h.look === 'summon') this.hold(h.id, 'summon', now);
      if (h.look === 'spell' && this.forms.has(h.id)) this.hold(h.id, 'cast_spell', now);
      // Patch 5 (MB-6): a cannonball's blast throws up dirt and smoke too; a wall breaker's leaves smoke rising (BL-7).
      if (h.look === 'blast' || h.look === 'bomb') {
        this.particles.spawn(x, y, z, 0x505050, 24, 3, 3);
        this.particles.spawn(x, y, z, 0x6a4a2a, 16, 2.6, 3);
        this.sparks.spawn(x, y + 0.2, z, 0xffd060, 30, 6, 3, 0.3);
      }
      if (h.look === 'bomb') this.smoke.add(x, y + 0.3, z, BOMB_SMOKE_S, 0.9);
      if (h.look === 'fell') this.particles.spawn(x, y + 1, z, 0x3a6a2a, 14, 2.4, 2.4);
      // A soldier's musket or pistol (an engine's muzzle flash is drawn with the engine, at its muzzle).
      if (h.look === 'shot' && h.shot !== undefined && GUNPOWDER.has(h.shot)) {
        const u = who?.(h.id);
        if (u && u.kind !== UnitKind.Engine) {
          const seconds = u.ranged === PISTOL_GEAR ? GUN_SMOKE.pistol : h.shot === Shot.MusketBall ? GUN_SMOKE.musket : GUN_SMOKE.cannon;
          // From the gun's muzzle as last drawn (Patch 5, MB-7), else where the shot leaves.
          const m = this.muzzles.get(h.id);
          const at = m && Math.abs(m.x - x) + Math.abs(m.z - z) < 2 ? m : null;
          this.gunFire(at?.x ?? x, at?.y ?? y, at?.z ?? z, Math.atan2(-(x - u.x / WU_PER_METRE), -(z - u.z / WU_PER_METRE)), seconds);
        }
      }
      if (h.look === 'death') this.muzzles.delete(h.id);
      // Patch 5 (MB-20, MB-25, VX-5): spells land, and bolts of magic end, in their own light (spell-fx.ts).
      if (h.look === 'spell' || h.look === 'zap') this.spellFx.onHit(h, x, y, z);
    }
  }

  update(f: UnitsFrame): void {
    const { curr, now } = f;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const prev = f.prev && f.prev.count === curr.count ? f.prev : null;
    const alpha = prev ? Math.min(1, f.sinceMs / STEP_MS) : 1;
    const t = now / 1000;
    const d = curr.data;
    let blocks = 0;
    let loads = 0;
    const dummy = this.dummy;
    const live = new Set<number>();
    this.where.clear();
    this.tips.clear();
    this.spellFx.begin(now);
    this.byId.clear();
    let beaming = false;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      this.byId.set(d[o + S.id]!, o);
      beaming ||= d[o + S.beam] !== 0;
    }
    this.owned.length = 0;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      // A Citadel's fixed engine and the men up on a tower or a main base's top are drawn there; everything else inside a building is hidden.
      if (d[o + S.inside] !== 0 && d[o + S.kind] !== UnitKind.Engine && !(d[o + S.flags]! & UnitFlag.OnTop)) continue;
      const id = d[o + S.id]!;
      this.hoverNow.on = f.hovered?.has(id) ?? false;
      const p = prev && alpha < 1 && prev.data[o + S.id] === id ? prev.data : d;
      const x = (p[o + S.x]! + (d[o + S.x]! - p[o + S.x]!) * alpha) / WU_PER_METRE;
      const hop = hopAt(d, o, alpha);
      const y = hop ? hop.y : (p[o + S.y]! + (d[o + S.y]! - p[o + S.y]!) * alpha) / WU_PER_METRE;
      const z = (p[o + S.z]! + (d[o + S.z]! - p[o + S.z]!) * alpha) / WU_PER_METRE;
      const heading = (d[o + S.heading]! / 65536) * Math.PI * 2;
      const owner = d[o + S.owner]!;
      const kind = d[o + S.kind]!;
      // Whether it moved since the last state: walking clips only while it does.
      const was = prev && prev.data[o + S.id] === id ? prev.data : null;
      const moving = was ? was[o + S.x] !== d[o + S.x] || was[o + S.z] !== d[o + S.z] : d[o + S.order] !== OrderKind.Idle;
      f.place(i, x, y, z);
      // The local player's own units carry their ids for the outline passes (never a monster).
      const own = owner === f.player && kind !== UnitKind.Mob;
      const outlined = own && (f.outlined?.has(id) ?? false);
      if (beaming || this.spellFx.following) this.where.set(id, new THREE.Vector3(x, y, z));
      const mobUnit = kind === UnitKind.Mob;
      // Lairs and the goblins' buildings stay on the map once found, like the land; creatures only while in sight.
      const structure = mobUnit && mobSpec(d[o + S.mob]!).role === Role.Structure;
      if (mobUnit && !(structure ? f.known(x, z) : f.seen(x, z))) continue;
      // How far into its swing: clips start when the swing does; a shot's end starts a reload.
      const swing = d[o + S.swing]!;
      live.add(id);
      let swingT = 0;
      if (swing !== 0) {
        let s0 = this.swingStart.get(id);
        if (s0 === undefined) {
          s0 = now;
          this.swingStart.set(id, now);
        }
        swingT = (now - s0) / 1000;
      } else if (this.swingStart.delete(id)) this.shotAt.set(id, now);
      const clipT = swing !== 0 ? swingT : t + (id % 7) * 0.37;
      const shot = this.shotAt.get(id);
      // Sitting at a timed action: seconds since it sat down, counted from the sim's steps for a unit first seen mid-way.
      let sat = -1;
      if (d[o + S.order] === OrderKind.Tinker && d[o + S.tinkerOf]! > 0) {
        let t0 = this.tinkerStart.get(id);
        if (t0 === undefined) {
          t0 = now - d[o + S.tinkerDone]! * STEP_MS;
          this.tinkerStart.set(id, t0);
        }
        sat = (now - t0) / 1000;
      } else this.tinkerStart.delete(id);
      const colour = mobUnit ? null : owner === NEUTRAL ? f.neutral : (f.colours[owner] ?? f.neutral);
      if (mobUnit) {
        const mob = d[o + S.mob]!;
        const spec = mobSpec(mob);
        const flags = d[o + S.flags]!;
        // A cloaked void stalker is only a shimmer in the dark until it strikes or comes into the light.
        if (flags & UnitFlag.Cloaked) {
          if (Math.random() < dt * 6) this.particles.spawn(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 1.8, z + (Math.random() - 0.5) * 0.8, 0x2a1a3a, 1, 0.2, 0.3);
          continue;
        }
        if (spec.tint === 'rift' && Math.random() < dt * 5) this.particles.spawn(x, y + spec.height / WU_PER_METRE, z, 0xb040ff, 1, 0.6, 1.2);
        if (mob === Mob.Morvath || mob === Mob.MorvathAloft) this.noteMorvath(id, mob, x, y + spec.height / WU_PER_METRE / 2, z, now);
        if (flags & UnitFlag.Guardian) this.guardianGlow(x, y, z, spec.halfWidth / WU_PER_METRE, spec.height / WU_PER_METRE, t, dt);
        const pool = this.body(structureModel(spec.model, id));
        if (pool) {
          // With the weapons and gear it is made with (Patch 5: they were all hidden before).
          const slot = pool.take(pool.model.sidecar.partsShown ?? []);
          const kept = this.heldClip(id, pool.model, now);
          const clip = kept ? kept[0] : mob === Mob.MorvathAloft ? aloftClip(pool.model, d, o) : mobClip(pool.model, d, o);
          if (slot) {
            slot.m.setInstance(slot.i, x, y, z, heading, clip, kept ? kept[1] : clipT, null, mobScale(spec.model, spec.height));
            // A wall breaker's fuse fizzes with tiny sparks, from the fuse on its bomb (Patch 5, Jade's BL-7).
            const fuse = spec.model === 'skeleton_bomber' && Math.random() < dt * 14 ? pool.bone('slot_fuse') : -1;
            if (fuse >= 0) {
              const at = new THREE.Vector3().setFromMatrixPosition(slot.m.boneWorld(slot.i, fuse, this.mat));
              this.sparks.spawn(at.x, at.y, at.z, 0xffc040, 2, 0.7, 0.8, 0.15);
            }
          }
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, heading, 0);
          dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE, (spec.halfWidth * 2) / WU_PER_METRE);
          dummy.updateMatrix();
          this.blocks.setMatrixAt(blocks, dummy.matrix);
          this.blocks.setColorAt(blocks, new THREE.Color(mobColour(mob)));
          blocks++;
        }
        continue;
      }
      if (kind === UnitKind.Engine) {
        blocks = this.drawEngine(f, d, o, x, y, z, heading, colour, clipT, blocks, own ? id : 0, outlined);
        continue;
      }
      if (kind === UnitKind.Animal) {
        if (!f.seen(x, z)) continue;
        const spec = speciesSpec(d[o + S.mob]!);
        const scale = (d[o + S.flags]! & UnitFlag.Young) !== 0 ? 0.5 : 1;
        const pool = this.body(spec.model);
        if (pool) {
          const slot = pool.take([]);
          // The young are the adult model at half size.
          if (slot) {
            // Hitched to its worker: it pulls as it goes.
            const wo = d[o + S.partner] !== 0 ? this.byId.get(d[o + S.partner]!) : undefined;
            const hitched = wo !== undefined && d[wo + S.kind] === UnitKind.Worker;
            // Just bred (BL-10): its mate clip once through, while it stands.
            const mated = this.matedAt.get(id);
            const sinceMate = mated === undefined ? -1 : (now - mated) / 1000;
            const mating = !moving && !hitched && sinceMate >= 0 && sinceMate < (pool.model.clips.get('mate')?.length ?? 0) && d[o + S.swing] === 0;
            const clip = mating ? 'mate' : hitched && moving && pool.model.clips.has('pull') ? 'pull' : animalClip(pool.model, d, o, moving);
            slot.m.setInstance(slot.i, x, y, z, heading, clip, mating ? sinceMate : clipT, null, scale);
            if (own) {
              pool.mark(slot, id, outlined);
              this.noteOwn(id, x, y, z, (spec.height * scale) / WU_PER_METRE, (spec.halfWidth * 1.6 * scale) / WU_PER_METRE, outlined);
            }
            // A horse or ox hitched to its worker wears its harness, and an ox or horse hauling an ox cart has the cart behind it.
            if (hitched) {
              const harness = spec.id === Species.Horse ? 'horse_harness' : spec.id === Species.Ox ? 'ox_harness' : '';
              if (harness) this.wear(pool, harness, x, y, z, heading, clip, clipT, colour, own ? id : 0, outlined);
              if (d[wo + S.kit] === Res.OxCart) {
                const hb = pool.bone('slot_harness');
                const ahead = hb >= 0 ? -(pool.model.restWorld[hb]?.elements[14] ?? -0.7) * scale : 0.7;
                const back = OX_CART_HITCH_M - ahead;
                this.drawCart(f, 'cart_ox', x + Math.sin(heading) * back, z + Math.cos(heading) * back, heading, moving, f.colours[d[wo + S.owner]!] ?? null, this.carried(d, wo).good);
              }
            }
          }
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, heading, 0);
          dummy.scale.set((spec.halfWidth * 2 * scale) / WU_PER_METRE, (spec.height * scale) / WU_PER_METRE, (spec.halfWidth * 3 * scale) / WU_PER_METRE);
          dummy.updateMatrix();
          this.blocks.setMatrixAt(blocks, dummy.matrix);
          this.blocks.setColorAt(blocks, new THREE.Color(ANIMAL_COLOURS[spec.id] ?? 0x8a7a60));
          blocks++;
        }
        continue;
      }
      // A unit under a spell sparkles in its light (Patch 5: the effect sprites, spell-fx.ts).
      const on = d[o + S.spells]!;
      if (on !== 0 && f.seen(x, z)) this.spellFx.aura(on, x, y, z, 1.7);
      // The neutral peoples (and the mercenaries they hire out): their own bodies once the models are in, until then a person's body in their people's colour.
      const people = owner === PEOPLES || d[o + S.group] !== 0;
      if (owner === PEOPLES && !f.seen(x, z)) continue;
      // The Dreadnought (Patch 5): the heavy knight with his mace, his clips picked by dreadnought-look.ts.
      const dread = isDreadnoughtRow(d, o);
      // A rider sits at its mount's rider slot, its hips on the saddle.
      const mount = d[o + S.mount]!;
      let ry = y;
      const tall = owner === PEOPLES ? peopleUnitSpec(d[o + S.mob]!).heightCm / 100 : dread ? DREADNOUGHT_M : 1.69;
      if (mount !== 0) {
        const seat = this.drawMount(d, o, mount, x, y, z, heading, clipT, owner === PEOPLES ? null : colour, blocks, own ? id : 0, outlined);
        blocks = seat.blocks;
        ry = seat.y - tall * HIP_SHARE;
      }
      const kin = people ? this.body(peopleUnitSpec(d[o + S.mob]!).model) : null;
      // The woodsman (Patch 5) on his own body.
      const woodsman = kind === UnitKind.Warrior && d[o + S.troop] === Troop.Woodsman && !people;
      if (woodsman) this.woodsmen.add(id);
      const pool = kin ?? this.body(dread ? DREADNOUGHT_MODEL : woodsman ? 'woodsman' : kind === UnitKind.Warrior ? 'warrior' : kind === UnitKind.Mage && !people ? mageBody(d, o, this.lib) : 'worker');
      const body = pool?.model ?? null;
      // A cart carries the load in its bed; otherwise it is in the arms, the hand or on the shoulder.
      const cart = d[o + S.kit]!;
      const load = this.carried(d, o);
      const inCart = cart === Res.HandCart || cart === Res.OxCart;
      const caught = this.caughtAt.get(id);
      const c: LookContext = { time: clipT, moving, sinceShot: shot === undefined ? -1 : (now - shot) / 1000, hold: inCart ? '' : load.hold, sinceCatch: caught === undefined ? -1 : (now - caught) / 1000 };
      const look: Look = dread ? { parts: [...DREADNOUGHT_PARTS], attach: [], worn: [], clip: 'idle' } : woodsman ? woodsmanLook(d, o, body, c) : kind === UnitKind.Warrior ? warriorLook(d, o, body, c) : kind === UnitKind.Mage && !people ? mageLook(d, o, body, c) : workerLook(d, o, body, c);
      const tint = owner === PEOPLES ? (PEOPLE_COLOURS[peopleUnitSpec(d[o + S.mob]!).people] ?? null) : colour;
      let drawn = false;
      if (kin) {
        // With the weapons and gear its model is made with.
        const slot = kin.take(kin.model.sidecar.partsShown ?? []);
        const clip = mount !== 0 ? rideClip(kin.model.clips, d, o) : kin.model.clips.has(look.clip) ? look.clip : mobClip(kin.model, d, o);
        if (slot) {
          slot.m.setInstance(slot.i, x, ry, z, heading, clip, clipT, tint);
          if (own) kin.mark(slot, id, outlined);
          drawn = true;
        }
      } else if (pool) {
        const slot = pool.take(look.parts);
        if (slot) {
          const pose = mount === 0 && sat >= 0 ? tinkerPose(pool.model.clips, sat, id) : null;
          // He picks his own clip (dreadnought-look.ts); his walk turns to a run at his run as anyone's does.
          const dc = dread && mount === 0 ? this.dread.clip(d, o, id, now, swingT, clipT, pool.model.clips, hop, moving) : null;
          const clip = dc ? gaitClip(pool.model.clips, dc[0], d[o + S.flags]!) : (pose?.clip ?? (mount !== 0 ? rideClip(pool.model.clips, d, o) : hop ? hopClip(pool.model.clips, look.clip, hop.up) : gaitClip(pool.model.clips, look.clip, d[o + S.flags]!)));
          const time = dc?.[1] ?? pose?.t ?? (mount === 0 && !hop && look.t !== undefined ? look.t : clipT);
          slot.m.setInstance(slot.i, x, ry, z, heading, clip, time, tint);
          if (own) pool.mark(slot, id, outlined);
          drawn = true;
          for (const piece of look.worn) this.wear(pool, piece, x, ry, z, heading, clip, time, tint, own ? id : 0, outlined);
          for (const [item, bone, stow] of look.attach) {
            const b = pool.bone(bone);
            if (b < 0) continue;
            const m = slot.m.boneWorld(slot.i, b, this.mat);
            if (stow !== Stow.None) m.multiply(STOW_TURN[`${stow}${POINT_UP.test(item) ? 'up' : 'down'}`]!);
            this.attach.add(item, m, tint);
            if (stow === Stow.None) this.noteMuzzle(id, item, m);
          }
          if (load.hold && !inCart) {
            const b = pool.bone(HOLD_SLOTS[load.hold]);
            if (b >= 0) this.attach.add(load.good, slot.m.boneWorld(slot.i, b, this.mat));
          }
          // The top mages' halos: flames for battle, sparkling light for support (Jade, Patch 5).
          const school = d[o + S.school]!;
          if (kind === UnitKind.Mage && !people && d[o + S.rank] === MAGE_TOP_RANK && (school === School.Battle || school === School.Support) && f.seen(x, z)) {
            const hb = pool.bone('slot_head');
            if (hb >= 0) {
              const head = new THREE.Vector3().setFromMatrixPosition(slot.m.boneWorld(slot.i, hb, this.mat));
              this.halos.add(head.x, head.y, head.z, school === School.Battle, t, id);
              if (Math.random() < dt * 5) this.particles.spawn(head.x, head.y + 0.15, head.z, school === School.Battle ? 0xff6a20 : 0xfff4c0, 1, 0.3, 0.9);
            }
          }
          // Patch 5 (MB-22, VX-5): a held Beam leaves from her wand's tip, and a spell's light gathers there while she casts.
          const hand = kind === UnitKind.Mage && (d[o + S.beam] !== 0 || d[o + S.cast] !== 0) ? pool.bone('slot_hand_r') : -1;
          if (hand >= 0) this.tips.set(id, wandTip(slot.m, slot.i, hand, this.lib?.models.get(look.attach.find(([, b]) => b === 'slot_hand_r')?.[0] ?? ''), new THREE.Vector3()));
        }
      } else {
        dummy.position.set(x, ry, z);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(0.45, tall, 0.45);
        dummy.updateMatrix();
        this.blocks.setMatrixAt(blocks, dummy.matrix);
        this.blocks.setColorAt(blocks, tint ?? f.neutral);
        blocks++;
      }
      // A rider reaches from the ground under its mount to the top of its head.
      if (drawn && own) this.noteOwn(id, x, y, z, ry - y + tall + 0.15, mount !== 0 ? 1.3 : 0.45, outlined);
      // A hand cart is pushed ahead of its worker; an ox cart with nothing hitched is pulled by the worker at its shafts.
      if (cart === Res.HandCart) this.drawCart(f, 'cart_hand', x - Math.sin(heading) * HAND_CART_AHEAD_M, z - Math.cos(heading) * HAND_CART_AHEAD_M, heading, moving, colour, load.good);
      else if (cart === Res.OxCart && d[o + S.partner] === 0) this.drawCart(f, 'cart_ox', x + Math.sin(heading) * (OX_CART_HITCH_M - 0.3), z + Math.cos(heading) * (OX_CART_HITCH_M - 0.3), heading, moving, colour, load.good);
      // A good with no model of its own is still a box on the back.
      const carry = d[o + S.carryRes]!;
      if (!inCart && carry !== NO_CARRY && d[o + S.carryAmt]! > 0 && !load.good) {
        // On the back: behind the unit (the model faces -Z at heading 0).
        dummy.position.set(x + Math.sin(heading) * 0.22, y + 1.05, z + Math.cos(heading) * 0.22);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.loads.setMatrixAt(loads, dummy.matrix);
        this.loads.setColorAt(loads, loadColour(carry));
        loads++;
      }
    }
    this.hoverNow.on = false;
    for (const id of this.swingStart.keys()) if (!live.has(id)) this.swingStart.delete(id);
    for (const id of this.shotAt.keys()) if (!live.has(id)) this.shotAt.delete(id);
    for (const id of this.caughtAt.keys()) if (!live.has(id)) this.caughtAt.delete(id);
    for (const id of this.matedAt.keys()) if (!live.has(id)) this.matedAt.delete(id);
    for (const id of this.woodsmen) if (!live.has(id)) this.woodsmen.delete(id);
    for (const id of this.tinkerStart.keys()) if (!live.has(id)) this.tinkerStart.delete(id);
    for (const id of this.fired.keys()) if (!live.has(id)) this.fired.delete(id);
    this.dread.keep(live);
    for (const id of this.held.keys()) if (!live.has(id)) this.held.delete(id);
    for (const id of this.forms.keys()) if (!live.has(id)) this.forms.delete(id);
    for (const id of this.morvathAt.keys()) if (!live.has(id)) this.morvathAt.delete(id);
    blocks = this.drawCorpses(t, blocks);
    blocks = this.drawRuins(f, blocks);
    for (const b of this.bodies.values()) b.commit();
    this.attach.commit();
    this.halos.commit();
    this.blocks.count = blocks;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
    this.loads.count = loads;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
    this.drawShots(f, prev ? alpha : 1);
    this.drawBeams(f);
    this.particles.update(dt);
    this.spellFx.end(this.where);
    this.hearts.update(now);
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.crescents.update(now);
  }

  /**
   * A mount under its rider: its own model with the clip for its pace (a
   * gallop or charge once the run counts as a charge), else a block the
   * mount's size. Returns the height of the rider's seat, metres.
   */
  private drawMount(d: Int32Array, o: number, mount: number, x: number, y: number, z: number, heading: number, clipT: number, colour: THREE.Color | null, blocks: number, ownId: number, outlined: boolean): { y: number; blocks: number } {
    const spec = mountSpec(mount);
    const pool = this.body(spec.model);
    const flags = d[o + S.flags]!;
    const moving = d[o + S.order] !== OrderKind.Idle;
    if (pool) {
      const slot = pool.take(spec.model === 'elf_war_bear' ? ['saddle'] : []);
      if (slot) {
        const clips = pool.model.clips;
        const clip = flags & UnitFlag.Charging ? firstClip(clips, ['charge', 'gallop', 'run', 'walk']) : moving ? firstClip(clips, ['trot', 'walk']) : 'idle';
        slot.m.setInstance(slot.i, x, y, z, heading, clip, clipT, colour);
        // The mount carries its rider's id: one silhouette for the outline.
        if (ownId) pool.mark(slot, ownId, outlined);
        // A cavalry horse wears its saddle and bridle (Patch 5).
        if (spec.model === 'horse') this.wear(pool, 'horse_tack', x, y, z, heading, clip, clipT, colour, ownId, outlined);
        const b = pool.bone('slot_rider');
        if (b >= 0) {
          const at = new THREE.Vector3().setFromMatrixPosition(slot.m.boneWorld(slot.i, b, this.mat));
          return { y: at.y, blocks };
        }
      }
      return { y: y + spec.shoulderCm / 100, blocks };
    }
    if (blocks < MAX_UNITS) {
      const dummy = this.dummy;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(0.7, spec.shoulderCm / 100, 2.1);
      dummy.updateMatrix();
      this.blocks.setMatrixAt(blocks, dummy.matrix);
      this.blocks.setColorAt(blocks, new THREE.Color(MOUNT_COLOURS[mount] ?? 0x6a4a30));
      blocks++;
    }
    return { y: y + spec.shoulderCm / 100, blocks };
  }

  /** A siege engine or cannon: its model with the clip for what it does (towed, aimed, firing), smoke when it fires, else a wooden block its size. */
  private drawEngine(f: UnitsFrame, d: Int32Array, o: number, x: number, y: number, z: number, heading: number, colour: THREE.Color | null, clipT: number, blocks: number, ownId: number, outlined: boolean): number {
    if (!f.seen(x, z)) return blocks;
    const spec = engineSpec(d[o + S.mob]!);
    const id = d[o + S.id]!;
    const firing = d[o + S.order] === OrderKind.Shoot;
    const fires = firing && this.fired.get(id) !== f.curr.step;
    if (fires) this.fired.set(id, f.curr.step);
    if (fires && !spec.cannon) this.particles.spawn(x, y + 1.2, z, 0x8a5a2a, 6, 1.2, 1.4);
    // Patch 5 (MB-7, Jade: "Make sure it actually comes from the muzzle"): a cannon's flash, sparks and 5 s of smoke at its model's slot_muzzle, 1.2 m ahead while it is a block.
    const muzzle = fires && spec.cannon ? new THREE.Vector3(x - Math.sin(heading) * 1.2, y + 1, z - Math.cos(heading) * 1.2) : null;
    const pool = this.body(spec.model);
    if (pool) {
      const slot = pool.take([]);
      const clips = pool.model.clips;
      const hauled = d[o + S.crew]! >= 1000;
      const clip = firing ? 'fire' : d[o + S.order] === OrderKind.Move ? (hauled ? 'move_towed' : firstClip(clips, ['move', 'move_towed'])) : d[o + S.target] !== 0 ? 'aim' : d[o + S.hp]! * 3 < d[o + S.maxHp]! ? firstClip(clips, ['damaged', 'idle']) : 'idle';
      if (slot) {
        slot.m.setInstance(slot.i, x, y, z, heading, clip, firing ? 0 : clipT, colour);
        const b = muzzle ? pool.bone('slot_muzzle') : -1;
        if (b >= 0) muzzle!.setFromMatrixPosition(slot.m.boneWorld(slot.i, b, this.mat));
        if (ownId) {
          pool.mark(slot, ownId, outlined);
          this.noteOwn(ownId, x, y, z, spec.height / WU_PER_METRE, (spec.halfWidth * 1.6) / WU_PER_METRE, outlined);
        }
      }
      if (muzzle) this.gunFire(muzzle.x, muzzle.y, muzzle.z, heading, GUN_SMOKE.cannon);
      return blocks;
    }
    if (muzzle) this.gunFire(muzzle.x, muzzle.y, muzzle.z, heading, GUN_SMOKE.cannon);
    if (blocks >= MAX_UNITS) return blocks;
    const dummy = this.dummy;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE / 2, (spec.halfWidth * 3) / WU_PER_METRE);
    dummy.updateMatrix();
    this.blocks.setMatrixAt(blocks, dummy.matrix);
    this.blocks.setColorAt(blocks, new THREE.Color(spec.cannon ? 0xb08a40 : 0x7a5a30));
    return blocks + 1;
  }

  /** A held Beam (Patch 5, MB-22): a stream of light from her wand's tip (her hand before her pose is known) to the target's chest; and the light of a spell being cast (VX-5). */
  private drawBeams(f: UnitsFrame): void {
    const d = f.curr.data;
    let k = 0;
    for (let i = 0; i < f.curr.count && k < 256; i++) {
      const o = i * STATE_STRIDE;
      const target = d[o + S.beam]!;
      if (target === 0 || d[o + S.kind] !== UnitKind.Mage) continue;
      const a = this.where.get(d[o + S.id]!);
      const b = this.where.get(target);
      if (!a || !b || !f.seen(a.x, a.z)) continue;
      const from = this.tips.get(d[o + S.id]!) ?? new THREE.Vector3(a.x, a.y + 1.1, a.z);
      this.spellFx.beam(from, new THREE.Vector3(b.x, b.y + 0.9, b.z));
      k++;
    }
    // Patch 5 (VX-5): a mage casting, her spell's light gathering at her wand's tip.
    for (let i = 0; i < f.curr.count; i++) {
      const o = i * STATE_STRIDE;
      const cast = d[o + S.cast]!;
      if (cast === 0 || d[o + S.beam] !== 0 || d[o + S.kind] !== UnitKind.Mage) continue;
      const tip = this.tips.get(d[o + S.id]!);
      if (tip && f.seen(tip.x, tip.z)) this.spellFx.casting(cast - 1, tip);
    }
  }

  private drawCorpses(t: number, blocks: number): number {
    const keep: Corpse[] = [];
    for (const c of this.corpses) {
      const age = t - c.t0 / 1000;
      if (age > CORPSE_LIE_S + CORPSE_SINK_S) continue;
      keep.push(c);
      const sink = age > CORPSE_LIE_S ? ((age - CORPSE_LIE_S) / CORPSE_SINK_S) * 0.6 : 0;
      const pool = this.body(c.model);
      if (pool) {
        const slot = pool.take(c.parts ?? []);
        // Morvath aloft falls with his second form's death (Jade's Patch 5).
        const death = c.mob === Mob.MorvathAloft && pool.model.clips.has('death_phase_two') ? 'death_phase_two' : 'death';
        if (slot) slot.m.setInstance(slot.i, c.x, c.y - sink, c.z, c.heading, death, age, c.colour, c.mob >= 0 ? mobScale(c.model, mobSpec(c.mob).height) : 1);
      } else if (c.mob >= 0) {
        const spec = mobSpec(c.mob);
        const dummy = this.dummy;
        dummy.position.set(c.x, c.y - sink, c.z);
        dummy.rotation.set(0, c.heading, Math.PI / 2);
        dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE, (spec.halfWidth * 2) / WU_PER_METRE);
        dummy.updateMatrix();
        this.blocks.setMatrixAt(blocks, dummy.matrix);
        this.blocks.setColorAt(blocks, new THREE.Color(MOB_COLOURS[c.mob] ?? 0x555555).multiplyScalar(0.6));
        blocks++;
      }
    }
    this.corpses.length = 0;
    this.corpses.push(...keep);
    return blocks;
  }

  /** Destroyed lairs on explored land: the lair's destroyed model, else a low dark block. */
  private drawRuins(f: UnitsFrame, blocks: number): number {
    const dummy = this.dummy;
    for (const [mob, wx, wz] of f.ruins) {
      const x = wx / WU_PER_METRE;
      const z = wz / WU_PER_METRE;
      if (!f.known(x, z)) continue;
      const spec = mobSpec(mob);
      const y = f.groundAt(x, z);
      const pool = this.body(`${spec.model}_destroyed`);
      if (pool) {
        const slot = pool.take([]);
        if (slot) slot.m.setInstance(slot.i, x, y, z, 0, 'idle', 0, null);
        continue;
      }
      if (blocks >= MAX_UNITS) break;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, 0.4, (spec.halfWidth * 2) / WU_PER_METRE);
      dummy.updateMatrix();
      this.blocks.setMatrixAt(blocks, dummy.matrix);
      this.blocks.setColorAt(blocks, new THREE.Color(MOB_COLOURS[mob] ?? 0x555555).multiplyScalar(0.45));
      blocks++;
    }
    return blocks;
  }

  private drawShots(f: UnitsFrame, alpha: number): void {
    const s = f.curr.shots;
    const n = Math.min(MAX_SHOTS, Math.floor(s.length / SHOT_STRIDE));
    const dummy = this.dummy;
    const dir = new THREE.Vector3();
    let k = 0;
    let hot = 0;
    // Hot lead (VX-4): by day a faint short grey dash, at night a long bright orange streak.
    const dark = Math.min(1, Math.max(0, this.darkness));
    const streakLen = 0.25 + 1.25 * dark;
    const streakW = 0.025 + 0.03 * dark;
    const streakColour = new THREE.Color(0x8a8478).lerp(STREAK_HOT, dark);
    (this.streaks.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * dark;
    for (let i = 0; i < n; i++) {
      const o = i * SHOT_STRIDE;
      const x0 = s[o]! / WU_PER_METRE;
      const y0 = s[o + 1]! / WU_PER_METRE;
      const z0 = s[o + 2]! / WU_PER_METRE;
      const x1 = s[o + 3]! / WU_PER_METRE;
      const y1 = s[o + 4]! / WU_PER_METRE;
      const z1 = s[o + 5]! / WU_PER_METRE;
      const x = x0 + (x1 - x0) * alpha;
      const y = y0 + (y1 - y0) * alpha;
      const z = z0 + (z1 - z0) * alpha;
      if (!f.seen(x, z)) continue;
      const look = SHOT_LOOKS[s[o + 6]!] ?? SHOT_LOOKS[0]!;
      dummy.position.set(x, y, z);
      dir.set(x1 - x0, y1 - y0, z1 - z0);
      if (dir.lengthSq() > 1e-9) dummy.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
      else dir.set(0, 0, -1);
      // Patch 5: bolts of magic fly as their own models, glowing, with a trail (spell-fx.ts).
      if (this.spellFx.shot(s[o + 6]!, x, y, z, dir)) continue;
      if (SHOT_MODELS_BACKWARD.has(s[o + 6]!)) dummy.quaternion.multiply(HALF_TURN);
      const gun = GUNPOWDER.has(s[o + 6]!);
      // A bronze cannon's shot is smaller than an iron one's (MB-8).
      const size = s[o + 6] === Shot.BronzeCannonball ? 0.75 : 1;
      if (gun) {
        // The streak trails behind the ball, drawn as its model in front of it.
        const w = s[o + 6] === Shot.Cannonball ? streakW * 2 : s[o + 6] === Shot.BronzeCannonball ? streakW * 1.5 : streakW;
        dummy.position.set(x - dir.x * streakLen * 0.5, y - dir.y * streakLen * 0.5, z - dir.z * streakLen * 0.5);
        dummy.scale.set(w, w, streakLen);
        dummy.updateMatrix();
        this.streaks.setMatrixAt(hot, dummy.matrix);
        this.streaks.setColorAt(hot, streakColour);
        hot++;
        dummy.position.set(x, y, z);
      }
      const model = SHOT_MODELS[s[o + 6]!];
      if (model && this.lib?.listed(model)) {
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        this.attach.add(model, dummy.matrix);
        continue;
      }
      if (gun) continue;
      dummy.scale.set(look.w, look.w, look.len);
      dummy.updateMatrix();
      this.shots.setMatrixAt(k, dummy.matrix);
      this.shots.setColorAt(k, new THREE.Color(look.colour));
      k++;
    }
    this.shots.count = k;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
    this.streaks.count = hot;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
  }
}

const STREAK_HOT = new THREE.Color(0xffa030);

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * A worn piece made a body's own (armour and boots on Jade's bodies, tack on
 * a horse): each of its cubes moved by the body's bone of the same name as
 * its own (or its nearest such ancestor's), so it plays the body's clips. The
 * pieces are made on the body's rest pose, their bones where the body's are.
 */
function wornOn(body: ModelData, piece: ModelData): ModelData {
  const bones = piece.sidecar.bones;
  const to = bones.map((_, b) => {
    for (let n = b; n >= 0; n = bones[n]!.parent) {
      const k = body.boneNames.indexOf(bones[n]!.name);
      if (k >= 0) return k;
    }
    return 0;
  });
  const geometry = piece.geometry.clone();
  const bone = geometry.getAttribute('bone') as THREE.BufferAttribute;
  for (let v = 0; v < bone.count; v++) bone.setX(v, to[Math.round(bone.getX(v))] ?? 0);
  return { ...piece, id: `${body.id}+${piece.id}`, geometry, boneCount: body.boneCount, boneNames: body.boneNames, clips: body.clips, restWorld: body.restWorld };
}

/** The model a structure is drawn with: goblin huts come in three looks, picked by the hut's id. */
function structureModel(model: string, id: number): string {
  return model === 'goblin_hut_1' ? `goblin_hut_${1 + (id % 3)}` : model;
}

/**
 * Models still to be made (models/troop_kits_models.md), drawn with a near
 * kin's model until theirs is in the catalogue (s).
 */

/** Each model's height as drawn for the first mob that uses it, metres. */
const MOB_MODEL_HEIGHT = new Map<string, number>();
for (const m of MOBS) if (!MOB_MODEL_HEIGHT.has(m.model)) MOB_MODEL_HEIGHT.set(m.model, m.height);

/** A mob sharing another's model (the small slime) is that model sized to its own height. */
function mobScale(model: string, height: number): number {
  const first = MOB_MODEL_HEIGHT.get(model);
  return first ? height / first : 1;
}

/** An animal's clip: its attack while it swings, hurt, running away, walking or standing. */
function animalClip(model: ModelData, d: Int32Array, o: number, moving: boolean): string {
  const flags = d[o + S.flags]!;
  if (d[o + S.swing] !== 0) {
    for (const n of model.clips.keys()) if (n.startsWith('attack') || n === 'bite' || n === 'peck' || n === 'swipe' || n === 'charge') return n;
  }
  if (flags & UnitFlag.Hurt && model.clips.has('injured')) return 'injured';
  // Hornets and griffins fly from place to place.
  if (moving) return flags & UnitFlag.Fleeing ? firstClip(model.clips, ['fly', 'run', 'walk']) : firstClip(model.clips, ['fly', 'walk', 'run']);
  return 'idle';
}

/** A monster's clip: its attack while it swings, climbing, flying, running away, hurt, walking or standing. */
function mobClip(model: ModelData, d: Int32Array, o: number): string {
  const has = (n: string): boolean => model.clips.has(n);
  const flags = d[o + S.flags]!;
  if (d[o + S.swing] !== 0) {
    for (const n of model.clips.keys()) if (n.startsWith('attack') || n === 'bow_shoot' || n === 'sling_throw' || n === 'detonate') return n;
  }
  if (flags & UnitFlag.Climbing && has('climb')) return 'climb';
  if (flags & UnitFlag.Hurt && has('injured')) return 'injured';
  const moving = d[o + S.order] !== OrderKind.Idle;
  const moves = mobSpec(d[o + S.mob]!).moves;
  // A high flyer stooping on a lone worker dives; circling, it flies.
  if (flags & UnitFlag.Swooping && has('dive')) return 'dive';
  if ((moves === Moves.LowFlyer || moves === Moves.HighFlyer) && has('fly')) return 'fly';
  // A goblin wolf rider's model rides (charge, ride, ride_idle) where others walk.
  if (flags & UnitFlag.Charging && has('charge')) return 'charge';
  if (moving) return flags & UnitFlag.Fleeing && has('run') ? 'run' : firstClip(model.clips, ['walk', 'ride']);
  return firstClip(model.clips, ['idle', 'ride_idle']);
}

/** Morvath aloft (Jade's Patch 5 model): his staff while he swings, his second form's walk and idle, hurt as before. */
function aloftClip(model: ModelData, d: Int32Array, o: number): string {
  if (d[o + S.swing] !== 0) return mobClip(model, d, o);
  if (d[o + S.flags]! & UnitFlag.Hurt && model.clips.has('injured')) return 'injured';
  return d[o + S.order] !== OrderKind.Idle ? firstClip(model.clips, ['walk_phase_two', 'walk']) : firstClip(model.clips, ['idle_phase_two', 'idle']);
}

/** The first of some clips a model has, else the last named. */
function firstClip(clips: ReadonlyMap<string, unknown>, names: readonly string[]): string {
  for (const n of names) if (clips.has(n)) return n;
  return names[names.length - 1]!;
}

/** Where a rider's hips sit up its height (s): the seat is at the mount's rider slot. */
const HIP_SHARE = 0.53;

/** Mount stand-in colours by Mount: horse, war ox, wolf, war bear. */
const MOUNT_COLOURS = [0, 0x6a4a30, 0x5a4030, 0x7a7a80, 0x4a3020];

/** A rider's clip (the riding clips of the warrior body, or a people's rider's own): shooting, a thrust or slash, the charge, else sitting. */
function rideClip(clips: ReadonlyMap<string, unknown>, d: Int32Array, o: number): string {
  const swing = d[o + S.swing]!;
  const flags = d[o + S.flags]!;
  const inHand = d[o + S.weapon]!;
  if (swing === Slot.Ranged + 1) return firstClip(clips, ['ride_bow_shoot', 'ride_attack_1h', 'ride']);
  if (swing !== 0) return polearm(inHand) ? firstClip(clips, ['ride_attack_polearm', 'ride_thrust', 'ride']) : firstClip(clips, ['ride_attack_1h', 'ride_slash', 'ride']);
  if (flags & UnitFlag.Charging) return firstClip(clips, ['ride_charge', 'ride']);
  return firstClip(clips, ['ride_idle', 'ride', 'idle']);
}

/** A monster's stand-in block colour: its own for the early ones, else a colour from its id (violet for the Rift-touched). */
function mobColour(mob: number): number {
  const c = MOB_COLOURS[mob];
  if (c !== undefined) return c;
  if (mobSpec(mob).tint === 'rift') return 0x8a40c0;
  return LATE_COLOURS[mob % LATE_COLOURS.length]!;
}
const LATE_COLOURS = [0x5a2a2a, 0x8a3a1a, 0x3a3a4a, 0x6a5a40, 0x9a2a1a, 0x2a2a3a, 0x7a4a2a, 0x4a2a4a];

/** How high a hop arcs above the straight line from one level to the other, metres (s). */
const HOP_ARC_M = 0.22;

/**
 * A hop up or down a rise under way (Moving over the land): the unit's
 * height on an arc from the level it left to the one it lands on, and
 * whether it goes up. Null when it is not hopping.
 */
export function hopAt(d: Int32Array, o: number, alpha: number): { y: number; up: boolean; t: number } | null {
  const left = d[o + S.hop]!;
  if (left <= 0) return null;
  const t = Math.min(1, Math.max(0, (HOP_STEPS - left + alpha) / HOP_STEPS));
  const rise = d[o + S.hopRise]! / WU_PER_METRE;
  return { y: d[o + S.y]! / WU_PER_METRE - rise * (1 - t) + HOP_ARC_M * 4 * t * (1 - t), up: rise > 0, t };
}

/** The pose of a hop: the body's climb clip going up (or a jump clip, if it has one), else what it was doing. */
function hopClip(clips: ReadonlyMap<string, unknown>, clip: string, up: boolean): string {
  if (clips.has('jump')) return 'jump';
  if (up && clips.has('climb')) return 'climb';
  return clip;
}

/**
 * Patch 5's Run/Walk: a unit set to Run plays its body's run where its look
 * walks (the looks themselves play `climb` on a face).
 */
function gaitClip(clips: ReadonlyMap<string, unknown>, clip: string, flags: number): string {
  if (flags & UnitFlag.Running && clip === 'walk') return firstClip(clips, ['run', 'walk']);
  return clip;
}

/** The sit_down clip's length: the unit sits, then tinkers (the base bodies' clips, Jade's Patch 2). */
const SIT_DOWN_S = 0.6;

/**
 * Jade's Patch 2 tinkering pose for a unit sitting at a timed action `sat`
 * seconds: it sits down, then works with its hands at its chest, head bowed.
 * Null for a body without the clips, which keeps its own.
 */
function tinkerPose(clips: ReadonlyMap<string, unknown>, sat: number, id: number): { clip: string; t: number } | null {
  if (!clips.has('tinker')) return null;
  if (sat < SIT_DOWN_S && clips.has('sit_down')) return { clip: 'sit_down', t: sat };
  return { clip: 'tinker', t: sat - SIT_DOWN_S + (id % 5) * 0.29 };
}

/** What a unit's look needs besides its state: seconds into its clip, whether it moved since the last state, seconds since its last shot (-1: none lately), how it holds what it carries ('' for nothing it holds), and seconds since a woodsman landed his last fish (-1: none yet). */
interface LookContext {
  time: number;
  moving: boolean;
  sinceShot: number;
  hold: Hold | '';
  sinceCatch: number;
}

/** The clip a body has, else walking or standing (a warrior carrying meat home has no carry clip). */
function clipOr(body: ModelData | null, clip: string, moving: boolean): string {
  return !body || body.clips.has(clip) ? clip : moving ? 'walk' : 'idle';
}

/**
 * A worker's look: what it holds for the work it is at (Jade's fishing rod
 * and spade, a prospecting hammer from copper tools up, a torch to relight a
 * light, else its tool for the job) and the rest of its tool kit hung on it,
 * at the hips, then on the back; its clip for the work (Patch 5: every task
 * its own), else hurt, swimming, climbing, running away, pushing its cart,
 * carrying, walking or standing.
 */
function workerLook(d: Int32Array, o: number, body: ModelData | null, c: LookContext): Look {
  const parts = body?.partNames ?? [];
  const look: Look = { parts: [], attach: [], worn: [], clip: 'idle' };
  const order = d[o + S.order]!;
  const flags = d[o + S.flags]!;
  const task = d[o + S.task]!;
  const swing = d[o + S.swing]!;
  const hand = d[o + S.toolHand]!;
  let held = '';
  if (task === Task.Fish) held = 'fishing_rod';
  else if (task === Task.Dig) held = 'spade';
  else if (task === Task.Relight) held = 'torch_hand';
  else if (task === Task.Prospect && d[o + S.wTier]! >= PROSPECT_TOOL_TIER) held = PROSPECT_HAMMERS[d[o + S.wTier]!] ?? 'prospecting_hammer';
  if (!held && hand) {
    // A kit of one piece a job (axe, pick or maul, hammer, sickle or hoe) shows the job's; the flint axe and knife its knife to cut.
    const pieces = piecesOf(hand);
    const job = jobOf(task, order);
    held = (pieces.length > ToolJob.Cut ? pieces[job] : job === ToolJob.Cut ? pieces[pieces.length - 1] : pieces[0]) ?? '';
  }
  if (held) wear(look, held, parts);
  // A Barn's hand wears the farmer's straw hat while he is one (Patch 5, Jade's GP-37 and decisions 2.10).
  if (d[o + S.flags]! & UnitFlag.BarnHand) wear(look, 'hat_farmer', parts, Stow.None, 'slot_head');
  // The rest of the kit: every piece of every tool it has, each once, on the hips and back; a hammer hangs at the hip.
  const stows: ReadonlyArray<readonly [string, number]> = [['slot_hip_r', Stow.Hip], ['slot_hip_l', Stow.Hip], ['slot_back', Stow.Back], ['slot_quiver', Stow.Back]];
  const shown = new Set([held]);
  const rest: string[] = [];
  for (const tool of [hand, d[o + S.toolChop]!, d[o + S.toolBreak]!, d[o + S.toolBuild]!, d[o + S.toolCut]!]) {
    for (const p of tool ? piecesOf(tool) : []) {
      if (shown.has(p)) continue;
      shown.add(p);
      rest.push(p);
    }
  }
  rest.sort((a, b) => Number(/^hammer/.test(b)) - Number(/^hammer/.test(a)));
  rest.forEach((p, k) => {
    const at = stows[k];
    if (at) wear(look, p, parts, at[1], at[0]);
  });
  rankBands(look, d[o + S.rank]!);
  const cart = d[o + S.kit]!;
  let clip = 'idle';
  if (swing !== 0) clip = 'attack_1h_slash';
  else if (flags & UnitFlag.Hurt) clip = 'injured';
  else if (task !== Task.None) clip = TASK_CLIPS[task] ?? 'idle';
  else if (order === OrderKind.Swim) clip = 'swim';
  else if (order === OrderKind.Climb || flags & UnitFlag.Climbing) clip = 'climb';
  else if (c.moving) {
    if (flags & UnitFlag.Fleeing) clip = 'run';
    else if (cart === Res.HandCart || (cart === Res.OxCart && d[o + S.partner] === 0)) clip = 'pull_cart';
    else clip = c.hold === 'shoulder' ? 'carry_shoulder' : c.hold === 'arms' ? 'carry' : 'walk';
  } else if (order === OrderKind.Attack) clip = 'guard_1h';
  // A fisher casts its line, then waits for the bite.
  if (task === Task.Fish && swing === 0 && !(flags & UnitFlag.Hurt) && body) {
    const cast = body.clips.get('fish_cast')?.length ?? 0;
    const at = ((c.time % FISH_CYCLE_S) + FISH_CYCLE_S) % FISH_CYCLE_S;
    clip = at < cast ? 'fish_cast' : 'fish_wait';
    look.t = at < cast ? at : at - cast;
  }
  look.clip = clipOr(body, clip, c.moving);
  return look;
}

/** A worker's or warrior's rank on the left upper arm, over any armour: bands from rank 2 (rank_mark_2 to _5; rank 1 has none). */
function rankBands(look: Look, rank: number): void {
  if (rank >= 2) look.worn.push(`rank_mark_${Math.min(5, rank)}`);
}

/** The job of the tool a worker has in hand, as the sim picks it (units/tools.ts toolInHand): building and relighting, chopping, mining and digging, or farming. */
function jobOf(task: number, order: number): number {
  if (task === Task.Build || task === Task.Relight) return ToolJob.Build;
  if (order === OrderKind.Mine || order === OrderKind.Dig) return ToolJob.Break;
  return order === OrderKind.Farm ? ToolJob.Cut : ToolJob.Chop;
}

/** A mage's body: her school's robe at her robe tier once it is in the library (Patch 5: battle blue to red, support green to white), else the plain mage. */
function mageBody(d: Int32Array, o: number, lib: ModelLibrary | null): string {
  const robe = d[o + S.aTier]!;
  if (robe <= 0) return 'mage';
  const look = `mage_${SCHOOL_LOOKS[d[o + S.school]!] ?? 'support'}_${Math.min(6, robe)}`;
  return lib?.listed(look) ? look : 'mage';
}

/**
 * A mage's wand, each tier its own model in her right hand, and her clip:
 * the spell's own clip while she casts (Table 13), the beam clip while she
 * holds one, the bolt clip for a tap of the wand, then hurt, swimming,
 * climbing, walking or standing.
 */
function mageLook(d: Int32Array, o: number, body: ModelData | null, c: LookContext): Look {
  const look: Look = { parts: [], attach: [], worn: [], clip: 'idle' };
  for (const p of piecesOf(d[o + S.weapon]!)) look.attach.push([p, 'slot_hand_r', Stow.None]);
  const cast = d[o + S.cast]!;
  const flags = d[o + S.flags]!;
  const order = d[o + S.order]!;
  let clip = 'idle';
  if (cast !== 0) clip = SPELLS[cast - 1]?.clip ?? 'cast_bolt';
  else if (d[o + S.beam] !== 0) clip = 'cast_beam';
  else if (d[o + S.swing] !== 0) clip = 'cast_bolt';
  else if (flags & UnitFlag.Hurt) clip = 'injured';
  else if (order === OrderKind.Swim) clip = 'swim';
  else if (order === OrderKind.Climb || flags & UnitFlag.Climbing) clip = 'climb';
  else if (c.moving) clip = flags & UnitFlag.Fleeing ? 'run' : 'walk';
  look.clip = clipOr(body, clip, c.moving);
  return look;
}

/** An artillery crewman's drill at his gun, round and round: powder in with the ladle, the shot rammed home, aim, fire with the linstock. */
const CREW_DRILL: ReadonlyArray<readonly [string, string]> = [
  ['cannon_load', 'cannon_rammer_ladle'],
  ['cannon_load', 'cannon_rammer'],
  ['cannon_aim', ''],
  ['cannon_fire', 'linstock'],
];

/**
 * A warrior's look: the weapon or ranged weapon in hand and the other on its
 * back, the quiver with a bow or the bolt case with a crossbow, its shield,
 * armour, helmet and boots, each at its tier (Patch 5, Jade: "no invisible
 * equippable gear"); a crewman's rammer or linstock at his drill.
 */
function warriorLook(d: Int32Array, o: number, body: ModelData | null, c: LookContext): Look {
  const parts = body?.partNames ?? [];
  const look: Look = { parts: [], attach: [], worn: [], clip: 'idle' };
  const swing = d[o + S.swing]!;
  const weapon = d[o + S.weapon]!;
  const ranged = d[o + S.ranged]!;
  // A ranger's close weapon is its fists: its bow, sling or gun stays in hand.
  const inHand = swing === Slot.Ranged + 1 || (ranged && piecesOf(weapon).length === 0) ? ranged : weapon;
  // The brawler's close weapon, the tier 8 close-melee row, is drawn as the brawler's cutlass (Table 2e).
  const pieces = (gear: number): readonly string[] => (gear === weapon && d[o + S.troop] === Troop.Brawler ? ['cutlass'] : piecesOf(gear));
  for (const p of pieces(inHand)) wear(look, p, parts);
  for (const p of pieces(inHand === ranged ? weapon : ranged)) wear(look, p, parts, Stow.Back);
  const shot = gearModel(ranged);
  if (/^bow/.test(shot)) wear(look, 'quiver', parts);
  else if (/^crossbow/.test(shot)) wear(look, 'bolt_case', parts);
  for (const p of piecesOf(d[o + S.shield]!)) wear(look, p, parts);
  for (const p of piecesOf(d[o + S.armour]!)) wear(look, p, parts);
  rankBands(look, d[o + S.rank]!);
  // The artillery crewman: Jade's warrior body in the crew outfit (Patch 5).
  const crew = d[o + S.troop] === Troop.Crew;
  if (crew) look.worn.push('crew_outfit');
  if (d[o + S.task] === Task.Crew && crew && swing === 0 && body) {
    if (c.moving) look.clip = 'cannon_push';
    else {
      const lengths = CREW_DRILL.map(([clip]) => body.clips.get(clip)?.length ?? 1);
      const total = lengths.reduce((a, b) => a + b, 0);
      let at = ((c.time % total) + total) % total;
      let k = 0;
      while (k < CREW_DRILL.length - 1 && at >= lengths[k]!) at -= lengths[k++]!;
      const [clip, tool] = CREW_DRILL[k]!;
      look.clip = clip;
      look.t = at;
      if (tool) wear(look, tool, parts);
    }
    return look;
  }
  // Away from the gun, the crewman's rammer is in hand.
  if (crew && piecesOf(inHand).length === 0) wear(look, 'cannon_rammer', parts);
  const clip = warriorClip(d, o, inHand, c);
  look.clip = clipOr(body, clip.clip, c.moving);
  if (clip.t !== undefined) look.t = clip.t;
  return look;
}

/**
 * A warrior's clip: the shot of the weapon in hand (bow, sling, crossbow,
 * gun) or its blow (a halberd's swing, a spear's or pike's thrust, a short
 * sword's stab, else a slash), the shield up or hurt, swimming, climbing,
 * running away or walking, reloading a crossbow or gun after a shot, on guard
 * with a target, else standing.
 */
function warriorClip(d: Int32Array, o: number, inHand: number, c: LookContext): { clip: string; t?: number } {
  const swing = d[o + S.swing]!;
  const flags = d[o + S.flags]!;
  const order = d[o + S.order]!;
  const model = gearModel(inHand);
  if (swing === Slot.Ranged + 1) {
    return { clip: /^bow/.test(model) ? 'bow_shoot' : model === 'sling' ? 'sling_throw' : /^crossbow/.test(model) ? 'crossbow_shoot' : /^(musket|pistol)/.test(model) ? 'musket_fire' : 'throw_spear' };
  }
  if (swing !== 0) return { clip: SWUNG.test(model) ? 'attack_polearm_swing' : polearm(inHand) ? 'attack_polearm_thrust' : /^sword_short/.test(model) ? 'attack_1h_stab' : 'attack_1h_slash' };
  if (flags & UnitFlag.Hurt) return { clip: d[o + S.shield] !== 0 ? 'shield_block' : 'injured' };
  if (order === OrderKind.Swim) return { clip: 'swim' };
  if (order === OrderKind.Climb || flags & UnitFlag.Climbing) return { clip: 'climb' };
  if (c.moving) return { clip: flags & UnitFlag.Fleeing ? 'run' : 'walk' };
  if (c.sinceShot >= 0 && /^(crossbow|musket|pistol)/.test(model)) return { clip: /^crossbow/.test(model) ? 'crossbow_reload' : 'musket_reload', t: c.sinceShot };
  if (d[o + S.target] !== 0) return { clip: polearm(inHand) ? 'guard_polearm' : 'guard_1h' };
  return { clip: 'idle' };
}

/**
 * The woodsman's look (Patch 5, Jade's WD-3, WD-6 and FR-2): his long weapon
 * in hand; while he fishes his rod (his body's own part: "a visual fishing
 * rod that does not need to be built ... the model doesn't walk around with
 * this showing") is in his hand and the weapon on his back, and while he
 * forages the weapon is on his back, his hands free. His clip: the blow of the weapon, hurt, swimming,
 * climbing, running away or walking, then casting his line and waiting for
 * the bite (cast again each time a fish comes up), picking low or high, on
 * guard with a target, else standing.
 */
function woodsmanLook(d: Int32Array, o: number, body: ModelData | null, c: LookContext): Look {
  const parts = body?.partNames ?? [];
  const look: Look = { parts: [], attach: [], worn: [], clip: 'idle' };
  const weapon = d[o + S.weapon]!;
  const order = d[o + S.order]!;
  const fishing = order === OrderKind.Fish;
  const working = fishing || order === OrderKind.ForageLow || order === OrderKind.ForageHigh;
  for (const p of piecesOf(weapon)) wear(look, p, parts, working ? Stow.Back : Stow.None);
  if (fishing) wear(look, 'fishing_rod', parts);
  rankBands(look, d[o + S.rank]!);
  const clip = warriorClip(d, o, weapon, c);
  const busy = d[o + S.swing] !== 0 || (d[o + S.flags]! & UnitFlag.Hurt) !== 0 || c.moving;
  if (fishing && !busy && body) {
    const cast = body.clips.get('fish_cast')?.length ?? 0;
    const since = c.sinceCatch >= 0 ? c.sinceCatch : c.time;
    const at = ((since % WOODS.fishS) + WOODS.fishS) % WOODS.fishS;
    look.clip = at < cast ? 'fish_cast' : 'fish_wait';
    look.t = at < cast ? at : at - cast;
    return look;
  }
  if (working && !busy) clip.clip = order === OrderKind.ForageLow ? 'forage_low' : 'forage_high';
  look.clip = clipOr(body, clip.clip, c.moving);
  if (clip.t !== undefined) look.t = clip.t;
  return look;
}

/** Colour of a carried load by resource (a few families; the rest sandy). */
const LOAD_COLOURS = new Map<number, THREE.Color>();
function loadColour(res: number): THREE.Color {
  let c = LOAD_COLOURS.get(res);
  if (!c) {
    const name = RESOURCES[res]?.name.toLowerCase() ?? '';
    c = new THREE.Color(name.includes('softwood') ? 0xb07a48 : name.includes('hardwood') ? 0x7a4e2a : name.includes('stone') ? 0x9a9a94 : name.includes('flint') ? 0x5a5a66 : name.includes('herb') ? 0x4a9a4a : name.includes('stick') ? 0x8a6a3a : 0xc8b070);
    LOAD_COLOURS.set(res, c);
  }
  return c;
}
