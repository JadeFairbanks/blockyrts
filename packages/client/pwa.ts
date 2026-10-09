// The installable app (the main menu's Install app button is
// src/ui/install.ts). public/manifest.webmanifest gives the game's name, its
// icons (public/icons/, drawn from the site icon by scripts/make-icons.mjs),
// full screen and landscape; this Vite plugin writes the service worker,
// sw.js, which some browsers want before they offer to install a site. The
// worker is kept as small as it can be, and does nothing while a match plays:
//
// - Pages are never stored or answered by it. Every visit asks the site, so
//   the sign-in page (deploy/pages) always decides who gets the game, and a
//   deploy's new page is the one that opens.
// - The build's own files under /assets/, whose names change with their
//   contents, are kept after their first load in a store named for the build
//   and come from it after that. A new build's worker empties older stores.
// - Everything else (models, sounds, the game server) goes straight to the
//   network; Chromium sends it past the worker without waking it at all.

import type { Plugin } from 'vite';

/** The worker's file, at the site's root so it covers every page. */
export const SERVICE_WORKER = 'sw.js';

/** A short name for a build, from the names of its files (each carries a hash of its contents). */
export function buildId(fileNames: readonly string[]): string {
  // cyrb53: two 32-bit mixes of the sorted names, 16 hex digits.
  const text = [...fileNames].sort().join('\n');
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return [b, a].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/** sw.js for build `build`, keeping the files under `assets` (the site's path, such as '/assets/'). */
export function serviceWorker(build: string, assets: string): string {
  return `// Survive and Conquer's service worker, written at build by packages/client/pwa.ts.
const STORE = ${JSON.stringify(`sac-assets-${build}`)};
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Chromium's static routes: only the build's files wake this worker.
  if (event.addRoutes) {
    event.waitUntil(
      event
        .addRoutes([
          { condition: { urlPattern: new URLPattern({ pathname: ASSETS + '*' }) }, source: 'fetch-event' },
          { condition: { urlPattern: new URLPattern({}) }, source: 'network' },
        ])
        .catch(() => undefined),
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('sac-assets-') && name !== STORE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(ASSETS)) return;
  event.respondWith(kept(event));
});

/** A build file from the store, else from the network, then kept. */
async function kept(event) {
  const request = event.request;
  let store = null;
  try {
    store = await caches.open(STORE);
    const hit = await store.match(request);
    if (hit) return hit;
  } catch {
    store = null;
  }
  const response = await fetch(request);
  // Only the whole file: not an error, a part of one, or a page sent in its place.
  const type = response.headers.get('content-type') || '';
  if (store && response.status === 200 && response.type === 'basic' && !type.startsWith('text/html')) {
    event.waitUntil(store.put(request, response.clone()).catch(() => undefined));
  }
  return response;
}
`;
}

/** The Vite plugin: sw.js beside the build, named for that build's files. Builds only. */
export function pwaPlugin(): Plugin {
  let assets = '/assets/';
  return {
    name: 'blockyrts-pwa',
    apply: 'build',
    configResolved(config) {
      assets = `${config.base}${config.build.assetsDir}/`;
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: SERVICE_WORKER, source: serviceWorker(buildId(Object.keys(bundle)), assets) });
    },
  };
}
