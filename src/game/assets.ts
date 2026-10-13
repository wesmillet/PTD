/**
 * Which sprite folders a scene needs, so levels load only their own
 * Pokémon instead of every folder in spriteIndex.json.
 */
import spriteFolders from '../data/spriteFolders.json';
import { getEvolutions, getEncounterArea, getPokemon, type EncounterArea } from '../data/pokedata';
import type { GameState } from '../sim/game';
import type { LevelDef } from '../sim/waves';
import { dexFolder } from './runtime';

const folders = spriteFolders as Record<string, { shiny: boolean; portraits: string[] }>;

export const ALL_ACTIONS = ['Idle', 'Walk', 'Attack', 'Hurt', 'Faint'] as const;
export const OPTIONAL_ACTIONS = ['Attack', 'Hurt', 'Faint'] as const;

/** A species plus everything it can evolve into (recursively). */
export function evolutionLine(species: number): number[] {
  const out: number[] = [];
  const walk = (id: number) => {
    if (out.includes(id)) return;
    out.push(id);
    for (const e of getEvolutions(id)) walk(e.to);
  };
  walk(species);
  return out;
}

/** Dex folders (base and shiny) a level can show: party lines and the area's tables, all times of day. */
export function levelSpriteFolders(def: LevelDef, game: GameState): string[] {
  const species = new Set<number>();
  for (const mon of game.party) for (const id of evolutionLine(mon.species)) species.add(id);
  const area: EncounterArea = getEncounterArea(def.area);
  for (const e of area.walk ?? []) for (const id of evolutionLine(e.species)) species.add(id);
  const out: string[] = [];
  for (const id of species) {
    getPokemon(id); // validate
    const dex = dexFolder(id);
    if (!folders[dex]) continue; // no sprites fetched for this species
    out.push(dex);
    if (folders[dex]?.shiny) out.push(`${dex}/shiny`);
  }
  return out;
}

export function hasSpriteFolder(species: number): boolean {
  return folders[dexFolder(species)] !== undefined;
}
