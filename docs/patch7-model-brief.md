# Patch 7 Model Brief

These are the instructions for the modelling team that builds every model Patch 7 needs for *Survive and Conquer*, a browser RTS in this repository (`JadeFairbanks/blockyrts`). The team is a chief of staff, several modeller bots, and one reviewer bot named **MCP agent**. The game's code team does not make models. It wires in what this team delivers.

Read this whole file before starting. Everything you need is in this repository; nothing outside it is required.

---

## 1. How the Team Works

1. **The chief of staff** reads this brief and splits the work into the batches in section 6, one modeller bot per batch or several batches per bot.
2. **Each modeller bot** makes its batch's models on its own branch and opens one pull request per batch (section 7).
3. **MCP agent** reviews every model in every pull request against the checklist in section 8. It fixes problems itself by pushing to that pull request's branch, then approves the batch in a pull request comment.
4. **The code team** merges each approved batch and wires the models into the game. Do not merge your own pull requests.

**Ground rules:**

- Never push to `main`. Never change anything outside `packages/assets/src/`.
- Never put a password, token, key or other secret in any file, commit, pull request or comment, and never ask the project owner for one.
- **Never change an existing model file.** That includes every monster, the player bodies in `packages/assets/base/models/`, and `heavy_knight`. Every model in this brief is a new file. Where a weapon or piece comes from an existing model, copy the parts into a new file and leave the original untouched.
- **Weapons are not redrawn.** Each one is cut from its monster's model exactly as it looks, then resized and turned for a hand. Armour and robes, by contrast, are redrawn to fit their new wearer.
- Item icons, How to play pictures and all code are made by the code team, not by you.

---

## 2. Formats and Conventions

These are the repository's own rules from `packages/assets/README.md`. A model that breaks one fails the build.

- **Format:** Blockbench, "Generic Model" (free) format, with the texture embedded. One model per file.
- **Files:** `packages/assets/src/models/items/<id>/<id>.bbmodel` with its texture `packages/assets/src/models/items/<id>/<id>.png`. The `<id>` is the name given in section 4 or 5, lowercase with underscores. The folder, the model file and its texture all use it.
- **Only** `.bbmodel` and `.png` files, plus rows in `packages/assets/src/MANIFEST.md`. Do not commit renders, `.glb`, `.gltf`, `.obj`, GIFs, videos or zip files.
- **Scale:** 1 model unit = 2.8125 cm. A person is 60 units (1.69 m) tall. Lengths in this brief are given in both centimetres and units.
- **Bones:** groups with lowercase names and underscores. `_r` and `_l` are the wearer's own right and left.
- **Attachment points:** empty groups named `slot_<name>`.
- **Glowing parts:** cubes named `glow_<something>`. No particles or lights in files.
- **Textures:** 1 texture pixel per model unit, each side a power of two from 16 to 1024. Keep the source model's colours and pixel style.
- **Cube budget:** small items should stay under 12 cubes. A weapon copied from a monster may keep the cubes it has. Record the count in the manifest row.
- **Notes:** each model's notes go in its Blockbench description and in its `MANIFEST.md` row. The notes cover its source, size, slot and anything unusual. Follow the format of the existing rows in the manifest's `items` section.

---

## 3. Reference Files

Open these before starting. Everything is under `packages/assets/`.

| What | Path | Use it for |
|---|---|---|
| Rules | `README.md` | The format rules above, in full |
| Manifest | `src/MANIFEST.md` | Example rows for items, held weapons and armour |
| **Held weapon example** | `src/models/items/obsidian_handaxe_held/` | The exact pattern for every weapon in section 4: a copy of the original, turned so it points along -Z from a grip at the origin, with an empty `slot_grip` group at the origin. Read its description |
| One-handed weapon | `src/models/items/axe_war/` | Grip at the origin, blade along -Z, edge facing -Y |
| Bow | `src/models/items/bow/` | Held in the left hand: grip at the origin, limbs along Z, string on the +Y side |
| Sling | `src/models/items/sling/` | Finger loop at the origin, cords hanging along -Y |
| Wand | `src/models/items/wand/` | Grip at the origin, tip along -Z |
| Shield | `src/models/items/shield_wood/` | Worn on the left arm (`slot_shield_l`), face toward -X |
| Spear | `src/models/items/spear/` | Long weapon held in the right hand |
| **Worn armour example** | `src/models/items/armour_iron_mail/` | The exact pattern for armour: a group tree with the same bone names and origins as the body it is worn on. The game moves each cube with the body's bone of the same name |
| Person's body (troops) | `base/models/peoples/warrior/warrior.bbmodel` | The body all human armour must fit. Do not edit it |
| Mage's body | `base/models/peoples/mage/mage.bbmodel` | The body all looted robes must fit. Do not edit it |
| The Dreadnought | `src/models/peoples/heavy_knight/heavy_knight.bbmodel` | The body the Dreadnought's armour must fit, and the source of his mace. Do not edit it |
| Monsters | `src/models/monsters/<monster>/<monster>.bbmodel` | The sources of every weapon and armour piece below |

