# Plan: Phase 1 — Two playable levels, stats pipeline, debug panel

Goal: two playable levels (Route 201 "free", Oreburgh Mine 1F "defend"), a
real stats pipeline from PokeAPI data, speed derived from stats, seeded wave
generation from Platinum encounter tables, a HUD with a speed toggle, and a
live debug panel. All waves, levels and Pokémon definitions live in JSON
under `src/data/`.

Sprite scale pick: **1x sprites on a 32 px tile grid, 960x540 canvas** (what
you liked in the demo). PMD sprites are 24 to 40 px tall, so one tile fits
one Pokémon with a little headroom. No camera zoom.

## 1. Data pipeline (`scripts/build-pokedata.ts`)

Source: sparse checkout of `data/v2/csv/` from github.com/PokeAPI/pokeapi
(41 MB, 187 files; the script reads 20 of them). Run with plain Node 22,
which strips TypeScript types natively, so no new dependency:

```
scripts/fetch-pokeapi.sh          # sparse clone into /tmp/pokeapi (never the whole repo)
node scripts/build-pokedata.ts    # reads /tmp/pokeapi/data/v2/csv, writes src/data/*.json
```

The script has its own tiny RFC 4180 CSV reader (quoted fields appear in a
few files). Everything is limited to Gen 1 to 4: species with
`generation_id <= 4` (493), moves with `generation_id <= 4`, types 1 to 17
(no Fairy, Stellar, Unknown or Shadow). Only the generated JSON and the
scripts are committed, never the CSVs.

Checked ids: Platinum is `version_id` 14 in `version_group_id` 9; level-up is
`pokemon_move_method_id` 1; encounter methods walk=1, old-rod=2, good-rod=3,
surf=5; Route 201 is `location_area_id` 141, Oreburgh Mine 1F is 6.

Outputs (compact, keyed by numeric id as strings where it helps lookups):

| File | Shape |
| --- | --- |
| `pokemon.json` | `{ "387": { name, types: [12], base: { hp, atk, def, spa, spd, spe }, growth: "medium-slow", catchRate: 45, baseExp: 64, evolvesFrom: 0 } }` from pokemon, pokemon_species, pokemon_stats, pokemon_types |
| `learnsets.json` | `{ "387": [[1, 33], [5, 110], ...] }` as `[level, moveId]`, Platinum (group 9), method level-up only, sorted by level |
| `moves.json` | `{ "33": { name: "tackle", type: 1, power: 40, accuracy: 100, pp: 35, category: "physical" } }` with `null` power/accuracy where the CSV is blank |
| `types.json` | `{ names: { "1": "normal", ... }, chart: { "10": { "12": 2, "11": 0.5, ... } } }` attacker -> defender -> multiplier, only non-1 entries |
| `exp_curves.json` | `{ "medium-slow": [0, 0, 9, 57, ...] }` indexed by level 1..100 from growth_rates + experience |
| `evolutions.json` | `{ "387": [{ to: 388, trigger: "level-up", level: 18 }] }` keyed by the pre-evolution; fields only when set: `item`, `heldItem`, `happiness`, `time`, `knownMove`, `location`, `gender`, `tradeSpecies`; plus `chains: { "<chainId>": [387, 388, 389] }` |
| `encounters.json` | see below |

### encounters.json

