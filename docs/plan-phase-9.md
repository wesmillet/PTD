# Phase 9 plan: bigger text, the story set pieces, the secret HM levels

Four numbered items, one commit each, tests before every commit, pushed
as they land. Maps, `scripts/bw-maps.py`, `scripts/sinnoh-maps.py` and
the tileset files stay off limits; a level whose map does not exist yet
uses a stand-in from `src/data/maps/` and is listed in `docs/progress.md`.

## 1. Bigger text

Power Clear sits on a 13 px grid, so body text read during play moves
from 13 px to 26 px and 13 px stays only for dense lists.

- **Canvas** (`src/ui/styles.ts`): `TEXT`, `TEXT_DIM` and `TEXT_LIGHT`
  become 26 px; `TEXT_SMALL`, `TEXT_SMALL_DIM` and `TEXT_SMALL_LIGHT`
  keep 13 px for the dense places (box grid tooltips, the Pokédex list,
  credits, the party-strip level numbers, ball counts, the debug panel).
  `Button` labels use the 26 px style; its default height grows from
  30 to 40 px and widths are re-measured from the label.
- **HUD** (`src/ui/hud.ts`): the top bar grows (92 to about 120 px) so
  the level name, wave, lives and money fit at 26 px in two rows; the
  bottom bar keeps the icons but its labels grow; the boss bar text
  stays as it is (already 26 px). `Hud.HEIGHT` / `Hud.BOTTOM` drive the
  map placement, so the map viewport shrinks by the difference; the
  960x600 canvas keeps the 30x14 map at 32 px tiles with the bottom bar
  overlapping nothing (checked headless on every map size).
- **Dialogue box** (`src/ui/dialogue.ts`): already 26 px; the box grows
  to hold two full lines (height 96 to 108 with the portrait), the wrap
  width is re-measured, the choice rows use 26 px, and pages are split
  so no page exceeds two lines (the paginator counts wrapped lines).
- **Banners**: the wave banner's detail line and the location popup's
  name use 26 px, frames re-measured from the text width.
- **DOM panels** (`src/ui/theme.css`): `--ptd-size` becomes 26 px and
  `--ptd-line` 32 px for `.ptd-panel` (Pokémon panel, PC summary, pause
  and options pages, shop, save panel, learn and evolution dialogs); a
  `.ptd-dense` class keeps 13 px / 16 px for the box grid tooltips, the
  Pokédex list and the credits. Panel widths grow (side panel 350 to
  440 px, modal 460 to 620 px) and the HP box, move rows and button
  padding are re-measured.
- **Level select**: the marker name frames and the badge tooltips use
  26 px with frames sized from the text; the hint line under the map too.
- **Check**: every screen touched is opened headless at 960x600 and at
  phone width, and screenshots are inspected for overflow.

## 2. Story set pieces

Twelve scripted defend levels in a new `src/data/levels/05-story.json`
(merged before the gyms; the unlock chain, not the file order, drives
"Next level"), in the order of `docs/design-content.md`, each with
`mapPos`, `popup`, `unlock`, `reward` (money, a flag, items), a level
cap and the wild list from the doc. Gym `requires` move onto the new
chain where the doc puts a set piece before the gym.

