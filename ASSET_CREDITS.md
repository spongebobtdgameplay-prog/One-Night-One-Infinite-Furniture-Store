# Asset Credits

## Cardboard box texture

The cardboard display uses a locally embedded copy of:
- **cardboard_box.png**
- Source: Microsoft experimental-pcf-control-assets
- License: CC BY 4.0
- Repository: https://github.com/microsoft/experimental-pcf-control-assets

The texture is embedded in `cardboard-box-asset.js` so the box does not depend on a runtime texture request.

The displayed cardboard-box geometry normally loads from the matching `cardboard_box.glb` in the same Microsoft repository. If that model cannot load, the game creates a simple shipping-carton fallback with lid panels, tape, and a shipping label, then applies the same embedded cardboard texture.
