// Messages between the page and the sim worker. Local to the client; the
// network protocol lives in @blockyrts/protocol.
import type { ChunkDelta, Order } from '@blockyrts/sim';

export type ToWorker = { type: 'start'; seed: number; players: number } | { type: 'order'; order: Order };

/** Per-entity record in a state message: id, owner, kind, x, y, z, heading, order (all int32). */
export const STATE_STRIDE = 8;

export interface StateMessage {
  type: 'state';
  step: number;
  /** Latest desync hash and the step it was taken at. */
  hash: number;
  hashStep: number;
  count: number;
  /** count * STATE_STRIDE int32 values, transferred. */
  data: Int32Array;
}

/** Land, water or props changed in these chunks; the mesh workers apply them to their mirror worlds. */
export interface DeltasMessage {
  type: 'deltas';
  step: number;
  deltas: ChunkDelta[];
}

/** Explored fog tiles of the local player for these chunks: 16 x 16 bits each. */
export interface FogMessage {
  type: 'fog';
  chunks: Array<[number, number, Uint8Array]>;
}

export type FromWorker = StateMessage | DeltasMessage | FogMessage;
