/** Canvas-side mirror of theme.css (Phaser text cannot read CSS variables). */
export const FONT = '"Pixelify Sans", "Courier New", monospace';
export const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const TEXT = { fontFamily: FONT, fontSize: '15px', color: '#f4ecd8' } as const;
export const TEXT_DIM = { fontFamily: FONT, fontSize: '13px', color: '#b3b0c9' } as const;
export const TEXT_BIG = { fontFamily: FONT, fontSize: '24px', color: '#f4ecd8', fontStyle: 'bold' } as const;
export const TEXT_TITLE = { fontFamily: FONT, fontSize: '48px', color: '#f4ecd8', fontStyle: 'bold', stroke: '#2c335c', strokeThickness: 6 } as const;

export const COLORS = {
  bg: 0x10121f,
  hudBg: 0x1b1f36,
  panel: 0x1b1f36,
  panel2: 0x232849,
  panelBorder: 0x6f7fcf,
  borderOuter: 0x2c335c,
  button: 0x232849,
  buttonHover: 0x2d3360,
  buttonDisabled: 0x1b1f36,
  text: 0xf4ecd8,
  hpBack: 0x3a1d26,
  hpFront: 0x5ad35a,
  hpLow: 0xd3b05a,
  hpCritical: 0xd35a5a,
  exp: 0x6fa8dc,
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
  selected: 0xffe066,
  range: 0xffffff,
} as const;
