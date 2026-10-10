# Patch 7 Model Brief

These are the instructions for the modelling team that builds the new armour, robes and Dreadnought models Patch 7 needs for *Survive and Conquer*, a browser RTS in this repository (`JadeFairbanks/blockyrts`). The team is a chief of staff, several modeller bots, and one reviewer bot named **MCP agent**. The game's code team does not make these models. It checks and wires in what this team delivers.

Read this whole file before starting. Everything you need is in this repository; nothing outside it is required.

---

## 1. How the Team Works

1. **The chief of staff** reads this brief and splits the work into the batches in section 6, one modeller bot per batch or several batches per bot.
2. **Each modeller bot** makes its batch's models on its own branch and opens one pull request per batch (section 7).
3. **MCP agent** reviews every model in every pull request against the checklist in section 8. It fixes problems itself by pushing to that pull request's branch, then approves the batch in a pull request comment.
4. **The code team** checks each approved batch against the delivery rules in section 2, merges it, and wires the models into the game. Do not merge your own pull requests.

**Ground rules:**

- Never push to `main`. Never change anything outside `packages/assets/src/`.
- Never put a password, token, key or other secret in any file, commit, pull request or comment, and never ask the project owner for one.
- **Never change an existing model file.** That includes every monster, the player bodies in `packages/assets/base/models/`, and `heavy_knight`. Every model in sections 5.1 to 5.5 is a new file. Where a piece comes from an existing model, copy the parts into a new file and leave the original untouched. The one exception is the 25 held weapons in section 5.6: MCP agent reviews and corrects those files in place.
- **Not your work:** item icons, How to play pictures, and all code.

---

## 2. Delivery Rules

These are the rules the code team checks every pull request against, and they include the repository's own rules from `packages/assets/README.md`. A model that breaks one is sent back.

| Rule | What it must be |
|---|---|
| Branch | Exactly the batch's branch name in section 6, made from the latest `main` |
| Pull requests | One pull request per batch, into `main`, titled `Patch 7 models: <batch name>` (for example `Patch 7 models: armour`). Never merged by the team |
| Files allowed | Only `.bbmodel` and `.png` files plus rows in `packages/assets/src/MANIFEST.md`. No renders, `.glb`, `.gltf`, `.obj`, GIFs, videos or zip files |
| Where | `packages/assets/src/models/items/<id>/<id>.bbmodel` and `<id>.png`, except the Dreadnought's new body, which goes in `packages/assets/src/models/peoples/heavy_knight_body/` |
| Naming | The `<id>` exactly as given in section 5, lowercase with underscores. The folder, the model file and its texture all use it |
| Format | Blockbench "Generic Model" (free) format, texture embedded, one model per file |
| Scale | 1 model unit = 2.8125 cm. A person is 60 units (1.69 m) tall; the Dreadnought is about 2.5 m |
| Facing and ground | The model faces -Z. A worn piece or body stands with its feet on y = 0, in the body's rest pose |
| Pivots | A worn piece uses the target body's bone names and rest-pose origins exactly (section 3). The mace has its grip at the origin (section 5.2) |
| Bones | Groups with lowercase names and underscores. `_r` and `_l` are the wearer's own right and left |
| Attachment points | Empty groups named `slot_<name>` |
| Glowing parts | Cubes named `glow_<something>`. No particles or lights in files |
| Textures | 1 texture pixel per model unit, each side a power of two from 16 to 1024. Keep the source model's colours and pixel style |
| Cube budget | Small items under 12 cubes. Armour and robes as few as the look needs. Record the count in the manifest row |
| Notes | Each model's notes in its Blockbench description and its `MANIFEST.md` row: source, size, slot or body, and anything unusual, in the format of the existing rows (`items` section, or `peoples` for the body) |

---

## 3. Reference Files

Open these before starting. Everything is under `packages/assets/`.

| What | Path | Use it for |
|---|---|---|
| Rules | `README.md` | The format rules above, in full |
| Manifest | `src/MANIFEST.md` | Example rows for items, held weapons and armour |
| **Held weapon example** | `src/models/items/obsidian_handaxe_held/` | The exact pattern for the Dreadnought's mace (item 6): a copy of the original, turned so it points along -Z from a grip at the origin, with an empty `slot_grip` group at the origin. Read its description |
| **Worn armour example** | `src/models/items/armour_iron_mail/` | The exact pattern for armour: a group tree with the same bone names and origins as the body it is worn on. The game moves each cube with the body's bone of the same name |
| Person's body (troops) | `base/models/peoples/warrior/warrior.bbmodel` | The body all human armour must fit. Do not edit it |
| Mage's body | `base/models/peoples/mage/mage.bbmodel` | The body all looted robes must fit. Do not edit it |
| The Dreadnought | `src/models/peoples/heavy_knight/heavy_knight.bbmodel` | The source of the Dreadnought split in section 5.2. Copy from it; do not edit it |
| Monsters | `src/models/monsters/<monster>/<monster>.bbmodel` | The sources of every armour and robe piece below |

