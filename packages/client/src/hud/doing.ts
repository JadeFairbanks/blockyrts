// What the selected units are doing, as the command card's actions (patch
// notes 1: "a small animated indicator over the action the unit is currently
// doing or walking to do, assuming it is not idle"). An attack-move marks
// Attack while the units walk and while they fight on the way; a gather loop
// marks Gather on the way to the drop-off too. Idle units mark nothing.
import { buildingSpec, Line, type UnitOrder } from '@blockyrts/sim';
import { spellAction } from '../input/bindings.ts';

/** The card action a unit's current order belongs to, or null (a standing job, idle). */
export function orderAction(o: UnitOrder | undefined, typeKey: string): string | null {
  if (!o) return null;
  switch (o.t) {
    case 'move':
    case 'follow':
      return 'move';
    case 'attack':
    case 'attackMove':
      return 'attack';
    case 'patrol':
      return 'patrol';
    case 'hold':
      return 'hold';
    case 'gather':
    case 'dropoff':
      return 'gather';
    case 'return':
      return 'returnCargo';
    case 'build':
      return buildingSpec(o.kind).menu === 'advanced' ? 'buildAdvanced' : 'buildBasic';
    case 'work':
    case 'repairAll':
    case 'mend':
      return 'repair';
    case 'enter':
    case 'port':
    case 'crew':
      return 'enter';
    case 'dig':
      return 'dig';
    case 'prospect':
      return 'prospect';
    case 'hunt':
      return 'hunt';
    case 'eat':
      return 'eat';
    case 'kitUp':
      return o.line === Line.Weapon ? 'upgradeWeapon' : 'upgradeArmour';
    case 'cart':
      return 'cart';
    case 'train':
      return typeKey.startsWith('mage:') ? 'mageRank' : 'rankUp';
    case 'skill':
      return 'train';
    case 'cast':
      return spellAction(o.spell);
    case 'hitch':
      return 'hitch';
    default:
      return null;
  }
}

/** Every action the units are busy with: one unit's head order each. */
export function doingActions(heads: ReadonlyArray<UnitOrder | undefined>, typeKey: string): Set<string> {
  const out = new Set<string>();
  for (const o of heads) {
    const a = orderAction(o, typeKey);
    if (a) out.add(a);
  }
  return out;
}
