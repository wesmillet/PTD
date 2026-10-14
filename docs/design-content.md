# Sinnoh TD: Story, Secret Levels and Special Pokémon

Design notes, October 2026. The living copy is the Claude doc "Sinnoh TD: Story, Secret Levels and Special Pokémon"; this file is the snapshot the main session reads.

The whole Sinnoh story in levels: the iconic routes and set pieces, all eight gym battles, the Team Galactic finale at Spear Pillar and in the Distortion World, four Hisui bonus levels, a randomised tournament in place of the Elite Four, the Shaymin, Darkrai and Shadow Pokémon mystery events, a shiny lottery, and a polish list. Everything here uses art that is already in the repo (checked at the end).

## Pillars

1. **Twists are seasoning, not the rule.** Most levels play straight. A set piece gets one memorable rule (wind, a bomb timer, a rotating path) and the gyms each get one.
2. **Places match the games.** Maps are traced from the Platinum layouts where one exists; arenas and rifts are built from the same BW tiles so nothing looks out of place.
3. **Come back later.** HMs and story flags reopen old levels with new Pokémon and a legendary. Nothing is missable.
4. **Special Pokémon are earned, not random.** Shiny, Shadow, Mega, Alpha and Noble encounters each have a story reason and a clear way to find them.
5. **Trainers and bosses can't be caught.** Their Pokémon are for beating; the reward is a badge, an item or an unlocked level. Legendary bosses are the exception: they can be caught once their HP is under 10%.
6. **Only art we have.** Every Pokémon, form, trainer and item named here has a sprite in the repo today. Gaps are listed in the asset check, not papered over.

## Story levels

Sixteen story levels carry the Platinum plot from Twinleaf to the Distortion World, with the eight gyms slotted between them. Routes without a story beat are skipped. A dash in the twist column means the level plays straight.

| # | Level | Map | Wild Pokémon | Story beat | Twist |
| --- | --- | --- | --- | --- | --- |
| 1 | Lake Verity | traced (live) | Starly, Bidoof, Psyduck, Magikarp, Goldeen | Rowan and Dawn, pick a starter, Starly ambush; Mesprit glimpsed over the island | Only the starter can be placed |
| 2 | Route 201 to 203 | traced (live) | Shinx, Kricketot, Abra, Zubat, Budew, Sentret | Barry races ahead; Youngster Tristan; Barry rival fight on 203 | - |
| 3 | Oreburgh Gate and Mine | live | Geodude, Onix, Machop, Zubat, Barboach | Roark is down the mine (gym 1 follows) | - |
| 4 | Valley Windworks | new | Pachirisu, Shinx, Buizel, Drifloon | Mars takes the plant; first Galactic grunts; Drifloon only on Fridays, as in the games | Fans push enemies back two tiles every 8 s, then blow them forward on the next gust |
| 5 | Eterna Forest | new | Buneary, Wurmple, Budew, Gastly, Murkrow | Cheryl asks for an escort; Old Chateau door opens afterwards | Escort: Cheryl walks the path, her Chansey is a free healer tower |
| 6 | Old Chateau | new, night | Gastly, Haunter, Duskull, Rotom (last wave) | The butler's ghost story | Lights out: range halves outside lantern glow; a lantern lights per wave |
| 7 | Galactic Eterna Building | new: the rooftop garden | Zubat, Golbat, Stunky, Glameow, Bronzor | Jupiter; free the Bike Shop owner; first Galactic grunt waves with trainer Pokémon | Two staircases, two paths |
| 8 | Mt. Coronet (Route 207 side) | new, cave | Geodude, Bronzor, Chingling, Cleffa, Nosepass, Meditite | Cyrus speaks of a new world; a rift flickers (Hisui tease) | - |
| 9 | Solaceon Ruins | new, cave | Bronzor, Chingling, Geodude, Hippopotas (no Unown sprites yet) | The plates on the walls hint at Arceus; Azure Flute shard 1 | - |
| 10 | Veilstone Galactic Warehouse | new | Stunky, Skuntank, Glameow, Purugly, Croagunk | Grunts stole Dawn's Pokédex; Dawn's Piplup fights beside you | - |
| 11 | Great Marsh | new | Wooper, Quagsire, Skorupi, Carnivine, Yanma, Tropius, Croagunk | Safari rules; Crasher Wake's warm-up | No damage: bait and mud only, catch what you can before it flees |
| 12 | Lake Valor | new | Psyduck, Golduck, Magikarp, Gyarados | Saturn's bomb drains the lake; Azelf is taken | Timer: stop the bomb carrier (a boss Golbat) before 90 s |
| 13 | Iron Island | new, cave | Geodude, Graveler, Onix, Steelix, Zubat, Golbat | Riley's tag battle; the Riolu egg; Key Stone | Riley's Lucario is a free tower; Galactic grunts send two lanes |
| 14 | Lake Acuity | new, snow | Snorunt, Sneasel, Swinub, Psyduck | Jupiter beats Barry; Uxie is taken | - |
| 15 | Galactic HQ | new | Golbat, Crobat, Bronzong, Skuntank, Purugly, Toxicroak | Saturn's last stand; free the lake trio from the machine | Every third wave is a Shadow wave (see Special Pokémon) |
| 16 | Spear Pillar and Distortion World | new | see the finale section | Cyrus, Dialga and Palkia, Giratina | see the finale section |

