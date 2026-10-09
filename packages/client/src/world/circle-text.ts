// What the selection panel says about the stone circles' pieces (Patch 5):
// a trilithon by its state, the altar by its circle, a Moon Rose bush open or
// shut, and what a right click does with each.
import {
  CIRCLE_TYPE_NAMES,
  CircleType,
  HAWTHORNE_LUMBER,
  HAWTHORNE_M,
  HAWTHORNE_PCT,
  PropKind,
  Stage,
  trilithonRow,
  variantLook,
  variantType,
} from '@blockyrts/sim';

/** A circle piece's name in the panel, or null for the plain prop label. */
export function circlePieceLabel(kind: number, variant: number, amount: number): string | null {
  switch (kind) {
    case PropKind.Trilithon: {
      const name = trilithonRow(variantLook(variant)).name;
      return amount > 0 ? `${name} (${amount} bluestone)` : name;
    }
    case PropKind.CircleAltar:
      return `Altar (${CIRCLE_TYPE_NAMES[variantType(variant)] ?? 'Stone circle'})`;
    case PropKind.MoonRoseBush:
      return amount > 0 ? `Moon Rose bush (${amount} Moon Roses)` : 'Moon Rose bush (closed)';
    default:
      return null;
  }
}

/** The panel's extra lines for a circle piece: what a right click does with it. */
export function circlePieceDetails(kind: number, stage: number, amount: number, variant = 0): string[] {
  switch (kind) {
    case PropKind.CircleAltar: {
      const type = variantType(variant);
      if (type === CircleType.Lunar) return ['Right click it with a unit to leave the Moon Goddess her gifts or take her idol.'];
      if (type === CircleType.Boneyard) return ["Right click it with a unit to take the Headless God's idol."];
      return [];
    }
    case PropKind.BluestoneChest:
      return ['Right click it with a unit to open it and take what is inside.'];
    case PropKind.MoonRoseBush:
      return amount > 0 ? [] : ['Its roses open only on a Bright Night.'];
    case PropKind.SweetHawthorne:
      return [
        `Farms within ${HAWTHORNE_M} m grow ${HAWTHORNE_PCT}% more food, and animals within ${HAWTHORNE_M} m breed ${HAWTHORNE_PCT}% faster.`,
        amount > 0 && stage !== Stage.Young ? 'Pick its fruit before it can be cut down.' : `Right click it with a worker to cut it down for ${HAWTHORNE_LUMBER} hardwood lumber.`,
      ];
    default:
      return [];
  }
}
