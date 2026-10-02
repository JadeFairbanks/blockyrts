// Player orders. In lockstep every player sends the orders for step N in one
// frame; the sim applies them at the start of step N in a fixed order (player
// index, then the order each player gave them in).

export interface MoveOrder {
  kind: 'move';
  /** Player index, 0..7. */
  player: number;
  /** Entity ids to move. Ids the player does not own are ignored. */
  units: number[];
  /** Destination in wu. */
  x: number;
  z: number;
}

export interface StopOrder {
  kind: 'stop';
  player: number;
  units: number[];
}

/**
 * A terrain edit as a stepped sim event (Technology, World generation and
 * terrain): sets the solid range [bottom, top) of every column in the box to
 * a material, or carves it to air with material 0. Columns are global column
 * coordinates (45 cm), heights are terrain units (11.25 cm). Digging (M3)
 * issues these; in M1 the debug tools do.
 */
export interface TerrainOrder {
  kind: 'terrain';
  player: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  bottom: number;
  top: number;
  material: number;
}

/** Debug: marks land explored around a point (the minimap's debug reveal). Radius in wu. */
export interface DebugRevealOrder {
  kind: 'debugReveal';
  player: number;
  x: number;
  z: number;
  radius: number;
}

/** Debug: takes from a prop, felling a tree or cutting a bush (gathering arrives in M2). */
export interface DebugHarvestOrder {
  kind: 'debugHarvest';
  player: number;
  cx: number;
  cz: number;
  index: number;
  amount: number;
}

export type Order = MoveOrder | StopOrder | TerrainOrder | DebugRevealOrder | DebugHarvestOrder;

/** The orders of every player for one step. */
export interface InputFrame {
  step: number;
  orders: Order[];
}

/** A stable copy of the orders sorted by player; within a player the given order is kept. */
export function canonicalOrders(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => a.player - b.player);
}

/** A deep copy of an order (the input log keeps its own). */
export function copyOrder(o: Order): Order {
  return 'units' in o ? { ...o, units: [...o.units] } : { ...o };
}

/** Checks that an order holds only integers in range, so a bad script fails loudly. */
export function validateOrder(o: Order): void {
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  if (!isInt(o.player) || o.player < 0 || o.player > 7) throw new Error(`bad player ${o.player}`);
  const ints = (...vs: unknown[]): void => {
    if (!vs.every(isInt)) throw new Error(`${o.kind} order values must be integers`);
  };
  switch (o.kind) {
    case 'move':
      ints(o.x, o.z);
      if (!Array.isArray(o.units) || !o.units.every(isInt)) throw new Error('order units must be entity ids');
      return;
    case 'stop':
      if (!Array.isArray(o.units) || !o.units.every(isInt)) throw new Error('order units must be entity ids');
      return;
    case 'terrain':
      ints(o.x0, o.z0, o.x1, o.z1, o.bottom, o.top, o.material);
      if (Math.abs(o.x1 - o.x0) > 64 || Math.abs(o.z1 - o.z0) > 64) throw new Error('a terrain edit covers at most 65 x 65 columns');
      if (o.top - o.bottom > 512 || o.material < 0 || o.material > 255) throw new Error('bad terrain edit range');
      return;
    case 'debugReveal':
      ints(o.x, o.z, o.radius);
      if (o.radius < 0 || o.radius > 2000 * 8000) throw new Error('reveal radius out of range');
      return;
    case 'debugHarvest':
      ints(o.cx, o.cz, o.index, o.amount);
      return;
    default:
      throw new Error(`unknown order kind ${String((o as { kind: unknown }).kind)}`);
  }
}