After the finale: Victory Road (Graveler, Golbat, Onix, Machoke, Steelix, Gabite, Floatzel) leads to the Sinnoh Conference, and Stark Mountain (Magby, Houndour, Magcargo, Rhyperior, Heatran as the last wave) opens as the post-game level.

Anime beats sit on top of these without new maps: Dawn's Piplup joins at the Warehouse, Paul's rival fights replace Barry's on Route 203 (demo) and at Lake Acuity, Team Rocket's Meowth balloon crashes a random route every three levels with Wobbuffet, Seviper and Carnivine waves that try to steal a placed Pokémon (knock the balloon down in 30 s to keep it), and Hunter J's Salamence and Drapion attack Iron Island between Riley's waves.

## Gym battles

Every gym is a ten-wave boss level on its own arena map: waves 1 to 6 are the gym trainers' Pokémon (uncatchable), 7 to 9 the leader's first Pokémon, wave 10 the leader's ace as a boss with four times its HP and a signature move. Teams are Platinum's. Each gym has one rule of its own, and the badge gives a TM and an HM gate (see Secret HM levels). The leader's VS mugshot, standing sprite and throwing pose are all in the repo, as are the eight badges.

| Gym | Leader and team | Arena (tiles) | Rule | Badge and reward |
| --- | --- | --- | --- | --- |
| 1 Oreburgh (Rock) | Roark: Geodude 12, Onix 12, **Cranidos 14** | Oreburgh Mine 1F, live now | Every third wave a rockfall blocks one placement spot for the wave (Onix drops it) | Coal: TM Stealth Rock, Rock Smash |
| 2 Eterna (Grass) | Gardenia: Turtwig 20, Cherrim 20, **Roserade 22** | Garden with flower beds, hedges of trees, a clock face of paving in the middle | Sun and shade: Cherrim calls Sunny Day on odd waves (Grass enemies 30% faster, Fire moves +50%); on even waves tall grass hides enemies until a tower is adjacent | Forest: TM Grass Knot, Cut |
| 3 Hearthome (Ghost) | Fantina: Duskull 24, Haunter 24, **Mismagius 26** | Night courtyard behind the gym, lantern posts, a long dark path | Darkness: towers see only two tiles unless inside a lantern's glow; the right answer to Fantina's riddle (dialogue choice) lights two more lanterns | Relic: TM Shadow Claw, Defog |
| 4 Veilstone (Fighting) | Maylene: Meditite 28, Machoke 29, **Lucario 32** | Dojo yard: sand floor, two lanes split by a training wall of rocks | Two lanes: enemies pick a lane at the gate each wave (announced on the banner); spots on the wall cover both, spots outside cover one | Cobble: TM Drain Punch, Fly (replay any cleared level from the map) |
| 5 Pastoria (Water) | Crasher Wake: Gyarados 33, Quagsire 34, **Floatzel 37** | Pool arena: a ring of water with a land path round it and a water path across it | Tide: on high-tide waves the two shore spots flood and only Water or Flying types can stand on the water spots; Rain Dance waves speed Swift Swim enemies | Fen: TM Brine, Surf |
| 6 Canalave (Steel) | Byron: Magneton 37, Steelix 38, **Bastiodon 41** | Harbour yard of steel plates and cranes | Iron Defense: Steel enemies carry a shield worth 25% of their HP that only special moves or Fire, Fighting and Ground hits break; Byron is Roark's father (dialogue) | Mine: TM Flash Cannon, Strength |
| 7 Snowpoint (Ice) | Candice: Sneasel 40, Piloswine 40, Abomasnow 42, **Froslass 44** | Snowfield with an ice floor in the middle and snow banks | Ice: enemies slide at 1.6x speed on ice tiles; Abomasnow's hail pulses shrink every tower's range by one tile for 5 s each wave | Icicle: TM Avalanche, Rock Climb |
| 8 Sunyshore (Electric) | Volkner: Jolteon 46, Raichu 46, Luxray 48, **Electivire 50** | Gear-floor arena with three generator pads by the path | Charge: each wave cleared charges a generator; at three, the Magnetic Flux button paralyses every enemy on the path for 5 s; Electivire's Motor Drive makes it immune to Electric and faster when hit by it | Beacon: TM Charge Beam, Waterfall |

Gym trainers come from the Platinum gyms and their Pokémon all have sprites: Oreburgh (Youngster, Worker: Geodude, Onix, Machop), Eterna (Aroma Lady, Lass: Budew, Cherubi, Tangela, Bellossom, Roselia), Hearthome (Youngster, Picnicker: Gastly, Misdreavus, Drifloon, Dusclops), Veilstone (Black Belt, Battle Girl: Machop, Riolu, Croagunk, Hitmonlee, Hitmonchan, Medicham), Pastoria (Sailor, Fisherman, Tuber: Remoraid, Octillery, Marill, Azumarill, Mantyke, Finneon, Lumineon, Wooper), Canalave (Worker, Black Belt: Magnemite, Bronzor, Shieldon, Skarmory, Steelix), Snowpoint (Skier, Ace Trainer: Snover, Swinub, Snorunt, Glalie, Glaceon, Weavile, Mamoswine), Sunyshore (Guitarist, Scientist, Poké Kid: Pichu, Pikachu, Shinx, Luxio, Elekid, Electabuzz, Pachirisu, Magnezone, Rotom).

## Team Galactic finale

Two levels back to back, with no shop in between. The first ends in a cutscene, the second in the only boss that can be caught.

### Spear Pillar

