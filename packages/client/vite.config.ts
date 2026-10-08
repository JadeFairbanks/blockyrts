import { defineConfig, type Plugin } from 'vite';
import { readSimDocs } from '@blockyrts/balance/node';
import type { SimDocs } from '@blockyrts/balance';

// `pnpm dev` passes the game server's routes to a local server (pnpm --filter
// @blockyrts/server dev, port 8080), so the page and the server share one
// origin in development; SAC_SERVER points it elsewhere.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const server = env.SAC_SERVER ?? 'http://localhost:8080';

/**
 * virtual:sim-exports: which tables each sim module declares, where, and
 * under which section heading, for How to Play's pages of numbers (the
 * balance catalog needs them to tell a module's own tables from re-exports).
 * Only the names, lines and short titles ship: none of the code's comments.
 */
function simExports(): Plugin {
  const id = 'virtual:sim-exports';
  return {
    name: 'sim-exports',
    resolveId: (s) => (s === id ? `\0${id}` : null),
    load(s) {
      if (s !== `\0${id}`) return null;
      const docs: SimDocs = {};
      for (const [module, d] of Object.entries(readSimDocs())) {
        const exports: SimDocs[string]['exports'] = {};
        for (const [name, e] of Object.entries(d.exports)) exports[name] = { doc: '', line: e.line, ...(e.section ? { section: e.section } : {}) };
        // The header's first sentence names a page of loose numbers when the catalog has no title for it.
        const first = d.header.split(/(?<=[.:])\s|\s\(/)[0] ?? '';
        docs[module] = { header: first.length <= 70 ? first : '', exports, props: {} };
      }
      return `export const docs = ${JSON.stringify(docs)};`;
    },
  };
}

export default defineConfig({
  plugins: [simExports()],
  // How to Play's worker reads the sim's export list too.
  worker: { format: 'es', plugins: () => [simExports()] },
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
