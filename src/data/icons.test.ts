/**
 * Box icons: shiny Pokémon share the normal icon (the sparkle badge marks
 * them); the shiny art is the portrait and the sprite. Every folder has a
 * normal icon to share.
 */
import { describe, expect, it } from 'vitest';
import spriteFolders from './spriteFolders.json';
import { findPokemonId } from './pokedata';
import { hasShinyPortrait, iconTextureKey, iconUrl, portraitUrl } from '../game/runtime';

const folders = spriteFolders as Record<string, { icon?: boolean }>;

describe('box icons', () => {
  it('every sprite folder has a box icon', () => {
    for (const [folder, info] of Object.entries(folders)) expect(info.icon, `${folder} needs an icon`).toBe(true);
  });

  it('shiny Pokémon use the normal icon and keep the shiny portrait', () => {
    const growlithe = findPokemonId('growlithe-hisui')!;
    expect(iconTextureKey(growlithe, 0, true)).toBe(iconTextureKey(growlithe, 0, false));
    expect(iconUrl(growlithe, true, true)).toBe(iconUrl(growlithe, true, false));
    expect(iconUrl(growlithe, true, true)).toContain('icons/58-hisui');
    expect(hasShinyPortrait(growlithe)).toBe(true);
    expect(portraitUrl(growlithe, 'Normal', true)).toContain('portraits/0058-hisui/shiny/Normal.png');
    const starly = findPokemonId('starly')!;
    expect(iconTextureKey(starly, 1, true)).toBe('icon-396-1');
  });
});
