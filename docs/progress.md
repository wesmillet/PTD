# Content build progress (Phase 8)

What `docs/design-content.md` asks for, what exists, what is stubbed, and
which maps the maps session still needs to build. Updated per commit.

## Done

- **Data foundation.** `pokemon.json` holds species 899 to 904 and every
  form in `scripts/sprite-list.txt` (PokeAPI form ids, synthetic 20150
  Shadow Mewtwo, 20249 Shadow Lugia, 20483 Primal Dialga); `dexFolder`,
  icons and saves resolve forms. Level data has `rules`, scripted `waves`,
  `lanes`, `unlock`, `reward`, `levelCap`, `allies`, `ballsOnly`,
  `noMoney`; level files merge from `src/data/levels/*.json`. Maps expose
  `path-2` / `path-water` lanes, stage points and spot properties.
- **Rules engine** (`src/sim/rules/`): rockfall, sun-and-shade, darkness,
  two-lanes, tide, iron-defense, ice-floor (with hail pulses), charge,
  gravity-shift, tag-ally, timer, escort, shadow-wave, wind, nightmare,
  gratitude, distortion, challenge. Boss phases (Shadow Force vanish,
  Will-O-Wisp, gravity timer), legendary catch windows, Motor Drive
  immunity, Shadow and Alpha and Dynamax spawn flags, fleeing and
  catch-only Pokémon live in `src/sim/level.ts`.

## Stubbed or simplified

- Dialogue riddles are plain option rows in the text box (keys 1 to 4).
- The wave banner and rule texts show as toasts until the polish item.

## Maps still needed

None yet for the items built so far. Stand-ins used by later items are
listed here as they are added.
