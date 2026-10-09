// What the selected units are doing, as the command card's actions (patch
// notes 1: "a small animated indicator over the action the unit is currently
// doing or walking to do, assuming it is not idle"). An attack-move marks
// Attack while the units walk and while they fight on the way; a gather loop
// marks Gather on the way to the drop-off too. Idle units mark nothing.
import type { UnitOrder } from '@blockyrts/sim';
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
    case 'gather':
    case 'forage':
    case 'dropoff':
      return 'gather';
    case 'return':
      return 'returnCargo';
    case 'build':
      return 'build';
    case 'work':
    case 'repairAll':
    case 'mend':
      return 'repair';
    case 'port':
      return 'port';
    case 'dig':
    case 'stairs':
      return 'dig';
    case 'prospect':
      return 'prospect';
    case 'hunt':
      return 'hunt';
    case 'eat':
      return 'eat';
    case 'kitUp':
      return 'equip';
    case 'cart':
      return 'cart';
    case 'train':
      // Only mages have a rank button (Patch 3: workers rank up by working; warriors train at the Barracks' card).
      return typeKey.startsWith('mage:') ? 'mageRank' : null;
    case 'retrain':
      return 'retrain';
    case 'cast':
      return spellAction(o.spell);
    case 'hitch':
      return 'hitch';
    case 'crew':
      return 'crew';
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
