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

export type Order = MoveOrder;

/** The orders of every player for one step. */
export interface InputFrame {
  step: number;
  orders: Order[];
}

/** A stable copy of the orders sorted by player; within a player the given order is kept. */
export function canonicalOrders(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => a.player - b.player);
}

/** Checks that an order holds only integers in range, so a bad script fails loudly. */
export function validateOrder(o: Order): void {
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  if (o.kind !== 'move') throw new Error(`unknown order kind ${String((o as { kind: unknown }).kind)}`);
  if (!isInt(o.player) || o.player < 0 || o.player > 7) throw new Error(`bad player ${o.player}`);
  if (!isInt(o.x) || !isInt(o.z)) throw new Error('order coordinates must be integer world units');
  if (!Array.isArray(o.units) || !o.units.every(isInt)) throw new Error('order units must be entity ids');
}
