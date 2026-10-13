/**
 * Actual stats from base stats and level (Gen 4 formula).
 * IVs and EVs are fixed project-wide for now (see src/data/config.json):
 *   HP    = floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10
 *   other = floor((2*base + iv + floor(ev/4)) * level / 100) + 5
 * Neutral nature, so no nature multiplier.
 */
import type { BaseStats, StatKey } from '../data/pokedata';
import config from '../data/config.json';

export type Stats = Record<StatKey, number>;

export const STAT_KEYS: readonly StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export interface StatOptions {
  iv?: number;
  ev?: number;
}

export function computeStat(key: StatKey, base: number, level: number, options: StatOptions = {}): number {
  const iv = options.iv ?? config.stats.iv;
  const ev = options.ev ?? config.stats.ev;
  if (!Number.isInteger(level) || level < 1 || level > 100) {
    throw new Error(`computeStat: level must be an integer 1..100, got ${level}`);
  }
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  return key === 'hp' ? core + level + 10 : core + 5;
}

export function computeStats(base: BaseStats, level: number, options: StatOptions = {}): Stats {
  return {
    hp: computeStat('hp', base.hp, level, options),
    atk: computeStat('atk', base.atk, level, options),
    def: computeStat('def', base.def, level, options),
    spa: computeStat('spa', base.spa, level, options),
    spd: computeStat('spd', base.spd, level, options),
    spe: computeStat('spe', base.spe, level, options),
  };
}
