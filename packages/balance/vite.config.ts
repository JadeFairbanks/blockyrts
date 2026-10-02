import { execSync } from 'node:child_process';
import { defineConfig, type Plugin, type Rollup } from 'vite';
import { readSimDocs, SIM_SRC } from './scripts/sim-node.ts';

// The balance editor: `pnpm --filter @blockyrts/balance dev`, then open http://localhost:5175.
// `build` writes one self-contained dist/index.html (scripts, styles and the
// sim's tables inlined), which works opened from disk, as an Artifact, or
// served by Pages under /balance.

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: SIM_SRC, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/** virtual:sim-docs: the sim's comments, and the commit the tables come from. */
function simDocs(): Plugin {
  const id = 'virtual:sim-docs';
  return {
    name: 'sim-docs',
    resolveId: (s) => (s === id ? `\0${id}` : null),
    load(s) {
      if (s !== `\0${id}`) return null;
      const head = git('rev-parse HEAD');
      const dirty = git('status --porcelain -- .') !== '';
      const commit = head ? `${head}${dirty ? '+changes' : ''}` : 'unknown';
      return [
        `export const docs = ${JSON.stringify(readSimDocs())};`,
        `export const commit = ${JSON.stringify(commit)};`,
        `export const builtAt = ${JSON.stringify(new Date().toISOString())};`,
      ].join('\n');
    },
  };
}

/** Inlines the bundle's script and stylesheet into index.html, so the build is one file. */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f): f is Rollup.OutputAsset => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html) return;
      let text = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && (file as Rollup.OutputChunk).isEntry) {
          const code = (file as Rollup.OutputChunk).code.replace(/<\/script/gi, '<\\/script');
          text = text.replace(new RegExp(`<script[^>]*src="[^"]*${file.fileName}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          const css = String(file.source);
          text = text.replace(new RegExp(`<link[^>]*href="[^"]*${file.fileName}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      html.source = text;
    },
  };
}

export default defineConfig({
  plugins: [simDocs(), singleFile()],
  server: { port: 5175 },
  preview: { port: 5175 },
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
