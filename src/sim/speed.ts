/**
 * Movement and attack rate from the computed Speed stat. Constants live in
 * src/data/config.json ("speed") and can be overridden at runtime by the
 * debug panel, which is why every function takes the config explicitly.
 *
 *   enemy tiles/sec   = clamp(speedBase + speedScale * spe, enemyClampMin, enemyClampMax)
 *   tower attacks/sec = moveRate * clamp(spe / speedRef, clampMin, clampMax)
 */
import config from '../data/config.json';

export interface SpeedConfig {
  speedBase: number;
  speedScale: number;
  enemyClampMin: number;
  enemyClampMax: number;
  speedRef: number;
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

export function towerAttacksPerSec(spe: number, cfg: SpeedConfig = DEFAULT_SPEED_CONFIG): number {
  return cfg.moveRate * clamp(spe / cfg.speedRef, cfg.clampMin, cfg.clampMax);
}

/** Seconds between two attacks of a tower. */
export function attackCooldown(spe: number, cfg: SpeedConfig = DEFAULT_SPEED_CONFIG): number {
  return 1 / towerAttacksPerSec(spe, cfg);
}
