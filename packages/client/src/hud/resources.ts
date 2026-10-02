// The resource types of the Resources section, for the resource bar: taken
// from the sim's own list so names and order always match the pool.
import { RESOURCES, ResGroup } from '@blockyrts/sim';

const names = (g: number): string[] => RESOURCES.filter((r) => r.group === g).map((r) => r.name);

/** "So far we have": the main resource list. */
export const MAIN_RESOURCES: readonly string[] = names(ResGroup.Main);

/** Additional resources. */
export const ADDITIONAL_RESOURCES: readonly string[] = names(ResGroup.Additional);

/** Made goods (planks, bricks, ...). */
export const GOODS: readonly string[] = names(ResGroup.Goods);

/** Shown in the bar itself while it is collapsed; Food and Supply are added after them. */
export const BAR_RESOURCES: readonly { name: string; short: string }[] = [
  { name: 'Softwood lumber', short: 'Softwood' },
  { name: 'Hardwood lumber', short: 'Hardwood' },
  { name: 'Stone', short: 'Stone' },
  { name: 'Flint', short: 'Flint' },
];

/** Bar cells that are not one resource. */
export const FOOD = 'Food';
export const SUPPLY = 'Supply';
