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

Portraits come from `portrait/<dexnum>/` as one 40x40 PNG per emotion
(`Normal.png`, `Happy.png`, ...; the emotion list is in `sprite_config.json`).
The fetch script copies Normal, Happy, Sad, Angry and Surprised into
`public/assets/portraits/<dexnum>/`. Use Normal for party UI and the others
for dialogue. Shiny sprites for the base form live at
`sprite/<dexnum>/0000/0001/` and are copied to `public/assets/sprites/<dexnum>/shiny/`.

Small Pokémon icons (party strip, Party / PC lists, starter choice, level
summary) are the Gen 5 Black/White box icons from github.com/PokeAPI/sprites
(`sprites/pokemon/versions/generation-v/icons/`, with the `animated/`
two-frame versions so they bob; `generation-viii/icons/` is the fallback for
forms without a Gen 5 icon, such as Hisuian forms). `scripts/fetch-icons.sh`
sparse-checks-out only the shipped species into `public/assets/icons/`. The
SpriteCollab portraits stay for the large Pokémon panel.

Pokémon stats, moves, types, learnsets, and evolution data: bundle a static JSON
dump (PokeAPI data, Gen 4 ruleset) into `src/data/`. Do not call PokeAPI at
runtime.

## Core mechanics (match PTD feel, simplified where noted)

### Map and placement
- Each level has a tilemap with one or more enemy paths and a set of placeable
  tiles. Some levels have water or air tiles only certain types can use.
- Player places up to N Pokémon per level (N grows with story progress, starts
  at 1 and caps at 6).
- Pokémon can be picked up and re-placed on any placeable tile at any time,
  including mid-wave. Moving restarts the attack cooldown at a full
  interval, so it can never be used to skip one.

### Combat
- Each Pokémon has up to 4 moves. One is selected as the active move per Pokémon.
- A placed Pokémon knows up to 4 moves from its Platinum level-up learnset,
  starting with the last four it would know at its level. A level-up that
  unlocks a move learns it at once with a free slot, or prompts a replace
  dialog (the simulation pauses while it is open).
- Move data (power, accuracy, type, category, PP, priority, target) and
  secondary effects (ailment and chance, flinch chance, stat stage changes,
  drain, healing) come from PokeAPI's move_meta tables into `moves.json`.
  Range (tiles), cooldown (a multiplier on the Speed-derived interval) and
  targeting rule (nearest, strongest, weakest, furthest along path, self) are
  hand-written in `src/data/move_overrides.json`; unlisted moves default to
  melee range 1.5, cooldown 1.0 and nearest. Multi-target spread moves are
  not implemented yet.
- Damage uses the Gen 4 formula with level, attack vs defense (with stat
  stages), STAB, type chart, random roll 0.85 to 1.0, crits, and burn halving
  physical damage. Keep it in `src/sim/damage.ts` with tests.
- Status conditions (`src/sim/status.ts`, constants in `config.json` under
  `status`). A Pokémon holds one ailment at a time; a second one does not
  stack. Enemies do not attack placed Pokémon yet, so statuses reach towers
  only from self-inflicted moves (Thrash, Outrage, Petal Dance confuse the
  user) and the debug panel.

  | Status    | Path speed (enemies)            | Attack rate (towers)                      | Other |
  | --------- | ------------------------------- | ----------------------------------------- | ----- |
  | Poison    | unchanged                       | unchanged                                 | loses 1/8 max HP every 2 s |
  | Burn      | unchanged                       | unchanged                                 | loses 1/16 max HP every 2 s; physical damage dealt x0.5 |
  | Paralysis | x0.5                            | x0.5, and 25% of attacks are skipped      | |
  | Sleep     | stopped for 2 to 5 s            | no attacks for 2 to 5 s                   | not woken by damage |
  | Freeze    | stopped for 3 to 6 s            | no attacks for 3 to 6 s                   | |
  | Confusion | for 2 to 5 s, each second 50%: walks backwards | for 2 to 5 s, each second 50%: the attack is wasted | never walks back past the path start |
  | Flinch    | stopped for 0.5 s               | the next attack waits 0.5 s               | only from moves with a flinch chance |

  Stat stages (-6 to +6) use the Gen 4 multipliers on Attack, Defense,
  Sp. Atk, Sp. Def and Speed; Speed stages scale enemy movement and tower
  attack rate. Accuracy and evasion stages are parsed but ignored for now.
  Poison and burn KOs award EXP to the Pokémon that inflicted or last hit.
- Enemies walk the path; what happens when one reaches the end depends on
  the level's objective (see "Level objectives").
