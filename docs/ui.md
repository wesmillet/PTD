# UI guide

Dark is the only theme. Everything on screen is either Phaser canvas (map,
sprites, HUD) or a DOM overlay (panels and dialogs), and both read the same
palette: `src/ui/theme.css` defines it as CSS variables and
`src/ui/styles.ts` mirrors the values for Phaser text and graphics.

## Fonts
- **Pixelify Sans** (`public/assets/fonts/PixelifySans.ttf`, SIL Open Font
  License, licence file beside it): headings, labels, buttons, badges and
  all HUD text. CSS variable `--ptd-font-pixel`; Phaser `FONT`.
- **System sans-serif** (`--ptd-font-body`): long text in panels, so it stays
  legible at phone width.
- The font is loaded by `@font-face` in theme.css; `main.ts` waits for
  `document.fonts.load` before starting Phaser so canvas text renders in it.

## Palette (CSS variables)
| Variable | Use |
| --- | --- |
| `--ptd-bg` | page background, portrait backgrounds |
| `--ptd-panel`, `--ptd-panel-2` | panel surface, nested cards and buttons |
| `--ptd-border`, `--ptd-border-outer` | PMD-style double frame: light inner border, dark outer ring |
| `--ptd-text`, `--ptd-text-dim`, `--ptd-text-faint` | cream text and two dimmer steps |
| `--ptd-accent` | selection, active move, headings inside panels |
| `--ptd-good`, `--ptd-bad`, `--ptd-info` | positive, negative, informational text |
| `--ptd-hp`, `--ptd-hp-low`, `--ptd-hp-critical`, `--ptd-hp-back`, `--ptd-exp`, `--ptd-bar-back` | bars |
| `--type-<name>` | the 17 type colours (normal, fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water, grass, electric, psychic, ice, dragon, dark) |
| `--ptd-radius`, `--ptd-radius-sm`, `--ptd-pad` | shape and spacing |

## Components (DOM)
- `.ptd-panel` base frame; `.ptd-side` docks top-right (bottom sheet under
  600 px); `.ptd-modal` centres. Always call `isolateFromGame(root)` so
  clicks never fall through to the canvas.
- `h2` panel title (pixel font); `.ptd-heading` section heading (accent).
- `.ptd-head` portrait + text row; `.ptd-portrait` (80 px) and
  `.ptd-portrait.small` (40 px); use `portraitImage(url)` from
  `domOverlay.ts` wherever a Pokémon is named.
- `.ptd-bar.hp` / `.ptd-bar.exp` with an inner `div` whose width is the
  percentage; `.low` / `.critical` modifiers on HP.
- `.ptd-moves` list of `.ptd-move` rows (`.active` for the selected one),
  each with `.ptd-name`, a `typeBadge(name)` (`.ptd-type`) and `.ptd-meta`.
- `.ptd-actions` button row; `button.ptd-close` top-right close.
- `.ptd-status` chips; `.ptd-grid` + `.ptd-card` for the Pokédex.

## Components (canvas)
- `Button` (`src/ui/button.ts`): rounded frame with the double border.
- `Hud` (`src/ui/hud.ts`): top bar (level name, wave, lives, money, speed,
  Start / Leave) and bottom bar (party strip, ball bar). The map sits
  between them; nothing overlaps the playfield.
- Floating text uses `TEXT` with a dark stroke.

## Screens
Title (`TitleScene`) → Level select (`LevelSelectScene`, with Party / PC,
Shop, Pokédex, Save, Credits overlays) → Level (`LevelScene`, with the
Pokémon panel, replace dialog, evolution prompt and summary).
