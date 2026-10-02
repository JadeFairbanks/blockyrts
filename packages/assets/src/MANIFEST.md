# Asset manifest

One row per model file under `models/`. Cube counts include cubes hidden by default; texture sizes are the embedded texture (also committed as `<file>.png`), followed by any colour or material variants (`<file>_<variant>.png`, same UV layout). Each model's full notes (hit box, move speeds, key times, attachment points, second grip distances) are in its Blockbench description.

## items

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| axe | models/items/axe/axe.bbmodel | 6 | 32x64 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| axe_flint | models/items/axe/axe_flint.bbmodel | 6 | 32x64 | extra file in axe/: flint axe (knapped head lashed on) |
| axe_hardwood | models/items/axe/axe_hardwood.bbmodel | 4 | 32x32 | extra file in axe/: hardwood axe |
| digging_stick | models/items/digging_stick/digging_stick.bbmodel | 4 | 64x64 |  |
| mallet | models/items/mallet/mallet.bbmodel | 4 | 32x32 |  |
| pick | models/items/pick/pick.bbmodel | 7 | 32x64 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| pick_flint | models/items/pick/pick_flint.bbmodel | 6 | 32x64 | extra file in pick/: flint pick |
| knife | models/items/knife/knife.bbmodel | 5 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sickle | models/items/sickle/sickle.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| saw | models/items/saw/saw.bbmodel | 6 | 64x32 + 6 variants (bronze, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| hoe | models/items/hoe/hoe.bbmodel | 3 | 64x64 + 8 variants (bronze, copper, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| plough | models/items/plough/plough.bbmodel | 13 | 64x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | 13 cubes (small-item cap 11): two handles, beam, share, mouldboard, landside and hitch ring each need their own cube; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| fishing_rod | models/items/fishing_rod/fishing_rod.bbmodel | 6 | 64x32 |  |
| fishing_net | models/items/fishing_net/fishing_net.bbmodel | 5 | 32x32 |  |
| fishing_net_open | models/items/fishing_net/fishing_net_open.bbmodel | 7 | 128x256 | extra file in fishing_net/: net spread open |
| prospecting_hammer | models/items/prospecting_hammer/prospecting_hammer.bbmodel | 5 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| club | models/items/club/club.bbmodel | 6 | 32x32 |  |
| axe_war | models/items/axe_war/axe_war.bbmodel | 7 | 32x64 + 1 variants (copper) |  |
| axe_war_flint | models/items/axe_war/axe_war_flint.bbmodel | 7 | 32x64 | extra file in axe_war/: flint war axe |
| dagger | models/items/dagger/dagger.bbmodel | 6 | 32x32 + 1 variants (copper) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword_short | models/items/sword_short/sword_short.bbmodel | 7 | 32x32 + 1 variants (bronze) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword | models/items/sword/sword.bbmodel | 6 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| sword_steel | models/items/sword/sword_steel.bbmodel | 7 | 32x64 + 2 variants (hq_steel, steel) | extra file in sword/: steel sword (different blade); adds an hq_steel (high-quality steel) texture wherever steel is listed |
| mace | models/items/mace/mace.bbmodel | 7 | 32x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| spear | models/items/spear/spear.bbmodel | 6 | 128x128 + 1 variants (bronze) |  |
| spear_flint | models/items/spear/spear_flint.bbmodel | 5 | 128x128 | extra file in spear/: flint spear |
| spear_hardwood | models/items/spear/spear_hardwood.bbmodel | 4 | 128x128 | extra file in spear/: fire-hardened wooden spear |
| pike | models/items/pike/pike.bbmodel | 7 | 256x128 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| halberd | models/items/halberd/halberd.bbmodel | 9 | 128x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| sling | models/items/sling/sling.bbmodel | 5 | 32x32 | texture padded from 16x32 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| javelin | models/items/javelin/javelin.bbmodel | 5 | 64x64 + 1 variants (bronze) |  |
| javelin_flint | models/items/javelin/javelin_flint.bbmodel | 4 | 64x64 | extra file in javelin/: flint javelin |
| bow | models/items/bow/bow.bbmodel | 8 | 64x64 |  |
| crossbow | models/items/crossbow/crossbow.bbmodel | 10 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| crossbow_steel | models/items/crossbow_steel/crossbow_steel.bbmodel | 11 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| musket | models/items/musket/musket.bbmodel | 11 | 64x64 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| arrow | models/items/arrow/arrow.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt | models/items/bolt/bolt.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| arrow_poison | models/items/arrow_poison/arrow_poison.bbmodel | 7 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt_poison | models/items/bolt_poison/bolt_poison.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| quiver | models/items/quiver/quiver.bbmodel | 7 | 32x32 |  |
| quiver_empty | models/items/quiver/quiver_empty.bbmodel | 4 | 32x32 | extra file in quiver/: empty quiver |
| bolt_case | models/items/bolt_case/bolt_case.bbmodel | 4 | 32x32 |  |
| bolt_case_empty | models/items/bolt_case/bolt_case_empty.bbmodel | 3 | 32x32 | extra file in bolt_case/: empty bolt case |
| powder_horn | models/items/powder_horn/powder_horn.bbmodel | 9 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| lead_shot_pouch | models/items/lead_shot_pouch/lead_shot_pouch.bbmodel | 4 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| arrow_bundle | models/items/arrow_bundle/arrow_bundle.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt_bundle | models/items/bolt_bundle/bolt_bundle.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| javelin_bundle | models/items/javelin_bundle/javelin_bundle.bbmodel | 8 | 64x64 + 2 variants (bronze, flint) |  |
| cannonball_stack | models/items/cannonball_stack/cannonball_stack.bbmodel | 10 | 32x32 + 2 variants (iron, stone) |  |
| shield_bronze | models/items/shield_bronze/shield_bronze.bbmodel | 8 | 64x64 |  |
| shield_wicker | models/items/shield_wicker/shield_wicker.bbmodel | 6 | 64x64 |  |
| shield_wood | models/items/shield_wood/shield_wood.bbmodel | 8 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| shield_iron_kite | models/items/shield_iron_kite/shield_iron_kite.bbmodel | 9 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| shield_steel_heater | models/items/shield_steel_heater/shield_steel_heater.bbmodel | 7 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| armour_leather | models/items/armour_leather/armour_leather.bbmodel | 8 | 64x64 |  |
| armour_bronze_scale | models/items/armour_bronze_scale/armour_bronze_scale.bbmodel | 8 | 64x64 |  |
| armour_iron_mail | models/items/armour_iron_mail/armour_iron_mail.bbmodel | 10 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| armour_steel_plate | models/items/armour_steel_plate/armour_steel_plate.bbmodel | 18 | 64x128 + 2 variants (hq_steel, steel) | 18 cubes (small-item cap 11): a full plate layer needs shells on every limb bone of the rig; worn on the rig, not a loose item; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| boots | models/items/boots/boots.bbmodel | 4 | 64x64 + 2 variants (flax, leather) |  |
| helmet_leather_cap | models/items/helmet_leather_cap/helmet_leather_cap.bbmodel | 4 | 64x32 |  |
| helmet_bronze | models/items/helmet_bronze/helmet_bronze.bbmodel | 6 | 64x32 |  |
| helmet_iron_nasal | models/items/helmet_iron_nasal/helmet_iron_nasal.bbmodel | 5 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| helmet_steel_sallet | models/items/helmet_steel_sallet/helmet_steel_sallet.bbmodel | 5 | 64x32 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| wand | models/items/wand/wand.bbmodel | 2 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_acolyte | models/items/wand/wand_acolyte.bbmodel | 3 | 32x32 | extra file in wand/: Acolyte rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_adept_acolyte | models/items/wand/wand_adept_acolyte.bbmodel | 6 | 32x32 | extra file in wand/: Adept Acolyte rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_grand_magician | models/items/wand/wand_grand_magician.bbmodel | 10 | 32x32 | extra file in wand/: Grand Magician rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_mage | models/items/wand/wand_mage.bbmodel | 6 | 32x32 | extra file in wand/: Mage rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_master_mage | models/items/wand/wand_master_mage.bbmodel | 7 | 32x32 | extra file in wand/: Master Mage rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_token | models/items/trinket_token/trinket_token.bbmodel | 5 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_charm | models/items/trinket_charm/trinket_charm.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_brooch | models/items/trinket_brooch/trinket_brooch.bbmodel | 10 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_heirloom | models/items/trinket_heirloom/trinket_heirloom.bbmodel | 11 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| trinket_moonleaf | models/items/trinket_moonleaf/trinket_moonleaf.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| trinket_sunheart | models/items/trinket_sunheart/trinket_sunheart.bbmodel | 8 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| log_softwood | models/items/log_softwood/log_softwood.bbmodel | 4 | 64x128 |  |
| log_hardwood | models/items/log_hardwood/log_hardwood.bbmodel | 4 | 64x128 |  |
| sticks_bundle | models/items/sticks_bundle/sticks_bundle.bbmodel | 8 | 64x64 |  |
| stone_chunk | models/items/stone_chunk/stone_chunk.bbmodel | 3 | 32x32 |  |
| flint_nodule | models/items/flint_nodule/flint_nodule.bbmodel | 3 | 32x32 |  |
| coal_lump | models/items/coal_lump/coal_lump.bbmodel | 3 | 32x32 |  |
| marble_block | models/items/marble_block/marble_block.bbmodel | 2 | 32x32 |  |
| clay_lump | models/items/clay_lump/clay_lump.bbmodel | 3 | 32x32 |  |
| sand_sack | models/items/sand_sack/sand_sack.bbmodel | 7 | 32x32 |  |
| gravel_sack | models/items/gravel_sack/gravel_sack.bbmodel | 7 | 32x32 |  |
| earth_sack | models/items/earth_sack/earth_sack.bbmodel | 7 | 32x32 |  |
