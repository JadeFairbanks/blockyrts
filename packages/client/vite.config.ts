import { defineConfig } from 'vite';
import { sitePlugin, siteUrl } from './site.ts';

// `pnpm dev` passes the game server's routes to a local server (pnpm --filter
// @blockyrts/server dev, port 8080), so the page and the server share one
// origin in development; SAC_SERVER points it elsewhere.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const server = env.SAC_SERVER ?? 'http://localhost:8080';

// The public site's address (the Deploy workflow sets it), for the canonical
// link, link previews, robots.txt and sitemap.xml (site.ts).
const site = siteUrl(env.VITE_SITE_URL);

export default defineConfig({
  plugins: [sitePlugin(site)],
  worker: { format: 'es' },
  // three.js alone is about 500 kB minified.
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  server: {
    proxy: {
      '/api': server,
      '/healthz': server,
      '/relay': { target: server.replace(/^http/, 'ws'), ws: true },
    },
  },
});
