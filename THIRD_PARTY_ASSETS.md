# Third-Party Assets

## Player character

- Asset family: Quaternius Universal Base Characters
- Runtime file: `night-striker.glb`, a converted/optimized copy of the Quaternius Universal Base Characters Standard `Superhero_Male_FullBody` asset
- Original creator: Quaternius
- Original pack: https://quaternius.com/packs/universalbasecharacters.html
- Runtime mirror: https://github.com/Seyamalam/blood-league-kickoff/blob/aa02a4e6d8337a0604d2da131bcbbeb1f01badf0/public/assets/vendor/quaternius/night-striker.glb
- License: CC0 1.0 / public domain
- Usage here: rigged player body, first-person arm extraction, procedural bone locomotion, and third-person camera view

The player is an imported rigged mesh. The game does not construct the humanoid body from Three.js primitive geometry.

## Store decorations

- Asset pack: KayKit Furniture Bits 1.0
- Original creator: Kay Lousberg / KayKit
- Source: https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0
- License: CC0 1.0 Universal
- Runtime format: glTF with the original KayKit sidecar buffers and atlas texture
- Usage here: striped and oval rugs, standing lamps, table lamps, books, pillows, tabletop picture frames, and wall picture frames

The original in-game plant/cactus assets remain unchanged. KayKit decorations are added around the authored furniture instead of replacing the original plants. Imported decorations are visual-only and do not create gameplay collision boxes.
