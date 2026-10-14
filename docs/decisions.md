# Decisions log

One line each. Made during the unattended run; the rule was to pick what is
closest to Pokémon Tower Defense when the spec was ambiguous.

- Placements per level are 6 from the start (PTD lets you place the whole
  party), replacing the "N starts at 1" rule.
- A free level counts as completed for unlocking once at least one wave has
  been cleared when you leave it (PTD unlocks the next level after a win;
  free levels have no win, so one cleared wave is the equivalent).
- The debug party (Turtwig, Piplup, Chimchar, shiny Darkrai) is no longer the
  default; the real party comes from the starter choice and catches. Open a
  level with `?party=debug` to load it for testing.
- Caught Pokémon join the party immediately (if there is room) and can be
  placed in the same level, as in PTD; past 6 they go to the PC box.
- KO EXP is split evenly (floored) among every placed Pokémon that damaged
  the enemy; the small per-hit EXP stays per hit.
- Quick Ball counts as "first turn" when the target has taken no damage;
  Dusk Ball triggers in cave-themed maps or at night; Net Ball on Bug or
  Water types.
- Evolution prompts pause the simulation like the move-replace dialog; a
  cancelled evolution is offered again at the next level-up (PTD behaviour,
  no "Everstone" memory).
- New placeholder maps for Lake Verity, Route 202, Route 203 and Oreburgh
  Gate use the existing map format untouched (the maps branch owns the
  format and tilesets).
- The starter is chosen once before Route 201; Pokémon Tower Defense gave
  the three Sinnoh starters at level 5 the same way.
- The "RawAsset" credits entry was removed on the maps branch (it was not
  used); the Gen 5 tileset credits (Kyle-Dove, UltimoSpriter) took its place.
- The Gen 5 tileset credits (`assets-src/tilesets/gen5/CREDITS.txt`, also
  in `src/data/tiles.json`) are shown on the credits screen since the maps
  branch ships the packed tiles.
- SpriteCollab credit ids are resolved to names with the repository's
  `credit_names.txt`, kept in `assets-src/spritecollab/` so the index can be
  rebuilt without a checkout.
- Sprite sheets load per level (the party's evolution lines plus the area's
  tables, both base and shiny) instead of every folder at boot; boot loads
  only portraits. The all-at-once load was ~730 requests and failed on
  GitHub Pages. Anything missing at runtime (a surprise evolution) loads on
  demand, and a failed level load shows a Retry button.
- The Pokédex page was removed on request; the seen/caught/shiny record
  stays in the save for later features.
- Box icons come from PokeAPI/sprites Gen 5 icons: the two-frame APNG is
  used directly in DOM screens (browsers animate it) and split into two PNG
  frames for the canvas party strip, which alternates them every 170 ms like
  Black/White. Portraits stay for the large Pokémon panel and the evolution
  prompt.
- Geodude was listed as a featured spawn in both Oreburgh Gate and the Mine;
  the one-featured-level rule allows one, so it is featured in the Gate (its
  first appearance) and rare (10 %) in the Mine, where Onix and Machop carry
  the level and Roark's own Geodude still shows up.
- Lake Verity's roster uses the old/good-rod level ranges (3–6) for Psyduck,
  Magikarp and Goldeen instead of the surf table (20–40), since it is the
  second level.
- Route 202 is a free level with a "final" trainer wave: Tristan comes on
  wave 6 and clearing it wins the level (PTD levels end on their trainer);
  the player can still leave earlier or replay it.
- A ball thrown at a trainer's Pokémon bounces off and is not consumed
  (PTD refused the throw rather than taking the ball).
- Trainer KOs give 1.5x EXP as in the main games; trainer Pokémon are never
  shiny.
- Boss moves are the only enemy attacks so far: Cranidos hits every placed
  Pokémon within the move's range on a timer, towers keep at least 1 HP
  (towers still cannot faint).
- Barry's Route 203 party is Starly 9 and the counter-starter 11, between
  the Diamond/Pearl and Platinum rematch levels; Roark uses his Platinum
  team (Geodude 12, Onix 12, Cranidos 14).
- Boss-wave retry restores the lives the wave started with and keeps the
  placed Pokémon as they are (HP included) rather than restoring a full
  snapshot.
- The PC has 8 boxes of 30 (Gen 4 boxes are 30 slots); the party column
  stays dense like the games (an empty party slot means "append"), and the
  last party member cannot be boxed.
- Saves moved to format 2 (boxes, badges); version 1 saves and PTD1 codes
  still load with their flat box list filling the boxes in order.
