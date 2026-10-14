import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { advance, createClock, SIM_STEP } from './clock';
import { createLevel, placeTower, startWave, step, type LevelState } from './level';
import { createMonster } from './monster';

function snapshot(state: LevelState): unknown {
  return JSON.parse(
    JSON.stringify({
      rng: state.rng.seed,
      elapsed: state.elapsed,
      phase: state.phase,
      wave: state.wave,
      kos: state.kos,
      leaks: state.leaks,
      towers: state.towers.map((t) => ({ id: t.id, hp: t.mon.hp, level: t.mon.level, exp: t.mon.exp, cooldown: t.cooldown, status: t.mon.status })),
      enemies: state.enemies.map((e) => ({ id: e.id, species: e.mon.species, hp: e.mon.hp, distance: e.distance, status: e.mon.status })),
      pending: state.pending,
    }),
  );
}

/**
 * A free level: waves start from inside the sim, so the only inputs are the
 * two placements before the first step and the comparison is purely about
 * stepping (an input at a frame boundary would land at different sim times
 * at different speeds).
 */
function fresh(seed: number): LevelState {
  const state = createLevel(getLevel('route-201'), getMap('route-201'), { seed, party: [createMonster(387, 12, [75]), createMonster(393, 10, [55])] });
  placeTower(state, 0, 9, 5);
  placeTower(state, 1, 12, 8);
  startWave(state);
  return state;
}

describe('fixed-step clock', () => {
  it('runs whole 1/60 s steps and carries the remainder', () => {
    const state = fresh(1);
    const clock = createClock();
    const events = advance(clock, state, 0.025, 1); // 1.5 steps worth
    expect(state.elapsed).toBeCloseTo(SIM_STEP, 10);
    expect(clock.accumulator).toBeCloseTo(0.025 - SIM_STEP, 10);
    advance(clock, state, 0.025, 1); // now 3 steps in total
    expect(state.elapsed).toBeCloseTo(3 * SIM_STEP, 10);
    expect(Array.isArray(events)).toBe(true);
  });

  it('clamps a huge frame so a background tab does not fast-forward', () => {
    const state = fresh(1);
    advance(createClock(), state, 10, 1);
    expect(state.elapsed).toBeCloseTo(0.25, 6);
  });

  it('produces identical results at 1x, 2x and 4x for the same seed', () => {
    const frames = 60 * 90; // 90 seconds of play at 1x
    const frame = 1 / 60;
    const s1 = fresh(77);
    const c1 = createClock();
    const log1: string[] = [];
    const play = (state: LevelState, clock: ReturnType<typeof createClock>, speed: number, log?: string[]) => {
      for (const e of advance(clock, state, frame, speed)) log?.push(`${e.type}:${e.enemyId ?? ''}:${e.towerId ?? ''}:${e.damage?.damage ?? ''}`);
    };
    for (let i = 0; i < frames; i++) play(s1, c1, 1, log1);

    const s4 = fresh(77);
    const c4 = createClock();
    const log4: string[] = [];
    for (let i = 0; i < frames / 4; i++) play(s4, c4, 4, log4);

    const s2 = fresh(77);
    const c2 = createClock();
    for (let i = 0; i < frames / 2; i++) play(s2, c2, 2);

    expect(log1.length).toBeGreaterThan(50);
    expect(log4).toEqual(log1);
    expect(snapshot(s4)).toEqual(snapshot(s1));
    expect(snapshot(s2)).toEqual(snapshot(s1));
    expect(s1.kos).toBeGreaterThan(0);
  });

  it('would diverge with a bigger timestep instead (why the step is fixed)', () => {
    const fine = fresh(77);
    for (let i = 0; i < 60 * 40; i++) step(fine, SIM_STEP);
    const coarse = fresh(77);
    for (let i = 0; i < 15 * 40; i++) step(coarse, SIM_STEP * 4);
    expect(snapshot(coarse)).not.toEqual(snapshot(fine));
  });

  it('stops mid-frame when asked and keeps the remaining time', () => {
    const state = fresh(3);
    const clock = createClock();
    let calls = 0;
    const seen: number[] = [];
    const all = advance(clock, state, 0.1, 4, (events) => {
      seen.push(events.length);
      return ++calls >= 3;
    });
    expect(state.elapsed).toBeCloseTo(3 * SIM_STEP, 10);
    expect(clock.accumulator).toBeCloseTo(0.4 - 3 * SIM_STEP, 10);
    expect(seen).toHaveLength(3);
    expect(all.length).toBe(seen.reduce((a, b) => a + b, 0));
  });
});
