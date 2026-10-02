// The resource types of the Resources section, for the resource bar.

/** "So far we have": the main resource list. */
export const MAIN_RESOURCES: readonly string[] = [
  'Softwood lumber',
  'Hardwood lumber',
  'Medicinal herbs',
  'Stone',
  'Flint',
  'Coal',
  'Leather',
  'Meat',
  'Fish',
  'Copper ore',
  'Tin ore',
  'Copper ingot',
  'Tin ingot',
  'Bronze ingot',
  'Bog iron',
  'Iron rock',
  'Vein iron ore',
  'Pig iron ingot',
  'Iron ingot',
  'Steel ingot',
];

/** Additional resources. */
export const ADDITIONAL_RESOURCES: readonly string[] = [
  'Eggs',
  'Feathers',
  'Gold',
  'Emeralds',
  'Rubies',
  'Diamonds',
  'Silver',
  'Marble',
  'Earth',
  'Gravel',
  'Hardwood sticks',
  'Clay',
  'Sand',
  'Charcoal',
  'Saltpetre',
  'Sulphur',
  'Wheat',
  'Potatoes',
  'Carrots',
  'Corn',
  'Flax',
  'Hides',
  'Bone',
  'Resin / pitch',
  'Spider silk',
  'Demon horn',
  'Hexstone',
  'Venom',
  'Lead ore',
  'Mana crystal',
];

/** Shown in the bar itself while it is collapsed. */
export const BAR_RESOURCES: readonly { name: string; short: string }[] = [
  { name: 'Softwood lumber', short: 'Softwood' },
  { name: 'Hardwood lumber', short: 'Hardwood' },
  { name: 'Stone', short: 'Stone' },
  { name: 'Flint', short: 'Flint' },
];
