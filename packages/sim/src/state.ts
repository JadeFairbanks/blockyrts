// The simulation state. Units live in struct-of-arrays typed arrays and are
// always iterated by index, so every machine visits them in the same order;
// each unit's order list and path are plain integer arrays beside them.
// Buildings are records in id order (buildings/store.ts) and every player
// has one shared resource pool.

import { BuildingKind, BUILDING_CLAIM_M, BUILDING_SIGHT_M, buildingSpec, levelSpec } from './buildings/data.ts';
import { footprintDims } from './buildings/footprints.ts';
import { BuildingStore, footprintRect, garrisonRoom, type Building } from './buildings/store.ts';
import { RESOURCE_COUNT, STARTING_STOCK } from './economy/resources.ts';
import { cos16, floorDiv, sin16, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from './fixed.ts';
import { NavGrid, PERSON, STEP_UNITS, UNDER } from './nav/grid.ts';
import { Pathfinder } from './nav/path.ts';
import { createStreams, hash32, type Streams } from './rng.ts';
import { applyKit, Troop } from './units/kits.ts';
import { UnitGrid } from './combat/space.ts';
import type { UnitOrder } from './units/unit-orders.ts';
import { World } from './world/world.ts';
import { newThreats, type ThreatState } from './threats/types.ts';
import { throughFog } from './threats/fog.ts';
import { MOUNTED } from './mounts/data.ts';
import { onTop } from './units/top.ts';
import { newPeoples, type PeoplesState } from './peoples/types.ts';

/** Owner value for entities that belong to no player. */
export const NEUTRAL = 255;

/**
 * What a unit is doing, for the renderer's animation: idle, walking, or one
 * of the work clips. Idle and Move keep M0's values.
 */
export const OrderKind = {
  Idle: 0,
  Move: 1,
  /** Chopping a tree or building (the worker's chop clip). */
  Chop: 2,
  /** Working a rock, quarrying. */
  Mine: 3,
  /** Hoeing a field or picking plants. */
  Farm: 4,
  /** Swimming. */
  Swim: 5,
  /** Walking with a load. */
  Carry: 6,
  /** A melee swing (the clip follows the weapon in hand). */
  Attack: 7,
  /** Drawing and loosing a ranged weapon. */
  Shoot: 8,
  /** Climbing a wall or cliff face. */
  Climb: 9,
  /** Digging (the worker's hoe and pick clips). */
  Dig: 10,
  /** Running for the dark at dawn. */
  Flee: 11,
  /** A mage casting or holding a beam (the clip follows the spell: castSpell, beamUntil). */
  Cast: 12,
  /** Sitting by a building with its hands at work, the bar over its head filling (Jade's Patch 2: units/tinker.ts). */
  Tinker: 13,
} as const;
export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

/** What an entity is. Wanderers are M0's test of the RNG streams; mobs are the night's monsters. */
export const UnitKind = {
  Worker: 0,
  Warrior: 1,
  Wanderer: 2,
  Mob: 3,
  /** Wild and tamed animals (Animals): the species is in the mob field (animals/species.ts). */
  Animal: 4,
  /** Support and battle mages (Magic): the school is in the school field (magic/spells.ts). */
  Mage: 5,
  /** Milestone 8: siege engines and cannons (siege/data.ts): the engine kind is in the mob field. */
  Engine: 6,
} as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

/** Sight in wu by kind (Table 1: worker 20 m, warrior 24 m, mage 24 m; suggested; mobs see 12 m, animals 16 m, engines 20 m). */
export const SIGHT_WU = [20 * WU_PER_METRE, 24 * WU_PER_METRE, 12 * WU_PER_METRE, 12 * WU_PER_METRE, 16 * WU_PER_METRE, 24 * WU_PER_METRE, 20 * WU_PER_METRE] as const;

/** Owner value for the night's monsters: hostile to every player. */
export const MONSTERS = 254;
/** The owner of wild animals (Animals): nobody's, fought only when they fight. */
export const WILD = 253;
/** The owner of the neutral peoples' units (Neutral villages and trade): their faction is the unit's group (peoples/). */
export const PEOPLES = 252;

/** Units on foot walk 15% slower than the old 3 m/s (Patch 5 GP-16: "Nerf the base walk speed of foot units by 15%"), bp. */
export const FOOT_WALK_BP = 8500;
/** Walking speed of the players' units on foot, as wu per step: 3 m/s at FOOT_WALK_BP, 2.55 m/s (1,020); running is 40% faster (units/moves.ts). */
export const WALK_SPEED_WU = floorDiv(3 * WU_PER_METRE * FOOT_WALK_BP, STEPS_PER_SECOND * 10000);

/** Table 1, worker rank 1 (Labourer): 60 health. */
export const WORKER_HEALTH = 60;

type Column = Uint32Array | Int32Array | Uint16Array | Uint8Array;
type ColumnType = 'u32' | 'i32' | 'u16' | 'u8';

/** Every per-unit scalar, with its storage type; serialisation and the desync diff walk this list. */
export const UNIT_FIELDS = [
  ['id', 'u32'],
  ['owner', 'u8'],
  ['kind', 'u8'],
  /** Position in wu; x east, y up, z south (three.js axes). */
  ['x', 'i32'],
  ['y', 'i32'],
  ['z', 'i32'],
  /** 16-bit heading; 0 faces -Z. */
  ['heading', 'u16'],
  /** Speed in wu per step. */
  ['speed', 'i32'],
  /** OrderKind: what it looks like it is doing. */
  ['order', 'u8'],
  /** Where its current path ends, wu. */
  ['targetX', 'i32'],
  ['targetZ', 'i32'],
  /** For wanderers: the step at which a new destination is chosen; 0 means never. */
  ['wanderAt', 'u32'],
  ['hp', 'i32'],
  ['maxHp', 'i32'],
  /** Rank 1 to 5 (Table 1). */
  ['rank', 'u8'],
  /**
   * The tool held for each job (props.ts ToolJob: chop, break, build, cut):
   * gear ids from the worker's tool kit tier (units/kits.ts), set by applyKit.
   */
  ['toolChop', 'u8'],
  ['toolBreak', 'u8'],
  ['toolBuild', 'u8'],
  ['toolCut', 'u8'],
  /** What it carries (a resource id) and how much; carryRes 255 when empty. */
  ['carryRes', 'u8'],
  ['carryAmt', 'u16'],
  /** The building it is inside, or 0. */
  ['inside', 'u32'],
  /** Phase of the current order (behaviour.ts Act). */
  ['act', 'u8'],
  /** Work done towards the current job, steps. */
  ['timer', 'i32'],
  /** The node it last gathered from, to go back to after a drop-off; nodeI -1 for none. */
  ['nodeCx', 'i32'],
  ['nodeCz', 'i32'],
  ['nodeI', 'i32'],
  /** Next waypoint in its path. */
  ['pathAt', 'u16'],
  /** 1 when its path reaches the goal, 0 when it only gets as near as it can. */
  ['pathOk', 'u8'],
  /** Failed path attempts in a row. */
  ['stuck', 'u8'],
  /** Step at which to try again when waiting. */
  ['waitUntil', 'u32'],
  /** Mobs: which mob (combat/mobs.ts), the player it was sent against, and its strength per mille (+0.5% a night). */
  ['mob', 'u8'],
  ['foe', 'u8'],
  ['power', 'u16'],
  /** Experience in tenths (rules.ts): from fighting, and a worker's from its work too (Patch 3, units/ranks.ts). */
  ['xp', 'i32'],
  /** 0 switches by itself, 1 melee only, 2 ranged only (Warriors: the lock). */
  ['lock', 'u8'],
  /**
   * The kit (Troops and gear): a troop's type (units/kits.ts Troop, fixed
   * when it is trained) and its weapon and armour tiers; a worker's tool
   * kit tier in wTier; a mage's wand and robe tiers. Close melee's shield
   * tier (Patch 5, GP-26), and 1 when a bow or crossbow ranger has poison
   * tips on (Patch 5).
   */
  ['troop', 'u8'],
  ['wTier', 'u8'],
  ['aTier', 'u8'],
  ['sTier', 'u8'],
  ['tips', 'u8'],
  /** What the kit puts in its hands and on its back (units/kits.ts gear ids, 0 for none), set by applyKit. */
  ['weapon', 'u8'],
  ['ranged', 'u8'],
  ['shield', 'u8'],
  /** Lair structures: what they hold (threats/lairs.ts). */
  ['picked', 'u16'],
  /** The unit or building it is fighting, or 0. */
  ['target', 'u32'],
  /** The step its current swing or shot lands (0 for none), the step it may start the next, and what it uses (Attack With). */
  ['atkAt', 'u32'],
  ['atkNext', 'u32'],
  ['atkWith', 'u8'],
  /** Where an auto-target chase began (the leash), and 1 while it chases one. */
  ['homeX', 'i32'],
  ['homeZ', 'i32'],
  ['chasing', 'u8'],
  /** Slowed (zombie grasp, web) and hastened (howl, shout), in bp, until a step. */
  ['slowUntil', 'u32'],
  ['slowBp', 'u16'],
  ['fastUntil', 'u32'],
  ['fastBp', 'u16'],
  /** Held still (slime engulf) until this step. */
  ['heldUntil', 'u32'],
  /** The last step it was hurt, and who hurt it. */
  ['hurtAt', 'u32'],
  ['attacker', 'u32'],
  /** Climbers on a wall face until this step, then over at (climbX, climbZ), wu. */
  ['climbUntil', 'u32'],
  ['climbX', 'i32'],
  ['climbZ', 'i32'],
  /** Ability cooldowns (web spit, howl), and a loose bomb's fuse. */
  ['abilityAt', 'u32'],
  ['fuseAt', 'u32'],
  /** Mobs: 1 when running for the dark (dawn, or a goblin with loot). */
  ['fleeing', 'u8'],
  /** Armour (or a mage's robe), a gear id; and a worker's cart (economy Res.HandCart or Res.OxCart, 0 for none). */
  ['armour', 'u8'],
  ['kit', 'u8'],
  /** Healing over time from eating and medicine (Food): health still to come, until this step. */
  ['mendUntil', 'u32'],
  ['mendLeft', 'i32'],
  /** Poison from a bite or a sting: damage still to come, until this step, and who dealt it. */
  ['dotUntil', 'u32'],
  ['dotLeft', 'i32'],
  ['dotFrom', 'u32'],
  /** Animals: the building a tamed animal belongs to; the step it grows up (young until then, 0 for grown); its next breeding; 1 for a male. */
  ['home', 'u32'],
  ['born', 'u32'],
  ['breedAt', 'u32'],
  ['sex', 'u8'],
  /** A worker and the working animal pulling its cart, each pointing at the other (an entity id), or 0. */
  ['partner', 'u32'],
  /** Mobs: what it is doing besides the night attack (threats/types.ts Role) and its lair, band or village (an id). */
  ['role', 'u8'],
  ['group', 'u32'],
  /** Casters: mana in twentieths (refills 1 a second, so a twentieth a step). */
  ['mana', 'i32'],
  /** Stumble hex: moves and attacks 20% slower until this step. */
  ['hexUntil', 'u32'],
  /** A hop up or down a rise of 3 units or more (Moving over the land) lasts until this step; the rise it made, wu. */
  ['hopUntil', 'u32'],
  ['hopRise', 'i32'],
  /** Mages (milestone 6): support or battle (magic/spells.ts School); hundredths of a mana point still to come from the refill. */
  ['school', 'u8'],
  ['manaAcc', 'u8'],
  /** A spell being cast: 1 + its id (0 for none), the step it lands, and its target unit or spot (wu). */
  ['castSpell', 'u8'],
  ['castAt', 'u32'],
  ['castTarget', 'u32'],
  ['castX', 'i32'],
  ['castZ', 'i32'],
  /** A Beam held on a unit until this step, and the damage it still has to do (worked out through armour when it starts). */
  ['beamUntil', 'u32'],
  ['beamTarget', 'u32'],
  ['beamLeft', 'i32'],
  /** The support spells on a unit, each until a step: Quicken, Fortify, Rally, Warding. */
  ['quickUntil', 'u32'],
  ['fortUntil', 'u32'],
  ['rallyUntil', 'u32'],
  ['wardUntil', 'u32'],
  /** A Heal under way: health still to come, until this step, and the mage who cast it. */
  ['healUntil', 'u32'],
  ['healLeft', 'i32'],
  ['healFrom', 'u32'],
  /** A support mage's health healed in combat not yet worth a tenth of experience (1 XP per 25 healed). */
  ['healXp', 'u8'],
  /** Milestone 7: an Elf Grovesinger's Barkskin on a unit until this step (Table 13: +25% armour). */
  ['barkUntil', 'u32'],
  /** A wild animal answering the Grovesinger's Call of the wild fights for her faction until this step, then goes wild again. */
  ['calledUntil', 'u32'],
  /** Milestone 8: what the unit rides (mounts/data.ts Mount) and its mount's health; a player's horse remembers its Barn and sex for when it is let go. */
  ['mount', 'u8'],
  ['mountHp', 'i32'],
  ['mountHome', 'u32'],
  ['mountSex', 'u8'],
  /** A mounted unit's straight run at gallop so far (the charge rule), where it was last step and its heading then; 1 while a charge is under way. */
  ['runWu', 'i32'],
  ['runX', 'i32'],
  ['runZ', 'i32'],
  ['runHeading', 'u16'],
  ['charge', 'u8'],
  /** When the mount's own attack (a bear's swipe, a war ox's rear archer, a wolf's bite) is next ready. */
  ['mountAtkNext', 'u32'],
  /** Hits a mob has struck (a void stalker's ambush, a Rift scorpion's sting on every other hit); an engine: 1 once it said why it cannot move. */
  ['strikes', 'u8'],
  /** In a plague bearer's miasma until this step: no natural healing. */
  ['sickUntil', 'u32'],
  /** A late night mob's second ability clock (a void witch's blink, Morvath's rift and ruin, a Rift colossus's beam). */
  ['ability2At', 'u32'],
  /** A high flyer swooping is a low flyer until this step (roster: the gravewing's snatch). */
  ['lowUntil', 'u32'],
  /** 1 once inherited from a player who was eliminated or left: every player still in may command it (Multiplayer and saving). */
  ['shared', 'u8'],
  /** The step it first went without a meal (Food: starving), or 0 while it is fed; only units that eat (economy/food.ts) ever starve. */
  ['hungry', 'u32'],
  /**
   * A timed action beside a building (Jade's Patch 2: eating, upgrading, a
   * light relit): how many steps it takes, while the unit sits tinkering with
   * the bar over its head; the steps done are its timer. 0 when it is not
   * tinkering. units/tinker.ts sets it.
   */
  ['tinker', 'u16'],
  /**
   * A worker's work not yet worth a tenth of experience (Patch 3: workers rank
   * up by building and gathering; units/ranks.ts workXp): pace times
   * experience a minute, a step at a time.
   */
  ['workXp', 'u32'],
  /** 1 when a worker is on autorepair (Jade's Patch 5, UI-13; units/repairs.ts): it fixes what of its owner's is damaged within 8 m of it. */
  ['autoRepair', 'u8'],
  /**
   * Patch 5 (GP-16, units/moves.ts): 1 while the unit's Run/Walk button is
   * on Run; how far it has run since it last paid for running, wu.
   */
  ['running', 'u8'],
  ['ranWu', 'i32'],
  /**
   * Patch 5 (GP-18, units/moves.ts): 1 while the unit climbs a face of land
   * or rock, up or down; where it comes off the face, wu.
   */
  ['onFace', 'u8'],
  ['ledgeX', 'i32'],
  ['ledgeY', 'i32'],
  ['ledgeZ', 'i32'],
] as const satisfies ReadonlyArray<readonly [string, ColumnType]>;

type FieldName = (typeof UNIT_FIELDS)[number][0];

function makeColumn(t: ColumnType, n: number): Column {
  switch (t) {
    case 'u32':
      return new Uint32Array(n);
    case 'i32':
      return new Int32Array(n);
    case 'u16':
      return new Uint16Array(n);
    case 'u8':
      return new Uint8Array(n);
  }
}


/** No resource carried. */
export const NO_CARRY = 255;

export class EntityStore implements Record<FieldName, Column> {
  declare id: Uint32Array;
  declare owner: Uint8Array;
  declare kind: Uint8Array;
  declare x: Int32Array;
  declare y: Int32Array;
  declare z: Int32Array;
  declare heading: Uint16Array;
  declare speed: Int32Array;
  declare order: Uint8Array;
  declare targetX: Int32Array;
  declare targetZ: Int32Array;
  declare wanderAt: Uint32Array;
  declare hp: Int32Array;
  declare maxHp: Int32Array;
  declare rank: Uint8Array;
  declare toolChop: Uint8Array;
  declare toolBreak: Uint8Array;
  declare toolBuild: Uint8Array;
  declare toolCut: Uint8Array;
  declare carryRes: Uint8Array;
  declare carryAmt: Uint16Array;
  declare inside: Uint32Array;
  declare act: Uint8Array;
  declare timer: Int32Array;
  declare nodeCx: Int32Array;
  declare nodeCz: Int32Array;
  declare nodeI: Int32Array;
  declare pathAt: Uint16Array;
  declare pathOk: Uint8Array;
  declare stuck: Uint8Array;
  declare waitUntil: Uint32Array;
  declare mob: Uint8Array;
  declare foe: Uint8Array;
  declare power: Uint16Array;
  declare xp: Int32Array;
  declare lock: Uint8Array;
  declare troop: Uint8Array;
  declare wTier: Uint8Array;
  declare aTier: Uint8Array;
  declare sTier: Uint8Array;
  declare tips: Uint8Array;
  declare weapon: Uint8Array;
  declare ranged: Uint8Array;
  declare shield: Uint8Array;
  declare picked: Uint16Array;
  declare target: Uint32Array;
  declare atkAt: Uint32Array;
  declare atkNext: Uint32Array;
  declare atkWith: Uint8Array;
  declare homeX: Int32Array;
  declare homeZ: Int32Array;
  declare chasing: Uint8Array;
  declare slowUntil: Uint32Array;
  declare slowBp: Uint16Array;
  declare fastUntil: Uint32Array;
  declare fastBp: Uint16Array;
  declare heldUntil: Uint32Array;
  declare hurtAt: Uint32Array;
  declare attacker: Uint32Array;
  declare climbUntil: Uint32Array;
  declare climbX: Int32Array;
  declare climbZ: Int32Array;
  declare abilityAt: Uint32Array;
  declare fuseAt: Uint32Array;
  declare fleeing: Uint8Array;
  declare armour: Uint8Array;
  declare kit: Uint8Array;
  declare mendUntil: Uint32Array;
  declare mendLeft: Int32Array;
  declare dotUntil: Uint32Array;
  declare dotLeft: Int32Array;
  declare dotFrom: Uint32Array;
  declare home: Uint32Array;
  declare born: Uint32Array;
  declare breedAt: Uint32Array;
  declare sex: Uint8Array;
  declare partner: Uint32Array;
  declare role: Uint8Array;
  declare group: Uint32Array;
  declare mana: Int32Array;
  declare hexUntil: Uint32Array;
  declare hopUntil: Uint32Array;
  declare hopRise: Int32Array;
  declare school: Uint8Array;
  declare manaAcc: Uint8Array;
  declare castSpell: Uint8Array;
  declare castAt: Uint32Array;
  declare castTarget: Uint32Array;
  declare castX: Int32Array;
  declare castZ: Int32Array;
  declare beamUntil: Uint32Array;
  declare beamTarget: Uint32Array;
  declare beamLeft: Int32Array;
  declare quickUntil: Uint32Array;
  declare fortUntil: Uint32Array;
  declare rallyUntil: Uint32Array;
  declare wardUntil: Uint32Array;
  declare healUntil: Uint32Array;
  declare healLeft: Int32Array;
  declare healFrom: Uint32Array;
  declare healXp: Uint8Array;
  declare barkUntil: Uint32Array;
  declare calledUntil: Uint32Array;
  declare mount: Uint8Array;
  declare shared: Uint8Array;
  declare mountHp: Int32Array;
  declare mountHome: Uint32Array;
  declare mountSex: Uint8Array;
  declare runWu: Int32Array;
  declare runX: Int32Array;
  declare runZ: Int32Array;
  declare runHeading: Uint16Array;
  declare charge: Uint8Array;
  declare mountAtkNext: Uint32Array;
  declare strikes: Uint8Array;
  declare sickUntil: Uint32Array;
  declare ability2At: Uint32Array;
  declare lowUntil: Uint32Array;
  declare hungry: Uint32Array;
  declare tinker: Uint16Array;
  declare workXp: Uint32Array;
  declare autoRepair: Uint8Array;
  declare running: Uint8Array;
  declare ranWu: Int32Array;
  declare onFace: Uint8Array;
  declare ledgeX: Int32Array;
  declare ledgeY: Int32Array;
  declare ledgeZ: Int32Array;
  count = 0;
  capacity: number;
  /** Each unit's orders; the first is the current one. */
  queue: UnitOrder[][] = [];
  /** Each unit's path: waypoints as x, z pairs in wu. */
  path: number[][] = [];
  /** Mobs: the players' units that hit it, as (id, step) pairs, for sharing the kill's experience. */
  hitters: number[][] = [];
  /** Abilities cooling down, as (ability, step it is ready) pairs (threats/abilities.ts; a mage's are its spells, magic/spells.ts). */
  cools: number[][] = [];
  /** The players' units: loot carried to hand in, as (resource, count) pairs (units/loot.ts). */
  bag: number[][] = [];

  private readonly index = new Map<number, number>();

  constructor(capacity = 64) {
    this.capacity = capacity;
    for (const [name, t] of UNIT_FIELDS) (this as unknown as Record<string, Column>)[name] = makeColumn(t, capacity);
  }

  private grow(): void {
    const cap = this.capacity * 2;
    for (const [name, t] of UNIT_FIELDS) {
      const next = makeColumn(t, cap);
      next.set(this[name] as never);
      (this as unknown as Record<string, Column>)[name] = next;
    }
    this.capacity = cap;
  }

  /** Appends an entity and returns its index. */
  add(id: number, owner: number, x: number, y: number, z: number, speed: number, kind: number = UnitKind.Worker): number {
    if (this.count === this.capacity) this.grow();
    const i = this.count++;
    for (const [name] of UNIT_FIELDS) this[name][i] = 0;
    this.id[i] = id;
    this.owner[i] = owner;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.speed[i] = speed;
    this.order[i] = OrderKind.Idle;
    this.hp[i] = WORKER_HEALTH;
    this.maxHp[i] = WORKER_HEALTH;
    this.rank[i] = 1;
    // Every worker starts with a tier 1 (hardwood) tool kit (Table 7).
    if (kind === UnitKind.Worker) {
      this.wTier[i] = 1;
      applyKit(this, i, 'worker');
    }
    this.carryRes[i] = NO_CARRY;
    this.nodeI[i] = -1;
    this.pathOk[i] = 1;
    this.queue[i] = [];
    this.path[i] = [];
    this.hitters[i] = [];
    this.cools[i] = [];
    this.bag[i] = [];
    this.power[i] = 1000;
    this.index.set(id, i);
    return i;
  }

  /** Removes an entity, keeping the others in the same order. */
  remove(id: number): void {
    const i = this.indexOf(id);
    if (i < 0) return;
    for (const [name] of UNIT_FIELDS) {
      const a = this[name];
      a.copyWithin(i, i + 1, this.count);
    }
    this.queue.splice(i, 1);
    this.path.splice(i, 1);
    this.hitters.splice(i, 1);
    this.cools.splice(i, 1);
    this.bag.splice(i, 1);
    this.count--;
    this.reindex();
  }

  /** Index of an entity id, or -1. */
  indexOf(id: number): number {
    return this.index.get(id) ?? -1;
  }

  /** Rebuilds the id lookup after the arrays were filled directly. */
  reindex(): void {
    this.index.clear();
    for (let i = 0; i < this.count; i++) this.index.set(this.id[i]!, i);
  }
}

/** One player's side: the shared resource pool (Resources: all resources go into one shared pool). */
export interface PlayerState {
  pool: Int32Array;
  /** Research done, a bit per step (combat/items.ts Research). */
  research: number;
  /** The step the player was eliminated, or 0 while still in the game. */
  out: number;
  /** Things made at least once (combat/items.ts Made), for research that needs one first. */
  made: number;
  /** Rations (F9): 0 feed everyone, 1 troops only, 2 workers only. */
  rations: number;
  /**
   * What is left of the food item of each kind that was started (a meal
   * takes less than one item), in quarters of nutrition, by resource id; it
   * is eaten before another item of that kind is opened, so nothing is lost
   * (economy/food.ts).
   */
  open: Int32Array;
  /** Foods kept back from meals (Don't eat), 1 by resource id. */
  kept: Uint8Array;
  /** The FOODS entry the next meal starts from: meals go round the kinds in turn, so every kind is eaten evenly. */
  mealTurn: number;
  /** The step since when some of the player's workers (and working animals), or troops, have been starving; 0 while all are fed. */
  starveWorkers: number;
  starveTroops: number;
  /** The step the research facilities first went without their meal, or 0 while they are fed (research stops meanwhile). */
  starveLodge: number;
  /** Allies panel: the players this player lets command their units, a bit per player ("Share control"). */
  share: number;
  /** Godmode (the debugger, Jade's Patch 5): 1 while it is on (debug/god.ts). */
  god: number;
  /** The player's own stock, kept aside while godmode fills the pool, and put back when it ends. */
  godPool: Int32Array;
}

/** A player's side at the start of a game, with this pool. */
export function newPlayer(pool: Int32Array): PlayerState {
  return {
    pool,
    research: 0,
    out: 0,
    made: 0,
    rations: 0,
    open: new Int32Array(pool.length),
    kept: new Uint8Array(pool.length),
    mealTurn: 0,
    starveWorkers: 0,
    starveTroops: 0,
    starveLodge: 0,
    share: 0,
    god: 0,
    godPool: new Int32Array(pool.length),
  };
}

/** Whether a player is in godmode (the debugger, Jade's Patch 5): everything is built and made at once, free, and needs nothing first. */
export function isGod(state: SimState, player: number): boolean {
  return state.players[player]?.god === 1;
}

/** The per-player scalars after the pool and stock, in the order they are serialised (the open, kept and godPool arrays follow them). */
export const PLAYER_FIELDS = ['research', 'out', 'made', 'rations', 'mealTurn', 'starveWorkers', 'starveTroops', 'starveLodge', 'share', 'god'] as const satisfies ReadonlyArray<keyof PlayerState>;

/**
 * A question a unit or building asks its owner (Patch 2, round 3: actionable
 * bubbles), as the client needs it to draw the bubble and its Yes and No
 * buttons, or the news that it has ended.
 */
export interface AskInfo {
  /** The question's number in this game (one count for every player). */
  id: number;
  /** Which question (units/questions.ts Ask). */
  q: number;
  /** The units it speaks for (entity ids, the speaker first; empty for a building's). */
  units: number[];
  /** The resource it is about (Ask.Farther), or -1. */
  res: number;
  /** How many Yes makes (Patch 3: batches a greyed-out button's question queues), when it says. */
  n?: number;
  /** The step it stops waiting for an answer: QUESTION_WAIT_STEPS (10 s of game time) after it was asked. */
  until: number;
  /** What Yes and No do, in full, for the buttons' tooltips (Yes's also says what it takes from the stock). */
  yes: string;
  no: string;
  /** Set on the event that ends it: answered, unanswered in time, or its speaker gone. */
  closed?: boolean;
  /** Set on an event that only gives Yes's tooltip new words (the stock it counts has changed since it was asked, Patch 3): the bubble stays as it is. */
  retold?: boolean;
}

/**
 * Something the players should hear about: the message panel's alerts,
 * built-and-trained notes, what units say (Unit speech and the message
 * panel), and the questions they ask (Patch 2; a gatherer that runs out
 * asks "Look farther off?" where it once raised the idle alert).
 */
export interface SimEvent {
  /** Player it is for (a question's: its owner, though every player sees its bubble), or -1 for everyone. */
  player: number;
  kind: 'alert' | 'info' | 'period' | 'speech' | 'prospect' | 'question';
  text: string;
  /** Speech: the unit that said it (an entity id), and its name for the panel ("Halfling spearman", "Worker"). */
  speaker?: number;
  name?: string;
  /** Speech or a question from a building (Patch 2: over the middle of its roof): its id; there is no speaker then. */
  building?: number;
  /** A question (kind 'question'), or its end. */
  ask?: AskInfo;
  /** Speech: needs the player's attention (an order it cannot carry out, under attack): the minimap pings, the panel flashes. */
  urgent?: boolean;
  /** Speech that only tells what a unit is doing (loot it picked up, a hunt, a gatherer heading home): a bubble, not a line in the panel. */
  quiet?: boolean;
  /**
   * Speech by another people's unit: a bubble for whoever sees it. Their
   * important speech (a greeting, a warning, war, a surrender offer) also
   * goes in the message panel of each player with a unit near enough to
   * hear it (bits by player in near), and of anyone who has it on screen.
   */
  foreign?: boolean;
  important?: boolean;
  near?: number;
  /** A faction the speech or alert is about (an id), for the client's buttons (accept a surrender, open trade). */
  faction?: number;
  /** A prospect's rating (mining.ts Rating), shown over the ground for a while. */
  rating?: number;
  /** Where it happened, wu (the Space key jumps there); absent for none. */
  x?: number;
  z?: number;
  /** The camera goes there at once (the debugger's Elf kingdom button). */
  look?: boolean;
  /** A lair that has just appeared (Patch 3): its mob kind, for the client's ping and sound. */
  lair?: number;
  /**
   * Speech for the bubble only, never the message panel (patch 1): a unit's
   * meal ('meal') or its hunger ('hungry'); the panel has the starving alerts.
   */
  bubble?: 'meal' | 'hungry';
  /** Speech: how long its bubble stays, when not the usual few seconds (BubbleHold). */
  hold?: BubbleHold;
}

/**
 * How long a speech bubble stays (Jade's Patch 3): 'bar' while its speaker
 * sits at the timed action that made it speak, as long as the progress bar
 * over its head runs (units/tinker.ts); 'long' twice the usual time (the
 * main base's word of advice at the start).
 */
export type BubbleHold = 'bar' | 'long';

export interface SimState {
  seed: number;
  step: number;
  nextEntityId: number;
  rng: Streams;
  entities: EntityStore;
  /** The land: generated from the seed, plus every change players made. */
  world: World;
  players: PlayerState[];
  buildings: BuildingStore;
  /** Coarse tiles inside barrier-enclosed regions that hold a player building (claimed land), sorted; recomputed at dusk and when buildings finish. */
  enclosed: number[];
  /** Arrows, stones, javelins and webs in flight. */
  projectiles: Projectile[];
  /** Tonight's mobs still to come (Table 8: how they arrive). */
  spawns: PendingSpawn[];
  /** Marked digs and tunnels. */
  sites: Site[];
  /** Loot lying on the ground (units/loot.ts), oldest first. */
  loot: Loot[];
  /** Cells whose wild animals, and chunks whose fish, have been put in (stocked the first time the players come near). */
  stockedCells: Set<number>;
  stockedChunks: Set<number>;
  /** The step the game ended (every player eliminated), or 0. */
  over: number;
  /** 1 for no night mobs (tests and the debug tools). */
  peaceful: number;
  /** Lairs, villages, tribes and the fog nights (milestone 5). */
  threats: ThreatState;
  /** The neutral peoples: villages, camps, the Elf kingdom and its caravans, Dwarf colonies and cities, mercenary camps (milestone 7). */
  peoples: PeoplesState;
  /** Not state: what was hit or died this step, for the hit particles and death animations. */
  hits: HitEvent[];
  /** Not state: where units stand this step (rebuilt each step). */
  grid: UnitGrid;
  /** Not state: units and buildings brought to 0 this step, settled at its end in this order. */
  dying: number[];
  falling: number[];
  /** Not state: the walk map and pathfinder over the land and buildings (pure caches). */
  nav: NavGrid;
  paths: Pathfinder;
  /** Not state: what happened this step, for the players' message panels. */
  events: SimEvent[];
}

export interface WorldOptions {
  /** Players, 1 to 8: the start basin's size and one pocket each (Table 9). */
  players?: number;
  /** Workers each player starts with: 4 (Premise, Starting setup). */
  playerUnits?: number;
  /** Warriors each player starts with: 3 close-melee troops with wooden cudgels and no armour (Troops and gear: starting units). */
  warriors?: number;
  /** Neutral units that wander on their own, drawing on the 'ai' stream (M0's test of the streams). */
  wanderers?: number;
  /** Start without the Big House (tests). */
  noBase?: boolean;
  /** No night mobs (tests of the economy). */
  peaceful?: boolean;
}

/** Something flying (How ranged attacks hit). Its place at age k is the launch point plus k steps of its velocity, less gravity. */
export interface Projectile {
  shot: number;
  /** combat.ts Side: 0 the players', 1 the monsters', 3 a neutral people's. */
  side: number;
  /** A people's shot: the shooter's faction (its group), which decides whom it may hit; else 0. */
  faction: number;
  /** Who shot it (an entity id) and their player, for experience and drops. */
  shooter: number;
  owner: number;
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  damage: number;
  /** Bit 0 blunt, bit 1 fire, bit 2 web. */
  flags: number;
  /**
   * The unit it was aimed at (an entity id), or 0: that one it may hit
   * whatever side it is on, so a shot from Attack used on a friend or a
   * spell cast on one lands (Jade's Patch 2); every other unit it passes
   * is hit only if the shooter's side may hit it.
   */
  mark: number;
}

/** A mob still to come tonight: when, what, against whom, and its group's spawn point once chosen. */
export interface PendingSpawn {
  at: number;
  mob: number;
  player: number;
  group: number;
  x: number;
  z: number;
  placed: number;
  /** Role it comes as (threats/types.ts Role: Night, or Aimed at (ax, az)). */
  role: number;
  ax: number;
  az: number;
  /** The lair it comes out of (an entity id), or 0 for the dark edge. */
  src: number;
  /** A weapon, armour or shield it carries, dropped when it is killed (Patch 5, GP-1: threats/loot.ts giveWaveGear), or 0. */
  gear: number;
}

/**
 * Loot on the ground (units/loot.ts): what a kill dropped where no unit near
 * it had room. Units walk over and pick it up, on a right-click or by
 * themselves; it lies there until then, or until it rots away.
 */
export interface Loot {
  id: number;
  res: number;
  amt: number;
  /** Where it lies, wu. */
  x: number;
  y: number;
  z: number;
  /** The step it fell. */
  at: number;
  /** The unit that made the kill (an entity id, 0 for none): it goes back for its own kill from farther away. */
  by: number;
  /** The player it fell for (whose units pick it up by themselves), or -1 for anyone. */
  owner: number;
  /** 1 when it is worth remarking on: rare or valuable for what dropped it, a boss's, or a lair's hoard. */
  brag: number;
  /** What dropped it, for what the unit says: a mob (combat/mobs.ts) + 1, or 0. */
  src: number;
}

/** Site kinds: a dig down, a tunnel into a hillside, a stretch of a tunnel chain (Patch 5 took out the earthworks: banks, fill and ramps). */
export const SiteKind = { Dig: 0, Tunnel: 1, TunnelLine: 2 } as const;

/** Whether a site is a tunnel: a marked box, or a stretch of a tunnel chain. */
export function tunnelSite(kind: number): boolean {
  return kind === SiteKind.Tunnel || kind === SiteKind.TunnelLine;
}

/**
 * Marked land for workers to dig out (Digging). Levels in terrain units. A box from (x0, z0) to (x1, z1), except a
 * tunnel chain's stretch (TunnelLine), which runs from its anchor (x0, z0) to
 * its end (x1, z1) along one of the eight directions, `axis` columns wide
 * (buildings/chains.ts).
 */
export interface Site {
  id: number;
  owner: number;
  kind: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Dig: the floor to dig down to. Tunnels: the floor. */
  level: number;
  /** Tunnels: the roof. */
  level2: number;
  /** TunnelLine: its width in columns. */
  axis: number;
}

/**
 * What a hit looks like (Generated rocks and trees: hit particles). Patch 5: 'fell', a tree an engine's shot blew apart (combat/blasts.ts); 'bomb', a wall breaker going off (BL-7: its
 * blast, smoke and crater); 'dirt', a catapult stone's or boulder's splash. 'tick': no look of its own, only the damage
 * of a blow that lands every step (a beam), which the screen adds up for its number (UI-10).
 */
export type HitLook = 'blood' | 'spark' | 'stone' | 'wood' | 'slime' | 'bone' | 'burst' | 'blast' | 'death' | 'shake' | 'shot' | 'swing' | 'spell' | 'tick' | 'fell' | 'bomb' | 'dirt';

export interface HitEvent {
  look: HitLook;
  x: number;
  y: number;
  z: number;
  /** The entity hit, swinging or dying (0 for none). */
  id: number;
  /** Death: what died (UnitKind and mob), for the death animation. */
  kind?: number;
  mob?: number;
  heading?: number;
  /** A spell landing (look 'spell'): which (magic/spells.ts Spell); x, y, z are where it shows. */
  spell?: number;
  /** A shot leaving (look 'shot'): which (combat/items.ts Shot), for the muzzle's flash and smoke (Patch 5, MB-7). */
  shot?: number;
  /** The health a blow took, for the damage number over what it hit (Patch 5, UI-10); none on a look that only shows. */
  dmg?: number;
}

/** Fresh nav caches over a state's world and buildings. */
export function attachNav(state: Omit<SimState, 'nav' | 'paths' | 'events' | 'hits' | 'grid' | 'dying' | 'falling'> & Partial<SimState>): SimState {
  const nav = new NavGrid(state.world, state.buildings);
  const s = state as SimState;
  s.nav = nav;
  s.paths = new Pathfinder(nav);
  s.events = [];
  s.hits = [];
  s.grid = new UnitGrid();
  s.dying = [];
  s.falling = [];
  state.world.builtOn = (x, z) => state.buildings.footprintAt(x, z) !== 0;
  return s;
}

/** Adds a building record with the next id. */
export function placeBuilding(state: SimState, owner: number, kind: number, variant: number, x: number, z: number, complete: boolean): Building {
  const spec = footprintDims(kind, variant);
  // The floor stands at the height of the footprint's middle column.
  const y = state.world.topAt(x + (spec.w >> 1), z + (spec.d >> 1));
  const b: Building = {
    id: state.nextEntityId++,
    owner,
    kind,
    variant,
    level: 1,
    x,
    z,
    y,
    hp: complete ? levelSpec(kind, 1).health : 0,
    progress: 0,
    complete,
    upgrading: 0,
    upProgress: 0,
    repairAcc: 0,
    queue: [],
    rally: [],
    doneAt: complete ? state.step : 0,
    farmAcc: 0,
    alerted: 0,
    costMul: 1,
    paid: [],
    rating: 0,
    mined: 0,
    stock: [],
    acc: [],
    shared: 0,
    tech: 0,
    locks: [],
  };
  const [x0, z0, x1, z1] = footprintRect(b);
  state.world.clearProps(x0, z0, x1, z1);
  state.buildings.add(b, (key) => state.world.touchNav(key));
  stepAside(state, b);
  return b;
}

/**
 * After a building's level or upgrade changes (footprints.ts): its marks
 * follow its new footprint, what grows on land a grown footprint takes is
 * cleared, and units on columns it now fills step aside.
 */
export function refitBuilding(state: SimState, b: Building): void {
  state.buildings.refit(b, (key) => state.world.touchNav(key));
  const [x0, z0, x1, z1] = footprintRect(b);
  state.world.clearProps(x0, z0, x1, z1);
  stepAside(state, b);
}

/** How far, in columns, a unit looks for a free column when a building goes up where it stands. */
const STEP_ASIDE_COLUMNS = 16;

/** Units standing on a building's solid columns step to the nearest column they can stand on, south side first on a tie. */
function stepAside(state: SimState, b: Building): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.inside[i] !== 0) continue;
    if (state.buildings.solidAt(floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN)) === b.id) stepOff(state, i);
  }
}

