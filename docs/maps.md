# Maps, tilesets and the map editor

Levels are Tiled JSON maps drawn with Gen 5 (Black/White) style tiles. This
page covers the map format, the autotiler, the in-game editor, how to add a
level and how to add tiles from a new tileset pack.

Quick reference:

```
npm run build-tilesets      # tiles.json -> public/assets/tilesets/ + src/data/tilesets.json
npm test                    # includes src/map/*.test.ts
?level=route-201&party=debug   then backtick -> "Map editor"
```

## Files

| Path | What it is |
| --- | --- |
| `assets-src/tilesets/gen5/` | Source sheets from the Essentials pack (never loaded by the game) and `CREDITS.txt` |
| `src/data/tiles.json` | Hand-written tile catalogue: named tiles, stamps and terrains, by source column/row |
| `scripts/build-tilesets.mjs` | Packs the catalogue's tiles, builds autotiles and the placeholder sheet, writes the index |
| `scripts/png.mjs` | Tiny PNG reader/writer the build uses (no npm dependency) |
| `src/data/tilesets.json` | Generated index: tile id to packed index, autotile images |
| `public/assets/tilesets/` | Shipped sheets: `gen5-outdoor.png`, `placeholder.png`, `autotiles/*.png`, `CREDITS.txt` |
| `src/data/maps/*.json` | One Tiled map per level |
| `src/data/maps.ts` | Registers the maps; `getMap` (sim) and `getMapModel` (rendering, editing) |
| `src/map/autotile.ts` | RPG Maker XP autotiling, pure, unit tested |
| `src/map/tiled.ts` | Tiled JSON encode/decode, `MapModel`, `toMapDef` |
| `src/map/catalogue.ts` | Catalogue lookups (entries, stamps, terrains, credits) |
| `src/map/renderer.ts` | Phaser: tile layers plus composed terrain render textures |
| `src/map/editor.ts` | The in-game editor (DOM panel plus overlay) |
| `src/map/editorStore.ts` | In-memory drafts per level for test play |
| `scripts/convert-legacy-maps.mjs` | Converter from the pre-Tiled map format, kept as an example of building a map in code |

## Map format

A level map is a Tiled JSON map (orthogonal, `right-down`, 32 px tiles,
uncompressed layer data). Phaser's Tiled loader reads the ground and
decoration layers directly; everything else is read by `src/map/tiled.ts`.

Map properties:

- `tileset`: id of the main tileset (`gen5-outdoor` or `placeholder`).
- `theme`: `grass` or `cave`. Dusk Balls trigger in cave maps.
- `name`: the map id; the export file is named after it.

Layers, in this order:

1. `ground` (tile layer): tiles from the main tileset. Every cell should be
   filled.
2. `terrain` (tile layer): autotile terrains. Each cell is empty or the first
   tile (the preview) of a tileset named `autotile:<terrain id>`. Tiled shows
   the preview tile; the game composes the real edges at runtime.
3. `decoration` (tile layer): drawn above ground and terrain. Multi-tile
   objects (trees, rocks, signs) are stamps: each cell holds its own tile of
   the stamp. Cells whose catalogue entry is `solid` are blocked for
   placement.
4. `path` (object layer): a polyline object named `path` whose points are
   tile centres, plus point objects `spawn` (first waypoint) and `exit`
   (last). Segments must be axis-aligned; the simulation rejects diagonals.
5. `placeable` (object layer): one 32x32 rectangle per tile where Pokémon
   can be placed.

The `tilesets` array embeds the main tileset (firstgid 1) followed by one
12-tile tileset per terrain, in catalogue order. Tilesets are matched by
name when loading, so a map saved with an older set of terrains still loads
as long as the terrain ids exist. Flip bits on gids are ignored.

`MapModel` is the in-memory form: `ground` and `decoration` hold
`packed index + 1` per cell (0 = empty), `terrain` holds terrain ids,
`path` and `placeable` are tile coordinates. `toMapDef` turns it into the
simulation's unchanged `MapDef` (`theme`, size, `path`, `placeable`,
`blocked` = solid decoration cells), and `validateMap` in `src/sim/map.ts`
checks it.

## The autotiler

`src/map/autotile.ts` implements RPG Maker XP autotiles. An autotile image
is 96x128 px per animation frame (frames side by side), as 3x4 tiles:

