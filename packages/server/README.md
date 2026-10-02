# @blockyrts/server

One Node.js 22 process that serves the account and save API, the lobby and the
lockstep relay (technical decisions 3 and 9). It runs no game logic: every
player's browser runs the simulation, and the server only forwards each step's
input frames, keeps the last two minutes of frames for rejoin, compares the
state hashes players send every 20 steps, and names the minority on a desync.

Planned pieces (M9): a plain WebSocket relay with `ws`, rooms and 6-character
join codes, PostgreSQL for accounts, matches and save metadata, S3-compatible
object storage for save blobs, Argon2id passwords and httpOnly session cookies,
all behind Caddy in one docker compose file that also works for self-hosting.

It is a stub until then.
