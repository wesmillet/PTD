# Plan: Phase 0 — Scaffold, sprite loader, 8-direction Idle/Walk demo

Goal (from GAME_DESIGN.md): scaffold the project, write the PMD sprite loader,
render one Pokémon playing Idle and Walk in all 8 directions, and have Vitest
configured and passing.

## 1. Dependencies (need your approval)

Runtime:
- `phaser` 3.x (registry currently serves 4.2.1; I will pin the latest 3.x since
  GAME_DESIGN.md specifies Phaser 3)

Dev:
- `typescript`, `vite`
- `vitest`
- `jsdom` — only so the AnimData.xml parser can be unit tested with `DOMParser`
  outside the browser. If you would rather not add it, I will hand-roll a tiny
  parser for the fixed AnimData format instead (the format is rigid enough).

No other dependencies.

## 2. Folder structure

```
index.html
vite.config.ts
vitest.config.ts
tsconfig.json
package.json
scripts/
  fetch-sprites.sh          # sparse checkout + copy, never a full clone
public/assets/
  sprites/<dexnum>/         # AnimData.xml, *-Anim.png, *-Shadow.png, credits.txt
  portraits/<dexnum>/       # (not used in Phase 0, folder reserved)
src/
  main.ts                   # Phaser.Game config
  scenes/BootScene.ts       # loads sprite assets via pmdLoader
  scenes/Phase0Scene.ts     # the 8-direction demo
  assets/animData.ts        # pure parser: XML string -> AnimData object (no Phaser)
  assets/pmdLoader.ts       # Phaser side: load sheets, register anims, playAnim()
  sim/rng.ts                # seeded RNG (mulberry32), first sim module
  sim/rng.test.ts
  assets/animData.test.ts
  data/                     # empty for now, config.json added in Phase 1
```

`src/sim/` stays Phaser-free. `src/assets/animData.ts` is also Phaser-free so
the parser is testable.

## 3. Sprite fetching

`scripts/fetch-sprites.sh <dexnum>...` runs exactly the sparse-checkout command
from GAME_DESIGN.md into `/tmp/spritecollab` (`--depth 1 --filter=blob:none
--sparse`, `GIT_LFS_SKIP_SMUDGE=1`), adds `/sprite/<dexnum>/*` for each number,
then copies each folder (including `credits.txt`, untouched) into
`public/assets/sprites/<dexnum>/`. It also copies `tracker.json` and
`sprite_config.json` to `/tmp` only; they are not shipped to the client.

Phase 0 fetches one Pokémon: **Turtwig, folder 0387** (first starter listed).
Only the top-level folder is copied, not the shiny/form subfolders (`0000/`,
`0001/`), until Phase 6. Checked: the sparse checkout works from this
environment, and Turtwig's top-level folder is about 560 KB.

A tiny `src/data/spriteIndex.json` (`{ "turtwig": "0387" }`) is generated from
`tracker.json` by the script so name-to-folder lookups are data, not code. The
full `tracker.json` is tens of MB and never bundled.

## 4. AnimData parser (`src/assets/animData.ts`)

Input: XML string. Output:

```ts
interface AnimEntry {
  name: string;          // "Idle", "Walk", ...
  index: number;
  frameWidth: number;
  frameHeight: number;
  durations: number[];   // 60 fps ticks per frame
  rushFrame?: number;   // present on some attacks in the real data
  hitFrame?: number;
  returnFrame?: number;
}
interface AnimData { shadowSize: number; anims: Record<string, AnimEntry>; }
```

Handles `<CopyOf>` (an action that reuses another action's sheet and timings)
by resolving it to the target entry while keeping the alias name. Tests cover:
a normal entry, a CopyOf entry, multi-frame durations, and HitFrame/ReturnFrame.

## 5. Phaser loader (`src/assets/pmdLoader.ts`)

- `queuePokemon(scene, dexnum, actions[])`: queues `AnimData.xml` (as text) and
  one spritesheet per action for both `<Action>-Anim.png` and
  `<Action>-Shadow.png`, using that action's `FrameWidth`/`FrameHeight`.
  Because frame sizes differ per action, each action is its own texture key:
  `pmd-<dex>-<action>` and `pmd-<dex>-<action>-shadow`.
- `registerAnims(scene, dexnum)`: after load, creates one Phaser animation per
  action per direction: key `pmd-<dex>-<action>-<dir>`, dir 0..7 in the sheet's
  row order (down, down-right, right, up-right, up, up-left, left, down-left).
  Frame index = `row * columns + col`. Per-frame duration = `ticks * 1000 / 60`
  so uneven timings are preserved. Idle/Walk loop; others play once (used later).
- `playAnim(sprite, action, direction)`: swaps texture if the action changed and
  plays the animation. Attaches/updates a shadow sprite rendered under the body.
- `Direction` enum exported from `src/assets/direction.ts` with a helper to pick
  the nearest of 8 directions from a movement vector (needed in Phase 1).

## 6. Demo scene (`Phase0Scene`)

Two rows of eight Turtwigs on a flat background: top row plays Idle, bottom row
plays Walk, each column facing one of the 8 directions, with a small label per
column. Keys: `+`/`-` change sprite scale (1x to 4x, nearest-neighbour, no
smoothing), `Space` swaps which row is Idle and which is Walk. This shows every
required combination on one screen without any input.

## 7. Tooling

- `npm run dev` (Vite), `npm run build`, `npm run test` (Vitest, run once),
  `npm run typecheck` (`tsc --noEmit`). Strict TypeScript.
- `vite.config.ts` sets `base: './'` so a static build works from any path.
- `.gitignore`: `node_modules`, `dist`. Sprite PNGs under `public/assets` are
  committed (one Pokémon is small; revisit if the repo grows).
- README gets a short "run it" section and a note on sprite credits.

## 8. Acceptance

1. `npm install && npm run test` passes (rng + animData tests).
2. `npm run typecheck` and `npm run build` succeed.
3. `npm run dev` shows Turtwig animating Idle and Walk in all 8 directions, with
   shadows, at pixel-crisp scale.
4. `public/assets/sprites/0387/credits.txt` is present and unmodified.
5. One commit at the end of the phase.

## Open questions

1. OK to add `jsdom` as a dev dependency for parser tests? (Or hand-rolled parser.)
2. Turtwig (0387) as the Phase 0 Pokémon? Say otherwise if you want Piplup/Chimchar.
3. Shadow rendering is included above because the format is already specified;
   say so if you would rather defer it.
