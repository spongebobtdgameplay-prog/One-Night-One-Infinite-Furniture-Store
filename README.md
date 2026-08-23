# One Night, One Infinite Furniture Store — Asset Production Kit

This kit is the master checklist for the game's art pipeline.

It currently tracks **238 asset types** and approximately **1156 target variants**.

Files:
- `Asset_Manifest.csv` — easy checklist/editing version.
- `Asset_Manifest.json` — machine-readable version for tooling.
- `PBR_Material_Library.csv` — materials we need.
- `ProcGen_Modules.json` — starter procedural room rules.
- `Asset_Rules.md` — scale, LOD, textures, rust, collisions.
- `Build_Order.md` — what to make first.
- `Blender_PBR_Setup.py` — Blender PBR wiring helper.
- `ThreeJS_AssetLoader.js` — Three.js GLB/KTX2 loader starter.
- `ThreeJS_AssetManifest.example.json` — runtime manifest example.
- `Free_Asset_Sources.md` — legal free-source plan.
- `Folder_Structure.txt` — recommended game asset layout.

The rule for this project:
**source good raw assets/materials, modify them into one coherent style, and only custom-model the pieces that define the store.**
