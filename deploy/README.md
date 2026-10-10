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

## Sign-in page and search

**On/off switch:** `SIGN_IN_ON` in `deploy/pages/functions/_middleware.ts`
(off for Patch 7, back on since mini patch 7.3). Set to `false`, the
middleware lets every request straight through (it still marks the
pages.dev mirror `noindex`) and anyone with the address reaches the game;
everything below stays in place, and Deploy still checks and publishes the
password secret either way. Change it and run Deploy to switch.

The browser's own user name and password box stands in front of the whole
site, the play domain and the `blockyrts.pages.dev` mirror alike, so
passers-by do not reach the game or its server. It is a deterrent, not
security: the server's own address is not behind it. (The indev password
gate from before Patch 5 came off with Patch 5; this one came back after it.)

- `deploy/pages/functions/_middleware.ts` is a Pages Functions middleware.
  Without the sign-in cookie or the right user name and password it answers
  every page with 401 and `WWW-Authenticate: Basic`, which makes the browser
  ask; with them, the site as usual. The user name is in the file (`Admin`,
  any capitals). The password is the `SITE_PASSWORD` secret (below), exactly
  as visitors type it (spaces at either end are dropped); Deploy copies it
  into the Pages project as a secret of the same name before each deploy, so
  it is not in the repository. The check is a plain comparison (of the two
  passwords' SHA-256), well inside the free plan's 10 ms of CPU a request.
  After the right answer the middleware sets a signed cookie for 30 days, so
  the box does not come back each time the browser restarts. Changing the
  password signs everyone out.
- `deploy/pages/static/_routes.json` lets the game's files (`/assets/`,
  `/models/`, `/audio/`), the icon, the preview picture, `robots.txt`,
  `sitemap.xml` and the installable app's files (below) skip the middleware,
  so loading the game costs no Functions requests (the free plan has 100,000
  a day).
- Everywhere search engines and link previews look, the site presents the
  game as a co-op survival open world RTS, with one title, description and
  longer pitch (`SITE_HEADLINE`, `SITE_DESCRIPTION`, `SITE_ABOUT` in
  `packages/client/site.ts`, repeated in the middleware). Search engines and previews read the page
  behind the box (what a visitor sees after closing it), which carries the
  title, description, preview tags and structured data; since it comes with
  a 401, search engines may also leave the site out altogether. Behind it, `packages/client/index.html` carries the same
  words and a short summary for readers without JavaScript, and
  `packages/client/site.ts` is a Vite plugin: when the build is given the
  site's address as `VITE_SITE_URL` (Deploy sets `https://play.<DOMAIN>`), it
  adds the canonical link, the preview's address and picture
  (`public/og-image.jpg`, 1200 by 630) and the structured data, and writes
  `robots.txt` (open, with the sitemap) and `sitemap.xml`.
- `deploy/pages/static/_headers`: `noindex` on the mirror and each deploy's
  preview address, so searches find the play domain alone. These rules do
  not reach what a Function answers, so the middleware repeats them.

The balance editor is no longer published at `/balance/`; it stays a private
tool (`pnpm balance:dev`).

To change the password, put the new one in the `SITE_PASSWORD` secret and
run Deploy. To take the sign-in box off, delete
`deploy/pages/functions` and `_routes.json` and their steps in the Deploy
workflow.

## Installable app

The game installs as an app, from the main menu's **Install app** button
(`packages/client/src/ui/install.ts`). `packages/client/public/manifest.webmanifest`
gives its name, icons (`public/icons/`, drawn from the site icon by
`pnpm --filter @blockyrts/client icons`), full screen and landscape; the
client build writes the service worker, `sw.js` (`packages/client/pwa.ts`).
The worker keeps only the build's own files under `/assets/`, in a store
named for the build, and never a page, so the sign-in page always decides
what opens and a deploy's new page is always the one served. Models, sounds
and the game server pass straight through it.

`_routes.json` lets `/manifest.webmanifest`, `/sw.js` and `/icons/` skip the
sign-in middleware: browsers fetch the manifest without the sign-in cookie,
and the worker has to be able to update itself for a signed-out browser.
They hold nothing private, and as plain files they cost no Functions
requests.

## Game version

