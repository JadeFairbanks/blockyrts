// The headless two-player network test (pnpm --filter @blockyrts/tools net:test)
// as part of the suite. With TEST_DATABASE_URL and TEST_S3_* set (CI), the
// server behind it uses PostgreSQL and object storage; otherwise memory.
import { expect, it } from 'vitest';
import { runTwoPlayerScenario, startTestServer } from '../src/net/two-player.ts';

it('two players: lobby, relay, desync reload, rejoin, save and load', async () => {
  const env: Record<string, string | undefined> = {};
  if (process.env.TEST_DATABASE_URL) env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  if (process.env.TEST_S3_ENDPOINT) {
    Object.assign(env, {
      SAVE_STORE: 's3',
      S3_ENDPOINT: process.env.TEST_S3_ENDPOINT,
      S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'saves',
      S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY,
      S3_REGION: 'us-east-1',
    });
  }
  const app = await startTestServer(env);
  try {
    const lines: string[] = [];
    const r = await runTwoPlayerScenario({ httpUrl: `http://127.0.0.1:${app.port}`, log: (l) => lines.push(l) });
    console.log(`two-player test: ${r.checks.length} checks passed, final hash ${r.finalHash}`);
    expect(r.replayHash).toBe(r.finalHash);
    expect(r.checks.length).toBeGreaterThanOrEqual(27);
  } finally {
    await app.close();
  }
}, 120_000);