One entry per Platinum location area, under its location identifier and
area identifier so levels can reference `"area": "sinnoh-route-201"`
(empty area identifiers, like Route 201's, fall back to the location name):

```
{ "sinnoh-route-201": { "location": "sinnoh-route-201", "areaId": 141,
    "walk": [ { "species": 396, "min": 2, "max": 2, "rarity": 20 },
              { "species": 396, "min": 3, "max": 3, "rarity": 10, "time": "day" }, ... ],
    "surf": [...], "old-rod": [...], "good-rod": [...] } }
```

Condition handling, from the raw data: every grass slot has swarm variants
(slots 1 to 2), time variants (3 to 4), radar variants (5 to 6, 11 to 12)
and dual-slot variants (9 to 10). The entries for the *default* values
(`swarm-no`, `radar-off`, `slot2-none`) are the ordinary table, so they are
kept and stored without a condition; the non-default variants (`swarm-yes`,
`radar-on`, `slot2-ruby` ... `slot2-leafgreen`) are dropped. Time
conditions `time-morning`, `time-day`, `time-night` are kept as `time`.
With that, each area's walk table for one time of day sums to exactly 100
rarity (verified by hand for Route 201: 20+20+10+10+10+10+5+5+4+4+1+1), and
the script asserts this for every walk table. Methods other than the four
listed (super-rod, rock-smash, headbutt, gift...) are dropped.

Route 201 day walk table ends up: Starly 2 to 3, Bidoof 2 to 3. Oreburgh
Mine 1F: Geodude 4 to 8, Zubat 5 to 7, Onix 6 to 8 (no time variants).

### Sprites

Fetch the species those two tables can spawn: Zubat 0041, Geodude 0074,
Onix 0095, Kricketot 0401 (Route 201 morning/night, so the time-of-day
switch in the debug panel works). Turtwig, Starly and Bidoof are already in.
Actions loaded: towers Idle, Attack, Hurt; enemies Walk, Hurt, Faint.
Shadows (deferred from Phase 0) are added to the loader now: one shadow
sprite per Pokémon, drawn under the body from `<Action>-Shadow.png`.

## 2. Simulation (`src/sim/`, no Phaser, Vitest for everything)

- `stats.ts`: `computeStats(base, level)` with IV 15, EV 0, neutral nature:
  `HP = floor((2*base + 15) * level / 100) + level + 10`,
  `other = floor((2*base + 15) * level / 100) + 5`.
  Test: level 50 Turtwig (55/68/64/45/55/31) = 130/88/84/65/75/51.
- `damage.ts`: Gen 4 formula on computed stats, never base stats:
  `base = floor(floor(floor(2*L/5 + 2) * power * A / D) / 50) + 2`, then
  crit x2 (rate 1/16), random integer 85..100 / 100, STAB x1.5, type chart
  (two defender types), floored at each stage, minimum 1 unless immune.
  Physical uses atk/def, special uses spa/spd. Accuracy roll is separate
  (`hits(move, rng)`); a miss does no damage. Tests cover each stage with
  hand-computed values, STAB and immunity, and determinism for a seed.
- `speed.ts`: from `config.json`:
  `enemyTilesPerSec = clamp(speedBase + speedScale * spe, min, max)`,
  `towerAttacksPerSec = moveRate * clamp(spe / speedRef, clampMin, clampMax)`.
  Start values: speedBase 0.8, speedScale 0.015, speedRef 60, clamp 0.5 to 2.0,
  moveRate 1.0 attack/sec. The enemy clamp uses the same 0.5 to 2.0 pair
  (so Onix is not a statue).
- `exp.ts`: level from total EXP via `exp_curves.json`; EXP for a KO uses the
  Gen 4 wild formula `floor(baseExp * enemyLevel / 7)`; EXP per hit is
  `max(1, floor(koExp * expPerHitFraction))` with `expPerHitFraction` 0.05
  in config. Level-ups recompute stats and keep the HP fraction. No move
  learning yet (Phase 3).
- `waves.ts`: `generateWave(table, timeOfDay, waveIndex, levelDef, rng)` picks
  each spawn by rarity-weighted choice from the walk table filtered to
  entries with no time or the matching time, rolls the level in the entry's
  range, and spaces spawns by the level's `spawnInterval`. Count comes from
  the level definition (`enemiesFirstWave`, `enemiesPerWave`); "free" levels
  keep ramping the count only, capped by `config.freeWaveMaxEnemies`, and
  never change levels (they come from the table). Same seed, same waves.
- `level.ts`: the pure game state machine. State holds phase
  (`build`, `wave`, `won`, `lost`, `left`), wave index, lives, towers,
  enemies (with distance along the path), summary counters. `step(state, dt)`
  moves enemies, has towers pick the nearest enemy in range (Phase 2 adds
  the other targeting rules), fires attacks on cooldown, applies damage,
  awards EXP, handles KOs, end-of-path (lives minus one on "defend", silent
  despawn on "free"), wave completion, win and loss. Towers can be placed or
  moved only in `build` phase. Events (`attack`, `hit`, `miss`, `ko`,
  `leak`, `levelUp`, `waveStart`, `waveEnd`) are returned for the renderer
  to animate. Tests drive a level to a win, to a loss, and through a "free"
  leave with the expected summary.

Damage applies when the attack fires; the renderer plays the Attack and
Hurt animations around that moment. Syncing to the sheet's HitFrame is a
polish item, not Phase 1.

## 3. Content JSON

- `src/data/config.json`: speed constants above, `critRate`,
  `expPerHitFraction`, `freeWaveMaxEnemies`, `defaultRangeTiles` (2.5, until
  Phase 2 gives moves ranges), `speeds: [1, 2]`.
- `src/data/levels.json`:
  ```
  { "route-201": { "name": "Route 201", "area": "sinnoh-route-201",
      "time": "day", "objective": "free", "map": "route-201",
      "enemiesFirstWave": 3, "enemiesPerWave": 1, "spawnInterval": 1.5,
      "placements": 1 },
    "oreburgh-mine-1f": { ..., "objective": "defend", "waves": 8, "lives": 10 } }
  ```
- `src/data/maps/route-201.json`, `oreburgh-mine-1f.json`: own tile format,
  `{ tileSize: 32, rows: ["..PP..T..", ...], path: [[x, y], ...] }` with
  `.` ground, `P` path, `T` placeable, `#` blocked. Rendered as flat colored
  tiles for now (no tileset art yet; that is a later polish item). 30x14
  tiles under a 92 px HUD strip.
- `src/data/party-debug.json`: the fixed Phase 1 party, Turtwig level 5 with
  Tackle only. Used by both levels until Phase 3 brings a real party.

## 4. Scenes and UI

- `LevelSelectScene`: lists levels from `levels.json`. `?level=route-201`
  in the URL opens a level directly.
- `LevelScene`: builds the map, runs the sim at `speed * dt`, renders towers
  and enemies with `pmdLoader` (facing from `directionFromVector`), HP bars
  over enemies, floating damage and "Miss" text, Faint animation then
  removal. Click a placeable tile to place Turtwig; click Turtwig then a
  tile to move it between waves. "Start wave" button in build phase.
- `Hud` (`src/ui/hud.ts`): wave counter (`3 / 8` or `wave 3` on free), lives
  or "Free" label, 1x / 2x toggle, "Leave route" on free levels.
- `SummaryOverlay`: on won / lost / left: EXP gained per Pokémon, level-ups
  (from -> to), enemies KO'd, waves cleared; buttons Retry and Level select.
- `DebugPanel` (`src/ui/debugPanel.ts`): a DOM overlay toggled with the
  backtick key. Sliders for speedBase, speedScale, speedRef, clampMin,
  clampMax, moveRate; a Turtwig level control (1 to 100, recomputes stats
  and heals); an enemy level override (off, or 1 to 100, applied to spawns);
  a time-of-day selector (re-filters the table for the next wave) and the
  current seed with a "reroll" button. Changes write to the runtime copy of
  config and apply on the next sim step. Ships in the build; stripped in
  Phase 8.

## 5. Docs

- `GAME_DESIGN.md`: add a "Level objectives" subsection describing "defend"
  and "free"; mark Route 201, Lake Verity and Route 202 as free levels in
  the Act 1 outline; note the speed formulas and the IV/EV simplification.
- README: data pipeline commands and the two level URLs.

## 6. Order of work and acceptance

1. Data pipeline, generated JSON committed, pipeline tests (Turtwig base
   stats, Tackle, Fire vs Grass 2, medium-slow level 100 = 1,059,860, Route
   201 day table sums to 100 and contains Starly and Bidoof).
2. `stats`, `damage`, `speed`, `exp` with tests.
3. `waves`, `level` state machine with tests.
4. Maps, LevelScene, HUD, summary, level select, shadows.
5. Debug panel, speed toggle.
6. GAME_DESIGN.md and README updates, headless browser check of both
   levels, one commit per step pushed to `main`.

Done when: `npm test`, `npm run typecheck`, `npm run build` pass;
`http://localhost:5173/PTD/?level=route-201` plays indefinitely with Starly
and Bidoof waves and "Leave route" shows a correct summary;
`?level=oreburgh-mine-1f` is winnable in 8 waves and loses at 0 lives;
backtick opens the panel and slider changes take effect without a rebuild.

## Open points (my picks unless you say otherwise)

1. Super-rod tables are dropped because they were not in your list; adding
   them is one line if you want them.
2. The "default variant" reading of the swarm/radar/dual-slot rule above, so
   tables sum to 100 instead of losing the rarity-4 and rarity-1 slots.
3. Placeholder colored tiles for the two maps in this phase.
4. One-tile-per-Pokémon placement with a single placement slot, matching
   "N starts at 1".
