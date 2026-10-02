# Asset manifest

One row per model file under `models/`. Cube counts include cubes hidden by default; texture sizes are the embedded texture (also committed as `<file>.png`), followed by any colour or material variants (`<file>_<variant>.png`, same UV layout). Each model's full notes (hit box, move speeds, key times, attachment points, second grip distances) are in its Blockbench description.

## items

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| axe | models/items/axe/axe.bbmodel | 6 | 32x64 + 9 variants (bronze, copper, flint, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| axe_flint | models/items/axe/axe_flint.bbmodel | 6 | 32x64 | extra file in axe/: flint axe (knapped head lashed on) |
| axe_hardwood | models/items/axe/axe_hardwood.bbmodel | 4 | 32x32 | extra file in axe/: hardwood axe |
| digging_stick | models/items/digging_stick/digging_stick.bbmodel | 4 | 64x64 |  |
| mallet | models/items/mallet/mallet.bbmodel | 4 | 32x32 |  |
| pick | models/items/pick/pick.bbmodel | 7 | 32x64 + 8 variants (bronze, copper, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| pick_flint | models/items/pick/pick_flint.bbmodel | 6 | 32x64 | extra file in pick/: flint pick |
| knife | models/items/knife/knife.bbmodel | 5 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sickle | models/items/sickle/sickle.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| saw | models/items/saw/saw.bbmodel | 6 | 64x32 + 6 variants (bronze, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| hoe | models/items/hoe/hoe.bbmodel | 3 | 64x64 + 8 variants (bronze, copper, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| plough | models/items/plough/plough.bbmodel | 13 | 64x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | 13 cubes (small-item cap 11): two handles, beam, share, mouldboard, landside and hitch ring each need their own cube; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| fishing_rod | models/items/fishing_rod/fishing_rod.bbmodel | 6 | 64x32 |  |
| fishing_net | models/items/fishing_net/fishing_net.bbmodel | 5 | 32x32 + 1 variants (open) |  |
| fishing_net_open | models/items/fishing_net/fishing_net_open.bbmodel | 7 | 128x256 | extra file in fishing_net/: net spread open |
| prospecting_hammer | models/items/prospecting_hammer/prospecting_hammer.bbmodel | 5 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| club | models/items/club/club.bbmodel | 6 | 32x32 |  |
| axe_war | models/items/axe_war/axe_war.bbmodel | 7 | 32x64 + 2 variants (copper, flint) |  |
| axe_war_flint | models/items/axe_war/axe_war_flint.bbmodel | 7 | 32x64 | extra file in axe_war/: flint war axe |
| dagger | models/items/dagger/dagger.bbmodel | 6 | 32x32 + 1 variants (copper) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword_short | models/items/sword_short/sword_short.bbmodel | 7 | 32x32 + 1 variants (bronze) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword | models/items/sword/sword.bbmodel | 6 | 32x32 + 4 variants (iron_bloom, iron_refined, iron_wrought, steel) |  |
| sword_steel | models/items/sword/sword_steel.bbmodel | 7 | 32x64 + 2 variants (hq_steel, steel) | extra file in sword/: steel sword (different blade); adds an hq_steel (high-quality steel) texture wherever steel is listed |
| mace | models/items/mace/mace.bbmodel | 7 | 32x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| spear | models/items/spear/spear.bbmodel | 6 | 128x128 + 3 variants (bronze, flint, hardwood) |  |
| spear_flint | models/items/spear/spear_flint.bbmodel | 5 | 128x128 | extra file in spear/: flint spear |
| spear_hardwood | models/items/spear/spear_hardwood.bbmodel | 4 | 128x128 | extra file in spear/: fire-hardened wooden spear |
| pike | models/items/pike/pike.bbmodel | 7 | 256x128 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| halberd | models/items/halberd/halberd.bbmodel | 9 | 128x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| sling | models/items/sling/sling.bbmodel | 5 | 32x32 | texture padded from 16x32 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| javelin | models/items/javelin/javelin.bbmodel | 5 | 64x64 + 2 variants (bronze, flint) |  |
| javelin_flint | models/items/javelin/javelin_flint.bbmodel | 4 | 64x64 | extra file in javelin/: flint javelin |
| bow | models/items/bow/bow.bbmodel | 8 | 64x64 |  |
| crossbow | models/items/crossbow/crossbow.bbmodel | 10 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| crossbow_steel | models/items/crossbow_steel/crossbow_steel.bbmodel | 11 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| musket | models/items/musket/musket.bbmodel | 11 | 64x64 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
