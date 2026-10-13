/**
 * Process-wide runtime settings shared by scenes and the debug panel:
 * a mutable copy of config.json that the simulation reads every step.
 */
import { defaultRuntimeConfig, type RuntimeConfig } from '../sim/level';
import partyDebug from '../data/party-debug.json';
import spriteFolders from '../data/spriteFolders.json';
import { createMonster, type Monster } from '../sim/monster';

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

/** The fixed Phase 1 party from party-debug.json. */
export function createDebugParty(): Monster[] {
  const party = (partyDebug as { party: { species: number; level: number; moves?: number[]; shiny?: boolean }[] }).party;
  // The debug panel's level control applies to the first party member only.
  return party.map((p, i) =>
    createMonster(p.species, i === 0 ? (runtime.partyLevelOverride ?? p.level) : p.level, p.moves, { shiny: p.shiny ?? false }),
  );
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

/** URL of a portrait emotion PNG, if the folder has it. */
export function portraitUrl(species: number, emotion = 'Normal'): string | undefined {
  const dex = dexFolder(species);
  const info = (spriteFolders as Record<string, { shiny: boolean; portraits: string[] }>)[dex];
  if (!info?.portraits.includes(emotion)) return undefined;
  return `${import.meta.env.BASE_URL}assets/portraits/${dex}/${emotion}.png`;
}
