# Phase 8 plan: the content build (docs/design-content.md)

Eight numbered items, one commit each, tests before every commit. Maps,
`scripts/bw-maps.py`, `scripts/sinnoh-maps.py` and the tileset files stay
off limits; levels whose map does not exist yet use a stand-in from the
existing list and are marked in `docs/progress.md`.

## 1. Data foundation

- **Species and forms.** `scripts/build-pokedata.ts` adds species 899 to
  904 and every form in `scripts/sprite-list.txt`. Forms keep PokeAPI's
  numeric ids (10000+); Shadow Mewtwo, Shadow Lugia and Primal Dialga get
  synthetic ids (20150, 20249, 20483) with their base species' stats and a
  `shadow` / `primal` flag. Each entry carries `species` (the base dex
  number), `form`, `formName` and `folder` (the sprite folder from
  `spriteFolders.json`). Learnsets come from the newest version group with
  level-up rows for the form, filtered to the Gen 1 to 4 move table, else
  the base species' Platinum set. Types past Dark (Fairy) fall back to the
  base species' types because the chart is Gen 4. `dexFolder`, `iconUrl`
  and the save validation resolve forms through the entry.
- **Level data.** `LevelDef` gains `rules`, scripted `waves` (a number or a
  list of per-wave entries: wild roster, trainer with party and bosses,
  allies, lines, lane, banner), `lanes`, `unlock`, `reward`, `levelCap`.
  Level files split into `src/data/levels/*.json`, merged in story order.
  Maps expose extra lanes (`path-2`, `path-water`), spot properties and
  stage points through `MapModel` / `MapDef`.
- **Tests.** The level-15 cap and the one-featured-level rule apply to the
  opening routes only; every other level declares its own level range.
- **Rules engine.** `src/sim/rules/`: one module per rule with hooks
  (wave start, tick, spawn, tower placed, hit, target check, placement
  check, wave end) and a `ruleEvent` for banners. First set: rockfall,
  sun-and-shade, darkness, two-lanes, tide, iron-defense, ice-floor with
  hail-pulse, charge, gravity-shift, tag-ally, timer, escort, shadow-wave,
  plus wind (Windworks) and nightmare / catch-only for the events.

## 2. Gyms 2 to 8

Ten scripted waves each on the arena maps: six gym-trainer waves from the
listed Platinum classes, three leader waves, the ace as a 4x boss with its
signature move; VS intro and dialogue; the gym's rule; badge, TM and HM
flag in `reward`. Badge perks: placements = 2 + badges for non-demo saves.

## 3. Title screen

`TitleScene` renders the `title` map behind the menu with a slow pan,
real-clock tint, one weather effect per load, and the scene cast
(`src/ui/diorama.ts`): spar, chase, fishing trip, picnic, Galactic
business, flyover, rift on the stage points; one scene re-cast every 90 s;
sprites load in the background and the menu never waits.

## 4. Team Galactic finale

`spear-pillar` (two stairway lanes, Barry's two free towers, Mars and
Jupiter tag bosses, Cyrus with Weavile, the Dialga/Palkia/Giratina
cutscene) and `distortion-world` (gravity shifts, Cynthia's Garchomp for
three waves, Giratina Origin as a three-phase boss with Shadow Force and
Will-O-Wisp, catchable under 10 %). Legendary bosses: catch window under
10 % and the Poké Ball icon on the boss bar.

## 5. The Sinnoh Conference

Roster and tiers in `src/data/conference.json`; seeded draw keeping Legend
tier apart; bracket screen; four rounds on the four stadium floors picked
by the roulette (3, 4, 5, 6 Pokémon, the final ace at 5x HP); locker room
(heal, PC, vendor, simulated board); rewards; Champion's bracket.

## 6. Hisui rifts

Four rift levels with Legends rules (no money, Hisuian balls only), Alphas,
the Noble three-phase fight (frenzy aura, stagger meter, balms as Feather
Balls, two summoned waves between staggers), the space-time distortion
dome, and the Temporal Spire capstone (stand-in map) with Primal Dialga.

## 7. Mystery events and the Shiny lottery

Shaymin, Cresselia, Darkrai, Shadow Lugia, Shadow Mewtwo as event levels;
Shadow Pokémon rules (tint, no EXP until purified at a lake); the Lottery
Corner on the level select with daily and Conference tickets, the
challenge level, the three-ball draw and the reroll; Dynamax as a spawn
flag (2.5x sprite, red aura).

## 8. Polish

Wave banner naming the rule, boss bar phase ticks, caught banner, Pokédex
screen, result stars, three save slots, keyboard and touch shortcuts,
credits with scrolling. No audio.

`docs/progress.md` tracks what is done, stubbed and which maps are still
needed; `GAME_DESIGN.md` and `docs/decisions.md` are updated per item.