- Every Pokémon instance (tower or enemy) has a level. Actual stats come from
  base stats with the Gen 4 formula, IV 31, EV 0, neutral nature (the IV/EV
  assumption lives in `src/data/config.json` and is tested in
  `src/sim/stats.ts`). Damage always uses computed stats, never base stats.
- Speed drives both movement and attack rate, with constants in
  `src/data/config.json`:
  enemy tiles/sec = clamp(speedBase + speedScale * Speed),
  tower attacks/sec = moveRate * clamp(Speed / speedRef, clampMin, clampMax).

### Level objectives
Each level definition (`src/data/levels.json`) has an `objective`:
- `defend`: a fixed wave count and a number of lives. Each enemy that reaches
  the end costs one life. Win when all waves are cleared, lose at zero lives.
- `free`: no lives. Enemies that reach the end despawn with no penalty. Waves
  continue indefinitely from the area's encounter table, ramping only the
  enemy count (never the level beyond the table's range). A "Leave route"
  button ends the level at any time and shows a summary: EXP gained per
  Pokémon, level-ups and (from Phase 3) Pokémon caught. Nothing is lost by
  leaving. Free levels are the grinding and catching spots.

Levels reference a Platinum location area and a time of day (morning, day,
night) rather than a hand-written enemy list. Waves are generated from that
area's walk table, weighted by rarity, with levels rolled in each entry's
range, from a seeded RNG so a level replays identically for the same seed.

### Catching
- Any wild enemy can be targeted with a Poké Ball while alive: click a ball
  in the HUD ball bar, then click the enemy. Catch chance uses the Gen 4
  formula in `src/sim/catch.ts`: `a = floor((3*maxHP - 2*HP) * catchRate *
  ball / (3*maxHP)) * statusBonus`; `a >= 255` is a sure catch, otherwise
  four shake checks against `b = floor(1048560 / sqrt(sqrt(16711680 / a)))`
  with the seeded RNG. Status bonus: sleep and freeze 2x, paralysis, poison
  and burn 1.5x (`config.json` `catch`).
- Ball types (`config.json` `balls`): Poké 1x, Great 1.5x, Ultra 2x, Dusk 3.5x
  in cave-themed maps or at night, Net 3x on Bug or Water types, Quick 4x on
  a target that has taken no damage, Master 255x (defined, not obtainable).
- Trainer-owned enemies cannot be caught (`trainer: true` on a level's wave
  definition; no current level uses it).
- A caught Pokémon leaves the wave and joins the party at its current level
  with the moves it would know. The party holds 6; extras go to the PC box,
  which has no cap. The Party / PC screen between levels swaps Pokémon,
  sorts the box by level, type or name, and shows stats and moves.
- Free-mode summaries list the Pokémon caught.

### Progression
- EXP: a KO gives Gen 4 wild EXP, `floor(baseExp * enemyLevel / 7)`, split
  evenly (floored) among every placed Pokémon that damaged the enemy
  (poison and burn KOs credit whoever inflicted or last hit). Every hit also
  gives a small EXP amount (`expPerHitFraction` of the KO value, at least 1).
  Level-ups follow the Gen 4 growth curves in `exp_curves.json`, learn new
  moves (replace dialog at four moves) and check for evolution.
- Evolution by level comes from `evolutions.json` and shows an accept /
  cancel prompt (the simulation pauses). Stone, trade, held-item, happiness,
  time, location and move-based evolutions are stubbed as "not yet" with the
  reason shown in the panel and the Party screen. Evolved forms keep level,
  EXP, HP fraction, moves and status; their sprite folders are fetched by
  `scripts/level-species.mjs`, which lists every evolution-line member of
  every species in the current levels.
- Level unlocks: Route 201 → Lake Verity (free) → Route 202 (free) → Route
  203 (defend, 8 waves) → Oreburgh Gate (defend, 8 waves) → Oreburgh Mine 1F,
  all with Platinum daytime tables (`requires` in `levels.json`). A defend
  level is completed by winning; a free level counts once at least one wave
  was cleared when leaving.
- Starter choice: a one-time screen before Route 201 to pick Turtwig,
  Chimchar or Piplup at level 5.
- Placed Pokémon move by drag and drop (pointer or touch): the sprite follows
  the pointer, free placeable tiles light up, a drop on one re-places it
  (cooldown restarts) and a drop anywhere else snaps back. A tap without a
  drag opens the Pokémon panel.
- Currency: Poké Dollars per KO and per level cleared (`config.json`
  `money`). The shop between levels sells all six balls, Potions (restore a
  placed Pokémon to full HP between waves, from its panel) and Rare Candy
  (one level, not past 100, from the PC summary panel; triggers move
  learning and evolution). Evolution stones, TMs and vitamins come later.
  Items show their Gen 5 sprites (PokeAPI sprites, `sprites/items/gen5/`,
  fetched by `scripts/fetch-items.sh`) in the ball bar, shop, the bag strip
  on level select and the summaries.
- The save tracks seen (on spawn), caught, and shiny caught per species for
  later features; there is no Pokédex screen.

### Save data
- Saved to localStorage after every level and every party, PC, shop or
  settings change; loaded on startup. Contents (format version 2): starter,
  party and PC boxes (name, wallpaper and 30 slots each; a Pokémon is
  species, level, EXP, HP, moves with PP, active move, shiny), level
  progress, items, money, Pokédex record, badges, settings (game speed and
  the speed constants). Version 1 saves and codes still load; their flat
  box list fills the boxes in order.
- Save code: a `PTD2.` prefixed base64url string with a checksum. Import
  validates every field against the data tables and rejects corrupt codes
  with the reason, never a crash.
- New Game asks for confirmation and wipes the save.

## Story mode

The game is organised by region. Each region is one story campaign of
roughly 25 levels following the main games' route order, with the anime's
characters and arcs woven into it rather than kept separate. Sinnoh is
the first region; Unova is the second. Further regions may follow.

### Sinnoh (Platinum spine, Diamond & Pearl anime woven in)
Free levels are training and catching; defend levels have stakes.
1.  Lake Verity / Route 201 (free): starter choice, Starly tutorial
2.  Route 202 (free): meet Dawn and Piplup (anime)
3.  Jubilife City (defend): Team Rocket (Jessie, James, Meowth) steal from
    the Poketch building; recurring comic-relief waves from here on
4.  Route 203 and Oreburgh Gate (defend)
5.  Oreburgh Mine (defend), then Roark gym boss
6.  Route 204 and Ravaged Path (free)
7.  Valley Windworks (defend): first Team Galactic encounter
8.  Eterna Forest (free)
9.  Gardenia gym boss
10. Galactic Eterna Building (defend): Paul introduced as rival, his
    Pokémon fight alongside Galactic's waves (anime rivalry)
11. Route 207 and Mt. Coronet south pass (free)
12. Hearthome Contest (contest objective: score from move variety, not
    KOs), Dawn's arc
13. Fantina gym boss
14. Route 209 and Solaceon Ruins (free): Unown
15. Veilstone: Maylene gym boss, then Galactic Warehouse (defend)
16. Pastoria and the Great Marsh (free), then Crasher Wake gym boss
17. Hunter J (timed defend): stop her airship freezing a captured
    legendary; two paths (anime)
18. Canalave: Byron gym boss, then Iron Island with Riley (defend)
19. Lake trio ambush (defend): Mesprit, Azelf, Uxie as escorts to protect
20. Snowpoint: Candice gym boss
21. Galactic HQ (defend)
22. Spear Pillar (defend): Cyrus, then Dialga and Palkia boss
23. Distortion World (defend): Giratina boss
24. Sunyshore: Volkner gym boss
25. Victory Road and the League: Elite Four, Cynthia, then the Lily of
    the Valley Conference with Paul and finally Tobias's Darkrai (anime)
Post-game: Stark Mountain and Heatran; Battle Frontier as endless mode.

### Hisui time rifts (bonus levels scattered through Sinnoh)
As Team Galactic's experiments destabilise space-time, rifts open near
the player. Each is a bonus level reachable from the region map once its
trigger level is cleared, set in the Hisui area closest to that part of
Sinnoh:
- after Eterna Forest: Obsidian Fieldlands (free). Hisuian forms and
  Alpha Pokémon (oversized enemies with boosted stats) introduced
- after the Great Marsh: Crimson Mirelands (free)
- after Canalave / Iron Island: Cobalt Coastlands (free), then the Noble
  Kleavor boss (defend): phased fight where balm items reuse the
  ball-throw mechanic during openings
- after Snowpoint: Alabaster Icelands (free), then Noble Hisuian Avalugg
  boss (defend)
- after Spear Pillar: a space-time distortion (defend) with rare spawns,
  then Hisuian Arcanine as the final Noble
Hisuian forms are only catchable in rifts and usable everywhere.

### Unova (Black 2 / White 2 spine, Best Wishes anime woven in)
Outline to be written when Sinnoh is playable. Known pieces: Team
Plasma and N as the antagonists, the eight Unova gyms, Ash, Iris and
Cilan from the anime. Unova encounter tables come from the same PokeAPI
pipeline (Black 2 and White 2 version ids), and Gen 5 sprites exist in
SpriteCollab.

### Challenge levels and shiny hunting
Unchanged from the sections below.

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
  Since Phase 2 a shiny flag is rolled at spawn from `shinyRate` in
  `config.json` (1/4096), shiny enemies use the shiny folder, sparkle on
  spawn and get a gold HP bar outline. Charm, chaining and dex tracking are
  Phase 6.
- Pokédex shows shiny counts. A "shiny living dex" completion reward exists.

## UI
- Theme: dark navy panels with a light border in the style of the PMD
  dialogue boxes, cream text, the 17 type colours as CSS variables, Pixelify
  Sans (OFL, bundled) for headings, labels and the HUD, a system sans-serif
  for long text. Variables and components are listed in `docs/ui.md`.
- Title screen: game name, Continue, New Game, Credits.
- Level select map per act, styled after the Sinnoh region map (a plain list
  with the unlock chain for now)
- In-level HUD: a top bar with wave counter, lives, money, the speed toggle
  (1x, 2x, 4x), a Menu button (pause menu with Resume, Settings and Exit;
  Esc opens it too) and the boss HP bar when a boss is on the path, and a bottom
  bar with the party strip and the Poké Ball bar (item sprites); nothing
  overlaps the playfield. Game speed runs extra fixed 1/60 s steps per
  frame (`src/sim/clock.ts`), never a bigger step, so 4x replays exactly
  like 1x for the same seed (`clock.test.ts` proves it).
- Pokémon panel: portrait, level, HP and EXP bars with numbers, status and
  stat stages, all four moves with type and power, the active move
  highlighted (click a move to make it active), a Move button, and later an
  evolution button when eligible. Opened by clicking a placed Pokémon or its
  slot in the party strip along the bottom of the HUD. It is a DOM overlay so
  it stays readable at phone width.
- PC (`PCScene`, full screen, reached from level select): laid out like the
  DS games with the party column on the left, the box grid (6x5) on the
  right over the box's wallpaper inside a frame image, arrows and a name
  to switch boxes (8 boxes), a cursor image, drag and drop between any
  slots (holding a drag over an arrow turns the page), and a side panel
  with the summary (icon, portrait, level, types, stats, moves, EXP, Rare
  Candy) plus sort and filter. The frame, cursor and wallpapers are images
  named in `src/data/pc.json` (plain placeholders from
  `scripts/build-placeholders.mjs`), so a Gen 4 skin is a file swap.
- Badge case on the title screen and level select; bag strip (balls,
  Potion, Rare Candy with counts) on level select.
- Dialogue boxes with portraits
- Settings: volume, sprite scale, colorblind-friendly type colors

## Build plan (work one phase at a time, commit at the end of each)
Phase 0 (done): Scaffold project, sprite loader, render one Pokémon playing
         Idle and Walk in all 8 directions. Vitest configured.
Phase 1 (done): Two levels (Route 201 free, Oreburgh Mine 1F defend), waves
         from Platinum encounter tables, PokeAPI stats pipeline, Gen 4
         stats and damage, speed from stats, debug tuning panel.
Phase 2 (done): Moves from learnsets with learn/replace flow, move effects
         from PokeAPI data, status conditions and stat stages, targeting
         rules, mid-wave movement, in-level Pokémon panel, early shiny visual.
Phase 3 (done): Catching with the Gen 4 formula and six ball types, party
         and PC box, EXP split, evolution by level with stubs for the rest,
         Lake Verity, Route 202, Route 203 and Oreburgh Gate with the unlock
         chain, starter choice, drag-and-drop movement.
Phase 4 (done): Save/load with export codes, money, shop, Potions and Rare
         Candy, Pokédex, New Game.
Cleanup (done): Credits screen, design doc update.
UI pass (done): Pixel font, palette, consistent overlays, HUD bars, title
         screen, docs/ui.md.
Phase 5 (in progress): per-level rosters with the one-featured-level
         rule, trainer waves (Tristan, Barry, Roark), the Cranidos boss,
         badges, boss-wave retry, the PC scene, 4x speed, Gen 5 item
         sprites and the ball-throw animation, map editor and tilesets
         (merged from the maps branch). Still to come: dialogue, the rest
         of Act 1, region map level select.
Phase 6: Challenge levels and the full shiny system.
Phase 7: Hisui rifts and Unova.
Phase 8: Polish: audio, settings, performance pass; strip the debug panel.

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
