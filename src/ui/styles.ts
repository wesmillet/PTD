/**
 * Canvas-side mirror of theme.css (Phaser text cannot read CSS variables).
 * Power Clear (DS-era Pokémon font, Pokémon Essentials) renders on a 13 px
 * grid: 13 px is the DS size, 26 px its 2x. Only those two sizes are used
 * so glyphs stay on whole pixels. Text is dark grey with a light shadow one
 * pixel down and right on light panels, white with a dark shadow elsewhere.
 */
export const FONT = '"Power Clear", monospace';
export const FONT_BOLD = '"Power Clear Bold", "Power Clear", monospace';
export const SIZE_SMALL = 13;
export const SIZE_LARGE = 26;

const SHADOW_LIGHT = { offsetX: 1, offsetY: 1, color: '#d0d0c8', blur: 0, stroke: false, fill: true } as const;
const SHADOW_DARK = { offsetX: 1, offsetY: 1, color: '#283028', blur: 0, stroke: false, fill: true } as const;

export const TEXT = { fontFamily: FONT, fontSize: '13px', color: '#484848', shadow: SHADOW_LIGHT, resolution: 1 } as const;
export const TEXT_DIM = { fontFamily: FONT, fontSize: '13px', color: '#707878', shadow: SHADOW_LIGHT, resolution: 1 } as const;
export const TEXT_BIG = { fontFamily: FONT_BOLD, fontSize: '26px', color: '#484848', shadow: SHADOW_LIGHT, resolution: 1 } as const;
export const TEXT_TITLE = { fontFamily: FONT_BOLD, fontSize: '26px', color: '#f8f8f8', shadow: SHADOW_DARK, resolution: 1 } as const;
/** Light text with a dark shadow, for labels over the map or dark boxes. */
export const TEXT_LIGHT = { fontFamily: FONT, fontSize: '13px', color: '#f8f8f8', shadow: SHADOW_DARK, resolution: 1 } as const;
export const TEXT_LIGHT_BIG = { fontFamily: FONT_BOLD, fontSize: '26px', color: '#f8f8f8', shadow: SHADOW_DARK, resolution: 1 } as const;

export const COLORS = {
  bg: 0xc0ccdc,
  hudBg: 0xf8f8f8,
  panel: 0xf8f8f8,
  panel2: 0xe8f0f8,
  panelBorder: 0x68b0f8,
  borderOuter: 0x283028,
  button: 0xf8f8f8,
  buttonHover: 0xd0e4f8,
  buttonDisabled: 0xe0e4e8,
  text: 0x484848,
  hpBack: 0xf8f8f8,
  hpFrame: 0x000000,
  hpFront: 0x18c320,
  hpLow: 0xebaa00,
  hpCritical: 0xfb4110,
  exp: 0x4888e8,
  grass: 0x3f7a3a,
  grassAlt: 0x447f3f,
  cave: 0x4a3f38,
  caveAlt: 0x51463f,
  pathGrass: 0xb59a63,
  pathCave: 0x7d6a5a,
  placeable: 0x6fa8dc,
  placeableHover: 0x9ccbee,
  blockedGrass: 0x2d5a2a,
  blockedCave: 0x2e2622,
  selected: 0xf05830,
  range: 0xffffff,
} as const;

/** Texture key of a cut Platinum frame (public/assets/ui/gen4/frames/<name>.png). */
export function frameKey(name: string): string {
  return `ui-frame-${name}`;
}
