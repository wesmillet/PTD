/**
 * A concrete Pokémon instance (tower or enemy) with computed stats.
 */
import { getMove, getPokemon, type GrowthRate } from '../data/pokedata';
import { expForLevel } from '../data/pokedata';
import { computeStats, type Stats } from './stats';

export interface Monster {
  species: number;
  name: string;
  level: number;
  exp: number;
  growth: GrowthRate;
  baseExp: number;
  types: number[];
  stats: Stats;
  hp: number;
  /** Move ids; the first one is the active move for now. */
  moves: number[];
}

export function createMonster(species: number, level: number, moves: readonly number[] = []): Monster {
  const data = getPokemon(species);
  for (const m of moves) getMove(m); // validate
  const stats = computeStats(data.base, level);
  return {
    species,
    name: data.name,
    level,
    exp: expForLevel(data.growth, level),
    growth: data.growth,
    baseExp: data.baseExp,
    types: [...data.types],
    stats,
    hp: stats.hp,
    moves: [...moves],
  };
}

/** Recomputes stats for a new level, keeping the current HP fraction. */
export function setMonsterLevel(mon: Monster, level: number): void {
  const data = getPokemon(mon.species);
  const fraction = mon.stats.hp > 0 ? mon.hp / mon.stats.hp : 1;
  mon.level = level;
  mon.stats = computeStats(data.base, level);
  mon.hp = Math.max(1, Math.round(mon.stats.hp * fraction));
  if (mon.exp < expForLevel(mon.growth, level)) mon.exp = expForLevel(mon.growth, level);
}
