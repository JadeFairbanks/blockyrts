// The debugger (Jade's Patch 5, EX-7 to EX-11): the same panel at the top
// left, opened and closed by the same key code, for the admin accounts only.
// Its buttons: Godmode (build and make anything at once for nothing, and
// place any unit from the inventory), a village of any of the peoples, the
// Elf kingdom shown, every unit to its top rank, and the tools godmode does
// not cover: heal all, kill the selection, clear the monsters, reveal the
// land, show all, fog for the coming night, a late night's wave, and (alone)
// the game's speed. Each acts at the middle of the view, through the sim as
// an order, so it is in the hash and online reaches every player. A dev
// build keeps the old tester tools beside them.
import { DebugThreat, DebugTool, FactionKind, WAVE_NIGHTS, WU_PER_METRE, type Order } from '@blockyrts/sim';
import type { GameShell } from '../hud/shell.ts';
import { entityIdOf } from '../selection/types.ts';
import type { WorldView } from '../world/world-view.ts';

/** Adds a button to the debugger's bar. */
export type AddDebugButton = (id: string, face: string, name: string, description: string, onPress: () => void) => void;

/** The villages the Village button cycles through: the peoples' (debugPeoples) and a goblin village (debugThreat). */
const VILLAGES: ReadonlyArray<{ name: string; order: (player: number, x: number, z: number) => Order }> = [
  ...([
    ['Halfling village', FactionKind.HalflingVillage],
    ['Runkin camp', FactionKind.RunkinCamp],
    ['Elf caravan', FactionKind.ElfCaravan],
    ['Dwarf colony', FactionKind.DwarfColony],
    ['Dwarf city', FactionKind.DwarfCity],
    ['Mercenary camp', FactionKind.MercCamp],
  ] as const).map(([name, what]) => ({ name, order: (player: number, x: number, z: number): Order => ({ kind: 'debugPeoples', player, what, x, z }) })),
  { name: 'Goblin village', order: (player, x, z) => ({ kind: 'debugThreat', player, what: DebugThreat.Village, x, z }) },
];

