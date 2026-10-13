# Plan: Phase 4 — Saving, money, shop, Pokédex, New Game

Unattended phase: built straight after this plan was written.

## Data
- `config.json`: `money` (per KO, per level cleared, starting money),
  `shop` prices for Potion and Rare Candy (balls already carry prices).
- Save format v1 (`src/sim/save.ts`): starter, party and box as compact
  monster records (species, level, exp, hp, moves with PP, active move,
  shiny), level progress, items (balls, potions, rare candies), money,
  Pokédex (seen / caught / shiny caught per species), settings (game speed,
  the speed constants), savedAt. Save code = `PTD1.` + base64url(JSON) +
  `.` + FNV-1a checksum. Decoding validates every field against the data
  tables and rejects corrupt codes with an error, never a crash.

## Game state (`src/sim/game.ts`, `src/sim/items.ts`)
- `money`, `pokedex`, `items.potions`, `items.rareCandies` on GameState.
- Money: KO reward per enemy and a level-cleared reward (defend won, or a
  free level left with at least one wave cleared), awarded when the level
  ends.
- Potion: restores a placed Pokémon to full HP between waves (panel button).
- Rare Candy: one level (not past 100) from the party screen; triggers move
  learning (replace dialog) and the evolution prompt outside a level.
- Pokédex marks: seen on spawn, caught on catch (and the starter), shiny
  caught when the caught Pokémon is shiny.

## Persistence (`src/game/storage.ts`)
- localStorage key `ptd.save.v1`; saved after every level end and every
  party/PC/shop change; loaded on startup. Settings restore the speed
  constants and game speed.
- Save Code button shows the code with a copy button; Import box restores a
  pasted code after validation; New Game asks for confirmation and wipes
  the save.

## Screens (DOM overlays from the level select)
- Shop: all six balls, Potion, Rare Candy; buy one or five; shows money.
- Pokédex: all 493 species in order; portrait for caught, silhouette for
  seen-only, number only for unknown; counts at the top.
- Save / Load panel: save code, import, New Game.
