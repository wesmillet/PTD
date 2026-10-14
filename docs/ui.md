# UI guide

The theme is Pokémon Platinum: light panels, dark text, the blue-edged
text-box frame around every panel, and the battle GUI's bars, badges and
fonts. Everything on screen is either Phaser canvas (map, sprites, HUD) or a
DOM overlay (panels and dialogs), and both read the same palette:
`src/ui/theme.css` defines it as CSS variables and `src/ui/styles.ts`
mirrors the values for Phaser text and graphics.

## Platinum sheets
`assets-src/ui/gen4/` holds the ripped Platinum interface sheets (credits in
`CREDITS.txt`, shown on the credits screen). `scripts/build-gen4-ui.mjs`
keys out their solid backgrounds and cuts them into
`public/assets/ui/gen4/` with the measurements in `src/data/ui-gen4.json`:
- `frames/<name>.png`: the 20 text-box frames as 9-slices (`blue` is the
  default; `green` for trainer cards, `red-dots` for gym bosses, `green`
  for a won summary). Canvas: `framePanel(scene, x, y, w, h, name)` in
  `button.ts`; DOM: `.ptd-panel` uses `blue` as a CSS `border-image`.
- `hpbox-enemy.png`, `hpbox-player.png`, `hpbox-player-exp.png`: the HP
  boxes, with the HP and EXP fill rectangles and the Lv label position.
  DOM: `hpBox(mon)` / `updateHpBox` in `domOverlay.ts` (Pokémon panel, PC
  summary); canvas: the boss bar in `Hud.setBoss`.
- `status-psn/par/slp/brn/frz.png`: status badges (`statusBadge(ailment)`
  in the DOM, `ui-status-<name>` textures beside bars on the map).
- `font-name.png`, `font-numbers.png`: the name font and the Lv / HP number
  glyphs packed into fixed cells; BootScene registers them as the bitmap
  fonts `FONT_NAME` and `FONT_NUM` (Lv labels on placed Pokémon, the boss
  box). Pixelify Sans stays for all other text.
- `button-<pocket>-<state>.png` (round bag buttons), `pocket-icons.png`,
  `pocket-cursor.png`, `pocket-panel.png`, `pokeball-big.png`: shop pocket
  tabs, the bag strip on level select, the title screen.