/**
 * A player's unit found standing on a building's solid column (in a game
 * saved before that column was solid: a Big House's sheds, a Citadel's walls)
 * steps off it; a gate's columns are walked through. True if it moved.
 */
export function stepOffSolid(state: SimState, i: number): boolean {
  const id = state.buildings.solidAt(floorDiv(state.entities.x[i]!, WU_PER_COLUMN), floorDiv(state.entities.z[i]!, WU_PER_COLUMN));
  if (id === 0) return false;
  const b = state.buildings.get(id);
  if (!b || buildingSpec(b.kind).defence === 'gate') return false;
  return stepOff(state, i);
}

/** Moves a unit to the nearest free column round the one it stands on (not one walking a tunnel under it). */
function stepOff(state: SimState, i: number): boolean {
  const e = state.entities;
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  if (e.y[i]! < (state.world.topAt(cx, cz) - 1) * WU_PER_TERRAIN_UNIT) return false;
  const to = freeColumnNear(state, cx, cz);
  if (!to) return false;
  e.x[i] = to[0] * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
  e.z[i] = to[1] * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
  e.y[i] = standY(state, e.x[i]!, e.z[i]!);
  e.path[i] = [];
  e.pathOk[i] = 2;
  return true;
}

/** The nearest column round (x, z) with no building's solid part on it that a person can stand on, ring by ring, or null. */
function freeColumnNear(state: SimState, x: number, z: number): [number, number] | null {
  for (let r = 1; r <= STEP_ASIDE_COLUMNS; r++) {
    // South row, then the sides from south to north, then the north row.
    const ring: Array<[number, number]> = [];
    for (let k = 0; k <= 2 * r; k++) ring.push([x + (k & 1 ? -((k + 1) >> 1) : k >> 1), z + r]);
    for (let dz = r - 1; dz > -r; dz--) ring.push([x - r, z + dz], [x + r, z + dz]);
    for (let k = 0; k <= 2 * r; k++) ring.push([x + (k & 1 ? -((k + 1) >> 1) : k >> 1), z - r]);
    for (const [cx, cz] of ring) {
      if (state.buildings.solidAt(cx, cz) === 0 && state.nav.standable(cx, cz, PERSON)) return [cx, cz];
    }
  }
  return null;
}

