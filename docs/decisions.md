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

## Phase 9 item 2 (story set pieces)

- The twelve levels sit in `05-story.json` so the level list keeps the
  design table's order; the unlock chain (not file order) drives Next
  level, so each gym now `requires` the set piece before it.
- Drifloon's Friday rule is a `weekday` field on the wild entry and a
  `weekday` option on `createLevel`; the scene passes the real day, tests
  pin one. Content checks keep weekday entries so the sprites are checked.
- The Great Marsh's "bait and mud" is one button: Bait slows every
  Pokémon on the path by half for eight seconds with a fifteen-second
  cooldown; `activate('mud')` stops them for a second instead. Zero-damage
  hits raise no hit event, and fleeing Pokémon cost no lives.
- Cheryl's Chansey "healer" is an `escort` option: an allied Chansey
  within three tiles of her heals one HP every two seconds. Chansey's own
  moves are whatever it knows at level 16.
- Rotom and Heatran are `event-` trainers (no art, no VS intro), catchable
  under 10 %, like the Phase 8 legendaries.
- Lake Valor's bomb carrier is Saturn's Golbat as the boss of wave 8 with
  the `timer` rule pinned to that wave; the outro still drains the lake
  (the story needs Azelf taken).
- Dawn, Barry (at Acuity) and Looker have no battle art for a wave; they
  appear in narration, Looker through the `policeman` portrait.
- Victory Road uses `mt-coronet` as its stand-in map; the Conference
  marker now opens after Victory Road instead of the Distortion World.
- Stark Mountain is gated on the Conference trophy flag (the design calls
  it the post-game level); Buck's Claydol holds the exit.

## Phase 9 item 3 (secret HM levels)

- Lake Valor and Lake Acuity have no water lane in their maps, so the
  `water-lane` rule falls back to the four spots nearest the path's end
  as the water spots; with `ice` and no water lane the whole shore is
  slowed instead of the lane.
- Water types take the water lane on every other spawn so the shore lane
  still sees traffic at Lake Verity.
- The red Gyarados is a forced-shiny wild entry (`shiny: true`) on a wave
  of its own, so it always surfaces on wave 4.
- The three Regis are their own small levels (sealed chambers on the
  mine, Acuity and Iron Island maps) opened by the Conference trophy and
  the HM, so clearing them sets the `regi-*` flags Snowpoint Temple needs.
- Regigigas's "weak for the first five waves" became Slow Start for the
  first thirty seconds of its wave: half speed and no boss moves, with a
  toast when it wears off.
- Arceus has no Plate items in the game, so its type simply cycles
  through the seventeen types every twenty seconds (toast per change).
- Eighteen shards: one per badge level (8), rift (4), finale level (2)
  and four story set pieces (Windworks, Chateau, Iron Island, HQ);
  gym tests now check the HM flag with `arrayContaining`.
- Turnback Cave and the Hall of Origin use the Spear Pillar map until
  their own exist; the rooms are its two stairways.
- Dialga and Palkia Origin share one `event-origin` trainer entry with
  `lane: both`, so one comes down each stairway.

## Phase 9 item 4 (shiny icons and stand-in maps)

- Shiny form icons already came from the shiny portraits; the gap was
  folders with shiny sheets but no shiny portrait (14). Those get a
  32x32 icon cut from the first down-facing frame of the shiny Idle
  sheet (`scripts/make-shiny-icons.py`), recorded as `shinyIcon` by the
  sprite index and loaded at boot; the runtime prefers the portrait cut
  when both exist.
- The Temporal Spire already sits on its own map (the maps session
  switched it); the stand-in table keeps Shadow Mewtwo, Victory Road,
  Turnback Cave, the Hall of Origin and the Regi chambers.

## Phase 9 batch 2, item 1 (Shoot animations)

- The game never tweened a lunge: the PMD Attack sheet carries it in its
  frames. Special and status moves now play the Shoot sheet in place;
  a folder without Shoot plays Attack, lunge and all, since the motion is
  in the pixels.
- The move category comes from the attack event's move id (boss moves
  too), resolved through `resolveMove`.
- Optional sheets (Attack, Shoot, Hurt, Faint, shadows) that fail to
  download drop the action (`dropFailedSheet`) instead of failing the
  level; only AnimData, Idle, Walk and the map trigger the retry loop.

