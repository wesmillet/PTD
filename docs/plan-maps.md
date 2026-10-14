# Plan: map editor and Gen 5 tileset pipeline (maps branch)

Scope agreed in the task description; this file records how it is built.
Nothing in combat, party, save, shop or UI changes beyond the hooks the map
renderer and editor need (a debug-panel button, a credits section, and the
level scene swapping its placeholder rectangles for tile layers).

## Assets

- Sources stay in `assets-src/tilesets/gen5/` (Kyle-Dove outside sheet and the
  Gen 5 exterior sheet, RPG Maker XP layout, 8 tiles x 32 px). They are never
  loaded by the game: the exterior sheet is 41504 px tall, far over the
  texture limit of most GPUs.
- `src/data/tiles.json` is the hand-written catalogue: every tile the editor
  offers, by name, with its source sheet and column/row, its layer (ground or
  decoration), stamp size for multi-tile objects (trees, rocks, signs) and a
  palette group. Terrains (autotiles) list the 3x3 edge block and, when the
  sheet has one, the 2x2 inner-corner block.
- `scripts/build-tilesets.mjs` reads the catalogue and writes
  `public/assets/tilesets/gen5-outdoor.png` (only the tiles the catalogue
  names, packed 8 wide in catalogue order so indices are stable when entries
  are appended), one RMXP-format autotile PNG per terrain under
  `public/assets/tilesets/autotiles/`, a flat-colour `placeholder.png` for
  cave maps, the credits file, and the generated index
  `src/data/tilesets.json` (tile ids to packed indices). It uses a small PNG
  codec in `scripts/png.mjs` (zlib only), so no new dependency.

## Map format

Tiled JSON, 32 px tiles, loaded by Phaser's Tiled loader from the bundled
JSON. Layers: `ground` (tiles), `terrain` (tiles whose gid names an autotile;
the renderer composes each cell from quarter tiles), `decoration` (tiles,
drawn above ground), `path` (object layer: one polyline plus `spawn` and
`exit` points), `placeable` (object layer: one 32x32 rectangle per tile).
Map properties: `tileset` and `theme`. `src/map/tiled.ts` converts a Tiled
map into the sim's `MapDef` (unchanged contract) and back.

## Autotiler

`src/map/autotile.ts` (no Phaser): RMXP 96x128 layout, one quarter per
quadrant chosen from the 8-neighbour mask (outer corner, edge, inner corner
or centre), frame offset for animated autotiles, unit tests on hand-drawn
3x3 cases. `src/map/renderer.ts` draws the composed cells into a render
texture per frame.

## Editor

`src/map/editor.ts`, opened from the debug panel. Palette from the catalogue,
tools for ground, decoration, terrain, path waypoints (bends auto-inserted so
segments stay axis-aligned), placeable toggle, spawn and exit, resize, test
play (restarts the level with the edited map), export (download) and import.

## Levels

All six maps on main are converted with `scripts/convert-legacy-maps.mjs`:
routes and Lake Verity on the outdoor tileset (grass ground, dirt-path
terrain along the enemy path, trees and rocks on the old blocked tiles, a
pond at Lake Verity), Oreburgh Gate and Mine on placeholder cave tiles until
a cave tileset is added.