```
row 0: preview | (unused) | inner corners
row 1: TL      | T        | TR
row 2: L       | C        | R
row 3: BL      | B        | BR
```

Each rendered cell is four 16x16 quarters. For a quadrant, look at its two
edge neighbours and its diagonal neighbour (for the top-left quadrant: north,
west, north-west):

| north | west | north-west | quarter used |
| --- | --- | --- | --- |
| no | no | any | outer corner (TL tile) |
| yes | no | any | left edge (L tile) |
| no | yes | any | top edge (T tile) |
| yes | yes | no | inner corner (inner-corners tile) |
| yes | yes | yes | centre (C tile) |

The other quadrants mirror this. It gives the same 47 appearances as RPG
Maker's lookup table (`distinctCells()` in the tests checks that). Cells past
the map edge count as the same terrain (`edgesConnect`), so a path running
off the map has no cap. Animated autotiles add 96 px per frame;
`quarterRect(ref, frame)` offsets the quarter and the renderer keeps one
render texture per frame and cycles their visibility every `frameMs`.

The Essentials pack ships no separate autotile files: its edges are drawn
into the sheet as 3x3 blocks, some with a 2x2 inner-corner block next to
them. `build-tilesets.mjs` assembles proper autotiles from those: the 3x3
block fills rows 1 to 3, the centre is the preview, and the inner-corners
tile takes the top-left quarter of the inner block's top-left tile, the
top-right quarter of its top-right tile and so on. Terrains without an inner
block (tall grass, snow, beach, ice, dark-grass path) fall back to the outer
corner quarters, which still closes the edge with a right-angled corner.

`src/map/autotile.test.ts` checks hand-drawn 3x3 cases (island, full block,
edges, L-shape with inner corner, plus shape, diagonal-only, strip) and the
frame offset.

## The map editor

Open a level, press backtick for the debug panel and click "Map editor". The
simulation pauses while the editor is open and the level's input is routed
to the editor. Everything the editor changes is drawn live.

- **Ground / Decoration**: pick a tile in the palette (filter by group), click
  to paint. 1x1 tiles paint while dragging; stamps (trees, rocks, signs) are
  placed per click with their top-left at the clicked tile. Right click
  erases: on the decoration layer it removes the whole stamp.
- **Terrain**: pick an autotile and click or drag; right click erases.
- **Erase**: choose the layer, then click or drag.
- **Path**: click tiles in order to add waypoints. A bend is inserted when
  the new point is not in line with the last one. "Undo waypoint" and
  "Clear path".
- **Placeable**: click a tile to toggle it.
- **Spawn / Exit**: click a tile to move the first or last waypoint (a bend
  is inserted if needed).
- **Name, Size, Theme, Tileset**: resizing keeps cells at their coordinates
  and drops objects outside the new size. Changing the tileset clears the
  ground and decoration layers (asks first).
- The status line shows the validation result (`validateMap`) as you edit.
- **Play edited map** restarts the level with the draft. The draft lives in
  memory per level, so reopening the editor continues from it; **Reset to
  shipped map** forgets it. **Discard changes** closes without keeping edits.
- **Export JSON** downloads `<name>.json` in the Tiled format above;
  **Import JSON** loads one (validated; errors show in the status line).

Nothing is saved to the game's save data or localStorage; the export file is
the deliverable.

## Black/White route maps

The outdoor routes (Route 201, Lake Verity, Route 202, Route 203) are built by
`scripts/bw-maps.py` from UltimoSpriter's Gen 5 exterior sheet, the authentic
Black/White style: the 4x4 seamless BW grass texture, the sandy BW footpath
(terrain `bw-path`), BW tall-grass tufts, grassy cliff ledges with rock faces,
and BW conifers. Maps have one decoration layer, so the script composites
every tree (forest walls in staggered overlapping rows, plus lone trees) onto
one canvas, cuts the covered cells into tiles, dedupes them into
`assets-src/tilesets/gen5/generated-bw.png`, registers everything under the
`bw-outdoor` tileset and runs the tileset build before writing the maps.

Layouts are traced from the Platinum map renders: `scripts/gen4-traces/`
holds each map's 16px tile classes (forest, water, road, tall grass, rock,
grass), sampled from the Bulbagarden Archives images in a browser, and
`downsample.py` resamples them to 30x14. Forest becomes composited BW trees,
water the pond terrain, tall grass is smoothed into patches, and the enemy
path is laid along the real road. Spots are picked automatically: cells in
melee range of the path, ranked by how much path they cover, at least three
tiles apart. Run
`python3 scripts/bw-maps.py`; it always designs every BW map so the generated
sheet covers all of them. Spots are range-checked the same way as below.