The game places a worn piece by matching bone names, so an armour or robe file must use the body's bone names and rest-pose origins exactly:

- **Bone names:** `root`, `hips`, `torso`, `head`, `arm_upper_r`, `arm_lower_r`, `hand_r`, `arm_upper_l`, `arm_lower_l`, `hand_l`, `leg_upper_r`, `leg_lower_r`, `foot_r`, `leg_upper_l`, `leg_lower_l`, `foot_l`.
- **Origins:** copy them from the body file. The Dreadnought's body also has `pauldron_r`, `pauldron_l`, `pauldron_lame_r`, `pauldron_lame_l` and four `skirt_*` bones; use those names for the pieces that move with them.
- **Cubes:** place every cube inside the bone it should move with.

---

## 4. Who Makes What

This team makes the 16 models in sections 5.1 to 5.5: four human armour sets, the Dreadnought split into three parts, two Dreadnought armour pieces, six looted robes and one material. The code team already cut the 25 monster weapons into held models; MCP agent reviews and corrects them (section 5.6). No held weapon is left for this team to make: every monster weapon the plan lists is among the 25. The code team renders all item icons from the reviewed and delivered models.

---

## 5. The Models (16 new, 25 to review)

Each armour or robe piece is **redrawn** to fit its wearer's body, keeping the source's design, materials and colours so it is clearly the same piece. It is a worn piece, following the `armour_iron_mail` pattern in section 3, and it must look right in every clip the body plays.

### 5.1 Human Armour

These are worn by troops and fit `base/models/peoples/warrior/warrior.bbmodel`.

| # | New id | Source file | Source parts | What to make |
|---|---|---|---|---|
| 1 | `armour_hobgoblin` | `hobgoblin` | `gear_helm`, `gear_pauldron_left`, `gear_pauldron_right`, `gear_bracer_left`, `gear_bracer_right`, and the cuirass and greaves drawn on its body | The full hobgoblin set: helm, cuirass, pauldrons, bracers and greaves |
| 2 | `armour_barrow_mail` | `barrow_knight` | the rusted mail and great helm drawn into its body | A rusted mail hauberk and the great helm |
| 3 | `armour_void_cloak` | `void_stalker` | `hood`, `cloak` | A hooded cloak, worn over the body, with no armour plates |
| 4 | `armour_gnoll_bracer` | `gnoll` | `gear_bracer_left` | One bracer on the left forearm only |

### 5.2 The Dreadnought Split

Today the Dreadnought (`src/models/peoples/heavy_knight/heavy_knight.bbmodel`) is one model with his plate armour and his spiked mace built into the body. In Patch 7 his mace can be taken off and swapped for another two-handed weapon, and his armour becomes the tier 8 harness, worn as a separate piece. Split him into three new files. Leave `heavy_knight` itself unchanged; the code team switches the game over to the new files.

Put together on screen, the three new files must look exactly like today's `heavy_knight` in every clip.

| # | New id | Folder | What to make |
|---|---|---|---|
| 5 | `heavy_knight_body` | `src/models/peoples/heavy_knight_body/` | His body without the plate and without the mace: a padded arming doublet, hose and mail at the joints in his colours. Keep his helmet and plume on the body so he stays recognisable. Keep **every** group of `heavy_knight` with the same names, origins and nesting, including `pauldron_r`, `pauldron_l`, `pauldron_lame_r`, `pauldron_lame_l`, the four `skirt_*` groups and every `slot_*` group. A group whose cubes all move to the harness stays as an empty group. Copy all nine animations (`idle`, `walk`, `run`, `attack_smash`, `attack_swing`, `injured`, `death`, `warcry`, `jump`) unchanged. Remove the `mace` group from `slot_hand_r`, leaving the slot empty |
| 6 | `dreadnought_mace_held` | `src/models/items/dreadnought_mace_held/` | The `mace` group (46 cubes) copied as it is, same size, shape and colours. Turn it to the held pattern of `obsidian_handaxe_held`: grip at the origin, head along -Z. Add an empty `slot_grip` at the origin, keep `slot_mace_head`, and rename `slot_mace_grip_l` to `slot_grip_l` (where his left hand holds the shaft). In his right hand it must sit exactly where it sits today |
| 7 | `armour_dreadnought_harness` | `src/models/items/armour_dreadnought_harness/` | His plate, copied off `heavy_knight` as it looks today, as a worn piece fit to `heavy_knight_body`: cuirass, pauldrons and lames, vambraces, gauntlets, the plate skirt, greaves and sabatons. Use the body's bone names and origins, every cube in the bone it moves with. This is the tier 8 harness in his own look |

