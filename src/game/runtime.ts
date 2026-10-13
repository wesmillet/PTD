/**
 * Process-wide runtime settings shared by scenes and the debug panel:
 * a mutable copy of config.json that the simulation reads every step.
 */
import { defaultRuntimeConfig, type RuntimeConfig } from '../sim/level';
import spriteFolders from '../data/spriteFolders.json';

export const runtimeConfig: RuntimeConfig = defaultRuntimeConfig();

/** `?shiny=1` forces every spawn shiny (debugging the visual). */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shiny') === '1') {
  runtimeConfig.shinyRate = 1;
}

/** Game speed multiplier applied to simulation time (1x, 2x). */
export const runtime = {
  gameSpeed: 1,
  /** Level the debug panel sets for the player's Turtwig (party member 0). */
  partyLevelOverride: undefined as number | undefined,
};

export function urlParam(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}


/** Dex folder (zero-padded) for a species id. */
export function dexFolder(species: number): string {
  return String(species).padStart(4, '0');
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
export function iconUrl(species: number, animated = true): string | undefined {
  const info = iconInfo(species);
  if (!info.icon) return undefined;
  const base = `${import.meta.env.BASE_URL}assets/icons/${species}`;
  return animated && info.animatedIcon ? `${base}-anim.png` : `${base}.png`;
}

/** Phaser texture key of an icon frame (0 or 1), loaded by BootScene. */
export function iconTextureKey(species: number, frame: 0 | 1): string {
  const info = iconInfo(species);
  return info.animatedIcon ? `icon-${species}-${frame}` : `icon-${species}`;
}

/** URL of a portrait emotion PNG, if the folder has it. */
export function portraitUrl(species: number, emotion = 'Normal'): string | undefined {
  const dex = dexFolder(species);
  const info = (spriteFolders as Record<string, { shiny: boolean; portraits: string[] }>)[dex];
  if (!info?.portraits.includes(emotion)) return undefined;
  return `${import.meta.env.BASE_URL}assets/portraits/${dex}/${emotion}.png`;
}