## The Sinnoh maps script

The six opening maps (Route 201, Lake Verity, Route 202, Route 203, Oreburgh
Gate, Oreburgh Mine 1F) are designed in code in `scripts/sinnoh-maps.py`, one
function per location, modelled on the Platinum map renders: deep conifer
forest walls, uniform grass, tall grass in blocks, lone trees in clearings,
Lake Verity's big lake with its rocky island, Route 202's central tree column,
Route 203's pond and stepped Mt. Coronet cliff, and cave corridors carved out
of rock-shelf walls (`auto_cliff` picks rim, side and face pieces from the
neighbours) with a cobbled track, until a cave tileset exists.

Placement spots must be within melee range of the path (move_overrides.json
`defaults.range`, 1.5 tiles), because starters only know moves like Tackle;
the script refuses any spot further away and puts most of them in the inside
corners of bends. `src/sim/spot-reach.test.ts` places a level 5 Tackle user
on every spot of every level and fails if one never lands a hit. In game the
spots are drawn as small worn-earth patches (flat stones in caves) from
`src/ui/spotMarker.ts` and only highlight while placing or dragging. Run `python3 scripts/sinnoh-maps.py [map-id ...]` to
regenerate; it refuses to put decoration on the path or on a placeable spot.
Edits made in the in-game editor and exported win over the script: once a map
is hand-edited, stop regenerating it.

Tree stamps in the Kyle-Dove sheet are 3 tiles wide (pairs and big trees 5),
not 2 and 4; the catalogue was corrected, which repacked the outdoor sheet.

The simulation tests use frozen copies of the original Route 201 and Mine
layouts (`src/sim/fixtures/`), so redesigning a map does not change test
geometry.

## Adding a level

1. Draw the map in the editor (or in Tiled, using
   `public/assets/tilesets/gen5-outdoor.png` and the `autotiles/*.png`
   images with the layer names above) and export it.
2. Save the file as `src/data/maps/<map-id>.json`.
3. Register it in `src/data/maps.ts` (import plus an entry in `sources`).
4. Reference it from `src/data/levels.json` (`"map": "<map-id>"`) with the
   level's area, objective and the rest as usual.
5. `npm test` loads every registered map through `fromTiled` and
   `validateMap` via the existing map tests; `npm run dev` and open
   `?level=<level-id>&party=debug` to see it.

A map can also be built in code: see `scripts/convert-legacy-maps.mjs`,
which fills layers from the catalogue indices and writes the Tiled JSON.

## Adding tiles from a new pack

1. Copy the source sheet(s) and the pack's credits into
   `assets-src/tilesets/<pack>/`. Sheets must be 32 px tiles; RPG Maker XP
   sheets are 8 tiles wide. Keep the credits file and update
   `src/data/tiles.json` `credits` (shown on the credits screen).
2. Add the sheet under `sources` in `src/data/tiles.json`.
3. Add entries under `tiles`: `id`, `name`, `group` (palette section),
   `layer` (`ground` or `decoration`), `tileset` (the shipped sheet to pack
   into, or a new one declared under `tilesets`), `source`, `col`, `row`,
   and for stamps `w` and `h` (tiles); `solid: true` blocks placement.
   Append new entries at the end: the packer places tiles in catalogue order
   and never fills gaps, so appending keeps existing packed indices (and so
   existing maps) stable. Inserting or removing an entry shifts everything
   after it; if you must, re-export affected maps from the editor.
4. Add terrains under `terrains`: `block` is the column and row of the 3x3
   edge block's top-left tile (`blockSize: 4` for a 4x4 block, which uses its
   corner and first inner cells), `inner` the top-left of a 2x2 inner-corner
   block if the sheet has one, and `frames` a list of further block origins
   for animated terrains (one autotile frame each; `innerFrames` likewise).
   A real RMXP autotile file can be used as a source too: its 3x3 block
   starts at column 0, row 1 and its inner corners are in tile (2, 0), so
   `block: [0, 1]` with no `inner` plus a one-line special case in the build
   script would cover it; so far the pack has none.