### 5.3 Dreadnought Armour

These are worn by the Dreadnought **over** his harness (item 7) and fit `heavy_knight_body`. Follow the curve of the harness's pauldrons and arms so nothing clips through.

| # | New id | Source file | Source parts | What to make |
|---|---|---|---|---|
| 8 | `armour_fiend_shoulder_dread` | `fiend` | the iron shoulder plate drawn on its body, in the cubes of its `torso` and upper arm | The fiend's iron shoulder plate, sized for him |
| 9 | `armour_minotaur_dread` | `minotaur` | `gear_bracer_l`, `gear_bracer_r`, `gear_pauldron` | The minotaur's bracers and pauldron, sized for him |

### 5.4 Looted Robes

These are worn by mages and fit `base/models/peoples/mage/mage.bbmodel`. Each robe has **one look on every mage**. Do not make battle and support versions, and do not copy the ladder robes' colour scheme.

| # | New id | Source file | What to make |
|---|---|---|---|
| 10 | `robe_plague_bearer` | `plague_bearer` | The plague bearer's robe and beaked mask |
| 11 | `robe_hollow_priest` | `hollow_priest` | The hollow priest's robe |
| 12 | `robe_necromancer` | `necromancer` | The necromancer's robe and gold crown |
| 13 | `robe_flamecaller` | `flamecaller` | The flamecaller's robe with its burning hem, the flames as `glow_*` cubes |
| 14 | `robe_fae` | `fairy` | The Fae Guardian's dress, from `skirt` and `chest_bust`, remade as a mage's robe with the same colours and pattern |
| 15 | `robe_lich` | `lich` | The Deathless Shroud: the lich's robe, from its `torso` cloth and the hanging `strip_0` to `strip_7`, with its `crown`, remade as a mage's robe. The strips stay as separate cubes on the hips and legs so they sway with the walk; leave out the floating crystal |

### 5.5 One New Material

| # | New id | What to make |
|---|---|---|
| 16 | `witchwood` | A small bundle of dark, gnarled staff wood with a faint violet sheen, a material left over when casters' staffs are scrapped. Under 12 cubes, in the style of the existing `sticks_bundle` and `bone_bundle` items |

### 5.6 Held Weapons to Review (25)

The code team cut these from the monsters' own cubes, one held piece per weapon, as `obsidian_handaxe_held` was made: the grip (the monster's hand slot) at the origin, an empty `slot_grip` group there, a `root` group over everything, the texture cropped from the monster's sheet. They are on `main` already but **none goes into the game until MCP agent has reviewed it**. Each file is `packages/assets/src/models/items/<id>/<id>.bbmodel` with its `<id>.png`, and has a row in `src/MANIFEST.md`.

Review them first, before the batches in section 6, in the order below: the bog guardian's club and Morvath's staff come first, because the loot thread's ground trophies (Bog trophy and Victor's trophy) use them as they are.

Held pattern: blades and points along -Z from the grip; bows with their limbs along Z; the sling, the censer and the chain and hook hanging along -Y; shields facing out along X on the shield arm. The hobgoblin, kobold, gnoll and minotaur pieces are at 16/9 of the size those monsters are drawn, the size their builder made them, so they are not toy-sized in a person's hand; every other piece is at its monster's drawn size.

