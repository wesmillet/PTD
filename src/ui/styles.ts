export const FONT = 'monospace';

export const TEXT = { fontFamily: FONT, fontSize: '14px', color: '#e8e8f0' } as const;
export const TEXT_DIM = { fontFamily: FONT, fontSize: '12px', color: '#9a9ab0' } as const;
export const TEXT_BIG = { fontFamily: FONT, fontSize: '22px', color: '#ffffff' } as const;

export const COLORS = {
  hudBg: 0x14141c,
  panel: 0x202030,
  panelBorder: 0x5a5a80,
  button: 0x3a3a5a,
  buttonHover: 0x50507a,
  buttonDisabled: 0x2a2a38,
  hpBack: 0x401818,
  hpFront: 0x5ad35a,
  hpLow: 0xd3b05a,
  hpCritical: 0xd35a5a,
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
