/**
 * Pokédex helpers: where a species can be met (the levels whose rosters,
 * area tables or wave scripts spawn it as a wild Pokémon). Pure.
 */
import { getLevel, levelIds } from '../data/levels';
import { encounterTable, findPokemonId, getEncounterArea } from '../data/pokedata';
import { isScripted, rosterTable, type LevelDef, type WaveDef } from './waves';

const cache = new Map<number, string[]>();

function wildSpecies(def: LevelDef): Set<number> {
  const out = new Set<number>();
  if (isScripted(def)) {
    for (const w of def.waves as WaveDef[]) {
      for (const e of w.wild ?? []) {
        const id = findPokemonId(typeof e === 'string' ? e : e.species);
        if (id !== undefined) out.add(id);
      }
    }
    return out;
  }
  if (def.roster) {
    for (const e of rosterTable(def)) out.add(e.species);
    return out;
  }
  try {
    for (const time of ['morning', 'day', 'night'] as const) for (const e of encounterTable(getEncounterArea(def.area), 'walk', time)) out.add(e.species);
  } catch {
    // a level without a usable area
  }
  return out;
}

/** Level names where a species spawns wild, in story order. */
export function speciesAreas(species: number): string[] {
  const hit = cache.get(species);
  if (hit) return hit;
  const names: string[] = [];
  for (const id of levelIds()) {
    const def = getLevel(id);
    if (wildSpecies(def).has(species)) names.push(def.name);
  }
  cache.set(species, names);
  return names;
}

/** Every species some level spawns wild. */
export function allWildSpecies(): number[] {
  const out = new Set<number>();
  for (const id of levelIds()) for (const s of wildSpecies(getLevel(id))) out.add(s);
  return [...out].sort((a, b) => a - b);
}
