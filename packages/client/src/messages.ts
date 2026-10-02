// Messages between the page and the sim worker. Local to the client; the
// network protocol lives in @blockyrts/protocol.
import type { Order } from '@blockyrts/sim';

export type ToWorker = { type: 'start'; seed: number } | { type: 'order'; order: Order };

/** Per-entity record in a state message: x, z, heading, owner (all int32). */
export const STATE_STRIDE = 4;

export interface StateMessage {
  type: 'state';
  step: number;
  /** Latest desync hash and the step it was taken at. */
  hash: number;
  hashStep: number;
  count: number;
  /** count * STATE_STRIDE int32 values, transferred. */
  data: Int32Array;
  /** Ids of the player's own units, for move orders. */
  ownIds: number[];
}

export type FromWorker = StateMessage;
