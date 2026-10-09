// The old tester tools (before Patch 5), on dev builds only, beside the new
// debugger (game/debugger.ts): Jade's Patch 5 took them off the site ("you
// can keep one in versions you have for your own tests"), and the browser
// checks in test-e2e still press them. Each brings a milestone's threats and
// kits to the middle of the view, or changes the land there. Every land
// change and threat is a sim order, so it is in the hash.
import { DEBUG_CARAVAN, DEBUG_TRADE_KIT, DebugThreat, FACTION_KIND_NAMES, LAIRS, LATE_MOBS, Mat, Mob, mobSpec, WU_PER_METRE, type Order } from '@blockyrts/sim';
import type { GameShell } from '../hud/shell.ts';
import { COLUMN_M, UNIT_M } from '../world/mesher.ts';
import { WorldView } from '../world/world-view.ts';
import type { AddDebugButton } from './debugger.ts';

/** Monsters each press of Crowd sets down, and their kinds: walkers, archers, a climber and a fast runner. */
const CROWD = 200;
const CROWD_MOBS = [Mob.Zombie, Mob.SkeletonArcher, Mob.GiantRat, Mob.GraveHound] as const;

/** Adds the old tester tools to the debugger's bar (dev builds). They act at the camera's focus (the middle of the view). */
export function addOldDebugTools(shell: GameShell, world: WorldView, PLAYER: number, order: (o: Order) => void, add: AddDebugButton): void {
  const focusColumn = (): { x: number; z: number; y: number } => {
    const f = shell.cam.focus;
    const x = Math.floor(f.x / COLUMN_M);
    const z = Math.floor(f.z / COLUMN_M);
    return { x, z, y: Math.round((world.heightAt(f.x, f.z) ?? 0) / UNIT_M) };
  };
  add('dbg-dig', 'Dig', 'Debug: dig', 'Digs a 3 m square pit 1 m deep in the middle of the view, as a terrain edit. Water nearby flows in.', () => {
    const c = focusColumn();
    order({ kind: 'terrain', player: PLAYER, x0: c.x - 3, z0: c.z - 3, x1: c.x + 3, z1: c.z + 3, bottom: c.y - 9, top: c.y + 40, material: Mat.Air });
  });
  add('dbg-raise', 'Raise', 'Debug: raise', 'Builds a 2 m stone block 1 m high in the middle of the view, as a terrain edit.', () => {
    const c = focusColumn();
    order({ kind: 'terrain', player: PLAYER, x0: c.x - 2, z0: c.z - 2, x1: c.x + 2, z1: c.z + 2, bottom: c.y, top: c.y + 9, material: Mat.Stone });
  });
  add('dbg-hill', 'Hill', 'Debug: hill', 'Builds a soil hill 3.4 m tall and 5 m across in the middle of the view, with a 45 cm ledge on its south side (units hop up it) and a 56 cm ledge on its north side (too tall to get up), as terrain edits. Dig (D) clicked on the hill side starts a tunnel into it; click again further in to dig it.', () => {
    const c = focusColumn();
    const soil = (z0: number, z1: number, top: number): void => order({ kind: 'terrain', player: PLAYER, x0: c.x - 5, z0: c.z + z0, x1: c.x + 5, z1: c.z + z1, bottom: c.y - 4, top: c.y + top, material: Mat.Soil });
    soil(6, 10, 4);
    soil(-10, -6, 5);
    soil(-5, 5, 30);
  });
  add('dbg-fell', 'Fell', 'Debug: fell', 'Takes everything from the selected trees, bushes and rocks: trees fall and drop seeds, hazel and herbs grow back from the stump.', () => {
    let n = 0;
    for (const s of shell.selection.list()) {
      const p = WorldView.propKey(s.key);
      if (!p) continue;
      order({ kind: 'debugHarvest', player: PLAYER, cx: p.cx, cz: p.cz, index: p.index, amount: 100000 });
      n++;
    }
    shell.message(n > 0 ? `Felled ${n}.` : 'Select trees, bushes or rocks first.');
  });
  // Milestone 5's threats, at the middle of the view (sim orders, so they are in the hash).
  const threat = (what: number): void => {
    const f = shell.cam.focus;
    order({ kind: 'debugThreat', player: PLAYER, what, x: Math.round(f.x * WU_PER_METRE), z: Math.round(f.z * WU_PER_METRE) });
  };
  const cycler = (id: string, label: string, names: readonly string[], first: number, description: string): void => {
    let k = 0;
    add(id, `${label}: ${names[0]}`, `Debug: ${label.toLowerCase()}`, description, () => {
      threat(first + k);
      shell.message(`Debug: ${names[k]} placed in the middle of the view.`);
      k = (k + 1) % names.length;
      shell.buttons.get(id)?.setFace(`${label}: ${names[k]}`);
    });
  };
  cycler('dbg-lair', 'Lair', LAIRS.map((l) => mobSpec(l.mob).name), DebugThreat.Lair, 'Puts the named lair (Table 15) in the middle of the view with its guardians, asleep sleepers inside; each press moves on to the next of the eight kinds.');
  add('dbg-village', 'Village', 'Debug: goblin village', 'Puts a goblin village of 5 huts with a goblin mage in the middle of the view (Table 17).', () => {
    threat(DebugThreat.Village);
    shell.message('Debug: a goblin village placed in the middle of the view.');
  });
  cycler('dbg-tribe', 'Tribe', ['Gnolls', 'Kobolds', 'Hobgoblins'], DebugThreat.Gnolls, 'Puts a band of the named hostile tribe (Table 16) in the middle of the view; each press moves on to the next tribe.');
  cycler('dbg-creature', 'Creature', ['Giant beetle', 'Giant hornets', 'Viper', 'Giant scorpion', 'Griffin', 'Minotaur'], DebugThreat.Creature, 'Puts the named territorial creature in the middle of the view; each press moves on to the next.');
  // Milestone 6's mages.
  add('dbg-sanctum', 'Sanctum', 'Debug: Magi Sanctum', 'Puts a finished Magi Sanctum in the middle of the view: it trains support and battle mages, upgrades their wands and robes, and researches Hexcraft.', () => {
    threat(DebugThreat.Sanctum);
    shell.message('Debug: a Magi Sanctum placed in the middle of the view.');
  });
  add('dbg-magekit', 'Mage kit', 'Debug: mage kit', 'Puts 10 sticks, 6 flax, 20 mana crystals, 200 farm fare, 6 hexstone and 20 herbs in the pool: enough for two mages\' wands and robes, their rank-ups and Hexcraft.', () => {
    threat(DebugThreat.MageKit);
    shell.message('Debug: sticks, flax, mana crystals and farm fare added.');
  });
  add('dbg-magexp', 'Mage XP', 'Debug: mage experience', 'Gives each of your mages the experience for her next rank: she rises by herself to Acolyte and Adept Acolyte, and above that is ready to train at the Sanctum for mana crystals.', () => {
    threat(DebugThreat.MageXp);
    shell.message('Debug: your mages have the experience for their next rank.');
  });
  // Milestone 7's neutral peoples, at the middle of the view (sim orders, so they are in the hash).
  const people = (what: number): void => {
    const f = shell.cam.focus;
    order({ kind: 'debugPeoples', player: PLAYER, what, x: Math.round(f.x * WU_PER_METRE), z: Math.round(f.z * WU_PER_METRE) });
  };
  let kind = 0;
  add('dbg-people', `People: ${FACTION_KIND_NAMES[0]}`, 'Debug: neutral people', 'Puts the named people in the middle of the view as if just found there: a Halfling village, a Runkin camp, the Elf kingdom (moved here if nobody has found it yet), a wandering Elf caravan, a Dwarf colony, a Dwarf city or a mercenary camp. Each press moves on to the next.', () => {
    people(kind);
    shell.message(`Debug: ${FACTION_KIND_NAMES[kind]} placed in the middle of the view.`);
    kind = (kind + 1) % FACTION_KIND_NAMES.length;
    shell.buttons.get('dbg-people')?.setFace(`People: ${FACTION_KIND_NAMES[kind]}`);
  });
  add('dbg-caravan', 'Caravan', 'Debug: Elf caravan', 'Meets the Elves and sends their caravan to your main base now (by day; it waits for the morning at night). It stops outside the base, trades, and leaves at dusk.', () => people(DEBUG_CARAVAN));
  add('dbg-tradekit', 'Trade kit', 'Debug: trade kit', 'Puts 20 silver, 6 Copper Tokens, 2 Bronze Charms and 5 gold in the pool, to trade with and to hire mercenaries.', () => people(DEBUG_TRADE_KIT));
  // Milestone 8's mounts, engines, guns and the late nights, at the middle of the view.
  add('dbg-barn', 'Barn', 'Debug: Barn', 'Puts a finished Barn in the middle of the view with 2 grown horses and an ox in its stalls, and 100 farm fare: cavalry trained at a Barracks (from main base tier 2) takes a horse from it.', () => {
    threat(DebugThreat.Barn);
    shell.message('Debug: a Barn with 2 horses and an ox placed in the middle of the view.');
  });
  add('dbg-siege', 'Siege kit', 'Debug: siege kit', 'Puts a catapult, a ballista and a bronze cannon in the middle of the view, each with its full crew of artillery crewmen, and a finished Artillery workshop south of them to train more; adds 100 farm fare and researches Siege engines, Gunpowder, Muskets and Cannons. Engines take no ammunition (Patch 2). Hitch a horse or an ox (select the engine, right click the animal), or let the crew push it.', () => {
    threat(DebugThreat.SiegeKit);
    shell.message('Debug: a catapult, a ballista and a bronze cannon with their crews, and an Artillery workshop, placed in the middle of the view.');
  });
  add('dbg-guns', 'Gun kit', 'Debug: gun kit', 'Puts the carbon steel, planks, flint and gunpowder for four musket rangers\' kits in the pool and researches the guns (Patch 2: no cannon crew training; artillery crewmen crew cannons).', () => {
    threat(DebugThreat.GunKit);
    shell.message('Debug: musket materials and powder added, and the gun research done.');
  });
  // Milestone 11's troops: a Barracks, a Forge, a tier 3 main base and the stock for every tier.
  add('dbg-troops', 'Troop kit', 'Debug: troop kit', 'Puts a finished Barracks and Forge in the middle of the view, raises your main base to tier 3 if it is lower (the Forge\'s steel step), puts 20 of every ingot, the leather, feathers, gunpowder and wood for every tier and 300 farm fare in the pool, and researches every tier\'s needs. Select the Barracks to train any troop at any tier.', () => {
    threat(DebugThreat.TroopKit);
    shell.message('Debug: a Barracks, a Forge, a tier 3 main base and the stock for every tier.');
  });
  add('dbg-mine', 'Mine kit', 'Debug: mine kit', 'Puts a finished Mineshaft in the middle of the view and a finished Storehouse beside it, researches Deep Mining I and raises your main base to tier 3 if it is lower. Right click the shaft with workers to make them miners: each goes down, fills a 25 lb bag and carries it to the nearer of the Storehouse and your main base (Patch 2).', () => {
    threat(DebugThreat.MineKit);
    shell.message('Debug: a Mineshaft and a Storehouse placed in the middle of the view.');
  });
  add('dbg-citadel', 'Citadel', 'Debug: Citadel', 'Makes your main base a finished Citadel (tier 4) with its 4 cannon ports: select a cannon and right click the Citadel to haul it up into a port.', () => {
    threat(DebugThreat.Citadel);
    shell.message('Debug: your main base is a Citadel now.');
  });
  cycler('dbg-late', 'Night mob', LATE_MOBS.map((m) => mobSpec(m).name), DebugThreat.LateMob, 'Puts the named night mob (nights 25 to 110, and the Rift-touched beasts) in the middle of the view; each press moves on to the next.');
  // Milestone 10's performance check: a crowd to watch the fps line with (Technical decisions 10: 400 and 800 animated units).
  let crowd = 0;
  add('dbg-crowd', 'Crowd +200', 'Debug: crowd', 'Sets down 200 night mobs (zombies, skeleton archers, giant rats and grave hounds) on a ring 15 to 40 m round the middle of the view, all coming for your town; press twice for 400 and four times for 800 units, and watch the fps, draws, units and memory lines above. Use it at night: by day they burn.', () => {
    const f = shell.cam.focus;
    for (let k = 0; k < CROWD; k++) {
      // A whole-number spread round the ring, as the sim would place them: no trig.
      const r = 15 + ((k * 7) % 26);
      const side = k % 4;
      const u = ((Math.floor(k / 4) * 13) % (2 * r)) - r;
      const [dx, dz] = side === 0 ? [u, -r] : side === 1 ? [r, u] : side === 2 ? [-u, r] : [-r, -u];
      order({ kind: 'debugSpawn', player: PLAYER, mob: CROWD_MOBS[k % CROWD_MOBS.length]!, x: Math.round((f.x + dx) * WU_PER_METRE), z: Math.round((f.z + dz) * WU_PER_METRE) });
    }
    crowd += CROWD;
    shell.message(`Debug: ${crowd} night mobs set down so far.`);
  });
  add('dbg-morvath', 'Morvath', 'Debug: Morvath', 'Brings Morvath, the Hollow Crown, to the middle of the view now, as he comes on night 110: alive at dawn he withdraws and comes back the next night with the health he had; killed, he returns ten nights later.', () => {
    threat(DebugThreat.Morvath);
    shell.message('Debug: Morvath has come.');
  });
}
