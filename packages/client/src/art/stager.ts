// The art stager (art.html, a development page that is not part of the game's
// build): stages the pictures for the screens outside the match in the
// game's own renderer, with the game's own models and world generation, and
// hands each finished picture back as an image. The pictures are made by
// `pnpm --filter @blockyrts/client art` (scripts/make-art.mjs), which opens
// this page in Chromium and saves what artCapture returns.
//
// URL options: scene=battle|map|sheet, w and h (the picture's size; default
// the window), ss (supersampling factor for the capture, default 2).
import * as THREE from 'three';
import { openModelLibrary } from '../models/index.ts';
import { Finisher } from './post.ts';
import type { StagedScene, Stager } from './scenes/types.ts';
import { battleScene } from './scenes/battle.ts';
import { mapScene } from './scenes/map.ts';
import { sheetScene } from './scenes/sheet.ts';

const SCENES: Record<string, Stager> = { battle: battleScene, map: mapScene, sheet: sheetScene };

const params = new URLSearchParams(location.search);
const sceneName = params.get('scene') ?? 'battle';
const info = document.getElementById('info');
const say = (text: string): void => {
  if (info) info.textContent = text;
};

declare global {
  interface Window {
    artReady?: boolean;
    artError?: string;
    /** Renders the picture at w x h (supersampled ss times) and returns it as a data URL. */
    artCapture?: (type?: string, quality?: number) => string;
  }
}

async function stage(): Promise<void> {
  const stager = SCENES[sceneName];
  if (!stager) throw new Error(`no scene "${sceneName}" (scenes: ${Object.keys(SCENES).join(', ')})`);
  const width = Number(params.get('w') ?? window.innerWidth);
  const height = Number(params.get('h') ?? window.innerHeight);
  const ss = Number(params.get('ss') ?? 2);
  say(`Loading models for ${sceneName}...`);
  const library = await openModelLibrary(params.get('lib') ?? '/models/', stager.models);
  await library.ready(stager.models);
  const missing = stager.models.filter((id) => !library.models.has(id));
  if (missing.length) console.warn(`models not loaded: ${missing.join(', ')}`);
  say(`Staging ${sceneName}...`);
  const staged: StagedScene = await stager.build({ library, width, height, params });

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = staged.toneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  document.body.appendChild(renderer.domElement);

  // The preview fits the window; the capture renders at the full size.
  const fitPreview = (): void => {
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    renderer.domElement.style.width = `${Math.floor(width * scale)}px`;
    renderer.domElement.style.height = `${Math.floor(height * scale)}px`;
  };
  const previewW = Math.min(width, 1600);
  const previewH = Math.round((previewW * height) / width);
  renderer.setSize(previewW, previewH, false);
  staged.camera.aspect = width / height;
  staged.camera.updateProjectionMatrix();
  fitPreview();
  window.addEventListener('resize', fitPreview);
  let finisher = new Finisher(renderer, staged.scene, staged.camera, previewW, previewH, staged.finish);
  finisher.render();
  say(`${sceneName}: ${width} x ${height}. ${staged.note ?? ''}`);

  window.artCapture = (type = 'image/webp', quality = 0.86): string => {
    const W = width * ss;
    const H = height * ss;
    renderer.setSize(W, H, false);
    finisher.dispose();
    finisher = new Finisher(renderer, staged.scene, staged.camera, W, H, staged.finish);
    finisher.render();
    // Halve step by step for a clean downscale.
    let src: HTMLCanvasElement = renderer.domElement;
    let w = W;
    let h = H;
    while (w > width) {
      const nw = Math.max(width, Math.round(w / 2));
      const nh = Math.max(height, Math.round(h / 2));
      const c = document.createElement('canvas');
      c.width = nw;
      c.height = nh;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, nw, nh);
      src = c;
      w = nw;
      h = nh;
    }
    if (src === renderer.domElement) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      src = c;
    }
    return src.toDataURL(type, quality);
  };
  window.artReady = true;
}

stage().catch((e: unknown) => {
  const text = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  window.artError = text;
  say(`Failed: ${text}`);
  console.error(e);
});
