/**
 * Trainer waves, bosses, badges and the boss-wave retry in the level sim.
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId } from '../data/pokedata';
import { activeBoss, createLevel, defaultRuntimeConfig, placeTower, startWave, step, summarize, throwBall, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';

const mine = getLevel('oreburgh-mine-1f');
const mineMap = getMap('oreburgh-mine-1f');
const route202 = getLevel('route-202');
const route202Map = getMap('route-202');

function run(state: LevelState, seconds: number, dt = 1 / 60): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

/** Plays every wave up to the trainer wave with a strong tower; returns the trainer wave's start events. */
function reachTrainerWave(state: LevelState): LevelEvent[] {
  while (state.phase === 'build' && state.wave < (state.def.waves ?? 99)) {
    const next = state.wave;
    const started = startWave(state);
    if (state.pending.some((s) => s.trainer)) return started;
    run(state, 120);
    if (state.phase !== 'build') throw new Error(`wave ${next + 1} did not clear: ${state.phase}`);
  }
  throw new Error('no trainer wave reached');
}

describe('trainer waves', () => {
  it('replaces the last defend wave with the trainer party, uncatchable, worth 1.5x EXP', () => {
    const state = createLevel(mine, mineMap, { seed: 5, party: [createMonster(387, 60)], starter: 387 });
    placeTower(state, 0, 14, 6);
    const started = reachTrainerWave(state);
    expect(state.wave).toBe(8);
    expect(state.pending.map((s) => s.species)).toEqual([74, 95, 408]);
    expect(started.some((e) => e.type === 'trainerStart' && e.trainer?.name === 'Leader Roark' && e.boss === true)).toBe(true);
    const events = run(state, 5);
    const geodude = state.enemies.find((e) => e.mon.species === 74);
    if (geodude) {
      expect(geodude.trainer).toBe(true);
      expect(throwBall(state, 'poke', geodude.id)[0]?.type).toBe('ballBlocked');
    }
    const all = [...events, ...run(state, 120)];
    const kos = all.filter((e) => e.type === 'ko');
    expect(kos.length).toBeGreaterThanOrEqual(1);
    const geodudeKo = kos.find((e) => state.def.trainer && e.exp !== undefined && !e.boss);
    // Geodude L12: floor(60*12/7) = 102, times 1.5 = 153.
    expect(kos.map((e) => e.exp)).toContain(153);
    expect(geodudeKo).toBeDefined();
    expect(state.phase).toBe('won');
    const summary = summarize(state);
    expect(summary.trainer).toBe('Leader Roark');
    expect(summary.badge).toEqual({ id: 'coal', name: 'Coal Badge' });
  });

  it('spawns the boss with multiplied HP and fires its moves on timers at towers in range', () => {
    const cfg = defaultRuntimeConfig();
    const state = createLevel(mine, mineMap, { seed: 9, party: [createMonster(387, 20)], config: cfg, starter: 387 });
    const tower = placeTower(state, 0, 14, 6);
    tower.mon.moves = []; // never attacks, so the boss walks the whole path
    state.wave = 7; // jump to the trainer wave
    startWave(state);
    run(state, 4); // all three spawned
    const boss = activeBoss(state)!;
    expect(boss).toBeDefined();
    expect(boss.mon.species).toBe(408);
    expect(boss.mon.stats.hp).toBe(Math.round(createMonster(408, 14).stats.hp * cfg.bosses.hpMultiplier));
    expect(boss.mon.hp).toBe(boss.mon.stats.hp);
    expect(boss.boss?.moves.map((m) => m.every)).toEqual([5, 12]);
    // Park the boss next to the tower and let the timers run.
    const towerHits: LevelEvent[] = [];
    let moves = 0;
    const hpBefore = tower.mon.hp;
    for (let t = 0; t < 13; t += 1 / 60) {
      boss.distance = 20; // path point (14,7), one tile below the tower at (14,6)
      for (const e of step(state, 1 / 60)) {
        if (e.type === 'bossMove') moves++;
        if (e.type === 'towerHit') towerHits.push(e);
      }
      if (state.phase !== 'wave') break;
    }
    expect(moves).toBeGreaterThanOrEqual(2); // Headbutt at 5 s and 10 s (plus Zen Headbutt at 12 s)
    expect(towerHits.length).toBeGreaterThanOrEqual(1);
    expect(tower.mon.hp).toBeLessThan(hpBefore);
    expect(tower.mon.hp).toBeGreaterThanOrEqual(1);
    expect(towerHits.every((e) => e.damage !== undefined && e.damage.damage >= 0)).toBe(true);
    expect([findMoveId('headbutt'), findMoveId('zen-headbutt')]).toContain(state.enemies.find((e) => e.boss)?.boss?.moves[0]?.moveId);
  });

  it('restarts the boss wave once per attempt when lives run out, then loses', () => {
    const cfg = defaultRuntimeConfig();
    const state = createLevel({ ...mine, lives: 2 }, mineMap, { seed: 3, party: [createMonster(387, 5)], config: cfg, starter: 387 });
    const tower = placeTower(state, 0, 14, 6);
    tower.mon.moves = [];
    state.wave = 7;
    state.lives = 2;
    startWave(state);
    let events = run(state, 90);
    expect(events.some((e) => e.type === 'bossRetry' && e.wave === 8)).toBe(true);
    expect(state.phase).toBe('build');
    expect(state.wave).toBe(7);
    expect(state.lives).toBe(2);
    expect(state.enemies).toEqual([]);
    expect(state.bossRetryUsed).toBe(true);
    startWave(state);
    expect(state.wave).toBe(8);
    expect(state.pending.some((s) => s.boss)).toBe(true);
    events = run(state, 90);
    expect(events.some((e) => e.type === 'bossRetry')).toBe(false);
    expect(state.phase).toBe('lost');
    // With the flag off, losing on the boss wave is final at once.
    const off = defaultRuntimeConfig();
    off.bosses.retryBossWave = false;
    const s2 = createLevel({ ...mine, lives: 1 }, mineMap, { seed: 3, party: [createMonster(387, 5)], config: off, starter: 387 });
    const t2 = placeTower(s2, 0, 14, 6);
    t2.mon.moves = [];
    s2.wave = 7;
    s2.lives = 1;
    startWave(s2);
    run(s2, 90);
    expect(s2.phase).toBe('lost');
  });

  it('ends a free level with a win once its trainer wave is cleared', () => {
    const state = createLevel(route202, route202Map, { seed: 2, party: [createMonster(387, 60)], starter: 387 });
    placeTower(state, 0, 13, 3);
    let safety = 0;
    while (state.phase !== 'won' && safety++ < 12) {
      if (state.phase === 'build') startWave(state);
      run(state, 120);
    }
    expect(state.phase).toBe('won');
    expect(state.wave).toBe(6);
    expect(state.trainerBeaten).toBe(true);
    expect(summarize(state).trainer).toBe('Youngster Tristan');
    expect(summarize(state).badge).toBeUndefined();
  });
});
