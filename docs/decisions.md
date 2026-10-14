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
