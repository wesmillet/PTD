/**
 * Movement and attack rate from the computed Speed stat. Constants live in
 * src/data/config.json ("speed") and can be overridden at runtime by the
 * debug panel, which is why every function takes the config explicitly.
 *
 *   enemy tiles/sec   = clamp(speedBase + speedScale * spe, enemyClampMin, enemyClampMax)
 *   tower attacks/sec = moveRate * clamp(attackBase + baseSpe / attackScale, clampMin, clampMax)
 *
 * Attack rate reads the species' base Speed (not the computed stat) so the
 * spread is the one players know: Shuckle 0.6/s, Geodude 0.7/s, Starly
 * 1.05/s, Floatzel 1.5/s, Electrode 1.9/s, whatever the level.
 */
import config from '../data/config.json';

export interface SpeedConfig {
  speedBase: number;
  speedScale: number;
  enemyClampMin: number;
  enemyClampMax: number;
  attackBase: number;
  attackScale: number;
  clampMin: number;
  clampMax: number;
  moveRate: number;
}

export const DEFAULT_SPEED_CONFIG: SpeedConfig = { ...config.speed };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function enemyTilesPerSec(spe: number, cfg: SpeedConfig = DEFAULT_SPEED_CONFIG): number {
  return clamp(cfg.speedBase + cfg.speedScale * spe, cfg.enemyClampMin, cfg.enemyClampMax);
}

/** Attacks per second of a tower from its species' base Speed. */
export function towerAttacksPerSec(baseSpe: number, cfg: SpeedConfig = DEFAULT_SPEED_CONFIG): number {
  return cfg.moveRate * clamp(cfg.attackBase + baseSpe / cfg.attackScale, cfg.clampMin, cfg.clampMax);
}

/** Seconds between two attacks of a tower. */
export function attackCooldown(baseSpe: number, cfg: SpeedConfig = DEFAULT_SPEED_CONFIG): number {
  return 1 / towerAttacksPerSec(baseSpe, cfg);
}
