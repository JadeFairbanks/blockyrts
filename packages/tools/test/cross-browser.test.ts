// The determinism check: each order script run from seed 1 gives the same
// hashes in Node and in every browser engine available. The M0 script moves
// units; the M1 script also generates the land they walk on, digs, builds,
// lets water flow, fells trees and reveals land, so the hashes cover the
// world's state too, and the M2 script covers workers, buildings, farms,
// lights and the day.
//
// Browsers come from Playwright. Locally a missing browser is skipped with a
// warning; CI sets SIM_REQUIRE_BROWSERS=chromium,firefox,webkit so a missing
// browser fails the run instead.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, hashHex, run } from '@blockyrts/sim';
import { loadOrderScript } from '../src/script.ts';

const SEED = 1;
const STEPS = 10_000;
const required = new Set((process.env.SIM_REQUIRE_BROWSERS ?? '').split(',').filter(Boolean));
const engines: Array<[string, BrowserType]> = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];
const scripts = ['m0-demo', 'm1-world', 'm2-camp', 'm3-nights', 'm4-economy', 'm5-threats'].map((name) => {
  const script = loadOrderScript(fileURLToPath(new URL(`../orders/${name}.json`, import.meta.url)));
  const players = script.players ?? 1;
  const peaceful = script.peaceful === true;
  return { name, players, peaceful, frames: script.frames, node: run(createWorld(SEED, { players, peaceful }), STEPS, script.frames) };
});

let bundle = '';

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
  for (const s of scripts) {
    it(`runs ${s.name} twice in Node with identical hashes`, () => {
      const again = run(createWorld(SEED, { players: s.players, peaceful: s.peaceful }), STEPS, s.frames);
      expect(s.node.hashes.length).toBe(STEPS / 20);
      expect(again.hashes).toEqual(s.node.hashes);
      console.log(`node ${s.name}: seed ${SEED}, ${s.players} player(s), ${STEPS} steps, final hash ${hashHex(s.node.finalHash)}`);
    });
  }

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
        for (const s of scripts) {
          const result = await page.evaluate(
            ([seed, steps, f, players, peaceful]) => globalThis.runSim(seed, steps, f, players, peaceful),
            [SEED, STEPS, s.frames, s.players, s.peaceful] as const,
          );
          console.log(`${name} ${browser.version()} ${s.name}: final hash ${hashHex(result.finalHash)}`);
          expect(result.hashes).toEqual(s.node.hashes);
          expect(result.finalHash).toBe(s.node.finalHash);
        }
      } finally {
        await browser.close();
      }
    });
  }
});

afterAll(() => {
  bundle = '';
});