| # | Id | Cut from (monster, group) | Length | Held by | Clips to check it in |
|---|---|---|---|---|---|
| 17 | `club_bog_guardian` | `bog_guardian`, `club` | 149 cm | nobody: scrap and the Bog trophy, lying on the ground | none; check it lies flat when turned onto its side |
| 18 | `staff_morvath` | `morvath`, `staff` | 466 cm | nobody: scrap and Victor's trophy | none; as item 17 |
| 19 | `dagger_goblin` | `goblin`, `dagger` | 37 cm | warrior, right hand | `attack_1h_stab`, `guard_1h` |
| 20 | `cleaver_goblin_chief` | `goblin_chief`, `cleaver` | 62 cm | warrior, right hand | `attack_1h_slash`, `guard_1h` |
| 21 | `sword_hobgoblin` | `hobgoblin`, `gear_sword` | 65 cm | warrior, right hand | `attack_1h_slash`, `guard_1h` |
| 22 | `sword_barrow_knight` | `barrow_knight`, `longsword` | 120 cm | warrior, right hand | `attack_1h_slash`, `guard_1h` |
| 23 | `cleaver_fiend` | `fiend`, `cleaver` | 110 cm | warrior, right hand | `attack_1h_slash`, `guard_1h` |
| 24 | `flail_plague_censer` | `plague_bearer`, `chain_1` | 52 cm | warrior, right hand | `attack_1h_slash`, `guard_1h`, `idle` |
| 25 | `flail_chain_hook` | `chain_fiend`, `held_hook` | 37 cm | warrior, right hand | `attack_1h_slash`, `guard_1h`, `idle` |
| 26 | `spear_goblin_feathered` | `goblin_wolf_rider`, `spear` | 104 cm | warrior, right hand | `attack_polearm_thrust`, `guard_polearm` |
| 27 | `spear_kobold` | `kobold`, `gear_spear` | 123 cm | warrior, right hand | `attack_polearm_thrust`, `guard_polearm` |
| 28 | `spear_gnoll` | `gnoll`, `gear_spear` | 148 cm | warrior, right hand | `attack_polearm_thrust`, `guard_polearm` |
| 29 | `axe_great_minotaur` | `minotaur`, `gear_axe` | 193 cm | Dreadnought, right hand | `attack_smash`, `attack_swing` |
| 30 | `greatsword_archfiend` | `archfiend`, `greatsword` | 204 cm | Dreadnought, right hand | `attack_smash`, `attack_swing` |
| 31 | `sling_goblin` | `goblin_slinger`, `sling` | 37 cm | warrior, right hand | `sling_throw`, `idle` |
| 32 | `bow_goblin` | `goblin_archer`, `bow` | 66 cm | warrior, left hand | `bow_shoot` |
| 33 | `bow_skeleton_recurve` | `skeleton_archer`, `recurve_bow` | 121 cm | warrior, left hand | `bow_shoot` |
| 34 | `wand_goblin_hexstick` | `goblin_mage`, `hexstick` | 90 cm | mage, right hand | `cast_bolt`, `cast_beam`, `cast_heal`, `cast_area` |
| 35 | `staff_hollow_priest` | `hollow_priest`, `crooked_staff` | 172 cm | mage, right hand | as item 34 |
| 36 | `staff_necromancer` | `necromancer`, `staff` | 135 cm | mage, right hand | as item 34 |
| 37 | `staff_flamecaller` | `flamecaller`, `iron_staff` | 197 cm | mage, right hand | as item 34 |
| 38 | `wand_fae_star` | `fairy`, `wand` | 51 cm | mage, right hand | as item 34 |
| 39 | `shield_goblin_plank` | `goblin`, `shield` | 42 cm | warrior, shield arm | `shield_block`, `guard_1h` |
| 40 | `shield_hobgoblin` | `hobgoblin`, `gear_shield` | 73 cm | warrior, shield arm | `shield_block`, `guard_1h` |
| 41 | `shield_barrow_knight` | `barrow_knight`, `kite_shield` | 70 cm | warrior, shield arm | `shield_block`, `guard_1h` |

To see a piece in a hand, copy the body (warrior, mage or `heavy_knight`) into a scratch file that you do not commit, put the piece's cubes under the body's `slot_hand_r`, `slot_hand_l` or `slot_shield_l` at that slot's origin, and play the clips. The Dreadnought's own mace is `dreadnought_mace_held` (item 6), not part of this batch.

Fix any piece in place in its own folder and manifest row. Keep the id, the grip at the origin, `slot_grip`, the `root` group, the facing and the monster's colours. Do not change the monster it was cut from.

**Icons:** the code team renders each icon from the reviewed piece after this batch merges. The Deathless Shroud's icon on `main` (`src/ui/icon_deathless_shroud.png`) is a stopgap rendered from the lich's own robe; it is replaced by one rendered from `robe_lich` (item 15) when that lands. Do not make icons.

---

## 6. Batches

There is one pull request per batch.