/**
 * Builds a new game: the world from the seed and player count, and in each
 * player's pocket a tier 1 Big House with four workers round it, wooden
 * tools and the starting stock (Premise, Starting setup; Table 6 and 9).
 */
export function createWorld(seed: number, options: WorldOptions = {}): SimState {
  const playerUnits = options.playerUnits ?? 4;
  const wanderers = options.wanderers ?? 0;
  const world = new World(seed, options.players ?? 1);
  const state = attachNav({
    seed: seed >>> 0,
    step: 0,
    nextEntityId: 1,
    rng: createStreams(seed),
    entities: new EntityStore(),
    world,
    players: [],
    buildings: new BuildingStore(),
    enclosed: [],
    projectiles: [],
    spawns: [],
    sites: [],
    loot: [],
    stockedCells: new Set(),
    stockedChunks: new Set(),
    over: 0,
    peaceful: options.peaceful ? 1 : 0,
    threats: newThreats(),
    peoples: newPeoples(),
  });
  for (let p = 0; p < world.players; p++) {
    const pool = new Int32Array(RESOURCE_COUNT);
    for (const [res, n] of STARTING_STOCK) pool[res] = n;
    state.players.push(newPlayer(pool));
  }
  // Workers first, so each player's units have the lowest ids (1 to 4 for the first player).
  for (const pocket of world.gen.start.pockets) {
    const px = pocket.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const pz = pocket.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    for (let n = 0; n < playerUnits; n++) {
      const id = state.nextEntityId++;
      const h = hash32(state.seed, 1, pocket.player, n);
      let x: number;
      let z: number;
      if (pocket.yard === 0) {
        // A loose row 5 to 8 m south of the Big House's middle, outside its footprint.
        x = px + ((h & 0xffff) % (2 * WU_PER_METRE)) - WU_PER_METRE + (n - (playerUnits >> 1)) * 2 * WU_PER_METRE;
        z = pz + (((h >>> 16) & 0xffff) % (3 * WU_PER_METRE)) + 5 * WU_PER_METRE;
      } else {
        // Beside a base among others (mini patch): the same loose row, 5 to 8 m out on its yard's side and centred
        // on it, so it stands by its own Big House and nobody else's.
        const across = ((h & 0xffff) % (2 * WU_PER_METRE)) - WU_PER_METRE + (2 * n - (playerUnits - 1)) * WU_PER_METRE;
        [x, z] = yardSpot(px, pz, pocket.outward, (((h >>> 16) & 0xffff) % (3 * WU_PER_METRE)) + 5 * WU_PER_METRE, across);
      }
      state.entities.add(id, pocket.player, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Worker);
    }
  }
  // Then the starting warriors, a little east of the workers: close melee, a wooden cudgel, no armour (Jade).
  const warriors = options.warriors ?? 3;
  for (const pocket of world.gen.start.pockets) {
    const px = pocket.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    const pz = pocket.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
    for (let n = 0; n < warriors; n++) {
      let x = px + (playerUnits + 1 + n) * 2 * WU_PER_METRE - (playerUnits >> 1) * 2 * WU_PER_METRE;
      let z = pz + 6 * WU_PER_METRE;
      // Beside a base among others: a row 9.5 m out on its yard's side, just beyond the workers.
      if (pocket.yard > 0) [x, z] = yardSpot(px, pz, pocket.outward, 9 * WU_PER_METRE + (WU_PER_METRE >> 1), (2 * n - (warriors - 1)) * WU_PER_METRE);
      addWarrior(state, pocket.player, x, z, Troop.Close, 1, 0);
    }
  }
  if (!options.noBase) {
    const spec = buildingSpec(BuildingKind.MainBase);
    for (const pocket of world.gen.start.pockets) placeBuilding(state, pocket.player, BuildingKind.MainBase, 0, pocket.x - (spec.w >> 1), pocket.z - (spec.d >> 1), true);
  }
  const spread = 40 * WU_PER_METRE;
  const half = 20 * WU_PER_METRE;
  for (let n = 0; n < wanderers; n++) {
    const id = state.nextEntityId++;
    const x = (hash32(state.seed, 1, n) % spread) - half;
    const z = (hash32(state.seed, 2, n) % spread) - half;
    const i = state.entities.add(id, NEUTRAL, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Wanderer);
    state.entities.wanderAt[i] = 1 + (hash32(state.seed, 3, n) % 40);
  }
  revealVision(state);
  return state;
}