The game places a worn piece by matching bone names, so an armour or robe file must use the body's bone names and rest-pose origins exactly:

- **Bone names:** `root`, `hips`, `torso`, `head`, `arm_upper_r`, `arm_lower_r`, `hand_r`, `arm_upper_l`, `arm_lower_l`, `hand_l`, `leg_upper_r`, `leg_lower_r`, `foot_r`, `leg_upper_l`, `leg_lower_l`, `foot_l`.
- **Origins:** copy them from the body file.
- **Cubes:** place every cube inside the bone it should move with.

---

## 4. Held Weapons (26 models)

**How to make each one:**
1. Open the source monster.
2. Copy the named group or groups into a new file.
3. Scale the copy so its overall length matches the length given here. This is the weapon's real size in the game, not the size it happens to have in the monster file.
4. Turn it to the held pattern of the reference named in the "Held like" column, with the grip at the origin.
5. Add an empty `slot_grip` group at the origin.
6. Keep its shape, colours and pixel look exactly as in the monster. Do not redesign it.

Glowing or effect parts named `fx_*` in the source become `glow_*` cubes, or are left out if they are particles.

| # | New id | Source file | Group(s) to copy | Length | Held like |
|---|---|---|---|---|---|
| 1 | `goblin_dagger_held` | `goblin` | `dagger` | 36 cm (12.8 u) | `axe_war` (one-handed) |
| 2 | `goblin_plank_shield_held` | `goblin` | `shield` | 41 cm (14.6 u) | `shield_wood` |
| 3 | `goblin_sling_held` | `goblin_slinger` | `sling` (with `sling_stone`) | 36 cm (12.8 u) | `sling` |
| 4 | `goblin_bow_held` | `goblin_archer` | `bow` | 65 cm (23.1 u) | `bow` |
| 5 | `goblin_cleaver_held` | `goblin_chief` | `cleaver` | 68 cm (24.2 u) | `axe_war` |
| 6 | `goblin_hexstick_held` | `goblin_mage` | `hexstick` | 85 cm (30.2 u) | `wand` |
| 7 | `goblin_spear_held` | `goblin_wolf_rider` | `spear` | 99 cm (35.2 u) | `spear` |
| 8 | `gnoll_spear_held` | `gnoll` | `gear_spear` | 134 cm (47.6 u) | `spear` |
| 9 | `kobold_spear_held` | `kobold` | `gear_spear` | 148 cm (52.6 u) | `spear` |
| 10 | `hobgoblin_sword_held` | `hobgoblin` | `gear_sword` | 57 cm (20.3 u) | `axe_war` |
| 11 | `hobgoblin_shield_held` | `hobgoblin` | `gear_shield` | 61 cm (21.7 u) | `shield_wood` |
| 12 | `skeleton_recurve_bow_held` | `skeleton_archer` | `recurve_bow` | 121 cm (43.0 u) | `bow` |
| 13 | `barrow_longsword_held` | `barrow_knight` | `longsword` | 114 cm (40.5 u) | `axe_war` |
| 14 | `barrow_kite_shield_held` | `barrow_knight` | `kite_shield` | 66 cm (23.5 u) | `shield_wood` |
| 15 | `plague_censer_held` | `plague_bearer` | `chain_1`, `chain_2`, `chain_3`, `censer` | 50 cm (17.8 u) with its chain | `sling`: chain hanging from the grip, keeping the chain links as nested groups so the code can swing them |
| 16 | `necromancer_staff_held` | `necromancer` | `staff` | 136 cm (48.4 u) | `wand` |
| 17 | `hollow_priest_staff_held` | `hollow_priest` | `crooked_staff` (crystal as `glow_*`) | 167 cm (59.4 u) | `wand` |
| 18 | `fiend_cleaver_held` | `fiend` | `cleaver` | 110 cm (39.1 u) | `axe_war` |
| 19 | `chain_hook_held` | `chain_fiend` | `held_hook` with its chain | about 150 cm (53.3 u) of chain, hook 38 cm | `sling`: chain hanging from the grip in linked groups, hook at the end |
| 20 | `flamecaller_staff_held` | `flamecaller` | `iron_staff` (fire as `glow_*`) | 178 cm (63.3 u) | `wand` |
| 21 | `minotaur_axe_held` | `minotaur` | `gear_axe` | 190 cm (67.6 u) | `spear`, two-handed |
| 22 | `archfiend_greatsword_held` | `archfiend` | `greatsword` (not the banner) | 165 cm (58.7 u) | `spear`, two-handed |
| 23 | `bog_club_held` | `bog_guardian` | `club` | 157 cm (55.8 u) | `spear`, two-handed |
| 24 | `fae_star_wand_held` | `fairy` | `wand` | 57 cm (20.3 u) | `wand` |
| 25 | `morvath_staff_held` | `morvath` | `staff` | 467 cm (166 u) | `wand` |
| 26 | `dreadnought_mace_held` | `heavy_knight` | `mace` with `slot_mace_head` and `slot_mace_grip_l` | its size in that file, unchanged | as in `heavy_knight` |

