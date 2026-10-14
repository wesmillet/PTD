import { describe, expect, it } from 'vitest';
import { findPokemonId, getPokemon } from '../data/pokedata';
import { getLevel } from '../data/levels';
import route201Fixture from './fixtures/route-201-legacy.json';
import { createLevel, placeTower, towerInterval, towerMove } from './level';
import type { MapDef } from './map';
import { createMonster } from './monster';
import { DEFAULT_SPEED_CONFIG, attackCooldown, enemyTilesPerSec, towerAttacksPerSec, type SpeedConfig } from './speed';

const cfg: SpeedConfig = {
  speedBase: 0.8,
  speedScale: 0.015,
  enemyClampMin: 0.5,
  enemyClampMax: 2.0,
  attackBase: 0.55,
  attackScale: 120,
  clampMin: 0.6,
  clampMax: 1.9,
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

  it('derives attack rate from base Speed and clamps it', () => {
    expect(towerAttacksPerSec(getPokemon(213).base.spe, cfg)).toBeCloseTo(0.6, 1); // Shuckle (5, clamped low)
    expect(towerAttacksPerSec(getPokemon(74).base.spe, cfg)).toBeCloseTo(0.7, 1); // Geodude (20 -> 0.717)
    expect(towerAttacksPerSec(getPokemon(396).base.spe, cfg)).toBeCloseTo(1.05, 2); // Starly (60)
    expect(towerAttacksPerSec(getPokemon(419).base.spe, cfg)).toBeCloseTo(1.5, 1); // Floatzel (115 -> 1.508)
    expect(towerAttacksPerSec(getPokemon(findPokemonId('electrode-hisui')!).base.spe, cfg)).toBeCloseTo(1.8, 2); // Hisuian Electrode (150; the 1.9 cap needs base Speed 162+)
    expect(towerAttacksPerSec(200, cfg)).toBeCloseTo(1.9, 2); // clamped high
    expect(towerAttacksPerSec(60, { ...cfg, moveRate: 1.5 })).toBeCloseTo(1.575);
    expect(attackCooldown(60, cfg)).toBeCloseTo(1 / 1.05);
  });

  it('keeps the move cooldown multiplier on top of the Speed rate', () => {
    const map = route201Fixture as unknown as MapDef;
    const state = createLevel(getLevel('route-201'), map, { seed: 1, party: [createMonster(396, 10)] });
    const [x, y] = map.placeable[0]!;
    const tower = placeTower(state, 0, x, y);
    const base = attackCooldown(getPokemon(396).base.spe, state.config.speed);
    const mult = towerMove(tower)?.cooldownMultiplier ?? 1;
    expect(towerInterval(state, tower)).toBeCloseTo(base * mult);
  });
});
