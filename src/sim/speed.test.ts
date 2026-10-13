import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_CONFIG, attackCooldown, enemyTilesPerSec, towerAttacksPerSec, type SpeedConfig } from './speed';

const cfg: SpeedConfig = {
  speedBase: 0.8,
  speedScale: 0.015,
  enemyClampMin: 0.5,
  enemyClampMax: 2.0,
  speedRef: 60,
  clampMin: 0.5,
  clampMax: 2.0,
  moveRate: 1.0,
};

describe('speed', () => {
  it('loads the starting constants from config.json', () => {
    expect(DEFAULT_SPEED_CONFIG).toEqual(cfg);
  });

  it('derives enemy movement from Speed and clamps it', () => {
    expect(enemyTilesPerSec(0, cfg)).toBeCloseTo(0.8);
    expect(enemyTilesPerSec(40, cfg)).toBeCloseTo(1.4); // 0.8 + 0.6
    expect(enemyTilesPerSec(200, cfg)).toBe(2.0); // clamped
    expect(enemyTilesPerSec(10, { ...cfg, speedBase: 0.1 })).toBe(0.5); // clamped low
  });

  it('derives attack rate from Speed relative to speedRef and clamps it', () => {
    expect(towerAttacksPerSec(60, cfg)).toBe(1);
    expect(towerAttacksPerSec(30, cfg)).toBe(0.5);
    expect(towerAttacksPerSec(10, cfg)).toBe(0.5); // clamped low
    expect(towerAttacksPerSec(180, cfg)).toBe(2); // clamped high
    expect(towerAttacksPerSec(60, { ...cfg, moveRate: 1.5 })).toBe(1.5);
    expect(attackCooldown(30, cfg)).toBe(2);
  });
});