## Phase 9 batch 2, item 2 (shiny box icons)

- Reverses the Phase 7 / Phase 9 item 4 headshot icons: shinies now share
  the normal box icon in the party strip, box grid, lists and summaries,
  with the sparkle badge as the only mark. The boot-time portrait cut,
  the `-shiny.png` icon files, `make-shiny-icons.py` and the `shinyIcon`
  index field are gone; `iconUrl` / `iconTextureKey` keep their shiny
  argument for the callers but ignore it.

## Phase 9 batch 2, item 5 (every generation in the data)

- The data set is exactly the sprite folder set: Gen 1 to 4 species
  without sprites (Bulbasaur, Vaporeon, ...) are gone too, so nothing can
  evolve into or spawn a Pokémon the game cannot draw. Evolutions and
  Platinum encounter tables are trimmed to shipped species.
- Gen 1 to 4 species keep Platinum learnsets (the doc's rule); species
  and forms past Gen 4 take the newest version group they appear in, by
  generation then order, so the Japanese Red/Green and the newest spin-off
  groups do not win by id.
- The type chart stays Gen 4: a Fairy slot is dropped from a dual type and
  a pure Fairy (Xerneas) counts as Normal; Fairy-type moves are Normal.
- `displayName` derives the base name from the form's own name, since a
  form's base species (Growlithe for 0058-hisui) may ship no entry.
- PokeAPI's `is_legendary` / `is_mythical` become a `legendary` flag for
  the lottery pool, the showcase and the title cast.

## Phase 9 batch 2, item 3 (Legends box)

- Sixty-eight legends do not fit one box of thirty, so the showcase fills
  the first empty boxes after the ordinary collection and names them
  "Legends", "Legends 2", "Legends 3".
- The list is read from the sprite list's legendaries section (dex
  order) plus the nine named extras; Shaymin Sky counts as its own species
  (form id), Type: Null, Cosmog and Kubfu are included as listed.
- Levels respect a species' evolution floor (Solgaleo never below 53).

## Phase 9 batch 2, item 4 (title screen)

- Solidity comes from the Tiled data the map session painted: catalogue
  `solid` on ground and decoration stamps plus the water, pool and
  shallow-water terrains; ice and sand stay walkable. The grid lives in
  `src/map/tiled.ts` (`walkGrid`) so a level could use it later.
- Paths are breadth-first over four neighbours and simplified to corners,
  one tween per corner; a goal off the map lets the search leave the map
  (actors running out of frame), otherwise it stays on it. A goal on a
  solid cell snaps to the nearest open one, as every spawn point does.
- The rift hopper runs to the nearest open cell toward the forest instead
  of through the trees; the title check now samples every actor each
  second and finds no one on a solid cell.
- Casting is a weighted shuffle drawn without replacement (final forms and
  legendaries three times as likely to come early, new forms twice);
  whoever is on screen is skipped until they leave.
- The diorama's `playAnim` never throws: a missing action (Thundurus's
  Walk sheet is malformed) falls back to Idle or leaves the frame.

## Phase 9 batch 2, item 6 (bugs and performance)

Measured headless (Chromium with swiftshader, so frame rates are
render-bound and only the trends count), production build served by
`vite preview`, cold cache.

| Measure | Before | After |
| --- | --- | --- |
| Boot to title | 4753 ms, 3208 requests, 3.7 MB | 2985 to 3164 ms, 1605 requests, 1.3 MB |
| Boot to Route 201 ready | 8889 ms, 3949 requests, 9.0 MB | 6038 to 6342 ms, 2347 requests, 6.6 MB |
| Sim, 240 steps, 6 towers vs 12 crawling level-45 enemies (`level.timing.test.ts`) | 2.5 ms best (0.010 ms per step) | 2.1 to 2.3 ms best (0.009 ms per step) |
| Frame rate at 4x, twelve enemies, six towers (swiftshader) | 28 to 31 fps | 28 to 31 fps |
| 20 switches Level, PC, Title, Level select: heap after the first fill | grew (190 MB, 1374 textures after 20) | flat (151 to 157 MB, 1204 to 1206 textures) |
| Same loop: window listeners, tweens, timers, keyboard listeners | 0 growth | 0 growth |

About half of the old requests were `blob:` URLs: every box icon was
fetched twice (once as a Phaser texture, once as a DOM `<img>`), and boot
pulled every trainer's standing art, pose, mugshot and banner plus every
portrait the showcase might want.

