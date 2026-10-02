<!--
Generated from the canonical blueprint, adventure-blueprint-controls.docx, by
packages/tools/scripts/extract-blueprint.py. Do not edit by hand: the .docx is
canon and blueprint changes go through the project coordinator. Re-run the
script to refresh this copy.
-->

# Survive and Conquer

*Note*

This blueprint is a work in progress and does not cover everything yet.

## Technology

The game runs in a web browser. Three.js is used for rendering and Blockbench for the models. The rest of this section is the recommended technology for everything else.

### Language

- **TypeScript** for both the game and the server. TypeScript is JavaScript with type checking added; it turns into plain JavaScript, so it works with Three.js and in every browser. Using one language on both sides lets the game rules be written once and shared.
- **Vite** as the development and build tool for the browser game.

### Multiplayer model: deterministic lockstep

Recommended: **deterministic lockstep**, the method traditionally used by real-time strategy games with large numbers of units. Every player's computer runs the same simulation of the game, and the only thing sent over the network is the players' orders ("these 12 units attack-move here"). Unit positions and health are never sent.

Why it fits this game:

- Hundreds or thousands of units and monsters cost almost nothing to send, because only orders are sent.
- The design already pauses the game when a player disconnects, which is exactly what lockstep needs to do anyway.
- The world is generated from a seed, so every player's computer can generate the same world without sending it.
- The server stays small and cheap, which matters for games that run for many hours across many sessions.

What it requires (the main technical risk, to plan for from the start):

- The game simulation must give exactly the same result on every computer. Anything that affects the game uses whole-number (fixed-point) maths and a seeded random number generator, and avoids the browser's built-in sine, cosine and similar functions, which can give slightly different answers in different browsers. Lookup tables replace them.
- The simulation runs in fixed steps (20 per second), separate from drawing. Three.js draws smoothly between steps.
- The simulation runs in a background thread (a Web Worker) so drawing stays smooth.
- Every few seconds each computer sends a short checksum of its game state. If they ever differ (a "desync"), the game reloads everyone from the host's state.

Alternative considered: a server that runs the game and sends the state of every unit to the players. It is easier to get right, but sending the state of thousands of units is heavy, and the server would have to run every game for its whole length. Not recommended for this game.

### Server

- **Node.js** (running TypeScript). The server does not run the game. It handles accounts and lobbies, passes orders between players each step, handles reconnecting players, and can store multiplayer saves.
- **WebSockets** for the connection between browsers and the server: simple and supported everywhere.
- No third-party lobby framework: lobbies, invites and reconnecting are a small part of the relay server (see "Technical decisions").

### Accounts and saved data

- Accounts, usernames and saved games are stored on the server in a database. Recommended: **PostgreSQL**.
- Passwords are never stored as they are typed; only a secure hash is kept (for example with Argon2 or bcrypt). All traffic uses HTTPS and secure WebSockets.
- An email-sending service is needed for password resets. Reset links expire after a short time and work only once.
- A save stores the world seed, the changes to the world, and the state of every player, unit and building, rather than the whole map.
- Saves are stored on the server under the player's account. A multiplayer save is stored under the host's account.
- Guests have no account, so their games are never saved unless they create an account (see "Accounts and guests").

### World generation and terrain

- **Generation is pure:** the seed plus a cell's and a chunk's position always give the same land, on every computer and in any order. All the noise used to shape the land is whole-number noise made by hashing, with no browser maths functions.
- **Growing cells (suggested):** because cells get bigger with distance, they cannot be a uniform grid. Instead, cells are laid out in rings around the start, and each ring's cell size is set by its ring number. Every cell can still be worked out from the seed and its own ring and position alone.
- The world is generated in chunks of 64 x 64 columns (28.8 m squares). A chunk looks up which cells it sits in and builds its land from their descriptions; cells are only descriptions until a chunk needs them.
- Chunks are requested a ring ahead of the explored edge, so exploring never stalls. Generation work is spread across simulation steps and runs in the simulation's background thread.
- Terrain changes (digging, filling, building the land up) are simulation events with a step number, applied in the same order on every computer. The desync checksum covers edited chunks.
- Saves hold the seed, the changes in each chunk (which column layers changed), and the water in chunks where water has moved.
- Monster pathfinding uses a coarse navigation map (tiles about 2 m across) with costs for each kind of monster. Only changed tiles are rebuilt when the land changes.
- Turning the column data into drawable cuboids happens on the drawing side and is not part of the simulation.

### Performance notes

- The world is generated and stored in chunks, created as players explore.
- Large groups of identical models (units, trees, rocks) are drawn with Three.js instancing so thousands of them stay fast.
- Large groups move using shared "flow field" pathfinding rather than each unit finding its own path.
- Terrain is stored as columns on a 45 cm grid: 4,096 columns in a 28.8 m chunk instead of about 65,500 at 11 cm. Only faces that touch air are drawn, and touching faces of the same material are merged (see "Terrain").
- Digging, filling, water flow and the walkable map are part of the game simulation, so they follow the same whole-number rules as everything else and give the same result on every computer. Only the area around a change is recalculated.

### Technical decisions

Decided (Jade accepted these on 2026-10-02). JavaScript (as TypeScript) and Three.js are Jade's own choices; the rest are the picks Jade accepted. Each decision names the problem, the choice and the main reasons.

#### 1. Stack and tooling

**Question:** which language, build tool, server runtime and packages, and what to leave out?

**Decision:** TypeScript 5 in strict mode on both sides, Vite for the client, Node.js 22 LTS for the server, pnpm workspaces, three.js pinned to one release, ws on the server and the browser's own WebSocket, Vitest for tests, ESLint with typescript-eslint, and a hand-written binary codec over typed arrays for messages and saves.

**Why:** one language lets the simulation be written once and shared. Vitest reuses the Vite config. ws is a small library that does exactly what a relay needs. A hand-written codec is deterministic, compact and versionable, which JSON and generic serialisers are not at the size of a 100-hour save.

**Rules out:** Colyseus (its value is server-run state sync, which lockstep does not use; its lobby and reconnect features are a few hundred lines here); any engine on top of three.js; React or another framework for the HUD (a fixed set of panels updated every frame is faster and smaller as plain DOM and CSS); SharedArrayBuffer (needs cross-origin isolation headers and is not needed).

#### 2. Simulation determinism for lockstep

**Question:** what maths, step rate, random numbers and ordering make every computer compute the same game, and how is a mismatch caught?

**Decision:** integers held in ordinary JS numbers (exact below 2^53), with one world unit (wu) of 0.125 mm; 20 steps per second; xoshiro128 **streams seeded from the world seed; a sim that never touches floats, Math.random, Math.sin and friends, Date or timers; the sim in a Web Worker; the renderer interpolating between the last two steps; a 32-bit state hash every 20 steps compared through the relay.**

**Why 0.125 mm:** it is the largest unit that makes every size in the game a whole number: 1 model unit (2.8125 cm) = 225 wu, 1 terrain unit (11.25 cm) = 900 wu, 1 column (45 cm) = 3,600 wu, 1 m = 8,000 wu. A 32-bit value then reaches 268 km from the start, far beyond any 100-hour run. Heights use the same unit on the vertical axis. Products of two distances stay below 2^53 for anything under 10 km, and all range checks are local anyway.

**Why 20 steps:** a warrior at 3 m/s moves 15 cm a step and a galloping horse at 8 m/s moves 40 cm, both under one 45 cm column, so nothing tunnels through a column between steps; at 10 steps the horse would cross almost two. Attack times of 1.2 to 1.5 s are whole steps (24 to 30). A 3-minute day is 3,600 steps, a full cycle 8,800, and a 100-hour run 7.2 million, which fits a 32-bit step counter. 30 or more steps would eat the CPU budget on the minimum machine. Fast projectiles (an arrow at 40 m/s moves 2 m a step) use a swept segment test, not a point test.

**Rules:** division only through an integer helper (floor), isqrt by Newton iteration, angles as 16-bit turn fractions with sin and cos from a 4,096-entry table scaled by 2^16, no Math.* except imul, floor, trunc, min, max and abs. One RNG stream per subsystem (spawns, combat, trade, weather) so an extra random call in one does not shift the others; world generation uses a stateless 32-bit hash of seed and coordinates, never a stream. Entities live in struct-of-arrays typed arrays iterated by index; any sort uses a comparator with the entity id as tie-break (Array sort is stable). Spells and mana (checklist) follow the same rules: cooldowns in steps, mana in integer tenths, beams as per-step segment tests, areas as squared-distance tests.

**Worker and render:** the sim worker owns the state and posts a per-step delta (positions, headings, animation clip and start step, health) in a transferable ArrayBuffer; the main thread keeps the last two deltas and lerps positions by the fraction of the 50 ms step that has passed, so three.js draws smoothly. Desync: hash is FNV-1a over the canonical serialised state, sent in the input frame every 20 steps; the relay compares all players' hashes for the same step and names the minority; recovery is the doc's rule, reload everyone from the host's snapshot (the same bytes as a save). ESLint no-restricted-globals and no-restricted-properties enforce the bans in the sim package.

#### 3. Networking

**Question:** how do orders travel, what happens when a player is late or gone, and how does someone rejoin?

**Decision:** lockstep over a WebSocket relay; every client sends one small frame per step holding its orders for step N + D, with D = 4 steps (200 ms) by default and raised automatically to the measured round trip plus 2 steps (at most 12); the relay forwards each frame to the others at once and keeps the last 2 minutes of frames; no host migration for state; no WebRTC.

**Late or gone:** a client runs step N only when it holds every player's frame for N, so a late frame stalls everyone (the doc's pause); after 1 s the HUD shows "Waiting for X". After 3 s without a heartbeat the relay marks the player dropped and tells the room; after 30 s the host gets the doc's choice, save and quit or carry on without them (their assets are shared out as if eliminated).

**Rejoin:** because the match pauses while someone is missing, a returning player usually missed only the frames since their last acknowledged step, which the relay replays from its log. If the gap is longer (the carry-on case, or loading a save), a present peer serialises a snapshot at step S, the relay stores it, and the rejoiner loads it and replays frames after S. Loading a multiplayer save is the same path with the save as the snapshot.

**Host:** every peer holds the full state, so there is nothing to migrate. The host is a lobby role (owner of the save slot, maker of pause choices). If the host drops, the role passes to the next player in join order so decisions are never stuck; the save slot stays under the original host's account.

**Constraints:** browsers cannot listen for connections, so peer to peer would need WebRTC with STUN and TURN servers; a relay on a public address over WSS avoids NAT problems entirely and costs about the same as a TURN server would. Traffic is 20 frames per second per player of under 100 bytes, so an 8-player match is about 16 KB/s through the relay.

#### 4. Save format and where saves live

**Question:** save a full state snapshot or the seed plus every order ever given, in what format, how big, where?

**Decision:** a full simulation snapshot in a versioned binary container (little-endian sections with a 4-byte tag, length and version), compressed with the browser's CompressionStream (gzip, no library), stored on the server under the account with a local IndexedDB copy of the last autosave as a fallback, and an export and import button for a .sac file.

**Why not seed plus input log:** loading would mean replaying up to 7.2 million steps (hours on a laptop), and any rule change in a patch would alter the replay and break every old save. A snapshot loads in seconds. The input log is kept only as a rolling desync buffer (decision 11).

**Sections:** header (format version, game version, seed, step, night, players), entities as struct-of-arrays, edited columns per chunk, water per changed column, tree and rock diffs, explored and minimap tiles, factions and villages, research and queues, RNG streams, message log tail. A format version in the header plus one migration function per version; the number tables are not in the save, so balance patches apply to old saves. Saves more than 10 versions old are refused with a message.

**Autosave at dawn:** the sim worker copies the state at the dawn step and compresses it asynchronously so play is not stalled; the bytes are identical on every peer, so in multiplayer the host client uploads and the others keep a local copy. Three rolling autosaves plus manual saves per match; 500 MB per account.

**Size for a 100-hour, 8-player match (a 3 km explored radius, 20,000 entities, 200,000 edited columns):**

| **Part** | **Raw** | **Compressed** |
|---|---|---|
| Entities, 20,000 records at 64 B | 1.3 MB | 0.4 MB |
| Edited columns, 200,000 at 20 B | 4 MB | 1 MB |
| Water, 300,000 changed columns at 4 B | 1.2 MB | 0.3 MB |
| Tree and rock diffs, 200,000 at 8 B | 1.6 MB | 0.4 MB |
| Explored and minimap tiles at 1.8 m over 34,000 chunks | 8 MB | 1 MB |
| Factions, research, queues, RNG, messages | 0.5 MB | 0.2 MB |
| Total | about 17 MB | about 3 to 4 MB |

**Targets:** under 10 MB compressed for a 100-hour match, a hard limit of 50 MB per slot, load under 5 s.

#### 5. World and terrain representation

**Question:** how are columns, chunks, streaming, generation and the generated trees and rocks stored?

