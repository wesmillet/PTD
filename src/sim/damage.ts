/**
 * Gen 4 damage formula on computed stats (never base stats).
 *
 *   base = floor(floor(floor(2 * level / 5 + 2) * power * A / D) / 50) + 2
 *   then, flooring after each step: crit x2, random 85..100 / 100,
 *   STAB x1.5, type effectiveness per defending type.
 *
 * Minimum 1 damage unless the move has no effect.
 */
import { typeEffectiveness } from '../data/pokedata';
import type { MoveCategory } from '../data/pokedata';
import type { Rng } from './rng';
import type { Stats } from './stats';

export interface DamageContext {
  level: number;
  power: number;
  moveType: number;
  category: Exclude<MoveCategory, 'status'>;
  attackerTypes: readonly number[];
  attackerStats: Stats;
  defenderTypes: readonly number[];
  defenderStats: Stats;
}

export interface DamageResult {
  damage: number;
  crit: boolean;
  /** 85..100 */
  roll: number;
  stab: boolean;
  /** Combined type multiplier: 0, 0.25, 0.5, 1, 2 or 4. */
  effectiveness: number;
}

export function baseDamage(level: number, power: number, attack: number, defense: number): number {
  const levelFactor = Math.floor((2 * level) / 5 + 2);
  const raw = Math.floor((levelFactor * power * attack) / Math.max(1, defense));
  return Math.floor(raw / 50) + 2;
}

export function typeMultiplier(moveType: number, defenderTypes: readonly number[]): number {
  return defenderTypes.reduce((m, t) => m * typeEffectiveness(moveType, t), 1);
}

/** Deterministic damage for a given crit flag and random roll. */
export function computeDamage(ctx: DamageContext, crit: boolean, roll: number): DamageResult {
  if (!Number.isInteger(roll) || roll < 85 || roll > 100) throw new Error(`computeDamage: roll must be 85..100, got ${roll}`);
  const attack = ctx.category === 'physical' ? ctx.attackerStats.atk : ctx.attackerStats.spa;
  const defense = ctx.category === 'physical' ? ctx.defenderStats.def : ctx.defenderStats.spd;
  const stab = ctx.attackerTypes.includes(ctx.moveType);
  const effectiveness = typeMultiplier(ctx.moveType, ctx.defenderTypes);

  let damage = baseDamage(ctx.level, ctx.power, attack, defense);
  if (crit) damage *= 2;
  damage = Math.floor((damage * roll) / 100);
  if (stab) damage = Math.floor(damage * 1.5);
  for (const t of ctx.defenderTypes) damage = Math.floor(damage * typeEffectiveness(ctx.moveType, t));
  if (effectiveness > 0 && damage < 1) damage = 1;
  if (effectiveness === 0) damage = 0;
  return { damage, crit, roll, stab, effectiveness };
}

/** Rolls crit and the random factor from the seeded RNG, then computes damage. */
export function rollDamage(ctx: DamageContext, rng: Rng, critRate: number): DamageResult {
  const crit = rng.chance(critRate);
  const roll = rng.int(85, 100);
  return computeDamage(ctx, crit, roll);
}

/** Accuracy check. `null` accuracy never misses. */
export function hits(accuracy: number | null, rng: Rng): boolean {
  if (accuracy === null) return true;
  return rng.chance(accuracy / 100);
}
