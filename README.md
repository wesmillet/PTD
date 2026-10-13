# Sinnoh Tower Defense (working title)

A browser tower defense game in the style of Pokémon Tower Defense, built with
Phaser 3, TypeScript and Vite. See `GAME_DESIGN.md` for the full design and
phase plan; this is a non-commercial fan project.

## Run it

```
npm install
npm run dev        # Vite dev server, open the printed URL
npm run test       # Vitest (src/sim and src/assets unit tests)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which installs
dependencies, runs the tests, builds with Vite and publishes `dist/` to GitHub
Pages. One-time repository setting: Settings -> Pages -> Source: "GitHub
Actions" (the workflow also tries to enable this on its own). The site is
served at `https://<owner>.github.io/PTD/`, which is why `vite.config.ts` sets
`base: '/PTD/'`. The dev server uses the same base: `npm run dev` serves the
game at http://localhost:5173/PTD/.

## Sprites

Sprites are from the [PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
project and are fetched with a sparse checkout, never a full clone:

```
npm run fetch-sprites -- 0387 0390
```

This copies `public/assets/sprites/<dexnum>/` (animation data, sheets and the
artists' `credits.txt`) and regenerates `src/data/spriteIndex.json`.

Every `credits.txt` is kept verbatim and will be shown in the in-game credits
screen. Please keep them when adding or updating sprites.

## Playing

Open the dev server at http://localhost:5173/PTD/. The title screen offers
Continue, New Game and Credits. Pick a starter, then play
the levels in order: Route 201 (free) → Lake Verity (free) → Route 202 (free)
→ Route 203 (defend) → Oreburgh Gate (defend) → Oreburgh Mine 1F (defend).
Free levels unlock the next one once you leave with at least one wave
cleared; defend levels when you win.

- Place a Pokémon by clicking its party slot and then a blue tile; drag a
  placed Pokémon to move it (also mid-wave); tap it for its panel.
- Click a ball in the ball bar, then a wild Pokémon, to throw it.
- Between levels: Party / PC (swap, sort, Rare Candy), Shop, Pokédex, Save
  (save code export and import, New Game) and Credits.
- The game saves itself after every level and change. URL flags:
  `?level=<id>` opens a level, `&seed=<n>` replays the same waves,
  `&shiny=1` makes every spawn shiny, `?party=debug` loads the test party.
- Backtick opens the debug panel (speed and status constants, party level,
  enemy level override, shiny rate, time of day, seed reroll).
- The debug panel's "Map editor" button opens the in-game map editor (paint
  tiles, autotile terrains, path, placeable tiles, test play, export and
  import Tiled JSON). See `docs/maps.md`.

## Pokémon data

Stats, moves, learnsets, the type chart, EXP curves, evolutions and Platinum
encounter tables are generated from the PokeAPI CSVs (Gen 1 through 4 only)
and committed as JSON under `src/data/`. To regenerate:

```
scripts/fetch-pokeapi.sh          # sparse checkout of data/v2/csv only, into /tmp/pokeapi
node scripts/build-pokedata.ts    # writes src/data/*.json
```

The CSVs are never committed. Typed accessors live in `src/data/pokedata.ts`.
`node scripts/level-species.mjs` lists every species the current levels need
(with evolution lines); pass its output to `scripts/fetch-sprites.sh`, which
also regenerates `spriteIndex.json`, `spriteFolders.json` and `credits.json`.

## Maps and tilesets

Levels are Tiled JSON maps under `src/data/maps/`, drawn with Gen 5 style
tiles. The source sheets live in `assets-src/tilesets/gen5/` (with their
credits) and are never loaded by the game; `src/data/tiles.json` names the
tiles the editor offers and `npm run build-tilesets` packs those into
`public/assets/tilesets/`, builds the autotiles and writes
`src/data/tilesets.json`. The format, the autotiler, the editor and how to
add levels or tiles are documented in `docs/maps.md`.

## Layout

- `src/sim/` simulation logic, no Phaser imports, unit tested
- `src/assets/` sprite data parsing and the Phaser animation loader
- `src/scenes/`, `src/ui/` rendering and input
- `src/map/` map format, autotiler, renderer and editor (see `docs/maps.md`)
- `src/data/` all game content as JSON
- `docs/` per-phase plans
