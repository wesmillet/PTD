/**
 * Natural-looking markers for the tiles where Pokémon can be placed: a small
 * worn patch of earth in grass maps, a flat stone in caves. Drawn as a crisp
 * pixel-art texture (generated once per theme) so it sits in the tileset's
 * style instead of looking like UI.
 */
import Phaser from 'phaser';

interface Palette {
  rim: string;
  fill: string;
  light: string;
  speck: string;
}

const PALETTES: Record<string, Palette> = {
  grass: { rim: '#5f8a3a', fill: '#cdb47e', light: '#e2cf9f', speck: '#a88f5c' },
  cave: { rim: '#4a3f36', fill: '#8f8272', light: '#a99c8a', speck: '#6f6455' },
};

/** Texture key for the spot marker of a map theme, creating it on first use. */
export function spotTexture(scene: Phaser.Scene, theme: string): string {
  const pal = PALETTES[theme] ?? PALETTES.grass!;
  const key = `spot-marker-${theme in PALETTES ? theme : 'grass'}`;
  if (scene.textures.exists(key)) return key;
  const size = 32;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  // A flattened ellipse in the lower part of the tile, pixel by pixel.
  const cx = 15.5;
  const cy = 20.5;
  const rx = 12.5;
  const ry = 7.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      let color = pal.fill;
      if (d > 0.72) color = pal.rim;
      else if (d < 0.3 && y < cy) color = pal.light;
      else if ((x * 7 + y * 13) % 17 === 0) color = pal.speck;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
  return key;
}

/** Centre of the marker ellipse inside a tile, for highlight drawing. */
export const SPOT_ELLIPSE = { dx: 0, dy: 5, w: 26, h: 16 } as const;
