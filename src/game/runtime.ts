/**
 * Process-wide runtime settings shared by scenes and the debug panel:
 * a mutable copy of config.json that the simulation reads every step.
 */
import { defaultRuntimeConfig, type RuntimeConfig } from '../sim/level';
import pokemonJson from '../data/pokemon.json';
import spriteFolders from '../data/spriteFolders.json';

export const runtimeConfig: RuntimeConfig = defaultRuntimeConfig();

/** `?shiny=1` forces every spawn shiny (debugging the visual). */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shiny') === '1') {
  runtimeConfig.shinyRate = 1;
}

/** Game speed multiplier: extra fixed steps per frame (1x, 2x, 4x; see config.gameSpeeds). */
export const runtime = {
  gameSpeed: 1,
  /** Canvas zoom: 'fit' or a fixed factor (see game/zoom.ts). */
  zoom: 'fit' as 'fit' | 1 | 1.5 | 2,
  /** Level the debug panel sets for the player's Turtwig (party member 0). */
  partyLevelOverride: undefined as number | undefined,
};

export function urlParam(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}


/** Sprite folder for a species id: zero-padded dex number, or the form's folder ("0058-hisui"). */
export function dexFolder(species: number): string {
  const folder = (pokemonJson as Record<string, { folder?: string }>)[String(species)]?.folder;
  return folder ?? String(species).padStart(4, '0');
}

/**
 * Splits a sprite folder name ("0058" or "0058-hisui") into its species and
 * optional form, as scripts/sprite-list.txt and spriteFolders.json name them.
 */
export function parseFolder(folder: string): { species: number; form?: string } {
  const [dex, form] = folder.split('-', 2);
  const species = Number(dex);
  return form ? { species, form } : { species };
}

/** Icon file stem for a sprite folder: "58" or "58-hisui" (see scripts/make-fallback-icons.py). */
export function folderIconName(folder: string): string {
  const { species, form } = parseFolder(folder);
  return form ? `${species}-${form}` : String(species);
}

/** Sprite folder key for a monster: the shiny subfolder when loaded, else the base. */
export function spriteFolder(species: number, shiny: boolean): string {
  const dex = dexFolder(species);
  const info = (spriteFolders as Record<string, { shiny: boolean; portraits: string[] }>)[dex];
  return shiny && info?.shiny ? `${dex}/shiny` : dex;
}

export interface IconInfo {
  icon: boolean;
  animatedIcon: boolean;
}

/** Whether a species has a box icon (and an animated one). */
export function iconInfo(species: number): IconInfo {
  const info = (spriteFolders as Record<string, { icon?: boolean; animatedIcon?: boolean }>)[dexFolder(species)];
  return { icon: info?.icon ?? false, animatedIcon: info?.animatedIcon ?? false };
}

/**
 * URL of the Gen 5 box icon. `animated` returns the two-frame APNG (browsers
 * animate it in an <img>); otherwise the static icon. Undefined when the
 * species ships no icon.
 */
export function iconUrl(species: number, animated = true, shiny = false): string | undefined {
  if (shiny && hasShinyPortrait(species)) return portraitUrl(species, 'Normal', true);
  if (shiny && hasShinyIcon(species)) return `${import.meta.env.BASE_URL}assets/icons/${folderIconName(dexFolder(species))}-shiny.png`;
  const info = iconInfo(species);
  if (!info.icon) return undefined;
  const base = `${import.meta.env.BASE_URL}assets/icons/${folderIconName(dexFolder(species))}`;
  return animated && info.animatedIcon ? `${base}-anim.png` : `${base}.png`;
}

/**
 * Phaser texture key of an icon frame (0 or 1), loaded by BootScene. A shiny
 * with a shiny portrait gets the 32x32 icon BootScene cuts from it
 * ("icon-<dex>-shiny", one frame); otherwise the normal icon.
 */
