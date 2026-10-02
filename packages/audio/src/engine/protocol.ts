// Messages between the engine and its render workers.
import type { MusicStateId } from '../music/score.ts';

export type RenderRequest =
  | { readonly job: number; readonly kind: 'sound'; readonly id: string; readonly sr: number }
  | { readonly job: number; readonly kind: 'music'; readonly state: MusicStateId; readonly sr: number };

export type RenderResponse =
  | { readonly job: number; readonly kind: 'sound'; readonly id: string; readonly sr: number; readonly variants: Float32Array[] }
  | {
      readonly job: number;
      readonly kind: 'music';
      readonly state: MusicStateId;
      readonly sr: number;
      /** base left, base right, tension left, tension right. */
      readonly channels: Float32Array[];
    }
  | { readonly job: number; readonly kind: 'error'; readonly message: string };