The main menu shows the version, such as `indev 0.1`. `version.json` at the
repository root holds the stage (`indev`, later `alpha` and `beta`) and the
lowest number the next deploy may take. Each Deploy run tags its commit
`live-<number>` and goes up by 0.1 from the highest such tag
(`deploy/scripts/game-version.ts`); running Deploy again on a commit that is
already live keeps its number. For a bigger step or a new stage, edit
`version.json` (for example `"stage": "alpha", "next": "1.0"`) before the
deploy. Local builds show the next number marked as a dev build.

For a small fix that should not count as a new version, run Deploy with
**Hotfix** ticked: the menu keeps the highest live number, no tag is added,
and the next ordinary deploy still goes up by 0.1 from it.

## Secrets and variables (repository Settings > Secrets and variables > Actions)

| Name | Kind | What it is |
|---|---|---|
| `DOMAIN` | variable | The domain, for example `example.ca` (a site in the Cloudflare account) |
| `DIGITALOCEAN_TOKEN` | secret | DigitalOcean API token, full access |
| `CLOUDFLARE_API_TOKEN` | secret | Custom token: Account Cloudflare Pages Edit, Account Cloudflare Tunnel Edit, Zone DNS Edit, Zone Zone Read (that zone) |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare account ID |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secrets | R2 API token, Object Read & Write, bucket `blockyrts-saves` (create the bucket first) |
| `RESEND_API_KEY` | secret, optional | Resend sending key for `mail.<DOMAIN>`; without it password-reset email is off |
| `SITE_PASSWORD` | secret | The sign-in box's password, as typed; Deploy stops without it (a `SITE_LOGIN_HASH` secret is read the same way when `SITE_PASSWORD` is not set) |

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
| `DEBUG_ACCOUNTS` | not set: the accounts that may open the debugger are `jade,proteus` (any capitals); set it, comma-separated, to change them |

On start the server deletes the files of every save older than the live save
format (Patch 5) and logs how many; the saves' owners still see them, marked
out of date, until they remove them from Load game.

The client is built with `VITE_SERVER_URL=https://api.<DOMAIN>`.

## Emailing players

The **Email players** workflow (`.github/workflows/email-players.yml`, run by
hand only) sends one email to every account on the live server, such as the
note that a new patch is live. The message is a plain-text file in
`deploy/mail/`: a `Subject: ` line, a blank line, then the text, where
`{username}` becomes each player's username. The run's inputs are the file's
name without `.txt` and a **Send** box; unticked is a dry run that counts the
players and shows the message, and sends nothing.

The Droplet takes no inbound traffic, so the job travels like a deploy, by
pull: the workflow (`deploy/scripts/email-players.sh`) puts `jobs/mail.json`
in the save bucket, the server takes it within half a minute, sends through
the password-reset email service (`EMAIL_API_KEY`, under two emails a
second), and writes counts to `jobs/results/<run>.json`, which the run
prints. The `mail_sent` table remembers who has had which message, so an
account never gets the same one twice: running the workflow again after a
failure sends only to the accounts that missed it. No address appears in
the results or the run log (the repository's run logs are public). The run
also counts the accounts in the newest nightly backup, which still works
while the live server is a version from before mail jobs.

It uses the secrets setup already has: `CLOUDFLARE_API_TOKEN`, the R2 key,
and the server's `EMAIL_API_KEY` (from `RESEND_API_KEY`).

## Server load

To see how busy the server is, open the Droplet `blockyrts-1` in the
DigitalOcean dashboard and its **Graphs** tab (CPU, memory, load, disk and
network). The **Server load** workflow (`.github/workflows/server-load.yml`,
run by hand) prints the same numbers for the last hours, hour by hour, with
the rooms open right now from `/healthz`. It is read-only: it changes nothing
on the server. It uses `DIGITALOCEAN_TOKEN` and the `DOMAIN` variable, and
prints no address or Droplet ID, since the run logs are public.

## Changing things later

- **New setting or secret:** add it to `compose.yml`, then the next Deploy
  ships it. If it needs a new value in the Droplet's `.env`, add it to
  `scripts/render-cloud-init.py` and `scripts/setup.sh`, then re-run setup
  with "Replace the server" ticked. The database stays on the volume.
- **Bigger server:** re-run setup with `s-2vcpu-4gb` and "Replace the server".
- **Managed database (public launch):** create DigitalOcean Managed
  PostgreSQL in `tor1`, restore the latest dump from R2, point
  `DATABASE_URL` at it, and remove the `db` service.
