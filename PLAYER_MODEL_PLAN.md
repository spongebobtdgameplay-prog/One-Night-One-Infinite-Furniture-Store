# Player Model Plan

## Chosen base
Use Quaternius **Universal Base Characters** as the player-body source.

Why:
- Proper humanoid rig instead of primitive boxes/cylinders.
- Animation-friendly topology.
- Around 13k triangles per base character, which is a good web-game budget.
- Native glTF export.
- CC0 license.
- Designed to work with Quaternius Universal Animation Library.

Source:
- https://quaternius.com/packs/universalbasecharacters.html
- https://quaternius.itch.io/universal-base-characters

Animations:
- https://quaternius.itch.io/universal-animation-library

## Runtime setup
Use one regular-proportion base character as the first player body.

The deployed build should contain only the final character GLB and the animation clips we actually use, not the entire source pack.

Initial animation set:
- Idle
- Walk forward
- Walk backward
- Strafe left
- Strafe right
- Jog/run
- Crouch idle
- Crouch walk
- Interaction/reach

Use the no-root-motion versions for normal movement because the existing game controller should remain responsible for player position.

## First-person mode
The full rig stays loaded, but the local player's head and any geometry that clips through the camera are hidden from the first-person camera.

The torso/legs can remain available for later body-awareness features, mirrors, shadows, multiplayer, and camera transitions.

## Third-person / zoom-out later
Do not implement zoom-out until the rigged body is imported and locomotion is working.

When added:
- mouse wheel or a dedicated key changes camera distance;
- first-person distance = 0;
- third-person target distance around 2.5 to 3.2 meters;
- raycast between player and desired camera position to prevent the camera going through walls/furniture;
- show the full head/body only in third person;
- keep movement relative to camera/player facing.

## Character art direction
The player should look like a believable store visitor/worker, not a superhero and not a blocky low-poly mascot.

Target treatment:
- regular human proportions;
- subdued clothing colors;
- slightly worn fabric textures;
- neutral shoes;
- no exaggerated cartoon silhouette;
- 1K textures for the deployed web build unless a close-up proves 2K is necessary.

## Performance target
- Player body: roughly 13k triangles.
- Clothing/hair additions: keep the total local body around 20k to 30k triangles when possible.
- One skinned player mesh is cheap compared with filling the environment with many unique high-poly static props.
- Reuse the same rig for multiplayer player bodies and employee humanoids when practical.
