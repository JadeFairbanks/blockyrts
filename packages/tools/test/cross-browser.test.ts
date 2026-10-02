// The M0 check: 10,000 steps from seed 1 with the demo order script give the
// same hashes in Node and in every browser engine available.
//
// Browsers come from Playwright. Locally a missing browser is skipped with a
// warning; CI sets SIM_REQUIRE_BROWSERS=chromium,firefox so a missing browser
// fails the run instead.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, hashHex, run } from '@blockyrts/sim';
import { loadOrderScript } from '../src/script.ts';

const SEED = 1;
const STEPS = 10_000;
const frames = loadOrderScript(fileURLToPath(new URL('../orders/m0-demo.json', import.meta.url))).frames;
const required = new Set((process.env.SIM_REQUIRE_BROWSERS ?? '').split(',').filter(Boolean));
const engines: Array<[string, BrowserType]> = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];

let bundle = '';
const node = run(createWorld(SEED), STEPS, frames);

beforeAll(async () => {
  const out = await build({
    entryPoints: [fileURLToPath(new URL('../src/browser-entry.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  bundle = out.outputFiles[0]!.text;
});

describe('cross-engine determinism', () => {
  it('runs the same script twice in Node with identical hashes', () => {
    const again = run(createWorld(SEED), STEPS, frames);
    expect(node.hashes.length).toBe(STEPS / 20);
    expect(again.hashes).toEqual(node.hashes);
    console.log(`node: seed ${SEED}, ${STEPS} steps, final hash ${hashHex(node.finalHash)}`);
  });

  for (const [name, engine] of engines) {
    it(`gives the Node hashes in ${name}`, async (ctx) => {
      let browser;
      try {
        browser = await engine.launch();
      } catch (err) {
        if (required.has(name)) throw err;
        console.warn(`${name} is not installed here; skipped (${String(err).split('\n')[0]})`);
        ctx.skip();
        return;
      }
      try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><title>sim</title>');
        await page.addScriptTag({ content: bundle });
        const result = await page.evaluate(
          ([seed, steps, f]) => globalThis.runSim(seed, steps, f),
          [SEED, STEPS, frames] as const,
        );
        console.log(`${name} ${browser.version()}: final hash ${hashHex(result.finalHash)}`);
        expect(result.hashes).toEqual(node.hashes);
        expect(result.finalHash).toBe(node.finalHash);
      } finally {
        await browser.close();
      }
    });
  }
});

afterAll(() => {
  bundle = '';
});