/** Warrior health by rank (Table 1: Recruit 100 to Hero 180). */
export const WARRIOR_HEALTH_BY_RANK: readonly number[] = [100, 100, 120, 140, 160, 180];

/** A spot `out` wu from (x, z) along a 16-bit bearing and `across` wu to its left, wu. */
function yardSpot(x: number, z: number, bearing: number, out: number, across: number): [number, number] {
  const c = cos16(bearing);
  const s = sin16(bearing);
  return [x + floorDiv(out * c - across * s, 65536), z + floorDiv(out * s + across * c, 65536)];
}

/** A new troop of rank 1 of a type, with its weapon, armour and (close melee) shield tiers (a fist fighter by default); returns its index. */
export function addWarrior(state: SimState, owner: number, x: number, z: number, troop: number = Troop.Close, weapon = 0, armour = 0, shield = 0): number {
  const id = state.nextEntityId++;
  const i = state.entities.add(id, owner, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Warrior);
  state.entities.troop[i] = troop;
  state.entities.wTier[i] = weapon;
  state.entities.aTier[i] = armour;
  state.entities.sTier[i] = shield;
  applyKit(state.entities, i, 'warrior');
  state.entities.hp[i] = WARRIOR_HEALTH_BY_RANK[1]!;
  state.entities.maxHp[i] = WARRIOR_HEALTH_BY_RANK[1]!;
  state.entities.homeX[i] = x;
  state.entities.homeZ[i] = z;
  return i;
}

