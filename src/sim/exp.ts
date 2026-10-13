/**
 * EXP gain and level progression (Gen 4 growth curves from exp_curves.json).
 */
import { expForLevel, type GrowthRate } from '../data/pokedata';

export const MAX_LEVEL = 100;

/** Highest level whose EXP requirement is at or below `exp`. */
export function levelForExp(growth: GrowthRate, exp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (expForLevel(growth, mid) <= exp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Gen 4 wild-battle EXP for one KO, single participant, no modifiers. */
export function koExp(baseExp: number, enemyLevel: number): number {
  return Math.floor((baseExp * enemyLevel) / 7);
}

/** Small EXP for landing a hit, as a fraction of the KO value, at least 1. */
export function hitExp(baseExp: number, enemyLevel: number, fraction: number): number {
  return Math.max(1, Math.floor(koExp(baseExp, enemyLevel) * fraction));
}

export interface ExpProgress {
  growth: GrowthRate;
  level: number;
  exp: number;
}

export interface ExpGain {
  level: number;
  exp: number;
  /** Levels gained by this grant, in order (empty if none). */
  levelsGained: number[];
}

/** Adds EXP and resolves level-ups; level never exceeds 100 and EXP caps at level 100's requirement. */
export function gainExp(progress: ExpProgress, amount: number): ExpGain {
  const cap = expForLevel(progress.growth, MAX_LEVEL);
  const exp = Math.min(cap, progress.exp + Math.max(0, Math.floor(amount)));
  const level = Math.max(progress.level, levelForExp(progress.growth, exp));
  const levelsGained: number[] = [];
  for (let l = progress.level + 1; l <= level; l++) levelsGained.push(l);
  return { level, exp, levelsGained };
}

/** Fraction of the way from the current level to the next (0..1), 1 at level 100. */
export function expToNextFraction(progress: ExpProgress): number {
  if (progress.level >= MAX_LEVEL) return 1;
  const from = expForLevel(progress.growth, progress.level);
  const to = expForLevel(progress.growth, progress.level + 1);
  return Math.min(1, Math.max(0, (progress.exp - from) / (to - from)));
}
