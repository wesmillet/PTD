/** Canvas-side mirror of theme.css (Phaser text cannot read CSS variables). Platinum palette. */
export const FONT = '"Pixelify Sans", "Courier New", monospace';
export const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const TEXT = { fontFamily: FONT, fontSize: '15px', color: '#404848' } as const;
export const TEXT_DIM = { fontFamily: FONT, fontSize: '13px', color: '#687078' } as const;
export const TEXT_BIG = { fontFamily: FONT, fontSize: '24px', color: '#404848', fontStyle: 'bold' } as const;
export const TEXT_TITLE = { fontFamily: FONT, fontSize: '48px', color: '#f8f8f8', fontStyle: 'bold', stroke: '#283028', strokeThickness: 6 } as const;
/** Light text with a dark outline, for labels drawn over the map or dark boxes. */
export const TEXT_LIGHT = { fontFamily: FONT, fontSize: '15px', color: '#f8f8f8', stroke: '#283028', strokeThickness: 3 } as const;

/** Bitmap fonts cut from the Platinum battle GUI (registered in BootScene). */
export const FONT_NAME = 'gen4-name';
export const FONT_NUM = 'gen4-num';

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
  text: 0x404848,
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