/** The height a unit stands at on the column under (x, z), wu: its walk level, or lower in deep water (it swims). */
export function standY(state: SimState, x: number, z: number, fromY?: number): number {
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  // Under an overhang (a tunnel or cave), the floor nearer the unit's height.
  if (fromY !== undefined && state.nav.layerAt(cx, cz, floorDiv(fromY, WU_PER_TERRAIN_UNIT)) === UNDER) return state.nav.under(cx, cz) * WU_PER_TERRAIN_UNIT;
  const level = state.nav.level(cx, cz);
  const deep = (state.nav.flags(cx, cz) & 4) !== 0;
  return (deep ? level - 6 : level) * WU_PER_TERRAIN_UNIT;
}

/** A hop up or down a rise takes 0.3 s; going up, the unit moves at half speed meanwhile (Moving over the land: "slows it down for a moment") (s). */
export const HOP_STEPS = 6;
export const HOP_SLOW_BP = 5000;

/**
 * Moves a unit on the ground to (x, z): it stands on the walk level it
 * reaches there, and a rise or drop of more than a stair step (3 units or
 * more) starts a hop.
 */
export function landAt(state: SimState, i: number, x: number, z: number): void {
  const e = state.entities;
  const before = e.y[i]!;
  const y = standY(state, x, z, before);
  e.x[i] = x;
  e.z[i] = z;
  e.y[i] = y;
  const rise = y - before;
  if (rise > STEP_UNITS * WU_PER_TERRAIN_UNIT || rise < -STEP_UNITS * WU_PER_TERRAIN_UNIT) {
    e.hopUntil[i] = state.step + HOP_STEPS;
    e.hopRise[i] = rise;
  }
}

