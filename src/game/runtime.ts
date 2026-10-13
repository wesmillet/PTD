/**
 * Process-wide runtime settings shared by scenes and the debug panel:
 * a mutable copy of config.json that the simulation reads every step.
 */
import { defaultRuntimeConfig, type RuntimeConfig } from '../sim/level';
import partyDebug from '../data/party-debug.json';
import { createMonster, type Monster } from '../sim/monster';

export const runtimeConfig: RuntimeConfig = defaultRuntimeConfig();

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
  return partyDebug.party.map((p) => createMonster(p.species, runtime.partyLevelOverride ?? p.level, p.moves));
}

/** Dex folder (zero-padded) for a species id. */
export function dexFolder(species: number): string {
  return String(species).padStart(4, '0');
}
