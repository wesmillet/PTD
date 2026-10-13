import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import {
  createLevel,
  defaultRuntimeConfig,
  leaveLevel,
  moveTower,
  placeTower,
  startWave,
  step,
  summarize,
  type LevelEvent,
  type LevelState,
} from './level';
import { createMonster } from './monster';

const route201 = getLevel('route-201');
const mine = getLevel('oreburgh-mine-1f');
const route201Map = getMap('route-201');
const mineMap = getMap('oreburgh-mine-1f');
const TACKLE = 33;

function turtwig(level = 5) {
  return createMonster(387, level, [TACKLE]);
}

function run(state: LevelState, seconds: number, dt = 0.05): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

describe('level placement rules', () => {
  it('places, moves and limits towers in build phase only', () => {
    const state = createLevel(route201, route201Map, { seed: 1, party: [turtwig()] });
    expect(() => placeTower(state, 0, 0, 3)).toThrow(/not placeable/);
    const tower = placeTower(state, 0, 6, 2);
    expect(() => placeTower(state, 0, 9, 5)).toThrow(/already placed/);
    moveTower(state, tower.id, 9, 5);
    expect(tower.tile).toEqual([9, 5]);
    startWave(state);
    expect(() => moveTower(state, tower.id, 12, 5)).toThrow(/build phase/);
    expect(() => startWave(state)).toThrow(/build phase/);
  });

  it('needs a tower before a wave can start', () => {
    const state = createLevel(route201, route201Map, { seed: 1, party: [turtwig()] });
    expect(() => startWave(state)).toThrow(/place/);
  });
});

describe('defend objective', () => {
  it('loses a life per leak and the level at zero lives', () => {
    const state = createLevel(mine, mineMap, { seed: 7, party: [turtwig(1)] });
    const tower = placeTower(state, 0, 21, 1);
    tower.rangeTiles = 0; // never attacks
    startWave(state);
    expect(state.lives).toBe(10);
    const events = run(state, 60);
    expect(events.filter((e) => e.type === 'leak').length).toBe(3);
    expect(state.lives).toBe(7);
    expect(state.phase).toBe('build');
    // Keep leaking until lost.
    for (let w = 0; w < 8 && state.phase === 'build'; w++) {
      startWave(state);
      run(state, 80);
    }
    expect(state.phase).toBe('lost');
    expect(state.lives).toBe(0);
    expect(summarize(state).outcome).toBe('lost');
  });

  it('is won after clearing all waves with a strong tower', () => {
    const state = createLevel(mine, mineMap, { seed: 3, party: [turtwig(40)] });
    placeTower(state, 0, 14, 6);
    let kos = 0;
    let levelUps = 0;
    for (let w = 0; w < 8; w++) {
      expect(state.phase).toBe('build');
      startWave(state);
      const events = run(state, 90);
      kos += events.filter((e) => e.type === 'ko').length;
      levelUps += events.filter((e) => e.type === 'levelUp').length;
    }
    expect(state.phase).toBe('won');
    expect(state.wavesCleared).toBe(8);
    expect(state.wave).toBe(8);
    expect(kos).toBeGreaterThan(0);
    expect(state.kos).toBe(kos);
    const summary = summarize(state);
    expect(summary.outcome).toBe('won');
    expect(summary.party[0]!.expGained).toBeGreaterThan(0);
    expect(summary.party[0]!.levelTo).toBe(40 + levelUps);
    expect(() => leaveLevel(state)).toThrow(/free/);
  });

  it('replays identically for the same seed', () => {
    const play = (seed: number) => {
      const state = createLevel(mine, mineMap, { seed, party: [turtwig(12)] });
      placeTower(state, 0, 14, 6);
      const log: string[] = [];
      for (let w = 0; w < 3 && state.phase === 'build'; w++) {
        startWave(state);
        for (const e of run(state, 60)) log.push(`${e.type}:${e.enemyId ?? ''}:${e.damage?.damage ?? ''}`);
      }
      return { log, summary: summarize(state), lives: state.lives };
    };
    expect(play(99)).toEqual(play(99));
    expect(play(99).log).not.toEqual(play(100).log);
  });
});

describe('free objective', () => {
  it('has no lives, despawns leaks silently and keeps going', () => {
    const state = createLevel(route201, route201Map, { seed: 5, party: [turtwig(1)] });
    const tower = placeTower(state, 0, 26, 3);
    tower.rangeTiles = 0;
    expect(state.lives).toBe(0);
    // Waves auto-start after the gap on free levels.
    run(state, state.config.waves.freeWaveGapSeconds + 0.1);
    expect(state.phase).toBe('wave');
    expect(state.wave).toBe(1);
    const events = run(state, 60);
    expect(events.filter((e) => e.type === 'leak').length).toBeGreaterThan(0);
    expect(state.lives).toBe(0);
    expect(state.phase).not.toBe('lost');
    run(state, 200);
    expect(state.wave).toBeGreaterThan(2);
  });

  it('caps the ramp and never spawns above the table max level', () => {
    const state = createLevel(route201, route201Map, { seed: 8, party: [turtwig(50)] });
    placeTower(state, 0, 9, 5);
    let maxLevel = 0;
    let maxSpawnsInWave = 0;
    let waves = 0;
    for (let t = 0; t < 600; t += 0.05) {
      for (const e of step(state, 0.05)) {
        if (e.type === 'waveStart') {
          waves++;
          maxSpawnsInWave = Math.max(maxSpawnsInWave, state.pending.length);
        }
      }
      for (const e of state.enemies) maxLevel = Math.max(maxLevel, e.mon.level);
    }
    expect(waves).toBeGreaterThanOrEqual(12);
    expect(maxSpawnsInWave).toBe(state.config.waves.freeWaveMaxEnemies);
    expect(maxLevel).toBeLessThanOrEqual(3);
  });

  it('can be left at any time with a summary of EXP and level-ups', () => {
    const state = createLevel(route201, route201Map, { seed: 2, party: [turtwig(5)] });
    placeTower(state, 0, 9, 5);
    run(state, 120);
    const events = leaveLevel(state);
    expect(events).toEqual([{ type: 'phase', phase: 'left' }]);
    expect(state.phase).toBe('left');
    expect(state.enemies).toEqual([]);
    const summary = summarize(state);
    expect(summary.outcome).toBe('left');
    expect(summary.kos).toBeGreaterThan(0);
    expect(summary.party[0]!.expGained).toBeGreaterThan(0);
    expect(summary.party[0]!.levelTo).toBeGreaterThanOrEqual(summary.party[0]!.levelFrom);
    expect(step(state, 1)).toEqual([]);
  });
});

describe('debug overrides', () => {
  it('forces enemy levels and reads speed constants live', () => {
    const config = defaultRuntimeConfig();
    config.enemyLevelOverride = 30;
    const state = createLevel(route201, route201Map, { seed: 4, party: [turtwig(5)], config });
    placeTower(state, 0, 9, 5);
    startWave(state);
    run(state, 2);
    expect(state.enemies.length).toBeGreaterThan(0);
    for (const e of state.enemies) expect(e.mon.level).toBe(30);
    const before = state.enemies[0]!.tilesPerSec;
    config.speed.speedBase = 2.0;
    run(state, state.def.spawnInterval + 0.1);
    const newest = state.enemies[state.enemies.length - 1]!;
    expect(newest.tilesPerSec).toBeGreaterThan(before);
  });
});