**Notes:**

- **Two-handed weapons** (21, 22, 23 and 26) also get an empty group `slot_grip_l` where the left hand holds the shaft. Use `slot_mace_grip_l` in `heavy_knight` as the example.
- **Items 23 and 25** cannot be wielded in the game. They are still needed for the item on the ground and in How to play, so make them exactly the same way.
- **Item 26:** the Dreadnought's mace becomes removable. Copy it out of `heavy_knight` into its own file and leave `heavy_knight` unchanged. The code hides the mace part when he holds something else.

---

## 5. Armour and Robes (12 models)

Each armour or robe piece is **redrawn** to fit its wearer's body, keeping the source's design, materials and colours so it is clearly the same piece. It is a worn piece, following the `armour_iron_mail` pattern in section 3, and it must look right in every clip the body plays.

### 5.1 Human Armour

These are worn by troops and fit `base/models/peoples/warrior/warrior.bbmodel`.

| # | New id | Source file | Source parts | What to make |
|---|---|---|---|---|
| 27 | `armour_hobgoblin` | `hobgoblin` | `gear_helm`, `gear_pauldron_left`, `gear_pauldron_right`, `gear_bracer_left`, `gear_bracer_right`, and the cuirass and greaves drawn on its body | The full hobgoblin set: helm, cuirass, pauldrons, bracers and greaves |
| 28 | `armour_barrow_mail` | `barrow_knight` | the rusted mail and great helm drawn into its body | A rusted mail hauberk and the great helm |
| 29 | `armour_void_cloak` | `void_stalker` | `hood`, `cloak` | A hooded cloak, worn over the body, with no armour plates |
| 30 | `armour_gnoll_bracer` | `gnoll` | `gear_bracer_left` | One bracer on the left forearm only |

### 5.2 Dreadnought Armour

These fit `src/models/peoples/heavy_knight/heavy_knight.bbmodel`. He is a giant about 2.5 m tall. These pieces are worn **over** his own plate. Follow the curve of his pauldrons and arms so nothing clips through.

| # | New id | Source file | Source parts | What to make |
|---|---|---|---|---|
| 31 | `armour_fiend_shoulder_dread` | `fiend` | the iron shoulder plate drawn on its body, in the cubes of its `torso` and upper arm | The fiend's iron shoulder plate, sized for him |
| 32 | `armour_minotaur_dread` | `minotaur` | `gear_bracer_l`, `gear_bracer_r`, `gear_pauldron` | The minotaur's bracers and pauldron, sized for him |

### 5.3 Looted Robes

These are worn by mages and fit `base/models/peoples/mage/mage.bbmodel`. Each robe has **one look on every mage**. Do not make battle and support versions, and do not copy the ladder robes' colour scheme.

| # | New id | Source file | What to make |
|---|---|---|---|
| 33 | `robe_plague_bearer` | `plague_bearer` | The plague bearer's robe and beaked mask |
| 34 | `robe_hollow_priest` | `hollow_priest` | The hollow priest's robe |
| 35 | `robe_necromancer` | `necromancer` | The necromancer's robe and gold crown |
| 36 | `robe_flamecaller` | `flamecaller` | The flamecaller's robe with its burning hem, the flames as `glow_*` cubes |
| 37 | `robe_fae` | `fairy` | The Fae Guardian's dress, from `skirt` and `chest_bust`, remade as a mage's robe with the same colours and pattern |