- The PC summary panel is a DOM side panel (readable at phone width) while
  the box grid, wallpapers, frame and cursor are canvas images from
  `pc.json`, so the DS-style skin can be swapped without touching code.
- 4x speed runs four fixed steps per frame; waves on free levels auto-start
  inside the sim so the determinism test has no frame-timed inputs.
- Level sprite preloading now covers the roster and the trainer's party
  (previously only the area table), so bosses never load on demand.
- A selected ball is used by the next click on a wild Pokémon only; any
  other click drops the selection and acts normally (the old behaviour left
  the ball selected and blocked placement).
- Exit from the pause menu leaves a free level with its summary (EXP and
  catches kept) and abandons a defend level (caught Pokémon still kept, no
  progress recorded).
- Platinum frames are applied at 1.5x in the DOM (`border-image`) and 1x on
  the canvas (NineSlice); the sheet's wider right edge is kept as drawn.
- The battle-GUI name and number fonts are packed into fixed cells for
  Phaser's RetroFont and used only where the games use them (Lv labels, the
  boss box); Pixelify Sans stays for everything else, as asked.
- Small HP bars on the map follow the battle GUI's look (white outline,
  black body, green / yellow / red fill) rather than placing the 128 px HP
  box over 32 px tiles; the full HP box is used in the panels and the boss
  bar.
- Shop pockets map Poké Balls, Medicine (Potion) and Items (Rare Candy) to
  the bag's round buttons; the other five pockets are not sold yet.
- The 33 Platinum wallpapers replace the placeholder ones; old saves that
  named a placeholder wallpaper fall back to the first Platinum one.
- Power Clear's pixel grid is 13 px per em (measured: edge pixels are
  sharpest at 13, 26 and 39 px), so the UI uses 13 px for body text and
  26 px for titles, headings and dialogue; 1x and 2x of the DS size.
- The battle GUI's cut name and number fonts were dropped in favour of Power
  Clear everywhere, as asked; the boss box and party strip use it too.
- The start menu keeps Platinum's seven entries (Exit closes the menu, as
  in the games) and adds "Leave level" with the flag icon, since the games
  have no way to quit a battle from the menu.
- The Pokédex page lists only what the save has seen (name hidden until
  caught); there is still no full Pokédex screen.
- Trainer intros moved from the card to the bottom dialogue box: page one
  "<name> wants to battle!" with the party icons, page two the intro line.
- A press on a party slot starts a drag at once; a release within 6 px is
  the old tap, so both ways of placing keep working.
- Demo mode seeds the showcase on the first run without a save and on New
  Game; the showcase Pokémon count as caught in the Pokédex record.
- In the showcase, each species is never below the level its evolution line
  reaches it by level (no Lv 20 Charizard); levels are rolled from a fixed
  seed so the file only changes when the list does.
- The debug panel and the map editor keep their monospace developer styling
  (they are tools, not game UI, and the editor belongs to the maps session);
  the save-code text areas use Power Clear like the rest.
- A failed sprite download (seen live right after a redeploy) now reloads
  the level on its own after 2, 4 and 8 s before showing the manual Retry
  screen; the sprite loader forgets a folder whose AnimData failed so the
  reload requests it again.

## Phase 7 (zoom, Speed-based attack rate, shiny art, Platinum art, forms)

- Attack rate uses the formula as given, `0.55 + base Speed / 120` clamped
  to 0.6 to 1.9; with it Electrode (base Speed 150) lands on 1.8/s, not the
  1.9/s cap mentioned as an example, and Geodude on 0.72/s. The formula won
  over the examples; the tests pin the real values.
- A fixed zoom switches Phaser to NONE scale mode and clears the FIT aspect
  constraint on the display size (otherwise the canvas stays clamped to the
  window); the page scrolls when the canvas is bigger than the window.
  Zoom changes made before a save exists stay in memory for the session.
- Shiny box icons are the shiny Normal portrait scaled to 32x32 with nearest
  filtering, built as canvas textures at boot (as asked, the same recipe as
  the fallback icons), so they keep the portrait's background square like
  the fallback icons do. The sparkle badge is the star texture on canvas
  and a small ★ in the DOM.
- The VS intro plays for any trainer whose `trainers/index.json` entry has a
  mugshot (gym leaders, Elite Four, Cynthia, Frontier Brains, the player
  mugshots), with red diagonal stripes behind, PTD-style; trainers without
  one go straight to the dialogue. Click, Enter or Space skip it.
- The throwing pose stands one and a half tiles beside the path entrance
  (on whichever side has room) for the length of the trainer's wave, and
  disappears at `waveEnd`.