- Boot loads the interface, box icons, items, badges, type icons, popups,
  the town map and the Ace Trainer base; trainer art loads with the level
  that shows it (`levelTrainerIds`, `queueTrainerArt`), portraits are
  on-demand `<img>` elements, and the title unloads the sprite sets it
  cast when it closes. A scene that closes with a sprite download in
  flight loses its loader listeners but not the download, so the loader
  now drops those sheets as they land and parses an AnimData that landed
  late from the text cache instead of re-requesting a key the loader
  would skip (a species could otherwise never load again that session).
- Loading screens never error: an optional sheet (Attack, Shoot, Hurt,
  Faint, shadows) that fails logs one warning and the action is skipped;
  only the map, AnimData, Idle and Walk trigger the retry loop. The
  all-screens sweep (every level in `levelIds()`, the title, level
  select, PC, Pokédex, lottery and Conference) finds no console error,
  page error or failed request; the only output is swiftshader's own
  "GPU stall due to ReadPixels" driver notice on the first WebGL frame
  and the one warning for Primal Dialga's malformed Faint sheet (28
  frames for a 224-frame entry; the action is skipped).
- The sim loop allocates nothing per tick: `step()` walks a reused enemy
  snapshot, `candidates()` fills a pooled list and caches each enemy's
  lane point per tick (keyed by elapsed, distance and direction so a
  test that moves an enemy mid-tick still sees the new point), and the
  rules share one `RuleContext`.
- The scene pools floating numbers (forty at once at most; a flood of
  hits at 4x shows no number for the rest), hit flashes are the Hurt
  animation on the existing sprite, the HUD only rewrites a text whose
  string changed (Phaser skips identical `setText`) and the Start button
  no longer redraws every frame, the Pokémon panel refreshes only when
  its key changes.
- Leaks: `scene.children.removeAll(true)` only removes (Phaser's list
  skips the destroy callback), which leaked the preload label's canvas
  texture once per level; `destroyChildren` destroys them. The shiny
  star and the title weather particles are drawn on canvases instead of
  `generateTexture`, which reads the GPU back. The leak loop above runs
  with `--expose-gc`; tweens, timers, keyboard and window listeners come
  back to their starting counts after every cycle.
- Rough edges: the trainer intro shows the standing portrait in dialogue
  and the throwing pose on the field (checked on Roark); the level select
  cursor walks land only (`sinnoh-map-land.png` sea colours, one leg per
  land stretch, four legs to Snowpoint); the speed keys are plain 1, 2
  and 4 with Q W E R T Y for party slots; the boss box ends at y=110 and
  the wave banner starts at y=116; Snowpoint's hail pulses only while
  Abomasnow is pending or on the field (`hailSpecies`); Rowan and Looker
  use their own overworld sheets. The stale notes in `docs/progress.md`
  (toast banners, Rowan and Looker stand-ins, the hail rule, Shift speed
  keys, the Origin level) are gone; the map stand-ins stay as the maps
  session asked.

## Phase 9 batch 2, item 7 (range only when selected)

- The build phase used to ring every placed Pokémon; now only the
  selected one and a dragged one are ringed, so the field reads clean
  and the ring means "this one". A dragged Pokémon's ring sits on the
  free patch under the pointer (where the drop would land), otherwise
  on the pointer, so the player can judge reach before letting go; a
  placed party member dragged off the strip (a drop that does nothing)
  gets none. Enemies never had one and still have none.

## Phase 9 batch 2, follow-up (page opens too zoomed in)

- Fit used to scale the 960x636 canvas up to the window (1.7x on a
  1080p screen, 2.3x on the title with its own camera zoom), so the page
  opened looking blown up. Fit now caps at native size: it only shrinks
  into a window smaller than the canvas. Existing saves keep their "fit"
  setting and get the new behaviour; 1.5x and 2x stay for anyone who
  wants it bigger, and the title's 1.36x camera pan is unchanged.
- Two things found on the way: Phaser's autoCenter and the page's flex
  centring both offset the canvas, so it sat right of and below centre
  (Phaser's centring is off now); and at a fixed zoom bigger than the
  window Phaser never re-read the canvas position after a scroll, so
  pointer input drifted by the scroll offset (the canvas bounds are now
  refreshed on every scroll).

