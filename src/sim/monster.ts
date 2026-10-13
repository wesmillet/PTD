/**
 * A concrete Pokémon instance (tower or enemy) with computed stats.
 */
import { getMove, getPokemon, type GrowthRate } from '../data/pokedata';
import { expForLevel } from '../data/pokedata';
import { startingMoves } from './moves';
import { computeStats, type Stats } from './stats';
import { createStatus, type StatusState } from './status';

export interface MoveSlot {
  id: number;
  pp: number;
  maxPp: number;
}

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
  /** Up to four known moves. */
  moves: MoveSlot[];
  /** Index into `moves` of the move used when attacking. */
  activeMove: number;
  status: StatusState;
  shiny: boolean;
}

export interface MonsterOptions {
  shiny?: boolean;
}

export function makeMoveSlot(id: number): MoveSlot {
  const pp = getMove(id).pp ?? 0;
  return { id, pp, maxPp: pp };
}

/** Creates an instance; `moves` defaults to the level-up moves known at `level`. */
export function createMonster(species: number, level: number, moves?: readonly number[], options: MonsterOptions = {}): Monster {
  const data = getPokemon(species);
  const moveIds = moves ?? startingMoves(species, level);
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
    moves: moveIds.slice(0, 4).map(makeMoveSlot),
    activeMove: defaultActiveMove(moveIds.slice(0, 4)),
    status: createStatus(),
    shiny: options.shiny ?? false,
  };
}

/** The first damaging move's slot, or slot 0 when every move is a status move. */
export function defaultActiveMove(moveIds: readonly number[]): number {
  const i = moveIds.findIndex((id) => {
    const m = getMove(id);
    return m.category !== 'status' && m.power !== null;
  });
  return i < 0 ? 0 : i;
}

/** Id of the move the Pokémon attacks with, or undefined if it knows none. */
export function activeMoveId(mon: Monster): number | undefined {
  return mon.moves[mon.activeMove]?.id ?? mon.moves[0]?.id;
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
