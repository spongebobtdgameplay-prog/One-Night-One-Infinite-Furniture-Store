# Asset Rules

## File naming
Use:
`Category_Name_Variant_LOD.glb`

Examples:
- `ENV_Wall_Rusty_A_LOD0.glb`
- `FUR_Sofa_3Seat_Blue_A_LOD0.glb`
- `STR_CardboardBox_Large_B_LOD1.glb`

## Scale
- 1 Blender unit = 1 meter.
- Y-up inside the browser runtime if your loader standardizes it; otherwise keep glTF's normal Y-up.
- Put modular environment pivots on a grid corner or floor-center.
- Furniture pivots go at floor contact center.
- Doors pivot on the hinge.

## Target budgets
Hero/rare furniture: 15k–40k triangles.
Normal furniture: 3k–15k triangles.
Small props: 200–5k triangles.
Modular walls/floors: 200–5k triangles.
Characters: 25k–60k triangles before LODs.
Use LOD1 around 50%, LOD2 around 15–25%.

## Textures
Default web-game target:
- 1K for small/common props.
- 2K for furniture and modular environment.
- 4K only for large hero pieces if clearly justified.
Prefer shared atlas textures for repeated props.
Use KTX2/Basis compression in the final web build.

## PBR
Use metal/rough workflow:
Base Color
Roughness
Metallic
Normal
AO
Height only when it adds visible silhouette/surface depth.

## Rust
Rust must NOT be orange geometry rectangles.
Use:
1. Real rust PBR material.
2. Edge/seam masks.
3. Rust/grime decals.
4. Geometry damage only where silhouette actually changes.

## Collisions
Use simple proxy colliders. Never use the full visual mesh for a chair, sofa, shelf, etc. unless it is extremely simple.
