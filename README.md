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

## Pokémon data

Stats, moves, learnsets, the type chart, EXP curves, evolutions and Platinum
encounter tables are generated from the PokeAPI CSVs (Gen 1 through 4 only)
and committed as JSON under `src/data/`. To regenerate:

```
scripts/fetch-pokeapi.sh          # sparse checkout of data/v2/csv only, into /tmp/pokeapi
node scripts/build-pokedata.ts    # writes src/data/*.json
```

The CSVs are never committed. Typed accessors live in `src/data/pokedata.ts`.

## Layout

- `src/sim/` simulation logic, no Phaser imports, unit tested
- `src/assets/` sprite data parsing and the Phaser animation loader
- `src/scenes/`, `src/ui/` rendering and input
- `src/data/` all game content as JSON
- `docs/` per-phase plans