- Location popup kinds: a level's `popup` wins; otherwise lakes, mines,
  gates and caves, and forests are recognised from the area name, and
  everything else is a route. Oreburgh Gate and Oreburgh Mine use `cave`.
- Town map: markers use the dot frame for routes, lakes and caves and the
  square for towns and cities, flat red when open and gold when cleared
  (Platinum paints the places you can fly to red), greyed when locked. The
  player icon walks in a straight line at about 4 ms per pixel. Twinleaf
  Town is not a level yet, so it has no marker. The level select now only
  shows levels that carry `mapPos` (a test requires every level to).
- `badges.json` lists the eight badges with leader and gym; `allBadges()`
  marks which level awards each, and the trainer card, title and level
  select show all eight (lit when earned) instead of only badges a level
  awards.
- Type and move-category icons replace the drawn badges in every DOM
  move row (Pokémon panel, PC summary, learn dialog) and in the party
  page and starter choice; `typeBadge` stays for the type filter dropdown.


## Phase 8 item 1 (data foundation)

- Forms keep PokeAPI's numeric ids (10229 is Hisuian Growlithe) so every
  species lookup stays a number; Shadow Mewtwo, Shadow Lugia and Primal
  Dialga, which PokeAPI has no entry for, get synthetic ids 20150, 20249 and
  20483 with the base species' stats and a flag. Monster names use the
  display spelling ("hisuian-growlithe", "mega-lucario", "shadow-mewtwo"),
  and `findPokemonId` accepts both spellings.
- The seven Hisuian base species past Gen 4 (Zorua, Lilligant, ...) are in
  the data for their catch rates and growth only; they have no sprites and
  no level uses them.
- Fairy typing (Mega Altaria, Mega Gardevoir) falls back to the base
  species' types because the chart is Gen 4's; Psystrike is the one later
  move added to the table (Shadow Mewtwo). Later-generation level-up moves
  that do not exist in Gen 4 are filtered out of form learnsets.
- `waves` is either a number (as before) or the scripted list, so the six
  opening levels did not change. `badge` may live under `reward`; the
  loader mirrors it.
- Allies are towers with an `ally` field: they never gain EXP, do not count
  toward the placement limit and leave at the end of their last wave.
- The level cap is PTD's: a placed Pokémon stops gaining EXP at the cap in
  that level (it can still be placed).
- Lane reversal keeps a second built path per lane; live enemies turn round
  where they stand (distance mirrored) so gravity can shift mid-wave.
- The six opening routes keep the 15-level cap and the one-featured-level
  rule; every other level declares its own range through `levels` /
  `maxWildLevel`.

## Phase 8 item 2 (gyms)

- Leaders with three Pokémon fill waves 7 to 9 as first, second, then both
  together a level higher; Candice and Volkner (four) use their first three.
- A trainer's VS intro and opening lines play once per level; their later
  waves only show the wave toast and the field pose.
