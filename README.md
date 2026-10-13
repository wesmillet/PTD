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

## Layout

- `src/sim/` simulation logic, no Phaser imports, unit tested
- `src/assets/` sprite data parsing and the Phaser animation loader
- `src/scenes/`, `src/ui/` rendering and input
- `src/data/` all game content as JSON
- `docs/` per-phase plans