5. Run `npm run build-tilesets`. It rewrites the shipped sheets,
   `src/data/tilesets.json` and `public/assets/tilesets/CREDITS.txt`.
   The build fails loudly for a tile outside its sheet.
6. For a new theme (for example a cave pack): declare the tileset under
   `tilesets` with its `theme`, add its tiles, then repoint the placeholder
   cave entries or paint the cave maps in the editor and re-export them.
   Oreburgh Gate and Oreburgh Mine use the `placeholder` tileset until then.

Texture size: keep each shipped sheet under 4096 px tall (the packer prints
the size). The source exterior sheet is 41504 px tall, which is why only
catalogue entries are shipped, never a whole source sheet.

## Arenas, set pieces and the title diorama

`scripts/bw-maps.py` also builds the hand-designed maps (no Platinum trace,
since the gyms are interiors in the games and Hisui has no map render):

| Map | Used by |
| --- | --- |
| `eterna-gym`, `hearthome-gym`, `veilstone-gym`, `pastoria-gym`, `canalave-gym`, `snowpoint-gym`, `sunyshore-gym` | gyms 2 to 8 (gym 1 is `oreburgh-mine-1f`) |
| `spear-pillar`, `distortion-world` | the Team Galactic finale |
| `stadium-grass`, `stadium-rock`, `stadium-water`, `stadium-ice` | the Conference's field roulette |
| `hisui-fieldlands`, `hisui-mirelands`, `hisui-coastlands`, `hisui-icelands` | the four Hisui rifts |
| `title` | the title screen diorama |
| `lake-verity-island` | the Surf secret level (the traced lake, island placeable, `path-water` lane to it, `island` spot property) |
| `lake-valor`, `lake-acuity` | the other two lakes |
| `valley-windworks`, `eterna-forest`, `old-chateau`, `iron-island`, `galactic-hq`, `great-marsh` | story set pieces |
| `ss-libra`, `flower-paradise`, `fullmoon-island`, `newmoon-island` | mystery events |

Every map registers itself: `src/data/maps.ts` globs `src/data/maps/*.json`,
so a new file is a new map with no code change.

What the builder adds for them (see the `Map` class):

- `floor(id, x0, y0, x1, y1)` lays a ground texture from `GROUND`
  (`bw-cobble`, `bw-steel`, `bw-cream`, `bw-darkrock`, `bw-bluetile`,
  `bw-orangetile`, `bw-void`, `bw-snow`) under the grass layer's place.
- `plateau(..., cliff='rock' | 'snow' | 'ice')` draws the brown, snow or ice
  cliff rim sets; the path breaks through a rim where it crosses one;
  `interior=False` leaves the ledge top usable for spots.
- `tree(x, y, kind='pine-snow' | 'pine-dirt')` and `forest(..., kind)` use
  the other BW conifers (composited into `generated-bw.png` like the rest).
- Props: `bw-lantern`, `bw-streetlamp`, `bw-log`, `bw-logpile`,
  `bw-container`, `bw-machine`, `bw-barrel`, `bw-cave-mouth`,
  `bw-snow-rock-big`, `bw-snow-rock`, `bw-grey-rock-small`, `bw-ice-block`,
  `bw-ice-rock`, `bw-snow-boulder`, `bw-snow-log`.
- A second enemy lane: `m.extra_paths = [('path-2', points)]` writes another
  `path` object (named `path-2` or `path-water`) in the object layer, and
  `lane(m, points)` keeps its cells clear and optionally draws them as road.
  Veilstone Gym (two lanes), Pastoria Gym (deck and moat) and Spear Pillar
  (two stairways) use it. The simulation reads only `path` today; the second
  lane is for the level code to pick up.
- Spot properties: `m.spot_props[(x, y)] = {'tide': True}` lands on the
  placeable object as Tiled properties (Pastoria's two flooding shore spots).
- Stage points: `m.points = [('meadow', 'stage', x, y)]` writes named point
  objects (the title scene's `meadow`, `beach`, `lake-shore`, `cliff`,
  `ledge` and `sky` stages; Spear Pillar's `altar`).
- `road=None` draws no path terrain; the designs then colour the path cells
  with a floor texture so the enemy path stays visible.

Preview any map without level data: add a temporary entry to
`src/data/levels.json` whose `map` is the map name, build, and open
`?level=<id>&party=debug`.