- Gym levels use `levelCap` 25, 29, 35, 40, 44, 47 and 53 (a few levels
  above each leader's ace) so a first run stays near the gym's level.
- The placement perk is `min(level placements, 2 + badges)` for non-demo
  saves; demo saves keep the level's six.
- Pastoria sends every even wave down the water lane (`path-water`), the
  high-tide waves, so the water spots matter.

## Phase 8 item 3 (title screen)

- The title uses two cameras: the main one zooms to 1.36x and pans the
  diorama, a second camera renders the menu, title and badges unscaled.
- The menu replaces the old Continue / New Game / Credits column with the
  design's five entries (New game, Continue, PC, Options, Credits) in a
  Platinum frame at the bottom left; Options opens the same page as in
  levels (speed and zoom).
- Stand-ins: Rowan is the Gentleman sheet, Looker the Policeman sheet.

## Phase 8 item 4 (finale)

- Barry's second ally is `counter-starter-final`: the final form of the
  starter that beats the player's (Infernape for a Turtwig run), as in
  Platinum where Barry's starter counters yours.
- The grunt waves alternate lanes per spawn (`lane: "both"`) so both
  stairways are busy at once; Mars takes the main stairway and Jupiter the
  other in the tag battle.
- Giratina's Shadow Force is a boss phase that opens with a three-second
  vanish (untargetable, no throws) at 100 %, 60 % and 30 %; the third phase
  also flips gravity every ten seconds. Dragon Claw is its timed move.
- Cutscene `show` names put PMD sprites on the map's `altar` point (or the
  path's end) for the length of the line.

## Phase 8 item 5 (Conference)

- Rounds are runtime level definitions (`LevelSceneData.def`) rather than
  entries in the level files, so the opponent, floor and party count come
  from the draw; the run itself (entrants, results, floors, vendor stock)
  lives in the save under `conference` and survives a reload mid-run.
- Match simulation is a logistic roll on the power difference divided by 8
  (Cynthia beats Cheryl about 99 % of the time, Aaron beats Flint about 40 %).
- Dark Void is Tobias's Darkrai's timed move every 15 s (the move's own
  sleep effect puts towers in range to sleep); Latios is a second boss.
- Rewards alternate at random between a Mega Stone the save does not hold
  and a Lottery ticket; once every stone is owned, tickets only.

## Phase 8 item 6 (Hisui rifts)

- Nobles are `trainer` entries with ids `noble-<name>` and no art, so the
  existing trainer-wave flow (banner, boss bar, uncatchable) carries them;
  Boot and the content tests skip art for `noble-` ids.
- A frenzied noble charges the whole path at 1.5x speed and starts over at
  the end instead of leaking (the fight is about the stagger, not lives).
- The stagger meter holds a quarter of the noble's max HP in damage; the
  window is six seconds; balms take 15 % of max HP; three windows calm it
  (as does reaching 0 HP from balms). Summons: two groups of three of its
  area's species, six seconds apart, on the noble's lane.
- Rifts hand out a Hisuian ball set at level start (`giveBalls`) because
  the shop never sells them; Alphas and the noble's reward refill the set.
- Petilil, Rufflet and Bergmite joined the data (their sprites were already
  in the repo) so the Mirelands and Icelands lists match the design.

## Phase 8 item 7 (events and lottery)

- Legendary events are `trainer` entries with `event-` ids (no art, no VS
  intro) so the boss bar, banner and catch window all apply; `catchableUnder`
  at 1 means catchable at any HP (Shaymin, Cresselia).
- A `condition` on a scripted wave checks a rule's status meter (Shaymin
  needs Gratitude at half); unmet, the wave's trainers are dropped and a
  line explains it.
- `catchRewards` on a level give flags or items for catching a species
  there (the Gracidea), checked when the level ends.
- Shadow Mewtwo's teleport is a boss phase at 100 % with `reverseEvery: 40`;
  Psystrike is a boss move with `range: 99` and `flinchAll`.
- The daily ticket is claimed when the level select opens (date in the
  save); a lost challenge refunds the ticket as the design says.

## Phase 8 item 8 (polish)

- The design gives the number keys two jobs (party slots and speeds); the
  plain digits pick party slots and Shift with 1, 2 or 4 sets the speed.
  Space keeps starting the wave; P pauses.
- Stars: one for clearing, one for keeping every life (free levels: three
  waves), one for a catch (defend levels without one: no leaks).
- Save slots: slot 1 is the original `ptd.save.v1` key so nobody loses a
  save; slots 2 and 3 are new keys; the active slot is remembered.
- The Pokédex lists every species some level spawns wild (from rosters,
  area tables and wave scripts) plus anything the save has seen, with
  unknown ones blacked out and named "???".
- The wave banner merges the wave's start events (trainer, lane, rule
  texts) into one frame; rule toasts mid-wave stay toasts.

## Phase 9 item 1 (bigger text)

- 26 px is the default canvas style (`TEXT`, `TEXT_DIM`, `TEXT_LIGHT`)
  and the DOM `--ptd-size`; the 13 px styles live on as `TEXT_SMALL*`
  and the `.ptd-dense` class for the Pokédex list, credits, box grid
  tooltips, damage numbers and the seed label.
- The HUD top bar grew to 110 px (three rows) and the bottom bar to
  78 px, so the canvas is 960x636; Fit zoom scales it as before.
- The HUD hints were shortened to one short sentence each so they fit
  between the money and the rule button at 26 px.
- `Button` grows to fit its label; callers give a minimum width. The
  summary, HUD and level select lay their buttons out from the measured
  widths.
- A noble's stagger meter is a gold bar under the boss HP bar instead of
  text, since "stagger 45 %" no longer fits beside the HP numbers.
- The placed-Pokémon dot on a party slot is gone; the blue outline
  already marks a placed slot.
- The level select's PC / Shop / Save / Credits / Demo buttons moved into
  a strip under the town map; the right column keeps the party count and
  the key hint, the left column the badges and bag.
- The dialogue box splits any page that wraps past two lines into
  two-line pages at word boundaries (`DialogueBox.splitPage`), keeping
  the portrait on every part and the icons and riddle choices on the last.
- The title's Continue button is always labelled "Continue" and greyed
  without a save (the old "(no save)" suffix no longer fits the frame).
