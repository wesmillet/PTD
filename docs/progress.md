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

- **Gyms 2 to 8** (`src/data/levels/10-gyms.json`): ten scripted waves each
  on the arena maps, six Platinum gym-trainer waves, three leader waves, the
  ace as a 4x boss with its signature move, the gym's rule, the leader's VS
  intro and dialogue, badge + TM + HM flag in `reward`. Gym 1 got its
  rockfall rule and its Coal Badge reward (Stealth Rock, Rock Smash). Badge
  perks: placements = 2 + badges outside demo mode.

- **Title screen** (`src/scenes/TitleScene.ts`, `src/ui/diorama.ts`): the
  `title` map behind the menu with a 60 s pan at 1.36x zoom, real-clock tint
  (dawn, dusk, night with route glow), one weather effect per load (none,
  petals, rain, snow on the ledge) and the cast scenes on the stage points:
  spar, chase (with role flips), fishing trip, picnic, Galactic business,
  flyover, rift. One scene re-casts every 90 s; sprites load in the
  background with a two-second skip.

- **Team Galactic finale** (`src/data/levels/20-finale.json`): Spear Pillar
  (twelve waves: grunts up both stairways, the Mars and Jupiter tag battle
  with Barry's Staraptor and starter as free towers from wave 5, Cyrus's
  team with Weavile as the boss, the Dialga/Palkia/Giratina cutscene with
  the sprites on the altar; the orbs and 6,000 as the reward) and the
  Distortion World (gravity shifts every other wave, Cynthia's Garchomp on
  the central spot for waves 1 to 3, Cyrus again, Giratina Origin as a
  three-phase boss with Shadow Force, Will-O-Wisp and gravity every 10 s,
  catchable under 10 %; night cave for Dusk Balls; the Griseous Orb).

- **The Sinnoh Conference** (`src/sim/conference.ts`, `src/data/conference.json`,
  `src/scenes/ConferenceScene.ts`, `src/ui/conferenceScreen.ts`): the
  roster with tiers, powers, teams and signature moves; the seeded draw
  (top four one per quarter, wildcards one run in six, Champion's bracket);
  the bracket board with simulated results from power ratings; the field
  roulette on the four stadium floors (`stadium` rule); rounds as runtime
  levels (3, 4, 5, 6 Pokémon, the ace a boss, 5x HP in the final; Team
  Rocket down both lanes); the locker room (heal, PC, vendor with five
  Hyper Potions and five Ultra Balls, board); rewards (trophy, 20,000 and a
  Master Ball first, a Mega Stone or Lottery ticket every win, the Legend
  ribbon for Tobias, the Champion's bracket after three wins). The run is
  saved mid-way (`game.conference`). Reached from the gold marker east of
  Sunyshore on the level select (after the Distortion World outside demo).

- **Hisui rifts** (`src/data/levels/30-hisui.json`): four rift levels on the
  rift maps with Legends rules (no money, Feather/Wing/Jet/Heavy Balls only,
  a ball set handed out at the start), the wild lists and Alphas (+10
  levels, 1.5x sprite with a red tint, catchable, drop a ball), the noble
  three-phase fight (gold frenzy tint, no damage while frenzied, hits fill a
  stagger meter worth a quarter of its HP, six-second stagger window where
  Feather Balls land as balms for 15 % each, two summoned waves of its
  area's Pokémon between staggers, calmed on the third stagger or at 0 HP,
  never caught), the space-time distortion dome once per level (`distortion`
  rule: 60 s, rare Hisuian spawns, a 1-in-20 shiny Alpha), and the Temporal
  Spire capstone with Primal Dialga after all four nobles. Rifts show as
  purple tears on the level select.

## Stubbed or simplified

- Dialogue riddles are plain option rows in the text box (keys 1 to 4).
- The wave banner and rule texts show as toasts until the polish item.
- Fantina's riddle is one question ("What has keys but opens no locks?");
  the right answer lights two lanterns.
- Gym trainer names are made up (the Platinum gyms' trainers are not in the
  repo's data); their classes and Pokémon follow the design table.
- Title scene stand-ins: Professor Rowan uses the `gentleman` overworld
  sheet and Looker the `policeman` one (no Rowan or Looker sheets exist).
  The chase runs the route polyline forward and back (the map has no loop).
- Dialga and Palkia appear in the cutscene only (the Origin secret level
  is item 9 territory). Cyrus's dialogue is a short paraphrase.
- Ash, Paul, Tobias, Conway, Nando, Zoey and Team Rocket show as a
  blacked-out Ace Trainer (canvas silhouette at boot) until art is ripped.
- The Champion's bracket needs fifteen Elite-or-above trainers; the roster
  has nine, so the rest are the strongest of the others.
- Hyper Potions are ordinary Potions in the inventory (full heal); the
  water field's two water spots are the two spots nearest the path's end
  (the stadium maps carry no spot properties).
- Each round plays one opponent Pokémon per wave rather than a mixed wave.
- The Snowpoint hail pulse fires at every wave start (the design ties it to
  Abomasnow; the rule has no way to know who is on the field yet).

- Balms are Feather Balls thrown at a staggered noble (any Hisuian ball
  works; the throw animation is the ball's). The dome is drawn as a glow
  centre on the map rather than a true third-of-the-map dome.
- The distortion's "double chain" bonus is not implemented (no chain yet).

## Maps still needed

| Level | Stand-in map in use | Needed |
| --- | --- | --- |
| `temporal-spire` | `spear-pillar` | The Temporal Spire (a spiral up the spire, PMD-style) |
