# Plan: Phase 2 — Moves, statuses, targeting, mid-wave movement, Pokémon panel

Goal: every placed Pokémon fights with up to 4 learnset moves and one active
move; moves carry range, cooldown, targeting and effects; the listed status
conditions and stat stages work with documented path-speed and attack-rate
effects; Pokémon can be moved mid-wave; an in-level panel shows a Pokémon's
portrait, stats, HP/EXP and moves. Optional early shiny visual included.

## 1. Data

### Generated (`scripts/build-pokedata.ts`)
PokeAPI already encodes secondary effects structurally in `move_meta.csv`
and `move_meta_stat_changes.csv` (checked: Poison Sting = ailment poison
30%, Growl = stat change atk -1 on the target, Thunder Wave = ailment
paralysis, category `ailment`). So `moves.json` grows, per move:

```
"40": { name: "poison-sting", type: 4, power: 15, accuracy: 100, pp: 35,
        category: "physical", priority: 0, target: "selected-pokemon",
        effect: { kind: "damage-ailment", ailment: "poison", ailmentChance: 30,
                  flinchChance: 0, statChance: 0, stats: [], drain: 0,
                  healing: 0, critRate: 0, hits: null } }
```
`kind` is PokeAPI's meta category (damage, ailment, net-good-stats, heal,
damage-ailment, damage-lower, damage-raise, damage-heal, ohko, unique...).
`stats` is `[{ stat: "atk", change: -1 }]`. `target` comes from
`move_targets.csv` ("user", "selected-pokemon", "all-opponents", ...).
No hand-written effect table is needed; unknown kinds just do damage.

### Hand-written `src/data/move_overrides.json`
```
{ "defaults": { "range": 1.5, "cooldown": 1.0, "targeting": "nearest" },
  "moves": { "razor-leaf": { "range": 3 }, "gust": { "range": 3.5 },
             "rock-throw": { "range": 3, "targeting": "strongest" },
             "withdraw": { "targeting": "self" }, "growl": { "range": 2.5 }, ... } }
```
`range` is in tiles (1.5 = adjacent including diagonals), `cooldown` is a
multiplier on the Speed-derived attack interval (so Speed still matters),
`targeting` is one of nearest, strongest (highest current HP), weakest
(lowest current HP), furthest (furthest along the path), self (status moves
on the user). I will fill entries for every level-up move of the Phase 1-2
roster (Turtwig line, Chimchar, Piplup, Starly, Bidoof, Kricketot, Geodude,
Zubat, Onix) plus the obvious ranged families (beams, projectiles, sound).
Anything else gets the defaults.

### Config (`src/data/config.json`)
`status`: tick interval 2 s, poison 1/8 max HP per tick, burn 1/16, burn
physical damage x0.5, paralysis speed x0.5 and attack rate x0.5 and 25%
skipped attacks, sleep 2 to 5 s, freeze 3 to 6 s, confusion 2 to 5 s with
50% chance per second of walking backwards (enemies) or wasting the attack
(towers), flinch stop 0.5 s. `shinyRate`: 1/4096. All tunable from the
debug panel.

### Sprites and portraits
`scripts/fetch-sprites.sh` also copies `portrait/<dex>/{Normal,Happy,Sad,
Angry,Surprised}.png` into `public/assets/portraits/<dex>/` and, when it
exists, the shiny folder `sprite/<dex>/0000/0001/` into
`public/assets/sprites/<dex>/shiny/` (credits.txt included). Checked: SpriteCollab
portraits are one 40x40 PNG per emotion, not a sheet; GAME_DESIGN.md gets
corrected. Shiny folders exist for all nine fetched Pokémon or are skipped
with a note.

## 2. Simulation (`src/sim/`, all tested)

- `moves.ts`: `resolveMove(id)` merges moves.json with overrides into a
  `MoveSpec` (range, cooldownMultiplier, targeting, effect). `startingMoves
  (species, level)` = the last four learnset moves at or below the level.
  `learnableAt(species, level)` = moves unlocked exactly at that level.
- `status.ts`: `StatusState` on a Monster: `ailment` (none, poison, burn,
  paralysis, sleep, freeze, confusion) with remaining seconds where timed,
  `flinch` seconds, `stages` (atk, def, spa, spd, spe, -6..+6, Gen 4
  multipliers n/2 or 2/n). Pure helpers: `applyAilment` (no stacking; a
  Pokémon keeps its first ailment), `tickStatus(mon, dt)` returning damage
  dealt and whether it ended, `speedMultiplier(mon)`, `attackRateMultiplier
  (mon)`, `effectiveStat(mon, key)` with stages, `applyStages`.
- `targeting.ts`: `selectTarget(rule, tower, enemies, range)` for nearest,
  strongest, weakest, furthest; ties broken by path distance; `self`
  returns no enemy.
- `damage.ts`: burn halves physical damage; attack and defense use stage-
  adjusted stats. Type chart and STAB already apply; tests extended.
