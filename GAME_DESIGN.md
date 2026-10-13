# Project: Sinnoh Tower Defense (working title)

## What this is
A browser tower defense game in the style of Pokémon Tower Defense (PTD 1 and 2).
Core loop: the player places Pokémon as "towers" on a map, waves of wild Pokémon
and trainer Pokémon walk along a path, the player's Pokémon attack them with moves,
and the player can catch weakened enemies with Poké Balls. Caught Pokémon join the
party, level up, learn moves, evolve, and can be placed in future levels.

Target: single-player, runs in a browser, saves locally, no backend required.

## Tech stack (do not change without asking)
- Phaser 3 + TypeScript + Vite
- All game content is data-driven JSON under `src/data/` (Pokémon, moves, types,
  items, levels, waves, dialogue). No stats or wave definitions hardcoded in TS.
- Simulation logic (damage, status, catch rate, wave spawning, RNG) lives in
  `src/sim/` with zero Phaser imports so it can be unit tested with Vitest.
- Rendering and input live in `src/scenes/` and `src/ui/`.
- Seeded RNG everywhere (`src/sim/rng.ts`). Same seed + same inputs = same result.
- Save data: localStorage, plus an export/import "save code" string so players can
  move between devices.

## Sprites and assets
Sprites come from the PMDCollab SpriteCollab repo (Pokémon Mystery Dungeon style):
https://github.com/PMDCollab/SpriteCollab

Do not clone the whole repo (it is over 200,000 files). Use a sparse checkout and
copy only the needed Pokémon folders into `public/assets/sprites/<dexnum>/`:

```
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse https://github.com/PMDCollab/SpriteCollab /tmp/spritecollab
cd /tmp/spritecollab
git sparse-checkout set --no-cone /tracker.json /sprite_config.json '/sprite/0387/*' '/sprite/0390/*'
```

Format of each sprite folder:
- `AnimData.xml`: one `<Anim>` per action with `FrameWidth`, `FrameHeight`,
  `Durations` (one entry per frame, in 60fps ticks), and for attacks `HitFrame`
  and `ReturnFrame`.
- `<Action>-Anim.png`: sprite sheet. Columns = frames, rows = 8 facing directions
  in this order: down, down-right, right, up-right, up, up-left, left, down-left.
- `<Action>-Shadow.png`: shadow sheet, same layout. `<Action>-Offsets.png` can be
  ignored for now.
- `credits.txt`: artist credits. Must be preserved and shown in an in-game credits
  screen.

`tracker.json` maps Pokémon names to folder numbers, including forms, shinies,
and gender variants. Use it to resolve names to paths.

Write a loader (`src/assets/pmdLoader.ts`) that parses AnimData.xml, registers
Phaser animations per action per direction, and exposes `playAnim(sprite, action,
direction)`. Towers mostly use Idle, Attack, and Hurt. Enemies use Walk, Hurt,
and Faint.

Portraits (40x40, 5 columns x 8 rows, emotions listed in `sprite_config.json`)
come from `portrait/<dexnum>/`. Use the Normal emotion for party UI and Happy,
Sad, Angry, Surprised for dialogue.

Pokémon stats, moves, types, learnsets, and evolution data: bundle a static JSON
dump (PokeAPI data, Gen 4 ruleset) into `src/data/`. Do not call PokeAPI at
runtime.

## Core mechanics (match PTD feel, simplified where noted)

### Map and placement
- Each level has a tilemap with one or more enemy paths and a set of placeable
  tiles. Some levels have water or air tiles only certain types can use.
- Player places up to N Pokémon per level (N grows with story progress, starts
  at 1 and caps at 6).
- Pokémon can be moved and swapped between waves, not mid-wave.

### Combat
- Each Pokémon has up to 4 moves. One is selected as the active move per Pokémon.
- Moves have: power, accuracy, type, category (physical/special/status), range,
  cooldown, targeting rule (nearest, strongest, weakest, furthest along path,
  multi-target for spread moves), and optional effects (status, stat change,
  knockback, slow, heal).
- Damage uses the Gen 4 formula with level, attack vs defense, STAB, type chart,
  random roll 0.85 to 1.0, and crits. Keep it in `src/sim/damage.ts` with tests.
- Status conditions: poison, burn, paralysis, sleep, freeze, confusion, and
  flinch. Each has a defined effect on path movement and attack rate.
- Enemies walk the path; reaching the end costs the player one "life" (or a
  level-specific objective, like an item being stolen).

### Catching
- Any wild enemy can be targeted with a Poké Ball while alive. Catch chance uses
  the Gen 4 catch formula (HP remaining, catch rate, ball modifier, status bonus).
- Ball types: Poké, Great, Ultra, Dusk, Net, Quick, Master (story-gated).
- Trainer-owned enemies cannot be caught.
- A caught Pokémon is removed from the wave and added to the party at its current
  level with its current moves.

### Progression
- Pokémon gain EXP per KO and per hit (small). Level-ups follow Gen 4 growth
  curves. New moves prompt a replace dialog (4-move cap).
- Evolution by level, stone, trade-equivalent item, and happiness (simplified:
  a friendship counter that rises per level completed with that Pokémon placed).
- Currency: Poké Dollars from clearing waves and selling items. Shop sells balls,
  evolution stones, TMs, and vitamins.
- Pokédex tracks seen, caught, and shiny caught.

### Save data
- Party and PC box (unlimited storage, searchable)
- Level completion, star ratings, and challenge completions
- Items, money, Pokédex, settings
- Export/import save code

## Story mode: three acts