**Decision:** chunks of 64 x 64 columns (28.8 m square, 4,096 columns), so that column to chunk mapping is a bit shift; per chunk a flat layer pool (bottom and top as signed 16-bit terrain units, material as a byte, 6 bytes per layer with padding) indexed by a 16-bit offset and a layer count per column; a 16-bit water surface per column; a per-chunk edit log while loaded, folded into a column diff when the chunk unloads or the game saves; coarse pathing tiles of 4 x 4 columns (1.8 m, the doc's "about 2 m"), 256 per chunk.

**Memory:** about 75 KB of columns, 8 KB of water and 5 KB of props per chunk, call it 90 KB. The Deadlands begin about 2.9 km out, and a disc of that radius is about 34,000 chunks, or 3 GB if all were loaded, so they are not. Loaded set: chunks within 60 m of any player unit or building, plus one ring ahead, plus chunks the camera looks at and chunks with live mobs or active fields; budget 2,048 chunks (about 180 MB in the sim worker), evicted least recently used. An untouched chunk is dropped entirely and regenerated from the seed on demand; an edited chunk keeps its diff. Cell descriptions (polygon, type, edges, gaps, village) are about 1 KB each and are cached for the whole match. Explored land is remembered at 1.8 m tiles (a fog bit and a minimap colour byte, about 8 MB for the 3 km radius), not as columns.

**Generation:** pure from seed, cell and chunk coordinates, budgeted at 3 ms per step in the sim worker; a warrior takes 200 steps to cross a chunk, so one chunk per step is ample. World edge: 100 km from the start, a nine-hour run and in practice never reached; it keeps every coordinate well inside 32 bits and answers the checklist's explored-area question.

**Trees and rocks:** generated per chunk from the seed into a prop table (species or rock kind, column, age at generation, variant hash); they are game objects but not global entities until touched; a felled, planted, damaged or grown tree becomes a diff record in its chunk. Each species is a small set of parts (trunk segments, canopy tiers, stump), so the renderer draws them with one InstancedMesh per part per species (doc: built from parts so they can be instanced). Decoration (grass, pebbles, flowers) is render-side only and never stored.

#### 6. Pathfinding

**Question:** build the doc's flow fields plus 45 cm local steering, or use a library?

**Decision:** build it in the sim package. Flow fields on the 1.8 m coarse tiles for every night-mob target and for player groups of 8 or more, A* on the same tiles for smaller groups and single units, and local steering on the 45 cm column grid with a 5 x 5 column look-ahead that applies the doc's step, jump and drop rules and keeps units apart.

**Why:** no library fits a column grid with per-class costs, break-through costs, edits every step and integer determinism; navmesh and float-based grid libraries would have to be wrapped and audited anyway. The doc already specifies the algorithm.

**Costs:** each coarse tile stores a cost per class, recomputed from its 16 columns in the step an edit lands. Open ground is 12 (steps to cross at 3 m/s); a 3 to 4 terrain unit rise 18; wading 24; marsh 18; a rise of 5 or more, a wall, a cliff or deep water is blocked for walkers and wheeled units; climbers pass walls and cliffs at 12 plus height divided by their climb speed and cannot attack while on them; flyers have no field and fly straight at an altitude above the land; swimmers cross deep water at 24; wheeled units are blocked above 1 terrain unit. Breakers get a second value per tile, the break cost: a player wall or gate costs its health divided by the breaker's damage against walls, in steps; natural terrain costs the table 10 break points per cubic metre in the same way, multiplied by 3; the field takes the smaller of walking around and breaking through, barricades first.

**Rebuild:** an edit marks its tile dirty and the tile cost is redone in the same step; fields covering a dirty tile are marked stale and recomputed within 10 steps under a 3 ms per step budget, oldest first; a stale field is still followed meanwhile. A field is one byte of direction per tile over a region of up to 200 m radius (about 50 KB); a hundred live fields on a busy night are about 5 MB.

#### 7. Rendering

**Question:** how are thousands of units and a column world drawn fast in three.js?

**Decision:** one InstancedMesh per model type, with per-instance bone matrices in a DataTexture and each vertex carrying a bone index (rigid cubes per bone, no skinning weights, which matches the Blockbench rigs); props and trees as InstancedMesh per part; one greedy-meshed mesh per terrain chunk built in a separate mesh worker from a copy of the column data; two levels of detail; one directional sun or moon plus a hemisphere light and linear fog driven by lighting.json; shadows as one 2,048 cascade on medium and high and off on low; a draw-call budget of 300 at medium.

**Greedy meshing:** for each chunk and each of the six face directions, build masks per height slice and merge rectangles of the same material; side faces come from interval differences between neighbouring columns, tops and bottoms from interval ends. Only faces touching air are built. A chunk re-meshes in under 2 ms when edited, and only edited chunks are re-meshed.

**LOD:** full detail within 60 m of the camera focus; beyond that decoration and small props are dropped and tree canopies become one cube. Because the farthest zoom is capped, the visible area is bounded, so LOD mainly serves the far edge and the minimap.

**Lighting:** colours and fog from the artist's lighting sheet for day, dusk, night, dawn, blood night and fog night, interpolated over the 40 s of dusk and dawn; at night the 16 point lights nearest the camera are real three.js lights and every other torch is an emissive sprite plus a baked glow on the ground; fog of war is an R8 texture at 1.8 m tiles sampled by the terrain and prop shaders (black unexplored, grey explored and unseen). Pixel textures use nearest filtering. Unit animation: the main thread advances clips at render rate from the sim's (clip, start step) and writes bone matrices for visible instances only.

#### 8. Asset pipeline

**Question:** how do Blockbench models, textures and icons reach the game?

**Decision:** a build-time converter in packages/tools that reads each .bbmodel (Generic Model, cubes with inflate, groups as bones, keyframed clips) plus a manifest line per model, validates the wishlist rules (bone and slot_* names, cube budget, facing -Z, texture sizes) and writes a .glb with one mesh per model, a bone index per vertex, the clips as glTF animations, and the key keyframes as a JSON table of key times in steps for the sim. Scale: 1 model unit = 2.8125 cm, so the converter multiplies by 0.028125 to get metres, and the sim's heading 0 points along -Z so an unrotated model faces the way the sim says. The manifest carries per-model overrides, which is how the 26 existing creatures at 5 cm per unit come in without remodelling.

**Textures:** every model's embedded PNG goes into a 2D texture array per category (units and items at 256 x 256 layers, buildings at 512, terrain in its own array), with a layer index per instance, so variants (metal tiers, young animals, blood-night mobs) are a layer swap and nothing bleeds at the edges. Team colour: pixels matching the placeholder blue (52, 96, 178) are written into a one-channel mask array at build time and the shader recolours them with the player's colour, keeping the pixel's brightness.

Clip names are the contract between sim and renderer: idle, walk, run, attack_*, injured, death, climb, burn and the extras listed in the wishlist; the sim only ever says "clip X from step S". UI icons (32 x 32, whole-number scaling) are packed into one atlas with a JSON map and drawn by the DOM HUD as CSS sprites with image-rendering: pixelated.

**Rules out:** loading .bbmodel at runtime (an editor format that would have to be parsed, validated and fixed in the browser on every load) and per-model draw calls per bone.

#### 9. Hosting and accounts

**Question:** where do the relay and save server run, how do accounts and invites work, what does it cost, and how would someone self-host?

**Decision:** one Node process serving the API, the relay and the lobby, PostgreSQL for accounts, matches and save metadata, S3-compatible object storage for save blobs, the static client on a CDN host, all behind Caddy for automatic HTTPS, shipped as a docker compose file. Accounts are email, password and username handled in our own code: Argon2id hashes via @node-rs/argon2, an opaque session token in an httpOnly cookie that is also presented once when the WebSocket opens, password reset by a one-time emailed link that expires in 30 minutes, sent through a transactional email API. Invites: a 6-character code from an unambiguous alphabet and a link /join/<code> that the API resolves to the relay room.

**Cost:** a small VPS (2 cores, 4 GB) carries hundreds of concurrent players, since the relay only forwards small frames; with object storage and email at low volume the order of magnitude is USD 10 to 30 a month. Saves dominate storage at about 4 MB each.

**Self-hosting:** the same compose file with a disk save store flag instead of object storage, pointed at a domain; the client reads the API address from a config file so one build serves both.

**Rules out:** social or OAuth login (not needed for a game, adds provider setup), hosted auth services (cost and lock-in), save blobs in database rows (10 MB rows bloat backups), and running game logic on the server.

#### 10. Performance targets

**Question:** what must run, where, and how fast?

**Decision:**

| **Target** | **Minimum machine (low setting)** | **Reference machine (medium setting)** |
|---|---|---|
| Hardware | 2018 laptop: 4 cores, 8 GB, Intel UHD 620 class | 2020 desktop: 6 cores, 16 GB, GTX 1060 class or Apple M1 |
| Frames per second | 30 at 1080p with 400 animated units on screen | 60 at 1080p with 800 animated units on screen |
| Simulation | 3,000 live mobile units in 25 ms per step | 6,000 live mobile units in 25 ms per step |
| Draw calls per frame | 200 | 300 |
| Tab memory | under 1 GB | under 1.5 GB |

**Why:** night 110 for 8 players spends a budget of about 6,600 threat points (table 8 and Night mobs), which is a few thousand mobs over the night, spawning in waves and dying; 6,000 live units covers a blood night with room to spare. Half of the 50 ms step is kept for pathing, generation and serialisation.

**Browsers:** the latest two versions of Chrome, Edge, Firefox and Safari on desktop, which means Chrome and Edge 120 or later, Firefox 120 or later, Safari 17 or later as a floor. Needed features: WebGL2, module Web Workers, CompressionStream, Pointer Lock, the Fullscreen API. Keyboard Lock exists only in Chromium, which is why the doc lets the Ctrl layout work only in Chrome and Edge full screen.

**F11:** a page cannot press F11 itself, so the reminder stays text and the main menu also gets a "Full screen" button that calls requestFullscreen, which has the same effect. On a Mac the key is Ctrl + Cmd + F and the reminder says so there.

#### 11. Testing and tooling

**Question:** how is determinism proven, a desync found, balance checked and a seed inspected?

**Decision:** Vitest unit tests on the sim; a headless runner (Node, no DOM) that takes a seed and a scripted order list, runs N steps and prints the hash every 20 steps; a CI job that runs the same script in Node, headless Chromium and headless Firefox through Playwright and fails on any hash difference; a desync tool; a balance harness; a map viewer.

**Desync tool:** every client keeps a ring buffer of the last 2 minutes of input frames plus the last agreeing snapshot; on a desync both sides upload them, and the tool replays them offline, reports the first diverging step and diffs the serialised state to the first differing field.

**Balance harness:** the headless runner with fixture towns (night 0 camp, night 10 palisade town, night 25 stone fort, night 45 fortress with muskets) and a scripted defence; the night spawner spends the table 8 budget for a given night and player count, and the harness writes one CSV row per run: losses, time to first breach, mobs alive at dawn, resources spent. Run after every table change.

**Map viewer:** a Vite dev page that runs the sim package's generation in the browser and draws a seed's cells, barrier edges, gaps, bands, villages and chunk heights on a 2D canvas, with a click to inspect any chunk's columns. Same code as the game, so what it shows is what players get.

#### 12. Project structure

**Question:** how is the code split so the shared simulation stays pure?

**Decision:** a pnpm monorepo with packages/sim (the rules, world generation, pathing, water, factions, save codec; zero dependencies; tsconfig lib set to es2022 only, no DOM), packages/protocol (frame, lobby and API message codecs), packages/client (Vite app: worker host, renderer, HUD, input, camera), packages/server (API, relay, database, save store), packages/tools (model converter, headless runner, desync tool, balance harness, map viewer), packages/assets (source models, textures, lighting sheet, icons). Shared: sim, protocol and the number tables, which live in sim as data.

**The rule:** sim never imports from client, server or three.js. It is enforced three ways: the sim tsconfig has no DOM lib, so window, document or performance fail to compile; project references stop a reverse import; an ESLint no-restricted-imports rule names the forbidden packages. The sim talks to the outside only through its step function (inputs in, state delta and events out).

#### 13. Faction AI

**Question:** how do the neutral peoples, goblin villages and hostile tribes decide what to do?

**Decision:** a deterministic two-level utility system inside the sim, with no learning and no scripting language. Level one is the faction: each village, colony, kingdom, goblin village and tribe band has a small state machine (settled, trading, warned, at war, migrating, gone) whose transitions are the doc's triggers (kill counts, seen tree cutting, 50% losses, reparations, surrender), plus a few scored goals it re-evaluates once per in-game minute (1,200 steps), staggered so no two factions think on the same step. Level two is the unit: behaviours as short lists of scored actions (gather, patrol, trade, caravan, raid a light, chase with the 20 s give-up, go home at dusk, flee) run every 10 steps, using the shared flow fields and the same path costs as player units. Every choice draws from the faction's own seeded random stream, so lockstep stays deterministic and a replay reproduces it. Night mobs keep their simpler target-and-path rules from the roster; the boss gets a scripted phase list.

**Why:** it covers everything the doc asks of the peoples without a second AI framework, costs a bounded slice of each step, and is easy to tune by changing scores.

**Rules out:** behaviour-tree libraries with their own timers, any AI that reads the renderer, and per-step faction thinking.

#### Start here: the first week of programming

- 1. Create the monorepo with the six packages, project references, the sim ESLint bans and Vitest, and commit a CI job that runs the tests.
- 2. Write the fixed-point helpers (wu constants, floor division, isqrt, the sin and cos table, 16-bit angles) with known-answer tests.
- 3. Write xoshiro128 **streams and the 32-bit coordinate hash with known-answer tests, then the first noise function on top of the hash.**
- 4. Build the chunk store: 64 x 64 columns, the layer pool, the edit API, the edit log and its fold into a diff; test that generate plus diff equals the live chunk.
- 5. Stand up the sim worker at 20 steps per second with a step counter, an input queue and the state hash; render one flat chunk in three.js under the doc's camera (fixed angle, pan, zoom limits).
- 6. Write the greedy mesher in a mesh worker, draw a 3 x 3 chunk area with a hill and a cave, and check draw calls and re-mesh time after an edit.
- 7. Run the model converter on worker_base.bbmodel, draw 500 instanced workers playing walk from the bone-matrix texture, and measure frames per second on the minimum machine.
- 8. Implement the move order: coarse tiles, A* and the 45 cm steering with the step and jump rules; 100 workers walking around a boulder and up a stair-stepped slope.
- 9. Write the relay (rooms, join code, one frame per step, hash compare) and run two browser tabs in lockstep for ten minutes with no desync.
- 10. Add the headless runner and the Node versus Chromium versus Firefox hash comparison to CI, so determinism is checked from the first week on.

### Build order

Decided (Jade accepted the coordinator's picks on 2026-10-02). The order in which the first playable is programmed, in eleven milestones, M0 to M10.

**Rule (Jade):** the first playable iteration contains all content in the blueprint; nothing is cut or deferred. This document only sequences that work, it never trims it, and every system in the doc appears in exactly one milestone below.

A milestone is a runnable build: the game starts, the deterministic simulation runs, and a tester can confirm the milestone's one-line "you can now" check by playing it. Later milestones add systems and never remove earlier ones.

Balance numbers come from the doc's tables 1 to 19 as they stand, including values marked (s). The data module built in M0 holds them; they are tuned only after a milestone has been played, in M10's balance pass or when a milestone check fails on numbers alone.

Each milestone depends on the ones before it unless its "depends on" line says otherwise. Where a doc section holds a piece that needs a later system, that piece is named in the later milestone, and the closing table shows where every piece lands.

#### M0: Project skeleton, deterministic simulation, desync hash, headless runner

**You can now:** run the headless simulation for 10,000 steps from seed 1 in Node, Chrome and Firefox and get three identical state hashes; a scripted order list replays to the same hash.

**Builds:**

- Technology, Language: a TypeScript workspace (Vite client, Node server package, a shared sim package so the rules are written once).
- Multiplayer model, deterministic lockstep (simulation side): fixed-point maths, a seeded RNG, lookup tables instead of Math.sin and friends, a fixed step of 20 per second in a Web Worker, an order queue per step (one local player for now), a state checksum every few seconds and a desync hook. The relay transport is M9.
- Reading the number tables: tables 1 to 19 as typed data with their (s) flags, plus the header rules as a rules library (damage x (1 - armour) capped at 75%, shield block, fire burn, XP sharing, rank bonus, the nutrition unit, vp).
- Technical decisions: the settled list recorded in the repo (stack, step rate, chunk budget and cell cache rules, the Deadlands ring rule, save format sketch, hosting, performance targets to be measured in M10), laid out as technical-decisions.md picks: a pnpm monorepo of sim, protocol, client, server, tools and assets, with the sim package banned from importing the client, server or Three.js.
- Headless runner: the sim without Three.js, driven by a seed and an order script, printing the hash; a CI job that runs the same script in Node, headless Chromium and headless Firefox and fails on any difference; the desync tool's ring buffer and offline replay; the map viewer and the balance harness as empty tools that later milestones fill with fixture towns.

**Depends on:** nothing.

**Risks:** a float leaking into the sim through Three.js or a library; Worker message overhead at 20 steps a second; fixed-point range for a world measured in integer world units of 0.125 mm covering a 100 km world edge.

#### M1: World generation, terrain, water, camera, controls shell, HUD shell and minimap

**You can now:** type a seed, start a game and pan and zoom across a generated world with cells, barrier edges, gaps, rivers with fords, a start basin and a pocket per player; the minimap fills in behind a debug reveal; two machines with the same seed show the same land and the same hash.

**Builds:**

- Technology, World generation and terrain: pure generation from the seed plus cell and chunk position, rings of growing cells, 28.8 m chunks of 64 columns requested a ring ahead, generation spread across steps in the sim Worker, terrain edits as stepped sim events.
- The world: cells, the seven barrier edge types and their 0 to 2 gaps, the no natural fortress rule, cell looks, the five depth bands with their trees and ores (including sulphur at the rare Barrens hot springs), the start basin and pockets (Table 9), fog of war, regrowth of trees and hazel, grassland thinning. Table 5 node placement, yields, gatherer limits and tool gates (its prospect and mineshaft rows are used in M4).
- Terrain, What the land is made of: 45 cm columns of layers in 11 cm units, materials, face merging and chunk meshing on the drawing side, far chunks at less detail, scenery batches, chunk deltas (the save format's foundation, written out in M9).
- Generated rocks and trees: seeded rock, ore, tree and hazel generators with growth stages and instanced parts, one reference tree per species from the wishlist. Hit feedback and hit particles are M3.
- Water: water as a column layer, flow only near changed land, river sources with a fixed inflow, ponds, fords.
- Controls: the six rules; Screen layout and mouse zones (every HUD panel as a solid rectangle, hotkeys on buttons and tooltips); Selecting units and buildings (click versus 4 px drag, the clamped box, priority rules, double click and Ctrl, exercised on resource nodes until M2); Camera (edge zones, the 0.1 s delay, arrows, middle drag, wheel zoom to the cursor, limits, settings sliders); Browser requirements (key blocking, no context menu, pointer lock, Mac Cmd, leave page confirm); Playing with the mouse only as the standing rule for every later control; minimap drawing, jump and drag.
- Visuals: the Blockbench model loader, the cube art pipeline, instancing; building looks per level are hooked up as each building arrives.

**Depends on:** M0.

**Risks:** meshing and water cost in a browser; cells and barriers looking natural; the growing-ring layout at Deadlands scale.

#### M2: Workers, gathering, carrying, building, farms, the main base levels and the day

**You can now:** from the starting camp (Big House level 1, four workers with hardwood tools, the Table 9 stock) send workers to chop, quarry and build; a crop field with assigned farmers puts wheat into the pool; the Big House upgrades to Longhall; the clock runs day, dusk, night and dawn; torches claim land; Idle Gatherer finds the worker whose trees ran out.

**Builds:**

- Premise and Details: the starting setup and the 3 min, 40 s, 3 min, 40 s cycle (Day and night: the periods, the clock, the dusk and dawn alerts; sunburn is M3, blood and fog nights M5). The starting warrior joins in M3.
- Units, Workers: every job (gathering, building and repairing, farming by right click assignment, crafting inside production buildings, hauling, sheltering with the 10% damage rule, the flee rule); Table 1 worker rows; training at the Big House and farms (Table 7 worker rows).
- Moving over the land: step, clamber and blocked rises, drops, headroom, wading, the swim rule by armour, the walkable map rebuilt only where land changed; unit pathfinding on the 45 cm grid with flow fields for groups.
- Unit orders (move, follow, stop, the smart right click rows for ground, friends, nodes, unfinished buildings, drop-offs and the minimap), group movement, order markers; Queuing orders with Shift, production queues, rally routes; Command card and hotkeys (the 15 slot card, letter keys, the grid build menus B and V, greyed buttons with reasons, rebinding); Control groups and camera hotkeys (the group key, ten groups, group tabs, F5 to F8, Backspace, Space, F1 to F3, L); the selection panel, subgroups and Tab from Selecting units and buildings.
- Building placement (ghost, tiles, cost on arrival, Shift chains, dragged lines, unfinished buildings as real objects, the 75% refund). Gathering resources (the loop, loads of 25 lb from Table 12, drop-offs, node crowding, run-out search, Return Cargo, rally on a node, the idle alert). Semi-automation: Everyone Home and double-tap Repair (fishing and hunting are M4).
- Resources: the shared pool and the expandable resource bar; the 20 main resources and the Additional resources list as data, each becoming obtainable with its source.
- Buildings and Table 4 as data, with these live now: Main base levels 1 to 10 (fixed footprint, decorative fill, upgrade from the panel, supply, shelter, parapets from level 3, marble from 5; levels 4 and up become reachable as M4 makes their materials), farms of four types and three tiers with farmhouses and the Table 6 farm yield rows, pen and barn, lumber mill with waterwheel, storehouse, torch post and wall torch. Visuals: each level's look.
- Light and torches and Table 18: every light, fuel and refuelling, claimed land (5 m, 10 m, enclosed regions), the outlying torch count (its goblin consequence is M5).

**Depends on:** M1.

**Risks:** pathfinding for hundreds of units; the HUD click rules and the clamped box; order queue edge cases (blocked spots, dead targets).

#### M3: Warriors, combat, equipment, defences, digging, night spawning and nights 0 to 20

**You can now:** survive night 0 with the starting warrior, four workers and a softwood fence; skeleton archers shoot over it on night 5 and a bomber breaks a softwood column on night 10; a dug trench turns zombies aside; Equip Best hands out flint spears; losing every worker with no main base or farm left ends the game with the night count as the score.

**Builds:**

- Units, Warriors (melee and backup weapon switching, ranged and melee switching with a lock, carcass nodes; hunting orders are M4); Experience and training (combat XP, five ranks; training at buildings is M4); Table 1 warrior rows.
- Combat: Melee (stab versus 90 degree arc), One-handed weapons and shields, Polearms (reach, minimum range, the three fallbacks), Fighting flying enemies, Ranged attacks, How ranged attacks hit (swept projectiles, hit boxes, lead aiming with spread, first thing hit, friendly pass-through, the clear shot search), Walls, trees and ranged attacks, Bows and crossbows (bows, arrows, quivers, tip tiers; crossbows are M4). Unit orders: Attack and attack-move, Hold, Patrol, the leash, target choice, the targeting cursor.
- Equipment: Making equipment (K crafting at the Big House: the Items rows for hardwood and flint tools, club, spears, flint axe, javelin, sling, bow and flint arrows, fire arrows, wicker and wood shields, boots, hand torch), Equipping units (Equip Best, pick-up at a main base, rank order, Auto-Equip F4), Choosing by hand (I panel), Seeing equipment, Unit models (the shared body, warrior skin, injured and death animations; other races' models arrive with their milestones), Refurbishing (F). Table 2c hardwood and flint rows, 2d tiers 1 and 2, 2e sling, javelin, bow, arrows, quiver, fire arrows; Table 3 boots, wicker and wood shields.
- Table 4 Defences: walls, gates and towers in three materials, garrison with E and U, tower slots and parapets; Earthworks (ramps, banks, fill) with the dragged preview.
- Digging and prospecting (Dig: area, depth, preview, tunnels), Digging and building up the land (Jade's dig rate, bites, the 3 m limit, carving yields, Earth), Table 10 dig speeds and break costs, Keeping digging fair (its unlit tunnel as cave rule is applied by M5's lairs), water reacting to digs through M1's water. Generated rocks and trees: hit feedback and hit particles.
- Threats and Monsters and terrain: the dark edge, claimed land exclusion, the coarse 2 m navigation map with per-kind costs and flow fields, break cost versus walking with the x3 natural terrain rule. Table 8 rows: claimed land, dark edge, light and unit weights, first night, split and picking, first appearance, the base budget 12 + 3n + 0.04n^2 (the other rows are M5). Day and night: sunburn, fleeing and sun-proof behaviour at dawn.
- Night mobs, nights 0 to 20 from roster 5.2 to 5.6 (zombie, cave bat, giant rat, giant spider, slime, skeleton archer, bloated corpse, skeleton bomber, the goblin warband with cutters, slingers and a chief, grave hound) with Jade's rules: climbers, swooping flyers, explode on death, no monster friendly fire, 0.5% a night growth, small valuables and spider silk drops.
- Winning, losing and score: nights survived, elimination, game over.

**Depends on:** M2.

**Risks:** the projectile sweep with thousands of mobs; flow field memory per target and monster kind; polearm fallback oscillation; terrain edits and water settling inside the step budget.

#### M4: Economy to steel, food and supply, animals, research, mining and carrying

**You can now:** research Flint tools at a Scholar's Lodge, smelt bronze at a Casting Hearth, climb through Bloomery and Ironworks to a Steelworks fed with vein iron hauled by ox cart from a tier 2 mineshaft; stew from a Great Kitchen feeds the town; a wild horse is tamed at the Stables; warriors hunt deer with N and bring the meat home; Rations starves workers but not troops.

**Builds:**

- Food, supply and health and Table 6: nutrition per food, even eating, Don't eat, upkeep for units and research facilities, starving and natural healing, Rations (F9), eating at a building, supply from main base levels and farms, the over-limit rule; the Food and medicine items.
- Progression tiers 1 to 7 (tier 8 is M8); Research (Scholar's Lodge, Scriptorium, Grand Academy, the rising facility cost, the cap of 10, research loading like training) with Table 2a Flint tools, Bronze, Deep Mining I to III, Halberds, Crossbows, Steel, High-quality steel, Steel crossbow (Hexcraft is M6; Siege engines, Gunpowder, Muskets and Cannons are M8).
- Forge levels and Table 2b smelting; Items: Materials, Tools (Table 2c forge rows, prospecting hammer, carts), Weapons and armour forge and tannery rows (Table 2d tiers 3 to 7, 2e crossbow, steel crossbow, bolts, tips, poison arrows; Table 3 metal armour, helmets and shields), Bows and crossbows (the crossbow part).
- Cooking tiers 1 to 5; Workshop tiers 1 to 4 and Trinkets (Tokens to Heirlooms, Moonleaf, Sunheart; siege engines are M8); Kiln, Tannery, Herbalist hut, Fishing dock, Barracks, Stables (taming, stalls, breeding; riding is M8); Mineshafts and prospecting with Prospect (T), tiers 1 to 3 and the Table 5 prospect and output rows.
- Animals, Wild herds, Game and other wild animals (hare, deer, boar, wolves, lynx, giant frog, crocodile, giant crab, badgers smashing outlying torches, roster 6.1), Bears (never tamed, the 60 cap), Young animals, Fish (three species, crowding, young), livestock farms with breeding and slaughter, grazing and the crop fallback, working animals eating from stock, monsters killing animals left out. Semi-automation: Hunt (N) and fishing dock stretch rotation; Warriors' hunting.
- Experience and training at buildings and Table 7 (worker, warrior, archery and crossbow rows; mage rows M6; riding, musket and cannon crew rows M8).
- Inventory and carrying weight and Table 12: the 100 lb and 25 lb limits, the slowdown curve, quivers and cases, hand cart, ox and horse carts, pack animals, mounted units unslowed. Additional resources: every one now obtainable from its source.

**Depends on:** M3.

**Risks:** the largest milestone by content; economy pacing against the Balance notes (checked in M10); animal and herd AI cost; many buildings whose per-level looks must exist.

#### M5: Lairs, rising difficulty, blood and fog nights, hostile tribes and goblin villages

**You can now:** by night 15 a barrow and a cave mouth sit at the frontier and send a fifth of the wave; clearing the barrow by day yields its hoard and 20 XP to the warriors; claiming 60% of the Fringe triggers a blood night at dusk with the warning; more outlying torches than the limit at dusk bring the goblin horde; a Deepwoods goblin village declares war after the fifth kill and marches on the nearest building 30 s after dawn.

**Builds:**

- Rising difficulty and the remaining Table 8 rows: budget factors (town size, provoked, player count), depth weighting and later-night draws per band, lair cadence and cap, outlying torches and the dusk horde, the blood night trigger, warning and double horn, the fog night. Day and night: blood nights and fog night.
- Lairs and Table 15: all eight types with destroyed versions, sleepers and guardians (giant centipede, myconid, and the ash golem and mana wraith from Deadlands creatures), clearing and hoards under Jade's wealth rule, the 10 day cooldown, minimap marks and rift glow, lair placement from Monsters and terrain and the Threats bullets, unlit tunnels as cave sites (Keeping digging fair), ruins as decoration and sites. Sleeper types from night 25 up are filled in by M8's roster.
- Hostile tribes and Table 16: gnoll, kobold and hobgoblin bands (roster 6.2), spawn odds and keep-away, the 20 per player cap, chase and give-up, dusk camps.
- Goblin villages and Table 17: frequency, huts, fire pit, totem, stake ring, goblins, archers and the goblin mage with Snuff, Stumble hex and Spark toss (the shared ability, mana and cooldown core that M6 extends), aggro, the war threshold and its warning, daily raids that put out lights, rebuilding, hexstone and other drops, breaking down huts; territorial creatures. Wolf riders and the wolf pen activate in M8 with mounts.

**Depends on:** M4 (drops, hexstone, buildings to raid) and M3.

**Risks:** budget factors stacking into unplayable nights before M10 tunes them; lair placement finding no legal cell; raid AI pathing through player defences.

#### M6: Mages, mana, spells, the Sanctum, Hexcraft, Warding and Counterspell

**You can now:** train a Novice Acolyte at a Magi Sanctum; Heal and Arcane bolt resolve inside the lockstep step with identical hashes on two machines; Hexcraft research adds Warding, and a Counterspell cancels a goblin mage's Snuff; a Grand Magician keeps up a bolt every 4 s.

**Builds:**

- Magic, Mage types and Mage ranks and mana: support and battle mages, six ranks, mana bars and refill, the 10 s combat pause, spell power by rank (Table 1 mage rows), training at the Sanctum and at main base 6+, mages on towers and parapets.
- Table 13 player spells: Heal, Quicken, Fortify, Rally, Arcane bolt, Beam, Fireball, Area blast, Warding, Counterspell, with the projectile and non-projectile rules from Combat; Hexcraft (Table 2a) researched at the Sanctum with hexstone.
- Magi Sanctum (Table 4), Table 7 mage rows (novices, ranks to Adept, rank wands of mana crystals), wands as the mage weapon, Unit models: the mage model. Technical decisions: spells and mana inside the fixed-point step.

**Depends on:** M5 (hexstone, the ability core) and M4 (mana crystal nodes, main base 4).

**Risks:** beams and area effects straddling steps; spell power stacking with Rally and Fortify against the armour cap.

#### M7: Neutral peoples, trade and barter, war and surrender, mercenaries, speech and the message panel

**You can now:** find a Halfling village and trade a Copper Token for grain through the barter menu; an Elf caravan stops outside the base five days after first contact; chopping Deepwoods trees in sight of an Elf gives three warnings and then war; a Dwarf colony names the direction of the nearest city after the first trade; the message panel records a declaration of war and clicking it jumps the camera.

**Builds:**

- Neutral villages and trade and Table 11: villages generated on discovery, specialisations, the trade menu (stock, wants, offer box, worth bar, three bundles), hidden values, daily limits and restock, mood, refusals, the war confirmation pop-up, allies drawn in, surrender, plunder, breaking down abandoned buildings; mercenary camps hired in silver.
- Halflings (placed at generation per Table 9, burrows and farm buildings, spearmen, surrender and flight; war oxen are M8), Runkin (camps, walk-and-shoot archers, clubbers, their wolves turned on the player, migration to a new camp), Elves (the one kingdom, caravans and their wagons, tree warnings, no surrender, Bladewarden, Longbow ranger, tamed bear, Grovesinger with the five nature spells from Table 13 on M6's engine; bear riders are M8), Dwarves (colonies and cities as separate factions, grudges and migration, reparations, Shieldbearer, Hammerguard, Crossbowman; Gunner, Cannon crew and city cannons are M8), Table 19 price lists. Faction AI (trade, war, surrender and migration states).
- Unit speech and the message panel: speech bubbles, random remarks, triggered speech, other races' lines, which speech reaches the panel, the 60 message panel with filters, collapse, click to jump, urgent pings and flashes, Space (chat typing is M9).
- Open questions: the four peoples are built; more peoples stay a later iteration, as the doc says.

**Depends on:** M4 (trinkets, goods), M6 (Grovesingers) and M5 (tribes attacking villages).

**Risks:** the barter valuation producing silly bundles; four faction AIs with war, surrender and migration states; speech volume flooding the panel.

#### M8: Mounts and charges, siege engines, gunpowder and the full roster to night 110

**You can now:** a warrior trained to ride charges a wave and knocks zombies back; an ox hauls a catapult that breaks a goblin hut; a Gunnery yard trains musketeers and cannon crew, and a bronze cannon fires from the Citadel's ports; by night 85 the budget buys juggernauts; Morvath arrives on night 110, withdraws at dawn if alive and returns ten nights after a defeat.

**Builds:**

- Combat, Charges and Table 14: the charge run, double damage, knockback by height, player horses and riding (Table 7 riding, Stables, the Table 1 mounted row), oxen as haulers, Halfling war oxen with two riders, Elf bear riders, goblin wolf riders and their pens.
- Siege engines research (Table 2a), Table 2f catapult and ballista with their munitions from the Great Workshop and Manufactory, hauling by horse or ox, crew pushing, wheels needing ramps, repair by workers only.
- Progression tier 8: Powder mill, Gunpowder, Foundry, Gunnery yard, Muskets and Cannons research (Table 2a), musket and lead shot, powder horn and shot pouch, bronze and iron cannons and cannonballs (Tables 2e and 2f), Citadel cannon ports, Dwarf Gunner, Cannon crew and city cannons.
- Night mobs nights 25 to 110 from roster 5.7 to 5.25: barrow knight through rift colossus, the Rift-touched beasts, Morvath with his boss drops and return rule, the later lair sleepers of Table 15, demon horn and mana crystal drops.

**Depends on:** M4 (steel, Stables, workshops), M7 (the peoples' mounted and gun units) and M5 (lairs).

**Risks:** wheeled pathing over column terrain; cannon splash and musket damage against the armour formula; the night 110 budget's unit count on screen.

#### M9: Multiplayer, accounts, saving and loading, settings and outside the match

**You can now:** two players on different machines join by code, pick colours and play a night with shared control and sent resources; one disconnects and the game pauses; the host saves, both quit, and the game resumes once both have rejoined; a guest who clicks Save is asked to make an account; the main menu reminds the player about F11.

**Builds:**

- Multiplayer model (network side): the order relay each step, the state checksum compared between players, reload from the host's state on a desync. Server: Node.js with a plain WebSocket relay (the lobby and reconnection are handled by the same Node server). Accounts and saved data: PostgreSQL, hashed passwords, HTTPS, expiring reset emails, saves as full state snapshots in a versioned compressed file.
- Multiplayer and saving: up to 8 players, Allies panel (share control with coloured rings, send resources, map pings), When a player is eliminated or leaves (split resources, inherited buildings and technology access), Accounts and guests, Saving and disconnects (autosave at dawn, save at any time, pause and the host's choice). Chat with Enter and the Who sees what rule.
- Outside the match: main menu, hosting and joining with links and codes, the lobby, load screen and save slots, settings (graphics, scale, shadows, view distance, volumes, hotkeys, camera sliders, the optional Ctrl layout), seeds, onboarding hints, browser support, the F11 reminder.

**Depends on:** M0 (the lockstep core) and every milestone, since the save covers all state.

**Risks:** 100 hour saves with every edited chunk; rejoin ordering; hosting cost and account email delivery.

#### M10: Audio, performance pass, balance pass against the pacing check, bug bash

**You can now:** a single-player run reaches bronze by night 4 to 6, iron by 13 to 18, steel by 25 to 30 and gunpowder by 40 to 48 (s) as in the pacing check, at the agreed frame rate on the minimum hardware; the Quick reference works end to end with the mouse alone; every sound in the Audio list plays.

**Builds:**

- Audio: day, dusk, night, dawn and blood night music, unit voice cues, the sound list.
- Performance notes measured against the Technical decisions targets (30 fps with 400 animated units on the minimum machine, 60 with 800 on the reference machine, 6,000 live mobile units inside a 25 ms step): instancing, flow fields, chunk streaming, column meshing and water, units on screen at the night 110 budget.
- Balance notes: the pacing check and the wave versus defence checks at nights 0, 10, 20, 40, 60, 80 and 110, supply at 110, run through the balance harness and then confirmed in play; What makes it fun as the review checklist for the decision tensions; (s) values retuned here, Jade's values untouched.
- Quick reference and Playing with the mouse only as the control test script; the bug bash across every earlier check.

**Depends on:** M9.

**Risks:** retuning one table shifting another; performance fixes breaking determinism.

#### Completeness check: where every section and table is built

| **Doc section or table** | **Milestone** |
|---|---|
| Technology (intro), Language, Technical decisions, Reading the number tables | M0 |
| Multiplayer model: deterministic lockstep | M0 (simulation); M9 (relay and desync reload) |
| Server, Accounts and saved data | M9 |
| World generation and terrain | M1 |
| Performance notes | M10 |
| Premise, Details | M2 (the warrior joins in M3) |
| What makes it fun | M10 |
| Winning, losing and score | M3 |
| Day and night | M2 (cycle); M3 (dawn sunburn); M5 (blood and fog nights) |
| Rising difficulty | M5 |
| Table 8: Night spawn geometry | M3 (dark edge, claimed land, first night, split, first appearance, base budget); M5 (the rest) |
| Light and torches, Table 18: Lights | M2 |
| Threats, Monsters and terrain | M3 (lair placement bullets M5) |
| Lairs, Table 15: Lairs | M5 (sleepers from night 25 filled by M8) |
| Night mobs | M3 (nights 0 to 20); M8 (nights 25 to 110, Rift-touched beasts, Morvath) |
| Hostile tribes, Table 16: Hostile tribe bands | M5 |
| Goblin villages, Table 17: Goblin villages | M5 (wolf riders and pen M8) |
| Neutral villages and trade, Table 11: Trade values, village stock and wants, Halflings, Runkin, Elves, Dwarves, Table 19: Elf and Dwarf price lists | M7 (war oxen, bear riders, Dwarf gunners and cannons M8) |
| The world, Table 9: Start pocket contents | M1 |
| Table 5: Resource nodes per band | M1 (prospect and mineshaft rows M4) |
| Food, supply and health, Table 6: Food and supply, Food and medicine | M4 (farm yield rows M2) |
| Open questions | M7 (noted for later iterations) |
| Gameplay Mechanics (heading), Controls, Screen layout and mouse zones, Camera, Browser requirements, Playing with the mouse only | M1 |
| Selecting units and buildings | M1 (selection panel and subgroups M2) |
| Control groups and camera hotkeys, Command card and hotkeys, Building placement, Gathering resources, Queuing orders with Shift | M2 |
| Unit orders | M2 (move, follow, stop, smart orders); M3 (attack, hold, patrol, leash) |
| Semi-automation | M2 (Everyone Home, repair); M4 (hunting, fishing) |
| Digging and prospecting | M3 (Dig); M4 (Prospect) |
| Unit speech and the message panel | M7 (chat M9) |
| Quick reference | M10 |
| Resources | M2 |
| Additional resources | M4 (listed as data in M2) |
| Units (intro), Workers | M2 |
| Warriors | M3 (hunting M4) |
| Experience and training, Table 7: Training | M3 (combat XP); M4 (training at buildings; mage rows M6; riding, musket and cannon rows M8) |
| Table 1: Player unit stats | M3 (worker rows read in M2; mage rows M6; mounted row M8) |
| Combat, Melee, One-handed weapons and shields, Polearms, Fighting flying enemies, Ranged attacks, How ranged attacks hit, Walls, trees and ranged attacks | M3 |
| Charges, Table 14: Mounts and charges | M8 |
| Bows and crossbows | M3 (bows); M4 (crossbows) |
| Animals, Wild herds, Game and other wild animals, Bears, Young animals, Fish | M4 |
| Buildings, Main base, Table 4: Buildings | M2 (data, main base, farms, pen and barn, lumber mill, storehouse, lights); M3 (defences, earthworks); M4 (production, research, mining, Barracks, Stables); M6 (Sanctum); M8 (Powder mill, Foundry, Gunnery yard) |
| Research, Forge levels, Cooking, Workshop, Trinkets | M4 |
| Items, Materials, Tools, Weapons and armour, Table 3: Armour, helmets, boots and shields | M4 (Big House rows M3; musket and cannon rows M8) |
| Equipment, Making equipment, Equipping units, Choosing by hand, Seeing equipment, Unit models, Refurbishing | M3 (other races' models with their milestones) |
| Inventory and carrying weight, Table 12: Carrying weights and capacities | M4 (the 25 lb load from M2, quivers from M3) |
| Progression, Table 2: Tools and weapons per tier (2a to 2f) | M4 (2a Hexcraft M6; 2a Siege engines, Gunpowder, Muskets, Cannons and 2f M8; hardwood and flint rows M3) |
| Balance notes | M10 |
| Magic, Mage types, Mage ranks and mana, Table 13: Mage spells and mana | M6 (Elf Grovesinger rows M7) |
| Terrain, What the land is made of, Water | M1 |
| Generated rocks and trees | M1 (hit feedback and particles M3) |
| Moving over the land | M2 |
| Digging and building up the land, Table 10: Dig speeds and break costs, Keeping digging fair | M3 (tunnel caves as lair sites M5) |
| Mineshafts and prospecting | M4 |
| Multiplayer and saving, Allies panel, When a player is eliminated or leaves, Accounts and guests, Saving and disconnects, Outside the match | M9 |
| Audio | M10 |
| Visuals | M1 (per-building looks with each building) |

## Premise

This is a procedurally generated survival and strategy game, played in the browser alone or with up to 8 players working together. The players start with a small camp on a flat, grassy patch in the middle of an unexplored, endless world: a Big House, four workers with nothing but hardwood tools, and one warrior with a flint-tipped spear and a hardwood club. By day they gather, farm, build, research and explore. By night, swarms of monsters pour out of the darkness and out of lairs to attack them. Each night is harder than the one before, and the game never ends: the score is the number of nights the players survive.

Over a game, the camp grows into a fortified town. Its technology climbs from hardwood clubs and flint tools through copper, bronze, iron and steel, up to flintlock muskets and cannons, while mages bring healing, battle magic and other spells. Workers do every job in the town, warriors fight and hunt, and both get better as they gain experience and better equipment.

The farther the players go from their starting point, the richer the resources and the greater the danger. Almost everything in the wild runs out, so even a cautious player is eventually forced to expand, and a small settlement that never expands will be wiped out. Some rare resources needed for advanced buildings and equipment are only found far from the start, or around certain aggressive creatures, which gives players a reason to expand faster. But expanding has its own risks: isolated buildings are destroyed at night, discovered tribes may start raiding, and disturbing tribes or territorial creatures makes the game harder. Being too aggressive or too cautious can both lose the game if done at the wrong time. Knowing when to push out and when to hold back is one of the main skills.

The map is generated as the players explore it. Natural obstacles (mountains, cliffs, crevasses, ravines and so on) form chokepoints that can be fortified. As the map expands, filling every chokepoint gets harder, and large areas may have no chokepoints at all. The world is laid out as cells divided by natural barriers with gaps in them, so there are always passes to fight over but never a natural fortress (see "The world"). Players can also shape the land themselves: digging trenches and moats, raising earth banks, and cutting passes through mountains (see "Terrain").

The land shapes the town. Grassland, which herds and most crops need, thins out with distance until the land is barren, so farming stays in the heartland while outposts reach out for ore, stone and rare materials. Food is a constant pressure: every person eats, farms provide most of the supply that limits how many units a player can have, and a destroyed farm at night can mean a hungry town the next day.

### Details

**Single player and multiplayer:** the game can be played alone or co-operatively by up to 8 players, all on the same side against the world (there is no player-versus-player). The game gets harder with each extra player.

**Day/Night:** The game starts in day. Day lasts 3 minutes, then dusk (40 seconds), night (3 minutes) and dawn (40 seconds), and the cycle repeats. One full cycle takes 7 minutes 20 seconds. See "Day and night" below for what happens in each period.

**Monsters:** most monsters have the **sunburn** trait: sunlight burns them and kills them quickly. At night, swarms of monsters attack the players. Some attack in waves, others in trickles or alone, depending on the type of monster.

**Starting setup:** Every player starts with:

- A level 1 **Big House**, the main base. It is a drop-off point for every resource, trains workers and warriors, and can be upgraded up to level 10 (see "Main base").
- 4 **workers**.
- 1 **warrior**.
- Basic **hardwood tools** only for the workers: hardwood axes, hardwood digging sticks and mallets. Better tools have to be made (see "Progression").
- The warrior starts with a **flint-tipped spear**, and a **hardwood club** that it switches to when an enemy gets too close (see "Polearms").

### What makes it fun

The game is built around three moments players should remember, the first two above all:

- **Surviving a brutal night.** Holding a wall or a chokepoint while the night throws everything at it, and seeing the sun come up with the town still standing.
- **A risky expedition that pays off.** Sending a party far from home into danger and bringing back the rare resource, the cleared lair or the discovery that changes the run.
- **A well-built town.** A base that grows from a log hut into a fortress, laid out so it runs and defends itself well.

The strategy comes from a set of tensions. None of them has one right answer; the right choice depends on the night count, the map and what the player has found so far.

| **Decision** | **Pull one way** | **Pull the other way** |
|---|---|---|
| Expand or stay close | Richer resources and rare materials are only found far from spawn. A small settlement that never expands will eventually be wiped out. | Distance means more danger. Isolated buildings are destroyed at night, and discovered tribes may start raiding. |
| Army or economy | More warriors and mages survive harder nights. | Every unit costs supply and eats food every day. Farms give the supply, so the army is only as big as the farmland. |
| Train or work | Training at a building makes units stronger and unlocks riding, ranged weapons, muskets and cannons. | A unit in training is stuck inside the building, costs time and food, and does no other work. |
| Light the land or not | Torches and light make monsters far less likely to spawn nearby. | Isolated torches get smashed by day creatures, and too many torches outside the base call a goblin horde at dusk. |
| Clear lairs or build | Clearing lairs removes about 20% of each night's monsters. | It costs daylight that could go to gathering and building, and new lairs keep appearing. |
| Disturb the world or not | Tribes and territorial creatures guard rare resources and some tribes can be traded with. | Provoking them raises difficulty. Some give up when you leave their territory; others hunt you until one side is dead. |
| One great base or many | A high-level main base unlocks the best units and technology. | Each upgrade costs more than the last, so outlying bases stay small and serve as drop-off points. |
| Research or units | Research facilities unlock better tools, weapons and buildings. | Each research facility costs supply and food like a unit, and each one costs more than the last. |

### Winning, losing and score

- The game is **player versus environment only**. In multiplayer, all players are on the same side.
- A game is **endless**. The score is the **number of nights survived**. In multiplayer, the team shares one score.
- There is **one difficulty**. It keeps rising so that almost every game ends in defeat eventually. Even the very best real-time strategy players should only last on the order of 100 hours.
- A player is **eliminated** when they have no workers left and no way to make new ones (no main base and no farm). Their resources are split evenly between the remaining players. Their buildings and units become shared by all remaining players (see "Multiplayer and saving").
- The game ends when every player has been eliminated.

### Day and night

| **Period** | **Length** | **What happens** |
|---|---|---|
| Day | 3 min | Gathering, building, exploring and clearing lairs. Daytime threats are territorial creatures, discovered tribes that raid, sun-proof monsters left over from the night, and creatures that smash isolated torches. |
| Dusk | 40 s | Last chance to get units home. Normal night monsters do not spawn yet. If too many torches are lit outside the base, goblins spawn now (see "Light and torches"). |
| Night | 3 min | Monsters spawn at the dark edge of the explored map and in lairs, then walk to their targets. They attack in waves, trickles or alone depending on their type (see "Threats"). |
| Dawn | 40 s | Normal night monsters stop spawning. Sunlight starts to burn the monsters that are left (see below). Goblins flee. The game autosaves. |

**At dawn**, monsters react differently by type:

- Most monsters have the **sunburn** trait and lose 10% of their maximum health every second in sunlight, so even a monster at full health dies in 10 seconds.
- Some flee to caves or shade and come back out at night.
- A few are sun-proof and stay as daytime threats.
- Goblins are not burned by the sun, but they always run away at dawn.

**Blood nights** are rare special nights. They last twice as long (6 minutes) and can never come before night 13. A blood night brings more of the rarer types of the existing mobs, not stronger versions of them. **Trigger (Jade):** a blood night falls when the players occupy **60% of a single depth band**. That band's trigger is then spent, so each band gives at most one blood night. The Deadlands have no trigger, because they are infinite. "Occupy" means the players' claimed cells (see "Claimed land") reach 60% of the band's cells, checked at dusk. A blood night never falls before night 13, so a band crossed earlier fires its blood night on night 13. The message panel warns at dusk.

**Fog night (suggested):** a random night event, announced at dusk. Sight and light radius are halved for everyone, and monsters spawn 20% closer. Nothing else changes.

**Random events:** the fog night is the only random night event for now (Jade). Its chance is in table 8.

### Rising difficulty

How hard each night is depends on several things added together:

- **The night count.** The main driver, rising faster as the game goes on, and new monster types join every 5 nights (see "Night mobs").
- **The size and wealth of the town.** Bigger, richer towns draw more monsters.
- **How far the players have explored.**
- **Which tribes and territorial creatures have been provoked.**
- **How deep the players are.** More monsters come the farther out the players are, but one building in the Deadlands does not bring the whole world down on them. Each player unit and building in a deeper band adds weight to that night's difficulty, deeper ones more, on top of the normal rise by night.
- **Depth weight (suggested):** each unit or building standing outside the Heartland at dusk adds to the night's monster budget: Fringe 0.5%, Deepwoods 1%, Barrens 2%, Deadlands 4% each, up to double the base budget. The extra monsters spawn at the dark edge nearest those units and buildings and go for them, so a lone deep outpost draws a small, nasty group. Deeper bands also draw monster types from later nights: Deepwoods 10 nights ahead, Barrens 25, Deadlands 50.
- **The number of players.** Difficulty scales in proportion to the number of players: three players get three times the monsters and three times the lairs of one player. The night budget and the lair count and cap are multiplied by the player count.

Because the night count keeps rising no matter what, staying small is never safe for long. The only way to keep up is to grow, and growing means going out into danger.

#### Reading the number tables

**Number tables.** Every number the game needs is in tables 1 to 19, each placed in the section it belongs to. Values Jade set are copied as they are; the rest are suggested and marked (s). Units: metres, seconds, pounds (lb), and worker-seconds (ws) for build and craft time, meaning the seconds one worker needs; up to 4 builders on a building (8 on a main base) each add a full share. Trade values are in value points (vp): 1 vp is the hidden value of 1 softwood lumber.

**Rules used by every table (suggested):**

- Damage taken = damage x (1 - armour %), rounded down, never below 1. Armour pieces add up and the total is capped at 75%. The roster's piercing and blunt modifiers apply per mob after that.
- Shields cut projectile damage only, by their block %, applied after armour.
- Fire burns wood: a burning wall, building or siege engine takes the listed burn per second until a worker repairs it or the burn ends.
- Experience: a kill is worth 2 x the mob's roster threat, shared equally among every player unit that hit it in the last 10 s; a creature with no threat value is worth its HP / 50 (minimum 1); clearing a lair gives 20 to every warrior within 20 m; a support mage earns 1 per 25 health healed in combat.
- Rank bonus: +5% damage per rank above the first for warriors and workers; spell power +10% per rank for mages; ranged spread -10% per rank.
- Nutrition is the food unit. Every unit, and every research facility, eats 2 nutrition per full day-night cycle, drawn evenly from the foods in stock (doc). All training and unit costs that say "food" are nutrition drawn the same way.
- Trade value is in value points (vp): 1 vp is the hidden value of 1 softwood lumber. Table 11 lists every item.

#### Table 8: Night spawn geometry

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Claimed land | 5 m around a lit torch and 10 m around a player building measured from its outer edge (Jade), plus any region enclosed by barriers that holds a player building (doc); no other light claims (Jade) |
| Dark edge | the line between explored and unexplored land; a spawn point sits on it at least 50 m from claimed land and 30 m from any player unit; if no such point exists the nearest unexplored spot 50 m from claimed land is used (s) |
| Light and units out in the dark | spawn weight x0.25 within twice a light's radius, x0.5 within three times; x0.5 within 20 m of a player unit; weights multiply (s) |
| Lair cadence | per player (Jade: the lair count and the cap multiply by the player count): 1 new lair every 3 nights to night 14, every 2 nights to night 44, 1 a night from 45, placed at dusk in a cell with no player building, preferring one next to claimed land, at least 40 m from claimed land; live lairs capped at 2 + night / 15 per player; a cleared site waits 10 days (doc, suggested) (s) |
| Outlying torches | lights more than 40 m from any main base count (wall torches count half); limit 4 + night / 5; dusk goblins: 3 cutters and 1 slinger per light over the limit, 1 chief per 5 over, at most 40 (s) |
| First night | budget 12 (roster) buys a fixed pick of 4 zombies, 2 cave bats, 2 giant rats, 1 giant spider and 1 slime (12.4 threat; the last pick may overrun by one mob), so all five of Jade's night 0 mobs come on night 0, with a single spider (s) |
| Budget factors | (12 + 3n + 0.04n2) x the player count (three players, three times: Jade) x town (1 + 0.02 x (player buildings - 10), never below 1) (s) x provoked (1 + 0.1 per village or kingdom at war + 0.05 per territorial creature hunting the player) (s), plus the depth weighting below |
| Depth weighting | each player unit or building standing outside the Heartland at dusk adds to that night's budget: Fringe 0.5%, Deepwoods 1%, Barrens 2%, Deadlands 4% each, capped at double the base budget; the extra mobs spawn at the dark edge nearest those assets and target them; deeper bands draw mob types from later nights (Deepwoods 10 nights ahead, Barrens 25, Deadlands 50) (s) |
| Split and picking | 80% at the dark edge, 20% shared equally among live lairs, counted across the whole world (Jade); with no live lair that fifth is not spawned, so clearing pays; a lair spawns only its own mob types; picks are weighted 3:1 towards mobs unlocked in the last 10 nights (s) |
| First appearance | a mob's first night sends at most 3 of it (lone mobs 1) (roster: a handful) (s) |
| Blood night | the longer night (6 min) with the budget doubled (roster) and the extra spent on the rarer existing mob types; no stronger variants (Jade); trigger (Jade): the players occupy 60% of a single band, after which that band's trigger is spent, so at most one blood night per band; the Deadlands have none because they are infinite; occupied means claimed cells reach 60% of the band's cells, checked at dusk; never before night 13 (a band crossed earlier fires on night 13); a message at dusk (Jade delegated these); a double horn (s) |
| Random night event | one event only (Jade), the fog night (doc, suggested): announced at dusk, sight and light radius halved for everyone, monsters spawn 20% closer (the 50 m stand-off becomes 40 m); (s): 10% chance a night from night 5 |

**How these were set:** a 50 m spawn stand-off and 1.4 m/s zombies give about 35 s between the dusk horn and the first zombie at a fence on the frontier, and about 60 s for a town 30 m inside its claimed edge, which leaves the 180 s night mostly for fighting.

### Light and torches

A lit torch extends the players' claimed land, where monsters almost never spawn (see "Threats"). Out in the unclaimed dark, light also lowers the chance of monsters spawning nearby: the closer a spot is to light, and to the players' units, the less likely a spawn there becomes. Light can only reduce the flow of monsters, never stop it, because monsters still spawn at the dark edge and in lairs and walk in.

- **Light sources:** torch posts (a wooden post with an iron cup) and wall torches (in an iron bracket). Suggested: iron braziers, and glass-and-iron lanterns once glass can be made.

To stop players from simply lighting the whole map:

- Several kinds of daytime creatures, including some that are not aggressive, destroy torches that are far from the base.
- If dusk finds too many torches lit outside the base, a large group of goblins spawns during dusk. Their main goal is to destroy the torches, and they attack players and their units as normal along the way.
- Suggested way to measure "too many": count the torches that are more than a set distance from any main base, and compare that with a limit that grows slowly with the night count. The more the count goes over the limit, the more goblins come.

#### Table 18: Lights

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Light** | **Light radius** | **Claimed radius** | **Fuel and burn** | **Cost** | **Build** | **Health** | **Spawn cut beyond its claim** | **Smashed by** |
|---|---|---|---|---|---|---|---|---|
| Torch post | 10 m (s) | 5 m (Jade) | 1 softwood lumber per 3 days; a worker refuels it, or the pool does automatically within 40 m of a main base | 2 softwood lumber, 1 resin (doc) | 10 ws | 40 | x0.25 to 20 m, x0.5 to 30 m | badger (beyond 40 m from a main base), goblins, kobolds (s) |
| Wall torch | 6 m (s) | 5 m (Jade) | as the post | 1 softwood lumber, 1 resin (doc) | 5 ws | 30, dies with its wall | x0.25 to 12 m, x0.5 to 18 m | goblins (s) |
| Campfire (cooking tier 1) | 8 m (s) | none (Jade) | 1 lumber per day | 5 softwood lumber | 10 ws | 60 | x0.25 to 16 m, x0.5 to 24 m | badger, wild boar, goblins (s) |
| Brazier | 14 m (s) | none (Jade) | 1 coal per day | 10 stone, 2 bronze ingots | 60 ws | 150 | x0.25 to 28 m, x0.5 to 42 m | goblins and hobgoblins only (s) |
| Lantern | 6 m (s) | none (Jade) | 1 resin per 5 days | 1 glass, 1 wrought iron, made at a Great Workshop in 20 s | 5 ws to hang | 20; 1 lb carried | as the wall torch | goblins (s) |
| Hand torch (carried, the Items table's torch) | 4 m (s) | none (Jade) | burns one day, then is used up (s) | 1 softwood lumber, 1 resin (doc) | 5 s at the Big House | 1 lb carried (s) | x0.5 within 8 m of the carrier (s) |  |

Snuff and Morvath's Crown of night put lights out without damage; a worker relights one in 2 s at no cost; a destroyed light is rebuilt from scratch (s). Which lights count against the dusk limit is in table 8.

### Threats

- **Where night monsters come from:** they spawn at the dark edge of the explored map and in lairs, then walk to their targets. They never appear at just any dark spot. Because they have to travel, the land, walls, trenches and water funnel them, and they follow the path of least resistance (see "Monsters and terrain"). Exploring in a direction pushes the dark edge away on that side.
- **Claimed land:** monsters almost never spawn inside the players' claimed land. Claimed land is any land within **5 m of a lit torch** or **10 m of a player building** (measured from the building's outer edge), plus any region fully enclosed by barriers (cliffs, water too deep to cross, walls and gates) that contains a player building. Enclosing land is strong but not absolute: climbers, flyers and wall-breakers are the counters.
- **Lairs** appear around the map over time, but never inside claimed land. They prefer cells next to it, so pressure builds at the frontier (see "Monsters and terrain").

#### Lairs

- **Two sources:** about 80% of each night's monsters come from the dark edge, which only exploring and claiming land can push back. The other 20% or so is shared among the live lairs, so clearing every lair drops a night to the edge's share alone. This split is for the whole world in total, not per band. Caves are not a third source: they are where cave-type lairs sit, and where monsters that flee the sun hide by day.
- **Clearing is a day job:** a lair has health like a building, a few sleeping monsters inside and a guardian (such as the giant centipede or myconid). Attacking it wakes them. When it falls, it leaves its destroyed version, workers can loot its hoard, and the warriors gain experience.
- **Loot:** a hoard of that lair's monster drops plus one valuable, scaled by depth band. The rule for all monster drops and hoards (Jade): a whole night's wave early on gives the players very little value, it grows slowly, and it is never a good way to build wealth.
- **Clear, then claim:** a cleared site cannot hold a new lair for about 10 days (suggested), and never once it is inside claimed land.
- **Lairs do not grow** if ignored. Great barrows are their own lair type that appears in the later undead nights.
- **Deadlands creatures (suggested):** the ash golem, a 3.5 m breaker of black rock that hunts players until one side is dead, and the mana wraith, a floating caster that drops mana crystals.
- **Ruins (suggested):** half-buried towers, walls and shrines of the old kingdom are scattered through the land as decoration and lair sites, and buildings players abandon become ruins too.
- **Lair types:** barrow, great barrow, mass grave, cave mouth, nest, goblin camp, Rift scar (from night 45) and Void rift (from night 80), each with a destroyed version. Each night mob has a lair type (see the mob roster file). Their models are on the models wishlist.
- Suggested: lairs show on the minimap once a unit has seen them, and Rift scars and Void rifts glow and can be seen from far off at night.
- **Wall-bypassing monsters:** climbers go over walls, flyers ignore them, and wall-breakers smash through. Wall-breakers can also break terrain, but prefer not to (see "Monsters and terrain"). There are no diggers that tunnel under defences.
- **Isolated buildings** are quickly destroyed at night, which makes spreading cheap buildings everywhere a losing strategy.
- **Tribes and villages** of hostile creatures and other races. There are three kinds of community: **neutral villages** that can be traded with (see "Neutral villages and trade"), **hostile villages** that cannot be traded with (goblins, see "Goblin villages"), and **hostile tribes**, roaming bands with no villages (see "Hostile tribes"). The neutral peoples so far are the Halflings, Runkin, Elves and Dwarves; more will be added later.

#### Table 15: Lairs

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Lair** | **From night** | **Health** | **Sleepers (asleep until attacked)** | **Guardian (awake)** | **Band** |
|---|---|---|---|---|---|
| Barrow | 0 | 400 | 4: zombies, skeleton archers from night 5, grave hounds from 20, a hollow priest from 40 | 1 giant centipede | any (s) |
| Cave mouth | 0 | 500 | 6: cave bats and giant rats | 1 giant centipede | foot of barrier edges (s) |
| Nest | 0 | 300 | 3 giant spiders, which are also its guard | none | caves and dead forest (s) |
| Mass grave | 10 | 600 | 3 bloated corpses, a plague bearer from 30 | 1 myconid | Fringe and deeper (s) |
| Goblin camp | 15 | 800 (4 huts of 200) | 6 cutters, 2 slingers | 1 goblin chief | Fringe and deeper (s) |
| Great barrow | 25 | 1200 | 5: 1 barrow knight, 2 grave hounds, 2 skeleton archers; a bone colossus from 35 | 2 giant centipedes | Fringe and deeper (s) |
| Rift scar | 45 | 2000 | 6 red demons of the current roster | 1 ash golem | Deepwoods and deeper; glows (s) |
| Void rift | 80 | 4000 | 4 purple demons of the current roster | 2 mana wraiths | Barrens and deeper; glows (s) |

Hoard (s): 10 rolls on the sleepers' drop tables (roster) plus one valuable by band: Heartland 1 silver, Fringe 1 gold, Deepwoods 1 emerald, Barrens 1 ruby, Deadlands 1 diamond; about 20 to 40 vp for an early barrow, which keeps Jade's rule that killing is never a way to build wealth. How many appear a night, and where: table 8 cadence; a type is picked among those unlocked, weighted to the newest. Minimap: shown once any unit sees it (doc, suggested); Rift scars and Void rifts are visible from 120 m at night (s). A lair's share of the 20% comes out of its mouth 20 s after night falls (s). Clearing gives 20 XP to every warrior within 20 m (header rule).

#### Night mobs

Only the mobs below take part in the nightly attacks. A new mob joins every 5 nights until night 110. The theme grows more demonic over time: nights 0 to 40 are the dead and the creatures of the dark, red demons arrive from night 45, and the purple demons of the Void, the most powerful things in the game, arrive from night 80. Most demons are red; only the really powerful ones are purple. Jade set the mobs up to night 10 and the goblins; the rest, marked "(suggested)", are Claude's ideas.

| **First night** | **Mobs** | **Role** |
|---|---|---|
| 0 | Zombie, cave bat, giant rat, giant spider, slime | Basic walkers, a low flyer, two climbers and a slow brawler |
| 5 | Skeleton archer | The first ranged enemy |
| 10 | Bloated corpse, skeleton bomber | Heavy melee that explodes on death; the first wall-breaker |
| 15 | Goblin warband | A mixed raiding pack that wants to put out your torches |
| 20 | Grave hound (suggested) | Fast pack that runs past the front line to reach workers |
| 25 | Barrow knight (suggested) | Armoured skeleton with a shield that blocks arrows |
| 30 | Plague bearer (suggested), gravewing (suggested) | Stops healing around it; a high flyer that snatches workers |
| 35 | Bone colossus (suggested) | Big undead wall-breaker |
| 40 | Hollow priest (suggested) | Necromancer that raises zombies; the last of the undead |
| 45 | Cinderling (suggested) | The first demon: small, red, sets timber on fire |
| 50 | Hellhound (suggested), Rift scorpion | Red demon dog pack with fire breath; the first Rift-touched beast |
| 55 | Fiend (suggested), Rift centipede | Red demon foot soldier; a venomous climber |
| 60 | Scorchwing (suggested), Rift hornet | Red winged demon that drops fire; a stinging swarm |
| 65 | Demon brute (suggested), Rift beetle | Red demon wall-breaker; a ramming small breaker |
| 70 | Flamecaller (suggested), Rift griffin | Red demon fire-caster, deadly to wooden defences; a heavy flyer |
| 75 | Chain fiend (suggested), Rift minotaur | Red climber that hooks archers off towers; a heavy brawler |
| 80 | Void stalker (suggested) | The first purple demon: invisible until it strikes |
| 85 | Infernal juggernaut (suggested) | Red armoured siege beast |
| 90 | Void witch (suggested) | Purple caster that drains health and mana |
| 95 | Abyssal drake (suggested) | Purple high-flying dragon |
| 100 | Archfiend (suggested) | Purple demon general that strengthens other demons |
| 105 | Rift colossus (suggested) | Huge purple breaker |
| 110 | Morvath, the Hollow Crown (suggested) | The demon lord, a boss. The last new mob |

- **Rift-touched beasts:** six existing creatures (scorpion, centipede, hornet, beetle, griffin and minotaur) also join the night attacks from nights 50 to 75 and stay for the rest of the game, as scorched, glowing variants of their daytime selves. Jade asked for six more mid-game night mobs; which six and their nights are suggested.
- **Morvath, the Hollow Crown** (the boss) first comes on night 110. Each time he is defeated he returns 10 nights later. His drops (20 mana crystals, 10 gold, 3 diamonds) are bigger than the small-valuables rule because he is a boss. Suggested: if he survives a night, he withdraws at dawn and returns the next night until beaten.

After night 110 no new mobs arrive; nights keep getting harder through the night budget and the per-night strengthening.

- **Jade's rules:** giant spiders and giant rats climb walls. A bat is a flying melee attacker that swoops down to attack. The bloated corpse is a large melee attacker, twice as wide as a human and slightly taller, that does heavy damage and explodes on death, hurting nearby units. The skeleton bomber is a skeleton in a rusty helmet carrying a bomb as tall as a human torso; it runs to walls or barriers and blows up, but goes for clusters of troops instead if they are on its way. Mobs can drop small amounts of valuables now and then, never on every kill.
- **No friendly fire for monsters:** monster explosions and area attacks only hurt the players' units and buildings.
- **Climbers (suggested):** climbing is slow, a mob on a wall cannot attack and takes 50% extra damage, and rats and spiders will not climb a shut gate lit by a torch.
- **Valuables (suggested):** gold, silver and gems drop on at most about 1 kill in 20, one unit at a time. Common drops are ordinary resources.
- **Stronger over time (suggested):** every mob gains 0.5% health and damage for each night after its first. On a mob's first night only a handful come, so players can learn it.
- **Night budget (suggested):** each night spends a monster budget of 12 + 3 x night + 0.04 x night² on the unlocked mobs (about 12 on night 0, 262 on night 50, 826 on night 110), multiplied by the other difficulty factors in "Rising difficulty". Blood nights double it.
- **Wall-breakers** (the skeleton bomber, bone colossus, demon brute, infernal juggernaut and rift colossus) follow the existing rule: they can smash terrain and trench edges, but prefer not to (see "Monsters and terrain").
- **Goblins:** the goblin warband joins the nightly attacks from night 15. Separately, the dusk goblins that come for too many outlying torches (see "Light and torches") can appear from the start.
- **Full details:** each mob's stats, look, abilities, drops and lore, the suggested backstory (a fallen kingdom, the Hollow Priests and the Rift), and the daytime roles of every other creature are in the mob roster file (models/mob_roster.md). Creatures not in the table above never join night attacks; they are wild animals, territorial creatures, lair guardians or hostile tribes.

#### Hostile tribes

- Gnolls, kobolds and hobgoblins are **roaming bands with no villages**. Unlike the neutral races, they cannot be traded with and never make peace.
- **Where:** they spawn at random spots in the Fringe and Deepwoods and roam only those two bands.
- **Not near anyone:** they never spawn near the players' units or buildings, or near a neutral race's units or buildings (suggested: within 60 m, and never inside claimed land). If there is no room left to spawn, they stop spawning.
- **Hard cap:** at most 20 tribesmen per player in the world at once (suggested), counting individual tribesmen, not bands (suggested).
- **Who they attack:** any group they find, players and neutral races alike, including Elf caravans and Halfling and Runkin villages. They chase anything they find, even out of their own bands (suggested: they give up after losing sight of the target for 20 seconds, then wander back).
- **Daytime only:** they fight by day. Suggested: at dusk a band makes camp where it is and only fights if attacked; it never joins night attacks, and night monsters leave it alone. Band sizes and stats are in the mob roster file.

#### Table 16: Hostile tribe bands

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Band sizes | gnolls 3 to 5, kobolds 4 to 6, hobgoblins 3 or 4 (roster) |
| Spawn | one band every 2 days while the world holds fewer than 20 tribesmen per player (roster; per player (s)); the first band on day 3 (s); tribe odds Fringe 40 / 40 / 20, Deepwoods 20 / 30 / 50 for gnoll / kobold / hobgoblin (s) |
| Keep-away | 60 m from any unit or building of the players or a neutral race, and outside claimed land (roster); nothing spawns if no spot is free (doc) |
| Chase | 20 s after losing sight, then wander back (roster); bands never leave the Fringe and Deepwoods (doc) |
| Dusk camp | a 6 m circle with a fire (light radius 6 m, no claim), fights only if attacked, ignored by night mobs (roster) (s) |
| Sight and targets | sight 30 m (s); a band attacks the first unit, building, caravan or village it sees; buildings are hit with roster "vs walls" damage of 4 (gnoll), 2 (kobold), 8 (hobgoblin) (s) |
| XP and loot | XP by the header rule (gnoll 3, kobold 1, hobgoblin 4); loot roster 6.1 |

#### Goblin villages

- Goblin villages are **hostile villages**: they cannot be traded with, and their goblins attack anyone who comes near. They also attack neutral races they come across. They are rare in the Fringe and common in the Deepwoods.
- **Units:** standard goblins, goblin archers, goblin wolf riders and the goblin mage. Wolf riders are mounted, so the charge rule applies to them (see "Charges").
- **Looks:** goblins are **1.2 m** tall. Suggested: green-grey and wiry, in scraps of leather. Archers carry short crooked bows and a quiver of mismatched arrows. Wolf riders sit on large grey wolves with a bone-and-leather saddle. The goblin mage is hunched, wrapped in a ragged hide cloak hung with pebbles, and carries a gnarled stick with a hexstone tied to the tip. Their villages are clusters of crooked huts of sticks, hides and scavenged planks around a smoky fire pit, behind a ring of sharpened stakes.
- **Goblin mage:** a weak caster, like all goblins, with three goblin spells (suggested): **Snuff** puts out a torch or other light from a distance; **Stumble hex** slows one unit's movement and attacks by 20% for 4 seconds; **Spark toss** throws a small fire bolt that does light damage and can set dry wood smouldering.
- **War:** goblins do not declare war on whoever they meet. They only fight what comes near, until someone kills more than 4 of them, or kills one and destroys one of their buildings. Then they **declare war** and come looking for that side instead of waiting. They can also declare war on neutral races, and players are alerted in the message panel when they do. Suggested: when a player is one kill away from starting a war with a goblin village, the message panel warns them.
- **Lights:** goblins like to destroy the players' torches and lights. Because lit torches keep night spawns away (see "Claimed land"), a daytime goblin raid on torches lets night monsters spawn closer that night.
- **Night mobs:** goblins get on well with the night mobs. Night mobs never attack goblins or goblin villages, so unlike other villages, goblin villages are not attacked at night.
- **Drops:** iron weapons, leather, rarely a small amount of silver or gold, and **hexstone** (see "Additional resources").
- Village goblins stay home at night. The goblin warband in the night attacks (from night 15) spawns at the dark edge like other night mobs.
- **Village extras:** a totem pole hung with hexstones and skulls, and a wolf pen. Night-raid goblins also include **goblin slingers** and a **goblin chief** with a dented helmet and a big cleaver.
- **Territorial creatures** react to players entering their territory. Some leave as soon as the players leave, some chase them a long way past it, and some hunt the players once disturbed until either side is dead.

#### Table 17: Goblin villages

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Frequency | Fringe 1 village per 12 cells, Deepwoods 1 per 4 cells, never in the start basin (s) |
| Size | Fringe 3 or 4 huts, Deepwoods 4 to 6; a fire pit, a totem and a stake ring; a wolf pen from 4 huts (s) |
| Units | 2 goblins per hut, 2 archers per village, 1 wolf rider per 2 huts (needs the wolf pen), 1 goblin mage in every Deepwoods village and half the Fringe ones; stats roster 6.3 (s) |
| Buildings | hut 200 HP, fire pit 100, totem 150, stake ring 150 per column, wolf pen 300; broken down by workers for 5 sticks and 2 hides a hut (s) |
| Aggro | attack anything within 25 m of the stake ring, chase 40 m, then go home (s) |
| War | threshold as the doc; at war, 60% of the fighters (at least 4) march on that side's nearest building each day 30 s after dawn, putting out lights on the way, and go home at dusk; a village at peace rebuilds 1 hut per 5 days up to its size (s) |
| Dusk torch horde | table 8: 3 cutters and 1 slinger per light over the limit, 1 chief per 5, at most 40 (s) |
| Spells | Snuff 20 m (roster), puts out one light, 8 s cooldown; Stumble hex 14 m, 6 s cooldown; Spark toss 14 m, 8 damage and sets dry wood smouldering 2 per s for 5 s (roster 8 + smoulder), 3 s cooldown; mage mana 60, refill 1 per s (s) |

**How these were set:** a Deepwoods village of 5 huts fields 10 goblins, 2 archers, 2 wolf riders and a mage (about 25 threat on the roster scale), which is a fair fight for 6 bronze warriors and a hard one for 3.

### Neutral villages and trade

- Neutral villages are the tribes that can be traded with. The deeper they are, the larger and grander they get, and the better their trades.
- Villages and mercenary camps are only generated when players discover them, so nothing can happen to them before that. Once discovered, they are attacked by monsters like the players are.
- Each village has a **specialisation**. Villages generally offer basic raw materials and basic equipment. Suggested: each Halfling village leans to one trade (crops, livestock, fishing or weaving), which sets what it sells cheaply and what it pays well for.
- **Mercenary camps** are separate places where recruits can be hired. Suggested: small neutral camps in the Fringe and Deepwoods that hire out two to six warriors for one day, paid in silver. They fight for whoever paid last and walk home at dusk.
- Once a village has been found, trade happens through a **trade menu**, opened by talking to the village leader or by using some of its buildings (right click the leader or building with any unit). Goods go straight between the player's resource pool and the village; nothing has to be carried.
- Trade is barter. The player puts up an offer, and the village answers with a few choices of what it will give in return. The player picks one, or withdraws the offer.
- Every item has a **hidden value** that drives what a village will offer.
- **Trinkets** made at the workshop are made for trade (see "Trinkets").
- **How a trade works:**
  - **Opening:** right click the village leader, a trade building or an Elf caravan with any unit. Trade only opens while the player has a unit within about 15 m (suggested), and never during a war.
  - **The trade menu** has three parts: the village's stock (what it sells today), its wants (what it pays well for, with the goods it refuses greyed out), and the offer box. There are no coins and no prices on screen. Every good has a hidden value in value points (see table 11), and a rough worth bar under the offer box shows how good the deal is (suggested).
  - **Making an offer:** the player drags goods from their pool into the offer box. The village weighs them by how much it wants each one (table 11) and answers with **3 bundles** of about that worth from its stock. The player takes one bundle, or withdraws the offer and loses nothing.
  - **Limits:** a village buys at most about 300 value points of one kind of good a day, and its stock refills about 20% a day (table 11). Elf and Dwarf limits are in table 19.
  - **Mood (suggested):** offering a village the same goods again after turning down its answer three times in a day makes it close trade to that player until the next dawn. Refusing an answer otherwise costs nothing.
  - **What each people will not take:** Halflings refuse raw gold, silver and gems. Elves are insulted by lumber and close trade to that player for a day. Goods a people refuses are greyed out in its menu.
  - **Elf caravans** come to the player once the Elves have been met: about every 5 days a caravan stops outside the player's main base, trades through the same menu, and leaves at dusk (suggested). Its stock is in table 19. Dwarves send no caravans; players go to their colonies and cities.
- Different types of community favour certain items over others, so the same offer can get a much better answer from one village than another.
- **War:** a player can turn a neutral village hostile by attacking it on purpose, with the Attack command clicked directly on its people or buildings. This starts a **state of war** that lasts until one side is eliminated or the village surrenders. During a war, the player's units attack the village's people automatically, like any other hostile.
- An attack order on a neutral village never starts straight away. A pop-up first asks the player to confirm the war. If the player cancels, no order is given. Attack-move, patrol and idle units never target a neutral village.
- In multiplayer, a war started by one player draws in **all of their allies** automatically, whether they wanted it or not.
- **Surrender:** when a neutral people surrenders, the player gets their things as described for the Halflings (livestock, the remaining fighters' weapons and some loot). Elves and goblins never surrender. A Dwarf faction holds a grudge and starts attacking again once it has regained its strength in a new place.
- **Plunder:** winning a war against a village that keeps livestock gives the player its livestock.
- **Abandoned buildings** of other races cannot be used. The only thing players can do with them is send workers to break them down, which gives back the resources they were built from.

**Peoples.** Each neutral village belongs to a people with its own looks, homes, tastes in trade and way of fighting. The four peoples so far, the Halflings, Runkin, Elves and Dwarves, are below; more will be added in later iterations.

#### Table 11: Trade values, village stock and wants

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** 1 vp = 1 softwood lumber; a made item is worth 2 x its recipe inputs; a trinket 2.5 / 3 / 3.5 / 4 x its metal by tier and 5 x for the special pair.

| **Item** | **Value (vp) (s)** |
|---|---|
| Softwood lumber 1, hardwood lumber 2, sticks 0.5, planks 1.5, stone 1, flint 1, clay 1, sand 1, gravel 0.5, Earth 0.2, bricks 1, glass 3, resin 1, bone 1 | raw and simple goods |
| Coal 2, charcoal 1.5, copper ore 2, tin ore 3, bog iron 2, iron rock 2, vein iron 4, lead ore 3, saltpetre 4, sulphur 6, marble 6 | minerals |
| Meat 3, fish 2, eggs 1, wheat 1.5, potatoes 1, carrots 1, corn 1.5, flax 1, herbs 2, hides 3, leather 4, feathers 0.5; cooked foods 0.75 x nutrition (bread 4, roast meat 5, stew 9, pie 12); bandage 5, remedy 15 | food and farm goods |
| Copper 5, tin 7, bronze 6, bloom iron 8, wrought iron 9, pig iron 11, refined iron 24, steel 30, HQ steel 60; gunpowder (10 charges) 16, lead shot (10) 4 | ingots and powder |
| Gold 40, silver 15, emerald 50, ruby 60, diamond 100, mana crystal 30, demon horn 20, hexstone 10, venom 5, spider silk 3 | valuables and monster goods |
| Any tool, weapon, armour, shield, engine or cart: 2 x the sum of its recipe (bronze sword 36, wrought iron mail 80, steel sword 192, HQ steel sword 372, steel plate 376, musket 68, bronze cannon 280, iron cannon 256) | made equipment |
| Token 1 ingot x2.5 (copper 12, gold 100); Charm 2 ingots x3 (copper 30, gold 240); Brooch 4 ingots x3.5 (copper 70, gold 560); Heirloom 6 ingots x4 (copper 120, gold 960); Moonleaf 3 silver + 2 emeralds x5 = 725; Sunheart 3 gold + 2 rubies x5 = 1200; made in 15 / 30 / 60 / 120 / 180 / 240 s | trinkets |

How a village pays (s): it values the player's offer at the share below and answers with 3 bundles of that worth from its stock; it sells at 100% of value; it buys at most 300 vp of one category a day and its stock refills 20% a day.

| **People** | **Pays for** | **Stock it sells** | **Refuses** |
|---|---|---|---|
| Halflings (Heartland) | food 110%; tools and weapons 70%; metal ingots 60%; trinkets 50%, silver and gold trinkets 35%; lumber 30%; anything else 50% (s) | wheat, potatoes, carrots, corn, eggs, meat, bread; live hen 8, cow 40, ox 60; shortbow (bow stats, 20 m range) 10; shortsword (bloom iron, 16 / 1.1 s) 20; buckler (blocks 10%, 4 lb) 8; bloom iron ingots 8 (s) | gold, silver, gems (doc) |
| Runkin (Fringe, some Deepwoods, rare Heartland) | tools, bows, metal weapons 110%; food 100%; trinkets 80%, silver and gold trinkets 70%; raw gold and silver 70%; lumber 40%; else 50% (s) | fish, meat, hides, sticks, flint, herbs, bone, feathers (s) | nothing; at war their wolves fight (doc) |
| Elves and Dwarves | table 19 | table 19 | lumber (Elves) |
| Mercenary camps (doc, suggested) | paid in silver (doc): 2 silver per warrior for the day (s) | small neutral camps in the Fringe and Deepwoods, 1 per 20 cells (s), hire out 2 to 6 warriors for one day; they fight for whoever paid last and walk home at dusk (doc); (s): Runkin archers and Halfling spearmen in the Fringe, Elf Bladewardens and Dwarf crossbowmen in the Deepwoods |  |

Specialisations (doc, suggested): each Halfling village leans to one trade (crops, livestock, fishing or weaving), selling that good at 80% and paying 130% for what it lacks (the percentages (s)); (s): Runkin camps lean to fish, hides or herbs, Dwarf colonies to one metal or gem, Elf caravans to one weapon. Surrender (doc): as for the Halflings (livestock, the fighters' weapons and some loot, which I set at 10 vp per villager in food and metal); Elves and goblins never surrender; a Dwarf faction holds its grudge and attacks again once it has rebuilt elsewhere.

#### Halflings

- **Where:** only in the Heartland. All Halfling villages are placed when the world is generated from the seed (they are drawn only once found). No new ones appear during a game, so once the Halflings are wiped out, they are gone for good. How many there are and where they sit is in table 9.
- **Who they are:** a down-to-earth farming community. Males are 1.5 m tall and females 1 m, in a mix. Light brown skin and blonde hair.
- **Homes:** burrows with wooden doors and little windows, plus some stone and wooden buildings above ground, mostly for farming.
- **What they want:** food and trinkets. They undersell trinkets, giving much less than a trinket is worth, especially for trinkets of the more valuable metals. A gold trinket still gets more in return than a copper one, just nowhere near its value.
- **What they refuse:** gold and silver, raw or as ingots, and gems. They do not value them at all and will not accept them.
- **What they sell:** farm goods, including live livestock for the player's own farms, and Halfling weapons such as shortbows, shortswords and bucklers. They can make iron, but only the lowest grade (bloom iron).
- **Buildings:** a little windmill, a two-storey inn half dug into the hill, and barns. Halfling spearmen wear an iron cap and carry a short spear.
- **Ox riders:** only in times of war, Halflings ride oxen into battle with two riders on each: a spear-wielding Halfling in front and an archer behind. An ox rider can attack in melee and at range while it moves.
- **War:** they fight if they must, and offer to surrender once more than half of them have died. If the player accepts the surrender or defeats them, the player gets their livestock, the weapons of their remaining fighters and a little general loot dropped at the village. The remaining Halflings flee to the edge of the explored land and disappear there.

#### Runkin

- **Where:** most common in the Fringe, uncommon in the Deepwoods, and rare in the Heartland.
- **Who they are:** a friendly hunter-gatherer people. Males and females are both 1.5 m tall, in a mix. Pale skin with light brown blotches, and long dark hair.
- **Homes:** tents made from animal hides.
- **Competition:** they hunt and fish around their camp, competing with the player for the limited fish and game. They never fight over it unless the player starts a war.
- **What they want:** tools, bows, metal weapons, trinkets and food. They undersell gold and silver, giving less than it is worth, though still more than for a copper trinket.
- **What they sell:** their catch (fish and game), the kinds of sticks that grow near their camp, flint and medicinal herbs.
- **Fighters:** mostly archers, who can walk (but not run) while shooting a bow. Some fight with hardwood clubs and flint spears.
- **Wolves:** the Runkin keep friendly wolves. If the player goes to war with them, the wolves are turned against the player.
- **War:** like the Halflings, they offer to surrender once more than half of them have died, and surrender or defeat gives the player their livestock, the weapons of their remaining fighters and a little loot from the village. The rest flee to the edge of the explored land and set up a new camp there, as long as that spot is in the Heartland, Fringe or Deepwoods. Once the players have explored every place in those three bands that could hold a village, the Runkin run off the map instead and disappear.
- **Camp buildings:** hide tents, drying racks, a wolf den (a hide windbreak and scratched post) and a communal fire ring.

#### Elves

Rows and lines marked "(suggested)" are Claude's ideas to fill gaps, for Jade to keep, change or drop.

- **Where:** only **one kingdom** in the whole game, somewhere in the Deepwoods, and it is very large. Its name (suggested): Sylvareth.
- **Caravans:** the Elves send travelling caravans inland (the Deepwoods, Fringe and Heartland, never the Barrens or beyond), so players can trade with them before finding the kingdom. Suggested: attacking a caravan starts a war with the whole kingdom.
- **Who they are:** androgynous-looking, with long hair. Suggested: tall (about 1.9 m) and slender, with pale grey-green and silver clothing.
- **Homes:** they like wood and marble in their buildings but use other materials too. Suggested: tall marble-footed halls built around and up into giant living trees, linked by wooden walkways.
- **What they want:** they value **trinkets** highly.
- **Lumber offends them.** Offering lumber in trade insults them. Suggested: they close the trade menu to that player for one day.
- **What they sell:** many kinds of goods, including food, and **high-quality steel melee weapons** at a very high price, so buying them is never a cost-effective way to equip an army.
- **Cutting trees in the Deepwoods:** if an Elf (from the kingdom or a caravan) actually sees players cutting down trees in the Deepwoods, they warn them to stop. After a few warnings (suggested: three) they **declare war** and try to wipe the player out. Cutting trees where no Elf can see it, or outside the Deepwoods, does not bother them.
- **War:** the Elves **never surrender**. A war with them lasts until one side is gone.

**Elf units:** Jade's list is skilled warriors, archers, tamed bears and bear riders. Suggested units:

| **Unit** | **What it does (suggested)** |
|---|---|
| Bladewarden | Skilled warrior with a high-quality steel glaive (a polearm) and a long knife as its backup weapon. Fast and hard-hitting, lightly armoured. |
| Longbow ranger | Archer with the longest bow range in the game. Can walk while shooting, like the Runkin, and its arrows have high-quality steel tips. |
| Tamed bear | Fights on foot alongside the Elves. Big, tough, and swipes in an arc. |
| Bear rider | An Elf warrior riding a bear. Charges like cavalry (see "Charges"), knocking back anything smaller than the bear. |
| Grovesinger | Elf mage (see below). |

**Elf mages (Grovesingers) (suggested).** They work differently from the players' mages:

- They cast with **living-wood staves** instead of wands, and men and women both become mages. (suggested)
- Their mana refills faster near living trees and much slower in barren land, so they are strongest at home in the Deepwoods. (suggested)
- Their spells are nature magic (suggested):
  - **Rootbind:** roots burst from the ground and hold enemies in an area in place for a few seconds (non-projectile).
  - **Thorn volley:** a spray of thorns that flies like arrows (projectile, blocked by walls like arrows).
  - **Barkskin:** allies in an area take less damage for a while.
  - **Mending bloom:** flowers spring up and heal allies standing on them over time.
  - **Call of the wild:** wild animals nearby join the fight for a short time.

**What Elves say (suggested):**

  - First meeting: "You walk under old trees, stranger. Walk gently."
  - Trading: "A fine piece. The smith had patience." / Offered lumber: "You bring us the bones of our forest?"
  - Tree warnings: "Put down the axe." / "The forest remembers. Stop." / "Last warning, axe-bearer."
  - Attacked or at war: "Then the forest will have you."
- **Other buildings:** ring platforms around the great trees, bear pens, and a gate of marble pillars with a carved-leaf arch. Caravans travel in covered wagons pulled by two horses that fold open into a market stall.

#### Dwarves

- **Where:** small **colonies** in the Barrens, and big but rare **cities** in the Deadlands (about one city for every 3 rings of cells, which is roughly 1 in 120 cells, so they are very rare). Once a player has traded with a Dwarf colony, it tells them the direction and rough distance to the nearest city. There are no roads leading there.
- **Who they are (suggested):** short (about 1.3 m) and very broad, with braided beards and heavy, practical clothing.
- **Homes:** sturdy-looking stone buildings, and their own **mineshafts**.
- **What they want:** food, precious metals and trinkets. They also buy **lumber**, paying more for it than other races do, though still not much.
- **What cities sell:** cannons, muskets and high-quality armour at about **three times** what they would cost a player to make, plus gold and gems. They also sell **gunpowder and shot**, so a bought musket or cannon can be used.
- **What colonies sell:** a small amount of good steel, but mostly lower-quality metals and weapons, plus gems.
- **Factions:** each colony and each city is its own faction. A war, and the reparations to end it, only involve that one colony or city.
- **War:** Dwarves fight until half of them are dead, then **migrate away**. That group stays at war with the player for good unless the player pays **reparations**, which are very expensive. A migrated group first tries to survive and rebuild, and only then starts attacking the player again. Suggested: it rebuilds for about 10 days before raiding.
- **Other buildings and gear:** a stone forge with an iron chimney, pillared halls, and city gates carved into cliffs with two guardian statues. Dwarf cities field their own cannons, and colonies haul goods on iron-shod sleds dragged by oxen.

**Dwarf units (suggested):**

| **Unit** | **What it does (suggested)** |
|---|---|
| Shieldbearer | Heavily armoured, with an axe and a large shield. Slow, very hard to kill, and holds chokepoints. |
| Hammerguard | Two-handed war hammer. Smashes through shields and walls faster than other units. |
| Crossbowman | Colonies and cities. Short range, hard-hitting bolts. |
| Gunner | Cities only. Musket, slow to reload. |
| Cannon crew | Cities only. Defends the city walls. |

- Suggested: Dwarves have no mages; their strength is their gear and their stone walls.

**What Dwarves say (suggested):**

  - First meeting: "Surface folk. Mind where you step, it's all ours below."
  - Trading: "Fair metal, fair price. Well. Our price." / Offered lumber: "Wood? Fine, fine. Not worth much down here."
  - Retreating: "This isn't over. We remember every grudge." / Reparations paid: "Paid in full. We'll forget. Mostly."

**What Halflings and Runkin say (suggested):**

  - Halflings, first meeting: "Oh! Visitors! Mind the cabbages." Trading: "Ooh, shiny. Not much use for it, but shiny." Attacked: "Ruffians! Ring the bell!"
  - Runkin, first meeting: "Hunters? Good. Take only what you need." Trading: "A good blade. Our wolves will eat well." Attacked: "Wolves! Bows!"

#### Table 19: Elf and Dwarf price lists

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Seller** | **Sells (price in vp) (s)** | **Pays for (s)** | **Limits (s)** |
|---|---|---|---|
| Elf caravan (every 5 days once met; also at the kingdom) | bread 5, roast meat 5, smoked fish 7, wheat 2, flax 1, herbs 2, bandage 5, healing remedy 15 (all 120% of value); HQ steel sword 1500, HQ steel pike 1600, HQ steel glaive (steel halberd stats, 45 damage) 1800 (4 x their value, so never cost-effective, as the doc wants) | trinkets 130%; food 100%; gold, silver, gems 100%; else 60% | a caravan carries 1 weapon and 200 vp of food a visit; the kingdom 3 weapons a day; lumber offered closes trade to that player for 1 day |
| Dwarf colony (Barrens) | steel ingot 45 (1.5 x), at most 5 a day; bronze 6, bloom iron 8, wrought iron 9; bronze and iron weapons and shields at 1.5 x value; emerald 50, ruby 60, diamond 100 | food 110%; gold, silver, gems 110%; trinkets 100%; metal 80%; lumber 50% (more than anyone else, still not much); else 50% | after the first trade it gives the direction and distance of the nearest city (doc) |
| Dwarf city (Deadlands, about 1 in 120 cells) | at 3 x make cost: bronze cannon 420, iron cannon 384, musket 102, steel plate 564, steel sallet 102, steel heater shield 282, wrought iron mail 120, steel sword 288; gold 40, gems at value, gunpowder (10 charges) 48, lead shot (10) 12, cannonballs 30; HQ steel ingot 90 (1.5 x), at most 2 a day (the doc's richer-far-out rule, still rare) | as the colony | 1 cannon and 3 muskets a day; its own Dwarf cannons are not for sale |
| Reparations (either faction) | 2000 vp plus 100 per Dwarf killed, in gold, silver, gems, trinkets or food |  | a migrated group rebuilds for 10 days (doc, suggested), then raids with a band of 6 every 3 days until paid |

**How these were set:** a Gold Heirloom (960) and a Copper Token do not buy one Elf sword (1500), and a Dwarf city cannon (420) is about two days of a tier 3 mineshaft's gold at Fair; both keep the doc's "very expensive" and "about three times".

### The world

- The map is **endless** in practice. It is procedurally generated as the players explore, out to a world edge 100 km from the start, a nine-hour run that no game will reach. An advanced AI system (Fable) will be used to help design procedural generation that fits the game.
- **Fog of war:** unexplored land is black, and land that has been explored but is not currently seen is greyed out.
- **Cells:** the world is laid out as a network first and filled in afterwards. It is divided into **cells**, like a slightly uneven honeycomb. Near the start, each cell is roughly 150 to 200 m across (about 50 to 67 seconds of running at a warrior's base speed of 3 m/s, see "Warriors"), and cells get bigger farther out. Every cell can be worked out from the world seed and its own position alone, so the world can be generated in any order and comes out the same on every computer.
- **Cell sizes:** the first two rings of cells around the start basin are 150 to 200 m across. Each ring after that is about 10 to 30% larger than the one before, until cells are about 2.5 times the starting size (about 375 to 500 m across). From there on, cells stay around that size, give or take 30%. The Barrens begin where cells reach this full size.
- **Scale:** with cells growing by about 20% per ring on average, they reach full size about 7 rings out, so the Barrens begin roughly 1.6 km from the start: about a 10-minute run at a warrior's base speed.
- **What bigger cells mean:** barrier edges get farther apart the deeper the players go, so deep land has much longer open frontiers to hold. Together with deep land being more broken, the deep cells are big, with rough insides (mesas, ravines and the rare plateau) and perimeters far too long to wall. That is why deep outposts are forts, not farms, and why a rare plateau is so valuable.
- **Barriers:** every edge between two cells may become a barrier. From the seed, each edge becomes one of these:

| **Cell edge** | **What it does** |
|---|---|
| Nothing | Open ground. |
| Low hills | Walkable. |
| Ridge or mountain range | Blocks walking. Can be tunnelled through. |
| Cliff line | Blocks walking up; a drop going down. |
| Ravine | Blocks walking. |
| River | Blocks walking, except at fords. |
| Marsh | Slows movement. |

- **Gaps:** each barrier edge also gets 0 to 2 gaps: a pass, a ford or a break in a cliff. These are the passes players will fight over.
- **No natural fortresses:** every cell always has at least two edges that are open or have a gap. Deeper bands have more barriers and fewer gaps, but never break this rule. A safe enclosure always has to be finished by the players themselves.
- **Inside a cell,** the land is shaped in detail: terraces, boulders, streams, soil depth, grass and trees. The cell's type, set by its depth and the seed, decides its look: meadow, woodland, rocky scrub, badlands or dead land.
- **Natural homes:** lairs sit in caves at the foot of barrier edges, villages fill cells whose grandeur is set by their depth, vein iron lies inside the rock of ridges, and sulphur is found in volcanic cells from the Deadlands outwards, and in small amounts at rare hot springs in the Barrens.
- **Defensible terrain:** expanding outward, players are likely, but never guaranteed, to find terrain that helps defence, such as a thick mountain range with a pass through it. There will always be other areas with large open stretches. The cells and barriers give this rhythm on purpose. Example near the start: a warrior runs 30 seconds (about 90 m) from the main base and finds a mountain range; the next mountain range, ravine, cliff or deep river is another 50 to 67 seconds of running beyond it, and the valley between the two may be a good place to build.
- **Depth:** "deeper" means farther from the start basin, counted in rings of cells. The deeper the land, the greater the risks and the rewards: richer resources, more potentially hostile creatures and tribes, and larger, grander neutral villages with better trades. The land also looks more barren, less habitable and more hostile the deeper it is.
- **Broken land:** deep land is more broken, with more ravines, mesas and cliffs. It is easier to defend and harder to farm, so deep outposts are forts supplied from the Heartland, not farms. Flat plateaus still turn up now and then deeper out, and they are valuable spots because they are rare.

**Depth bands.** Depth is split into five bands. Run times are for a warrior at base speed, starting from the main base:

| **Band** | **Name** | **What it is like** |
|---|---|---|
| 0 | Heartland | The start basin. Flat, grassy, deep soil. Only softwood trees, plus hazel bushes for hardwood sticks. Copper and tin, streams, and likely bogs with bog iron. Few barriers and no hostile territory. The only place Halfling villages are found; Runkin camps are rare. |
| 1 | Fringe | From the edge of the start basin until cells pass 1.5 times the starting size (about a 5-minute run). Normal barrier odds. Grass still good. A mix of softwood and small hardwood trees. Iron rock, stone outcrops and clay. The first territorial creatures and lairs. Runkin camps are most common here. |
| 2 | Deepwoods | The one Elf kingdom lies somewhere in this band. From where cells pass 1.5 times the starting size (about a 5-minute run) until they reach full size. Grass thinning. Forests of large hardwood trees, vein iron inside ridges, more tribes and villages (Runkin camps are uncommon). Mesas and ravines more common. |
| 3 | Barrens | From where cells reach full size (about a 10-minute run, see "Cell sizes") to 3 rings farther out. Barren patches and little grass. Dead trees and twisted thornwood, richer gold and gem deposits for mineshafts, large villages, small Dwarf colonies, caves, rare hot springs with a little sulphur. |
| 4 and beyond | Deadlands | From 3 rings into the full-size cells (about a 16-minute run) outwards, forever. Dead land, volcanic ground with sulphur, mana crystal nodes, the grandest villages, rare great Dwarf cities and the worst creatures. |

- **Start basin:** all players share one start basin at about sea level (the height reference for digging, see "Terrain"). It is sized by the number of players: about one cell for 1 or 2 players, up to three cells for 8. Inside it, barriers are less likely and there is no hostile territory. Its outer edges follow the normal barrier odds, so the group shares a few natural passes to defend together.
- **Each player's pocket:** every player gets their own roughly flat, grassy pocket of the basin, with enough room to build their own town and a guaranteed set of resources within about 30 seconds: a stand of softwood, hazel bushes, copper ore and tin ore outcrops (the two ores needed to make bronze), stone, a water source, and very likely a bog with bog iron or an iron rock deposit. Each player also starts with enough food to feed all five starting units (the 4 workers and the warrior) for **10 days**. The foods and the resource amounts are in tables 6 and 9.
- **Iron ores:** bog iron is only found in bogs. Iron rock is found as surface rock, or in mineshafts of the right depth. Vein iron ore lies inside the rock of ridges and mountains, so mountains are both a wall and a mine, and tunnelling through one can expose ore; it also comes from mineshafts of the right depth.
- **Trees:** in the Heartland only softwood trees grow, and hardwood sticks can be gathered from a hardwood bush, the **hazel bush**. The Fringe has a mix of softwood and small hardwood trees. The Deepwoods have large hardwood trees. It is named after the real hazel, a hardwood shrub that is traditionally cut for straight sticks and rods.
- **Shaping the land:** workers can clear obstacles, dig trenches and moats, build the land up, and given enough time tunnel through a cliff wall or a mountain. Rivers can be dug and redirected. See "Terrain".
- **Grassland and the heartland:** grassland becomes thinner the farther it is from the start basin, until the land is eventually barren. Agriculture, and especially grazing herds, therefore has to be centred in the heartland. Some vegetable farms can still work in poorer land.
- **Regrowth:** fish breed, so fishing spots refill over time (see "Fish"). Felled trees drop seeds around them. Seeds left on the ground grow into saplings; workers can also pick them up and plant them. The smallest softwood tree takes about an hour to grow to full size, and other trees take much longer. Hazel bushes grow back from the stump after they are cut. All other resources are used up for good.
- **Exploration rewards:** richer resources the farther out players go, such as more gold and the ores for high-quality steel. These stay rare even far out; the world is never brimming with metals. Trading with the peoples found along the way is the other reward. There are no blueprints or magic sites to find.

#### Table 5: Resource nodes per band

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 12 weights set the load (5 lumber, 5 stone or ore, 10 sticks, 10 fish, 10 meat per trip); times are for hardwood tools and divide by the table 2c multiplier.

| **Node** | **Band** | **Yield per node** | **Per load** | **Time per load** | **Gatherers** | **Tool needed** | **Regrowth** |
|---|---|---|---|---|---|---|---|
| Softwood tree (pine, spruce, small softwood) | Heartland, Fringe | 20 lumber | 5 | 15 s | 1 (doc) | hardwood | 60 min seed to full (doc); 2 seeds drop per felled tree (s) |
| Hazel bush | Heartland | 10 sticks | 10 | 10 s | 1 | hardwood | 2 days from the stump (s) |
| Small hardwood (birch, hornbeam) | Fringe | 15 hardwood lumber | 5 | 20 s | 1 | flint | 3 hours (s) |
| Large hardwood (oak, beech) | Deepwoods | 40 hardwood lumber | 5 | 20 s | 2 | copper | 6 hours (s) |
| Dead trees, thornwood | Barrens, Deadlands | nothing: dead and twisted, no lumber (Jade); cover and lair sites only |  |  |  |  | none |
| Herbs / wild flax | Heartland, Fringe; rare deeper | 10 / 10 | 10 | 10 s | 1 | hardwood | 5 days (s) |
| Loose stone / flint scatter | Heartland | 40 stone / 20 flint | 5 / 10 | 10 s | 2 | hardwood | none (s) |
| Stone outcrop | Heartland (a few), Fringe | 200 stone | 5 | 15 s | 2 | flint | none (s) |
| Copper outcrop / tin outcrop | Heartland | 60 / 30 ore | 5 | 20 s | 2 | flint | none (s) |
| Coal, surface seam | Fringe | 60 | 5 | 15 s | 2 | copper | none (s) |
| Bog iron patch | Heartland bogs (giant frog guards it, roster) | 40 | 5 | 20 s | 2 | bronze | none (s) |
| Iron rock | Fringe | 80 | 5 | 25 s | 2 | bronze | none (s) |
| Vein iron seam, inside a ridge; exposed by a tunnel | Deepwoods and deeper | 150 | 5 | 30 s | 2 | bloom iron | none (s) |
| Clay bank | Fringe riverbanks and wetlands | 100 | 5 | 15 s | 2 | hardwood | none (s) |
| Sand | riverbeds and beaches, any band | 100 | 5 | 10 s | 2 | hardwood | none (s) |
| Marble rock | Fringe (rare, about 1 rock in 6 cells), common from the Deepwoods | 80 | 2 | 30 s | 2 | bronze | none (s) |
| Saltpetre | rare: cave floors in the Fringe and Deepwoods and deeper, about 1 deposit in 3 caves (s) | 30 | 5 | 20 s | 2 | copper | none (s) |
| Lead ore | Deepwoods and deeper, beside silver-grey rock | 40 | 5 | 20 s | 2 | bronze | none (s) |
| Sulphur | Deadlands volcanic ground | 60 | 5 | 20 s | 2 | bronze | none (s) |
| Sulphur at a hot spring | Barrens, rare (Jade): about 1 in 10 cells (s) | 20 (s) | 5 | 20 s | 2 | bronze | none (s) |
| Surface gold / surface gem | Barrens and deeper | 1 to 3 / 1 | 1 | 20 s / 30 s | 1 | bronze | none (s) |
| Mana crystal node | Deadlands | 5 | 1 | 30 s | 1 | bronze | none (s) |
| Fish stretch: trout / salmon / giant catfish | Heartland streams / Fringe streams / Deepwoods pools | 1 per 4 m2 / 1 per 8 m2 / 1 per 8 m2 (doc) | 10 | rod 15 s a fish, net or dock 10 s | 1 per 4 m of bank (s) | rod or net | a pair every 3 / 6 / 9 days (doc) |
| Carcass | where it fell | boar 3 meat, 1 hide (roster); deer 4 meat, 2 hide; hare 1 meat, 1 hide; cow 6 meat, 2 leather; bear 8 meat, 2 hide; others roster 6.1 | 10 | 10 s | 2 | none | none (s) |
| Wild herds per cell | cattle: Heartland, 3 pairs; chickens: Heartland and Fringe, 4 pairs; horses and oxen: Fringe, 2 pairs each; bears: Deepwoods, 1 pair plus cubs (doc) |  |  |  |  |  | pairs breed every 10 days (doc) (s) |

Prospect (20 s with a prospecting hammer, 40 s without): Poor x0.5, Fair x1, Good x1.5, Rich x2.5 on mineshaft output (s). Mineshaft output per miner-day at Fair (s): tier 1, 10 stone and 8 ore (copper, tin, iron rock or coal in a mix set by the seed), 600 loads before it is worked out; tier 2, 10 stone, 12 ore including vein iron, 4 coal, 1 silver or gold every 2 days, 1 gem every 5 days, 2400 loads; tier 3, 10 stone, 16 vein iron, 8 coal, 1 lead ore, 1 gold a day, 1 gem every 2 days, never worked out. Richer farther out but still rare (doc): surface gold and gems come as 2 to 5 in the Deadlands, and mineshaft gold, silver and gem output is x1.5 in the Barrens and x2 in the Deadlands (s).

#### Table 9: Start pocket contents

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Item** | **Per player (s)** |
|---|---|
| Flat grassy pocket | about 60 m across, deep soil, at sea level |
| Softwood stand | 24 trees (480 lumber), 20 to 40 m from the Big House |
| Hazel bushes | 8 (80 sticks, regrowing) |
| Copper outcrops / tin outcrop | 2 of 60 ore / 1 of 30 ore |
| Stone | loose stone 60 and one 200 outcrop |
| Flint scatter / herbs / wild flax | 40 / 20 / 20 |
| Water | one stream stretch of at least 60 m2 (15 trout) or a pond of 40 m2, within 60 m |
| Food | 15 meat, 10 fish, 10 eggs: 100 nutrition, 10 days for the starting five (Jade confirmed) |
| Iron | a bog of 40 bog iron (80% of pockets) or an iron rock of 60 (20%) |
| Wild cattle / chickens | 1 pair / 2 pairs within 90 m, shared with neighbouring pockets |
| Basin size | 1 to 2 players 1 cell (150 to 200 m); 3 to 5 players 2 cells; 6 to 8 players 3 cells (doc); pockets at least 80 m apart |
| Halfling villages | placed when the world is generated, never later (doc); (s): one per basin cell (1 for 1 or 2 players, 2 for 3 to 5, 3 for 6 to 8), each in its own pocket at least 120 m from every player pocket, plus one in every 6 Heartland cells beyond the basin |

**How these were set:** a pocket holds about 25 worker-days of softwood, so the stand lasts to about night 8 with 2 to 3 choppers before regrowth or the Fringe has to carry the load, which is when the player should be looking outward anyway.

### Food, supply and health

- **Food in and out:** the food stock is constantly refilled by farms, hunting, fishing and gathering, and constantly drained by feeding the player's people. Food shortages happen when this goes wrong: poor planning, raids on farms, livestock killed, a fish stretch fished out, rations set too high, or more units than supply allows.
- **Separate foods:** each type of food stays its own resource. No food is "better" than another, except that some feed more than others: each type has a nutrition value. Cooked food has more nutrition than raw (see "Cooking").
- **Eating evenly:** when several kinds of food are in stock, units eat from all of them equally.
- **Keeping a food back:** any food type can easily be opted out of being eaten, for example to save it for another use. Suggested control: right click a food in the resource bar to toggle "Don't eat", shown by a crossed-out icon.
- **Food upkeep:** every unit (and every research facility) has a running food cost that is taken from the food stock automatically.
- **Mechanical units** (cannons, catapults, ballistas and similar) do not eat, so they never drain food. They also never heal by themselves: a worker has to repair them.
- **Starving:** if there is not enough food, units starve. Starving units move more slowly. After three full day-night cycles of starving (about 22 minutes), they start to lose 1% of their maximum health every 15 seconds.
- **Natural healing:** units that are not starving regain 1% of their maximum health every 15 seconds (mechanical units excepted).
- **Rationing:** a Rations button on the utility bar cycles between three settings. **Feed everyone** is the default and the normal way to play. **Troops only** and **Workers only** are for food shortages: only that group is fed, and the other group starves under the normal starving rules until rationing is switched back. Mages count as troops. Research facilities also count as troops: they never starve or take damage, but they stop working while they are not fed.
- **Eating:** a unit can go to a building that holds food and eat, healing a large amount over 10 seconds. Combat interrupts this.
- **Supply:** the number of units a player can have is limited by supply. Supply comes from main base levels and from farms. Later in the game most supply comes from farms. Different farm types and tiers give different amounts.
- **Over the limit:** if farms are destroyed and supply drops below the number of units, no units are lost, but no new units can be made until supply is back.

#### Table 6: Food and supply

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** 2 nutrition per unit per cycle (header rule), so one raw meat feeds two units for a day and one tier 1 farmer feeds six.

| **Food** | **Nutrition** | **Comes from** | **Cooking tier** |
|---|---|---|---|
| Meat / fish / eggs | 4 / 3 / 1 | hunting, fishing, hens | raw (s) |
| Wheat / potatoes / carrots / corn | 2 / 2 / 1 / 2 | farms | raw (s) |
| Roast meat / roast fish | 6 / 5 | 1 meat or fish, 1 fuel per 5 | 1 Campfire (s) |
| Smoked meat / smoked fish | 7 / 6 | as roast | 2 Cook Hut (s) |
| Bread / salted meat / salted fish | 5 / 8 / 7 | 2 wheat / 1 meat / 1 fish, 1 fuel per 5 | 3 Kitchen (s) |
| Stew | 12 | 1 meat, 2 potatoes, 1 carrot | 4 Great Kitchen (s) |
| Pie | 16 | 1 meat, 2 wheat, 1 egg | 5 Grand Kitchen (s) |

Cooking takes 10 / 8 / 6 / 5 / 4 s per item by tier, 1 lumber or coal per 5 items (s). Upkeep per cycle: every unit 2, every research facility 2, a working horse 2, a working ox 3, mechanical units 0 (s). Eating at a building heals 50% of maximum health over 10 s and costs 2 nutrition (s). Farm yield per farmer-day at tier 1 (x1.5 at tier 2, x2 at tier 3): wheat 6, corn 6, flax 6, potatoes 8, carrots 8, herbs 4; a new field gives nothing for its first 2 days; crop fields yield half outside the Heartland and nothing in the Barrens or Deadlands, vegetable farms and herb beds yield in full anywhere with soil (s). Livestock: a hen lays 1 egg a day and gives 1 meat and 2 feathers; a cow gives 6 meat and 2 leather; tamed pairs breed every 10 days (doc) and the young are adult after 2 days (doc); slaughter takes 10 s at the farm (s). Grazing need: cattle, horses and oxen 20 m2 of grass within 30 m of their farm each, chickens 2 m2; short of grass they eat 2 (cattle, horse, ox) or 1 (chicken) nutrition a day from crops (s). Supply is in table 4 (main base 8 to 50, farms 1 to 8). Starting stock: 15 meat, 10 fish, 10 eggs (100 nutrition, 10 days for 4 workers and 1 warrior; Jade confirmed), plus 40 softwood lumber, 20 stone, 10 flint, 20 sticks (s). The tier 1 foods are my pick (s). Game (s): hare 20 HP, 6 m/s, runs; deer 80 HP, 7 m/s, runs; boar fights (roster 6.1).

### Open questions

- More tribe and village peoples (the Halflings and Runkin are the first), and which ones can be traded with.

## Gameplay Mechanics

### Controls

The game is played with mouse and keyboard from a top-down, angled camera. The whole scheme rests on six rules that apply everywhere, so a player who learns them once can control any unit or building:

- **Left click selects.** Left click (or a left-drag box) chooses what the player is controlling. It never issues an order on its own, except to confirm a command the player has already chosen.
- **Right click acts.** Right click issues the "smart" order that fits whatever is under the cursor: move to ground, attack an enemy, gather a resource, enter a building, and so on.
- **One key, one command.** Every button on the HUD has a single-key hotkey. Unit commands use letters named after the command (A for Attack, P for Patrol); building menus use a fixed grid of keys that matches the button layout on screen.
- **Shift adds.** Holding Shift adds to whatever already exists: units to a selection, orders to a unit's queue, buildings to a worker's build list, rally points to a building.
- **Esc (or right click) backs out.** Any pending targeting cursor, ghost building or sub-menu is cancelled with Esc or a right click, and nothing is spent or ordered.
- **Everything can be clicked.** Every command and every screen action can be done with the mouse alone, by clicking a button on the HUD. Hotkeys and modifier keys are faster ways of doing the same things, never the only way. A mouse-only player can play the whole game; a player who learns the hotkeys can simply act faster. The one exception is the keyboard shortcuts for control groups and camera locations, which are pure speed tools (and even those have mouse versions).

Specific numbers in this section (pixel sizes, timings, refunds, carry amounts) are starting values to be tuned in playtesting.

#### Screen layout and mouse zones

The screen is split into two zones, and almost every control rule below depends on which zone the cursor is in.

- **Game view:** the 3D world. All selecting, ordering and building placement happens here.
- **HUD:** every panel drawn over the game view. The HUD panels are:
  - Minimap (bottom left): the whole explored map, with the current camera view drawn as an outlined box.
  - Selection panel (bottom centre): portraits of the selected units, or detailed stats when only one thing is selected.
  - Command card (bottom right): a 3-row by 5-column grid of buttons for the selected units (see "Command card and grid hotkeys").
  - Resource bar (top right): stockpiled resources, expandable to show every resource type (see "Resources" below).
  - Clock (top centre): the current day or night, time remaining, and the night count.
  - Allies and Send resources buttons (next to the resource bar): the multiplayer tools (see "Allies panel").
  - Message panel (left side, above the minimap): what the player's units say, game alerts such as "Night is falling", and chat between players (see "Unit speech and the message panel").
  - Utility bar (a slim row of buttons along the top edge of the minimap): Idle Gatherer, Select Army, Town Hall, Follow, Queue Mode, Auto-Equip (F4, suggested), Rations (F9, suggested), Everyone Home (J, suggested), Reset Zoom, four Camera Location buttons, and Menu. Each button does the same as its hotkey (see "Playing with the mouse only").

The HUD is solid: a click on any HUD panel, including its transparent padding, is handled by the HUD and never passes through to the world behind it. Panels have a defined rectangle, and that rectangle (not the visible artwork) is what counts.

Every HUD button shows its hotkey in a corner and in its tooltip, so mouse players learn the hotkeys naturally over time.

#### Selecting units and buildings

**Click vs. drag.** When the left button goes down in the game view, the game waits to see what the mouse does. If the button is released after the cursor has moved less than 4 pixels, it is a click. If the cursor moves 4 pixels or more while held, it becomes a drag and a selection box appears.

**Single click.** Clicking a unit or building selects it and replaces the current selection. Clicks use a generous hit area around each model (slightly larger than the model itself) so small units are easy to grab. When models overlap, the one drawn nearest the camera wins. Clicking empty ground does nothing and keeps the current selection; Esc or F3 deselects everything (see quick reference).

**Drag box.** The box is drawn from the point where the drag started to the cursor, as a thin outline with a faint fill. Every unit that would be selected is highlighted live while the box is being dragged, so the player can see the result before letting go. A unit counts as inside the box if any part of its hit area is inside.

**The drag box never covers the HUD.** This is a hard requirement:

- A drag can only start in the game view. Pressing the left button on a HUD panel never starts a box.
- If the cursor moves onto the HUD during a drag, the box keeps growing but its edges are clamped to the edge of the game view. The box stops at the HUD's border as if it were a wall, while still following the cursor along that border.
- Releasing the button over the HUD completes the selection using the clamped box. It does not click the HUD button under the cursor.
- The box ignores units hidden behind HUD panels, even if the clamped rectangle would visually reach them.
- Edge panning is switched off for the duration of a drag so the box does not run away from the player. Arrow keys still pan during a drag, and the corner where the drag started stays pinned to the same spot in the world.

**What a drag box picks up (priority rules).** A box can contain a mix of things, so the game filters it in this order:

- If the box contains any of the player's own units, it selects only those units and ignores buildings, other players' units, monsters and resources.
- If it contains no units but some of the player's own buildings, it selects those buildings.
- Otherwise it selects a single thing to inspect (an ally's unit, a monster, an animal, a resource node), choosing the one closest to where the drag started. Things the player does not own can be inspected but never ordered.

**Selecting all of one type.** Double-clicking a unit, or Ctrl + left click on it, selects every unit of that same type that the player owns and that is currently visible in the game view. The same works for buildings.

**Modifier keys for selection:**

| **Input** | **Result** |
|---|---|
| Shift + left click on a unit | Adds it to the selection, or removes it if it was already selected. |
| Shift + drag | Adds everything in the box to the current selection. |
| Ctrl + left click (or double click) | Selects all units of that type on screen. |
| Ctrl + Shift + left click | Adds all units of that type on screen to the selection, or removes them if that type is already selected. |
| Esc | Cancels any pending order or menu first; pressed again with nothing pending, clears the selection. |

**Selection panel.** When several things are selected, the selection panel shows a portrait for each, grouped by type, with a small health bar under each portrait. Portraits are ordered by type in a fixed order, so the same army always looks the same. If there are more portraits than fit, the panel shows pages with small page tabs. Clicking in the panel:

- Left click a portrait: select only that unit.
- Shift + left click a portrait: remove that unit from the selection.
- Ctrl + left click a portrait: select only the units of that type.
- Ctrl + Shift + left click a portrait: remove all units of that type.
- Double-click a portrait: centre the camera on that unit.
- Right click a portrait: remove that unit from the selection (mouse-only version of Shift + click).

**Subgroups and Tab.** A mixed selection is split into subgroups by unit type. Each subgroup has a small tab above its portraits showing the unit type and count. Clicking a tab makes that subgroup active, double-clicking it keeps only that type selected, and right clicking it removes that type from the selection. One subgroup is "active" and is shown with a brighter border in the panel; the command card shows the buttons of the active subgroup. Tab moves to the next subgroup and Shift + Tab to the previous one. Pressing a hotkey or clicking a command card button sends the order to every selected unit that can carry it out, not just the active subgroup. Units that cannot carry it out ignore it. For example, with gatherers and fighters selected, Attack goes to both, but Build only to the gatherers.

**No selection cap.** There is no fixed limit on how many units can be selected at once.

#### Control groups and camera hotkeys

Control groups let the player save a selection to a number key and get it back instantly. There are ten groups, on keys 1 to 9 and 0. A group can hold units, buildings or a mix.

**The group key.** Saving a group uses the **group key**: the key directly left of 1, under Esc (the ` / ~ key on most keyboards). The game reads it by its physical position, so it is the same key on every keyboard layout. Browsers never use this key for anything, so control groups work the same in any browser, in a window or full screen, on Windows, Mac and Linux. The common Ctrl + number layout is not used by default because browsers take Ctrl + 1 to 8 for switching tabs and do not let a web page block that.

| **Input** | **Result** |
|---|---|
| Group key + number | Hold the group key and press a number: saves the current selection to that group, replacing whatever the group held before. |
| Shift + number | Adds the current selection to that group without removing anything already in it. |
| Group key + Shift + number | Saves the selection to that group and removes those units from every other group (a "steal"). |
| Number | Selects that group. |
| Number twice, quickly (within 0.3 s) | Selects the group and centres the camera on it. |

**Group tabs (mouse).** Each group shows its number and unit count in a row of small tabs above the selection panel, with an empty tab for each unused number. Left click a tab selects the group and double-click centres on it. Right click a tab saves the current selection to it, and Shift + right click adds to it. So a player can manage groups entirely with the mouse if they want to.

**Optional Ctrl layout.** In settings, players can switch the group key to Ctrl (Ctrl + number to save). This option can only be turned on while the game is full screen in a browser that lets a page claim the keyboard (currently Chrome and Edge). If the player leaves full screen, the game switches back to the group key and says so on screen.

Dead units drop out of their groups automatically. When a group of identical buildings is told to train or produce something, the order goes to whichever building in the group has the shortest queue, so work is spread evenly across them.

**Camera locations.** Group key + F5, F6, F7 or F8 saves the current camera position, the same way the group key saves a unit group. Pressing F5 to F8 jumps back to it instantly. These are meant for spots the player keeps returning to: the town centre, a fortified chokepoint, a far-off mining camp.

**Other camera and selection keys:**

- Backspace: centre the camera on the player's town hall. Pressing again cycles to the next town hall if the player has more than one.
- Space: jump to the most recent urgent message (for example, a building under attack, a unit that is stuck, or the night warning at dusk). Pressing again steps back through the last 8.
- F1: select an idle gatherer and centre on it; pressing again cycles to the next. Shift + F1 selects all idle gatherers at once.
- F2: select every combat unit the player owns (gatherers excluded).
- F3: clear the selection.
- L: toggle "follow" mode, where the camera stays locked on the selected unit until the player pans or presses L again.

#### Unit orders

**Smart order (right click).** Right click picks the obvious order for whatever is under the cursor. The order goes to every selected unit that can carry it out.

| **Right click on** | **Selected units will** |
|---|---|
| Open ground | Move there, ignoring enemies on the way (they do not stop to fight). |
| Enemy unit, monster or hostile building | Attack that specific target, chasing it until it dies, the player gives a new order, or it can no longer be seen. |
| Friendly or allied unit | Follow it, staying close and matching its movement. |
| Neutral village leader or trading building | Walk to it and open the trade menu (see "Neutral villages and trade"). |
| Other neutral unit or building | Move next to it. A right click never attacks anything neutral. |
| Resource node (gatherers) | Start gathering from it (see "Gathering resources"). |
| Unfinished friendly building (gatherers) | Go and continue building it. |
| Drop-off building while carrying resources (gatherers) | Drop off what they are carrying, then go back to the last node they gathered from. |
| The minimap | The same as a right click on that point of the map. |

**Command hotkeys.** Unit commands use letter keys named after the command, and the keys are the same for every unit that can move:

| **Key** | **Command** | **Exact behaviour** |
|---|---|---|
| A | Attack | Puts the cursor into targeting mode. Left click on an enemy attacks that target only. Left click on a neutral village's people or buildings does not attack straight away: a pop-up asks the player to confirm declaring war on that village, and the attack only starts once confirmed (see "Neutral villages and trade"). Left click on ground is an attack-move: the units walk toward the point and stop to fight any hostile thing that comes within their sight range on the way, then carry on to the point once it is dead or gone. |
| S | Stop | Cancels every queued order immediately. Units stand still but will still fight back against hostiles that come close, and will chase them a short distance (the leash, see below) before returning. |
| H | Hold Position | Cancels every queued order. Units never move for any reason, not even to chase. Ranged units shoot anything that comes in range; melee units hit anything that comes adjacent. Used for blocking a chokepoint or a gap in a wall. |
| P | Patrol | Left click a point. Units walk back and forth between where they were standing and that point, forever. Patrolling units behave like attack-moving units: they stop to fight anything hostile they see, chase it within the leash, then return to the nearest point on their patrol route and continue. |
| M | Move | Puts the cursor into targeting mode. Left click on ground moves there exactly like a right click. Left click on a unit follows it. Used when a right click would do something else, for example to walk over a resource node without gathering it. |

**Leash.** When a unit that is not on Hold Position auto-targets a hostile (on Stop, idle, attack-move or patrol), it will chase that target up to a set distance (the leash, a tunable value per unit type) from where the chase started. If the target gets beyond the leash, the unit gives up and goes back to what it was doing. An idle unit that was attacked returns to its original spot after the fight.

**Target choice.** Units that auto-target (attack-move, patrol, idle, stop) pick targets in this order: hostiles that are attacking them or can fight back; then other hostiles that can fight back; then harmless targets such as walls and passive creatures. Within the same tier, the closest wins. This stops an attack-moving army from wasting its time on a wall while monsters are hitting it.

**Targeting mode.** After pressing A, P or M (or any ability that needs a target), the cursor changes to a reticle that is coloured by the command (red for Attack, yellow for Patrol, green for Move). The next left click in the game view or on the minimap confirms it. Right click or Esc cancels with no order given. Clicking a HUD panel other than the minimap also cancels. Holding the hotkey down and clicking repeatedly gives the same order to each click, so it can be spammed quickly.

**Order feedback.** Every order the game accepts plays a short marker at the target point: a green ring for move, a red ring for attack, a yellow ring for patrol, and the outline of the target for a unit or resource. Selected units also play a short voice or sound cue. An order that cannot be carried out (no path, nothing selected can do that) plays an error sound and a short message at the top centre instead.

**Group movement.** When a group is told to move to one point, the units keep roughly the shape they had and spread out around the target point rather than all trying to stand on the same spot. Units in a group travel at the speed of the slowest unit in it when they start close together, so they arrive together.

#### Command card and hotkeys

The command card is a grid of 15 buttons in 3 rows of 5 showing everything the selection can do. Each button shows its hotkey in the corner. Outside the build menus, hotkeys are letters named after the command:

- Every unit that can move: A Attack, S Stop, H Hold Position, P Patrol, M Move. These buttons are always in the same five places on the top row.
- Gatherers also have: G Gather, C Return Cargo, R Repair (buildings and mechanical units), D Dig, T Prospect, B Build Basic Structures, V Build Advanced Structures.
- Warriors also have N Hunt (suggested letter): click an animal to hunt it (see "Semi-automation").
- E Enter: click a building to go inside it. Workers can shelter in farms, fishing docks and main bases. Ranged warriors and mages can garrison towers and the parapets of a level 3+ main base and fight from there. A building with units inside shows a U Unload All button, and clicking a unit's portrait in the building's panel lets just that unit out.
- **Double-tap for auto-target:** press any targeted command twice (or click its button twice) and the unit picks the target itself instead of waiting for a click. This works for every targeted command (see "Semi-automation").
- Buildings: what they train or research gets a letter taken from its name where possible (that letter is underlined on the button), plus R Set Rally Point and, while under construction, X Cancel. Two buttons on the same card never share a letter.
- Forge-type buildings (the ones that make tools, weapons and armour) also have a K Craft button that opens a crafting menu, and an F Refurbish button (see "Equipment").
- Units that can carry equipment have Q Equip Best and I Equipment buttons (see "Equipment").
- A button keeps the same position even when it is unavailable, so the layout never shifts. Unavailable buttons are greyed out; their tooltip says why (not enough resources, a missing building, a technology not yet researched).
- Hovering any button shows a tooltip with its name, hotkey, cost in each resource, build time and any requirements.
- All hotkeys can be rebound in the settings menu. Rebinding changes the key shown on each button.

**Build and crafting menus use grid hotkeys.** Creating buildings and crafting equipment are the two places where hotkeys follow the grid instead of letters. When B (Basic) or V (Advanced) opens a build menu, or K opens a forge-type building's crafting menu, the command card is replaced by up to 15 items, and each one's hotkey is the key in the same position on the left side of the keyboard:

| Q | W | E | R | T |
|---|---|---|---|---|
| A | S | D | F | G |
| Z | X | C | V | B |

So "B then Q" means "open Basic Structures, then pick the building in the top-left slot". The player does not have to learn a letter for each building, only where it sits. Inside a build menu, the grid keys only pick buildings (they do not issue unit commands), and Esc returns to the main card. Crafting menus work the same way: "K then Q" crafts the item in the top-left slot. The bottom-right slot (B) is always Back, so the player can never lose track of how to get out. Buildings are assigned to slots as the building list for this blueprint is written; basic buildings (homes, storage, walls, simple workshops) go in the Basic menu and buildings that need rare resources or technology go in the Advanced menu.

#### Building placement

Any unit that is able to build does so by choosing a building from its command card (by click or hotkey). The cursor then carries a **ghost** of the building: a see-through copy of the model at full size, which follows the cursor and snaps to the building grid.

- The ghost's footprint is drawn on the ground as a grid of tiles. Each tile is green if it can be built on and red if it is blocked (by terrain that is too steep, water, another building, a unit that will not move, a resource node, or unexplored map).
- A building can only be placed when every tile is green. Left click on a red ghost plays an error sound and keeps the ghost on the cursor.
- Things that matter to placement are shown while the ghost is out: for example the range of a defensive tower, the reach of a drop-off building, or the area a farm covers.
- If the player cannot afford the building, the ghost still appears (so they can plan), but placing it gives a "Not enough [resource]" message and nothing is ordered.
- Left click on a valid spot confirms. The ghost leaves a faint marker on the ground and the builder walks there. The cost is taken from the stockpile only when the builder arrives and construction actually begins. If the spot has become blocked by then, the order is cancelled, nothing is spent, and an alert says so.
- Shift + left click places the building and keeps the ghost on the cursor so the player can place another of the same building. Every building placed this way goes into the builder's queue in order (see "Queuing orders with Shift"). Releasing Shift and clicking again places the last one and ends placement.
- Right click or Esc removes the ghost without placing anything.
- Planned but not yet started buildings show as faint ghosts on the ground, visible only to the player (and to allies in multiplayer), until the builder reaches them.
- Walls and other line-based buildings can be dragged: hold left click at one end and drag to the other, and a straight line of segments is previewed and placed together.

A building under construction is a real object from the moment it is started. It can be attacked, which matters because a building left unfinished at dusk can be destroyed at night. If the builder is ordered away or killed, construction pauses, and any gatherer can be right-clicked onto it to continue. Cancelling an unfinished building refunds 75% of its cost.

#### Gathering resources

Only units with the gatherer role can collect resources. A gatherer that is told to gather runs the following loop by itself until it is given another order or nothing is left to collect:

- Walk to the resource node.
- Work the node for that resource's gather time (for example, chopping a tree or mining a rock), with a matching animation.
- Pick up one load: as much of the resource as the gatherer can carry, up to the 25 lb limit for raw materials (see "Inventory and carrying weight"). The load is shown as an item in the gatherer's hands or on its back.
- Walk to the nearest drop-off building that accepts that resource.
- Drop the load. It is added to the player's stockpile at that moment, not before.
- Walk back to the same node and repeat.

**Starting to gather:** right click a node, or press G (Gather) and left click a node.

**Running out:** when a node is used up, the gatherer automatically moves to the closest node of the same resource within a short search radius. If there is none, it returns its last load to storage and goes idle, and an idle gatherer alert plays.

**Return Cargo (C):** sends a gatherer that is carrying something straight to storage, then back to its node.

**Rallying new gatherers:** when a building that trains gatherers has its rally point on a resource node, each new gatherer starts gathering from it the moment it appears.

**Node crowding:** each node has a set number of gatherers that can work it at once (for example, one per tree, two per rock face). Extra gatherers sent to a full node work the closest free node of the same resource instead, so players do not have to place each gatherer by hand. Hovering a node shows how much is left and how many gatherers are on it.

**What is gathered, and what is made.** Raw resources from the resource list are gathered directly from nodes in the world: softwood and hardwood lumber (from different tree types), hardwood sticks (from hazel bushes), medicinal herbs, stone, flint, coal, copper ore, tin ore, bog iron, iron rock, vein iron ore and fish. Meat and leather come from hunting: animals are killed with an attack order first, and the carcass then becomes a node that gatherers harvest. Ingots (copper, tin, bronze, pig iron, iron, steel) are never gathered; they are produced by buildings from raw resources. Digging the land also gives resources, depending on what it is made of (see "Digging and building up the land").

**Idle gatherers.** The Idle Gatherer button on the utility bar shows how many gatherers are idle. Clicking it or pressing F1 selects the next idle gatherer.

#### Semi-automation

Like Equip Best, these let units pick sensible targets on their own, while the player's own orders always win. They use one rule (double-tap a targeted command) and one dusk button, rather than new buttons for each job.

- **Fishing:** G Gather on water fishes that stretch like any other node. Workers assigned to a fishing dock fish the nearest stretch and move to another once it falls to half the fish it can hold, so no stretch is ever fished out (a stretch with no fish left never breeds again).
- **Hunting:** N Hunt sends warriors after an animal. Double-tapped, they take the nearest game animal within their leash, carry what they can to the nearest drop-off and repeat. Bears and territorial creatures are skipped unless ordered directly. Workers in the same selection follow and haul the carcasses. A hunt ends at dusk, and the hunters walk home.
- **Repair:** double-tap R and workers repair every damaged building and mechanical unit nearby, worst first.
- **Everyone Home:** a one-shot button on the utility bar that lights up during dusk. Clicking it sends every unit without a standing job to the nearest shelter. Workers assigned to a farm or fishing dock shelter in their own building without being told. It is not a toggle, so it never pulls units out of a fight later.
- **No repeating forge recipes for now:** a repeat toggle together with Auto-Equip would quietly use up food, so forges only make what is queued.

#### Digging and prospecting

**Dig (D)**: press D or click Dig, then left drag over the ground to mark an area. The depth is set (suggested) with the + and − buttons that appear on the command card, or with the mouse wheel while dragging, and a see-through preview shows the cut, stopping at the dig limit. Left click confirms. Marking a hillside, cliff or mountain face starts a tunnel instead, and the depth then sets how far in it goes. The marked area stays outlined until it is finished, and any worker can be right-clicked onto it to help. See "Digging and building up the land" for what can be dug.

**Prospect (T)**: press T or click Prospect, then left click a spot. The worker walks there, spends a short time prospecting, and the result is shown over the area (see "Mineshafts and prospecting").

#### Queuing orders with Shift

Holding Shift while giving any order adds it to the end of the unit's list of orders instead of replacing what it is doing. There is no limit on how many orders can be queued.

- Any order can be queued: move, attack, attack-move, patrol, hold position, gather, build, return cargo, and unit abilities. Orders of different kinds can be mixed in one queue.
- An order given without Shift clears the whole queue and replaces it.
- Stop (S) and Hold Position (H) without Shift also clear the queue. Shift + H adds a "hold here" at the end, so units walk a route and then hold the last point.
- While Shift is held, the selected units' queues are drawn in the world: a line from each unit through each queued point, with a small icon at each point for the kind of order (move, attack, build, gather). Releasing Shift hides the lines again.
- Shift + Patrol to several points in a row creates a patrol route through all of them, which loops from the last point back to the first.
- A typical gatherer chain: Shift + build a house, Shift + build a second house, Shift + right click a tree. The gatherer builds both, then goes back to chopping wood with no idle time.
- Queued builds keep their place markers on the ground, and their cost is only taken when each one is started.
- If a queued order becomes impossible (its target is dead, its spot is blocked), it is skipped and the unit moves on to the next one.

**Production queues.** Buildings that train units or craft items have their own queue, shown as icons in the selection panel. Each press of a production hotkey adds one item and takes its cost immediately; Shift + the hotkey adds five. Clicking a queued icon cancels it and refunds it in full.

**Rally points.** With a building selected, a right click sets where its new units go (ground, a unit to follow, or a resource node). Shift + right click adds further rally points, so new units follow a whole route. The rally route is drawn while the building is selected.

#### Camera

The camera looks down at the world at a fixed angle and can be panned and zoomed. It cannot be moved past the edge of the generated map.

**Edge panning (mouse).** Moving the cursor to the very edge of the screen pans the camera in that direction. To make sure players never pan by accident while using the HUD:

- The pan zones are only the outermost 4 pixels of the screen on each side (the very edge of the monitor or browser window). They are not the edges of the HUD panels.
- Where a HUD panel touches the screen edge (for example, the minimap at the bottom left), the pan zone along that panel is switched off, except at the 20-pixel corners. So the camera never pans while the cursor is on the minimap, the command card or the selection panel, even when it is at the bottom of the screen.
- Panning starts only after the cursor has stayed in a pan zone for 0.1 seconds, so the cursor briefly brushing the edge does nothing.
- The cursor changes to a directional arrow while in a pan zone, so the player always knows it is panning.
- In the corners, panning is diagonal.
- Edge panning is paused while the player is dragging a selection box, and while any menu or dialogue is open.
- The cursor is kept inside the game window while the game is in focus (see "Browser requirements"), so it can actually reach the edge of the screen.

**Arrow keys.** The arrow keys pan the camera at the same speed as edge panning; two keys together pan diagonally.

**Drag panning.** Holding the middle mouse button and dragging moves the camera as if the player had grabbed the ground.

**Minimap.** Left click on the minimap jumps the camera there; holding left click and dragging slides the camera around. Right click on the minimap gives a smart order to that spot. The minimap also accepts targets for Attack, Move, Patrol and abilities.

**Zoom.** The mouse wheel zooms in and out in smooth steps, centred on the cursor so the player zooms toward what they are pointing at. Page Up and Page Down also zoom. There is a closest and farthest zoom limit; the farthest limit is chosen so that the screen never shows enough area to give a big advantage. The camera keeps the same fixed angle at every zoom level; it never tilts. Zooming in gives a closer look at the models. Pressing Home resets zoom to the default level.

**Settings.** Edge pan speed, arrow key pan speed, and zoom speed each have a slider. Edge panning can be turned off completely.

#### Unit speech and the message panel

Units talk to their player. This is how the game tells the player what their units need, and it gives units personality. It is not used for players talking to each other.

- **Speech bubbles:** when a unit speaks, a short text bubble appears above it for a few seconds.
- **Random remarks:** now and then, a unit makes a remark or an observation about what it is doing or what it sees. Random remarks only appear as speech bubbles; they are never added to the message panel or kept anywhere.
- **Triggered speech:** units speak when something happens to them, for example when they are hungry, under attack, the resource they were gathering has run out, a hand-picked item was taken by someone else, or they cannot carry out an order.
- **Other races talk too.** Units of other races speak in bubbles like the player's units, saying what you would expect from them: when players first find them, when trading, when they are attacked, and as random remarks. Examples are under each race in "Neutral villages and trade".
- **When their speech reaches the message panel:** their random remarks never do. Their important speech (a greeting on first meeting, a warning, a declaration of war, a surrender offer) is added to a player's message panel if the player sees it on screen, or if one of the player's units is close enough that the speaker would be on screen if the camera were centred on that unit, even when the player is looking somewhere else.

**The message panel.** Everything units say, apart from random remarks, also appears in the message panel with the name of the unit that said it, along with game alerts (such as "Night is falling") and messages from other players.

- The panel is semi-transparent until the cursor is over it, so it does not hide the game.
- It can be scrolled up and down, and collapsed entirely to a small button.
- Clicking a message moves the camera to the unit that said it.
- The panel keeps the latest 60 messages. Older messages are deleted, except messages from other players, which are kept.
- Messages from other players are highlighted differently from unit speech and alerts.
- A filter button switches between three views: everything; alerts and player messages only; and player messages only.

**Urgent messages.** Some messages need the player's attention, such as an order blocked by terrain or a lack of resources. For these:

- The minimap is always pinged at the spot where it happened.
- If the panel is collapsed, its button flashes as an alarm.
- If the panel is open, the message is shown in a way that makes it stand out from the rest (for example, a bright background).

**Chat between players.** The same panel is used for players to talk to each other. Player messages appear only in the panel, never as speech bubbles. Press Enter (or click the text box at the bottom of the panel) to type, Enter to send, and Esc to cancel. Game hotkeys are paused while typing.

**Who sees what.** A player only sees speech from their own units, and from units they inherited from an eliminated or departed player. They never see speech from another active player's units, even when that player has shared control of them.

#### Playing with the mouse only

The game must be fully playable without touching the keyboard. Keyboard controls make a player faster and let them do more actions per minute, which is part of the skill ceiling, but they are never required. Every keyboard control in this section has a mouse equivalent:

| **Keyboard control** | **Mouse equivalent** |
|---|---|
| Unit command hotkeys (A, S, H, P, M, G, C, R, D, T, E, U, Q, I) | Click the matching button on the command card. Commands that need a target then work the same way (click a spot or a unit). |
| Build menus (B, V) and grid keys in a build menu | Click Build Basic or Build Advanced on the command card, then click the building. |
| Production hotkeys in buildings | Click the item's button. Each click adds one to the queue. |
| Crafting menu (K, then grid keys) | Click Craft on the building, then click the item. |
| Shift (queue orders, place several buildings, add rally points) | Click the Queue Mode button on the utility bar. While it is lit, every order, building placement and rally point is added to the queue exactly as if Shift were held. Click it again to turn it off. It also turns off by itself when the selection changes. |
| Esc (cancel) | Right click, or click the Cancel button that appears in the bottom-right slot of the command card while targeting or placing a building. |
| Esc / F3 (clear selection) | Click the small "x" in the corner of the selection panel. |
| Tab (next subgroup) | Click the subgroup tab above a group of portraits in the selection panel to make that subgroup active. |
| Shift / Ctrl + click to change the selection | Use the selection panel: click a portrait to keep only that unit, double-click a subgroup tab to keep only that type, right click a portrait to remove that unit, and right click a subgroup tab to remove that type. Double-clicking a unit in the game view selects all of its type on screen. |
| F1 / Shift + F1 (idle gatherers) | Click the Idle Gatherer button (left click: next one; double-click: all of them). |
| F2 (select army) | Click Select Army on the utility bar. |
| Backspace (town hall) | Click Town Hall on the utility bar. |
| Space (latest urgent message) | Click the message in the message panel; the camera jumps to where it happened. |
| Enter (chat with players) | Click the text box at the bottom of the message panel. |
| L (follow unit) | Click Follow on the utility bar. |
| Control group keys | Use the group tabs above the selection panel (left click to select, double-click to centre, right click to save, Shift + right click to add). |
| Camera location keys (F5 to F8) | Use the four Camera Location buttons on the utility bar (left click to jump, right click to save the current view). |
| Arrow keys (pan) | Edge panning, middle-mouse drag, or clicking and dragging on the minimap. |
| Page Up / Page Down / Home (zoom) | Mouse wheel, and Reset Zoom on the utility bar. |
| F10 (menu) | Click Menu on the utility bar. |

#### Browser requirements

Because the game runs in a web browser, some key combinations above are normally taken by the browser itself. The controls must work around this:

- Right click must never open the browser's right click menu over the game.
- Every key the game uses must be blocked from doing its normal browser job while the game has focus: for example F1 (help), F5 (refresh), Backspace, Space (page scroll), Tab (focus change) and the arrow keys (scroll). F11 (full screen) and F12 (developer tools) are left alone.
- Some browser shortcuts cannot be blocked in a normal window: Ctrl + 1 to 8 switch tabs, Ctrl + W closes the tab, Ctrl + T and Ctrl + N open new ones, and Alt + number switches tabs in some browsers on Linux. No default control in the game uses Ctrl or Alt for this reason; control groups use the group key instead (see "Control groups and camera hotkeys").
- Ctrl + F5 and Shift + F5 reload the page in most browsers, so camera locations are saved with the group key + F5 to F8 rather than Ctrl.
- On a Mac, the system treats Ctrl + click as a right click, so on Mac the game uses Cmd + click everywhere this section says Ctrl + click.
- Full screen is optional. In Chrome and Edge, full screen can also claim the keyboard (with the player's permission), which is the only case where the optional Ctrl layout for control groups is allowed.
- In full screen, a quick press of Esc works as in-game Esc; holding Esc down exits full screen. The in-game menu is on F10 so it never depends on Esc.
- The game asks the browser to lock the cursor inside the window while playing, so edge panning works on the side of the screen next to a second monitor. The cursor is released when the player opens the menu.
- Leaving or refreshing the page during a match asks the player to confirm first.

#### Quick reference

| **Input** | **Action** |
|---|---|
| Left click / left drag | Select / box select (box stays inside the game view) |
| Right click | Smart order (move, attack, gather, follow, build) |
| Shift + any order | Add to the order queue |
| A / S / H / P / M | Attack / Stop / Hold Position / Patrol / Move |
| G / C / R (gatherers) | Gather / Return Cargo / Repair |
| N (warriors) | Hunt (suggested letter) |
| Any targeted command twice | The unit picks its own target |
| D / T (workers) | Dig / Prospect |
| E / U | Enter a building (shelter or garrison) / Unload all |
| B / V (gatherers) | Basic Structures / Advanced Structures build menu |
| Q to T, A to G, Z to B (in a build menu) | Pick the building in that grid position (B is Back) |
| R / X (buildings) | Set Rally Point / Cancel construction |
| K / F (forge-type buildings) | Crafting menu (grid keys inside) / Refurbish |
| Q / I (units) | Equip Best / Equipment panel |
| Esc | Cancel order, ghost or menu; then clear selection |
| Tab / Shift + Tab | Next / previous subgroup |
| Double click, Ctrl + click | Select all of that type on screen |
| Group key (left of 1) + number | Save control group |
| Shift + number | Add to control group |
| Group key + Shift + number | Steal into control group |
| Right click / Shift + right click a group tab | Save / add to control group with the mouse |
| Number / number twice | Select group / select and centre camera |
| F1 / Shift + F1 | Next idle gatherer / all idle gatherers |
| F2 | Select all combat units |
| F3 | Clear selection |
| F5 to F8 / group key + F5 to F8 | Jump to / save camera location |
| Backspace | Centre on town hall (cycles) |
| Space | Jump to latest urgent message (cycles through last 8) |
| Enter | Type a message to other players (Enter to send, Esc to cancel) |
| L | Follow selected unit |
| F4 / F9 / J (suggested) | Auto-Equip toggle / Rations / Everyone Home (during dusk) |
| Arrow keys, edge of screen, middle drag | Pan camera |
| Mouse wheel, Page Up / Page Down, Home | Zoom in / out, reset zoom |
| F10 | Game menu |

### Resources

There will be a number of different resources, viewable in an expandable section of the HUD.

So far we have:

Softwood lumber

Hardwood lumber

Medicinal herbs

Stone

Flint

Coal

Leather

Meat

Fish

Copper Ore

Tin Ore

Copper ingot

Tin Ingot

Bronze ingot

Bog iron

Iron rock

Vein iron ore

Pig iron ingot

Iron ingot

Steel ingot

All resources go into one shared pool for each player. Resources are not kept inside buildings, so losing a building never loses resources. Workers deposit what they gather at drop-off buildings, and buildings take what they need straight from the pool.

#### Additional resources

Resources not in the list above. Eggs and feathers come from livestock (see "Animals"); gold and gems are used in trade, directly or made into trinkets (see "Neutral villages and trade" and "Trinkets"). Rows marked "(suggested)" fill gaps in the path to muskets and cannons or give farms and magic something to work with:

| **Resource** | **Where it comes from** | **Why it is needed** |
|---|---|---|
| Eggs | Chickens | Food. |
| Feathers | Chickens | Fletching for arrows and crossbow bolts, bedding, quills for research. |
| Gold | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or made into gold trinkets and Sunhearts (see "Trinkets"); the Deep Mining III fee and the level 10 main base (see tables 2a and 4). |
| Emeralds | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or set into Moonleafs (see "Trinkets"). |
| Rubies | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or set into Sunhearts (see "Trinkets"). |
| Diamonds | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages. |
| Silver | Mostly from mineshafts, often found together with lead ore, as in real life | Silver trinkets and Moonleafs, for trading with villages (see "Trinkets"); the Deep Mining II and III fees (see tables 2a and 4). |
| Marble | Carved from marble rock, which appears in places in the land (see "Terrain") | Grand buildings, such as main base levels 5 and up (see "Main base"); also traded with the Elves. |
| Earth | Digging soil (see "Terrain") | Building the land up: ramps, earth banks and filling holes and ditches. |
| Gravel | Digging gravel (see "Terrain"), or crushing stone at a workshop | Paths, and fill for raising the land (suggested). |
| Hardwood sticks | Gathered from hazel bushes near the start (they grow back after cutting), or made from hardwood lumber at a workshop | Hardwood and flint tools and weapons, so they can be made before large hardwood trees are within reach. |
| Clay (suggested) | Riverbanks and wetlands | Bricks, furnace linings, moulds for casting metal and cannons. |
| Sand (suggested) | Beaches and riverbeds | Glass (lanterns, lenses, potion bottles) and casting moulds. |
| Charcoal (suggested) | Made at a kiln from hardwood | The fuel for smelting until coal takes over, and one of the three gunpowder ingredients. |
| Saltpetre (suggested) | Rare deposits on cave floors in the Fringe and Deepwoods and deeper (table 5), or made over time in a compost or nitre bed | Gunpowder (the largest part of it). |
| Sulphur (suggested) | Near volcanic ground and hot springs, far from spawn | Gunpowder. A good "rare resource that forces expansion" like those described in the Premise. |
| Wheat | Farms | Food, and made into bread at a higher-tier cooking building. |
| Potatoes | Vegetable farms | Food. Some vegetable farms can grow in poorer land where grass is thin. |
| Carrots | Vegetable farms | Food. |
| Corn | Farms | Food. |
| Flax | Farms and wild plants (suggested) | Another way to make rope and boots besides leather, and the fabric in metal armour instead of leather (see "Weapons and armour"). Suggested: bowstrings, cloth, sails, bandages. |
| Hides (suggested) | Hunting wild animals | Raw skins that a tannery turns into leather. (Cattle give leather directly.) |
| Bone (suggested) | Hunting and some monsters | Early tools, arrowheads, glue, and fertiliser for farms. |
| Resin / pitch (suggested) | Softwood trees | Waterproofing, torches, fire arrows, glue. |
| Spider silk | Dropped by giant spiders | Bowstrings and rope, like flax and sinew. Suggested: a silk bowstring gives a bow a little more range. |
| Demon horn | Dropped by red demons and the archfiend | Trinkets and wands. |
| Hexstone (suggested) | Dropped by goblins | A dull green pebble scratched with crude goblin runes that still hums with stolen magic. Used at the Magi Sanctum to research the **Warding** and **Counterspell** spells (suggested), and spells that break curses and hexes (suggested). There is no ward item: mages do this with spells (Jade). |
| Venom | Dropped by vipers, scorpions, centipedes and hornets | Poison arrows (see "Bows and crossbows"). |
| Lead ore (suggested) | Mineral deposits, often near silver-grey rock | Musket balls (shot) for flintlocks; easy to melt and cast. |
| Mana crystal (working name) (suggested) | Rare nodes far from spawn, or dropped by certain magical creatures | Training higher-tier mages and magic research. Spells themselves use the mage's own mana (see "Magic"). |

### Units

There are three kinds of unit: workers, who keep the town running; warriors, who fight and hunt; and mages (see "Magic").

#### Workers

Workers do every non-combat job. A worker's current job decides its animation, what it carries and which command card buttons it shows. Jobs:

- **Gathering:** chopping trees, picking herbs, collecting stone and flint from the surface.
- **Mining:** working ore, coal and stone inside a mineshaft or at an open rock face.
- **Digging:** carving out the land, digging trenches, moats and tunnels, and building the land up (see "Terrain").
- **Prospecting:** checking an area for hidden minerals before a mineshaft is built (see "Mineshafts and prospecting").
- **Farming:** working an assigned farm field. A worker assigned to a farm stays there until reassigned. Suggested: right-clicking a farm with workers assigns them to it, while E Enter only shelters them; assigned workers shelter in their own farm.
- **Fishing:** fishing from shorelines or a fishing dock.
- **Building and repairing** structures, and repairing mechanical units such as cannons and catapults (they do not heal on their own).
- **Crafting:** working inside a production building (forge, lumber mill, kiln and so on). A production building only works while workers are assigned to it, and works faster with more of them up to its limit.
- **Hauling:** carrying meat back from a hunt (within the 25 lb limit for raw materials), and driving carts pulled by horses or oxen for heavier loads.
- **Sheltering:** at night, workers can shelter inside farms, fishing docks and main bases. If the building is destroyed while they are inside, each worker takes damage equal to 10% of its maximum health and is left standing where the building was.

Workers can defend themselves weakly with whatever tool they are holding but are not meant to fight. A worker's **tool tier** decides how fast it works and which resources it can work at all (see "Progression"). Tools are equipment and are handed out the same way as weapons and armour (see "Equipment").

Workers are trained at main bases and at farms.

#### Warriors

Warriors fight and hunt. Every warrior carries a melee weapon, and can keep a backup melee weapon in its inventory, such as a one-handed weapon for a polearm fighter (see "Polearms"). Once a warrior has been trained in ranged combat, it can also carry a ranged weapon, and it switches between them by itself: ranged while the target is far, melee when it gets close. The player can lock a warrior to melee or ranged only.

- **One-handed melee weapons** by tier: hardwood club, flint axe, copper axe and dagger, bronze sword, iron sword and mace, steel sword. They can be paired with a shield (see "Combat").
- **Polearms** (two-handed) by tier: hardwood spear, flint-tipped spear, bronze spear, steel pike. Halberds are polearms too, made in iron or steel (suggested).
- **Ranged weapons** by tier: thrown spear and sling, bow, crossbow (iron), steel crossbow (suggested), and finally the flintlock musket. Bows shoot arrows and crossbows shoot bolts, with better tips at each material tier (see "Bows and crossbows").
- **Armour** by tier: none, leather, bronze scale, iron mail, steel plate.
- **Flax instead of leather:** metal armour (bronze scale, iron mail, steel plate) can use flax as its fabric instead of leather, and the armour comes out exactly the same. Flax can never replace leather in hardened leather armour.
- **Material limits follow real life.** Bronze is heavy for what it gives and softer than good iron and steel, so it cannot be used for everything: there are no bronze longswords (bronze swords are short swords, since long bronze blades bend), and no bronze full plate armour (it would be far too heavy). Bronze armour stops at scale.
- **Speed:** a warrior's base running speed is 3 m/s (a placeholder), so 30 seconds of running covers about 90 m. Heavy loads slow it down (see "Inventory and carrying weight").
- **Shields** (one-handed fighters only) blunt damage from projectile attacks. Shield tiers (suggested): wicker (woven sticks and hide), wood (a basic shield of just wood and leather), bronze, iron kite shield, steel heater shield (with a team-colour field). The best shield in the game blocks **30%** of projectile damage; lower tiers block less (see table 3).
- **Helmets:** leather cap, bronze helmet with cheek guards, iron helm with a nose guard, steel sallet with a visor slit.
- **Hunting:** warriors kill animals for meat and leather. Once an animal dies, its carcass becomes a resource node. The warrior can carry meat back, within its carrying limit (see "Inventory and carrying weight"), or leave the carcass for workers to collect. Some animals run away; some fight back.

Warriors are trained at main bases and at the barracks. Ranged warriors can fight from towers, and from the parapets of a main base of level 3 or higher.

#### Experience and training

- Units gain **experience** in combat and grow stronger as they rank up, so losing a veteran hurts.
- Units can also be **trained** at a training building. Training costs time and food, and the unit stays inside the building and cannot do anything else until it finishes. Training can be cancelled early in an emergency, but the unit gains nothing.
- Training has a **limit**. Out of about five levels, training buildings can raise a unit at most **two levels above its starting level**; everything beyond that comes only from combat experience. For specialist skills (cannon, musket, crossbow, archery), training only makes the unit able to use the weapon at all; getting good with it comes from combat.
- **Specialist skills must be trained before a warrior can use them at all:** riding, archery (bows), crossbows, firing a musket, and crewing a cannon. Crossbow training is much quicker and cheaper than archery training. Suggested training buildings: barracks (archery and crossbows), stables (riding), and gunnery yard (muskets and cannons).

#### Table 1: Player unit stats

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Warriors and workers have 5 ranks (Jade: about five levels) and mages the doc's 6. A training building raises a unit at most two levels above its start (Jade), so training reaches rank 3 (Veteran, Adept Acolyte, Master worker) and everything above comes only from combat experience. Weapon specialisations only make a unit able to use the weapon and give no bonus (Jade).

| **Unit** | **Rank** | **XP to reach** | **Health** | **Damage** | **Attack time** | **Move** | **Armour** | **Sight** | **Leash** | **Reach / min range** |
|---|---|---|---|---|---|---|---|---|---|---|
| Worker | 1 Labourer | training only (s) | 60 | tool (4 hardwood) | 1.5 s | 3.0 | gear only (boots) (s) | 20 m (s) | none; flees 10 m from attackers (s) | 1.2 m (s) |
| Worker | 2 Hand | training (s) | 70 (s) | tool +5% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Worker | 3 Master | training (s) | 80 (s) | tool +10% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Worker | 4 Foreman / 5 Elder | combat XP 400 / 1000, which workers rarely earn (s) | 90 / 100 (s) | tool +15% / +20% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Warrior | 1 Recruit | 0 | 100 | weapon (flint spear 12) | weapon (spear 1.4 s) | 3.0 | gear | 24 m (s) | 20 m idle, 40 m Hunt (s) | one-handed 1.2 m; spear 2.5 / 1.0 m; pike 3.5 / 1.5 m; halberd 2.5 / 0.8 m (s) |
| Warrior | 2 Soldier | 50 (s) | 120 (s) | weapon +5% (s) | weapon | 3.0 | gear | 24 m (s) | same | same |
| Warrior | 3 Veteran | 150 (s) | 140 (s) | weapon +10% (s) | weapon | 3.0 | gear | 24 m (s) | same | same |
| Warrior | 4 Elite | 400 (s) | 160 (s) | weapon +15% (s) | weapon | 3.0 | gear | 26 m (s) | same | same |
| Warrior | 5 Hero | 1000 (s) | 180 (s) | weapon +20% (steel sword 36) (s) | weapon (sword 1.2 s) | 3.0 | gear | 28 m (s) | same | same |
| Mounted warrior | rider's | rider's | rider's; horse 160 (s) | rider's weapon, +0.5 m reach from the saddle (s) | weapon | horse: walk 2, trot 5, gallop 8 (s) | rider's; horse 0 (s) | 30 m (s) | 60 m (s) | melee, or bow with double spread if trained in both (s) |
| Support mage | 1 Novice Acolyte | 0 | 70 (s) | wand tap 3 (s) | 1.5 s (s) | 3.0 | leather at most (s) | 24 m (s) | 15 m (s) | spells, table 13 |
| Support mage | 2 Acolyte | 40 (s) | 80 (s) | spells x1.1 |  | 3.0 |  |  |  |  |
| Support mage | 3 Adept Acolyte | 120 (s) | 90 (s) | x1.2 |  | 3.0 |  |  |  |  |
| Support mage | 4 Mage | 300 (s) | 100 (s) | x1.3 |  | 3.0 |  |  |  |  |
| Support mage | 5 Master Mage | 800 (s) | 110 (s) | x1.4 |  | 3.0 |  |  |  |  |
| Support mage | 6 Grand Magician | 2000 (s) | 120 (s) | x1.5 |  | 3.0 |  |  |  |  |
| Battle mage | 1 to 6 | as support (s) | as support (s) | spells, table 13, same multipliers | 1.0 s cast (s) | 3.0 | leather at most (s) | 24 m (s) | 15 m (s) | spells |

**How these were set:** health steps of 20 per warrior rank put the roster's "veteran about 180" at rank 5 (Hero); the XP ladder is set so that one warrior who takes most of night 0's kills (budget 12, so about 24 XP) reaches Soldier on night 1, and a 30-warrior army averages Hero around night 80 (table 8 budgets, 2 XP per threat). Mage health is 10 below a warrior at every step because they wear no metal.

#### Table 7: Training

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 1 ranks; the food costs are nutrition (header rule).

| **Training** | **Where** | **Cost** | **Time** | **Needs** |
|---|---|---|---|---|
| New worker | Big House or any farm | 20 food | 15 s (s) | free supply (s) |
| New warrior | Big House or Barracks | 30 food, 1 hardwood club | 45 s | free supply (s) |
| New mage (Novice Acolyte) | Magi Sanctum or main base 6+ | 50 food, 1 wand (5 sticks, 1 copper ingot, made at the Sanctum in 20 s) | 60 s | free supply (s) |
| Worker to Hand / to Master | Big House | 20 / 40 food | 60 / 120 s | base 2 / base 5 (s) |
| Warrior to Soldier / to Veteran | Barracks | 30 / 60 food | 60 / 120 s | (s) |
| Mage to Acolyte / to Adept Acolyte | Magi Sanctum | 40 food / 60 food, 2 mana crystals | 60 / 120 s | (s) |
| Mage, Master Mage, Grand Magician (combat ranks) | Magi Sanctum | a rank wand of 2 / 5 / 10 mana crystals; the XP is banked until it is given | 30 s | XP from table 1 (s) |
| Archery | Barracks | 40 food | 120 s | Flint tools (s) |
| Crossbow | Barracks | 15 food | 30 s | Crossbows (s) |
| Riding | Stables | 30 food | 60 s | a tamed horse in the stalls (s) |
| Musket | Gunnery yard | 30 food | 60 s | Muskets (s) |
| Cannon crew | Gunnery yard | 40 food | 90 s | Cannons (s) |

Training stops two levels above the start (Jade): rank 3 (Veteran, Adept Acolyte, Master worker); the ranks above are combat only. Specialist training only lets the unit use the weapon (Jade). One unit trains at a time per building; a Barracks or Sanctum can queue 5 (s).

### Combat

Every attack is either **melee** (the attacker strikes with what it holds, nothing flies) or **ranged**. Each attack has its own predefined range.

#### Melee

Melee fighters use one of two kinds of weapon:

- **One-handed weapons** (clubs, axes, swords, maces and so on), which can be paired with a **shield**.
- **Polearms:** two-handed spears, pikes, halberds and similar. In this blueprint "polearm" means all of these.

**How melee hits land.** Melee damage does not need the weapon model to physically touch the enemy. At the moment of the hit in the attack animation, everything inside the attack's area takes damage:

- **Stabs** (spear and pike thrusts and other stabbing attacks) hit a single target.
- **Slashes, cleaves and every other swing** (anything that is not a stab) hit everything in an arc in front of the attacker, roughly matching the swing of the weapon. Suggested: the main target takes full damage, others in the arc take less, and friendly units are never hurt.

#### Charges

- Cavalry and ox riders deal **100% extra damage** (double damage) when they hit with a charge.
- A hit counts as a charge only after a short, straight run at the mount's full speed.
- A charge **knocks back** enemies smaller than the charging animal by 1 to 2 m on impact; smaller targets are thrown farther. Enemies as big as the mount or bigger are not knocked back.

#### One-handed weapons and shields

- One-handed weapons have to get in close to deal damage, but have no minimum range: they can always hit an enemy right next to them.
- A one-handed fighter can carry a **shield**, which blunts damage from **projectile** ranged attacks. Suggested: a shield reduces projectile damage by a set percentage that depends on its material.

#### Polearms

- Polearms have **reach**: they hit from a short distance away. This is still a melee attack, with no projectile.
- Polearms have a **minimum range**. A close, fast attacker can get inside it and attack the polearm unit without being hit back.
- **Backup weapon:** a polearm unit that also carries a one-handed weapon switches to it when an enemy gets inside its minimum range, and back to the polearm once it has room again. The starting warrior does this with its hardwood club.

When an enemy is inside its minimum range, a polearm unit without a backup weapon does the first of these that it can:

- Attacks any other enemy that is still within its reach.
- If there is nothing it can hit, moves back towards friendly troops close by so it can keep fighting alongside them.
- If there are no friendly troops very close, moves away from groups of enemies.

A polearm unit on Hold Position never moves, so it only does the first of these.

#### Fighting flying enemies

- Polearms can hit **low-flying** enemies.
- One-handed weapons can only hit a **flying melee attacker** while it swoops down to make its attack.
- Ranged attacks can hit flying enemies. Suggested: enemies that fly higher than low-flying ones can only be hit by ranged attacks and magic.

#### Ranged attacks

- **Projectile attacks** send something flying that can be dodged or blocked: arrows, crossbow bolts, sling stones, thrown spears, musket balls, cannonballs, and some spells, such as a fireball.
- **Non-projectile attacks** deal damage at range with nothing flying. Some magic attacks work this way. Some of them still show a visible beam or arc of particles, but that is only for show: they still count as non-projectile.
- Every ranged attack has its own predefined range.

#### How ranged attacks hit (suggested)

Direct collision works well, with a few additions so that it stays fair, fast and the same on every computer:

- **Projectiles really fly.** Every simulation step, a projectile moves along its path (an arc for arrows, sling stones, thrown spears and cannonballs; close to straight for bolts and musket balls) and checks the whole stretch it has just travelled for anything solid. Checking the whole stretch, not only the point where it ends up, stops a fast musket ball from skipping through a thin wall or a small unit between steps.
- **Simple hit shapes.** Everything that can be hit uses one or a few simple boxes rather than its detailed model. This suits the cube art style and keeps the checks cheap. Only things in nearby chunks are checked.
- **Aiming.** The shooter aims at where a moving target will be when the projectile arrives, with a small random spread that is smaller for better weapons and more experienced units. A target that changes direction can make a shot miss.
- **First thing hit.** A projectile stops at the first solid thing on its path (the target, another enemy, a tree, a wall, a building or the ground), and that thing takes the hit.
- **Friendly units.** Projectiles pass through friendly and allied units, so archers can shoot past their own front line.
- **Finding a clear shot.** Before shooting, a unit checks that its own side's walls and buildings are not in the way. Arcing shots such as arrows can go over a wall when the target is far enough away; straight shots such as crossbow bolts and musket balls need a clear line, for example from a tower, a parapet or a gap. A unit without a clear shot moves to find one, unless it is on Hold Position.
- **Non-projectile attacks** can only be cast when the attacker has a clear line of sight to a target in range. Once cast, they hit even if the target moves behind a wall or a tree.
- All of this is part of the game simulation, so it uses whole-number maths and the seeded random number generator, and every computer sees the same hits and misses (see "Technology").

#### Walls, trees and ranged attacks

- Walls, trees and other obstacles block projectiles, and take damage when they do. They only stop non-projectile attacks by blocking the line of sight needed to cast them.
- Each attack has a separate damage value against barriers. An arrow or bolt does a completely negligible amount, even to the weakest barrier. A fireball does substantial damage, with a bonus against wooden targets.

#### Bows and crossbows

- **Crossbows are harder to make than bows:** they need iron, and are made at a forge.
- **Crossbows need much less specialist training than bows.** A warrior can be trained to use a crossbow far more quickly and cheaply than to use a bow, as in real life.
- **Arrows and crossbow bolts are different munitions.** Any arrow can be shot from any bow, and any bolt from any crossbow. Better tips are better: a steel-tipped arrow does more than a flint-tipped one. Tips follow the material tiers (for example flint, bronze, iron, steel).
- **Arrows and bolts are used up** as they are fired, and come out of the player's stock. Each archer or crossbowman carries a supply in its inventory (a quiver), which counts towards its carrying weight, and refills it from the stock at a main base, the same way it collects equipment. Arrows and bolts are light, so a full quiver is never a big weight burden, although bronze tips are heavy for what they do, as in real life.
- **Poison arrows and bolts** are coated with venom. Suggested: a poisoned hit adds 15 damage over 5 seconds, and the undead, slimes, golems and the bone colossus are immune.

**Iron or steel? (research)** The earliest crossbows, in ancient China and Greece, used no iron at all: the bow part (the "prod") was wood or horn, and Chinese trigger mechanisms were bronze. Medieval European crossbows added iron fittings such as the trigger lever and the foot stirrup used for loading. From around 1400, steel prods made crossbows much more powerful, so powerful that they had to be drawn with a crank or winch. Suggested for the game, following that history:

- **Crossbow:** needs iron (a level 3 forge, the Ironworks), as in "Progression".
- **Steel crossbow (suggested):** needs steel (a level 4 forge, the Steelworks). Hits harder and reaches farther, but is slower to reload.

### Animals

| **Animal** | **How you get it** | **What it gives** |
|---|---|---|
| Horse | Tamed in the wild (Fringe) | Mounts for warriors trained to ride. Pulls carts for hauling, and hauls catapults, ballistas and cannons. |
| Ox | Tamed in the wild (Fringe) or bred | Hauling: pulls carts, catapults, ballistas and cannons. Slower than a horse but stronger. Oxen are a separate, bigger wild breed, not trained cattle, and are domesticated just like cattle. |
| Chicken | Tamed in the wild (Heartland and Fringe), then raised on farms | Meat, eggs and feathers. |
| Cattle (cows and bulls) | Tamed in the wild (Heartland), then raised on farms | Meat and leather. Leather is used in armour and can be made into sinew (rope). Grazes on grassland (see below). |

Livestock can also be bought live from Halfling villages, or taken as plunder by winning a war against a village that keeps livestock (see "Neutral villages and trade").

#### Wild herds

- Wild **cattle** roam the Heartland, wild **chickens** roam the Heartland and Fringe, and wild **oxen** and **horses** roam the Fringe. All of them can be tamed.
- There is a **fixed number** of wild animals; they do not keep spawning, so taming them matters mostly in the early game.
- Each wild pair produces a young one every **10 days**. Once every wild pair has been domesticated, wild breeding stops. Tamed pairs keep breeding on the player's farms, so only the wild stock is limited.

#### Game and other wild animals

- **Game for hunting (suggested):** hares and deer (stags carry antlers) run away when attacked; wild boar fight back. All give meat and hides.
- **Other wild creatures (suggested):** grey forest wolves roam in packs; lynx stalk lone workers; giant frogs guard bogs; crocodiles wait in rivers and bogs; giant crabs live on shores and streams; badgers knock over outlying torches. Their roles and stats are in the mob roster file.

#### Bears

- Wild **bears** roam the Deepwoods. They can never be tamed by players (only the Elves have tamed bears).
- Bears do not attack unless they are attacked first or something comes within **2 m** of them.
- Bears breed in pairs like other animals. A cub stays with one of its parents until it grows up. A **mother bear with a cub** attacks anything that comes within **15 m**.
- Wild bears keep breeding (they can never be domesticated), but only up to about **one adult pair plus their cubs per Deepwoods cell**, like the crowding limit for fish. There is also a **hard ceiling** on the total number of bears, so the Deepwoods never fill with them (at most 60 bears in total). Suggested: hunted bears give meat and hides.

#### Young animals

- Every animal is born young, as with fish: a young animal uses the adult model at about half the size, with a different texture, and cannot breed until it grows up. Suggested: animals stay young for 2 days, like fish.

#### Fish

| **Fish** | **Where it lives** | **A pair breeds every** | **Most fish per area of water** |
|---|---|---|---|
| Trout | Streams in the Heartland | 3 days | 1 per 4 m² |
| Salmon | Streams in the Fringe | 6 days | 1 per 8 m² |
| Giant catfish | Pools in the Deepwoods | 9 days | 1 per 8 m² |

- Fish breed **endlessly**, as long as their water is not too crowded. Once a stretch of water holds its maximum, breeding there stops until fish are caught. Water is finite (see "Water" under "Terrain"), so the size of a stream or pool sets how many fish it can hold.
- New fish are born as **young fish**. They stay young for 2 days and cannot breed. A young fish uses the same model as the adult at about half the size, with a different texture.

Monsters kill livestock left out at night, so animals need protecting (pens and barns, walls, or guards).

**Grazing.** Cattle, horses, oxen and chickens graze on grassland. Where there is not enough grass, they eat from the player's non-animal food instead (crops such as wheat and potatoes), which is very wasteful: feeding a large herd on potatoes rather than grass should cost far more food than the herd is worth. Grassland becomes thinner the farther it is from the start basin, until the land is barren (see "The world").

**Working animals** cannot graze while they work. Horses being ridden or hauling, and oxen hauling, eat from the food stock instead. Oxen are the more efficient haulers: they haul more for the food they eat than horses do.

#### Table 14: Mounts and charges

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Knockback rule (s): 2 m if the target is no taller than 60% of the mount's shoulder height, 1 m if shorter than the mount, none otherwise. A charge counts after 6 m (8 m for an ox) of straight running at gallop; after the hit the mount must run that distance again before the next charge counts (s).

| **Mount** | **Health** | **Armour** | **Shoulder height** | **Walk / trot / gallop** | **Charge run** | **Rider attack** | **Taming** | **Breeding** | **Housed at** |
|---|---|---|---|---|---|---|---|---|---|
| Horse (player) | 160 (s) | 0 (s) | 1.6 m (s) | 2 / 5 / 8 m/s (s) | 6 m (s) | rider's weapon, x2 on a charge | a worker with 5 wheat, carrots or corn stands by a wild horse for 45 s; needs Stables (s) | tamed pair: 1 foal every 10 days; adult after 2 days | Stables, 6 stalls (s) |
| Ox (player, hauling only) | 250 (s) | 10% (s) | 1.5 m (s) | 1.5 / 3 / 4 m/s (s) | not ridden by players (s) | none | as the horse but 10 food and 60 s (s) | as the horse | Stables or livestock farm (s) |
| Halfling war ox (two riders) | 250 (s) | 10% (s) | 1.5 m (s) | 1.5 / 3.5 / 5 m/s (s) | 8 m (s) | front rider spear 14 / 1.4 s, x2 on a charge; rear rider shortbow 12 / 2.0 s, 20 m, fires while moving (s) | Halflings only | Halfling village | Halfling barn |
| Goblin wolf (wolf rider) | 70 | 0 (s) | 0.9 m (s) | 2 / 4 / 5.5 m/s (s) | 5 m (s) | roster 6.3 (spear 9, charge doubles) | goblins only | goblin wolf pen | goblin village |
| Elf war bear (bear rider) | 400 (s) | 15% (s) | 1.5 m (s) | 1.5 / 4 / 6 m/s (s) | 6 m (s) | rider: HQ steel glaive 38 / 1.6 s (s), x2 on a charge; the bear also swipes 25 / 1.5 s in a 2 m arc (s) | Elves only | Elf bear pen | Elf kingdom |
| Tamed bear (on foot) | 400 (s) | 15% (s) | 1.5 m (s) | 1.5 / 4 / 6 m/s (s) | none | swipe 25 / 1.5 s, 2 m arc (s) | Elves only |  |  |

**How these were set:** a horse at 8 m/s needs 0.75 s of straight run for 6 m, so charges happen naturally when cavalry closes on a wave but not in a melee. Wild herd sizes are in table 5. Elf caravan wagons are pulled by two horses (doc); a Dwarf sled by one ox.

### Buildings

A first list of buildings. Names in this list are working names, and buildings marked "suggested" were not in the original notes.

| **Building** | **Build menu** | **Purpose** |
|---|---|---|
| Big House (main base) | Start; extra ones from the Basic menu | Drop-off point for every resource. Trains workers and warriors, and mages from level 6. Workers can shelter inside. Upgraded up to level 10 (see "Main base" below). |
| Farms | Basic | Suggested types: crop fields, vegetable farms, herb beds and livestock farms (a pen with a coop and trough), each with 3 tiers (stick fence, then rail fence and shed, then stone wall and well), plus a farmhouse (thatched, then timber, then stone) where assigned workers shelter. Grow crops or raise livestock when workers are assigned. Food comes in slowly but never runs out. Farms are the main source of supply, train workers, and shelter workers at night. There are different types and tiers that give different amounts of supply. |
| Pen and barn (suggested) | Basic | Keep livestock safe at night, when monsters will kill animals left in the open. |
| Lumber mill | Basic | Turns logs into planks for items such as carts, shields and gun stocks (buildings are paid in lumber, see table 4). Also a drop-off point for wood. Suggested: an upgrade adds a waterwheel and works faster. |
| Storehouse (suggested) | Basic | A drop-off point for all resources, built near far-off gathering spots so workers walk less. |
| Fishing dock | Basic | Built on a shoreline from lumber and rope, or lumber and a little metal. Lets workers fish faster and in deeper water. Workers assigned to it shelter in it at night. |
| Torch post and wall torch | Basic | Lights that claim land around them (see "Light and torches"). Built from softwood lumber and resin or pitch (suggested). |
| Tannery (suggested) | Basic | Turns hides from hunting into leather. |
| Cooking building (5 tiers) | Basic | Cooks raw food into food with more nutrition. Burns lumber or coal. See "Cooking" below. |
| Herbalist hut (suggested) | Basic | Turns medicinal herbs into bandages and remedies that heal units. |
| Walls, gates and towers | Basic | Defences for chokepoints. Walls can be built from any type of lumber or from stone. Softwood walls are the weakest, and stone walls take much longer to build. Ranged warriors and mages can fight from towers. |
| Earthworks | Basic | Ramps, earth banks and filling holes and ditches. Ramps can be built from Earth, any type of lumber or stone (lumber and stone ramps are made at a workshop); banks and fill are made from Earth (see "Digging and building up the land"). |
| Scholar's Lodge | Advanced | Research building (see "Research" below). |
| Magi Sanctum | Advanced | Trains novice mages and trains mages up through the lower ranks. |
| Stables (suggested) | Advanced | Tames and breeds horses and oxen, and trains warriors to ride. |
| Gunnery yard (suggested) | Advanced | Trains warriors to fire muskets and crew cannons. |
| Mineshaft | Advanced | Built on flat stone. Lets workers mine ore, coal, stone, gold and gems from underground, which lasts much longer than surface rocks. Comes in tiers (suggested: 3) that dig deeper, each unlocked by research (see "Research") (see "Mineshafts and prospecting"). |
| Workshop | Basic | Crushes stone into gravel, turns hardwood lumber into hardwood sticks, makes ramps from lumber or stone, and makes trinkets for trading with villages. Has 4 tiers, and each tier makes a higher tier of trinket; the upper tiers' other uses are still to be added (see "Workshop" below). |
| Kiln / charcoal pit (suggested) | Advanced | Burns hardwood into charcoal and fires clay into bricks. |
| Forge | Advanced | Smelts ore into ingots and makes tools, weapons, armour and building parts. Has 4 levels that decide which metals it can work (see "Forge levels" below). |
| Powder mill (suggested) | Advanced | Mixes saltpetre, sulphur and charcoal into gunpowder. |
| Foundry (suggested) | Advanced | Casts cannons and cannonballs from bronze or iron. |
| Barracks | Advanced | Trains warriors and trains them in ranged combat. |

#### Main base

- The main base starts as the level 1 Big House and can be upgraded up to **level 10**. Each level looks grander and larger, following the technology of the time: from a log hut (clubs and stone tools) to a large, tall fortress (steel and early gunpowder) at level 10. Each level has its own name. Suggested names: 1 Big House, 2 Longhall, 3 Hall (first parapets), 4 Stockade Hall, 5 Marble Hall, 6 Keep (with a mage balcony), 7 Fortified Keep, 8 Castle, 9 Great Castle, 10 Citadel (with gun ports).
- **The footprint never changes.** Every level takes up the same floor space. On early levels the unused space is filled with decorative items (woodpiles, fences, campfire and so on) that units can walk through but nothing can be built on, so the space is kept free for the bigger buildings to come.
- Each upgrade costs more than the last, so players will usually keep one high-level main base in the centre of their town and smaller main bases farther out as drop-off points. Extra main bases are expensive to build.
- Main bases train workers and warriors. From level 6 they also train mages.
- From level 3, the main base has parapets that ranged warriors and mages can fight from.
- From **level 5** upward, the main base is a grand building built with **marble**.
- Workers can shelter inside at night.

#### Research

- Research is done at the **Scholar's Lodge**, which can be upgraded twice to research faster: **Scholar's Lodge**, then **Scriptorium**, then **Grand Academy**. Like the main base, each upgrade changes the building's name and makes it grander.
- **How research works:** pick a research, pay its fee, and it loads over time like a training order; when the bar fills, the player has it.
- **Mineshaft research (suggested):** Deep Mining I, II and III unlock the mineshaft tiers. The higher tiers cost precious metals (silver and gold) as well as the usual fee.
- A research facility has no unit inside, but it costs supply and drains food like a unit.
- Each research facility a player builds costs more than the last (the cost rises in equal steps), and a player can have at most **10 research facilities** of all types.

#### Forge levels

The forge is upgraded through 4 levels. Level 1 only works the casting metals; levels 2 to 4 each unlock a better grade of iron. The grade of iron also depends on the ore: bog iron and iron rock are the low-quality ores (the forge treats them the same), and vein iron ore is the high-quality ore.

| **Level** | **Name** | **What it can make** |
|---|---|---|
| 1 | Casting Hearth | Copper, tin and bronze ingots from ore, and items made from them. |
| 2 | Bloomery | Bloom iron (iron grade 1, low) from any iron ore. |
| 3 | Ironworks | Wrought iron (iron grade 2, standard) from any iron ore. Pig iron from vein iron ore. |
| 4 | Steelworks | Refined iron (iron grade 3, fine) from pig iron, so vein iron ore is needed. Steel from refined iron. High-quality steel. |

**Iron and steel grades, from worst to best:** bloom iron, wrought iron, refined iron, steel, high-quality steel. Low-quality ores can never go higher than wrought iron, so the better grades need vein iron ore, which lies inside the rock of ridges and mountains from the Deepwoods outwards, and in mineshafts (see "The world").

**High-quality steel** is meant to be a prized, hard-won asset. It can only be made at a level 4 forge, from refined iron, using large amounts of charcoal, very slowly and in small batches.

#### Cooking

Cooked food has more nutrition than raw food. Food is cooked at the cooking building, which has 5 tiers and burns lumber or coal.

| **Tier** | **Name** | **Notes** |
|---|---|---|
| 1 | Campfire | A campfire with a spit. The only tier with no actual building. Roasts meat and fish. |
| 2 | Cook Hut | Smoked meat and fish (suggested). |
| 3 | Kitchen | Bread from wheat, salted meat and fish (suggested). |
| 4 | Great Kitchen | Stew (suggested). |
| 5 | Grand Kitchen | Pie (suggested). |

Nutrition, recipes and cooking times are in table 6.

#### Workshop

The workshop turns raw materials into simple processed goods and building parts. It has 4 tiers, and like the other upgradeable buildings its look follows the technology of the time, from a log hut to a large, busy manufactory. The tier names are suggested.

| **Tier** | **Name** | **What it can make** |
|---|---|---|
| 1 | Work Hut | Crushes stone into gravel, turns hardwood lumber into hardwood sticks, makes ramps from lumber or stone, and makes **Tokens** (tier 1 trinkets) from any metal. |
| 2 | Workshop | Everything the Work Hut makes, plus **Charms** (tier 2 trinkets), hand carts (suggested), and helps make bows (the workshop shapes the bow staves). |
| 3 | Great Workshop | Everything below, plus **Brooches** (tier 3 trinkets), **Moonleafs** (silver and emeralds), ox and horse carts, and catapults with their stones (suggested), and helps make crossbows (with the forge). |
| 4 | Manufactory | Everything below, plus **Heirlooms** (tier 4 trinkets), **Sunhearts** (gold and rubies) and ballistas with their iron-headed bolts (suggested), and helps make muskets (with the forge). |

An upgraded workshop keeps everything the tiers below it could make. What else the upper tiers make will be added as their uses are decided.

#### Trinkets

Trinkets are made at the workshop from metal and are for **trading with villages** (see "Neutral villages and trade"; more on trade is still to come). They come in 4 tiers, and each workshop tier can make one tier higher than the last. Every metal comes in every tier: copper, tin, bronze, iron, steel, silver and gold. A trinket is named by its metal and tier, for example a Copper Token, an Iron Brooch or a Gold Heirloom. The names and looks below are suggested.

| **Tier** | **Made at (and above)** | **Name** | **What it looks like** |
|---|---|---|---|
| 1 | Work Hut | Token | A flat, square tag stamped with a simple mark, hung on a cord. |
| 2 | Workshop | Charm | A small stepped pendant with notched edges, on a short chain. |
| 3 | Great Workshop | Brooch | A layered, cross-shaped pin with a raised pattern on its face. |
| 4 | Manufactory | Heirloom | An ornate locket on a fine chain, built up from many tiny pieces like filigree. |

Two **special trinkets** set a gem in a precious metal. Each has its own name:

| **Name** | **Made from** | **Made at** | **What it looks like** |
|---|---|---|---|
| Moonleaf | Silver and emeralds | Great Workshop or Manufactory | A silver crescent shaped like a curled leaf, cradling a green emerald. |
| Sunheart | Gold and rubies | Manufactory only | A gold sunburst of rays around a red ruby core. |

- A Moonleaf is the same whether it is made at the Great Workshop or the Manufactory.
- Higher tiers are worth more in trade, and the special trinkets most of all (suggested).

#### Table 4: Buildings

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 2b for materials, and the pacing targets (bronze by night 4 to 6, iron by 13 to 18, steel by 25 to 30, gunpowder by 40 to 48 (s)), with each main base level gating the next forge level so the town has to grow to climb. Upgrades are ordered from the building's own panel; the menu slot is where the first level is placed. Footprints are in 45 cm columns.

| **Building** | **Cost** | **Build (ws)** | **Health** | **Footprint** | **Menu slot** | **Supply** | **Needs** | **Gives or unlocks** |
|---|---|---|---|---|---|---|---|---|
| Main base 1 Big House | start; an extra one 300 softwood, 150 stone | 1200 | 1200 | 14 x 14 (6.3 m) | Basic 1 (doc) | 8 |  | drop-off, workers, warriors, hardwood and flint gear, bows, arrows, javelins, slings, rope, boots, hand carts; shelters 8 (s) |
| 2 Longhall | 100 softwood, 40 stone | 400 | 1600 | same | upgrade | 12 |  | Barracks (s) |
| 3 Hall | 110 softwood, 45 stone, 15 sticks (s) | 420 (s) | 2000 | same | upgrade | 16 |  | parapets, 8 slots (doc); Forge 2, Stables, Kiln, Workshop 2 (s) |
| 4 Stockade Hall | 120 softwood, 60 stone, 25 hardwood, 5 bronze (s) | 450 (s) | 2500 | same | upgrade | 20 | Bronze | Magi Sanctum, Mineshaft 1, Scriptorium, Kitchen, farm tier 2 (s) |
| 5 Marble Hall | 75 hardwood, 100 stone, 20 bricks, 20 marble, 10 bronze (s) | 600 (s) | 3000 | same | upgrade | 25 |  | Forge 3, Great Workshop (catapults, carts), farm tier 3; the first marble level (Jade) (s) |
| 6 Keep | 100 hardwood, 150 stone, 40 bricks, 30 marble, 15 wrought iron (s) | 800 (s) | 3600 | same | upgrade | 30 |  | trains mages (doc); Mineshaft 2, Great Kitchen (s) |
| 7 Fortified Keep | 125 hardwood, 200 stone, 60 bricks, 40 marble, 25 wrought iron (s) | 1000 (s) | 4200 | same | upgrade | 35 |  | Forge 4, Grand Academy, Manufactory, Powder mill (s) |
| 8 Castle | 150 hardwood, 250 stone, 100 bricks, 50 marble, 30 refined iron (s) | 1200 (s) | 5000 | same | upgrade | 40 |  | Foundry, Gunnery yard, Mineshaft 3, Grand Kitchen (s) |
| 9 Great Castle | 150 hardwood, 250 stone, 100 bricks, 75 marble, 30 steel (s) | 1500 (s) | 6000 | same | upgrade | 45 |  | marble facing and banners (s) |
| 10 Citadel | 200 hardwood, 300 stone, 150 bricks, 125 marble, 50 steel, 5 gold (s) | 2000 (s) | 7500 | same | upgrade | 50 |  | 4 cannon ports on the roof (s) |
| Crop field 1 (wheat, corn or flax, chosen when built) | 30 softwood, 10 sticks | 150 | 400 | 12 x 12 | Basic 2, Farms | 4 |  | 2 farmers, trains workers, farmhouse shelters 4 (s) |
| Crop field 2 / 3 | +20 softwood, +15 stone / +20 hardwood, +30 stone (s) | 150 / 300 (s) | 600 / 800 | same | upgrade | 6 / 8 | base 4 / base 5 | 3 / 4 farmers; yield x1.5 / x2 (s) |
| Vegetable farm 1 / 2 / 3 (potatoes or carrots) | as crop field | as crop field | as crop field | 12 x 12 | Basic 2, Farms | 3 / 5 / 7 | as crop field | full yield on thin grass (s) |
| Herb bed 1 / 2 / 3 | 20 softwood, 10 herbs / +15 softwood, +10 stone / +15 hardwood, +20 stone (s) | 100 / 100 / 200 (s) | 300 / 500 / 700 | 8 x 8 | Basic 2, Farms | 1 / 2 / 3 | as crop field | 1 farmer; herbs 4 / 6 / 8 a day (s) |
| Livestock farm 1 / 2 / 3 | as crop field but 40 softwood at tier 1 | 200 / 150 / 300 (s) | 400 / 600 / 800 | 12 x 12 | Basic 2, Farms | 4 / 6 / 8 | as crop field | 6 / 10 / 16 animals, 1 worker, breeding, slaughter (s) |
| Pen and barn | 30 softwood | 120 | 500 | 8 x 8 | Basic 3 | 0 |  | shelters 8 animals at night, no breeding (s) |
| Lumber mill | 40 softwood, 10 stone; waterwheel upgrade +40 hardwood, +20 stone, on a stream, 300 ws | 200 | 600 | 8 x 8 | Basic 4 | 0 |  | wood drop-off, planks (table 2b), 2 workers (s) |
| Storehouse | 40 softwood, 20 stone | 150 | 600 | 8 x 8 | Basic 5 | 0 |  | drop-off for everything (s) |
| Fishing dock | 30 softwood lumber, 5 rope (doc: lumber and rope) | 150 | 400 | 6 x 4 | Basic 6 | 0 | shoreline | 3 workers fish at net speed in any depth and shelter inside (doc) (s) |
| Tannery | 40 softwood, 20 stone | 200 | 500 | 8 x 8 | Basic 7 | 0 |  | leather, boots, leather armour and cap, carrying gear, 2 workers (s) |
| Cooking 1 Campfire | 5 softwood | 10 | 60 | 2 x 2 | Basic 8 | 0 |  | roast meat and fish; also a light (table 18) (s) |
| 2 Cook Hut / 3 Kitchen | 40 softwood, 20 stone / +30 hardwood, +30 stone, +10 bricks (s) | 200 / 200 (s) | 500 / 800 | 6 x 6 / 8 x 8 | upgrade | 0 | none / base 4 | smoked foods / bread, salted foods (s) |
| 4 Great Kitchen / 5 Grand Kitchen | +50 hardwood, +50 stone, +30 bricks, +5 wrought iron / +75 hardwood, +100 stone, +50 bricks, +10 steel (s) | 400 / 750 (s) | 1200 / 1800 | 10 x 10 / 12 x 12 | upgrade | 0 | base 6 / base 8 | stew / pie, and cooks twice as fast (s) |
| Herbalist hut | 30 softwood, 10 herbs | 150 | 400 | 6 x 6 | Basic 9 | 0 |  | bandages, remedies, poison arrows (s) |
| Wall, per column: softwood / hardwood / stone | 1 softwood / 1 hardwood / 2 stone | 5 / 8 / 20 | 300 / 600 / 1500 (roster) | 1 x 1, 3 m tall (stone 3.6 m) | Basic 10 Defences | 0 |  | (s) |
| Gate, 3 columns: softwood / hardwood / stone | 6 softwood / 6 hardwood / 10 stone, 2 hardwood | 30 / 45 / 90 | 600 / 1200 / 3000 | 3 x 1 | Basic 10 | 0 |  | shut and lit by a torch it stops rats and spiders climbing (roster) (s) |
| Tower: softwood / hardwood / stone | 20 softwood / 20 hardwood / 40 stone, 10 hardwood | 100 / 150 / 300 | 800 / 1600 / 4000 | 3 x 3 | Basic 10 | 0 |  | 4 ranged slots, +10 m sight (s) |
| Earthworks: earth ramp, bank, fill | 1 Earth per column per 11 cm step | 5 per step | terrain | 1 column wide | Basic 11 | 0 |  | built on the spot (s) |
| Lumber ramp / stone ramp | 1 lumber per 2 steps / 2 stone per 2 steps, made at any workshop in 10 / 15 s | 5 / 8 per step to place | 300 / 1500 per column | 1 column wide | Basic 11 | 0 | Work Hut | 1-, 2- and 4-step pieces (s) |
| Workshop 1 Work Hut | 40 softwood, 20 stone | 200 | 600 | 8 x 8 | Basic 12 | 0 |  | gravel, sticks, ramps, Tokens, 2 workers (s) |
| 2 Workshop / 3 Great Workshop | +30 hardwood, +20 stone, +5 bronze / +50 hardwood, +40 stone, +20 bricks, +10 wrought iron (s) | 200 / 400 (s) | 900 / 1200 | same | upgrade | 0 | base 3 / base 5 | Charms, hand carts, shapes bow staves so bows take half the time / Brooches, Moonleafs, ox and horse carts, catapults and their stones, crossbow stocks with the forge (doc), glass lanterns (s) |
| 4 Manufactory | +75 hardwood, +75 stone, +50 bricks, +15 steel (s) | 750 (s) | 1800 | same | upgrade | 0 | base 7 | Heirlooms, Sunhearts, ballistas and their bolts, musket stocks with the forge (doc); every workshop good at double speed (s) |
| Lights | table 18 |  |  |  | Basic 13 |  |  | torch post, wall torch, campfire, brazier, lantern |
| Scholar's Lodge 1 | 60 softwood, 20 stone; every further research facility costs this much again on top (doc) | 240 | 500 | 8 x 8 | Advanced 1 | uses 1, eats 2 a day |  | one research at a time (s) |
| 2 Scriptorium / 3 Grand Academy | +50 hardwood, +50 stone, +20 bricks / +75 hardwood, +100 stone, +50 bricks, +30 marble, +10 steel (s) | 450 / 900 (s) | 900 / 1500 | same | upgrade | same | base 4 / base 7 | research 25% / 50% faster (s) |
| Magi Sanctum | 40 hardwood, 60 stone, 20 bricks, 1 mana crystal (s) | 450 (s) | 1200 | 8 x 8 | Advanced 2 | 0 | base 4 | novices, ranks to Adept, rank wands (s) |
| Barracks | 80 softwood, 40 stone, 20 sticks | 400 | 1000 | 10 x 10 | Advanced 3 | 0 | base 2 | warriors, archery, crossbow, rank training (s) |
| Stables | 30 softwood, 10 stone, 5 sticks (s) | 150 (s) | 800 | 10 x 8 | Advanced 4 | 0 | base 3 | taming, 6 stalls, breeding, riding (s) |
| Gunnery yard | 50 hardwood, 75 stone, 30 bricks, 10 steel (s) | 600 (s) | 1500 | 12 x 12 | Advanced 5 | 0 | base 8 | musket and cannon crew training (s) |
| Mineshaft 1 / 2 / 3 | 60 hardwood, 80 stone, 10 bronze / +40 hardwood, +50 stone, +15 wrought iron / +50 hardwood, +75 stone, +20 steel (s) | 600 / 450 / 600 (s) | 800 / 1200 / 1600 | 6 x 6 on flat stone | Advanced 6 | 0 | base 4, 6, 8 and Deep Mining I, II, III at the lodge, fees 20 bronze ingots and 50 stone / 30 wrought iron, 100 stone and 3 silver / 30 steel, 200 stone, 3 gold and 3 silver (s) (the higher tiers cost precious metals, doc) | 4 miners; output in table 5 (s) |
| Kiln | 30 softwood, 40 stone, 20 clay | 300 | 600 | 6 x 6 | Advanced 7 | 0 | base 3 | charcoal, bricks, glass, 2 workers (s) |
| Forge 1 Casting Hearth | 60 softwood, 40 stone | 300 | 600 | 8 x 8 | Advanced 8 | 0 |  | copper, tin, bronze, 2 workers (s) |
| 2 Bloomery / 3 Ironworks | +30 softwood, +40 stone, +10 clay, +5 bronze / +50 hardwood, +60 stone, +20 bricks, +10 bronze (s) | 300 / 450 (s) | 900 / 1200 | same | upgrade | 0 | base 3 / base 5 | bloom iron / wrought and pig iron, crossbows, mail; 3 workers (s) |
| 4 Steelworks | +75 hardwood, +100 stone, +60 bricks, +20 wrought iron (s) | 900 (s) | 1800 | same | upgrade | 0 | base 7 | refined iron, steel, HQ steel; 4 workers (s) |
| Powder mill | 20 hardwood, 40 stone, 20 bricks, 5 wrought iron (s) | 300 (s) | 600 | 6 x 6 | Advanced 9 | 0 | base 7 | gunpowder (s) |
| Foundry | 50 hardwood, 75 stone, 50 bricks, 10 bronze, 10 wrought iron (s) | 600 (s) | 1500 | 10 x 10 | Advanced 10 | 0 | base 8 | cannons, cannonballs (s) |

Production buildings work only with workers assigned and each extra worker adds a full share up to the limit (doc); a building under construction has 10% of its health plus the share built (s).

### Items

Items that can be made from the resources so far. "Made at" is the building from the list above.

#### Materials (used to make other things)

| **Item** | **Made at** | **From** |
|---|---|---|
| Sinew / rope | Tannery or Big House | Leather (sinew) or flax (rope) |
| Planks | Lumber mill | Softwood or hardwood lumber. Used for items only; buildings are paid in lumber (see table 2b). |
| Stone blocks | Worker on site | Stone |
| Gravel | Workshop | Stone (crushed) |
| Hardwood sticks | Workshop (or gathered from hazel bushes) | Hardwood lumber only |
| Ramps (lumber or stone) | Workshop | Any type of lumber, or stone |
| Trinkets (Token, Charm, Brooch, Heirloom) | Workshop (its tier decides the highest trinket tier) | A metal: copper, tin, bronze, iron or steel ingots, silver or gold. Every metal comes in every tier (a Copper Token, a Gold Heirloom and so on). For trading with villages (see "Trinkets"). |
| Moonleaf | Great Workshop or Manufactory | Silver, emeralds. For trading with villages. |
| Sunheart | Manufactory | Gold, rubies. For trading with villages. |
| Charcoal (suggested) | Kiln | Hardwood lumber |
| Bricks (suggested) | Kiln | Clay, fuel (charcoal or coal) |
| Leather | Tannery | Hides (or directly from hunting until hides are added) |
| Copper ingot | Forge (level 1+) | Copper ore, fuel |
| Tin ingot | Forge (level 1+) | Tin ore, fuel |
| Bronze ingot | Forge (level 1+) | Copper ingots and tin ingots (roughly 9 copper to 1 tin) |
| Iron ingot, bloom (grade 1) | Forge (level 2+) | Bog iron, iron rock or vein iron ore, charcoal. The first iron a player can make. |
| Iron ingot, wrought (grade 2) | Forge (level 3+) | Any iron ore, charcoal or coal. |
| Pig iron ingot | Forge (level 3+) | Vein iron ore, coal or charcoal, stone (flux). Brittle; only used to make refined iron. |
| Iron ingot, refined (grade 3) | Forge (level 4) | Pig iron ingot, fuel. |
| Steel ingot | Forge (level 4) | Refined iron ingot, coal or charcoal. |
| High-quality steel ingot | Forge (level 4) | Refined iron ingot, large amounts of charcoal. Very slow, small batches. |
| Gunpowder (suggested) | Powder mill | Saltpetre, sulphur, charcoal |
| Glass (suggested) | Kiln | Sand, fuel |
| Lead shot (suggested) | Forge | Lead ore, fuel. Ammunition for flintlock muskets. |

Iron and steel items carry the grade of the metal they are made from, so a bloom-iron sword is weaker than a wrought-iron one, and a high-quality steel sword is the best of all.

#### Tools (for workers)

| **Item** | **Made at** | **From** |
|---|---|---|
| Hardwood axe, digging stick, mallet | Big House | Hardwood sticks (starting tools) |
| Flint axe, flint pick, flint knife | Big House | Hardwood sticks, flint |
| Hardwood hoe | Big House | Hardwood sticks. For farm work. |
| Hoe (copper, bronze, iron, steel) (suggested) | Forge | The metal ingot, hardwood lumber |
| Prospecting hammer (suggested) | Forge | Any metal ingot, hardwood lumber. Used for T Prospect. |
| Copper axe, pick, sickle | Forge | Copper ingot, hardwood lumber |
| Bronze axe, pick, sickle, saw | Forge | Bronze ingot, hardwood lumber |
| Iron axe, pick, sickle, plough, saw | Forge | Iron ingot, hardwood lumber |
| Steel tools | Forge | Steel ingot, hardwood lumber |
| Ox or horse cart | Great Workshop | Hardwood lumber, planks, a little iron. Pulled by a horse or an ox. |
| Hand cart | Workshop (tier 2) | Planks, hardwood lumber. A two-wheeled cart a worker pushes to haul loads; bigger carts are pulled by horses or oxen. |
| Fishing rod / net | Big House | Softwood lumber, flax or leather |

#### Weapons and armour (for warriors)

| **Item** | **Made at** | **From** |
|---|---|---|
| Hardwood club (starting weapon), hardwood spear | Big House | Hardwood sticks |
| Flint-tipped spear (starting weapon), flint axe | Big House | Hardwood sticks, flint |
| Torch | Big House | Softwood lumber, resin or pitch (suggested). Carried or placed; see "Light and torches". |
| Sling | Big House | Leather or flax. Throws stones. |
| Thrown spear (javelin) | Big House (flint), forge (bronze) | Hardwood sticks, flint or bronze |
| Shortbow, shortsword, buckler | Bought from Halfling villages | Halfling-made light weapons: a short bow, a short bloom-iron sword and a small round shield. Players cannot make them (suggested). |
| Bow and flint arrows | Big House | Softwood or hardwood lumber, flint, feathers, sinew or flax |
| Leather armour (hardened leather) | Tannery | Leather only; flax cannot replace it |
| Boots | Tannery or Big House (suggested) | Leather or flax. A small piece of armour. |
| Copper axe and dagger | Forge | Copper ingot, hardwood lumber |
| Bronze sword, spear, shield, scale armour | Forge | Bronze ingot, hardwood lumber, leather (flax can replace it in the scale armour) |
| Iron sword, mace, mail armour, arrowheads | Forge | Iron ingot, leather (flax can replace it in the mail armour) |
| Crossbow | Forge (level 3+, Ironworks) | Iron ingot, hardwood lumber, flax or leather |
| Poison arrows or bolts | Herbalist hut (suggested) | Arrows or bolts, venom. Suggested: 1 venom coats 10. |
| Crossbow bolts | Forge | Hardwood lumber, feathers, and metal for the tips |
| Steel sword, pike, plate armour | Forge | Steel ingot, leather (flax can replace it in the plate armour) |
| Steel crossbow (suggested) | Forge (level 4, Steelworks) | Steel ingot (the bow part), iron ingot (fittings), hardwood lumber, flax |
| Flintlock musket | Forge | Steel or iron ingot (barrel), hardwood lumber (stock), flint (the lock's striker). Fires using gunpowder and lead shot. |
| Cannon | Foundry | Bronze ingots (early, lighter) or iron ingots (later, cheaper), hardwood lumber (carriage) |
| Cannonballs | Foundry | Iron ingot or stone |
| Shields (wicker, wood, bronze, iron kite, steel heater) (suggested) | Big House (wicker, wood), forge (metal) | Hardwood sticks and hide (wicker); planks and leather (wood); the metal ingot and leather (metal shields) |
| Helmets (leather cap, bronze, iron nasal helm, steel sallet) | Tannery (leather), forge (metal) | Leather, or the metal ingot and leather |
| Halberd (suggested) | Forge | Iron or steel ingot, hardwood lumber |
| Javelin (thrown spear), sling | Big House (flint javelin, sling), forge (bronze javelin) | Hardwood sticks and flint or bronze (javelin); leather or flax (sling) |
| Carrying gear: bolt case, powder horn, shot pouch | Tannery | Leather. Hold bolts, gunpowder and lead shot, like a quiver holds arrows. |
| Fire arrows (suggested) | Big House | Arrows, resin or pitch |

#### Table 3: Armour, helmets, boots and shields

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Piece** | **Reduction** | **Weight** | **Recipe** | **Flax instead of leather** | **Made at** | **Time** |
|---|---|---|---|---|---|---|
| Boots | 3% (s) | 1.5 lb (s) | 1 leather or 1 flax (s) | yes | Tannery or Big House | 10 s (s) |
| Leather armour (hardened) | 15% | 10 lb (s) | 3 leather (s) | never | Tannery | 30 s (s) |
| Leather cap | 2% (s) | 1 lb (s) | 1 leather (s) | never (s) | Tannery | 10 s (s) |
| Bronze scale | 30% | 30 lb (s) | 4 bronze, 1 leather (s) | yes | Forge 1 | 60 s (s) |
| Bronze helmet | 4% (s) | 3.5 lb (s) | 1 bronze, 1 leather (s) | yes | Forge 1 | 20 s (s) |
| Iron mail (bloom / wrought / refined) | 35% / 40% / 45% (s) | 25 lb (s) | 4 iron of that grade, 1 leather (s) | yes | Forge 2 / 3 / 4 | 60 s (s) |
| Iron nasal helm (any grade) | 5% (s) | 3 lb (s) | 1 iron, 1 leather (s) | yes | Forge 2+ | 20 s (s) |
| Steel plate | 55%; HQ steel 60% (s) | 45 lb (s) | 6 steel, 2 leather (s) | yes | Forge 4 | 120 s (s) |
| Steel sallet | 7% (s) | 3 lb (s) | 1 steel, 1 leather (s) | yes | Forge 4 | 30 s (s) |
| Wicker shield | blocks 10% of projectile damage (s) | 5 lb (s) | 6 sticks, 1 hide or leather (s) |  | Big House | 15 s (s) |
| Wood shield (basic: wood and leather, Jade) | 15% (s) | 8 lb (s) | 3 planks, 1 leather (s) |  | Big House (s) | 20 s (s) |
| Bronze shield | 20% (s) | 12 lb (s) | 2 bronze, 1 hardwood lumber, 1 leather (s) |  | Forge 1 | 30 s (s) |
| Iron kite shield | 25% (s) | 12 lb (s) | 3 wrought iron, 1 plank, 1 leather (s) |  | Forge 3 | 40 s (s) |
| Steel heater shield | 30% (Jade: the best shield in the game) | 10 lb (s) | 3 steel, 1 leather (s) |  | Forge 4 | 45 s (s) |

**How these were set:** Jade set the best shield at 30%; the lower tiers step down by 5 points. A full steel set (plate, sallet, boots, sword, heater) is 62.5 lb, so a foot soldier in it runs about 10% slower by the doc's load rule; mounted units are not slowed. Mages wear boots and leather only (s). Protection from spells is the Warding spell in table 13.

#### Food and medicine

| **Item** | **Made at** | **From** |
|---|---|---|
| Roast meat / roast fish | Cooking building, tier 1 (campfire) | Meat or fish, lumber or coal. More nutrition than raw. |
| Smoked or salted fish and meat | Cooking building, higher tier | Meat or fish, lumber or coal. More nutrition than raw. |
| Bread | Cooking building, higher tier | Wheat, lumber or coal. |
| Bandages | Herbalist hut | Medicinal herbs, flax (or leather strips early on). Heals units slowly. |
| Healing remedy | Herbalist hut | Medicinal herbs, glass bottle. Heals more and faster. |

### Equipment

Tools, weapons and armour are equipment. Equipment is made at forge-type buildings from resources and kept in the player's equipment stock until a unit uses it.

Equipping must never be tedious. A large force can be upgraded with a couple of clicks, and players who want to can still choose gear unit by unit. **The player's own choices always win over the automatic ones.**

#### Making equipment

- Select a forge-type building, open its crafting menu (click Craft, or press K) and click the item (or press its grid key). Items go into the building's production queue like anything else.
- Finished items go into the player's equipment stock.

#### Equipping units

- **Equip Best (Q):** works on any selection, of any size. Every selected unit gets the best equipment in stock that it can use.
- **Picking up:** units walk to the nearest main base to collect their new gear, and hand in what it replaces there. This is one reason to build extra main bases away from the main settlement. Suggested: once they have their gear, units go back to what they were doing.
- **What counts as "best":** the higher material tier first (copper, bronze, iron, steel), then the higher grade within it (see "Forge levels").
- **When there is not enough to go round,** the best items go to the most capable units first. The most capable unit is the one with the highest experience rank. Specialist gear only goes to units trained to use it (for example, a musket only goes to a warrior trained with muskets). Example: 7 warriors fully equipped in bronze and 3 sets of bloom iron in stock. Equip Best on all 7 gives the iron to the 3 highest-ranked warriors, and the other 4 keep their bronze.
- **Workers' tools are first come, first served:** the worker who reaches the main base first gets the best tool available. There are no specialised workers. The one exception: if two workers arrive at about the same time and one of them is starving, the healthy worker gets the better tool.
- **Auto-Equip (toggle):** a button on the utility bar. While it is on, new equipment from the forges is handed out automatically, using the same rules as Equip Best. It only happens during the day, and only to idle units that are within about a 15-second run of a main base. Hand-picked items are still left alone.
- Any item a unit hands in goes back into the equipment stock.

#### Choosing by hand

- **Equipment panel (I):** with a single unit selected, the panel shows what it is wearing and holding, and the items in stock that fit each slot. Click an item to give it to that unit, which then walks to the nearest main base to collect it.
- **Hand-picked items are never overridden.** A later Equip Best leaves any hand-picked item on a unit alone.
- **Hand-picking does not reserve the item.** If Equip Best hands the item to another unit before the hand-picked unit reaches the main base, the hand-picked unit stops at the main base and says so in a speech bubble (for example, "That bronze sword is gone!").

#### Inventory and carrying weight

- Every unit has an **inventory** for items it is not using: spare weapons, munitions, gathered resources and so on.
- Every item has a **weight**, set in advance to match its real-world weight.
- A unit can carry **100 lb** in total, including everything it has equipped. Of that, at most **25 lb** can be raw materials (gathered resources such as lumber, stone, ore and meat).
- **Heavy loads slow units down.** Up to 50 lb there is no effect. Above 50 lb the unit slows down steadily, reaching 40% slower at the 100 lb limit (for example, 75 lb makes it 20% slower). 40% is the most a load can ever slow a unit.
- **Mounted units** are not slowed: a horse carries its rider just as fast whatever the rider is wearing and carrying, which makes heavily armoured cavalry strong.
- Equip Best, Auto-Equip and hand-picking never give a unit more than it can carry.
- The equipment panel (I) also shows the unit's inventory and how much it is carrying, for example "64 / 100 lb" and "raw materials 10 / 25 lb".

Approximate real-world weights, as a starting point:

| **Item** | **Approximate weight** |
|---|---|
| Arrow or crossbow bolt | About 2 oz each (24 arrows weigh about 3 lb) |
| Bow | 1.5 to 3 lb |
| Crossbow | 7 to 10 lb (a steel crossbow with its winch: 12 to 18 lb) |
| Flintlock musket | About 10 lb |
| One-handed sword | 2.5 to 3.5 lb |
| Mace or war axe | 2 to 4 lb |
| Spear | 3 to 5 lb |
| Pike or halberd | 6 to 8 lb |
| Shield | 7 to 15 lb, depending on size and material |
| Leather armour | 8 to 15 lb |
| Mail shirt | 20 to 30 lb |
| Full steel plate armour | 35 to 55 lb |
| Woodcutting axe or pick | 3 to 7 lb |

Bronze is denser than iron and steel, so a bronze item weighs about 10 to 15% more than the same item in iron.

#### Table 12: Carrying weights and capacities

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Thing** | **Weight per unit (s)** | **Load per trip (25 lb)** |
|---|---|---|
| Softwood or hardwood lumber, planks, stone, every ore, clay, sand, gravel, bricks (2.5), coal (2.5) | 5 lb | 5 (10 bricks or coal) |
| Hardwood sticks, bone, wheat, potatoes, corn, flint, resin | 1 lb (sticks 2.5 lb) | 25 (10 sticks) |
| Meat, fish, hides, leather, charcoal, saltpetre, sulphur | 2.5 lb | 10 |
| Herbs, flax, carrots, mana crystal, spider silk, venom, hexstone, eggs, feathers | 0.5 lb (feathers 0.1) | 50 |
| Marble block | 10 lb | 2 |
| Gold, silver (a nugget), lead ore (5), demon horn (2) | 1 lb | 25 |
| Gems, lead shot (10 balls), gunpowder (10 charges) | 0.1 lb per gem; 1 lb | by node |
| Copper, tin, bronze, pig, iron, steel ingots | 5 lb | 5 (made goods, not raw) |
| Cannonball iron / stone; catapult stone; ballista bolt | 6 / 4 lb; 40 lb; 5 lb | carried by the engine's crew or cart |
| Quiver / bolt case / powder horn / shot pouch | 24 arrows (3 lb) / 20 bolts / 20 charges / 20 balls | refilled at a main base (doc) |
| Hand cart | 150 lb raw, pushed at 2.0 m/s by a worker | wheels only (doc) |
| Ox cart | 600 lb behind an ox at 1.5 m/s; 400 lb behind a horse at 2.5 m/s | wheels only |
| Pack animal without a cart | ox 150 lb, horse 100 lb, led by a worker |  |
| Siege engine haul | table 2f speeds; a horse or ox hauls one engine at a time |  |

**How these were set:** a worker's trip is one load of 5 lumber, stone or ore, which with table 5 times gives the per-day income used in the pacing check; an ox cart moves 24 worker-loads at once, which is what makes a far-off mine or the Deepwoods vein iron worth the walk.

#### Seeing equipment

- Tools, weapons and armour are attached to the character model, so players can see at a glance who has what.

#### Unit models

- **Workers and warriors share one human body model.** Warriors only have a different skin, which is also unarmoured; armour is added as equipment. Warriors have their own animations for everything they do (fighting with each weapon type, shooting, hunting and so on). Workers also get animations for farming (with a hoe) and fishing.
- **Mages** have their own model. All mages are female, with long hair, and the body is somewhat dimorphic from the worker body. They cast spells with **wands**.
- **Injured and death animations:** every unit has an injured animation and a death animation. Injured looks like being hit from the front and reacting; warriors also throw up their shield arm as if trying to block, but less composed than a real block.
- **Other models needed:** the Halfling war ox needs two rider points (a spear rider in front, an archer behind). Young fish reuse the adult fish model at about half scale with their own texture. Elves are a slim, androgynous version of the human body with long hair; Dwarves a shorter, stockier version with beards; Elf mages are their own mage type. Goblin villages need standard goblins, goblin archers, goblin wolf riders (goblins on wolves) and a goblin mage.

#### Refurbishing

- Old equipment in stock can be refurbished at a forge-type building (Refurbish, or F). Refurbishing gives back **all** of the raw resources used to make the item.
- Refurbishing takes time and uses the building like any other job, so it goes into the building's queue alongside crafting. It is fast: 10 times faster than making the item was.
- The time spent making the item, and the food the forge used while making it, are not given back.

### Progression

The game moves through tiers of material, following the order the resource list already has. Each tier needs the one before it, a research step at a research facility, and usually a building or an upgrade. Tool tiers also decide what workers can gather, so moving up a tier opens up new resources rather than only being faster.

| **Tier** | **Unlocked by** | **What it opens up** |
|---|---|---|
| 1. Hardwood | Start of game | Chopping trees, gathering herbs, loose stone and flint, fishing from shore. (Hunting is done by warriors and depends on their weapons, not on worker tools.) |
| 2. Flint | Collecting flint; research | Faster chopping, mining surface stone, bows (which also help warriors hunt). Flint picks are needed before copper and tin ore can be mined in the next tier. |
| 3. Copper | Forge (level 1, Casting Hearth) | Mining copper and tin ore and smelting them; copper, tin and bronze tools and weapons; coal at the surface. |
| 4. Bronze | Copper and tin ingots; research | Stronger tools and weapons, the first tier of mineshaft, mining bog iron and iron rock. |
| 5. Early iron | Forge level 2 (Bloomery) | Bloom iron tools and weapons. Mining vein iron ore. |
| 6. Iron | Forge level 3 (Ironworks) | Wrought iron from any ore, pig iron from vein ore, crossbows, mail armour, iron cannonballs. |
| 7. Steel | Forge level 4 (Steelworks); vein iron ore; research | Refined iron, steel and, slowly, high-quality steel. The best tools, weapons and armour. |
| 8. Gunpowder | Saltpetre, sulphur and charcoal; powder mill | Flintlock muskets and cannons (the end of the tech tree). |

Because sulphur, vein iron and other late resources are mostly found far from spawn, the later tiers push players to expand, in line with the Premise.

#### Table 2: Tools and weapons per tier

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**2a. Research steps (at a Scholar's Lodge; Scriptorium 25% faster, Grand Academy 50% faster (s))**

| **Step** | **Needs first** | **Cost (s)** | **Time (s)** | **Opens** |
|---|---|---|---|---|
| Flint tools | Scholar's Lodge | 10 flint, 20 softwood lumber | 60 s | flint tier: flint tools, bow and flint arrows, sling, flint javelin, surface stone; flint picks are what the copper tier's ore mining needs (doc) |
| Bronze | Forge level 1, 1 tin ingot made | 10 copper ingots, 2 tin ingots | 75 s (s) | bronze tier, mining bog iron and iron rock |
| Deep Mining I | Bronze | fee in table 4 (20 bronze ingots, 50 stone) | 90 s (s) | mineshaft tier 1 |
| Halberds | Forge level 2 | 10 bloom iron ingots | 60 s (s) | iron halberd (steel halberd once Steel is done) |
| Crossbows | Forge level 3 | 10 wrought iron, 20 hardwood lumber | 90 s (s) | crossbow, bolts, bolt case |
| Hexcraft (researched at the Magi Sanctum, not a lodge) | Magi Sanctum | 6 hexstone, 20 herbs (hexstone is the reagent: Jade) | 90 s (s) | the Warding and Counterspell spells (table 13) |
| Deep Mining II | Forge level 3 | fee in table 4 (30 wrought iron, 100 stone, 3 silver (s)) | 120 s (s) | mineshaft tier 2 |
| Siege engines | Great Workshop | 40 hardwood lumber, 10 rope, 10 bronze ingots | 120 s (s) | catapult; the ballista needs a Manufactory and Forge level 3 as well |
| Steel | Forge level 4, 1 pig iron made | 10 pig iron, 20 charcoal | 150 s (s) | steel tier |
| High-quality steel | Steel | 5 steel, 50 charcoal | 210 s (s) | high-quality steel items |
| Steel crossbow | Steel | 10 steel | 90 s (s) | steel crossbow |
| Deep Mining III | Steel | fee in table 4 (30 steel, 200 stone, 3 gold, 3 silver (s)) | 180 s (s) | mineshaft tier 3 |
| Gunpowder | Powder mill | 10 saltpetre, 5 sulphur (s), 10 charcoal | 150 s (s) | gunpowder |
| Muskets | Gunpowder, Gunnery yard | 10 steel, 10 gunpowder | 180 s (s) | flintlock musket, lead shot, powder horn, shot pouch |
| Cannons | Gunpowder, Foundry | 20 bronze ingots, 10 gunpowder, 20 hardwood lumber | 210 s (s) | bronze cannon, cannonballs; iron cannon once Forge level 3 exists |

Copper, bloom, wrought and refined iron need no research: the forge level opens them, as Progression says. Research is paid up front and loads like a training order (doc).

**2b. Smelting and processing (needed by every recipe below; all (s) except the 9:1 bronze ratio)**

| **Product** | **Made at** | **Recipe** | **Time (1 worker)** |
|---|---|---|---|
| Copper or tin ingot | Forge 1+ | 2 ore, 1 fuel (1 lumber, 1 charcoal or 1 coal) | 5 s (s) |
| Bronze ingot | Forge 1+ | 9 copper ingots, 1 tin ingot gives 10 bronze | 30 s (s) |
| Bloom iron | Forge 2+ | 3 bog iron or iron rock (or vein ore), 2 charcoal | 10 s (s) |
| Wrought iron | Forge 3+ | 3 any iron ore, 2 charcoal or coal | 10 s (s) |
| Pig iron | Forge 3+ | 2 vein iron ore, 1 coal or charcoal, 1 stone | 8 s (s) |
| Refined iron | Forge 4 | 2 pig iron, 1 fuel | 10 s (s) |
| Steel | Forge 4 | 1 refined iron, 2 coal or charcoal | 15 s (s) |
| High-quality steel | Forge 4 | 2 refined iron, 6 charcoal | 60 s (batch of 1) (s) |
| Charcoal | Kiln | 2 hardwood lumber gives 3 charcoal | 10 s (s) |
| Bricks | Kiln | 2 clay, 1 fuel gives 4 bricks | 10 s (s) |
| Glass | Kiln | 2 sand, 1 fuel | 10 s (s) |
| Planks | Lumber mill | 1 lumber gives 1 plank (any wood); waterwheel upgrade: 2 per 1 lumber (s) | 5 s |
| Leather | Tannery | 1 hide | 15 s |
| Sinew / rope | Tannery or Big House | 1 leather, or 2 flax | 10 s |
| Gunpowder (10 charges) | Powder mill | 2 saltpetre, 1 sulphur, 1 charcoal | 15 s (s) |
| Lead shot (10 balls) | Forge 3+ | 1 lead ore, 1 fuel | 8 s (s) |
| Cannonball | Foundry | 1 iron ingot (any grade) or 2 stone | 5 s (s) |
| Catapult stone / ballista bolt (5) | Great Workshop / Manufactory | 1 stone / 2 hardwood lumber, 1 wrought iron | 10 s / 30 s |
| Bandage / healing remedy | Herbalist hut | 1 herb, 1 flax (or leather) heals 30 over 15 s / 2 herbs, 1 glass bottle heals 60 over 5 s | 10 s / 20 s |

Building costs below are paid in lumber and stone straight from the pool (workers hew on site, as the doc says for stone blocks); planks are only for items (s).

**2c. Worker tools (one tool set per tier is one equipment item covering axe, pick, hoe, sickle and so on; the worker shows the right one for its job (s))**

| **Tier** | **Gather speed** | **Worker damage** | **Weight** | **Recipe** | **Made at** | **Time** |
|---|---|---|---|---|---|---|
| Hardwood (axe, digging stick, mallet, hoe) | x1.0 (s) | 4 | 3 lb (s) | 3 hardwood sticks (s) | Big House | 10 s (s) |
| Flint (axe, pick, knife) | x1.25 (s) | 5 (s) | 3 lb (s) | 2 sticks, 1 flint (s) | Big House | 10 s (s) |
| Copper (axe, pick, sickle, hoe) | x1.5 (s) | 6 (s) | 4 lb (s) | 1 copper ingot, 1 hardwood lumber (s) | Forge 1 | 20 s (s) |
| Bronze (axe, pick, sickle, saw, hoe) | x1.75 (s) | 7 (s) | 4.5 lb (s) | 1 bronze ingot, 1 hardwood lumber (s) | Forge 1 | 20 s (s) |
| Bloom iron (axe, pick, sickle, plough, saw, hoe) | x2.0 (s) | 8 (s) | 4 lb (s) | 1 bloom iron, 1 hardwood lumber (s) | Forge 2 | 25 s (s) |
| Wrought iron | x2.25 (s) | 8 (s) | 4 lb (s) | 1 wrought iron, 1 hardwood lumber (s) | Forge 3 | 25 s (s) |
| Refined iron | x2.5 (s) | 9 (s) | 4 lb (s) | 1 refined iron, 1 hardwood lumber (s) | Forge 4 | 25 s (s) |
| Steel | x3.0 (s) | 10 (s) | 4 lb (s) | 1 steel, 1 hardwood lumber (s) | Forge 4 | 30 s (s) |
| High-quality steel | x3.5 (s) | 11 (s) | 4 lb (s) | 1 HQ steel, 1 hardwood lumber (s) | Forge 4 | 40 s (s) |
| Fishing rod / net | 1 fish per 15 s / per 10 s (s) | 1 (s) | 1 lb / 3 lb (s) | 2 softwood lumber, 1 flax or leather (s) | Big House | 10 s (s) |
| Prospecting hammer | prospect in 20 s (s) | as tier | 2 lb (s) | 1 any metal ingot, 1 hardwood lumber (s) | Forge | 15 s (s) |

What each tier may gather is the Progression table; dig speed has its own scale in table 10.

**2d. Melee weapons (arc hits: main target full damage, others within reach in a 90 degree arc take half (s))**

| **Weapon** | **Tier** | **Damage** | **Attack time** | **Reach / min** | **Hit** | **Weight** | **Recipe** | **Made at** | **Time** |
|---|---|---|---|---|---|---|---|---|---|
| Hardwood club | 1 | 8 (s) | 1.3 s (s) | 1.2 m | arc, blunt | 2 lb (s) | 3 sticks (s) | Big House | 10 s (s) |
| Hardwood spear | 1 | 9 (s) | 1.4 s (s) | 2.5 / 1.0 m | stab | 3 lb (s) | 4 sticks (s) | Big House | 10 s (s) |
| Flint axe | 2 | 10 (s) | 1.3 s (s) | 1.2 m | arc | 3 lb (s) | 2 sticks, 1 flint (s) | Big House | 10 s (s) |
| Flint-tipped spear | 2 | 12 | 1.4 s | 2.5 / 1.0 m (s) | stab | 3.5 lb (s) | 3 sticks, 1 flint (s) | Big House | 10 s (s) |
| Copper axe | 3 | 12 (s) | 1.3 s (s) | 1.2 m | arc | 3.5 lb (s) | 1 copper ingot, 1 hardwood lumber (s) | Forge 1 | 20 s (s) |
| Copper dagger | 3 | 9 (s) | 0.8 s (s) | 1.0 m (s) | stab | 1 lb (s) | 1 copper ingot (s) | Forge 1 | 15 s (s) |
| Bronze sword (short) | 4 | 16 (s) | 1.2 s (s) | 1.2 m | arc | 3 lb (s) | 2 bronze, 1 hardwood lumber, 1 leather (s) | Forge 1 | 30 s (s) |
| Bronze spear | 4 | 18 (s) | 1.4 s (s) | 2.5 / 1.0 m | stab | 4 lb (s) | 1 bronze, 1 hardwood lumber (s) | Forge 1 | 25 s (s) |
| Iron sword (bloom / wrought / refined) | 5, 6, 7 | 18 / 21 / 24 (s) | 1.2 s (s) | 1.2 m | arc | 3 lb (s) | 2 iron of that grade, 1 hardwood lumber, 1 leather (s) | Forge 2 / 3 / 4 | 30 s (s) |
| Iron mace (bloom / wrought / refined) | 5, 6, 7 | 17 / 20 / 23 (s) | 1.4 s (s) | 1.2 m | arc, blunt | 3.5 lb (s) | 2 iron, 1 hardwood lumber (s) | Forge 2 / 3 / 4 | 30 s (s) |
| Iron halberd (bloom / wrought / refined) | 5, 6, 7 | 24 / 28 / 32 (s) | 1.6 s (s) | 2.5 / 0.8 m (s) | arc; hits low flyers | 7 lb (s) | 3 iron, 2 hardwood lumber (s) | Forge 2 / 3 / 4, Halberds | 40 s (s) |
| Steel sword | 7 | 30 (s) | 1.2 s | 1.3 m (s) | arc | 3 lb (s) | 3 steel, 1 hardwood lumber, 1 leather (s) | Forge 4 | 45 s (s) |
| Steel pike | 7 | 34 (s) | 1.6 s (s) | 3.5 / 1.5 m (s) | stab | 7 lb (s) | 2 steel, 3 hardwood lumber (s) | Forge 4 | 40 s (s) |
| Steel halberd | 7 | 38 (s) | 1.6 s (s) | 2.5 / 0.8 m (s) | arc | 7 lb (s) | 3 steel, 2 hardwood lumber (s) | Forge 4, Halberds | 45 s (s) |
| High-quality steel sword / pike / halberd | 7+ | 36 / 40 / 45 (s) | as steel | as steel | as steel | as steel | same recipe in HQ steel (s) | Forge 4, HQ steel | 60 s (s) |

**How these were set:** the roster's "about 35" for a veteran's steel sword is the steel sword 30 x1.2 at Hero; everything else is spaced so each metal tier adds about 25% and each iron grade about 15%. Refurbishing any item returns its full recipe in a tenth of its make time (doc).

**2e. Ranged weapons and munitions (a shooter reloads only while standing still (s))**

| **Weapon** | **Damage** | **Attack time** | **Range** | **Spread** | **Munition** | **Weight** | **Recipe** | **Made at** | **Time** |
|---|---|---|---|---|---|---|---|---|---|
| Sling | 8 blunt (s) | 2.0 s (s) | 20 m (s) | 8% of range (s) | 1 stone = 50 shots (s) | 0.5 lb (s) | 1 leather or 1 flax (s) | Big House | 10 s (s) |
| Javelin, flint / bronze | 14 / 20 (s) | 2.5 s (s) | 15 m (s) | 5% (s) | the javelin; a bundle of 5 is one item, thrown ones are used up (s) | 2 lb each (s) | 5 sticks, 1 flint gives 5 / 5 sticks, 1 bronze gives 5 (s) | Big House / Forge 1 | 15 s (s) |
| Bow | 10 + tip (s) | 2.0 s (s) | 25 m; 28 m with a spider-silk string (s) | 6% (s) | arrows, quiver 24 | 2 lb (s) | 2 softwood or hardwood lumber, 1 sinew, flax or silk (s) | Big House, Flint tools; a Workshop (tier 2) shapes the stave and halves the time (doc) | 20 s (s) |
| Crossbow | 22 + tip (s) | 3.0 s (s) | 28 m (s) | 4% (s) | bolts, case 20 (s) | 8 lb (s) | 2 wrought iron, 2 planks, 1 flax or leather (s) | Forge 3 with a Great Workshop (doc), Crossbows | 45 s (s) |
| Steel crossbow | 32 + tip (s) | 4.5 s (s) | 34 m (s) | 3% (s) | bolts | 15 lb (s) | 2 steel, 1 wrought iron, 2 planks, 1 flax (s) | Forge 4 with a Great Workshop (doc), Steel crossbow | 60 s (s) |
| Flintlock musket, iron / steel barrel | 50 / 60 (s) | 8.0 s (s) | 40 m (s) | 5% / 4% (s) | 1 charge + 1 ball per shot (s) | 10 lb | 3 wrought iron or 1 steel, 2 planks, 1 flint (s) | Forge 3 / 4 with a Manufactory (doc), Muskets | 90 s (s) |
| Arrows (batch of 10) | bow + tip |  |  |  |  | 2 oz each | 1 softwood lumber, 1 feather, plus tips: 1 flint per 10, or 1 ingot per 20 (s) | Big House (flint), Forge (metal) | 15 s (s) |
| Bolts (batch of 10) | crossbow + tip |  |  |  |  | 2 oz each | 1 hardwood lumber, 1 feather, plus tips as arrows (s) | Forge 3+ | 15 s (s) |
| Tip bonus | flint +0, bronze +3, bloom +4, wrought +5, refined +6, steel +8, HQ steel +10 (s) |  |  |  |  |  |  |  |  |
| Poison arrows or bolts | +15 over 5 s |  |  |  |  |  | 1 venom coats 10 | Herbalist hut | 10 s (s) |
| Fire arrows | +5 and sets wood burning 4 per s for 5 s (s) |  |  |  |  |  | 1 resin coats 10 (s) | Big House | 10 s (s) |
| Quiver / bolt case / powder horn (20 charges) / shot pouch (20 balls) |  |  |  |  |  | 1 lb each empty (s) | 1 leather each (s) | Tannery | 10 s (s) |

Damage to walls and buildings: arrows, bolts and sling stones 0; javelin 1; musket ball 2; fire arrow the burn only (s). Blunt hits follow the roster's skeleton rule (+50%).

**2f. Mechanical units (do not eat, never heal, repaired by workers; wheels need ramps (doc))**

| **Unit** | **Damage** | **Range (min)** | **Reload** | **Crew** | **Health** | **Haul speed** | **Recipe** | **Made at** | **Time** |
|---|---|---|---|---|---|---|---|---|---|
| Bronze cannon | 150, 50 splash in 2 m; 400 vs walls (s) | 60 m (10 m) (s) | 12 s (s) | 2 cannon crew (s) | 400 (s) | horse 2.5, ox 1.5, crew pushing 1.0 m/s (s) | 20 bronze ingots, 10 hardwood lumber (s) | Foundry, Cannons | 180 s (s) |
| Iron cannon | as bronze (s) | as bronze | 12 s (s) | 2 | 500 (s) | as bronze | 12 wrought iron, 10 hardwood lumber (cheaper than bronze, as the doc says) (s) | Foundry, Cannons, Forge 3 | 150 s (s) |
| Catapult | 80 in 3 m; 200 vs walls (s) | 50 m (15 m) (s) | 15 s (s) | 2 warriors, no training (s) | 300 (s) | horse 2.0, ox 1.5, crew 0.8 (s) | 40 hardwood lumber, 20 planks, 10 rope, 10 bronze (s) | Great Workshop (doc), Siege engines | 240 s (s) |
| Ballista | 90, pierces 2 targets in a line; 20 vs walls (s) | 45 m (5 m) (s) | 8 s (s) | 1 warrior, no training (s) | 250 (s) | horse 2.5, ox 1.5, crew 1.0 (s) | 40 hardwood lumber, 20 wrought iron, 10 rope (s) | Manufactory (doc), Siege engines, Forge 3 | 240 s (s) |
| Hand cart |  |  |  | 1 worker pushes at 2.0 m/s (s) | 100 (s) |  | 6 planks, 4 hardwood lumber (s) | Workshop tier 2 (doc) | 60 s (s) |
| Ox cart |  |  |  | driven by 1 worker (s) | 200 (s) | ox 1.5, horse 2.5 m/s (s) | 12 planks, 8 hardwood lumber, 4 leather, 2 wrought iron (doc: a little iron) (s) | Great Workshop (doc) | 120 s (s) |

A cannon shot uses 1 gunpowder charge and 1 cannonball; a musket shot 1 charge and 1 ball (doc). Capacities are in table 12.

#### Balance notes (suggested)

Tuning notes that go with the number tables: which open questions they answer, and the pacing they were designed for. All suggested.

**Questions the tables answer**

- 1. Dig speeds per tool tier: Jade's steel day sets the scale; the per-tier curve is mine (table 10).
- 2. Shield block: Jade capped the best shield at 30%; the ladder 10 / 15 / 20 / 25 / 30 is mine (table 3).
- 3. Training limit: Jade's two levels above the start; the rank names, health and XP steps are mine (tables 1 and 7).
- 4. Foods per cooking tier: mine (table 6).
- 5. First marble main base level: Jade's level 5; the marble amounts, and marble in the Grand Academy, are mine (table 4).
- 6. Upper workshop tiers: the doc's new list (bows, crossbows and muskets with the forge, carts, catapults, ballistas); the costs are mine (tables 2 and 4).
- 7. Mineshaft tiers: 3, unlocked by Deep Mining I, II, III with silver and gold in the higher fees (doc); the fee amounts are mine (table 4).
- 8. Claimed land: Jade's 5 m and 10 m (table 8); the light radii beyond that are mine (table 18).
- 9. Random night events: the doc's single fog night; its 10% chance is mine (table 8).
- 10. Blood night trigger and warning: Jade set it: the players occupy 60% of a single band, once per band, none in the Deadlands; "occupy" as claimed cells checked at dusk, the night 13 floor and the dusk warning were delegated by Jade and are decided; no stronger variants (table 8).
- 11. Start pocket amounts: mine; the starter food (15 meat, 10 fish, 10 eggs for 10 days) is confirmed by Jade (table 9).
- 12. Village specialisations, mercenary camps and surrender: the doc's suggestions, priced by me (table 11).
- 13. Halfling villages: placed at generation (doc); the count and the 120 m stand-off are mine (table 9).

Not touched (outside the 19 tables): the exact carving size beyond the bite rule, and more peoples.

**Pacing check**

Worker-day income with hardwood tools and a 30 m walk: 20 softwood lumber (15 s a load plus 20 s walking, about 5 loads in 3 minutes less overheads), 25 loose stone, 12 fish by rod; with flint tools 25 copper or tin ore. A tier 1 farmer makes 6 wheat (12 nutrition, feeds 6). A forge worker smelts 36 copper ingots a day (s) if ore is there. Worker-minutes per building (ws / 60): Lodge 4, Forge 1 5, Kiln 5, main base 2 to 10: 7, 7, 8, 10, 13, 17, 20, 25, 33; Bloomery 5, Ironworks 8, Steelworks 15, Powder mill 5, Foundry 10, Gunnery yard 10 (s), stone wall 1 per 3 columns.

Time to each tier, steady play, counting days (nights) from the start:

- Flint: day 0 (Lodge 60 lumber from the 40 start stock plus 20 chopped, Flint tools 60 s, 4 flint tool sets 40 s).
- Bronze: Forge 1 day 1; 2 miners on copper 2 days = 100 ore = 50 ingots, tin 30 ore = 15 ingots; Bronze research day 2 to 3 (10 copper, 2 tin, 75 s); 44 bronze ingots by day 4 arms 5 warriors with sword, scale and shield (8 each) and the workers with bronze tools: night 4 to 6. Target 4 to 6 (s).
- Iron: main base 3 (day 5 to 6, 6 workers), Kiln with 20 Fringe clay (day 6), Bloomery (day 6 to 7): bloom iron night 7 to 9; base 4 (day 8 to 9), base 5 with 20 bricks, 20 marble from a Fringe marble rock and 75 hardwood from the Fringe (day 11 to 13, 10 workers), Ironworks (day 13 to 15): wrought iron, crossbows and mail night 14 to 16. Target 13 to 18 (s).
- Steel: base 6 (day 17 to 19), base 7 (day 21 to 23), Steelworks (day 24 to 26), vein iron from a Deepwoods ridge by ox cart (the cart from a Great Workshop on day 15 to 16, the first 120-ore load home by about day 20) or a tier 2 mineshaft, Steel research 150 s: steel night 26 to 29. Target 25 to 30 (s).
- Gunpowder: Powder mill (day 22 to 24), base 8 (day 30 to 33), Foundry and Gunnery yard (day 34 to 37), 5 sulphur for the research from one Barrens hot spring (a 10-minute run, 20 a spring) or the Deadlands (a 16-minute run each way, one ox cart carries 240 sulphur, about 5 days a round trip) or skeleton bomber drops, then Gunpowder, Muskets and Cannons research (540 s, 3 days on one lodge, about 2 at a Grand Academy): muskets night 40 to 44, cannons night 43 to 46. Target 40 to 48 (s).

Wave versus a reasonable defence (single-player budgets without depth weighting; mob stats roster 5.0; damage after table 3 armour):

- Night 0, budget 12: 4 zombies, 2 bats, 2 rats, 1 giant spider, 1 slime against 1 warrior (flint spear, 8.6 damage a second), 4 workers (2.7 each) and a 300 HP softwood fence. The warrior kills a zombie in 7 s stabbing over the fence (reach 2.5 m); 4 zombies chewing one column (2.5 a second each, 10 total) need 30 s to break it and are all dead at 28 s, so the fence holds. Rats climb in 4 to 6 s and die to the four workers in 3 s each; bats die to 3 stabs each; the spider is the danger (ruling 10 below: about 9 s and 60 damage with everyone on it, a dead warrior if it is met alone); the slime (half damage from stabs) takes 21 s. About 70 s of fighting in a 180 s night with the first arrival at about 35 s. Tight, survivable with the workers fighting, and it teaches the fence.
- Night 10, budget 46: 2 bloated corpses, 2 bombers, 6 skeleton archers, 8 zombies, 3 rats, 2 bats, 1 slime (about 1570 HP) against 6 warriors in bronze or bloom iron behind a hardwood fence (s). A bloated corpse does 8 a second through bronze scale and bursts for 28; a bomber breaks a softwood column (220 vs 300) but not hardwood. The night-13 blood night now meets wrought iron (s).
- Night 20, budget 88: about 3500 HP of hounds, goblins, bombers and corpses against 10 warriors in wrought iron and mail, 4 crossbows and the first stone walls (s). Hounds at 5.5 m/s reach sheltered workers only if a gate is open.
- Night 40, budget 196: about 8800 HP including a bone colossus (900 HP, 30%, 120 a hit on walls, 36 s per stone column) and a hollow priest raising zombies, against 16 steel warriors (HQ steel from about night 30), 8 crossbows, 2 to 4 mages and stone walls; muskets land on nights 40 to 44 and are not counted (s).
- Night 60, budget 336: about 13400 HP of fiends, hellhounds, scorchwings, cinderlings and Rift beasts against 25 HQ steel warriors, 8 muskets, 2 cannons, 4 mages and stone walls (cinderlings burn wood) (s).
- Night 80, budget 508: about 23000 HP including demon brutes (1400 HP, 35%, 180 a hit: a stone column in 22 s) and void stalkers (triple first strike of 90 on a 100 HP mage) against 30 HQ steel warriors at about Elite rank, 15 muskets, 4 cannons, 6 mages and the Citadel ports (s). Mages stand behind warriors.
- Night 110 (unchanged; gear is complete by about night 55, so only ranks, numbers and walls grow after that), budget 826 plus Morvath (25000 HP, 50%, Violet ruin 300 in 20 m with 3 s warning, 105 through plate): 30 Hero warriors (about 540 a second after his armour, at +20%), 15 muskets (56), 4 cannons (25), 6 battle mages (about 90) make about 710 a second: Morvath falls in about 35 s of concentrated fire and the rest of the wave (about 37000 HP) in about 52 more. About 87 s of pure damage in a 180 s night, so he is beaten with losses on a good night and wins on a bad one, which is what a boss should do.

Supply and food at night 110: main base 10 (50) and 10 tier 3 farms (80) carry 130 units; 105 units eat 210 nutrition a day, which 7 tier 3 wheat farmers through the Grand Kitchen (12 wheat a day each, as bread 30 nutrition) provide.

### Magic

Magic is used by a special unit type, the **mage**. Novice mages are common; powerful mages are rare, because the top ranks can only be reached through combat experience.

#### Mage types

- **Support mage:** heals and gives allies temporary stat boosts.
- **Warding (suggested):** a support mage spell. Friendly units within 8 m take half damage from enemy spells for 30 seconds.
- **Battle mage:** attacks with elemental and arcane spells. Some spells are projectiles, such as a fireball; others are non-projectile and hit with no projectile (see "Combat").
- **Battle mage spells (suggested):** fireball (projectile), arcane bolt (a violet-white orb, projectile), beam (a continuous line of damage), and area blast (a ring of damage around a point).
- **Counterspell (suggested):** a battle mage spell that cancels one enemy spell being cast within range. Warding and Counterspell are researched at the Magi Sanctum with hexstone.

More types will be added later.

#### Mage ranks and mana

Every mage has its own mana bar, which spells use up and which refills over time. Being in combat stops the refill for 10 seconds. Higher ranks refill faster:

| **Rank** | **Refill speed** | **Time to refill an empty bar** |
|---|---|---|
| Novice Acolyte | Base | 2 min 0 s |
| Acolyte | 10% faster | about 1 min 49 s |
| Adept Acolyte | 20% faster | 1 min 40 s |
| Mage | 30% faster | about 1 min 32 s |
| Master Mage | 40% faster | about 1 min 26 s |
| Grand Magician | 55% faster | about 1 min 17 s |

- Mages are trained at the **Magi Sanctum**, and at main bases of level 6 or higher.
- All mages are female, and they cast spells with wands (see "Unit models").
- Mages with ranged spells can fight from towers and from the parapets of a level 3+ main base.

#### Table 13: Mage spells and mana

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Mana bar per rank (s): 100, 120, 140, 160, 180, 200; refill per second from the doc's times: 0.83, 1.10, 1.40, 1.74, 2.09, 2.60. Each rank adds one spell and keeps the earlier ones, and Hexcraft research adds Warding and Counterspell at rank 2; spell power scales x1.0 to x1.5 by rank (table 1). Cast time 1.0 s (s). Non-projectile spells need line of sight to cast and then always land (doc).

| **Spell (clip)** | **Mage** | **From rank** | **Mana** | **Cooldown** | **Range** | **Projectile** | **Effect** |
|---|---|---|---|---|---|---|---|
| Heal (cast_heal) | support | 1 | 15 (s) | 2 s (s) | 12 m (s) | no | one ally regains 30 over 3 s (s) |
| Quicken (cast_bolt) | support | 2 | 20 (s) | 10 s (s) | 12 m (s) | no | one ally moves and attacks 25% faster for 8 s (s) |
| Fortify (cast_area) | support | 3 | 30 (s) | 15 s (s) | 10 m (s) | no | allies within 5 m get +15% armour for 10 s (s) |
| Rally (cast_beam) | support | 4 | 40 (s) | 20 s (s) | 12 m (s) | no | allies within 6 m do +20% damage for 10 s and are cured of poison and hexes (s) |
| Arcane bolt (cast_bolt) | battle | 1 | 10 (s) | 1.5 s (s) | 18 m (s) | yes | 20 damage to one target; 2 vs walls (s) |
| Beam (cast_beam) | battle | 2 | 25 (s) | 6 s (s) | 14 m (s) | no | 12 per second for 3 s to one target (s) |
| Fireball (cast_bolt) | battle | 3 | 30 (s) | 8 s (s) | 22 m (s) | yes | 35 to the target, 15 to everything within 2 m; x3 vs wooden walls and buildings, 30 vs stone, sets wood burning 8 per s for 5 s (s) |
| Area blast (cast_area) | battle | 4 | 50 (s) | 15 s (s) | 16 m (s) | no | 45 to everything within 4 m of the point, 40 vs walls (s) |
| Warding (cast_area) | support | 2, with Hexcraft | 30 (s) | 30 s (s) | 10 m (s) | no | units within 8 m of the point take half damage from enemy spells for 30 s (Jade) |
| Counterspell (cast_bolt) | battle | 2, with Hexcraft | 20 (s) | 8 s (s) | 18 m (s) | no | cancels one enemy spell while it is being cast within range (Jade); the enemy's mana and cooldown are still spent (s) |

No ward item (Jade): mages do it as spells and hexstone is the research reagent. Hexcraft (the name is (s)): researched at the Magi Sanctum (not a lodge) for 6 hexstone and 20 herbs in 90 s (s), and opens Warding and Counterspell for every mage of rank 2 or higher (table 2a).

Elf Grovesinger (s): health 100, mana 150, refill 1.5 per s within 20 m of a living tree, 0.75 elsewhere, 0.3 in the Barrens and Deadlands. Rootbind: 30 mana, 12 s, 20 m, non-projectile, holds enemies within 4 m still for 3 s. Thorn volley: 20 mana, 4 s, 20 m, projectile, 5 thorns of 8 at up to 5 targets. Barkskin: 30 mana, 20 s, 10 m, allies within 6 m +25% armour for 10 s. Mending bloom: 30 mana, 15 s, 12 m, allies standing within 4 m regain 5 per s for 8 s. Call of the wild: 40 mana, 60 s, wild animals within 30 m fight for the Elves for 15 s.

**How these were set:** an Arcane bolt every 1.5 s costs 6.7 mana per second, so a Novice (0.83 per s refill) empties a 100 bar in about 20 s of casting and then fires one bolt every 12 s; a Grand Magician (2.6 per s, 200 bar) keeps up a bolt every 4 s indefinitely. Battle mages are support for the line, not a replacement for it, until the top ranks.

### Terrain

The land is natural-looking ground that players can dig into, tunnel through and build up. How the world is laid out (cells, barriers and depth bands) is in "The world"; this section is about the land itself. Parts marked "(suggested)" are starting values to tune in play.

#### What the land is made of

- The land looks like **stacked, unrotated cuboids of many sizes**. A wide, flat field looks like a few huge cuboids; rough ground, cliffs and rubble look like many small ones. This matches the art style: everything is made of cubes, but not of fixed-size blocks.
- **Columns:** the land is stored as columns on a grid. Across the ground there is one column every stride (4 terrain units, about 45 cm). Heights are measured in **terrain units** of about 11 cm (about half a human head). Each column holds a short list of solid layers, each with a bottom, a top and a material. Overhangs, arches, caves and tunnels are simply columns with more than one layer.
- **Drawing:** only the faces of the land that touch air are drawn, and neighbouring columns of the same material and height are merged into one large face. That is what gives cuboids of many sizes on screen without storing them as cuboids. Far-away chunks are drawn with less detail.
- Each layer has a **material**: soil, sand, gravel, clay, stone, marble, ore-bearing rock and so on. The ground is layered, usually soil on top, then clay, sand or gravel in places, then stone, with ore in places deeper down. The material decides what carving it gives and how hard it is to break.
- Within each cell of the world (see "The world"), generation from the seed shapes the land into natural forms, as natural as the cuboid style allows: stepped hills, terraces, cliffs, rock layers, scattered boulders, overhangs, natural arches and caves. Edges are kept uneven so that hills do not look like pyramids.
- **Saving:** the untouched land is rebuilt from the seed every time it is loaded. Only the changes players make are stored, chunk by chunk (which column layers changed), together with the water in chunks where water has moved. A save stays small however large the world gets.
- **Scenery:** grass, pebbles, small bushes and flowers are decoration only. They are drawn in large batches, have no collision, cannot be gathered and are not game objects. They disappear where the land is dug away or built on. Trees, gatherable bushes (such as hazel bushes), gatherable rocks and ore are real game objects, but they are generated in code rather than made as models (see "Generated rocks and trees").

#### Generated rocks and trees

- **Rocks and ore outcrops** are small clusters of stone cuboids in the terrain's own style, with an ore texture where they hold ore. Each is generated from the world seed, so every one looks different and sits naturally in the land.
- **Trees** are generated in code from a set of settings for each species: tall, tiered softwood; small hardwood; thick, broad large hardwood; and multi-stemmed hazel bushes that grow back from the stump. The generator also gives the growth stages (seed, sapling, full size) from the tree's age.
- Generation is **deterministic** from the world seed, so every player's computer grows exactly the same tree, which lockstep multiplayer needs. Each tree is built from a small set of parts so trees can be drawn with instancing.
- **Species (suggested):** pine, spruce and small softwood (Heartland and Fringe); birch and hornbeam (Fringe); great oak and great beech (Deepwoods); dead trees and twisted thornwood (Barrens and Deadlands).
- One **reference tree per species** is made in Blockbench to set the look, which the generator then varies. These are on the models wishlist (see "Visuals").
- **Hit feedback:** when an axe hits a small tree (at the key moment of the chop animation) or a projectile hits it, the tree gives a tiny, quickly fading shake at its base for about a fifth of a second. The thicker the trunk, the smaller the shake. Big trees only get a faint rustle of the canopy. For now only trees react like this; buildings do not flinch, and units have their own injured animation (see "Unit models").
- **Hit particles:** generated in code, like the rocks and trees. Anything hit or attacked gives off a small burst of particles to match: blood from flesh, sparks from metal, and chips of stone or wood from rock, trees, walls and buildings.

Why this approach: a fixed grid of small blocks would force one block size and need millions of blocks, and a smooth height map could not have overhangs, arches, caves or tunnels. Columns of layers allow all of those, are cheap to edit, to find paths over, to flood with water and to save, and still look like cuboids of many sizes. Storing a column every 45 cm instead of every 11 cm means 4,096 columns in a 28.8 m chunk instead of about 65,500, which makes generation, drawing, pathfinding and water roughly 16 times cheaper. In a browser that is the difference between smooth and stuttering.

#### Moving over the land (suggested)

Units walk up small rises as if they were stairs, jump or clamber up slightly taller ones, and are completely blocked by anything taller, such as a cliff or a large boulder. Height is compared between neighbouring columns, one stride apart (about 45 cm).

| **Rise to the next spot** | **What a person-sized unit does** |
|---|---|
| Up to 2 units (about 22 cm, a stair step) | Walks up at full speed. In slope terms, ground up to about 25 degrees steep. |
| 3 to 4 units (about 33 to 45 cm) | Jumps or clambers up, which slows it down for a moment. Ground up to about 45 degrees steep. |
| 5 units or more (about 55 cm and up) | Blocked. Cliffs, large boulders and steep rock faces cannot be crossed; units find a way around. |
| A drop of up to about 9 units (1 m) | Steps or jumps down. |
| A drop of more than 1 m | Treated like a cliff: units never path off it. |

- These values are set per unit type and scale with size: big creatures step and jump higher, small ones lower.
- **Wheeled things** (carts and cannons on wheels) can only roll over rises of 1 unit and cannot jump, so they need ramps and level ground (see "Digging and building up the land").
- **Water:** units wade through water up to about waist height (about 1 m). Deeper water blocks walking units (see "Water").
- Climbing monsters (see "Threats") ignore the climb limit, as they do with walls. Flyers ignore terrain.
- A spot can only be stood on if there is enough headroom above it for the unit, so tunnels and cave passages have to be tall enough for the units that will use them.
- Because jumping slows units down, pathfinding prefers smooth routes when they are not much longer.
- Whenever the land changes (digging, filling, a building placed or destroyed), only the affected part of the walkable map is rebuilt.

#### Digging and building up the land

- Workers can dig with the **Dig** command: mark an area of ground, choose how deep, and the workers carve it out. Only workers can dig.
- **Dig rate (Jade's rule):** one worker with good steel tools takes **a full day** to carve a human-sized chunk of stone, or to dig a trench 1 m wide, 1 m long and 3 m deep. Worse tools are slower, and wooden tools basically never break through stone. The rate for each tool tier is scaled from this (see table 10). This replaces the earlier rate of 1.25 cubic metres per worker-minute and its trench and moat examples.
- **Carving bites (suggested):** each bite a worker takes varies by about a quarter either way around the mean for its tool tier, and the time taken is in proportion to the volume removed.
- **Pieces and steps:** the terrain unit (about 11 cm) is a unit of digging work, not the size of the steps the land changes in. The land's shape changes one column at a time (45 cm across) in 11 cm steps of height, so carving a slab 45 cm by 45 cm by 11 cm takes 16 pieces of work. At the dig rate a worker moves many pieces with every swing, so the digging animation is not one swing per piece.
- **Sea level** is the height reference for digging. There is no sea; it is only a reference point. The start basin and the main bases begin at about sea level.
- **Dig limit:** workers can dig down to **3 m below sea level**, or to 3 m below the natural ground if the land there was already lower than that. The natural ground is the land as it was generated, before anyone dug or built on it. Reaching deeper underground is what mineshafts are for.
- In practice: on flat ground at sea level, workers can dig a hole, trench or moat about 3 m deep. At the bottom of a natural ravine 5 m below sea level, they can still dig about 3 m deeper (to 8 m below sea level). From the top of a 20 m cliff, they can dig all the way down through the cliff to 3 m below sea level.
- **Into hillsides, cliffs and mountains,** workers can dig tunnels sideways, all the way through if they have the time, as long as the tunnel stays above the dig limit. This is how a pass is cut through a mountain range. Vein iron lies inside the rock of ridges and mountains, so tunnelling through one can expose ore (see "The world").
- Carving gives resources depending on the material: stone from rock (one of the ways to collect stone), clay from clay, sand from sand, gravel from gravel, marble from marble, ore from ore-bearing rock, and **Earth** from soil.
- Players can **build the land up** with **Earthworks** in the basic build menu: ramps, earth banks and filling holes and ditches. Ramps can be built from Earth, any type of lumber or stone; earth banks and fill are made from Earth. Lumber and stone ramps are made at a workshop, then placed by workers; earth ramps, banks and fill are built on the spot. All of them are placed like walls, by dragging, with a see-through preview of the new shape.
- **Moats and trenches** are real defences, strong but not absolute. A trench too deep to climb out of cannot be crossed on foot, so walking monsters have to go around it or break a way through something. Wall-breakers can smash a trench edge into a crossing: slower than breaking a softwood wall, faster than breaking stone. Climbers and flyers still cross it, as with walls.

#### Table 10: Dig speeds and break costs

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** steel = 3 m3 of soil a day (1.0 a minute) and a human-sized chunk of stone (0.35 m3) a day; hardwood half the soil rate and no stone; the tiers between on a rising curve with flint and copper barely scratching stone; high-quality steel a little above steel (the scale the coordinator gave; the per-tier figures (s)).

| **Tool tier** | **Soil, m3 per worker-minute** | **Stone, marble and ore rock** | **Clay, sand, gravel** | **10 m3 trench, 4 workers** | **300 m3 moat, 4 workers** |
|---|---|---|---|---|---|
| Hardwood | 0.5 (s) | 0, cannot (Jade) | 0.4 (s) | 5 min (1.7 days) | 150 min (50 days of daylight) |
| Flint | 0.55 (s) | 0.005 (s) | 0.45 (s) | 4.5 min | 136 min (45 days) |
| Copper | 0.6 (s) | 0.01 (s) | 0.5 (s) | 4.2 min | 125 min (42 days) |
| Bronze | 0.7 (s) | 0.03 (s) | 0.55 (s) | 3.6 min | 107 min (36 days) |
| Bloom / wrought / refined iron | 0.75 / 0.8 / 0.9 (s) | 0.05 / 0.065 / 0.09 (s) | 0.6 / 0.65 / 0.7 (s) | 3.3 / 3.1 / 2.8 min | 100 / 94 / 83 min (33 / 31 / 28 days) |
| Steel | 1.0 (Jade: 3 m3 a day) | 0.117 (Jade: 0.35 m3 a day) | 0.8 (s) | 2.5 min | 75 min (25 days) |
| High-quality steel | 1.1 (s) | 0.13 (s) | 0.9 (s) | 2.3 min | 68 min (23 days) |

Bite (s): the mean bite is one column 11 cm deep (0.022 m3), varying a quarter either way; a swing takes volume / rate, so about 1.3 s in soil and 11 s in stone with steel. A 2 m by 2 m tunnel 20 m long through a ridge (80 m3 of stone) is 285 worker-days with steel tools, so a pass is a mid-game town's project, not a trick.

Break cost for monsters, in the same points as wall health, per cubic metre (s): soil 200, clay 250, sand 120, gravel 150, stone 1500, marble 2000, ore-bearing rock 1500; a breaker must deal that much "vs walls" damage to open a 1 m wide crossing through each cubic metre, so a 2 m deep soil trench costs 400 (between a softwood wall at 300 and stone at 1500, as the doc wants), and the x3 comparison rule of the doc applies when it chooses between the trench and a wall. Earth from digging goes straight to the pool with no hauling (s). Marble carving needs bronze or better, ore rock needs the tool of its ore (table 5) (s).

#### Keeping digging fair

Digging and earthworks are a resource economy: time, pieces of work, materials out and Earth in. These rules stop them from becoming an easy win:

- **The ring moat:** a deep trench round the whole base is strong against walkers, but it takes many days to dig (see the moat example above), wall-breakers can smash an edge into a crossing, and climbers and flyers cross it anyway.
- **The mesa fortress:** building on a cliff-topped plateau with a single ramp up is meant to be strong. Its limits: mesas have thin soil or none, so no farms and little grass; isolated buildings are still destroyed at night; climbers go up cliffs; and the ramp is a chokepoint for both sides.
- **The mountain hall:** players can tunnel into a ridge and live inside. Unlit tunnels count as caves: monsters that flee the sun at dawn shelter in them, and cave-type lairs can appear in them unless they are inside claimed land. Tunnels also need headroom for the units that use them. Living underground only works with torches and gates.
- **Pit spam:** digging lots of shallow pits to confuse monsters does not work. Monster pathfinding uses a coarse map with costs, so pits only add a little cost, and every pit is work.
- **Earth from nowhere:** Earth only comes from digging soil, so land can only be built up with soil dug out somewhere else.

#### Water

- Water follows real-world logic. Every body of water holds a set amount: it flows downhill and fills low ground, and it can only spread as far as its volume allows.
- Water is one more layer in a column. It flows to lower neighbouring columns, fills low ground and settles. To keep this fast, water only moves near places where the land has changed, and it stops once it is level.
- **Rivers** are barrier edges between cells (see "The world"), fed from a source uphill with a fixed inflow, so they keep flowing. A channel dug from a river fills and keeps flowing. **Ponds** hold a fixed amount: a channel dug from a small pond only drains it into a thin layer, so a small pond will never fill a long river.
- **Fords** are a river's gaps, where it can be waded across.
- **Wading and swimming:** units wade through water up to about waist height (about 1 m). Deeper water blocks walking units. Unarmoured units can swim; armoured units cannot. Some monsters can swim.
- Rivers can be dug, redirected and drained. Draining or redirecting a river by digging a new channel is slow and easy to see, because it can reshape a defence for both sides.

#### Monsters and terrain

- Night monsters spawn at the dark edge of the explored map and in lairs, then walk in, and they almost never spawn inside claimed land (see "Threats"). So the land, walls, trenches and water decide which way they come.
- **Pathfinding:** monsters find their way on a coarse navigation map of tiles about 2 m across. Each tile has a walking cost for each kind of monster (walkers, climbers, flyers and breakers) and, for barriers, a break cost that depends on the material. Groups share "flow fields" for each target and each kind of monster. When the land changes, only the changed tiles are rebuilt. The fine 45 cm grid is only used to steer around nearby obstacles.
- Monsters that can break walls can also break terrain, but they would rather not. Every obstacle has a **break cost**: how long it would take that monster to get through, based on the material (soil is weak, stone is strong) or the barricade's strength.
- When a monster looks for a way to its target, it compares walking around with breaking through and takes the path of least resistance.
- Player-built barricades (walls, gates and buildings in the way) come first. A monster only breaks natural terrain instead when the barricade is much tougher than a nearby natural barrier that also forms part of the defensive line. Natural terrain counts as three times harder than it really is when the monster compares the two.
- **Lairs** are placed in cells with no player buildings, preferring cells next to claimed land, so pressure builds at the frontier, and the spots the land offers: caves at the foot of ridges, ravines and dead forest. They never appear inside claimed land.
- **Caves** form at the foot of barrier edges and in the deeper bands. They are dark by nature, and by day they are home to monsters that flee the sun.

#### Mineshafts and prospecting

- Gold and gems (emeralds, rubies and diamonds) are very rarely found in tiny amounts on the surface. Most come from mineshafts, along with ore, coal and stone.
- Minerals lie hidden underground, set by the world seed. A worker can **prospect** an area with the **Prospect** command, which gives a rough idea of whether a mineshaft there would be worth building. Suggested result: a rating of Poor, Fair, Good or Rich shown over the area for a while.
- A mineshaft can be built on **flat stone**.
- Mineshafts come in **tiers**. Each tier digs deeper and brings up better quantities of materials, and each needs a higher level of research. There are **3 tiers**, unlocked by the Deep Mining I, II and III research; costs and output are in tables 4 and 5.

### Multiplayer and saving

Up to 8 players play together against the world. Single player is the same game with one player.

#### Allies panel

Two buttons next to the resource bar open the multiplayer tools. Both are clickable, like every other control.

- **Allies** opens a list of the other players, with a "Share control" checkbox next to each. Ticking it lets that player command your units.
- **Send resources** opens a window with a row for each ally. The player picks a resource, enters an amount (or clicks +10, +100 or All), and clicks Send. Resources arrive immediately. There is no cooldown, no limit and nothing is lost in transit.

**What shared control allows:**

- Allies can select and order your units exactly like their own: move, attack, patrol, hold, gather, shelter and garrison. Shared units show a ring in your colour so they are easy to tell apart.
- Allies can never use your buildings or spend your resources. They cannot start buildings with your workers, train units at your buildings, or start research for you.
- You keep full control of your units too. If two players order the same unit, the latest order wins.
- Resources gathered by your units always go to your own pool, whoever ordered them to gather.
- Map pings (suggested): a player can click a Ping button and then a spot on the map or minimap to flash it for everyone, with a sound, to point out a threat or a target.

#### When a player is eliminated or leaves

- Their resources are split evenly between the remaining players.
- Their buildings and units become shared by all remaining players. Any remaining player can use those buildings, paying with their own resources.
- If an option at an inherited building needs a technology or building the eliminated player did not have, a player can still use it as long as they have that requirement themselves (or through another inherited building).
- Normal shared control while the owner is still playing does not give this technology access to allies.

#### Accounts and guests

- Players create an account with an email address, a password and a username. The username is also their in-game name, shown to other players and in the message panel.
- The usual account options are available, including "Forgot my password", which emails a link to set a new password.
- Players can also play as a **guest**. Before starting, the game warns them that a guest's progress will not be saved.
- A guest appears in game as "Guest" followed by a random 4-digit number (for example, "Guest 4821").
- Guests can join and host multiplayer games.
- If a guest clicks Save, the game pauses and offers to create an account. Once the account is made, the game is saved to the new account and play can continue.
- A game hosted by a guest can only be saved once the guest has created an account this way, since multiplayer saves are stored under the host's account.
- Saved games belong to the player's account, so they can be continued from any computer after logging in.

#### Saving and disconnects

- A game is meant to be played over many sessions.
- The game autosaves at every dawn.
- In single player the player can save at any time, even at night. In multiplayer the host can save at any time.
- A multiplayer game only runs with every player present. If someone disconnects, the game pauses and waits for them.
- If the player does not come back, the host chooses: save and quit, or carry on without them, in which case their resources, buildings and units are shared out as if they had been eliminated.

### Outside the match

Jade approved these as written. The details are Claude's suggestions.

- **Main menu:** New game, Load game, Join game, Settings, Account, and Quit. A reminder on the menu tells players to press **F11** for full screen.
- **Hosting and joining:** the host creates a game, picks a seed (or a random one) and gets an invite link and a short code. Friends open the link or type the code to join the lobby. In the lobby, players see each other, pick their colours and mark themselves ready; the host starts the game when everyone is ready.
- **Loading and save slots:** the Load screen lists the player's saved games, newest first, with the night count, players and last played date. Multiplayer saves sit under the host's account; to continue one, the host loads it and the other players rejoin by invite, and the game starts once everyone who was in it is back (as in "Saving and disconnects").
- **Settings:** graphics quality (low, medium, high), resolution scale, shadows on or off, view distance, music, effects and voice volume, hotkeys, and the camera sliders.
- **Seeds:** every game has a seed shown in the pause menu. Players can type a seed when starting a game to play the same world again or share it with friends.
- **Onboarding:** there is no tutorial. Instead, a short series of hints guides the first day: select a worker, gather wood, build, light a torch, shelter at dusk. Hints can be turned off in Settings.
- **Browsers:** the latest two versions of Chrome, Edge, Firefox and Safari on desktop computers. Phones and tablets are not supported.
- **Full screen:** the game reminds the player to press F11 for full screen when it starts, since some controls (such as Ctrl + number) only work in full screen.

### Audio

- **Music:** separate tracks for day, dusk, night and dawn, plus a blood-night track.
- **Unit voices:** short voice cues when units get orders, are hungry, are under attack, or run out of a resource.
- **Sounds:** chopping, mining, digging, building, hits, blocks, deaths, explosions, a torch being lit and snuffed out, horns at dusk and dawn, the idle-worker alert, map pings and an error sound.

## Visuals

Game assets are roughly inspired by Minecraft: everything is built from cubes. Unlike Minecraft, the cubes can be any size and any rectangular shape rather than fixed blocks. As in Minecraft, almost all cubes are not rotated. A few rotated cubes are allowed where needed, as long as the vast majority of cubes in the game are unrotated. In animations, some clipping is allowed so that movement looks lifelike.

Visuals follow the technology of the time. The main base, the research buildings, the forge, the cooking building and the workshop change their look with each upgrade, from log huts and campfires to stone, brick and finally a tall fortress. Tools, weapons and armour are attached to the character models, so the player can see at a glance how each unit is equipped.

Every model the game needs is described in two files kept by the modelling work: a stand-alone "models wishlist" that can be handed to an outside modelling artist or agent (art style, scale, how animations should work, and a description of each model), and an internal "models blueprint" covering the same plus the models already made. Rocks, ore and trees are generated in code instead (see "Generated rocks and trees").