export function iconTextureKey(species: number, frame: 0 | 1, shiny = false): string {
  if (shiny && (hasShinyPortrait(species) || hasShinyIcon(species))) return shinyIconTextureKey(species);
  const info = iconInfo(species);
  const stem = folderIconName(dexFolder(species));
  return info.animatedIcon ? `icon-${stem}-${frame}` : `icon-${stem}`;
}

/** Whether a folder ships a shiny icon file (cut from the shiny Idle sheet by scripts/make-shiny-icons.py). */
export function hasShinyIcon(species: number): boolean {
  const info = (spriteFolders as Record<string, { shinyIcon?: boolean }>)[dexFolder(species)];
  return info?.shinyIcon ?? false;
}

/** Texture key of the shiny box icon: cut from the shiny Normal portrait at boot, or the shipped shiny icon file. */
export function shinyIconTextureKey(species: number): string {
  return `icon-${folderIconName(dexFolder(species))}-shiny`;
}

/** Texture key of a loaded portrait: "portrait-<dex>" or "portrait-<dex>-shiny". */
export function portraitTextureKey(species: number, shiny = false): string {
  return shiny && hasShinyPortrait(species) ? `portrait-${dexFolder(species)}-shiny` : `portrait-${dexFolder(species)}`;
}

/** Whether the species ships a shiny Normal portrait (public/assets/portraits/<dex>/shiny/Normal.png). */
export function hasShinyPortrait(species: number, emotion = 'Normal'): boolean {
  const info = (spriteFolders as Record<string, { shinyPortraits?: string[] }>)[dexFolder(species)];
  return info?.shinyPortraits?.includes(emotion) ?? false;
}

/** URL of a shipped asset by its path under public/ (as config files write it). */
export function assetUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}${rel.replace(/^\/+/, '')}`;
}

/** URL of a Gen 5 item sprite (24x24) by its PokeAPI name, e.g. "poke-ball". */
export function itemUrl(sprite: string): string {
  return `${import.meta.env.BASE_URL}assets/items/${sprite}.png`;
}

/** Phaser texture key of an item sprite, loaded by BootScene. */
export function itemTextureKey(sprite: string): string {
  return `item-${sprite}`;
}

/** Texture key of a trainer's Platinum battle sprite (assets/trainers/<id>.png); `pose` gives the throwing pose. */
export function trainerTextureKey(id: string, pose = false): string {
  return pose ? `trainer-${id}-pose` : `trainer-${id}`;
}

/** Texture key of a trainer's VS mugshot (assets/trainers/mugshots/<id>.png). */
export function mugshotTextureKey(id: string): string {
  return `mugshot-${id}`;
}

/** Texture key of a trainer's VS class banner (assets/trainers/banners/<id>.png). */
export function bannerTextureKey(id: string): string {
  return `banner-${id}`;
}

/** Texture key of a location popup banner (assets/ui/gen4/popups/<kind>.png). */
export function popupTextureKey(kind: string): string {
  return `popup-${kind}`;
}

/** Texture key of a type or move-category icon (assets/ui/gen4/types/<name>.png, 32x16). */
export function typeIconTextureKey(name: string): string {
  return `type-${name}`;
}

/** URL of a type or move-category icon for DOM panels. */
export function typeIconUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/ui/gen4/types/${name}.png`;
}

/** Texture key of a badge icon; `lit` false gives the greyed version. */
export function badgeTextureKey(id: string, lit = true): string {
  return lit ? `badge-${id}` : `badge-${id}-off`;
}

/** URL of a portrait emotion PNG, if the folder has it; the shiny one when asked and shipped. */
export function portraitUrl(species: number, emotion = 'Normal', shiny = false): string | undefined {
  const dex = dexFolder(species);
  const info = (spriteFolders as Record<string, { shiny: boolean; portraits: string[]; shinyPortraits?: string[] }>)[dex];
  if (shiny && info?.shinyPortraits?.includes(emotion)) return `${import.meta.env.BASE_URL}assets/portraits/${dex}/shiny/${emotion}.png`;
  if (!info?.portraits.includes(emotion)) return undefined;
  return `${import.meta.env.BASE_URL}assets/portraits/${dex}/${emotion}.png`;
}
