// What a staged scene gives the art stager.
import type * as THREE from 'three';
import type { ModelLibrary } from '../../models/index.ts';
import type { Finish } from '../post.ts';

export interface StageContext {
  library: ModelLibrary;
  /** The picture's size in pixels (before supersampling). */
  width: number;
  height: number;
  params: URLSearchParams;
}

export interface StagedScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  finish: Finish;
  toneMapping?: THREE.ToneMapping;
  /** Shown on the preview page. */
  note?: string;
}

export interface Stager {
  /** The catalogue models the scene uses, loaded before build runs. */
  models: readonly string[];
  build(ctx: StageContext): Promise<StagedScene>;
}
