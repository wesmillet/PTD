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
python3 scripts/fetch-sprites.py 0387 0058:Hisui
node scripts/build-sprite-index.mjs /tmp/spritecollab/tracker.json src/data/spriteIndex.json
```

This copies `public/assets/sprites/<dexnum>[-form]/` (animation data, the
five sheets the game plays and the artists' `credits.txt`) plus the
portraits, then regenerates `src/data/spriteIndex.json` and
`src/data/spriteFolders.json`.

Every `credits.txt` is kept verbatim and will be shown in the in-game credits
screen. Please keep them when adding or updating sprites.

## Playing

Open the dev server at http://localhost:5173/PTD/. The title screen offers
Continue, New Game and Credits. Pick a starter, then play
the levels in order: Route 201 (free) → Lake Verity (free) → Route 202 (free)
→ Route 203 (defend) → Oreburgh Gate (defend) → Oreburgh Mine 1F (defend).
Free levels unlock the next one once you leave with at least one wave
cleared; defend levels when you win.

- Place a Pokémon by dragging it from the party strip onto a worn patch
  (or tap the slot, then the patch); drag a placed Pokémon to move it (also
  mid-wave); tap it for its panel.
- Click a ball in the ball bar, then a wild Pokémon, to throw it. Trainer
  Pokémon (Route 202's Tristan, Route 203's Barry, Roark in the mine)
  bounce the ball off; Roark's Cranidos is a boss with its own HP bar.
- Speed toggle: 1x, 2x, 4x (extra fixed steps per frame, same results).
  Options also has Zoom (Fit never enlarges past 1x, 1.5x, 2x; `+` and `-` step it).
- A Pokémon's attack rate follows its species' base Speed (Shuckle 0.6/s
  up to 1.9/s); the Pokémon panel and PC summary show it.
- Gym leaders and other mugshot trainers get a VS intro; the trainer's
  throwing pose stands by the entrance while their wave is sent.
- Menu (or Esc) opens the Platinum start menu: Pokédex, Pokémon, Bag,
  trainer card, Save, Options, Exit and Leave level (arrow keys, Enter, Esc
  or the mouse).
- Demo mode (`config.json` `demoMode`, on for now) unlocks every level and
  starts a new game with a showcase PC.
  A selected ball is thrown with the next click on a wild Pokémon; any
  other click drops it.
- Keys in a level: 1 to 6 pick party slots, Space starts the wave, P
  pauses, 1, 2 and 4 set the speed, Q to Y pick party slots, Esc opens the menu. The Save panel
  has three slots.
- After the finale: the Hisui rifts (purple tears), the Sinnoh Conference
  (gold marker east of Sunyshore), the Lottery Corner on Jubilife and the
  mystery event levels, as in `docs/design-content.md`.
- Between levels: the Platinum town map is the level select (click a
  marker, or arrow keys and Enter; the player sprite walks there), with the
  PC (boxes, drag and drop, sort, filter, Rare Candy), Shop, Save (save
  code export and import, New Game) and Credits beside it. The eight
  badges show on the title screen, level select and trainer card.
- The game saves itself after every level and change. URL flags:
  `?level=<id>` opens a level, `&seed=<n>` replays the same waves,
  `&shiny=1` makes every spawn shiny, `?party=debug` loads the test party.
- Backtick opens the debug panel (speed and status constants, party level,
  enemy level override, shiny rate, time of day, seed reroll).
- The debug panel's "Map editor" button opens the in-game map editor (paint
  tiles, autotile terrains, path, placeable tiles, test play, export and
  import Tiled JSON). See `docs/maps.md`.

## Interface

The UI is skinned with the Pokémon Platinum sheets in `assets-src/ui/gen4/`
(rippers credited in `CREDITS.txt` and on the credits screen).
`node scripts/build-gen4-ui.mjs` keys out the sheet backgrounds and cuts the
frames, HP boxes, fonts, bag buttons, menu icons and box wallpapers into
`public/assets/ui/gen4/`; see `docs/ui.md`.

## Pokémon data

Stats, moves, learnsets, the type chart, EXP curves, evolutions and Platinum
encounter tables are generated from the PokeAPI CSVs (Gen 1 through 4 only)
and committed as JSON under `src/data/`. To regenerate:

```
scripts/fetch-pokeapi.sh          # sparse checkout of data/v2/csv only, into /tmp/pokeapi
node scripts/build-pokedata.ts    # writes src/data/*.json
```

The CSVs are never committed. Typed accessors live in `src/data/pokedata.ts`.
Box icons (Gen 5, from github.com/PokeAPI/sprites) are fetched the same way:
`scripts/fetch-icons.sh <id>...` with plain species ids. Pass
`node scripts/level-species.mjs` output to `scripts/fetch-sprites.sh`;
`scripts/level-species.mjs` lists every species the current levels need
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
