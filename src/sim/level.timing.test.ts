/**
 * Sim cost of a busy wave: six towers, twelve tank enemies crawling the
 * path, 240 steps of 1/60 s (one second of play at 4x). Prints the time
 * per 240 steps and keeps it under a generous bound; the numbers before
 * and after the performance pass are in docs/decisions.md.
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId } from '../data/pokedata';
import { createLevel, defaultRuntimeConfig, placeTower, startWave, step } from './level';
import { createMonster } from './monster';

function busyWave() {
  const def = { ...getLevel('route-203'), enemiesFirstWave: 12, enemiesPerWave: 0, spawnInterval: 0.1, waves: 8, lives: 999 };
  const config = defaultRuntimeConfig();
  config.enemyLevelOverride = 45;
  config.speed = { ...config.speed, speedBase: 0.03, speedScale: 0 };
  const party = [387, 390, 393, 396, 399, 403].map((s) => createMonster(s, 8, [findMoveId('tackle')!]));
  const state = createLevel(def, getMap(def.map), { seed: 5, party, config });
  state.map.placeable.slice(0, 6).forEach(([x, y], i) => placeTower(state, i, x, y));
  startWave(state);
  for (let i = 0; i < 120; i++) step(state, 1 / 60); // everyone on the path
  return state;
}

describe('sim step timing', () => {
  it('runs one second of a busy wave at 4x (240 steps) well inside a frame budget', () => {
    const state = busyWave();
    expect(state.enemies.filter((e) => e.distance >= 0).length).toBe(12);
    expect(state.towers).toHaveLength(6);
    for (let i = 0; i < 240; i++) step(state, 1 / 60); // warm up
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      for (let i = 0; i < 240; i++) step(state, 1 / 60);
      runs.push(performance.now() - t0);
    }
    const best = Math.min(...runs);
    console.log(`sim: 240 steps best ${best.toFixed(1)} ms (${(best / 240).toFixed(3)} ms per step), runs ${runs.map((r) => r.toFixed(1)).join(' ')}`);
    expect(best).toBeLessThan(400);
  });
});