### Act 1: Sinnoh (based on Diamond / Pearl / Platinum)
Follow the game's route order. Each level is a route, town event, cave, or gym.
Gyms are boss levels where the leader's Pokémon come in scripted waves and the
leader's ace is a boss with extra HP and a signature move.
Required beats, in order:
1. Twinleaf Town and Lake Verity: choose starter (Turtwig, Chimchar, Piplup),
   Starly ambush tutorial level
2. Route 201 to 203, Jubilife City, Oreburgh Mine, Roark (Rock)
3. Floaroma Town, Valley Windworks (first Team Galactic encounter), Eterna
   Forest, Gardenia (Grass), Galactic Eterna Building
4. Cycling Road, Mt. Coronet, Hearthome, Fantina (Ghost)
5. Solaceon, Veilstone, Maylene (Fighting), Galactic Warehouse
6. Pastoria, Crasher Wake (Water), Great Marsh
7. Celestic Town, Canalave, Byron (Steel), Iron Island with Riley
8. Lake trio levels (Verity, Valor, Acuity), Snowpoint, Candice (Ice)
9. Galactic HQ, Spear Pillar: Cyrus, then Dialga / Palkia boss
10. Platinum branch: Distortion World, Giratina
11. Sunyshore, Volkner (Electric), Victory Road, Elite Four and Cynthia
Post-game: Stark Mountain, Heatran, Battle Frontier as endless mode.

### Act 2: Anime (Diamond and Pearl series)
Levels that retell Ash's Sinnoh journey with anime-only content. Enemies and
allies use anime teams, not game teams.
- Ash and Dawn meet, Pikachu vs Paul's Elekid rivalry intro
- Contest levels (Dawn): a scoring variant where style points come from move
  variety instead of KOs
- Hunter J levels: timed, protect a captured legendary from being frozen
- Hunter J's airship as a multi-path level
- Team Rocket (Jessie, James, Meowth) recurring comic-relief waves
- Ash vs Paul Lake Acuity full battle, then Lily of the Valley Conference
- Darkrai (Tobias) as a near-unwinnable showcase boss
- Movie tie-in levels: Darkrai (Alamos Town), Shaymin, Arceus

### Act 3: Hisui and beyond (Legends: Arceus, Legends: Z-A)
- Jubilife Village hub, survey missions as levels
- Alpha Pokémon: oversized enemies with boosted stats, catchable
- Frenzied Noble boss fights (Kleavor, Lilligant, Arcanine, Electrode,
  Avalugg): phase-based, must throw balm items (reuse ball-throw mechanic)
  during openings
- Space-time distortions: random mid-level events that spawn rare spawns
- Hisuian forms with their own sprites and typings
- Z-A: Lumiose City urban maps with rooftops as air-only placement tiles,
  Mega Evolution as a once-per-level temporary power-up

## Challenge levels
Unlocked after each gym. Each has a fixed rule set and gives a reward:
- Monotype (only one type allowed)
- Level cap (party capped at a level, enemies are not)
- No catching
- Solo (one Pokémon only)
- Speedrun (clear all waves under a time)
- Item-less
- Reverse (enemies come from the end of the path)
- Daily challenge: seeded from the date, leaderboard is local-only

## Shiny hunting
- Base shiny rate 1/4096 per spawned wild Pokémon, configurable in
  `src/data/config.json`.
- Shiny enemies have a sparkle on spawn and a distinct sound.
- Rate modifiers: Shiny Charm item (3x), chain counter per species in a level
  (resets on leaving the level, caps at 40 for an additional 4x), and
  "Shiny Event" levels with a flat 1/256 rate for a featured species.
- Shiny Pokémon use the shiny sprite folder from SpriteCollab when present.
- Pokédex shows shiny counts. A "shiny living dex" completion reward exists.

## UI
- Level select map per act, styled after the Sinnoh region map
- In-level HUD: wave counter, lives, money, speed toggle (1x, 2x, 4x),
  pause, Poké Ball bar
- Pokémon panel: stats, moves, EXP bar, evolution button when eligible
- Party / PC screen with filters (type, level, shiny)
- Dialogue boxes with portraits
- Settings: volume, sprite scale, colorblind-friendly type colors

## Build plan (work one phase at a time, commit at the end of each)
Phase 0: Scaffold project, sprite loader, render one Pokémon playing Idle and
         Walk in all 8 directions. Vitest configured.
Phase 1: One level, one path, one placeable Pokémon, one enemy type, waves,
         lives, win/lose. Damage formula with tests.
Phase 2: Moves, type chart, status effects, targeting rules, 4-move selection.
Phase 3: Catching, party, PC box, EXP, level-up, move learning, evolution.
Phase 4: Save/load with export code. Shop and items.
Phase 5: Story Act 1, levels 1 through 11, with dialogue and gym bosses.
Phase 6: Challenge levels and shiny system.
Phase 7: Act 2 and Act 3.
Phase 8: Polish: audio, settings, credits screen, performance pass.

## Working rules for Claude Code
- Read this file at the start of every session.
- Before starting a phase, write a short plan in `docs/plan-phase-N.md` and ask
  me to approve it.
- Keep every piece of game content in JSON. If you find yourself hardcoding a
  number for a Pokémon, move, or wave, stop and put it in data.
- Write Vitest tests for anything in `src/sim/`. Run them before committing.
- Ask me before adding a dependency, changing the folder structure, or changing
  a mechanic described above.
- When a level is done, give me a `npm run dev` URL and tell me exactly which
  level to open to see it.
- Preserve all sprite credits from `credits.txt`. Never strip them.
- This is a non-commercial fan project. Do not add monetization, ads, or
  analytics.
