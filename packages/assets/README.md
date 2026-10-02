# @blockyrts/assets

Source art: Blockbench `.bbmodel` files with a manifest line each, textures,
the lighting sheet (`lighting.json`) and 32 x 32 UI icons. The model converter
in `packages/tools` turns them into `.glb` files and texture arrays at build
time (technical decision 8); the game never loads `.bbmodel` at runtime.

Empty until M1, when the worker, warrior and mage bodies and the existing mobs
come in from the project's model folder. Until real models arrive the client
draws placeholder cubes.