/** Whether a unit is hopping up a rise now (it moves at half speed). */
export function hoppingUp(state: SimState, i: number): boolean {
  return state.entities.hopUntil[i]! > state.step && state.entities.hopRise[i]! > 0;
}

/** How far a unit sees, wu: its kind's sight, plus a tower's 10 m when on one. */
export function sightOf(state: SimState, i: number): number {
  const e = state.entities;
  let base = SIGHT_WU[e.kind[i]!] ?? SIGHT_WU[0];
  // Table 1: warriors see 2 m farther at Elite and 4 m at Hero.
  if (e.kind[i] === UnitKind.Warrior && e.rank[i]! > 3) base += (e.rank[i]! - 3) * 2 * WU_PER_METRE;
  // From the saddle: 30 m (Table 1's mounted row).
  if (e.mount[i]) base = Math.max(base, MOUNTED.sight);
  const b = e.inside[i] ? state.buildings.get(e.inside[i]!) : undefined;
  const bonus = b ? (buildingSpec(b.kind).sightBonusM ?? 0) * WU_PER_METRE : 0;
  // A fog night halves it.
  return throughFog(state, base + bonus);
}

// ----- vision (Fog of war) -----
//
// What the players see is one picture for the whole side: every player sees
// what any player's units and buildings see (co-op), and the land in that
// sight is explored for all of them. A unit sees round itself as far as
// sightOf; a building sees out from its footprint's edge as far as its row of
// BUILDING_SIGHT_M. Units sheltering, working or training inside a building
// see nothing (the building sees for them); men up on a tower or a main
// base's top (units/top.ts), or a cannon in a port, still do.

