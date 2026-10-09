// One right-click menu for every item (Jade's Patch 5, GP-2 and GP-7, with
// decisions 3.6: "The player inventory and the unit inventory share one
// dropdown: Use, Equip, Plant seed, Unload, Drop, Scrap, Don't eat"). A
// right click on a slot of the stockpile or of one unit's own inventory opens
// the choices that fit the item, in that order, as the command card's
// dropdown does (card-pop.ts). Use is always there, greyed out with the
// reason when the item has no use. An item with a use of its own (the Stone
// Circles' Pan Flute, Ancient Seed and idols) gives it with registerItemUse.
import { FOODS, gearItemPieces, Res, RESOURCES } from '@blockyrts/sim';
import type { CardChoice } from './commands.ts';

/** The item a menu is for: a good, and the unit carrying it (null: the stock). */
export interface ItemAt {
  res: number;
  unit: number | null;
}

/** A use an item has of its own. */
export interface ItemUse {
  /** The menu's word for it: "Use" unless given ("Plant seed"). */
  name?: string;
  description: string;
  /** '' when it can be used now, else why not: the choice is greyed out with it. */
  why(at: ItemAt): string;
  run(at: ItemAt): void;
}

const USES = new Map<number, ItemUse>();

/** Gives an item a use of its own: its menu's Use (or the name the use gives) runs it. */
export function registerItemUse(res: number, use: ItemUse): void {
  USES.set(res, use);
}

/** Use's reason when the item has none. */
export const NO_USE = 'It has no use of its own.';

/** What a unit can put on from the stock (Equip): every weapon, armour, shield, tool, wand and robe, and poison tips. */
const EQUIPPABLE: ReadonlySet<number> = new Set<number>([...gearItemPieces().map(([r]) => r), Res.PoisonTips]);

/** Whether Equip is offered for a good. */
export function equippable(res: number): boolean {
  return EQUIPPABLE.has(res);
}

/** What the menu's choices do, given by the HUD. */
export interface ItemMenuActions {
  /** How many the stock holds. */
  have(res: number): number;
  /** Whether a food is kept back from meals (Don't eat). */
  kept(res: number): boolean;
  dontEat(res: number, on: boolean): void;
  /** Equip…: the next left click on one of the player's units sends it to put the item on. */
  equip(res: number): void;
  /** How many of the player's units that wear gear are selected (Patch 7). */
  selected(): number;
  /** Equip: each selected unit it fits takes one, while the stock lasts (Patch 7, plan section 7). */
  equipSelected(res: number): void;
  /** Scrap: null when the item is not scrapped at all, '' when one can be now, else why not. */
  scrapWhy(res: number): string | null;
  scrap(res: number): void;
  /** One unit's inventory: take all of a good to the nearest drop-off, or put it down here. */
  unload(unit: number, res: number): void;
  drop(unit: number, res: number): void;
}

const greyed = (c: CardChoice, why: string): CardChoice => (why ? { ...c, why } : c);

/** The choices for an item, in the order decisions 3.6 lists them. */
export function itemChoices(at: ItemAt, a: ItemMenuActions): CardChoice[] {
  const r = RESOURCES[at.res];
  if (!r) return [];
  const name = r.name.toLowerCase();
  const stock = at.unit === null;
  const out: CardChoice[] = [];
  const use = USES.get(at.res);
  out.push(use ? greyed({ name: use.name ?? 'Use', description: use.description, run: () => use.run(at) }, use.why(at)) : { name: 'Use', description: `Use the ${name}.`, why: NO_USE, run: () => undefined });
  const none = stock && a.have(at.res) <= 0 ? 'There is none in the stock.' : '';
  if (stock && equippable(at.res)) {
    // Patch 7 (plan section 7): with units selected, Equip gives one piece to each it fits; Equip… still picks one unit with a click.
    const n = a.selected();
    if (n > 0) {
      out.push(
        greyed(
          {
            name: 'Equip',
            description: `${n === 1 ? 'The selected unit walks' : `Each of the ${n} selected units it fits takes one while the stock lasts, best first: it walks`} to the nearest main base, Storehouse, Barracks or Forge (a mage also a Magi Sanctum) and puts on the ${name} there. Its old piece goes to the stock. A unit it does not fit says why.`,
            run: () => a.equipSelected(at.res),
          },
          none,
        ),
      );
    }
    out.push(
      greyed(
        {
          name: n > 0 ? 'Equip…' : 'Equip',
          description: `Then left click one of your units: it walks to the nearest main base, Storehouse, Barracks or Forge (a mage also a Magi Sanctum) and puts on the ${name} from the stock there, in a fifth of the usual time. Its old piece goes to the stock.`,
          run: () => a.equip(at.res),
        },
        none,
      ),
    );
  }
  if (!stock) {
    const unit = at.unit!;
    out.push(
      { name: 'Unload', description: `Take all the ${name} it carries to the nearest drop-off that takes it, then carry on.`, run: () => a.unload(unit, at.res) },
      { name: 'Drop', description: `Put all the ${name} it carries down on the ground here. Nobody picks it up unless sent to it.`, run: () => a.drop(unit, at.res) },
    );
  }
  const scrap = stock ? a.scrapWhy(at.res) : null;
  if (scrap !== null) {
    out.push(greyed({ name: 'Scrap', description: `Break one ${name} back into what it was made from at the Workshop, 10 s. Its Scrap equipment menu scraps 10 or all.`, run: () => a.scrap(at.res) }, none || scrap));
  }
  if (stock && FOODS.includes(at.res as Res)) {
    out.push(
      a.kept(at.res)
        ? { name: 'Eat again', description: `Let the ${name} be eaten at meals again.`, run: () => a.dontEat(at.res, false) }
        : { name: "Don't eat", description: `Keep the ${name} back from meals: nobody eats it until you let it be eaten again.`, run: () => a.dontEat(at.res, true) },
    );
  }
  return out;
}