export function addDebugger(shell: GameShell, world: WorldView, PLAYER: number, order: (o: Order) => void, speed: ((factor: number) => void) | null): void {
  const bar = document.createElement('div');
  bar.className = 'dbg-tools';
  shell.layout.debug.append(bar);
  const add: AddDebugButton = (id, face, name, description, onPress) => {
    const b = shell.buttons.add({ id, face, name, keys: [], description, className: 'dbg-btn', onPress });
    bar.append(b.el);
  };
  /** The middle of the view, wu. */
  const focus = (): { x: number; z: number } => {
    const f = shell.cam.focus;
    return { x: Math.round(f.x * WU_PER_METRE), z: Math.round(f.z * WU_PER_METRE) };
  };
  const tool = (t: DebugTool): void => order({ kind: 'debugTool', player: PLAYER, tool: t, ...focus() });

  add(
    'dbg-god',
    'Godmode',
    'Debug: godmode',
    'Godmode: you build anything at once, with no resource costs and nothing needed first, and research and train at once. Your inventory becomes every unit, engine, animal, mob and lair in the game: click one, then click the ground to place it. Your units are yours; animals come as they do in the wild; monsters come for you. Closing the debugger turns godmode off and your own stock comes back.',
    () => shell.toggleGod(),
  );
  let village = 0;
  add('dbg-villages', `Village: ${VILLAGES[0]!.name}`, 'Debug: village', 'Builds the named village in the middle of the view, as if just found there; each press moves on to the next: a Halfling village, a Runkin camp, an Elf caravan, a Dwarf colony, a Dwarf city, a mercenary camp and a goblin village.', () => {
    const v = VILLAGES[village]!;
    const at = focus();
    order(v.order(PLAYER, at.x, at.z));
    shell.message(`Debug: ${v.name} placed in the middle of the view.`);
    village = (village + 1) % VILLAGES.length;
    shell.buttons.get('dbg-villages')?.setFace(`Village: ${VILLAGES[village]!.name}`);
  });
  add('dbg-elves', 'Elf kingdom', 'Debug: Elf kingdom', 'Takes the camera to the Elf kingdom and reveals the land round it, building the kingdom where it stands if nobody has been near it yet.', () => tool(DebugTool.ElfKingdom));
  add('dbg-rank', 'Max rank', 'Debug: max rank', 'Raises every one of your workers, troops and mages to the top rank at once, at full health.', () => tool(DebugTool.MaxRank));
  add('dbg-heal', 'Heal all', 'Debug: heal all', 'Heals every one of your units and engines to full (and fills the mages\' mana), and mends every one of your buildings.', () => tool(DebugTool.HealAll));
  add('dbg-kill', 'Kill selected', 'Debug: kill selected', 'Kills the selected units at once, whoever\'s they are: they die as in a fight, and drop what they would.', () => {
    const units = shell.selection
      .list()
      .map((t) => entityIdOf(t.key))
      .filter((id): id is number => id !== null);
    if (units.length === 0) shell.message('Select the units to kill first.');
    else order({ kind: 'debugKill', player: PLAYER, units: units.slice(0, 256) });
  });
  add('dbg-clear', 'Clear monsters', 'Debug: clear monsters', 'Every monster within 60 m of the middle of the view leaves at once, with no drops and no experience; lairs and village buildings stay.', () => tool(DebugTool.ClearFoes));
  add('dbg-reveal', 'Reveal', 'Debug: reveal', 'Marks the land within 150 m of the middle of the view explored (a sim order, so it is in the hash). The minimap fills in behind it.', () => {
    order({ kind: 'debugReveal', player: PLAYER, ...focus(), radius: 150 * WU_PER_METRE });
  });
  add('dbg-all', 'Show all', 'Debug: show all', 'Draws the land without fog of war, on this screen only; the sim and the minimap still keep to what is explored.', () => {
    world.setShowAll(!world.showingAll);
    shell.buttons.get('dbg-all')?.setLit(world.showingAll);
  });
  const threat = (what: number): void => order({ kind: 'debugThreat', player: PLAYER, what, ...focus() });
  add('dbg-fog', 'Fog', 'Debug: fog night', 'Brings fog for the coming night (from now until day): everyone sees half as far and lights reach half as far.', () => threat(DebugThreat.Fog));
  let wave = 0;
  add('dbg-wave', `Wave: night ${WAVE_NIGHTS[0]}`, 'Debug: a late night\'s wave', 'Spawns in the middle of the view what the dark edge\'s budget buys on the named night (one player) and lists it in the messages; each press moves on to the next of nights 30, 50, 85 and 105. Night 85 buys infernal juggernauts.', () => {
    threat(DebugThreat.Wave + wave);
    wave = (wave + 1) % WAVE_NIGHTS.length;
    shell.buttons.get('dbg-wave')?.setFace(`Wave: night ${WAVE_NIGHTS[wave]}`);
  });
  let factor = 1;
  // Online every machine runs at the same pace: no speed button.
  if (speed) add('dbg-speed', 'Speed ×1', 'Debug: game speed', 'Runs the game at 1, 4 or 16 times speed, to see the day turn and farms grow without waiting. Every step is the same as at normal speed, so the hash does not change.', () => {
    factor = factor === 1 ? 4 : factor === 4 ? 16 : 1;
    speed(factor);
    shell.buttons.get('dbg-speed')?.setFace(`Speed ×${factor}`).setLit(factor > 1);
  });
  shell.debugChanged();
  // A dev build keeps the old tester tools beside the new ones (Jade: "you can keep one in versions you have for your own tests"); the site's build leaves them out.
  if (import.meta.env.DEV) {
    void import('./debug-tools.ts').then((m) => {
      m.addOldDebugTools(shell, world, PLAYER, order, add);
      shell.debugChanged();
    });
  }
}