/** Numbers per vision source: owner, then the rectangle x0, z0, x1, z1 it sees out from (a point for a unit), then how far, all wu. */
export const VISION_STRIDE = 6;

/** Whether a unit lends its eyes to the players' side now: a player's, alive, and out in the open or on a building's top. */
export function seesForSide(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.owner[i]! >= state.players.length || e.hp[i]! <= 0) return false;
  if (e.inside[i] === 0 || onTop(state, i)) return true;
  const kind = e.kind[i];
  if (kind === UnitKind.Worker || kind === UnitKind.Animal) return false;
  const b = state.buildings.get(e.inside[i]!);
  return b !== undefined && garrisonRoom(b) > 0;
}

/** How far a player's building sees out from its footprint's edge, wu (BUILDING_SIGHT_M), halved on a fog night. */
export function buildingSight(state: SimState, b: Building): number {
  return throughFog(state, (BUILDING_SIGHT_M[b.kind] ?? BUILDING_CLAIM_M) * WU_PER_METRE);
}

/** The edges of a building's footprint, wu: [x0, z0, x1, z1]. */
export function footprintWu(b: Building): [number, number, number, number] {
  const [x0, z0, x1, z1] = footprintRect(b);
  return [x0 * WU_PER_COLUMN, z0 * WU_PER_COLUMN, (x1 + 1) * WU_PER_COLUMN, (z1 + 1) * WU_PER_COLUMN];
}