The arena is the summit: a stone platform with the pillars down both sides and two stairways feeding one path to the altar. Twelve waves in three acts.

1. **Grunts (waves 1 to 4).** Galactic grunt Pokémon from both stairways: Golbat, Bronzor, Stunky, Glameow, Croagunk. Two lanes merge at the altar.
2. **Mars and Jupiter, tag battle (waves 5 to 8).** Barry arrives, as in Platinum, and his team fights beside you: his Staraptor and his starter's final form (the counter to yours) are placed as free towers on the two spots nearest the altar for the rest of the level. Mars sends Bronzor, Golbat and **Purugly** (boss), Jupiter sends Bronzor, Golbat and **Skuntank** (boss), both pairs at once.
3. **Cyrus (waves 9 to 12).** Houndoom 45, Honchkrow 47, Gyarados 46, Crobat 46, then **Weavile 47** as the boss. Cyrus's dialogue is the Platinum speech cut short. The Red Chain: when Weavile falls, Dialga and Palkia appear at the altar and the screen distorts; Giratina drags Cyrus into the portal. Cynthia arrives and follows him in.

Reward: 6,000 Poké Dollars, the Adamant Orb and the Lustrous Orb (held items that boost Dialga's and Palkia's Dragon and Steel or Water moves later), and the Distortion World unlocks. Dialga and Palkia are not fought here; they come back as the Secret HM level "Spear Pillar, Origin" after the Conference.

### Distortion World

The map is the Platinum look: floating stone platforms on black, waterfalls running sideways, the path drawn in pale stone. Ten waves.

- **Gravity shifts.** Every other wave the path reverses: enemies come from the far end and walk back. The wave banner says which way. Spots stay where they are, so a tower at the old exit is now at the entrance.
- **Cynthia's Garchomp** holds the central spot as a free tower for waves 1 to 3, then she leaves to find Cyrus.
- Waves 1 to 6: Golbat, Crobat, Bronzong, Haunter, Duskull, Dusclops, plus Cyrus's team once more at waves 7 to 9 (Houndoom, Honchkrow, Gyarados, Crobat together, Weavile as a mini boss).
- **Wave 10: Giratina, Origin Forme.** Boss with three phases at 100%, 60% and 30% HP. Each phase opens with Shadow Force: Giratina vanishes for three seconds, immune, then hits the nearest tower for a flinch. Phase two adds Will-O-Wisp (burns the two nearest towers). Phase three reverses gravity every 10 s. Under 10% HP it can be caught; the catch uses the Gen 4 formula with Giratina's catch rate of 3, so expect to spend Ultra and Dusk Balls (the level counts as a cave at night). If it faints instead, it is gone until Turnback Cave.

Reward: the Griseous Orb (held by Giratina to stay in Origin Forme; without it, Altered Forme on the field), 8,000 Poké Dollars, and Cyrus's last line. Both Giratina forms have sprites.

## Hisui rifts: four bonus levels

Dialga and Palkia's clash at Spear Pillar leaves space-time rifts over Sinnoh. Each opens on the level select as a purple tear beside the modern location and drops you into the same place in Hisui, drawn with the BW outdoor tiles: no roads, no signs, wooden posts and campfires instead. Rift levels use Legends rules: no money, no shop, and every wild Pokémon can be caught with the Hisuian balls you find there (Feather, Wing, Jet, Heavy; all have sprites).

| Rift | Modern spot | Wild Pokémon | Alpha (1.5x size, +10 levels, catchable) | Noble boss |
| --- | --- | --- | --- | --- |
| Obsidian Fieldlands: Grandtree Arena | Eterna Forest | Bidoof, Starly, Shinx, Wurmple, Kricketot, Buizel, Ponyta, Stantler, Scyther, Paras | Alpha Rapidash, Alpha Wyrdeer | **Kleavor** |
| Crimson Mirelands: Brava Arena | Great Marsh | Petilil, Tangela, Yanma, Croagunk, Carnivine, Barboach, Psyduck, Teddiursa, Ursaring | Alpha Ursaluna | **Hisuian Lilligant** |
| Cobalt Coastlands: Firespit Island | Pastoria shore | Hisuian Growlithe, Hisuian Qwilfish, Tentacool, Mantyke, Remoraid, Octillery, Magikarp, Chatot, Murkrow | Alpha Gyarados, Alpha Basculegion | **Hisuian Arcanine** |
| Alabaster Icelands: Icepeak Arena | Lake Acuity | Hisuian Zorua, Hisuian Sneasel, Snorunt, Swinub, Piloswine, Bergmite, Rufflet, Glalie | Alpha Hisuian Zoroark, Alpha Hisuian Braviary | **Hisuian Avalugg** |

### Noble fights

A noble is a three-phase boss that cannot be damaged while frenzied. Each phase: the noble charges down the path with a gold frenzy aura, and your towers' hits fill a stagger meter instead of taking HP. When it fills, the noble staggers for six seconds: the ball bar switches to balms (packed in Feather Balls, so the throw animation and art are the ones we have) and every balm that lands takes 15% off the noble's HP. Three staggers calm it. Between staggers it calls two waves of its area's wild Pokémon (Kleavor calls Scyther, Lilligant calls Petilil and Tangela, Arcanine calls Growlithe, Avalugg calls Bergmite). Calmed nobles are not caught; each leaves its reward: a Hisuian ball set, an Azure Flute shard, and one evolution item tied to it (Kleavor a Black Augurite stand-in: Dusk Stone; Lilligant a Sun Stone; Arcanine a Fire Stone; Avalugg an Ice-type TM).