- `level.ts` changes:
  - Towers attack with their active move: targeting from the move, range
    from the move, cooldown = Speed-derived interval x move cooldown x
    attack-rate multiplier from status. Status-category moves fire on the
    same schedule, targeting the enemy (or self).
  - After a hit: secondary effects roll ailment / flinch / stat changes per
    `effect` using the seeded RNG; `drain` and `healing` adjust tower HP.
  - Enemies: `tickStatus` each step; poison and burn damage can KO (EXP
    goes to the tower that last hit them); sleep, freeze and flinch stop
    movement; paralysis halves speed; confusion walks backwards per the
    config roll, never past the path start.
  - Towers: sleep, freeze, flinch and paralysis skip or delay attacks;
    confusion wastes attacks; the only sources right now are self-inflicted
    moves (Outrage, Thrash, Petal Dance confuse the user after use) and
    the debug panel, since enemies do not attack towers yet.
  - Move learning: on level-up, new moves at that level are learned at
    once if fewer than 4 are known (event `moveLearned`), otherwise queued
    on `state.pendingLearns` with an event `moveLearnPrompt`. `resolveLearn
    (state, towerId, moveId, replaceIndex | null)` swaps or declines. The
    scene pauses the sim while the prompt is open.
  - `setActiveMove(state, towerId, index)`.
  - Mid-wave movement: `moveTower` works in any phase; moving sets the
    cooldown to a full interval, so picking up never skips a cooldown.
    `placeTower` likewise works mid-wave.
  - Shiny (optional, included): `spawn` rolls `rng.chance(shinyRate)` and
    sets `mon.shiny`; event `spawn` carries `shiny`.
- `monster.ts`: `moves` become `MoveSlot[]` (`{ id, pp }`; PP shown but not
  consumed yet), `activeMove` index, `status`, `shiny`. `createMonster`
  defaults to `startingMoves`. Enemies get moves too (needed by catching in
  Phase 3).

## 3. Scenes and UI

- **Party strip**: a row of 40x40 portrait slots along the bottom of the HUD
  strip (HUD grows from 92 to 116 px; map rows unchanged, the canvas height
  becomes 564). Each slot shows the portrait, level and a thin HP bar, and
  a "placed / in party" state. Clicking a slot or a placed Pokémon opens
  the panel.
- **Pokémon panel** (`src/ui/pokemonPanel.ts`): a DOM overlay, like the
  debug panel, so it stays readable when the canvas is scaled down to a
  phone. Layout: portrait, name, level, HP bar with `hp / max`, EXP bar
  with "N EXP to next", status and stage summary, four move rows (name,
  type chip, power or "—", accuracy, category, PP), active move
  highlighted, click a row to make it active, a "Move" button that enters
  pick-up mode (next click on a placeable tile re-places it; Esc cancels),
  and a close button. Under 600 px wide it becomes a full-width bottom
  sheet with larger tap targets.
- **Move replace dialog**: DOM modal listing the four known moves plus the
  new one; pick one to forget or "Don't learn". The sim is paused while it
  is open; the HUD shows "Paused: Turtwig wants to learn X".
- **Status visuals**: enemies get a small status icon color dot above the
  HP bar (purple poison, orange burn, yellow paralysis, blue sleep, cyan
  freeze, pink confusion) and stat stage arrows on the panel. Floating
  text for "Poisoned!", "+1 Def" and friends.
- **Mid-wave movement**: clicking a placed Pokémon selects it in any phase;
  the next click on a free placeable tile moves it. The build-phase-only
  toast goes away.
- **Shiny**: shiny enemies use the `shiny/` sprite folder when loaded, play
  a short star burst (Phaser particles) on spawn, and the HP bar gets a
  gold outline. A debug panel field sets the shiny rate (1/4096 default,
  1 to force) so it can be seen.

## 4. Docs

GAME_DESIGN.md: replace "moved and swapped between waves, not mid-wave"
with the new rule (any time; moving restarts the attack cooldown); add a
"Status conditions" table with each effect on path speed and attack rate
and the config constants; correct the portrait format note; note that move
effects come from PokeAPI's move_meta tables; mark freeze as included.
README: panel and controls.

## 5. Tests (Vitest)

- Type effectiveness and STAB through `computeDamage` (extend existing).
- Each status: poison and burn tick damage and KO attribution, burn halving
  physical damage, paralysis speed/rate/skip, sleep and freeze stop and
  expire, confusion backward walk and wasted attacks, flinch stop; no
  ailment stacking; stat stages and multipliers; Speed stages change
  movement and attack rate.
- Targeting: nearest, strongest, weakest, furthest and tie-breaks on a
  constructed enemy set; out-of-range exclusion; self.
- Move resolution: overrides merge, defaults for unlisted moves, starting
  moves from learnsets (Turtwig 5 = Tackle, Withdraw; Turtwig 20 = Absorb,
  Razor Leaf, Curse, Bite).
- Move learning: auto-learn with a free slot, prompt at 4, resolve by
  replace and by decline, multiple level-ups in one grant.
- Mid-wave movement restarts the cooldown; placement during a wave.
- Shiny roll at rate 1 and rate 0.

## 6. Order of work

1. Data: build script changes, regenerated moves.json, move_overrides.json,
   config additions, fetch script for portraits and shiny folders, assets
   committed.
2. Sim: moves, status, targeting, damage changes, with tests.
3. Sim: level changes (active move, effects, statuses, learning, mid-wave
   movement, shiny), with tests.
4. UI: party strip, Pokémon panel, replace dialog, status visuals, shiny
   sparkle, mid-wave movement in the scene; headless check of both levels.
5. Docs and the debug panel additions.

Done when all tests pass, both levels play with the new systems, Turtwig
learns Absorb at 9 (auto) and prompts at the first level-up past four
moves, and the panel is readable in a 390 px wide viewport screenshot.

## Open points (my picks unless you say otherwise)

1. Freeze is included alongside the listed statuses because GAME_DESIGN.md
   lists it and it shares sleep's mechanics; strike it if you want it out.
2. Cooldown override is a multiplier on the Speed-derived interval rather
   than absolute seconds, so Speed keeps mattering.
3. The sim pauses while the move-replace dialog is open (PTD behaviour).
4. Towers keep HP for display only; self-damage from confusion is replaced
   by a wasted attack so HP cannot reach zero yet.
5. Accuracy and evasion stages are parsed but ignored for now.
6. Shiny optional item is included at modest scope.