/** Every vision source of the players' side now, VISION_STRIDE numbers each: their units, then their buildings. */
export function visionSources(state: SimState): Int32Array {
  const e = state.entities;
  const players = state.players.length;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (seesForSide(state, i)) n++;
  for (const b of state.buildings.list) if (b.owner < players) n++;
  const out = new Int32Array(n * VISION_STRIDE);
  let o = 0;
  for (let i = 0; i < e.count; i++) {
    if (!seesForSide(state, i)) continue;
    out[o] = e.owner[i]!;
    out[o + 1] = out[o + 3] = e.x[i]!;
    out[o + 2] = out[o + 4] = e.z[i]!;
    out[o + 5] = sightOf(state, i);
    o += VISION_STRIDE;
  }
  for (const b of state.buildings.list) {
    if (b.owner >= players) continue;
    const [x0, z0, x1, z1] = footprintWu(b);
    out[o] = b.owner;
    out[o + 1] = x0;
    out[o + 2] = z0;
    out[o + 3] = x1;
    out[o + 4] = z1;
    out[o + 5] = buildingSight(state, b);
    o += VISION_STRIDE;
  }
  return out;
}

/** Squared distance from a point to a vision source's rectangle, wu squared. */
export function sourceDistance2(src: ArrayLike<number>, o: number, x: number, z: number): number {
  const dx = x < src[o + 1]! ? src[o + 1]! - x : x > src[o + 3]! ? x - src[o + 3]! : 0;
  const dz = z < src[o + 2]! ? src[o + 2]! - z : z > src[o + 4]! ? z - src[o + 4]! : 0;
  return dx * dx + dz * dz;
}

/** Not state: each building's reach it has been revealed round at already (explored land only grows, so going over it again at that reach or less changes nothing). */
const revealedAt = new WeakMap<Building, number>();

/** Marks the land in the players' side's sight explored, for all of them. */
export function revealVision(state: SimState): void {
  const world = state.world;
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (seesForSide(state, i)) world.reveal(e.x[i]!, e.z[i]!, sightOf(state, i));
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    // A building never moves, so once revealed round it is only gone over again when it sees farther (a fog night has lifted).
    const r = buildingSight(state, b);
    if ((revealedAt.get(b) ?? -1) >= r) continue;
    revealedAt.set(b, r);
    const [x0, z0, x1, z1] = footprintWu(b);
    world.revealRect(x0, z0, x1, z1, r);
  }
}

/** Steps between updates of the explored land and of which lairs and villages the players have seen. */
export const FOG_INTERVAL_STEPS = 10;