### Space-time distortions

Once per rift level, at a random wave, a dome of purple light covers a third of the map for 60 seconds. Inside it rare spawns walk the path: Hisuian Typhlosion, Hisuian Samurott, Hisuian Decidueye, Hisuian Voltorb and Electrode, and a 1-in-20 shiny Alpha. Catching anything inside the dome counts double for the chain.

### Capstone: Temporal Spire

Calm all four nobles and a fifth rift opens on Spear Pillar: a Mystery Dungeon nod where the path spirals up the spire and **Primal Dialga** (its sprite is from the PMD games) is the boss. Beating it unlocks the Spear Pillar Origin secret level, where Dialga and Palkia return in their Origin Formes and can be caught.

## The Sinnoh Conference

The Elite Four is replaced by the Lily of the Valley Conference from the anime: a 16-trainer single-elimination bracket that is drawn fresh every time you enter. You are one entrant; the other fifteen are drawn from the roster below, so the road to the final is different each run and you only ever face four of them.

### How a run works

1. **The draw.** A bracket screen shows all sixteen names with their trainer sprites. Seeds keep the strongest apart: the four top-tier trainers in the run are spread one per quarter, so you cannot meet two of them before the semifinal.
2. **Four rounds**, each a trainer level on the stadium map: Round of 16 (opponent's first 3 Pokémon), Quarterfinal (4), Semifinal (5), Final (full 6, ace boss at five times HP). Every opponent's last Pokémon is a boss with its signature move.
3. **The field roulette** picks the stadium floor for each round: Grass (tall grass hides enemies briefly), Rock (Rock and Ground enemies 20% faster), Water (two water spots open for Water and Flying types), Ice (enemies slide). One field per round, shown on the roulette wheel before the match.
4. **The locker room** between rounds: heal, swap from the PC, a vendor with five Hyper Potions and five Ultra Balls, and the bracket board where the other matches play out. Those results are simulated from each trainer's power rating with some randomness, so the trainer waiting in the next round is not known until the board updates.
5. **Losing** ends the run; EXP and catches stay, the bracket is re-drawn next time. **Winning** the final plays the trophy scene with the full bracket.

### Roster

Every name below has a Platinum battle sprite in the repo except the three anime trainers marked with an asterisk, who appear as dark silhouettes with their name (which suits Tobias, the mystery entrant) until their art is ripped.

| Tier (power) | Trainers | Teams |
| --- | --- | --- |
| Legend (95 to 100) | Cynthia; Tobias\* | Cynthia: Spiritomb, Roserade, Togekiss, Lucario, Milotic, **Garchomp**. Tobias: **Darkrai** then **Latios**, both bosses; Dark Void puts every tower in range to sleep for 3 s every 15 s |
| Elite (80 to 90) | Aaron, Bertha, Flint, Lucian; Palmer; Ash\*; Paul\* | Elite Four teams from Platinum (Aaron: Yanmega, Scizor, Vespiquen, Heracross, **Drapion**; Bertha: Whiscash, Gliscor, Hippowdon, Golem, **Rhyperior**; Flint: Houndoom, Flareon, Rapidash, Infernape, **Magmortar**; Lucian: Mr. Mime, Espeon, Bronzong, Alakazam, **Gallade**). Palmer: Milotic, Dragonite, Rhyperior, **Regigigas**. Ash: Pikachu, Infernape, Staraptor, Torterra, Buizel, **Gliscor**. Paul: Ursaring, Torterra, Weavile, Magnezone, Drapion, **Electivire** |
| Frontier (75 to 85) | Dahlia, Darach, Thorton, Argenta | Dahlia: Ludicolo, Medicham, Dusknoir, Togekiss, **Blaziken**. Darach: Staraptor, Empoleon, Houndoom, Gallade, **Entei**. Thorton: Bronzong, Ambipom, Kangaskhan, Rotom, **Zapdos**. Argenta: Blissey, Lopunny, Gastrodon, Altaria, **Metagross** |
| Leaders (60 to 75) | the eight gym leaders with rematch teams in the 50s | as the gyms, plus one extra each (Roark Rampardos, Gardenia Tropius, Fantina Gengar, Maylene Toxicroak, Wake Lumineon, Byron Magnezone, Candice Glaceon, Volkner Ampharos) |
| Rivals and partners (55 to 70) | Barry, Dawn, Lucas, Riley, Cheryl, Mira, Marley, Buck, Conway, Nando, Zoey | Barry: Staraptor, Heracross, Floatzel, Snorlax, Roserade, starter. Dawn: Piplup, Buneary, Pachirisu, Mamoswine, Togekiss, Quilava. Riley: Lucario, Metagross, Absol, Salamence. Cheryl: Chansey, Blissey, Wobbuffet, Drifblim. Mira: Kadabra, Alakazam, Togekiss. Marley: Arcanine, Weavile, Ampharos. Buck: Claydol, Magcargo, Umbreon, Hitmontop, Dusclops. Conway: Slowking, Shuckle, Dusknoir, Lickilicky, Aggron. Nando: Roserade, Sunflora, Kricketune, Lopunny, Armaldo, Altaria. Zoey: Glameow, Mismagius, Gastrodon, Leafeon, Lumineon, Gallade |
| Wildcards (one in six runs) | Mars, Jupiter, Saturn; Jessie and James as a tag pair | Commanders with their HQ teams. Team Rocket: Wobbuffet, Seviper, Yanmega, Carnivine, Mime Jr., Meowth, sent down both lanes at once |

### Rewards

- First Conference win: the trophy on the trainer card, 20,000 Poké Dollars and the Master Ball.
- Every win: one Mega Stone from the list in Special Pokémon, or a Lottery ticket (see Shiny lottery).
- Beating Tobias: the Legend ribbon and the Shadow Mewtwo event unlocks (see Mystery events).
- Three wins: a "Champion's bracket" option where every entrant is Elite tier or above.

## Mystery events

Five event levels, each unlocked by a key item that is found, not bought. Every legendary here is a boss that can be caught under 10% HP; all have sprites, and the four Shadow and purified forms come straight from the PMD sprite database.

### Shaymin: Flower Paradise

- **Key:** Oak's Letter, handed over by Professor Oak at Route 224 after the Conference (demo: in the bag from the start).
- **The level:** the Seabreak Path, one long straight path from the Route 224 beach into a sea of flowers. Catch-only waves of Roselia, Combee, Cherubi, Budew and Sunflora: the Gratitude meter rises with every catch and drops with every KO. The flower path grows one segment per wave while the meter is high.
- **Shaymin** walks out of the flowers in the last wave as a boss only if the meter is at least half full; it runs after 60 seconds. Catching it gives the Gracidea, which switches it to Sky Forme (its own sprite) in daytime levels.

### Cresselia: Fullmoon Island

- **Key:** the sailor's boat at Canalave after the Mine Badge; his son will not wake.
- **The level:** a small moonlit island, night tiles, Clefairy, Clefable, Cleffa and Chingling waves. Cresselia floats the path as the last wave, cannot be fought, only caught: it leaves a Lunar Feather when it flees and the feather wakes the boy. Catching it is a one-wave window with the catch rate boosted while it sleeps under the moon (Sleep catch bonus applies).

### Darkrai: Newmoon Island

- **Key:** the Member Card (demo: free; release: the Lunar Wing from Fullmoon Island).
- **The level:** Newmoon Island at night, drawn as Canalave's mirror image. Nightmare rule: at the start of each wave one random tower falls asleep for the wave unless a Pokémon holding the Lunar Wing is placed. Murkrow, Honchkrow, Misdreavus and Duskull waves.
- **Darkrai** is the final boss. Dark Void every 15 s sleeps every tower within three tiles; Bad Dreams halves the attack speed of sleeping towers' neighbours. Under 10% HP it can be caught, Dusk Balls at 3.5x.

### Shadow Lugia: the S.S. Libra

- **Key:** the Looker Ticket, from Looker after Galactic HQ: a stolen Cipher ship from Orre has been seen off Sunyshore.
- **The level:** the ship's deck at Sunyshore harbour, two paths (deck and hold). Cipher's cargo: Shadow Pokémon are the Galactic machine's output sold on, so the waves are Shadow-tinted Golbat, Skuntank, Houndoom and Bronzong (purple aura, see Special Pokémon).
- **Shadow Lugia** (XD001) is the boss, with its own purple sprite. It can be caught under 10% HP and is the only Shadow Pokémon that cannot be purified on a lake: it needs the Relic Stone, which is Spear Pillar's altar in this game. Place it there for one full level (the Spear Pillar Origin secret level) and it becomes Lugia, with Lugia's sprite.

### Shadow Mewtwo: the Synergy Stone

- **Key:** beat Tobias in a Conference final.
- **The level:** the stadium at night, empty stands. A "???" entrant challenges the champion: Shadow Mewtwo, with the Pokkén sprite, as a single-boss level with no waves before it. Every 20 s it fires Psystrike down the whole path, flinching every tower; every 40 s it teleports to the other end of the path and reverses direction.
- Under 10% HP it can be caught; purifying it at Lake Verity (three cleared levels placed there) turns it into Mewtwo, and a Conference win with Mewtwo on the team unlocks Mewtwo's Mega form for the Key Stone.

## Shiny lottery

Jubilife TV's Lottery Corner becomes a bonus challenge: clear it and you walk away with a random shiny Pokémon, with one reroll.

1. **Entry.** One Lottery ticket per real day (seeded from the date), plus tickets from Conference wins. The level select shows the Jubilife TV tower with a ticket count.
2. **The challenge.** A randomised challenge level on a cleared route: the modifier is drawn from the challenge list (Solo, Monotype, No catching, Level cap, Reverse, Speedrun) and shown on the ticket. Clear it to reach the draw.
3. **The draw.** Three Poké Balls on the Lottery counter wobble; pick one. It opens on a shiny Pokémon drawn from every species in the repo that has shiny sprites (256 of them today), weighted so starters, pseudo-legendaries and fan favourites (Eevee line, Gible line, Lucario, Charizard, Dragonite, Lapras, Snorlax) are three times as likely as the rest. Legendaries are excluded.
4. **The reroll.** The ball you picked is shown with the Pokémon's shiny portrait, level and nature. Keep it, or press Reroll once: the other two balls shake again and a new draw replaces it. The second result is final.
5. **Shiny Charm** holders get a second reroll; the daily ticket is not consumed if you lose the challenge.

The prize arrives at level 20 with its Platinum moveset, in a Premier Ball, with the ticket number as its trainer memo.

## Special Pokémon

| Kind | Art | Where it comes from | Rules in battle |
| --- | --- | --- | --- |
| Shiny | 256 shiny sprite sets, shiny portraits for 236 | Every wild spawn at 1/4096; chains, outbreaks, the Poké Radar, the Shiny Charm and the Lottery raise the odds | Sparkle and sound on spawn; shiny portrait and icon in menus; normal stats |
| Mega | 17 Mega sprites (list below) | Riley's Key Stone at Iron Island; Mega Stones from the Conference and hidden in levels | Once per level, one wave long, the Mega sprite swaps in with a flash |
| Shadow | Shadow Lugia and Shadow Mewtwo have their own sprites; other Shadow Pokémon are the normal sprite with a purple tint and aura | Galactic HQ's Shadow waves and the S.S. Libra | Shadow Rush hits 1.3x; a caught Shadow Pokémon cannot gain EXP until purified by sitting through three cleared levels at a lake guardian level (Lugia needs Spear Pillar) |
| Alpha | Normal sprite at 1.5x with red eye glow | Hisui rifts | +10 levels, boosted stats, drops a Hisuian ball |
| Noble | Kleavor, Hisuian Lilligant, Arcanine, Avalugg | Hisui rift bosses | Calmed with balms, never caught |
| Dynamax (in place of Gigantamax) | Normal sprite at 2.5x with a red aura; the PMD database has no Gigantamax art, so no G-Max forms | Max Raid levels: after the Distortion World a meteor shower leaves wishing-star craters on three routes | Raid boss with three HP bars and a shield that only Dynamaxed towers break; your own Dynamax lasts one wave, once per level, and needs the Dynamax Band from the first raid |

**Mega Stones in the repo** (sprite and item both exist): Lucario, Gallade, Gardevoir, Alakazam, Gengar, Kangaskhan, Aerodactyl, Steelix, Houndoom, Medicham, Altaria, Absol, Glalie, Latios, Lopunny. Mega Skarmory has a sprite but no stone item, so it stays out. Mewtwo's Mega Y is a Shadow Mewtwo reward only.

**Mega Stone placement:** Lucarionite from Riley; Garchompite is not in the database, so Cynthia gives Galladite instead; Abomasite is missing too, so Candice's reward is Glalitite; Aerodactylite in Oreburgh Mine B2 (Rock Smash); Gengarite from Fantina's rematch; Houndoominite on Stark Mountain; Medichamite from Maylene's rematch; Kangaskhanite from Thorton; the rest from Conference wins.

### Shiny hunting

- **Chains:** catching the same species in a row raises odds, capped at 40 for 4x; leaving the level resets it.
- **Poké Radar:** after the Conference, free-play routes get a Radar mode where one grass patch shakes each wave; catching from the shaking patch grows the chain faster.
- **Mass outbreaks:** one route a day (seeded from the date) has an outbreak species at 1/256, shown on the level select.
- **Shiny Charm:** from Cynthia after the first Conference win, 3x.
- **Fixed shinies:** the Rock Climb Absol on Mt. Coronet is always shiny; the red Gyarados surfaces at Lake Valor after the bomb.
- **Legendaries** roll shiny odds too, so a reset before the catch is worth it.

## Secret HM levels

Each HM from a badge reopens an earlier level with a new section, new wild Pokémon and a legendary. The lake guardian at Lake Verity is **Mesprit**; Azelf is at Lake Valor and Uxie at Lake Acuity. Surf comes with the Fen Badge, so the island levels open after Pastoria and the guardians after Spear Pillar.

| Secret level | Gate | What changes | New wild Pokémon | Legendary |
| --- | --- | --- | --- | --- |
| Lake Verity: Island | Surf, after Spear Pillar | The island is placeable; a water path joins the land path and water spots take Water and Flying types | Psyduck, Golduck, Goldeen, Seaking, Gyarados | Mesprit |
| Lake Valor: Island | Surf, after Spear Pillar | The drained lake refills over three waves; the red Gyarados surfaces | Golduck, Gyarados, Wooper, Quagsire | Azelf |
| Lake Acuity: Island | Surf, after Spear Pillar | Ice on the water slows enemies; snow on the shore | Sneasel, Snorunt, Glalie, Psyduck | Uxie |
| Oreburgh Mine B2 | Rock Smash | Smashed walls open a deeper tunnel | Onix, Steelix, Bronzor, Cranidos, Shieldon | Aerodactylite is hidden here (no legendary) |
| Route 210 Fog | Defog | Fog clears wave by wave, revealing hidden spots | Tropius, Ponyta, Rapidash, Meditite | None; a Dragon Scale and an Azure Flute shard |
| Mt. Coronet Peak | Rock Climb | Vertical map, enemies climb toward you | Absol (always shiny), Snover, Chingling, Bronzong | None |
| Turnback Cave | Waterfall, Distortion World cleared | Rooms shuffle every wave; the wrong room sends enemies back to the start | Bronzong, Golbat, Gastly, Dusclops | Giratina, Altered Forme (second chance if it fainted) |
| Snowpoint Temple | Strength, all three Regis | Ice blocks change the path when pushed (between waves) | Snorunt, Sneasel, Glalie, Weavile | Regigigas (weak for the first five waves) |
| Spear Pillar, Origin | Temporal Spire cleared | The altar is placeable; Dialga and Palkia come down the path together | Bronzong, Chingling, Clefable | Dialga and Palkia (Origin Formes; catch both) |
| Hall of Origin | All 18 Azure Flute shards | A single path of light, no wild Pokémon | none | Arceus |

The three Regis are side bosses in cleared levels after the Conference: Regirock in Oreburgh Mine B2, Regice at Lake Acuity's island, Registeel in Iron Island. Azure Flute shards are hidden one per level across the story, so they give a reason to replay every map.

## Title screen

The main menu sits on a living Sinnoh diorama: one scenic map built from the richest BW tiles, with Platinum overworld trainers and PMD Pokémon acting out little scenes that are cast fresh every time the game loads.

### The diorama map

A 30x14 map (`title`, built by the maps session) that shows off every texture we have in one view: a lake with reeds and an island on the left, a flower meadow and the forest edge in the middle with a dirt route winding through tall grass, a cliff plateau with grey rocks on the right, a strip of beach sand along the bottom shore, and a snowy ledge in the top right corner. The camera drifts slowly across it (a 60-second pan and back) so the whole thing never sits still. A real-clock tint: dawn gold before 8, plain day, dusk orange after 17, night blue after 20 with lantern glow on the route posts. One weather effect per load, drawn from none, drifting petals, light rain, snow on the ledge only.

The menu lives in a Platinum frame at the bottom left (New game, Continue, PC, Options, Credits), the game's own title in Power Clear Bold at the top with a drop shadow, and the version in the corner. Nothing in the menu blocks the scenes.

### Scenes, cast on load

Each scene is a small script with named roles; the cast is drawn at random from the sprite index (every Pokémon in the repo, weighted 3x toward final evolutions and legendaries so the picks look cool) and from the 148 overworld trainer sheets. Five scenes play at once at fixed stages on the map, and every 90 seconds one of them ends and re-casts.

| Scene | Stage | What happens |
| --- | --- | --- |
| The spar | meadow | Two Pokémon face each other and trade Attack and Hurt animations with a white hit flash; after six exchanges one faints, walks off as a ghost, and a new challenger walks in from the forest. 1 in 10 casts is shiny, with the sparkle. |
| The chase | the route loop | A trainer (Youngster, Bug Catcher, Galactic Grunt, Barry, Hiker...) runs the route loop with three angry Pokémon after them (Zubat swarm, Ursaring, Machamp, Hisuian Arcanine, Gyarados along the shore). Every few laps the roles flip: the trainer chases a Bidoof with a stolen hat, or a Snorlax lumbers after a Grunt at half speed. |
| The fishing trip | beach | A Fisherman casts; Magikarp and Goldeen hop out of the water; once a minute a Gyarados surfaces behind him and he runs for it (hand-off to the chase). |
| The picnic | lake shore | Dawn and Lucas with a starter each idling, a Pachirisu or Buneary circling them; Professor Rowan arrives, looks at the lake, leaves. |
| Galactic business | cliff plateau | Two grunts sneak along the cliff with a Bronzor; Looker follows at a distance; a Commander appears, they all run off the edge of the screen. |
| The flyover | sky lane | Every 30 to 60 s one legendary crosses the sky as a large sprite with a drifting shadow: Shaymin Sky, Latios, Cresselia, Darkrai, Giratina Origin, Lugia, Zapdos. |
| The rift | top right ledge | A purple tear opens, a Hisuian Zorua or Growlithe hops out, looks both ways, and runs into the forest; the tear closes. |

### Rules

- The scenes use the five animations every sprite has (Idle, Walk, Attack, Hurt, Faint) and the eight walking directions, nothing else, so any Pokémon in the repo can be cast.
- Overworld trainer sheets are 32x32 frames in one column: faces up, down, left, right, then the walking pairs; the scene code reads `public/assets/trainers/index.json` for which sheets exist.
- Sprites that do not finish loading in two seconds are skipped, never waited for; the menu is usable at once.
- The title scene is the first thing a player sees, so it is also the showcase: the picks lean on what is new (Hisuian forms, Megas, the Shadow pair) a quarter of the time.

## Polish list

Everything below has its art in the repo already (Platinum pieces converted by `scripts/build-platinum.py`).

- **VS intro** before every gym leader, Elite-tier Conference opponent and Cyrus: mugshot slides in, VS mark, class banner, then the dialogue box.
- **Location banner** at the start of each level (the Platinum map popup for route, city, cave, forest, lake or water) with the level name.
- **Level select on the real Sinnoh map**: the Platinum town map at 3x, markers for levels, locked ones greyed, rifts as purple tears, the Lottery as the Jubilife TV tower, the Conference as Lily of the Valley island.
- **Trainer card** with the eight badges lit as earned, the Conference trophy, money, play time, Pokédex count, and the player's overworld sprite (Lucas or Dawn, chosen at the start).
- **Type and category icons** from Platinum on every move row and in the Pokédex.
- **Shiny portraits and icons** everywhere a shiny is shown.
- **Badge perks**: each badge adds one to the party strip's placement limit for new players (demo mode keeps six), so a first run grows from two placements to six by the Fen Badge.
- **Wave banner** that names the trainer or the twist in play (Gust, High tide, Gravity shift) in a Platinum frame.
- **Boss HP bar** with the boss's icon and phase ticks; legendary bosses show a Poké Ball icon when they drop under 10%.
- **Caught banner** with the Platinum Poké Ball shake and the party or box destination.
- **Pokédex screen**: seen, caught, shiny counts, type icons, the areas a species appears in, the PMD portrait.
- **Result screen**: stars (lives kept, waves cleared, catches), money, EXP summary, a "Next level" button.
- **Settings**: zoom, game speed, text speed, sound (when audio lands), colourblind type colours.
- **Save slots**: three slots plus the export code; autosave after each level.
- **Keyboard and touch**: number keys pick party slots, Space pauses, 1 2 4 set speed; touch drag places Pokémon.
- **Credits screen** reading `credits.json` (sprite artists), the tileset artists, the font, the Platinum rips, with scrolling.
- **Audio** is the one thing with no assets yet: no music or sound effects are in the repo and none of the sources we use provide them, so sound stays a later task with its own sourcing decision.

## Build order

The maps session (this chat) builds every new map; the main session builds the code and data. The order below keeps each batch playable on its own.

1. **Foundations:** zoom, Speed-driven attack rate, shiny art, Platinum pieces (VS intro, banners, badges, type icons, map level select), form support in the data (species ids for `growlithe-hisui` and the rest, extra Pokémon data pulled from PokeAPI for Gen 5+ forms and species 899 to 904).
2. **Gyms 2 to 8** on their arena maps, with the gym trainer waves and the eight rules; badge perks.
3. **Title screen** diorama and scenes.
4. **Story set pieces:** Valley Windworks, Eterna Forest escort, Old Chateau, Lake Valor timer, Iron Island tag battle, Galactic HQ Shadow waves.
5. **Finale:** Spear Pillar and the Distortion World, Giratina catch rule.
6. **Conference:** bracket, roster, field roulette, locker room, simulated results, rewards.
7. **Hisui rifts:** Legends rules, Alphas, Nobles, distortions, Temporal Spire.
8. **Events and lottery:** Shaymin, Cresselia, Darkrai, S.S. Libra, Shadow Mewtwo; the Lottery Corner with the reroll.
9. **Secret HM levels, Max Raids, Regis, Arceus.**

**Maps already in the repo** (commit 58bd92e): the seven gym arenas (`eterna-gym` to `sunyshore-gym`), `spear-pillar`, `distortion-world`, the four stadium floors, the four Hisui rifts and the `title` diorama with its stage points. Still to build: Valley Windworks, Eterna Forest, Old Chateau, Lake Valor, Iron Island, Galactic HQ, the lake islands, Flower Paradise, the two moon islands and the S.S. Libra.

- [ ] Approve or change the level and tournament designs
- [ ] Decide whether badge perks apply to demo saves
- [ ] Pick anime trainer art for Ash, Paul and Tobias

## Asset check

What the repo holds after tonight's commit, and the gaps this design works around.

| Asset | In the repo | Source | Gap |
| --- | --- | --- | --- |
| Pokémon sprites | 283 folders: every species in this doc, 16 Hisuian forms, 17 Megas, Shadow Mewtwo and Lugia, Giratina, Dialga and Palkia Origin, Primal Dialga, Shaymin Sky; 256 with shiny sheets; trimmed to the five animations the game uses | PMDCollab SpriteCollab (`scripts/fetch-sprites.py`, `scripts/sprite-list.txt`) | No Gigantamax art exists in the database (Dynamax scale-up instead); no Mega Garchomp, Abomasnow, Gyarados or Scizor; Unown not drawn |
| Portraits | 283 folders, 236 with shiny portraits | SpriteCollab | - |
| Box icons | every species and form (Hisuian forms and 899 to 904 use the PMD portrait scaled down) | PokeAPI Gen 5 and Gen 8 icons, `scripts/make-fallback-icons.py` | No shiny icons anywhere; shiny icons come from the shiny portrait |
| Trainers | 107 Platinum battle sprites in two poses (all eight leaders, Elite Four, Cynthia, Cyrus, the three commanders, grunts, Barry, Lucas, Dawn, Riley, Cheryl, Mira, Marley, Buck, the five Frontier Brains, every generic class); 20 VS mugshots; 148 overworld sheets | pret/pokeplatinum decomp (`scripts/fetch-platinum.sh`, `scripts/build-platinum.py`) | Ash, Paul, Tobias, Conway, Nando, Zoey, Jessie and James, Hunter J have no sprites: silhouettes until ripped |
| Badges | all eight, lit and greyed | decomp | - |
| UI | type and category icons, location popups, 20 message frames, the Sinnoh town map and its markers, plus the earlier Platinum sheets (battle GUI, bag, box wallpapers, start menu icons) and the Power Clear fonts | decomp and The Spriters Resource | The Box System sheet for the PC frame is still a placeholder |
| Items | 102: all balls incl. the five Hisuian ones, potions, stones, 15 Mega Stones, Key Stone, TMs by type, Gracidea, Lunar Wing, Member Card, Oak's Letter, Azure Flute, Griseous, Adamant and Lustrous Orbs, Red Chain, Shiny Charm, Poké Radar, Looker Ticket, Lottery ticket (coupon) | PokeAPI items (`scripts/fetch-items.sh`) | No balm or wishing-star art; balms ride in Feather Balls, wishing stars are drawn as craters on the map |
| Tiles | BW outdoor set (grass, tall grass, flowers, trees, cliffs, rocks, water edges, sand, snow, dirt path), Kyle-Dove set for caves | Aki's compilation, see `public/assets/tilesets/CREDITS.txt` | No cave tileset of its own, no interior tiles, no stadium or steel-floor tiles: gym arenas are outdoor yards, the Conference floor is a flat colour with the field's texture, the Distortion World is black with stone platforms |
| Audio | nothing | - | Needs a sourcing decision |
