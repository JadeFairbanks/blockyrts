# @blockyrts/assets

Source art for the game. Models are made in Blockbench; the game never loads a
`.bbmodel` at runtime. At build time the model converter in `packages/tools`
turns each model into a `.glb` and packs the textures into texture arrays
(technical decision 8 in docs/blueprint.md). The converter is M1 work; until
then `pnpm assets:manifest` only lists the manifest and checks it against the
files.

Everything under `src/` arrives by pull request from the modelling bot, on one
`assets/<batch>` branch per batch. Its first batch creates `src/MANIFEST.md`.

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
  sky/                              sky and lighting images (section L)
```

Categories follow the wishlist sections A to H: `peoples`, `animals`,
`monsters`, `items`, `mechanical`, `buildings`, `world-props`,
`projectiles-and-spells`. The `<id>` is the entry's id from the wishlist, in
lowercase with underscores, and the folder, the model file and its textures
all use it.

## What may be committed

- Only `.bbmodel` and `.png` files, plus `MANIFEST.md`. No `.glb`, `.gltf`,
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
