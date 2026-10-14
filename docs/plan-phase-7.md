# Phase 7 plan: zoom, Speed-driven attack rate, shiny art, Platinum art, form folders

Batch 4 of the unattended work. Maps, `scripts/bw-maps.py`, `scripts/sinnoh-maps.py`
and the tileset files are off limits (another session owns them).

## Order of work

1. **Form folder tolerance** (unblocks everything else). `spriteFolders.json` now
   has `NNNN-form` keys. BootScene builds icon keys with `Number(dex)` which is
   NaN for those; switch to `species` from the entry. Audit `assets.ts`,
   `runtime.ts` and the showcase test for the same assumption.
2. **Attack speed from base Speed.** `towerAttacksPerSec(baseSpe, cfg) =
   moveRate * clamp(attackBase + baseSpe / attackScale, clampMin, clampMax)`
   with `attackBase 0.55`, `attackScale 120`, `clampMin 0.6`, `clampMax 1.9` in
   `config.json` "speed" (`speedRef` goes). `towerInterval` in level.ts uses
   `getPokemon(species).base.spe`; move `cooldown` multipliers stay on top.
   Pokémon panel and PC summary show "Attack speed: x.x/s". Tests updated
   (Shuckle 0.6, Geodude 0.7, Starly 1.05, Floatzel 1.5, Electrode 1.9).
3. **Zoom option.** Setting `zoom: 'fit' | 1 | 1.5 | 2` in storage settings.
   Fit = `Scale.FIT`; fixed = `Scale.NONE` + `setZoom(z)` + `refresh()`, still
   centred. Options page row + `+`/`-` keys in LevelScene (and level select).
4. **Shiny art.** `portraitUrl(species, emotion, shiny)` picks
   `<folder>/shiny/<Emotion>.png` when listed in `shinyPortraits`. BootScene
   loads `portrait-<dex>-shiny` and makes a 32x32 nearest-filtered canvas icon
   `icon-<dex>-shiny` from it. DOM `iconUrl(species, animated, shiny)` returns
   the shiny portrait and `.ptd-icon.shiny` scales it to 32x32 pixelated.
   Used in dialogue, Pokémon panel, PC summary, party strip, box grid, party
   page. The sparkle badge stays.
5. **Platinum art.**
   - Trainer standing pose in the dialogue box; throwing pose shown beside the
     spawn point while the trainer's waves are being sent.
   - VS intro (mugshot slides in from the right, VS mark, class banner when
     one exists) for trainers whose `trainers/index.json` entry has a mugshot,
     before the intro dialogue. One second, skippable by click.
   - `src/data/badges.json` lists the eight badges; the trainer card shows all
     eight, lit when earned. Title and level select use the same list.
   - Type and category icon images (`ui/gen4/types/<type>.png`) replace the
     drawn `typeBadge` in the Pokémon panel, PC summary and move rows.
   - Location popup: `popup` field on levels, default by area; slides in at
     top-left for two seconds at level start with the level name on it.
   - Level select rebuilt on `sinnoh-map.png` at 3x with `mapPos` markers,
     locked markers greyed, hover name frame, player overworld cursor walking
     between markers.
6. Docs (`GAME_DESIGN.md`, `docs/ui.md`, `docs/decisions.md`), headless checks
   of each screen, tests before every commit, push to main, confirm deploy.