### 5.4 One New Material

| # | New id | What to make |
|---|---|---|
| 38 | `witchwood` | A small bundle of dark, gnarled staff wood with a faint violet sheen, a material left over when casters' staffs are scrapped. Under 12 cubes, in the style of the existing `sticks_bundle` and `bone_bundle` items |

---

## 6. Batches

There is one pull request per batch.

| Batch | Branch | Contents |
|---|---|---|
| 1 | `assets/patch7-weapons-1` | Items 1 to 13 |
| 2 | `assets/patch7-weapons-2` | Items 14 to 26 |
| 3 | `assets/patch7-armour` | Items 27 to 30 |
| 4 | `assets/patch7-dreadnought` | Items 31 and 32 |
| 5 | `assets/patch7-robes` | Items 33 to 37 |
| 6 | `assets/patch7-material` | Item 38 |

---

## 7. Delivering Through GitHub

1. Create the batch's branch from the latest `main`, using the name from section 6.
2. Commit only files under `packages/assets/src/`:
   - each model's folder
   - its rows in `src/MANIFEST.md`, in the `items` section, in the format of the rows already there
3. Push the branch and open a pull request into `main`.
   - **Title:** `Patch 7 models: <batch name>`, for example `Patch 7 models: weapons 1`.
   - **Body:** a list with one line per model: its id, its source file and parts, its final size in cm, its cube count, its texture size, and anything that differs from this brief, with the reason.
4. Ask MCP agent to review it. Do not merge it. When MCP agent approves, the code team merges it and wires it in.
5. If the code team or MCP agent asks for changes in the pull request, push them to the same branch.

---

## 8. Review Checklist for MCP Agent

Check every model in the pull request. Fix what you can by pushing to the branch, then leave one comment that lists what you fixed and states **Approved** or what is still wrong.

**Files and format**
- [ ] Only `.bbmodel` and `.png` files under `packages/assets/src/models/items/<id>/`, plus `MANIFEST.md` rows. Nothing else is changed. No existing model file is touched.
- [ ] The folder, file and texture names match the id in this brief exactly.
- [ ] The file is in Generic Model format with its texture embedded, and the texture follows the size rules in section 2.
- [ ] There is a manifest row for every model, with source, size, cube count and texture size.
- [ ] No secret, token or password appears anywhere.

**Weapons (items 1 to 26)**
- [ ] The weapon looks identical to its source in the monster model: same shape, colours and pixels. It is not redrawn.
- [ ] Its length matches the table, within 5%.
- [ ] The grip is at the origin with `slot_grip` there, and it is turned like its "Held like" reference. Two-handed weapons have `slot_grip_l` on the shaft.
- [ ] Chains on items 15 and 19 are linked groups that hang naturally from the grip.

**Armour and robes (items 27 to 37)**
- [ ] The bone names and rest-pose origins match the target body exactly, and every cube sits in the bone it should move with.
- [ ] **Clipping:** play every clip of the target body with the piece on it:
  - warrior: `idle`, `walk`, `run`, `guard_1h`, `attack_1h_slash`, `attack_1h_stab`, `shield_block`, `guard_polearm`, `attack_polearm_thrust`, `attack_polearm_swing`, `bow_shoot`, `crossbow_shoot`, `crossbow_reload`, `musket_fire`, `musket_reload`, `throw_spear`, `sling_throw`, `ride`, `injured`, `death`
  - mage: `idle`, `walk`, `run`, `cast_bolt`, `cast_beam`, `cast_heal`, `cast_area`, `injured`, `death`, `swim`, `climb`, `sit_down`, `tinker`
  - Dreadnought: `idle`, `walk`, `run`, `attack_smash`, `attack_swing`, `injured`, `death`, `warcry`, `jump`
- [ ] Remove any clipping that breaks the look. Plates must not pass through each other or through the body, and cloth must not cut through legs. Small hidden overlaps at joints are fine.
- [ ] **Smooth movement:** no part jumps, lags, stretches or flickers between frames. Every piece moves with the bone it belongs to.
- [ ] The design, colours and materials clearly match the source monster's piece.
- [ ] Dreadnought pieces sit over his plate without hiding his helmet plume or his own pauldrons' outline.

**General quality**
- [ ] The pixel density matches its neighbours: no blurry or stretched texels, no missing faces and no stray cubes.
- [ ] The model stands on its origin and faces -Z, as the references do.

---

## 9. Questions

If something in this brief does not match what you find in the files, or a source part is missing, write it in the pull request instead of guessing. The code team answers there.
