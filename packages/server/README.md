# @blockyrts/server

One Node.js 22 process that serves the account and save API, the lobby and
the lockstep relay (technical decisions 3 and 9). It runs no game logic:
every player's browser runs the simulation, and the server forwards each
step's input frames, keeps the last two minutes of them for rejoin, compares
the state hashes players send every 20 steps, and has everyone reload the
host's state on a desync.

## Running it

```sh
pnpm --filter @blockyrts/server dev          # from a checkout, in memory, port 8080
pnpm --filter @blockyrts/server build        # bundles to dist/main.js
pnpm --filter @blockyrts/server start        # runs the bundle
docker build -f packages/server/Dockerfile --build-arg BUILD_SHA=$(git rev-parse HEAD) -t blockyrts-server .
```

With no settings it keeps everything in memory, which is fine for local play
and tests. `GET /healthz` answers `{"ok":true,"build":"<BUILD_SHA>","rooms":N}`.
Database migrations run on start; `--migrate` runs them alone. With no
email service an admin sets a password by hand:
`node dist/main.js --set-password <email or username>` (reads the new password
from standard input).

## Settings (environment variables, as deploy/README.md lists them)

| Variable | Meaning |
|---|---|
| `PORT` | Port for plain HTTP and WebSockets (default 8080). TLS ends at the edge (Cloudflare). |
| `DATABASE_URL` | PostgreSQL connection string. Empty: in-memory, lost on restart. |
| `SAVE_STORE` | `s3`, `disk` or `memory` (default). |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object storage for `s3` (Cloudflare R2: region `auto`). Path-style addressing. |
| `SAVE_DIR` | Directory for `disk` (default `./saves`). |
| `EMAIL_API_KEY` | Transactional email key (Resend). Empty: reset email is off, the reset request answers 503 `email_not_configured`, and the server still starts. |
| `EMAIL_FROM` | Sender, such as `no-reply@mail.example.com` (defaults to `no-reply@` the public host). |
| `EMAIL_API_URL` | Optional; defaults to Resend's API. |
| `PUBLIC_URL` | Where players open the game; the base of reset links. An `https` address makes the cookie Secure. |
| `ALLOWED_ORIGINS` | Comma-separated origins (the game page) allowed to call the API with cookies and open sockets. |
| `TRUSTED_PROXY` | `cloudflare` reads the player's address from `CF-Connecting-IP` for rate limits; `x-forwarded-for` reads that header; empty trusts neither. |
| `SESSION_SECRET` | Accepted but not needed: session tokens are random 256-bit strings stored only as SHA-256 hashes, nothing is signed. |
| `BUILD_SHA` | Set by the Dockerfile's build argument; echoed by `/healthz`. |

## What is in it

- `src/relay/room.ts`: a room's lobby (slots, colours, ready, start, the host
  role passing on in join order), the lockstep relay (one frame per player per
  step, strictly in order, echoed to everyone; a two-minute log), pause on
  disconnect (heartbeat every second, dropped after 3 s), the host's choice
  after 30 s (wait, carry on without them, save and quit), rejoin from the log
  or from a present player's snapshot, hash comparison every 20 steps with
  the majority right and the host breaking a tie, reload from the host on a
  desync, the input delay raised to round trip + 2 steps (4 to 12), chat, map
  pings, and a message rate cap.
- `src/relay/relay.ts`: the WebSocket endpoint `/relay`, sign-in from the
  session cookie (or a token in the hello message), guests named "Guest" and
  four digits, 6-character join codes, a cap on rooms per address.
- `src/accounts.ts`: accounts (email, username, password; Argon2id), guests,
  sessions (httpOnly cookie, 30 days), password reset links that expire in 30
  minutes and work once, a guest turning into an account mid-match.
- `src/saves.ts`: save slots. Bytes in object storage, metadata in
  PostgreSQL, always under the match owner's account (a multiplayer save is the
  host's); a guest-hosted match cannot be saved until the guest makes an
  account; the current host may save even when the role has passed; dawn
  autosaves keep the newest three per match; 50 MB per save, 500 MB per
  account.
- `src/http.ts`: the JSON API (routes in `@blockyrts/protocol`'s `ApiRoutes`),
  CORS for the game page, per-address limits on sign-in, sign-up, guests and
  reset emails.
- `src/mail-jobs.ts`: an email to every account (Patch 5), asked for by the
  "Email players" workflow through the save store: `jobs/mail.json` is
  checked every 30 s, each account gets a named message at most once (the
  `mail_sent` table), a dry run only counts, and the counts go back to
  `jobs/results/<request>.json` with no addresses in them
  (deploy/README.md, "Emailing players").
- `src/db`: PostgreSQL and in-memory stores behind one interface;
  `src/blobs.ts`: S3, disk and memory save stores.
