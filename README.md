# The Infinity Store

A browser horror game set inside an enormous furniture store that changes after closing.

## Playable prototype

The repo has a GitHub Pages entry point at `index.html` and a Three.js showroom prototype with first- and third-person play.

Current prototype features:
- `index.html` at the repository root so GitHub Pages has a real entry page
- WASD movement
- mouse look / pointer lock
- Shift to run
- store-time HUD
- streamed infinite showroom sections with walls, dividers, ceiling lights and 3D signs
- curated CC0 furniture/store models loaded from `Models/.../GLB/`
- additional CC0 retail props and shelving used for showroom dressing
- living room, bedroom, kitchen, bathroom, storage, lighting, architecture and decor sections

## Asset production kit

The repository also contains the master art-production kit. It tracks **238 asset types** and approximately **1156 target variants**.

Important production files:
- `Asset_Manifest.csv`
- `Asset_Manifest.json`
- `PBR_Material_Library.csv`
- `ProcGen_Modules.json`
- `Asset_Rules.md`
- `Build_Order.md`
- `Blender_PBR_Setup.py`
- `ThreeJS_AssetLoader.js`
- `ThreeJS_AssetManifest.example.json`
- `Free_Asset_Sources.md`
- `Folder_Structure.txt`

## Models

`Models/` contains the curated model set in ready-to-load GLB format and source OBJ/MTL format.

The initial model geometry comes from Quaternius under CC0 1.0 / Public Domain. The original license is included in `Models/QUATERNIUS_LICENSE.txt`.

## Art rule

Source good raw assets and materials, modify them into one coherent horror-store style, and custom-model only the pieces that define The Infinity Store. Rust, grime and wear should use proper PBR materials/decals instead of orange geometry pretending to be corrosion.
