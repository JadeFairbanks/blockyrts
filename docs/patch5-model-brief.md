# Patch 5 model brief (extract for the Blockbench session)
Verbatim lines from Jade's Patch 5 notes, her decisions file, the thread split and the asset rules, extracted 2026-10-08. The source files live in the project's shared folder, not in this repository.

PART 1. patch5-items.md and patch5-decisions.md, by topic (verbatim)
Notation: [items] = patch5-items.md, [decisions] = patch5-decisions.md. Lines are copied exactly; '[excerpt]' marks a sentence lifted whole from a longer item.

==================================================================
1. General instructions: model style, scale, textures, Blockbench
==================================================================

--- [items] Opening lines (PRE)
**PRE-3.** Make any/modify models or animations for new content added. If I gave you a model(s) alongside this doc then it saves you having to make it. In addition to the added models related to content, I give you back the worker, warrior and mage model with improved animations (the old version had way too much clipping and nonsensical arm movement.) Make sure to use all of what I give you.


--- [items] Art style upgrades (AR), Jade's heading: ART STYLE UPGRADES (Less restrictions on amount of surfaces/detail.){
**AR-1.** (Less restrictions on amount of surfaces/detail.){

**AR-2.** 2. Art style — cuboid pixel art, with room for fine detail

**AR-3.** Everything is built from cuboids (axis-aligned boxes). Minecraft-inspired, but cubes may be any size and any rectangular proportion. No curved meshes, no smoothing, no bevels on the mesh itself.

**AR-4.** Almost all cubes stay unrotated (axis-aligned). A few rotated cubes are fine where they really help (slanted roof, bent bow, hanging sword). Bones rotate freely in animation.

**AR-5.** The overall look stays blocky and readable. That is the house style for bodies, buildings, props and most surfaces.

**AR-6.** Less-blocky silhouettes are welcome when the part needs it (insect or fairy wings, thin blades, flowing cloth edges, fine antlers, lace, foliage outlines, and similar). Achieve those with thin cuboid planes and pixel textures that use alpha cut-outs: fully opaque or fully transparent pixels, nearest-neighbour, no soft anti-alias fringe. The result is still made of little blocks and pixels — just arranged so the eye reads a cleaner curve or finer line.

**AR-7.** Pixel-art textures, nearest-neighbour filtering. Default density is 1 texture pixel per model unit, with a few flat tones per material and simple shading (darker bottom/edge, lighter top, small patterns for cloth, wood, scales, mail, rivets). No photographic textures, painted gradients or noise filters.

**AR-8.** Detail surfaces may use denser texel density (for example 8 texels per unit) and larger power-of-two atlases when thin linework or a smooth alpha-cut silhouette needs it. The rest of that model should still sit at the default density so the body stays crisp and blocky next to the fine part.

**AR-9.** Colour: natural, slightly muted, earthy for people, animals and buildings. Strong saturated colour is for magic, team colour and danger (monster eyes, glowing crystals). Metals:

**AR-10.** copper: orange-pink

**AR-11.** tin: pale silvery grey

**AR-12.** bronze: warm gold-brown

**AR-13.** bloom and wrought iron: dull dark grey

**AR-14.** steel: bright blue-white grey

**AR-15.** high-quality steel: bright with a faint blue sheen

**AR-16.** silver: white-grey

**AR-17.** gold: yellow

**AR-18.** Visuals follow technology: early = rough logs, hides, cords, stone. Later = planks, brick, cut stone, marble, polished metal, fine cloth.

**AR-19.** Readability first: recognisable from silhouette and a few colour blocks at small size. Exaggerate key features (weapon head, horns, eyes, crown, wings).


--- [items] Before we start (BS)
**BS-1.** Give me a list of 10-20 of the most vital questions before you start, and tell me if I didn’t give you one of the BB models I said I did, so I can fetch it for you.

**BS-3.** Always check if you have a model before adding it. For models that existed before this patch, you can add to or fix the animations as needed. For models added during this patch, if not included with this, then make them using the connector.

**BS-4.** I mentioned adding texture to things in the game. How would you go about this and are there any tools I should connect for you to make sure you do a good job making textures? If you need? I don't know what you need, tell me. Buildings can get better textures too. Like tree foliage should have leaves, grass should have patches of blades grass sticking up here are there (blades of grass wouldn’t stop building construction of course), rocks would have darker grey streaks and or patches in a way that adds depth and looks good, etc etc.

**BS-5.** Instructions to use a plugin that allows you to use blockbench on my computer: enabling higher quality models:

**BS-6.** IMPORTANT: Use Sonnet subagents for all 3d modeling to save compute. Keep using higher effort or max effort opus for hard coding tasks and no lower than medium opus for anything with code. But sonnet for the modeling. [Jade 2026-10-08 21:15 UTC removed the rest of this paragraph: the modelling runs through her Blockbench MCP connector only, with no workarounds. If the connector is not working, no models are made and Jade is told what is wrong.]


--- [items] Visuals and effects (VX)
**VX-1.** {IMPORTANT: add better color contrast or do something so that it is easier to pick out what's on your screen. Mostly just more difference of color between trees,bushes,flax, herbs, and grass for example}. Add textures fitting the game style to things like grass, dirt, stone, trees (trunks and foliage), etc, etc.


--- [items] Extra (EX)
**EX-2.** - make sure you used every model I gave you, there wasn't a single model that was intended not to be used, so if you haven't used one, you're missing something.


--- [items] Blockbench MCP how-to (Jade's reference text) (BB), in full
## Blockbench MCP how-to (Jade's reference text) (BB)

> BLOCKBENCH MCP – HOW TO USE IT ON JADE'S PC

> Source: https://github.com/sosadly/blockbench-mcp
> Read from the source if you need help
> What it is
> Jade's Windows PC (Jade's PC) runs the Blockbench desktop app (v5.2.1)
> with the "BlockbenchMCP" bridge plugin installed (v0.3.1, by sosadly, tagged
> Local / AI / Automation / MCP). The plugin runs a local HTTP server inside
> Blockbench at http://127.0.0.1:8787. It is only reachable from that PC itself,
> so you must run commands ON that PC. Blockbench must be open, or nothing will answer.
> The plugin also adds an "MCP Copilot" panel in Blockbench. Jade can drag a
> reference image into it, and the AI builds against it and scores how well the
> silhouette matches.
> Plugin settings (Blockbench > Plugins > BlockbenchMCP > Settings)
> - MCP Server Port: 8787 (localhost 127.0.0.1 only)
> - Start MCP Server automatically: ON (the bridge starts when Blockbench opens)
> - Allow execute_script: ON (the connected client can run any JavaScript inside
> Blockbench; turn it off if you don't fully trust the client or what it reads)
> - The plugin page also has Disable, Reload and Uninstall buttons.
> Installed files
> - Repo: <home>\blockbench-mcp  (already built; Node.js v24 installed)
> - MCP server (stdio): node <home>\blockbench-mcp\dist\index.js
> - Bridge plugin: <home>\blockbench-mcp\plugin\blockbench_mcp.js
> Option A: as an MCP server (if your client supports local stdio MCP)
> Add a server with command "node" and args
> ["<home>\\blockbench-mcp\\dist\\index.js"],
> env BLOCKBENCH_MCP_PORT=8787. You'll get about 70 tools.
> Option B: call the bridge directly over HTTP (works from any PC shell)
> 1. Health check (read-only):
> GET http://127.0.0.1:8787/ping
> -> {"ok":true,"protocol":1,"blockbench_version":"5.2.1","is_app":true,"has_project":false}
> 2. Every command:
> POST http://127.0.0.1:8787/command
> Header: Content-Type: application/json   (required; do NOT send an Origin header)
> Body:   {"id":"req-1","action":"<tool name>","params":{...tool args...}}
> Reply:  {"ok":true,"result":...}  or  {"ok":false,"error":"..."}
> The action names and params are the same as the MCP tool names and args.
> PowerShell example:
> Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/command `
> -ContentType 'application/json' `
> -Body '{"id":"req-1","action":"get_status","params":{}}'
> Useful actions
> - Read-only: get_status, get_guide, list_outliner, get_element, list_textures,
> list_animations, get_rig, check_model, check_rig, measure_model, audit_complexity,
> get_orientation, which_side, check_sides, list_formats, list_references,
> get_reference, screenshot, screenshot_views, get_texture, analyze_animation
> - Project: new_project, load_project, save_project, export_project, export_model,
> close_project, set_project_meta
> - Build: add_group(s), add_cube(s), edit_element, delete_element, mirror_element,
> add_plane, add_mesh, voxelize_matrix, add_hollow_volume, generate_array,
> extrude_chain, add_wing, create_rig
> - Texture: create_texture, import_texture, paint_texture, paint_faces,
> detail_cubes, set_cube_uv, pack_uv, resize_texture, apply_texture
> - Animate: create_animation, add_keyframe(s), generate_animation,
> preview_animation, remove_animation
> - Reference matching: load_reference, compare_reference, clear_references
> - Review: request_review / ask_user (they pop up a panel in Blockbench and wait
> for Jade to click)
> - Plugins: list_plugins, install_plugin, uninstall_plugin
> - execute_script runs arbitrary JS with full Blockbench access. Avoid it unless
> nothing else works.
> Start with get_guide for the plugin's own modeling playbook. Use screenshot or
> screenshot_views to look at your work.
> Also
> - If /ping fails, ask Jade to open Blockbench and check the plugin is enabled
> with its server running (File > Plugins > BlockbenchMCP).
> - If you fail to connect, do not attempt a work around. Tell jade what you need from her to connect. Do not make models without this connector. Tell jade if you cannot connect and why and how to fix.

--- [decisions] 0. Rules for the whole patch, rule 1
1. **No Grok.** "IMPORTANT: Any mention og grok should be removed. We will not be using grok terminal to build any models during this path build or for content going forward, it has proven incapable. You can use sonnet subagents with my MCP connector, but do not use subpar workarounds, if my connector isn't working, do not make models and instead tell me what's going on"
   - Models are made only through her Blockbench MCP connector on her PC. Sonnet subagents may do the modelling.
   - If the connector is not working, nobody makes models. Jade is told what is wrong.
   - No stand-in, code-drawn or otherwise improvised model counts as done for new content. The connector was checked at 21:17 UTC: /ping answered, Blockbench 5.2.1, project "fairy" open.

--- [decisions] 1. The 16 questions, row 14
| 14 | Is Blockbench free for the missing models? | "see top, no grok, blockbench should be free to use, check it." | Checked: free and answering. Sonnet subagents model through her connector (rule 0.1). The list is in `patch5-split.md`. |

--- [decisions] 3.7 Textures (BS-4, GO)
### 3.7 Textures (BS-4, GO)
- Terrain and plant textures (grass, dirt, stone, bark, leaves, flax, herbs) become small tiling pixel-art tiles made in code from fixed palettes, following her art style section (AR-1 to AR-19).
  - Grass gets darker tufts and a few raised blade sprites, which never block building.
  - Rocks get darker streaks.
  - Foliage gets leaf clusters.
- The colour-contrast item (VX-1) is done in the same pass.
- Model textures are painted in Blockbench through her connector. No other tools are needed.

==================================================================
2. Every building looking distinct
==================================================================

--- [items] nothing beyond GP-19's 'distinctive looking from other buildings' (quoted under Tavern).

--- [decisions] 0. Rules, rule 6
6. **Every building distinct** (21:23 UTC). "Que: also, Workshop, forge, barracks, sanctum and maybe others all use the same model. Every single building much look very unique and distinct. This must also be fixed with this patch"

--- [decisions] 2.15 Every building distinct (21:23 UTC), in full
### 2.15 Every building distinct (21:23 UTC)
What the code does now:
- The catalogue already holds models for these buildings, but `packages/sim/src/buildings/footprints.ts` wires none of them:
  - workshop (t1 to t4);
  - forge (l1 to l4);
  - barracks;
  - magi_sanctum;
  - scholars_lodge;
  - mineshaft (t1 to t3);
  - the walls, gates and towers (softwood, hardwood and stone, plus wall corners);
  - stables.
- So these buildings all fall back to the same plain plank-and-slate block house, differing only in size (`packages/client/src/world/building-looks.ts`, default case):
  - the Workshop, Forge, Barracks, Magi Sanctum, Scholar's Lodge and Mineshaft;
  - the Fishing dock, which is being removed;
  - the hardwood gate and the stone gate, which have no case of their own.
- The other walls, towers and the wooden gate are drawn from blocks in code. Wooden and hardwood walls and towers differ only in colour.
- The Barn is the pen_barn tinted red, and the Bonfire is the campfire doubled. Both are stand-ins.

To build:
- Wire every existing model at the right level or tier.
- Check that each building reads as its own thing at default zoom.
- Make proper models through the connector for:
  - the Barn and the Bonfire;
  - the new Tavern;
  - the earth rampart and its two damaged states;
  - the damaged wall states;
  - the Citadel's platform;
  - the fixed engines.
- Any building still sharing a look after wiring gets its own model through the connector.

Jade added at 22:17 UTC, in the models thread: "might as well add more unique and detailed textures to the remaining building to line up with the increased color contrast rule and make it easier to tell what is what, without straying too far from the art style"
- So every remaining building also gets more unique, detailed textures, painted through her connector, with the colour contrast of VX-1 (decisions 3.7) and within her art style (AR-1 to AR-19).

==================================================================
3. The Barn (look/model; why a new model rather than the pen_barn stand-in)
==================================================================

--- [items] Gameplay (GP)
**GP-37.** -Barns must require one worker working in them to work, and the worker is visible outside the farm during the day tending to the animals. The worker dons a wide brimmed hat that looks like a cowboy hat made of woven straw (called farmer's hat), the hat does not need to be made, and disappears when the worker switches jobs. The barn worker also has a tooltip that says something along the lines of "he is operating the barn/tending to livestock". If the player tries to order a barn worker off the job, the barn worker gives an actionable along the lines of "Are you sure you want me to leave the animal unattended?" and the player must click the yes before they change their job. During the day, if in heartland, fringe or woodland, the animals go outside to graze (from the grassy ground). This offsets their food cost slightly. At night if they need to eat, they can consume plant based foods. Animals in the barn should automatically reproduce more of their type. This should all be balanced so a barn with full average medley of animals produces up to roughly 120% percent more food per worker (x2.2), assuming you slaughter the animals in an optimal way (eg: waiting until enough reproduce)


--- [items] Visuals and effects (VX)
**VX-2.** -Occupied buildings where it makes sense (farm,barn, etc) have lit windows that cast light at night. Mainbases always have lit windows or built in torches at night, casting light.


--- [decisions] 2.10 The Barn (GP-37)
### 2.10 The Barn (GP-37)
"The Barn has one worker, and it's animals do graze by day, returning at night. The barn worker was definitely detailed in patch 5 so read it again."
- My earlier line ("the Barn has no worker") described the live game, not her patch.
- GP-37 is built as she wrote it:
  - a Barn needs one worker to work, and he is visible outside tending the animals by day, in the farmer's straw hat;
  - his tooltip, and the Yes/No ask before he leaves the job;
  - the animals graze outside by day in the Heartland, Fringe and Deepwoods, and come back in at night, eating plant food if they need to;
  - they breed on their own;
  - a full barn yields up to about 2.2x food per worker with good slaughtering.

--- [decisions] 2.15 (why a new model; full section is under topic 2)
- The Barn is the pen_barn tinted red, and the Bonfire is the campfire doubled. Both are stand-ins.
(also in 2.15 'To build': "the Barn and the Bonfire;")

==================================================================
4. The Bonfire
==================================================================

--- [items] nothing in the files (the word 'bonfire' does not occur in patch5-items.md).

--- [decisions] 2.6 Defences
- Staying: walls, gates and towers in wood, hardwood and stone (GP-41 renames softwood ones to "wooden"), the torch post and the bonfire, which are lights rather than defences.

--- [decisions] 2.15
- The Barn is the pen_barn tinted red, and the Bonfire is the campfire doubled. Both are stand-ins.

==================================================================
5. The Tavern
==================================================================

--- [items] Gameplay (GP)
**GP-19.** -Add a building called the Tavern that looks like a medieval pattern, and is distinctive looking from other buildings. It has a chimney with smoke effects, consistent with other smoke effects elsewhere in this document. It costs a mix of stone and lumber consistent with other buildings and it’s appearance, in addition to 5 leather and <1 gold OR 7 Silver>. The tavern also requires a t3 mainbase to build.

**GP-20.** The tavern has an open for business button that cycles between on and off. When on, it burns food at a rate of one every 3 seconds and gets you silver in return. The silver starts off building as decimal points because it takes 18 food burned to build a single silver ingot. When you have at least one full silver ingot you can click the withdraw funds button, taking all the whole number silver into your player inventory, and leaving any fraction silver behind. Decimals go up to 3 deep. When business is open, there is a progress bar for how long to reach the next silver. There is also a running counter for each taven of how much silver has been made and how much food has been consumed. When the tavern is open for business, the lights are on and flickering with occasional silhouettes in the windows and it just generally looks like a party in there.

[excerpt, first sentence of GP-21] **GP-21.** -Tavern Can train a player controlled unit called “Dreadnought” - The dreadnought model (heavy knight) is included.

--- [decisions] 2.14 "Not in the game yet" (excerpt)
- That line meant "not on main yet". All seven are Patch 5 items and are in the build:
  - the tavern (GP-19 to GP-21);

--- [decisions] 3.1 Main base: four tiers (excerpt)
- The Tavern needs T3 (GP-19). Dreadnoughts are capped at 1 per player at T3 and 3 at T4 (GP-21).

==================================================================
6. Citadel engine platform; fixed / garrisoned siege engines
==================================================================

--- [items] Controls (CT)
**CT-3.** -If you have groups of combat units selected and right click on a building (main base, tower, etc) the units who enter that building are removed from the selection (similar to prev point [-]). If you have a mixed selection, then for towers and ramparts the highest level/equipped ranged units will be prioritized to enter the defensive building. Mages get priority over melee in the same selection group for entering defensive buildings, but classic ranged units get priority over either. Obviously, a cannon cannot enter a defensive building - Semi exception:  the citadel (new t4 mainbase as detailed below) cannot have cannons on its defensive ramparts but has a new flat large rampart looking platform at the highest point (make it visually appear solid in structural design - basically just get rid of the top pointy tower but to make this platform) There is a new button in the Citadel section (Build defense) that opens a submenu there (submenu like the type build defense already uses) and that sub menu allows you to build a fixed siege engine on that new platform, this cannot be taken off its platform. Note, these fixed engines are based on the mobile ones, but info given here does not affect or change the mobile ones, the fixed ones also visually have braces instead of wheels: The artillery crewman(s) are up there too, you get the first one(s) with the engine. The crewman and engine have their own hp bars, in line with the regular units but are stuck up there all game until killed or they die. The crewman still can be targeted by air and ranged units, and them and the engine can be destroyed independently. Also in the build defences section, There is an option to upgrade your siege engine (this button costs the resources and time difference to upgrade, and if you are moving from a one crew artillery to two and you have the one crew alive still then you get another one on upgrade complete, the siege engine cannot attack while upgrade is building. Also in the build defenses button submenu is the option to train garrison artillery crewman, which can only be clicked when you have a fully constructed/built, fixed engine that is lacking one or more crewmen. And the garrison crewman are those fixed artillery crewmen. The button is greyed out if no fixed engine or if fixed engine is fully manned. Give it a cooler more specific name for each type in game than “Fixed engine”. They take the same time to construct and cost the same cost as their corresponding mobile versions. You can only build a type of fixed engine when you have the ability to make a fixed engine (building requirements, research, artillery workshop, etc.). If no siege weapon on the citadels engine platform, then one can put other units up there to shoot down, up to 4 regular units.


--- [decisions] 1. The 16 questions, row 2
| 2 | What stays behind the Citadel (T4)? | Not answered: GO | Only the Cannons and Muskets research (and so the cannons, muskets and pistols they unlock) and the Citadel's new engine platform need T4. Steel, carbon steel, gunpowder, crossbows, the ballista and Deep Mining III (level 8 today) open at T3. See 3.1 for the full tier map. |

--- [decisions] 2.13 Siege engines and garrisons (CT-3), in full
### 2.13 Siege engines and garrisons (CT-3)
"-all seige engines can be build as garrisoned, but you can never put a mobile seige engine to garrison, as detailed in my patch notes, please use more attention to detail"
- Every siege engine type (catapult, ballista, bronze cannon, iron cannon) has a fixed version. It is built on the Citadel's new flat engine platform from the Citadel's Build defense submenu, sits on braces instead of wheels, and has a distinct name per type.
- It cannot be taken off its platform.
- A mobile engine never garrisons in anything. The Citadel's 4 cannon ports go.
- Everything else in CT-3 stands as written:
  - each fixed engine costs and takes as long as its mobile version, lead ore included (2.5);
  - a fixed engine of a type can be built only when the player could build that mobile engine (Artillery workshop, research, tier);
  - the crewmen come with the engine;
  - they and the engine have separate HP bars and die separately;
  - crewmen on the platform can be hit only by air and ranged attackers;
  - upgrading costs the difference in resources and time, and the engine cannot fire while the upgrade builds;
  - an upgrade from a 1-crew engine to a 2-crew one adds a second crewman free when it completes, if the first is alive;
  - Train garrison artillery crewman is greyed out unless a built fixed engine lacks crew;
  - up to 4 regular units can stand on an empty platform to shoot down.

--- [decisions] 2.17 Artillery workshop menu (excerpt: the engine types)
- The Artillery workshop's action section shows Train artillery crewman and each engine (catapult, ballista, bronze cannon, iron cannon) directly as its own buttons.

--- [decisions] 3.1 Main base: four tiers (excerpt)
- T4 = old level 10 (Citadel), plus 1 mana crystal (her words).
- Old levels 2, 4, 5, 7, 8 and 9 are unused: their models stay in the catalogue, unused, with no tech on them.
  - levels 8-10 → T4: the Cannons and Muskets research, and the engine platform. The one exception is Deep Mining III (level 8 today, `combat/items.ts`), which goes to T3 so that T4 locks only what question 2 says.

--- [decisions] 2.5 Lead ore (excerpt)
    - the fixed (Citadel) version of each cannon: the same as its mobile cannon.

==================================================================
7. Wall damage states (cracked / broken, percentages)
==================================================================

--- [items] UI and HUD (UI)
**UI-9.** -all game units friend or foe now have clean-looking hp bar above their heads. If they have mana, then they have a similar mana bar drown right below it. Hp bar color changes color as it gets lower, mana bar color remains the same color always, but shrink in size as you have less of the corresponding thing, as one would expect with this mechanic. The exceptions are that is a mob/unit/building/etc has over 95% hp or over 95% mana, then the corresponding bar does not get drawn at all, to reduce visual clutter. Furthermore, individual walls/ramparts do not show healthbars at all, and 2 new models must be added for each wall type for: wall below 70% hp and wall below 40% hp. Wall below 70% hp have darker brown cracks on it, and wall below 40% hp looks napped in half, with splinters sticking out and the other wall half still hanging on by a thread but hanging down and touching the ground. This part touching the ground is purely visual, does not impede movement, and the wall still functions as normal regardless of hp. Repairing the wall of course changes to the models back up until it gets back to a normal looking wall over 70% hp. Of course players can still see the walls hp in their own middle HUD section if they click on the wall itself, no change there. Do something similar for earth ramparts where it looks like the earth is being pulled away/torn off and then again repairs back up to normal. Rep


--- [items] Gameplay (GP), the wall kinds
**GP-41.** -Make all things that require lumber or sticks able to use either type of lumber, and rename all hardwood items/buildings to just wood, eg hardwood club becomes wooden club. The one exception for this is that we will have wooden walls/towers/gates, and hardwood walls/towers/gates. Hardwood defensive buildings will fall in between wood and stone ones.


--- [decisions] 3.3 Defences
### 3.3 Defences
- Damaged-state models are needed for the three wall kinds and the earth rampart (UI-9). Walls and ramparts show no HP bar.
- Gates and towers keep HP bars, hidden above 95% like every bar.

--- [decisions] 2.15 'To build' (excerpt)
  - the earth rampart and its two damaged states;
  - the damaged wall states;

==================================================================
8. The earth rampart
==================================================================

--- [items] Gameplay (GP)
**GP-43.** -Add earth rampart. This will be an earth Chunk 2m high and 1 M long/wide. They each have the same hp as one wooden wall, meaning that since they are wider per bit/section, they are much weaker than wood walls (les hitpoints dense per same length section). Each Chunk takes roughly the equivalent of one baseline worker inventories(max carry weight) of earth to build. They cannot be dug, but can be attacked like other walls.

**GP-44.** -Defensive buildings: Remove all defensive buildings except walls, towers, gates, mounds

(UI-9 above also covers the rampart's torn-earth damaged look.)

--- [decisions] 2.6 Defences (GP-43, GP-44, GP-45), in full
### 2.6 Defences (GP-43, GP-44, GP-45)
"no, only the earth rampart things I talked about, nothing else make from earth, and yes all that other stuff goes."
- "Mounds" in GP-44 means the new earth rampart (GP-43). It is the only thing built from earth.
- These are removed: Earthworks (heaped earth banks, ramps and fill), the lumber and stone ramps, ramp steps, and gravel. So is every requirement that needed them, leaving no gaps.
- Staying: walls, gates and towers in wood, hardwood and stone (GP-41 renames softwood ones to "wooden"), the torch post and the bonfire, which are lights rather than defences.
- Earth is still dug. It is used for the earth rampart, and no faction trades it (BL-3).

==================================================================
9. Wider gates
==================================================================

--- [items] Gameplay (GP)
**GP-42.** -Gates: Make them twice as wide


--- [decisions] nothing beyond 2.6's 'Staying: walls, gates and towers in wood, hardwood and stone' (topic 8) and 3.3's gate HP bar line (topic 7).

==================================================================
10. The wall breaker
==================================================================

--- [items] Balance (BL)
**BL-7.** -Reduce/nerf exploding wall breakers damage to units by 50%, give them a particle effect explosion and also particle smoke cloud rising for 3 seconds after upon blowing up so players visibly see the destruction. Make the explosion also form a small crater like a creeper in minecraft, But make it very shallow. If the wall breaker is killed before it explodes, then it does not explode. Make the wall breaker model more ominous, with tiny spark particle effects coming from the correct area on its bomb.


--- [decisions] nothing in the files.

==================================================================
11. Cannon remakes (bronze, iron)
==================================================================

--- [items] Mobs (MB)
**MB-8.** -in line with real life history, bronze cannons should be thick with less wide barrels, because bronze cannot handle large explosion pressures as well as stronger metals. So bronze cannon should have smaller muzzle and smaller shot+explosion with correspondingly a smaller aoe and less damage. Still more damage than the non gunpowder engines though and still alot of damage because it’s a cannon. They should take a lot of bronze ingots. [Jade 2026-10-08 21:15 UTC replaced the last sentence here: remake the cannon models for the different types through her Blockbench MCP connector, where Sonnet subagents may do the modelling. If the connector is not working, no models are made and Jade is told what is wrong.]


--- [decisions] 2.5 Lead ore (excerpt)
- **Lead ore:** "No you cannot make silver from it, it is now an additional ingredient in all gunpowder units, with larger/stronger ones needing more (logic: for the ammo, even though we dont have expendable ammo)"
  - Every gunpowder unit costs lead ore on top of its cost now. Picks:
    - bronze cannon: 4;
    - iron cannon: 6;
    - the fixed (Citadel) version of each cannon: the same as its mobile cannon.
(2.13 line on fixed versions of bronze and iron cannon is under topic 6.)

==================================================================
12. Flax
==================================================================

--- [items] World (WL)
**WL-10.** -flax: spawns (Heartland, Fringe, woodlands). Regrows quickly, but only 1/3 generation chunks can grow them, and those cubes should be chosen as ones that do not have trees, or have few trees. It does not grow in bogs. Capped Max amount of flax per field, so they don't spread to cover all the ground in the generation chunk, and make their formation look natural. Make 3 different flax models with no practical difference to give some visual depth, and a forth model twice as tall that gives twice as much flax.


--- [items] Woodsman (WD)
**WD-1.** Woodsmen cost 32 food to make plus 1 of (leather OR hides) plus 4 sticks and 4 flax. Has regular move and attack buttons plus fish button and forage buttons. Forage and fish buttons behave similar to the warriors hunt (can be targeted onto a food/fish or set to auto), but fishing is for fishing and forage is for wild edibles including berries, mushrooms, and any other similar things that get added.

(VX-1, quoted in topic 1, asks for more colour difference between trees, bushes, flax, herbs and grass.)

--- [decisions] 3.7 (excerpt; full under topic 1)
- Terrain and plant textures (grass, dirt, stone, bark, leaves, flax, herbs) become small tiling pixel-art tiles made in code from fixed palettes, following her art style section (AR-1 to AR-19).

==================================================================
13. Berry bushes
==================================================================

--- [items] Gameplay (GP)
**GP-31.** - warriors who are hunting now also pick berries from bushes without removing the bush, get one batch of berries per bush, berries take an average of 2 minutes to regenerate. Woodsman of course do this too as one of their primary functions (forrage: gathers all edible plants) Both wait till their inventory is full to return, or so full that they wouldn’t be able to fit their next prey even if not 100% full.

**GP-32.** -Add berry bushes and draw small black berries on them. Make the player get 1-2 "bunch of black berries" per bush gathered. Black berry bunch gives 1 food. Add 2 other new bush types with different berries. Make them fairly rare, not greatly affecting the food balance alone.


--- [decisions] 3.6 Quality-of-life links (excerpt)
2. The woodsman forages everything new in both docs with one Forage button: berries, mushrooms, bog pears, hawthorne fruit, and Moon Roses on Bright Nights. His "food in vs food eaten" line counts all of it.

==================================================================
14. Mushrooms
==================================================================

--- [items] Gameplay (GP)
**GP-30.** - add edible mushrooms, infinite renewable food resource like berries. Each generation chunk is pre capped at between 0-10 food worth of mushrooms, depending on the amount of trees. No trees = no edible mushrooms, Barrens or deadlands = no edible mushrooms. A single mushroom regrows within 3m of where it was picked within 1-3.5 minutes (this means that yes, mushrooms can migrate over time. The amount of mushrooms initially in a generation chunk is set at generating time, but if for example a chunk has 4 max mushrooms and one respawns out of the chunk then it no longer belongs to that chunk, and that chunks max mushrooms are 4 [unless yet another mushroom migrates there via regrowing] You can code that however as long as you get my functionality and maintain ability to easily add more similar content in the future (as with all this). A single mushroom gives 1 food value.

(WD-6, under topic 21, gives the woodsman's forage low animation for mushrooms.)

--- [decisions] 2.14 (excerpt)
  - mushrooms (GP-30);
(3.6 line 2 under topic 13 also names mushrooms.)

==================================================================
15. The bog pear
==================================================================

--- [items] Gameplay (GP)
**GP-29.** -Add a low to the ground bog pear that is edible, harvestable by a woodsman detailed later. Only grows at bogs with a bog guardian. It is a dark purple color. Max 2 bushes per bog, each growing a single pumpkin sized pear max, each pear taking 3 minutes to regrow and giving 14 food value. (the bog pear has such a high food value because it is guarded by a powerful mob).


--- [items] Quests for existing villages (QV)
**QV-16.** Halflings: the Bog Pear

**QV-18.** * Task: find a bog pear and bring it back to him.

**QV-19.** * Hint: there's no map ping. The hint is a tooltip that says "It's in a bog. Duh."

**QV-20.** * Turning in: once the player has accepted the quest and has a bog pear in their inventory, the Elder shows a Claim reward actionable. It stays up for as long as the player holds the bog pear. On turning in the player gives up the bog pear.


--- [items] Mobs (MB), MB-11 [excerpt, last sentence]
The bog guardian drops 4-10 sets of bronze - iron armour, 10-15 silver ingots, 0-2 gold ingots, a bog pear, 3-10 assorted weapons - tier 3-5, 0-1 random gemstones.

--- [decisions] 1. The 16 questions, row 4
| 4 | Which Bog guardian drop list (MB-11 has two)? | Not answered: GO | The second list: 4-10 sets of bronze to iron armour, 10-15 silver ingots, 0-2 gold ingots, a bog pear, 3-10 assorted weapons of tier 3-5, and 0-1 random gemstones. |

--- [decisions] 3.6 (excerpt)
1. One right-click menu for every usable item. The player inventory and the unit inventory share one dropdown: Use, Equip, Plant seed, Unload, Drop, Scrap, Don't eat.
   - The Pan Flute, the Ancient Seed, both idols, the bog pear and the new foods all work through it.
(3.6 line 2 under topic 13 also names bog pears.)

==================================================================
16. Coal
==================================================================

--- [items] World (WL)
**WL-7.** -Add coal rock deposits, appearing like rocks but with small black chunks of various sizes and angles attached to the outside.The black blocks/chunks (coal) must be attached fully and at least 30% clipping the rock they are attached to. These coal rocks give mostly rock by weight with some coal. Balance coal deposits so it is a better use of time to gather vs wood as an energy/fuel resource by at least threefold. Needs at least copper picks to mine.


--- [decisions] nothing in the files.

==================================================================
17. Silver and gold nodes
==================================================================

--- [items] World (WL)
**WL-4.** Replace the majority of sharp cliffs in heartland,fringe,deepwoods with more realistic looking mountains (still just stone and dirt, no snow or new materials. Very rarely silver ore node giving small amount or very very rarely gold ore node giving small amount. These ore nodes look similar to coal rock prescribed below, but smaller “chunks”/deposits, the nodes also give more stone than the ore of the type they are. You should never get more than 2 gold ingots worth of ore from a single gold node, and never more than 4 silver ingots worth from single silver ore node. These nodes need at least copper pick to mine.


--- [items] Visuals and effects (VX)
**VX-6.** -Add in-game flash and particle and glitter effects where it makes sense. Flash for gun muzzles, glitter of gold color for gold, glitter of silver color for silver, and others where it makes sense including particle trails on magic bolts and other particle effects on spells if not already added.


--- [items] Mobs (MB), MB-11 [excerpt]
Make small silver nuggets spawn on the ground of bogs (only bogs that have a guardian though. These do not regenerate, the same way stone does not regenerate).

--- [decisions] nothing in the files.

==================================================================
18. Boulders
==================================================================

--- [items] World (WL)
**WL-5.** -Make some 3m tall mineable boulders, about one every 4-5 generation chunks, make them visually look more detailed than just a single stone colored block, but make it still a cohesive object. None within 40m of a players base.


--- [decisions] nothing in the files.

==================================================================
19. Hot springs
==================================================================

--- [items] World (WL)
**WL-11.** -Barrens & deadlands: Dead wood does yield lumber, and thorn bushes yield sticks, but they do not reproduce the way living growth from the other bands/biomes does. hot springs/sulfur more common, 20% chance of being one in a generation chunk. Use a single existing mob that makes sense to guard hotsprings, once it is killed the hot spring remains unguarded for the rest of the game. Use speech bubbles for the mob even if just inhuman noises eg "Hisss" or "AAAaaarrr", but can also be words depending on the mob.


--- [decisions] nothing in the files.

==================================================================
20. The farmer's straw hat
==================================================================

--- [items] GP-37 (quoted in full under topic 3): "The worker dons a wide brimmed hat that looks like a cowboy hat made of woven straw (called farmer's hat), the hat does not need to be made, and disappears when the worker switches jobs."

--- [decisions] 2.10 (excerpt; full under topic 3)
  - a Barn needs one worker to work, and he is visible outside tending the animals by day, in the farmer's straw hat;

==================================================================
21. The woodsman's spear and animations
==================================================================

--- [items] Woodsman (WD)
**WD-3.** A Woodsman can deal 2 less damage than a warrior with the same gear, and can equip any tier of 2 handed (long) weapon, starting with a wooden spear. The woods man removes his spear visually for foraging animation. The woodsman spear is replaced with the fishing rod for fishing animations. The woodsman can only upgrade his weapon from a main base with the upgrade equipment button as the scholars lodge has no equipment customization section. The upgrade time must be in line with a warrior upgrading that same weapon.

**WD-6.** See attached woodsman model to use, with forage low animation for mushrooms and low growing plants, and forage high animation for others.


--- [items] Fishing rework (FR)
**FR-1.** Remove the fishing dock. Remove the ability of workers to gather fish resource. Change fish to live models swimming in water (models attached). Add fishing ability to woodsmen, make it a button that functions similar to hunt for gatherers (make it smart, return at night, etc etc). The woodsman switches from spear/weapon to fishing rod and uses the fishing animations. He gets enough fish to make it worth doing but not a huge staple for food for large village due to limited fish numbers. Info on fish reproduction should be in earlier blueprint. If it is not, model off other prey, max capped fish per pool, slow reproduction etc. When a fish is fished it gets visually pulled up on the line to the woodsman, and disappears, going into the woodsman's inventory/backpack.

**FR-2.** Make fishing work with a visual fishing rod that does not need to be built (already in the model, but the model doesn’t walk around with this showing, it wals around with its weapon or fists if no weapon following warriors)


--- [decisions] 2.11 Fishing (FR-1, FR-2) (excerpt)
- Only the woodsman fishes, with the rod from his model and the live fish models.

--- [decisions] 3.4 Units, drops and waves (excerpt)
- The woodsman takes 1 supply and eats like a worker.
  - He uses `woodsman_jade_improved`, not the older `woodsman`.
  - His spear prop and his missing clips (guard and attack with the polearm, climb, swim) are made through the connector. The warrior's clips are the reference, since the two models share bone names.
- The improved worker, warrior and mage models replace the old ones (PRE-3). Every clip they carry is used for its task (UI-7, EX-1): for example prospect for prospecting, and hoe, build and harvest kept apart. The one exception (a pick, not Jade's words) is the worker's fish_cast and fish_wait clips, which go unused because workers no longer fish (FR-1).
- Jade sent the woodsman twice. `woodsman_jade_improved` has the same body as `woodsman`, with more keyframes, so it is the one used. The plain `woodsman` file is superseded rather than missed (EX-2).

==================================================================
22. Shield tiers (and drawn gear)
==================================================================

--- [items] Gameplay (GP)
**GP-26.** -Shields never got added, despite being in the original blueprint. data on shields should still be alive there. Shields are now an equipment slot for all close melee units (and only close melee units). Main base makes close melee units with a shield at the tier matching what the main base produces, if you have the resources, up to tier one. Barracks now has, for close melee only, a third equipment slot in the close melee custom build section = a shield. Same auto make best applies, with no shield made if no resources. Shield is the lowest resource priority of weapons, armour, shield in a resource limited scenario.


--- [items] Quests (QV)
**QV-32.** * Reward: 3 weapons, 3 sets of armour and 3 shields, all of the highest steel tier.


--- [decisions] 0. Rules, rules 4 and 5
4. **No invisible gear.** "SHEILDS ARE DRAWN. All gear a unit has is drawn. hard rule: NO INVSIBLE EQUIPPABLE GEAR"
5. **The held kit wiring is done now.** "Kit pieces were never drawn on troops; that wiring pass was held with PR #50. This is the "musketeer looks like a fist fighter" bug (BG-7, EX-1). FIX THIS!! this should have never been held."

--- [decisions] 2.9 Gear (GP-26, BG-7, EX-1, VX-7), in full
### 2.9 Gear (GP-26, BG-7, EX-1, VX-7)
- Shields are their own equipment slot for close melee units only, as GP-26 says, and **every shield is drawn**. Today they come with the armour rows; that is replaced by the slot.
- Every weapon, armour, shield, wand and robe a unit has is drawn on it at its tier, for every troop type, worker tool, mage and the woodsman. Nothing equipped is ever invisible.
- PR #50's held wiring is redone on top of main now, with Jade's improved worker, warrior and mage models.

--- [decisions] 3.8 (excerpt)
- **GP-21 and GP-18, the Dreadnought:** he never climbs (he only jumps, up to 1.5 m) and has no shield slot. These are exceptions to the climbing and shield rules.

==================================================================
23. Robe tiers and their looks
==================================================================

--- [items] Visuals and effects (VX)
**VX-7.** -Make mages be visually wearing their gear. They currently do not wear most of it, like the problem with musketeer and other later game units!  The same robe now looks different on a support mage vs battle mage to differentiate them. Battlemage color schemes go from blue to red as they get better, Support mages from green to white. Top level battle mage gets a flaming halo above their head (always being animated) and top level support mage gets sparkling halo of light energy.


--- [items] Bugs (BG)
**BG-7.** -make sure troops visibly have their equipment and armour. I made a musketeer with the debugger’s gun kit, and it looked like a fist fighter! No armour or musket even though it said it had steel armor and a musket. That's not good. Mages also didn’t change look with other gear. Fix it please.


--- [items] Extra (EX)
**EX-1.** -Double check that all player units are using the correct animations and have all their gear including higher tiers visible. for example: right now musketeer looks like a fist fighter (???) and the worker uses the dig animation to prospect, instead of the prospect animation as it should use. do this check for all of them in all aspects.


--- [decisions] 2.9 Gear (quoted under topic 22) is the decisions entry; nothing else.

==================================================================
24. Mating / breeding animation
==================================================================

--- [items] Balance (BL)
**BL-10.** -Make prey animals reproduction get increased by 50%, have then seek out a mate when ready to mate, draw hearts above them both when they reproduce together (have to be next to each other) If you're willing, also add animation for this, if not it's fine just proceed with the other tasks, but this is blocky survival game and its animals so I don’t see the issue.)

(GP-37 under topic 3: "Animals in the barn should automatically reproduce more of their type.")

--- [decisions] 2.10 (excerpt)
  - they breed on their own;

PART 2. patch5-split.md (verbatim)

==================================================================
Section 2 (Models on Jade's PC), in full
==================================================================
## 2. Models on Jade's PC
- **What:** every model Patch 5 needs that Jade did not supply, made in Blockbench on her PC through her BlockbenchMCP connector by Sonnet subagents.
  - Check /ping before each batch. If it fails, stop and tell Jade what is wrong; make nothing any other way.
  - Save new files into her "Local Blockbench Folder for claude", never overwriting.
  - Deliver by PR on `assets/patch5-<batch>` branches into `packages/assets/src/models/`.
  - Follow her art style (AR-1 to AR-19): face -Z, origin on the ground for buildings, real-world scale as the catalogue.
- **To make (her items in brackets):**
  - **Buildings:**
    - the Tavern: medieval, distinctive, chimney, windows that can be lit and flicker, with an "open for business" look (GP-19, GP-20);
    - a real Barn (decisions 2.15; today it is a tinted pen);
    - a real Bonfire (today it is the campfire doubled);
    - the Citadel with its pointed top tower replaced by a solid flat engine platform (CT-3; a variant of main_base_l10);
    - any other building that still looks like another once thread 6 has wired the catalogue.
    - more unique, detailed textures for the remaining buildings (Jade, 22:17 UTC: "might as well add more unique and detailed textures to the remaining building to line up with the increased color contrast rule and make it easier to tell what is what, without straying too far from the art style"), with VX-1's colour contrast (decisions 3.7) and within AR-1 to AR-19.
  - **Defences:**
    - two damaged states for each wall kind (wooden, hardwood, stone): cracked below 70%, and snapped in half below 40% with splinters and the hanging half touching the ground (UI-9);
    - the earth rampart, 2 m high and 1 m wide (GP-43), plus its two torn-earth damaged states (UI-9);
    - gates twice as wide (GP-42), for each wall kind.
  - **Engines:**
    - a fixed version on braces of the catapult, ballista, bronze cannon and iron cannon (CT-3);
    - the cannon remakes: bronze thick-walled with a smaller muzzle, iron bigger (MB-8);
    - a more ominous wall breaker with a spark point on its bomb (BL-7).
  - **World props:**
    - black berry bushes with small black berries, plus two other berry bushes (GP-32);
    - the low dark-purple bog pear bush and its pumpkin-sized pear (GP-29);
    - edible mushrooms (GP-30);
    - three flax models plus a fourth twice as tall (WL-10);
    - a coal rock with black chunks at least 30% sunk into it (WL-7);
    - small silver ore and gold ore nodes like the coal rock (WL-4);
    - 3 m boulders, detailed but one object (WL-5);
    - a hot spring if the catalogue lacks one (WL-11).
  - **Units and kit:**
    - the farmer's straw hat (GP-37);
    - the woodsman's wooden spear prop, and his missing clips (guard and attack with the polearm, climb, swim), using the warrior's as the reference (WD-3);
    - any kit piece, shield or robe tier that has no model when thread 6 wires the gear (decisions 2.9);
    - any player unit missing a run or climb clip (GP-16, GP-18).
  - **Optional, per BL-10:** a mating animation for prey animals.
- **Supplied by Jade already** (wired by the threads that own them, not remade):
  - the improved worker, warrior and mage;
  - the woodsman;
  - heavy_knight (the Dreadnought);
  - bog_guardian; morvath; necromancer and its bolt; fairy and its bolt;
  - catfish, salmon, trout;
  - the five spell projectile replacements;
  - all 52 Stone Circle models.
- **Depends on:** nothing. Batches go in the order the code threads need them: buildings and defences first.
- **Pick:** run this as a Remote Control session (start_rc_session) on Jade's PC in her default Blockbench folder, where Claude Code has her blockbench MCP server: that is "her MCP connector". The Patch 5 folder thread reached the bridge only over HTTP through Desktop Commander, so it does not model. If the session's blockbench tools are missing, it tells Jade and makes nothing.

==================================================================
Section 6 (Unit looks, animations and building looks), in full
==================================================================
## 6. Unit looks, animations and building looks
- **Items:**
  - PRE-3: use Jade's improved worker, warrior and mage models;
  - UI-7: a prospect progress bar and the prospect clip;
  - EX-1: every unit uses the right clip for every task;
  - BG-7 and decisions 2.9: every weapon, armour, shield, tool, wand and robe drawn at its tier; PR #50's held wiring redone on today's main;
  - VX-7: mages wear their gear; battle robes go blue to red with tier, support robes green to white; a flaming halo on the top battle mage and a sparkling one on the top support mage.
  - **Every building distinct** (decisions 2.15). Today the Workshop, Forge, Barracks, Magi Sanctum, Scholar's Lodge, Mineshaft, hardwood gate and stone gate all draw as the same plain block house.
    - Wire the catalogue models that exist but were never used: workshop t1-t4, forge l1-l4, barracks, magi_sanctum, scholars_lodge, mineshaft t1-t3, stables, and the wall, wall corner, gate and tower models in wood, hardwood and stone.
    - Then wire the new ones from thread 2 as they land.
    - Check each at default zoom and list any that still look alike for thread 2.
  - Who wires each new model:
    - this thread: the Barn, Bonfire and farmer's hat;
    - 13: the Tavern;
    - 15: the walls' damaged states, the earth rampart, the wider gates, the Citadel platform, the fixed engines, the cannons and the wall breaker;
    - 3: the world props;
    - 9: the woodsman's spear and clips.
- **Touches:** client/world/units-view.ts, buildings-view.ts, building-looks.ts; client/models/; sim/buildings/footprints.ts (model ids); sim/units/kits.ts (model ids only); packages/assets.
- **Depends on:** Foundations. Shields drawn once thread 8 has the shield slot.

==================================================================
Section 15 (Defences and siege), in full
==================================================================
## 15. Defences and siege
- **Items:**
  - GP-42: gates twice as wide.
  - GP-43: the earth rampart (the HP of one wooden wall, one worker load of earth, can't be dug).
  - UI-9, walls part: no HP bars on walls and ramparts, and the damaged-state models swapped in at 70% and 40% and back on repair. The damage is purely visual: the hanging half does not block movement, and the wall works the same at any HP. Players still see a wall's HP in the middle HUD when they click it.
  - CT-3 and decisions 2.13, every line of it:
    - the Citadel's flat engine platform and its Build defense submenu;
    - a fixed version of each engine, with a distinct name, at the same cost and time as the mobile one, buildable only when that mobile engine could be built;
    - the crewmen come with the engine, have their own HP bars, and can be hit only by air and ranged attackers;
    - the upgrade at the cost and time difference, with no firing while it builds, and a free second crewman when it completes;
    - Train garrison artillery crewman greyed out unless a fixed engine lacks crew;
    - 4 regular units on an empty platform;
    - mobile engines never garrison, and the cannon ports go.
  - MB-6: cannon blasts:
    - explosion particles;
    - trees felled;
    - dirt chipped and left as items;
    - engines fire at where the target is now;
    - catapult hits with particles that break only small trees.
  - MB-7: muzzle flash, sparks and lingering smoke: cannons 5 s, muskets 4 s, pistols 3 s.
  - MB-8: bronze cannons with a smaller muzzle, shot, blast, AoE and damage than iron ones, still hitting harder than any non-gunpowder engine, and costing a lot of bronze ingots.
  - MB-9: gunpowder reloads slowly but hits hard.
  - MB-10: engines attack friendlies on a direct order.
  - VX-4: shots that glow as orange streaks at night, with gun noise.
  - BL-7: the wall breaker:
    - half damage to units;
    - an explosion, 3 s of smoke and a shallow crater;
    - no explosion if it is killed first;
    - the ominous model with sparks.
  - Lead ore for cannons (decisions 2.5).
  - Decisions 2.17 (Jade, 21:42 UTC): the Artillery workshop's action section shows Train artillery crewman and each engine directly, with no "Engines" or Make submenu.
- **Touches:** sim/siege/, buildings/chains.ts, data.ts, combat/projectiles.ts; client effects and views.
- **Depends on:** Foundations; 2 for the models.

==================================================================
Sections 3, 9 and 10: only the lines about models, model ids or wiring
==================================================================

--- Section 3 (World generation)
  - WL-10 flax spawning (one chunk in three with few trees, capped fields, never in bogs, 4 models);
- **Touches:** packages/sim/src/world/generate.ts, props.ts, layout.ts, materials.ts; client/world/props-gen.ts, prop-models.ts.
- **Depends on:** Foundations; models from thread 2 as they land.

--- Section 9 (Woodsman, foraging and fishing)
  - FR-1 and FR-2: remove the Fishing dock and workers' fishing; live fish models; fish numbers capped per pool with slow breeding; a fish pulled up on the line; the rod shows only while fishing.
- **Depends on:** Foundations; 3 for placement; 2 for the spear and clips.

--- Section 10 (Farms, Barn and animals)
- **Depends on:** Foundations; 2 for the Barn and the hat.

==================================================================
Other lines in patch5-split.md about damage-state models, state groups or model ids
==================================================================
(Inside the sections above: lines 80-81 and 164 of section 2/6, line 167 'sim/buildings/footprints.ts (model ids); sim/units/kits.ts (model ids only)', line 318 of section 15.)
Line 511 (coverage list, under '- **UI:**'):
  - 5, 9, 10, 12, 14, 18 → 27 (UI-9's wall models also → 15);
Line 415 (section 19 Stone circles, the only other 'states' line):
    - tiers I to III by ring count, built from the five trilithon states at 40-70% intact or worn;
Line 26 (rules at the top):
8. A thread that needs a model the connector has not made yet waits for it, or wires it when it lands. It never draws a stand-in in code and calls the item done.
No line in patch5-split.md names model ids for the damage states or a state-group naming scheme.


PART 3. Public repo JadeFairbanks/blockyrts (shallow clone, HEAD c9dbcd7 Drop the Grok mention from the agent instructions (#128))

==================================================================
packages/assets/README.md: every paragraph on folder layout, naming, textures, hidden parts, states (verbatim)
==================================================================
README.md never mentions state sets, hidden cubes or damage states. Its folder, naming and texture rules, verbatim:

Everything under `src/` arrives by pull request from the modelling bot, on one
`assets/<batch>` branch per batch. Its first batch creates `src/MANIFEST.md`.

The project's own base bodies (worker, warrior, mage) live in `base/models/`
instead, outside the bot's reach; see [base/README.md](base/README.md). The
converter reads both trees.

## Layout

```
packages/assets/src/
  MANIFEST.md                       one row per model (created with the first batch)
  models/<category>/<id>/
    <id>.bbmodel                    the model, texture embedded
    <id>.png                        its texture
    <id>_<variant>.png              colour variants (metal tiers, young animals, ranks)
  textures/                         terrain textures (wishlist section I)
  effects/                          effect sprites and particle textures (section J)
  ui/                               interface art and 32 x 32 icons (section K)
  sky/                              sky images and lighting.json (section L)
```

Categories follow the wishlist sections A to H: `peoples`, `animals`,
`monsters`, `items`, `mechanical`, `buildings`, `world-props`,
`projectiles-and-spells`. The `<id>` is the entry's id from the wishlist, in
lowercase with underscores, and the folder, the model file and its textures
all use it.

## What may be committed

- Only `.bbmodel` and `.png` files, plus `MANIFEST.md` and one data file,
  `sky/lighting.json` (the day cycle, lighting and light-source values). The
  converter and the client read that file, not the copy of it in the text
  chunk of `sky/lighting.png`. No `.glb`, `.gltf`,
  `.obj`, GIFs, videos, renders or zip files: generated files are built, not
  committed.
- Each model's notes (hit box, move speeds, key times, attachment points,
  second grip distance) go in the model's description in Blockbench and in
  its `MANIFEST.md` row.
- Asset pull requests touch only `packages/assets/src/`. This README and all
  code change in their own pull requests.
- Every new model adds its row to `MANIFEST.md` in the same pull request, with
  at least its id, path, cube count, texture size, and any deviation from the
  rules below with the reason.

## Rules the converter will check

These come from the models wishlist (sections 3 to 5); a model that breaks one
fails the build unless its manifest row names the deviation and the reason.

- **Format:** Blockbench Generic Model with the texture embedded; one model
  per file.
- **Scale:** 1 model unit = 2.8125 cm (4 units = one 11.25 cm terrain unit,
  16 units = one 45 cm column). A human worker is 60 units (1.69 m) tall.
- **Placement:** standing on y = 0, centred on x = 0 and z = 0, facing -Z
  (Blockbench's north).
- **Bones** are groups with lowercase names and underscores, `_r` and `_l`
  for the creature's own right and left. Humanoids keep the baseline skeleton
  exactly: `root > hips > torso > head`, `arm_upper`, `arm_lower`, `hand`,
  `leg_upper`, `leg_lower`, `foot`.
- **Attachment points** are empty groups named `slot_<name>` (for example
  `slot_rider`, `slot_rider_2`, `slot_harness`, `slot_carry`).
- **Glowing parts** are cubes named `glow_*`; no particles or lights in files.
- **Clips** use the wishlist names: every fighter has `idle`, `walk`, `run`,
  its attack clips, `injured` and `death`, plus the extras its entry lists.
  Key times are a keyframe named `key` on the root bone or a line in the
  model's notes.
- **Cube budgets:** small items under 12 cubes; people and animals 15 to 40;
  big monsters up to 60; buildings as needed.
- **Textures:** 1 texture pixel per model unit, with each side a power of two
  from 16 to 1024. Most models fit in 256 or less; 512 and 1024 are expected
  only where 1 pixel per unit needs them (big mechanical pieces, big monsters,
  buildings).
- **Team colour:** the placeholder blue RGB (52, 96, 178) marks the areas the
  game tints with the player's colour; only player-owned things use it.
- **Images outside `models/`:** the size and power-of-two rules are for model
  textures only. Images under `textures/`, `effects/`, `ui/` and `sky/` keep
  the natural sizes their wishlist entries give (frame strips, 16 x 4 lips,
  8 x 8 icons, 9-slice pieces, 960 x 540 screens and so on), with no
  power-of-two rule and no minimum; the client draws them with WebGL2.

==================================================================
packages/assets/src/MANIFEST.md (there is no packages/assets/MANIFEST.md)
==================================================================
Opening paragraph (line 3):
One row per model file under `models/`. Cube counts include cubes hidden by default; texture sizes are the embedded texture (also committed as `<file>.png`), followed by any colour or material variants (`<file>_<variant>.png`, same UV layout). Each model's full notes (hit box, move speeds, key times, attachment points, second grip distances) are in its Blockbench description.

Textures section intro (line 563):
Terrain textures (wishlist section I), one PNG per file id. Top tiles may be rotated and mixed freely unless a row says otherwise.

The manifest has no prose rule for state sets; it states them per row. Wall-piece rows, verbatim. The 12 wall pieces use two wordings: walls and wall corners as wall_softwood below (with the placement clause), gates and towers as gate_softwood below (without it):
| gate_softwood | models/buildings/walls/gate_softwood.bbmodel | 85 | 128x256 + 2 variants (abandoned, damaged) | wall piece in the shared walls/ folder (wishlist id gate_softwood); F7 abandoned look = the `ruined` set with `gate_softwood_abandoned.png`, kept in this folder rather than as a separate id; 65 cubes in state sets hidden by default (construction stages, ruined, alternate states) |
| wall_softwood | models/buildings/walls/wall_softwood.bbmodel | 95 | 64x256 + 2 variants (abandoned, damaged) | wall piece in the shared walls/ folder (wishlist id wall_softwood); F7 abandoned look = the `ruined` set with `wall_softwood_abandoned.png`, kept in this folder rather than as a separate id; 81 cubes in state sets hidden by default (construction stages, ruined, alternate states); placement: the finished model stands on y = 0 and is centred; only its hidden state sets (construction stages and the ruined set, whose fallen pieces lie beside it or sink into the ground) reach outside that footprint |

The other ten rows repeat their pattern word for word with their own id, cube count, texture size and hidden-cube count:
  gate_hardwood: 82 cubes, 128x256 + 2 variants (abandoned, damaged), 62 cubes in state sets hidden by default
  gate_stone: 91 cubes, 128x256 + 2 variants (abandoned, damaged), 69 cubes in state sets hidden by default
  tower_hardwood: 160 cubes, 256x256 + 2 variants (abandoned, damaged), 118 cubes in state sets hidden by default
  tower_softwood: 150 cubes, 256x256 + 2 variants (abandoned, damaged), 108 cubes in state sets hidden by default
  tower_stone: 135 cubes, 256x256 + 2 variants (abandoned, damaged), 93 cubes in state sets hidden by default
  wall_corner_hardwood: 85 cubes, 64x256 + 2 variants (abandoned, damaged), 76 cubes in state sets hidden by default
  wall_corner_softwood: 84 cubes, 64x256 + 2 variants (abandoned, damaged), 75 cubes in state sets hidden by default
  wall_corner_stone: 78 cubes, 64x256 + 2 variants (abandoned, damaged), 73 cubes in state sets hidden by default
  wall_hardwood: 92 cubes, 64x256 + 2 variants (abandoned, damaged), 78 cubes in state sets hidden by default
  wall_stone: 84 cubes, 64x256 + 2 variants (abandoned, damaged), 78 cubes in state sets hidden by default

Related rows, verbatim (the Citadel base model, the Barn stand-in):
| main_base_l10 | models/buildings/main_base_l10/main_base_l10.bbmodel | 1255 | 512x1024 + 2 variants (abandoned, damaged) | high cube count (finished 430): crenels, merlons and arrow slits of the battlements are real geometry; no `working` clip: the main base has no working animation (the campfire and smoke points carry the life); F7 abandoned look = the `ruined` set with `main_base_l10_abandoned.png`, kept in this folder rather than as a separate id; 825 cubes in state sets hidden by default (construction stages, ruined, alternate states); placement: the finished model stands on y = 0 and is centred; only its hidden state sets (construction stages and the ruined set, whose fallen pieces lie beside it or sink into the ground) reach outside that footprint |
| pen_barn | models/buildings/pen_barn/pen_barn.bbmodel | 211 | 256x512 + 2 variants (abandoned, damaged) | F7 abandoned look = the `ruined` set with `pen_barn_abandoned.png`, kept in this folder rather than as a separate id; 127 cubes in state sets hidden by default (construction stages, ruined, alternate states) |

==================================================================
Embedded Blockbench description of models/buildings/walls/wall_softwood.bbmodel (not README/MANIFEST, but it is where the state-set convention is written down), verbatim excerpt
==================================================================
## State group sets (children of `root`; show exactly one)

- `finished`: the finished building (visible by default).
- `construction_0`, `construction_33`, `construction_66`: build progress at 0 %, 33 % and 66 % (staked outline and scaffold, then walls rising inside scaffold, then full frame with roof rafters).
- `ruined`: collapsed shell, broken walls, rubble, fallen roof (use with `_damaged.png`, or `_abandoned.png` for F7 abandoned buildings).
- `wall_softwood_damaged.png`: damaged texture (scorch, holes, cracks) for the same UVs; works on every group set.
- `wall_softwood_abandoned.png`: abandoned look (damage plus moss, faded cloth, cold fires) = `abandoned_wall_softwood` together with the `ruined` set or the finished set.

==================================================================
Model ids under packages/assets/src/models/buildings/ (folder names)
==================================================================
barracks cook_hut cooking_campfire dwarf_city_gate dwarf_forge dwarf_hall dwarf_house 
dwarf_mineshaft elf_bear_pen elf_gate elf_hall elf_tree_platform elf_walkway farm_field farmhouse 
fishing_dock forge foundry goblin_fire_pit goblin_hut goblin_stake_ring goblin_totem 
goblin_wolf_pen grand_academy grand_kitchen great_kitchen gunnery_yard halfling_barn 
halfling_burrow halfling_inn halfling_mill herbalist_hut kiln kitchen livestock_farm lumber_mill 
magi_sanctum main_base_l1 main_base_l10 main_base_l2 main_base_l3 main_base_l4 main_base_l5 
main_base_l6 main_base_l7 main_base_l8 main_base_l9 mineshaft pen_barn powder_mill ramp_earth 
ramp_lumber ramp_stone ruin_shrine ruin_tower ruin_wall runkin_drying_rack runkin_fire runkin_tent 
runkin_wolf_den scholars_lodge scriptorium stables storehouse tannery walls workshop 

Model files inside walls/:
gate_hardwood gate_softwood gate_stone tower_hardwood tower_softwood tower_stone wall_corner_hardwood wall_corner_softwood wall_corner_stone wall_hardwood wall_softwood wall_stone 

==================================================================
Do any wall, tower or gate models already have a damaged/cracked variant or a state set? (child groups of root, * = hidden by default)
==================================================================
  gate_hardwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door
  gate_softwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door
  gate_stone: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door
  tower_hardwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door, slot_tower_1, slot_tower_2, slot_tower_3, slot_tower_4
  tower_softwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door, slot_tower_1, slot_tower_2, slot_tower_3, slot_tower_4
  tower_stone: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_door, slot_tower_1, slot_tower_2, slot_tower_3, slot_tower_4
  wall_corner_hardwood: finished, construction_0*, construction_33*, construction_66*, ruined*
  wall_corner_softwood: finished, construction_0*, construction_33*, construction_66*, ruined*
  wall_corner_stone: finished, construction_0*, construction_33*, construction_66*, ruined*
  wall_hardwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_wall_walk
  wall_softwood: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_wall_walk
  wall_stone: finished, construction_0*, construction_33*, construction_66*, ruined*, slot_wall_walk

Answer: none of them has a cracked (below 70%) or snapped (below 40%) variant. Every wall, wall corner, tower and gate already has a state set (finished, construction_0, construction_33, construction_66, ruined; all but finished hidden by default) plus two texture variants: <id>_damaged.png ("damaged texture (scorch, holes, cracks) for the same UVs; works on every group set") and <id>_abandoned.png. There is no earth rampart model; the ramp_earth (ramp_earth_1/2/4), ramp_lumber and ramp_stone folders exist and are the ramps being removed (decisions 2.6). Every building folder carries the same _damaged/_abandoned texture pair (except ruin_shrine, ruin_tower, ruin_wall).

Not asked, from a quick ls of the catalogue: world-props has rock_coal, flax_wild, crop_flax, bush_hazel, gold_glint and campfire, but no berry bush, mushroom, boulder, hot spring, or silver or gold ore node; mechanical has cannon_bronze, cannon_iron, catapult and ballista; items has shield_wood, shield_wicker, shield_bronze, shield_iron_kite, shield_steel_heater and spear; there is no wall_breaker folder (monsters has bomb_keg and skeleton_bomber). The README says the worker, warrior and mage base bodies live in packages/assets/base/models/, not src/.