| Level | Map | Rule and script |
| --- | --- | --- |
| Valley Windworks | `valley-windworks` | `wind` (push 2 every 8 s); Pachirisu, Shinx, Buizel, Drifloon (Fridays only: a `weekday` on the wild entry); two grunt waves, Mars with Purugly as the boss |
| Eterna Forest | `eterna-forest` | `escort` (Cheryl) + `tag-ally` (her Chansey as a free healer: Soft-Boiled heals neighbours); Buneary, Wurmple, Budew, Gastly, Murkrow; the reward opens the Old Chateau |
| Old Chateau | `old-chateau`, night | `darkness` (one lantern per wave); Gastly, Haunter, Duskull; Rotom as the last-wave boss, catchable under 10 %; the butler's story in the lines |
| Mt. Coronet | `mt-coronet` | plays straight; Geodude, Bronzor, Chingling, Cleffa, Nosepass, Meditite; Cyrus's speech and a rift flicker in the outro |
| Galactic Warehouse | `galactic-hq` | plays straight; Stunky, Skuntank, Glameow, Purugly, Croagunk grunt waves; Dawn's Piplup as a free tower (ally) |
| Great Marsh | `great-marsh` | new `safari` rule: towers do no damage, every wild Pokémon is catchable and flees after `fleeAfter` seconds; bait (ball bar) slows the nearest; Crasher Wake's warm-up lines |
| Lake Valor | `lake-valor` | `timer` (90 s on the boss wave); Psyduck, Golduck, Magikarp, Gyarados; Saturn's grunts, the bomb-carrier Golbat boss; the outro drains the lake |
| Iron Island | `iron-island` | `tag-ally` (Riley's Lucario on the spot nearest the exit) + `two-lanes`; Geodude, Graveler, Onix, Steelix, Zubat, Golbat; grunt waves down both lanes; reward: Riolu egg flag, Key Stone, Lucarionite |
| Lake Acuity | `lake-acuity` | plays straight; Snorunt, Sneasel, Swinub, Psyduck; Jupiter's waves after Barry loses |
| Galactic HQ | `galactic-hq` | `shadow-wave` every third wave; Golbat, Crobat, Bronzong, Skuntank, Purugly, Toxicroak; Saturn's last stand with Toxicroak as the boss; the outro frees the lake trio |
| Victory Road | `mt-coronet` (stand-in) | plays straight; Graveler, Golbat, Onix, Machoke, Steelix, Gabite, Floatzel; an Ace Trainer wave; opens the Conference outside demo mode |
| Stark Mountain | `stark-mountain` | post-game; Magby, Houndour, Magcargo, Rhyperior; Heatran as the last-wave boss, catchable under 10 %; Houndoominite |

- `WildEntry.weekday` (0 to 6) keeps an entry for that real-world day
  (Drifloon on Fridays); the sim takes the day from a `date` option so
  tests can pin it.
- The `safari` rule and the ally healer move live in `src/sim/rules/`
  and `src/sim/level.ts` with tests in a new `story.test.ts` (each level
  creates, runs its first waves and its rule, and resolves every
  species, trainer and move).
- The chain: Oreburgh Mine → Windworks → Eterna Forest → (Old Chateau)
  → Eterna Gym → Mt. Coronet → Hearthome Gym → Veilstone Gym →
  Warehouse → Great Marsh → Pastoria Gym → Lake Valor → Canalave Gym →
  Iron Island → Lake Acuity → Snowpoint Gym → Galactic HQ → Sunyshore
  Gym → Spear Pillar → Distortion World → Victory Road → Conference;
  Stark Mountain after Victory Road.

## 3. Secret HM levels

Seven levels in `src/data/levels/50-secret.json`, each gated on its HM
flag from the badge rewards (`unlock.flags`) and the story flag the doc
names, with a legendary boss catchable under 10 %:

| Level | Map | Gate | Script |
| --- | --- | --- | --- |
| Lake Verity: Island | `lake-verity-island` | surf, spear-pillar-cleared | new `water-lane` rule: the `path-water` lane carries Water types and the `island` spots take only Water or Flying (spot property); Psyduck, Golduck, Goldeen, Seaking, Gyarados; Mesprit boss |
| Lake Valor: Island | `lake-valor` | surf, spear-pillar-cleared | `water-lane` with a `refill` option: for the first three waves the water spots are dry land; the red Gyarados (forced shiny) surfaces on wave 4; Golduck, Gyarados, Wooper, Quagsire; Azelf boss |
| Lake Acuity: Island | `lake-acuity` | surf, spear-pillar-cleared | `water-lane` with `ice: true` (enemies on the water lane at 0.7x); Sneasel, Snorunt, Glalie, Psyduck; Uxie boss, Regice as a side boss after the Conference flag |
| Snowpoint Temple | `snowpoint-temple` | strength, the three Regis (`regi-rock`, `regi-ice`, `regi-steel` flags) | Snorunt, Sneasel, Glalie, Weavile; Regigigas at `slowStart: 5` (half damage and speed for five waves) |
| Spear Pillar: Origin | `spear-pillar` | temporal-spire-cleared | the altar spot is placeable (an `extraSpots` list on the level); Bronzong, Chingling, Clefable; Dialga Origin and Palkia Origin come down the two lanes together as bosses, both catchable; Shadow Lugia purifies here |
| Turnback Cave | `spear-pillar` (stand-in) | waterfall, distortion-world-cleared | new `rooms` rule: every wave a random lane is the wrong room and sends its enemies back to the start when they reach the end; Bronzong, Golbat, Gastly, Dusclops; Giratina Altered as the boss (a second chance if it fainted) |
| Hall of Origin | `spear-pillar` (stand-in) | the 18 shard flags | no wild Pokémon; Arceus as a single boss (its plates: a `typeCycle` list changes its type every 20 s), catchable under 10 % |

Regirock (Oreburgh Mine B2) and Registeel (Iron Island) have no map or
level of their own yet: Registeel is a side boss wave on Iron Island
once the Conference trophy is held, Regirock the same on Oreburgh Mine
1F, so Snowpoint Temple can open. The shards: one per story level's
reward (`shard-<level>`), the noble rewards already give four.

## 4. Shiny icons for forms and the stand-in maps

- Folders with shiny sprite sheets but no shiny portrait (21 today,
  including Mega Kangaskhan) get a shiny box icon cut from the first
  down-facing Idle frame of the shiny sheet, scaled to 32x32
  (`scripts/make-shiny-icons.py` to `public/assets/icons/<name>-shiny.png`),
  and `iconTextureKey` / `iconUrl` fall back to it; `spriteFolders.json`
  records `shinyIcon: true`.
- The Temporal Spire moves onto its real map (`temporal-spire`, lanes
  `path` and `path-2`, the `dialga` point); the stand-in table in
  `docs/progress.md` is refreshed with the new entries (Victory Road,
  Turnback Cave, the Hall of Origin, Shadow Mewtwo).
- `GAME_DESIGN.md`, `docs/progress.md` and `docs/decisions.md` updated.

## Batch 2 (after the maps session's review)

Order of work: 1, 2, 5, 3 (needs 5), 4, 6, 7. One commit each.

1. **Special moves don't lunge.** `Shoot` joins the loaded actions as an
   optional sheet. `animateAttack` reads the move's category: physical
   plays `Attack` (the sheet's own lunge), special and status play
   `Shoot` in place, falling back to `Attack` when the folder has none.
   A failed optional sheet (Attack, Hurt, Faint, Shoot, any shadow) drops
   that action instead of failing the level; only AnimData, Idle, Walk
   and the map count as core files for the retry loop.
2. **Shiny box icons.** The party strip, box grid, Party / PC lists and
   summaries use the normal box icon plus the sparkle badge for shinies;
   the shiny portrait stays in the Pokémon panel, PC summary and the
   dialogue box. The boot-time portrait cut and the shiny icon files
   stay for the Pokédex and anything that wants the headshot.
5. **Every generation in the data.** `build-pokedata.ts` takes the
   species list from `spriteFolders.json`: every base species and form
   with a folder, stats and types from PokeAPI, learnsets from the newest
   version group each appears in, and every move those learnsets use (type
   chart stays Gen 4: Fairy maps to Normal). The species-count assertion
   becomes a two-way check between folders and data.
3. **Legends box.** `build-showcase.mjs` adds a "Legends" box: every
   legendary and mythical with a folder (the sprite list's last section
   plus Mewtwo, Lugia, Ho-Oh, Rayquaza, Dialga, Palkia, Giratina, Arceus
   and Shaymin Sky), shiny, levels 50 to 70, one per species.
4. **Title screen.** Walks are routed over the map's non-solid cells
   (A* on the Tiled layers' solid tiles: trees, cliffs, rocks, water);
   the chase stays on the route polyline; casting draws without
   replacement and re-casts pick someone off screen; overworld trainers
   at 2x; flyers move on a straight line at constant height with `Walk`
   and a drifting ground shadow; the spar, fishing and picnic stay on
   their stages and nothing spawns on water.
6. **Bug and performance pass.** Loading never errors (missing assets
   log once and fall back), levels load only their own folders, boot
   loads UI, icons and the party, the PC / Pokédex / title load on
   demand; shadow canvases cached per sheet, text measured once, hit
   flashes and damage numbers pooled, no per-frame allocation in the sim
   loop, DOM overlays updated only on change; a scene-switch loop proves
   nothing leaks; the rough edges in `docs/progress.md` are fixed.
   Numbers before and after go in `docs/decisions.md`.
7. **Range only when selected.** The attack radius shows only for the
   selected or dragged Pokémon; enemies never show one.
