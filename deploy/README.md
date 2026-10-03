# Deploying the test server

Two workflows put the game online. Both run only when started by hand from
the repository's Actions tab, and never on a push.

- **Set up test server** (`.github/workflows/setup-test-server.yml`) finds or
  creates everything once. It can be re-run safely.
- **Deploy** (`.github/workflows/deploy.yml`) ships a commit to that server.

The full hosting comparison and costs are in the project files under
`hosting/hosting-plan.md`.

## What runs where

| Piece | Where | Address |
|---|---|---|
| Game client (static Vite build) | Cloudflare Pages project `blockyrts` | `https://play.<DOMAIN>` |
| Balance editor (one static page from packages/balance) | Same Pages project | `https://play.<DOMAIN>/balance/` |
| Server (API, lobby, relay) | DigitalOcean Droplet `blockyrts-1`, Toronto, Docker | `https://api.<DOMAIN>` through a Cloudflare Tunnel |
| PostgreSQL 16 | Container on the Droplet, data on the volume `blockyrts-data` | inside the Droplet only |
| Save files and nightly database dumps | Cloudflare R2 bucket `blockyrts-saves` | S3 API |
| Container images | DigitalOcean Container Registry, starter tier (free) | `registry.digitalocean.com/<name>/blockyrts` |
| Password-reset email | Resend, domain `mail.<DOMAIN>` | API |

The Droplet's firewall allows **no inbound traffic**. `cloudflared` connects
out to Cloudflare, and Cloudflare handles HTTPS, WebSockets and DDoS
filtering. For emergencies, use the Recovery Console in the DigitalOcean
dashboard.

Deploys are pull-based, so GitHub never needs to SSH in. The Deploy workflow
pushes two images, `server-live` and `bundle-live`. The bundle carries
`compose.yml` and `droplet/backup.sh`. Every minute, a timer on the Droplet
(`droplet/update.sh`) pulls both images and runs `docker compose up -d`.

## Secrets and variables (repository Settings > Secrets and variables > Actions)

| Name | Kind | What it is |
|---|---|---|
| `DOMAIN` | variable | The domain, for example `example.ca` (a site in the Cloudflare account) |
| `DIGITALOCEAN_TOKEN` | secret | DigitalOcean API token, full access |
| `CLOUDFLARE_API_TOKEN` | secret | Custom token: Account Cloudflare Pages Edit, Account Cloudflare Tunnel Edit, Zone DNS Edit, Zone Zone Read (that zone) |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare account ID |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secrets | R2 API token, Object Read & Write, bucket `blockyrts-saves` (create the bucket first) |
| `RESEND_API_KEY` | secret, optional | Resend sending key for `mail.<DOMAIN>`; without it password-reset email is off |

## Contract with `packages/server` (owned by the server thread)

The workflows expect these, and do not create them:

- `packages/server/Dockerfile`, built from the **repository root** as context
  (`docker build -f packages/server/Dockerfile .`). It accepts
  `ARG BUILD_SHA` and exposes it at runtime.
- The server listens on `PORT` (8080) over plain HTTP. TLS ends at Cloudflare.
- `GET /healthz` answers 200, with a body that contains `BUILD_SHA`. Deploy
  waits for this.
- Database migrations run on start.
- WebSocket heartbeat under 60 s, because Cloudflare closes idle connections.
- Environment variables it reads (set in `compose.yml`):

| Variable | Value on the test server |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `DATABASE_URL` | `postgres://blockyrts:<generated>@db:5432/blockyrts` |
| `SAVE_STORE` | `s3` (`disk` with `SAVE_DIR` for self-hosting) |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `blockyrts-saves` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2 key |
| `EMAIL_API_KEY` | Resend key, or empty: the server must then run with password-reset email off (say so on the reset screen) |
| `EMAIL_FROM` | `no-reply@mail.<DOMAIN>` |
| `PUBLIC_URL` | `https://play.<DOMAIN>` (base for reset and invite links) |
| `ALLOWED_ORIGINS` | `https://play.<DOMAIN>` |
| `SESSION_SECRET` | generated on first boot, kept on the volume |
| `TRUSTED_PROXY` | `cloudflare` (read the client address from `CF-Connecting-IP`) |

The client is built with `VITE_SERVER_URL=https://api.<DOMAIN>`.

## Changing things later

- **New setting or secret:** add it to `compose.yml`, then the next Deploy
  ships it. If it needs a new value in the Droplet's `.env`, add it to
  `scripts/render-cloud-init.py` and `scripts/setup.sh`, then re-run setup
  with "Replace the server" ticked. The database stays on the volume.
- **Bigger server:** re-run setup with `s-2vcpu-4gb` and "Replace the server".
- **Managed database (public launch):** create DigitalOcean Managed
  PostgreSQL in `tor1`, restore the latest dump from R2, point
  `DATABASE_URL` at it, and remove the `db` service.
