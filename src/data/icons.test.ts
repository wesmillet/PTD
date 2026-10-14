/**
 * Shiny icons: every sprite folder with shiny sheets has a shiny box icon,
 * either cut from its shiny Normal portrait at boot or shipped as
 * icons/<name>-shiny.png (scripts/make-shiny-icons.py), and the runtime
 * resolves forms to them.
 */
import { describe, expect, it } from 'vitest';
import spriteFolders from './spriteFolders.json';
import { findPokemonId } from './pokedata';
import { folderIconName, hasShinyIcon, hasShinyPortrait, iconTextureKey, iconUrl } from '../game/runtime';

const folders = spriteFolders as Record<string, { shiny: boolean; shinyPortraits?: string[]; shinyIcon?: boolean }>;
const shipped = new Set(Object.keys(import.meta.glob('../../public/assets/icons/*-shiny.png')).map((p) => p.replace(/^.*\//, '')));

describe('shiny icons', () => {
  it('covers every folder with shiny sheets, forms included', () => {
    for (const [folder, info] of Object.entries(folders)) {
      if (!info.shiny) continue;
      const fromPortrait = info.shinyPortraits?.includes('Normal') ?? false;
      const file = `${folderIconName(folder)}-shiny.png`;
      if (!fromPortrait) expect(info.shinyIcon, `${folder} needs a shiny icon`).toBe(true);
      if (info.shinyIcon) expect(shipped.has(file), file).toBe(true);
    }
  });

  it('resolves shiny forms and the shipped shiny icon files', () => {
    const growlithe = findPokemonId('growlithe-hisui')!;
    expect(hasShinyPortrait(growlithe)).toBe(true);
    expect(iconTextureKey(growlithe, 0, true)).toBe('icon-58-hisui-shiny');
    expect(iconUrl(growlithe, true, true)).toContain('portraits/0058-hisui/shiny/Normal.png');
    const megaKangaskhan = findPokemonId('kangaskhan-mega')!;
    expect(hasShinyPortrait(megaKangaskhan)).toBe(false);
    expect(hasShinyIcon(megaKangaskhan)).toBe(true);
    expect(iconTextureKey(megaKangaskhan, 0, true)).toBe('icon-115-mega-shiny');
    expect(iconUrl(megaKangaskhan, true, true)).toContain('icons/115-mega-shiny.png');
    expect(iconTextureKey(megaKangaskhan, 0, false)).toBe('icon-115-mega');
  });
});