- `menu-<name>.png` / `-off.png`: start-menu icons (`Button`'s `iconKey`).
- `wallpapers/gen4-NN.png`: the 33 PC box wallpapers listed in `pc.json`.
  The PC frame and cursor stay placeholders until a Box System sheet is
  added.

The Platinum trainer art, badges, type icons, popups and town map come
ready-cut from `scripts/build-platinum.py` (pret/pokeplatinum; credits in
`public/assets/trainers/CREDITS.txt`):
- `trainers/<id>.png`, `<id>-pose.png`: `trainerTextureKey(id, pose)`;
  the dialogue box shows the standing pose, `LevelScene.showTrainerOnField`
  the throwing pose beside the entrance during the trainer's wave.
- `trainers/mugshots/`, `trainers/banners/`, `trainers/vs.png`:
  `mugshotTextureKey` / `bannerTextureKey` / the `ui-vs` sheet, used by
  `VsIntro` (`src/ui/vsIntro.ts`).
- `badges/<id>.png`, `<id>-off.png`: `badgeTextureKey(id, lit)`; the list is
  `src/data/badges.json` through `allBadges()`.
- `ui/gen4/types/<name>.png`: `typeIcon(name)` in `domOverlay.ts` (DOM
  `<img class="ptd-type-icon">`, 32x16) and `typeIconTextureKey` on canvas.
- `ui/gen4/popups/<kind>.png`: `showLocationPopup(scene, kind, name, top)`
  (`src/ui/locationPopup.ts`), drawn at 2x with the name in Power Clear Bold.
- `ui/gen4/sinnoh-map.png`, `map-markers.png` (16x16 frames: 0 dot, 1 tall
  marker, 2 town square, 3 and 4 corners, 5 bar, 6 ring) and
  `trainers/overworld/player_m.png` (`ow-player`, 32x32 frames, four per
  facing in the order up, down, left, right): `LevelSelectScene`.

## Fonts
- **Power Clear** and **Power Clear Bold** (`public/assets/fonts/`, from
  Pokémon Essentials, CC BY-NC-SA 4.0, credits in `CREDITS.txt` and on the
  credits screen): the DS-era Pokémon fonts, used for everything in the DOM
  and on the canvas. `--ptd-font-body` / `FONT` is the regular (body text
  and numbers), `--ptd-font-pixel` / `FONT_BOLD` the bold (titles,
  headings, buttons).
- Sizes: the font's grid is 13 px, so only `--ptd-size` 13 px and
  `--ptd-size-big` 26 px are used (`SIZE_SMALL` / `SIZE_LARGE` in
  styles.ts). No smoothing (`-webkit-font-smoothing: none; font-smooth:
  never`), Phaser text at resolution 1.
- Colours: `--ptd-text` #484848 with `--ptd-shadow-light` (1px 1px #d0d0c8)
  on light panels; white with `--ptd-shadow-dark` (#283028) on dark
  backgrounds (`TEXT_LIGHT`, `TEXT_TITLE`).
- `$` is the Pokédollar sign in this font; money is written `$1000`.
- `main.ts` waits for both faces before starting Phaser.

## Palette (CSS variables)
| Variable | Use |
| --- | --- |
| `--ptd-bg` | page background (Platinum menu blue-grey with diagonal stripes) |
| `--ptd-panel`, `--ptd-panel-2` | white panel surface, light blue cards and rows |
| `--ptd-border`, `--ptd-border-outer` | the frame's blue and its dark outline |
| `--ptd-text`, `--ptd-text-dim`, `--ptd-text-faint` | dark grey text and two lighter steps |
| `--ptd-accent` | selection cursor red, active move |
| `--ptd-frame`, `--ptd-frame-slice`, `--ptd-frame-width` | the 9-slice border image used by every `.ptd-panel` |
| `--ptd-good`, `--ptd-bad`, `--ptd-info` | positive, negative, informational text |
| `--ptd-hp`, `--ptd-hp-low`, `--ptd-hp-critical`, `--ptd-hp-back`, `--ptd-exp`, `--ptd-bar-back` | bars |
| `--type-<name>` | the 17 type colours (normal, fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water, grass, electric, psychic, ice, dragon, dark) |
| `--ptd-radius`, `--ptd-radius-sm`, `--ptd-pad` | shape and spacing |

## Components (DOM)
- `.ptd-panel` base frame (Platinum text box as a border image);
  `.ptd-side` docks top-right (bottom sheet under 600 px); `.ptd-modal`
  centres. Always call `isolateFromGame(root)` so clicks never fall through
  to the canvas.
- `.ptd-hpbox` battle-GUI HP box at 2x (`hpBox(mon)`), `img.ptd-status-badge`.
- `.ptd-sum-head`, `.ptd-sum-info`, `.ptd-sum-types`: the summary-page
  layout of the Pokémon panel.
- `button.ptd-pocket` round bag button (shop pocket tabs).
- `h2` panel title (pixel font); `.ptd-heading` section heading (accent).
- `.ptd-head` portrait + text row; `.ptd-portrait` (80 px) and
  `.ptd-portrait.small` (40 px); use `portraitImage(url)` from
  `domOverlay.ts` wherever a Pokémon is named.
- `.ptd-bar.hp` / `.ptd-bar.exp` with an inner `div` whose width is the
  percentage; `.low` / `.critical` modifiers on HP.
- `.ptd-moves` list of `.ptd-move` rows (`.active` for the selected one),
  each with `.ptd-name`, a `typeBadge(name)` (`.ptd-type`) and `.ptd-meta`.
- `.ptd-actions` button row; `button.ptd-close` top-right close.
- `.ptd-icon` 32 px box icon (`iconImage(url)`), used wherever a Pokémon
  appears small; `.ptd-item` 24 px item sprite (`itemUrl(sprite)`);
  `.ptd-status` chips; `.ptd-grid` + `.ptd-card` for grids.

## Components (canvas)
- `Button` (`src/ui/button.ts`): the blue frame as a NineSlice with an
  optional start-menu icon on the left; `framePanel()` for any panel.
- `Hud` (`src/ui/hud.ts`): top bar (level name, wave, lives, money, speed
  1x/2x/4x, Start / Leave, boss HP bar via `setBoss`) and bottom bar (party
  strip, ball bar with the item sprites; `ballOrigin(id)` is where a thrown
  ball starts). The map sits between them; nothing overlaps the playfield.
- Dialogue box (`src/ui/dialogue.ts`): the bottom text box, typewriter
  text, click or Enter to advance; trainer intros with portrait and party
  icons.
- Start menu (`src/ui/startMenu.ts`, Menu button or Esc): Platinum's menu
  column with the start-menu icons and a red cursor; its pages are DOM
  panels in `src/ui/menuPages.ts` (Pokédex, Pokémon, Bag, Trainer Card,
  Options) plus `SavePanel`.
- Floating text uses `TEXT` with a dark stroke.
- Skinnable images, all named in config so a skin is a file swap:
  `assets/pc/frame.png` (9-slice box frame), `assets/pc/cursor.png`,
  `assets/pc/wallpapers/*.png` (`src/data/pc.json`), `assets/trainers/<id>.png`
  and `assets/badges/<id>.png` / `<id>-off.png` (level ids in `levels.json`).
  `scripts/build-placeholders.mjs` regenerates the plain placeholders.

## Content-build components
- `WaveBanner` (`waveBanner.ts`): the wave/trainer/rule frame under the top bar.
- `showCaughtBanner` (`caughtBanner.ts`): the "Gotcha!" frame above the party strip.
- `showLocationPopup`, `VsIntro` (see above), `Diorama` (`diorama.ts`, the title scenes).
- `ConferenceScreen` (`conferenceScreen.ts`): bracket board, roulette, locker room, entry.
- `LotteryScreen` (`lotteryScreen.ts`): tickets, the three-ball draw, the reroll.
- `MenuPages.pokedex`: the Pokédex list with portraits, type icons and areas.
- `SavePanel` slot picker (`slots`, `activeSlot`, `switchSlot` hooks).
- `summaryStars` in `summary.ts`; the summary's Next level button.

## Screens
Title (`TitleScene`, with the badge case) → Level select
(`LevelSelectScene`: the town map at 3x with a marker per level, the
player sprite as the cursor, the bag and badge case in the left column, the
PC, Shop, Save, Credits and Demo buttons in the right column) → PC (`PCScene`, full screen: party column, box grid,
`PcSummary` side panel) or Level (`LevelScene`, with the location popup, Pokémon panel,
replace dialog, evolution prompt, VS intro and trainer dialogue, boss bar
and summary). Zoom (Options, `+`/`-`) lives in `src/game/zoom.ts`: Fit is
Phaser's FIT mode, a fixed zoom is NONE mode with that zoom factor and the
page scrolls (`html.ptd-zoomed` in index.html).
