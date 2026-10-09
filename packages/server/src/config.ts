// Settings, all from environment variables (the names the hosting plan and
// the deploy workflows use). With none set, the server runs entirely in
// memory on port 8080 for local play and tests.

export interface Config {
  port: number;
  /** PostgreSQL connection string; empty runs the in-memory database (nothing survives a restart). */
  databaseUrl: string;
  saveStore: 'memory' | 'disk' | 's3';
  saveDir: string;
  s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string };
  /** Empty turns password-reset email off: the server still starts, and the reset request answers email_not_configured. */
  emailApiKey: string;
  emailFrom: string;
  emailApiUrl: string;
  /** Where players open the game: the base of reset and invite links. */
  publicUrl: string;
  /** Origins (the game page) allowed to call the API with cookies and to open sockets. */
  allowedOrigins: string[];
  /** 'cloudflare' reads the player's address from CF-Connecting-IP, 'x-forwarded-for' from that header; empty trusts no header. */
  trustedProxy: '' | 'cloudflare' | 'x-forwarded-for';
  /** Usernames that may open the debugger (DEBUG_ACCOUNTS, comma-separated; Jade's two admin accounts when unset). */
  debugAccounts: string[];
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const get = (name: string, fallback = ''): string => (env[name] ?? '').trim() || fallback;
  const port = Number(get('PORT', '8080'));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT must be a port number, not "${get('PORT')}"`);
  const store = get('SAVE_STORE', 'memory');
  if (store !== 'memory' && store !== 'disk' && store !== 's3') throw new Error(`SAVE_STORE must be s3, disk or memory, not "${store}"`);
  const proxy = get('TRUSTED_PROXY').toLowerCase();
  const trustedProxy = proxy === '' || proxy === 'false' || proxy === '0' ? '' : proxy === 'x-forwarded-for' ? 'x-forwarded-for' : 'cloudflare';
  const config: Config = {
    port,
    databaseUrl: get('DATABASE_URL'),
    saveStore: store,
    saveDir: get('SAVE_DIR', './saves'),
    s3: {
      endpoint: get('S3_ENDPOINT'),
      bucket: get('S3_BUCKET'),
      accessKeyId: get('S3_ACCESS_KEY_ID'),
      secretAccessKey: get('S3_SECRET_ACCESS_KEY'),
      region: get('S3_REGION', 'auto'),
    },
    emailApiKey: get('EMAIL_API_KEY') || get('RESEND_API_KEY'),
    emailFrom: get('EMAIL_FROM'),
    emailApiUrl: get('EMAIL_API_URL', 'https://api.resend.com/emails'),
    publicUrl: get('PUBLIC_URL', `http://localhost:${port}`).replace(/\/+$/, ''),
    allowedOrigins: get('ALLOWED_ORIGINS')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    trustedProxy,
    debugAccounts: get('DEBUG_ACCOUNTS', 'jade,proteus')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
  if (store === 's3') {
    for (const [k, v] of Object.entries({ S3_ENDPOINT: config.s3.endpoint, S3_BUCKET: config.s3.bucket, S3_ACCESS_KEY_ID: config.s3.accessKeyId, S3_SECRET_ACCESS_KEY: config.s3.secretAccessKey })) {
      if (!v) throw new Error(`SAVE_STORE=s3 needs ${k}`);
    }
  }
  if (config.emailApiKey && !config.emailFrom) {
    // Never refuse to start over email: send from no-reply@ the public host.
    config.emailFrom = `no-reply@${new URL(config.publicUrl).hostname}`;
  }
  return config;
}
