// Entry point: `node dist/main.js` in the container, `pnpm --filter
// @blockyrts/server dev` in a checkout.
//
//   --migrate                 bring the database schema up to date and exit
//   --set-password <login>    set an account's password (read from standard
//                             input) and exit: the admin's way to reset a
//                             password when the server has no email service

import { createInterface } from 'node:readline';
import pg from 'pg';
import { AccountService } from './accounts.ts';
import { startApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, PostgresDatabase } from './db/postgres.ts';

const config = loadConfig();
const args = process.argv.slice(2);

async function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer;
}

if (args.includes('--migrate') || args.includes('--set-password')) {
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (args.includes('--migrate')) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    console.log(`database schema at version ${await migrate(pool)}`);
    await pool.end();
  } else {
    const login = args[args.indexOf('--set-password') + 1];
    if (!login) {
      console.error('usage: --set-password <email or username> (the new password is read from standard input)');
      process.exit(1);
    }
    const db = await PostgresDatabase.connect(config.databaseUrl);
    try {
      const accounts = new AccountService({ db, mailer: null, publicUrl: config.publicUrl });
      const account = await accounts.setPasswordByHand(login, (await readLine('New password: ')).trim());
      console.log(`password set for ${account.username}; their sessions are signed out`);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    } finally {
      await db.close();
    }
  }
} else {
  const app = await startApp(config);
  const stop = (signal: string): void => {
    console.log(`server: ${signal}, closing`);
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