| Batch | Branch | Contents |
|---|---|---|
| weapons review (first) | `assets/patch7-weapons-review` | Items 17 to 41: review and correct, no new files |
| armour | `assets/patch7-armour` | Items 1 to 4 |
| dreadnought | `assets/patch7-dreadnought` | Items 5 to 9 (make 5, 6 and 7 first; 8 and 9 fit over them) |
| robes | `assets/patch7-robes` | Items 10 to 15 |
| material | `assets/patch7-material` | Item 16 |

---

## 7. Delivering Through GitHub

1. Create the batch's branch from the latest `main`, using the name from section 6.
2. Commit only files under `packages/assets/src/`: each model's folder and its rows in `src/MANIFEST.md`.
3. Push the branch and open a pull request into `main`.
   - **Title:** `Patch 7 models: <batch name>`, for example `Patch 7 models: robes`.
   - **Body:** a list with one line per model: its id, its source file and parts, its final size in cm, its cube count, its texture size, and anything that differs from this brief, with the reason.
4. Ask MCP agent to review it. Do not merge it. When MCP agent approves, the code team checks it against section 2, merges it and wires it in.
5. If the code team or MCP agent asks for changes in the pull request, push them to the same branch.

---

## 8. Review Checklist for MCP Agent

Check every model in the pull request. Fix what you can by pushing to the branch, then leave one comment that lists what you fixed and states **Approved** or what is still wrong.

**Files and format**
- [ ] Every rule in section 2 holds: branch, title, files, folders, names, format, scale, facing, pivots, textures and manifest rows.
- [ ] No existing model file is touched, `heavy_knight` included.
- [ ] No secret, token or password appears anywhere.

**Armour and robes (items 1 to 4 and 7 to 15)**
- [ ] The bone names and rest-pose origins match the target body exactly, and every cube sits in the bone it should move with.
- [ ] **Clipping:** play every clip of the target body with the piece on it:
  - warrior: `idle`, `walk`, `run`, `guard_1h`, `attack_1h_slash`, `attack_1h_stab`, `shield_block`, `guard_polearm`, `attack_polearm_thrust`, `attack_polearm_swing`, `bow_shoot`, `crossbow_shoot`, `crossbow_reload`, `musket_fire`, `musket_reload`, `throw_spear`, `sling_throw`, `ride`, `injured`, `death`
  - mage: `idle`, `walk`, `run`, `cast_bolt`, `cast_beam`, `cast_heal`, `cast_area`, `injured`, `death`, `swim`, `climb`, `sit_down`, `tinker`
  - Dreadnought (`heavy_knight_body`): `idle`, `walk`, `run`, `attack_smash`, `attack_swing`, `injured`, `death`, `warcry`, `jump`
- [ ] Remove any clipping that breaks the look. Plates must not pass through each other or through the body, and cloth must not cut through legs. Small hidden overlaps at joints are fine.
- [ ] **Smooth movement:** no part jumps, lags, stretches or flickers between frames. Every piece moves with the bone it belongs to.
- [ ] The design, colours and materials clearly match the source monster's piece.

**The Dreadnought split (items 5 to 9)**
- [ ] `heavy_knight_body` has every group of `heavy_knight` with the same names, origins and nesting, and all nine animations unchanged. `slot_hand_r` is empty.
- [ ] Body plus harness plus mace in `slot_hand_r` looks exactly like today's `heavy_knight` in all nine clips, with the mace in the same place in his hand.
- [ ] The body alone looks finished: no holes or floating parts where the plate was.
- [ ] Items 8 and 9 sit over the harness without hiding his helmet plume or the harness's pauldron outline.

**Held weapons (items 17 to 41)**
- [ ] The grip is at the origin with an empty `slot_grip` there, under a `root` group, and the piece faces as section 5.6 says.
- [ ] In the hand it is held by, the hand closes round the grip: the grip neither floats off the palm nor sinks through the fist.
- [ ] In every clip listed for it, the piece does not pass through its holder's body, head or legs in a way that breaks the look, and it does not jump between frames.
- [ ] The size reads right in the hand against the person (1.69 m) or the Dreadnought (about 2.5 m), and matches the length in the table within a few cm.
- [ ] Its look and colours are its monster's piece, cube for cube unless a fix needed a change; any change is listed in the pull request body.

**General quality**
- [ ] The pixel density matches its neighbours: no blurry or stretched texels, no missing faces and no stray cubes.
- [ ] The model stands on its origin and faces -Z, as the references do.

---

## 9. Questions

If something in this brief does not match what you find in the files, or a source part is missing, write it in the pull request instead of guessing. The code team answers there.
