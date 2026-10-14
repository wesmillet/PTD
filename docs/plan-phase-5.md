# Phase 5 plan: items, 4x, PC, rosters, trainers and bosses

Unattended batch. Rules: tests for everything in `src/sim/`, headless check
of each screen, judgment calls logged in `docs/decisions.md`.

## 1. Ball and item sprites
- `scripts/fetch-items.sh`: sparse checkout of `sprites/items/gen5/` from
  PokeAPI/sprites for the nine items (falls back to `sprites/items/` when a
  gen5 file is missing); copies to `public/assets/items/<name>.png`.
- `config.json`: `balls.<id>.sprite` and `shop.<id>.sprite` name the file.
  `src/game/runtime.ts` gains `itemUrl(sprite)` / `itemTextureKey(sprite)`;
  BootScene loads them.
- Shown in: the HUD ball bar (replacing the drawn circles), the shop rows,
  a bag strip on level select (balls, Potion, Rare Candy with counts), the
  level summary (the ball each catch was made with) and the PC summary.
- Ball throw: the ball sprite arcs from its ball-bar slot to the target
  (parabolic tween), lands, wiggles 1–3 times from the sim's shake count
  (a catch shows three wiggles, then a click flash and star sparkle; a
  failure shows `shakes` wiggles, then the ball bursts open and the Pokémon
  reappears).
- Credits: PokeAPI sprites line extended with the Gen 5 item sprites.

## 2. 4x speed
- `config.gameSpeeds` becomes `[1, 2, 4]`; the HUD toggle cycles through it;
  the save accepts any listed speed.
- `src/sim/clock.ts`: `advance(state, frameSeconds, gameSpeed, accumulator)`
  runs whole 1/60 s steps (`frameSeconds * gameSpeed` worth) and returns the
  events plus the leftover accumulator. LevelScene uses it.
- Test: the same seed and inputs advanced at 1x for N frames and at 4x for
  N/4 frames give identical state (JSON-equal, same RNG position).

## 3. PC as its own scene
- `GameState.box: Monster[]` becomes `boxes: Box[]`, each
  `{ name, wallpaper, slots: (Monster | null)[30] }`, 8 boxes by default
  (`src/data/pc.json`: box count, grid 6x5, default names, wallpapers, the
  frame and cursor image paths). Helpers in `src/sim/pc.ts`: `allBoxed`,
  `firstFreeSlot`, `depositToBox`, `moveBetween(game, from, to)` for any
  party/box slot pair (swap when the target is taken; the party never
  empties), `sortBox`, `boxFilter`.
- Save version 2: `boxes` instead of `box`; `badges`. Version 1 saves and
  `PTD1.` codes still load (the flat box list fills boxes in order).
- `PCScene` (Phaser, full screen): party column of six slots on the left,
  box title with left/right arrows, the 6x5 grid on the right over the
  box's wallpaper image inside the frame image, a cursor image following
  the pointer. Drag and drop between any slots (party ↔ box, box ↔ box via
  the arrows while dragging). Click shows the summary in a DOM side panel
  (icon, portrait, level, types, stats, moves, EXP bar, Rare Candy button)
  with sort (level, type, dex number, name) and filter (type, shiny) controls;
  sort rearranges the current box; filter dims non-matching slots.
- Wallpapers, frame and cursor are plain generated placeholders under
  `public/assets/pc/` (`scripts/build-pc-placeholders.mjs`), so a Gen 4 skin
  is a file swap plus `pc.json` edits.
- The Party / PC overlay (`partyScreen.ts`) is removed; level select gets a
  "PC" button that starts the scene.

## 4. Every level has its own roster
- `LevelDef.roster: { species: name, rarity, levels?: [min, max] }[]`.
  Rarity weights are per level; an entry is *featured* when its share is
  above 10 %, *rare* otherwise. Level ranges default to the species' entry in
  the area's Platinum walk table (or the area's overall range when the
  species is not in it) so levels stay at Platinum's ranges.
- `waves.ts`: `rosterTable(def)` resolves the roster to encounter entries;
  `generateWave` keeps using the same table shape. `createLevel` uses the
  roster when present.
- Rosters as given (Route 201 … Oreburgh Mine). Lake Verity's map keeps its
  path along the water (map format untouched).
- Test `levels.test.ts`: no species is featured in more than one level; rare
  entries are at most 10 %; every roster species has data and a sprite folder.
- `scripts/level-species.mjs` reads rosters and trainer parties; new sprite
  folders and icons fetched for Magikarp, Goldeen, Sentret, Budew, Barboach,
  Machop, Cranidos and their lines.

## 5. Trainers and bosses
- `LevelDef.trainer: { id, name, class, party: [{ species, level, boss? }] }`
  replaces the last wave of the level. `species: "counter-starter"` resolves
  to the starter that beats the player's. Trainer spawns carry
  `trainer: true` (and `boss: true`).
- Throwing at a trainer Pokémon: `throwBall` returns a `ballBlocked` event,
  consumes nothing; the scene plays the arc, bounces the ball off and shows
  "You can't catch a trainer's Pokémon!".
- Trainer card: at the trainer wave's start the sim pauses and a canvas card
  shows the trainer's portrait image (`assets/trainers/<id>.png`,
  placeholder), name and party icons; click or 2.5 s dismisses it.
- Bosses: `config.bosses` (`hpMultiplier` 4, `spriteScale` 1.5,
  `retryBossWave` true). A boss spawns with max HP × multiplier, a 1.5x
  sprite and a boss HP bar across the top of the screen. Boss moves come
  from the trainer party entry (`moves: [{ move, every }]`, Cranidos:
  Headbutt every 5 s, Zen Headbutt every 12 s); on each timer the boss hits
  every placed Pokémon within the move's range with Gen 4 damage (towers
  keep at least 1 HP) and the move's flinch chance.
- Badges: `LevelDef.badge: { id, name }`; winning adds it to
  `game.badges`; shown as a badge row on level select and the title screen.
- Boss wave retry: losing during the boss wave once per attempt restores the
  lives the wave started with, clears enemies and returns to build phase
  with the same wave queued (`bossRetry` event, toast).

## 6. Docs
GAME_DESIGN.md: the one-featured-level rule, trainers, bosses, badges, the
PC screen and 4x speed. `docs/ui.md`, README and decisions updated.
