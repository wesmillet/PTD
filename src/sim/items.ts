/**
 * Consumables outside combat: Potion and Rare Candy. No Phaser imports.
 */
import { expForLevel } from '../data/pokedata';
import { evolutionOptions } from './evolution';
import { gainExp } from './exp';
import { learnableAt } from './moves';
import { makeMoveSlot, setMonsterLevel, type Monster } from './monster';
import config from '../data/config.json';

export const MAX_MOVES = config.combat.maxMoves;

/** Restores HP fully. Returns the HP healed. */
export function usePotion(mon: Monster): number {
  const healed = mon.stats.hp - mon.hp;
  mon.hp = mon.stats.hp;
  return Math.max(0, healed);
}

export interface RareCandyResult {
  level: number;
  /** Moves learned at once because a slot was free. */
  learned: number[];
  /** Moves that need a replace decision (all four slots full). */
  toLearn: number[];
  /** Evolution now available, if any. */
  evolution?: { to: number; toName: string };
}

/** Raises a Pokémon one level (not past 100), applying learnset and evolution checks. */
export function useRareCandy(mon: Monster): RareCandyResult {
  if (mon.level >= 100) throw new Error('already at level 100');
  const target = mon.level + 1;
  const result = gainExp({ growth: mon.growth, level: mon.level, exp: mon.exp }, expForLevel(mon.growth, target) - mon.exp);
  mon.exp = result.exp;
  setMonsterLevel(mon, target);
  const learned: number[] = [];
  const toLearn: number[] = [];
  for (const moveId of learnableAt(mon.species, target)) {
    if (mon.moves.some((m) => m.id === moveId)) continue;
    if (mon.moves.length < MAX_MOVES) {
      mon.moves.push(makeMoveSlot(moveId));
      learned.push(moveId);
    } else {
      toLearn.push(moveId);
    }
  }
  const ready = evolutionOptions(mon).ready[0];
  return { level: target, learned, toLearn, ...(ready ? { evolution: { to: ready.to, toName: ready.toName } } : {}) };
}

/** Replaces a move slot with a new move (the replace-dialog outcome). */
export function replaceMove(mon: Monster, replaceIndex: number, moveId: number): void {
  if (!mon.moves[replaceIndex]) throw new Error(`no move slot ${replaceIndex}`);
  mon.moves[replaceIndex] = makeMoveSlot(moveId);
}
