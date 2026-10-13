# Plan: Phase 3 — Catching, party and PC, EXP split, evolution, more levels

Unattended phase: built straight after this plan was written.

## Data
- `config.json`: `balls` (Poké 1x, Great 1.5x, Ultra 2x, Dusk 3.5x in caves
  or at night, Net 3x on Bug/Water, Quick 4x on an undamaged target, Master
  255x and not obtainable), `catch.statusBonus` (sleep/freeze 2, paralysis/
  poison/burn 1.5), `startingItems.balls` for play before the shop exists,
  `party.maxParty` 6.
- `levels.json`: Lake Verity (free), Route 202 (free), Route 203 (defend 8),
  Oreburgh Gate (defend 8) with Platinum day tables; `requires` gives the
  unlock chain Route 201 → Lake Verity → Route 202 → Route 203 → Oreburgh
  Gate → Oreburgh Mine. `placements` 6 everywhere.
- Four placeholder maps in the existing format.
- `scripts/level-species.mjs` lists every species in every level's tables
  plus their whole evolution lines and the starters; `fetch-sprites.sh`
  pulls them all (33 folders with shinies and portraits).

## Sim (tested)
- `catch.ts`: Gen 4 formula, `a = floor((3*max - 2*hp) * rate * ball / (3*max)) * status`,
  shake threshold `b = floor(1048560 / sqrt(sqrt(16711680 / a)))`, four
  shake checks against the seeded RNG; `ballModifier` evaluates the ball
  conditions.
- `evolution.ts`: `evolutionOptions(mon)` splits level-up evolutions that are
  ready from blocked ones with a reason (stone, trade, happiness, time,
  location, known move...); `evolveMonster` changes species, name, types and
  stats keeping level, EXP, HP fraction, moves and status.
- `game.ts`: pure game state (starter, party, box, completed levels, items)
  with party/box moves, sorting and the unlock chain.
- `level.ts`: `throwBall` (trainer enemies refuse), caught Pokémon leave the
  wave and join the party or box, `damagedBy` tracking and even EXP split,
  evolution prompts resolved by `resolveEvolution`, summary lists catches.

## UI
- Ball bar in the HUD; click a ball then an enemy; ball flight, shakes and
  catch/break animation; "Gotcha!" text.
- Party / PC overlay from the level select: lists, details, swap, sort.
- Starter choice overlay the first time Route 201 opens.
- Evolution prompt overlay (pauses the sim).
- Drag and drop to move placed Pokémon (pointer or touch); the Move button
  is gone; a tap still opens the panel.
- Level select shows the chain with locks and completion marks.
