# Content build progress (Phases 8 and 9)

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

- **Mystery events** (`src/data/levels/40-events.json`): Flower Paradise
  (Gratitude meter, Shaymin only when it is half full, flees after 60 s,
  the Gracidea on catch; Sky Forme by day on the field), Fullmoon Island
  (Cresselia asleep and catch-only, the Lunar Wing when it leaves), Newmoon
  Island (nightmare rule warded by the Lunar Wing, Darkrai with Dark Void
  in three tiles and Bad Dreams, catchable under 10 %, Dusk Balls at
  night), the S.S. Libra (Shadow waves on both lanes, Shadow Lugia
  catchable under 10 %), Shadow Mewtwo (single boss on the stadium at
  night, Psystrike down the whole path flinching everyone, a teleport every
  40 s; opens with the Legend ribbon). Shadow Pokémon: purple tint and
  aura, 1.3x boss damage, no EXP until purified at a lake (three cleared
  levels placed there; Lugia needs Spear Pillar).
- **Shiny lottery** (`src/sim/lottery.ts`, `src/ui/lotteryScreen.ts`): one
  date-seeded ticket a day plus Conference tickets, the Jubilife TV marker,
  a random challenge on a cleared route (Solo, Monotype, No catching, Level
  cap, Reverse, Speedrun; a lost ticket is kept), the three-ball draw from
  every base species with shiny sprites (favourites 3x, legendaries out),
  one reroll (two with the Shiny Charm), the prize at level 20 in a
  Premier Ball with the ticket number as its memo. Dynamax is a spawn flag
  (2.5x sprite, red aura, 3x HP) with no raid levels yet.

- **Polish**: wave banner in a Platinum frame naming the wave, trainer and
  the twist in play; boss HP bar with phase ticks and the Poké Ball icon
  in the catch window; the "Gotcha!" caught banner with the ball shaking
  and the destination; the Pokédex screen (counts, portraits, type icons,
  the areas a species appears in, unknown species blacked out); the result
  screen with three stars and a Next level button; three save slots
  (slot 1 keeps the old key) with a picker in the Save panel; keyboard
  shortcuts (Q W E R T Y pick party slots, 1, 2 and 4 set the speed, P
  pauses, Space starts the wave, Esc the menu; touch drag places); the
  credits screen with an auto-scroll button. No audio (no assets).

## Stubbed or simplified

- Dialogue riddles are plain option rows in the text box (keys 1 to 4).
- Fantina's riddle is one question ("What has keys but opens no locks?");
  the right answer lights two lanterns.
- Gym trainer names are made up (the Platinum gyms' trainers are not in the
  repo's data); their classes and Pokémon follow the design table.
- The title chase runs the route polyline forward and back (the map has
  no loop). Cyrus's dialogue is a short paraphrase.
- Ash, Paul, Tobias, Conway, Nando, Zoey and Team Rocket show as a
  blacked-out Ace Trainer (canvas silhouette at boot) until art is ripped.
- The Champion's bracket needs fifteen Elite-or-above trainers; the roster
  has nine, so the rest are the strongest of the others.
- Hyper Potions are ordinary Potions in the inventory (full heal); the
  water field's two water spots are the two spots nearest the path's end
  (the stadium maps carry no spot properties).
- Each round plays one opponent Pokémon per wave rather than a mixed wave.

- Balms are Feather Balls thrown at a staggered noble (any Hisuian ball
  works; the throw animation is the ball's). The dome is drawn as a glow
  centre on the map rather than a true third-of-the-map dome.
- The distortion's "double chain" bonus is not implemented (no chain yet).
- Shadow Lugia purifies at Spear Pillar (the finale or the Origin level);
  the Mega Mewtwo Y unlock is a flag only.
- Cresselia's "Sleep catch bonus" is the ordinary sleep bonus (2x).
- The Lottery's nature is "neutral" (the game has no natures).
- Keys: 1, 2 and 4 set the speed and Q W E R T Y pick party slots (the
  design gave the digits both jobs); the trainer card's play time and
  overworld sprite, and the "text speed" / colourblind settings are not
  built.

- **Story set pieces** (Phase 9, `src/data/levels/05-story.json`): Valley
  Windworks (wind, Mars, Drifloon on Fridays), Eterna Forest (Cheryl
  escort, her Chansey heals her), Old Chateau (darkness, Rotom catchable
  on the last wave), Mt. Coronet (Cyrus, the rift flicker), the Galactic
  Warehouse (Dawn's Piplup as a free tower), Great Marsh (`safari` rule:
  no damage, bait, fleeing), Lake Valor (90 s bomb timer on Saturn's
  wave), Iron Island (Riley's Lucario, two tunnels), Lake Acuity
  (Jupiter), Galactic HQ (Shadow waves, Saturn, the lake trio freed, the
  Looker Ticket), Victory Road and Stark Mountain (Buck's Claydol,
  Heatran catchable). The unlock chain runs through them; the Conference
  opens after Victory Road, Stark Mountain after the trophy.

- **Secret HM levels** (Phase 9, `src/data/levels/50-secret.json`), each
  gated on its HM flag from the badges and the story flag the design
  names: Lake Verity's island (`water-lane` rule: the `path-water` lane
  for Water types, the `island` spots for Water and Flying only,
  Mesprit), Lake Valor's island (dry bed for three waves, then the lake
  refills and the red Gyarados surfaces; Azelf), Lake Acuity's island
  (ice slows the shore; Uxie), the three Regi chambers (Regirock in the
  mine after Rock Smash, Regice under Acuity, Registeel on Iron Island
  after Strength; all post-trophy), Snowpoint Temple (Regigigas with
  Slow Start: half speed and no attacks for 30 s), Spear Pillar Origin
  (the altar spot placeable; Dialga and Palkia Origin down both
  stairways, both catchable; Shadow Lugia purifies here), Turnback Cave
  (`rooms` rule: the wrong room sends enemies back; Giratina Altered)
  and the Hall of Origin (eighteen shard flags from the gyms, rifts,
  finale and four story levels; Arceus with plates cycling its type).

## Not built yet (design order item 9)

Max Raids. Oreburgh Mine B2, Route 210 Fog and Mt. Coronet Peak (the
Rock Smash, Defog and Rock Climb levels) have no maps and no levels.
Galactic Eterna Building and Solaceon Ruins (story rows 7 and 9) have no
maps and no levels. Team Rocket's balloon and Hunter J have no art.

## Maps still needed

| Level | Stand-in map in use | Needed |
| --- | --- | --- |
| `victory-road` | `mt-coronet` | Victory Road |
| `turnback-cave` | `spear-pillar` (at night) | Turnback Cave (rooms that shuffle) |
| `hall-of-origin` | `spear-pillar` | The Hall of Origin (a stair of light) |
| `regirock-chamber`, `regice-chamber`, `registeel-chamber` | `oreburgh-mine-1f`, `lake-acuity`, `iron-island` | Sealed chambers, if wanted |
| `shadow-mewtwo` | `stadium-grass` (at night) | The stadium at night with empty stands, if a night variant is wanted |
| Galactic Eterna Building, Solaceon Ruins | none (levels not built) | The rooftop garden; the ruins |
