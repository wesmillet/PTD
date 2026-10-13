import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import {
  createLevel,
  defaultRuntimeConfig,
  leaveLevel,
  moveTower,
  pickTarget,
  placeTower,
  resolveLearn,
  setActiveMove,
  setPartyLevel,
  setTimeOfDay,
  startWave,
  step,
  summarize,
  towerInterval,
  type LevelEvent,
  type LevelState,
} from './level';
import { expForLevel, findMoveId } from '../data/pokedata';
import { createMonster } from './monster';
import { applyAilment } from './status';

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
    expect(() => startWave(state)).toThrow(/build phase/);
    // Mid-wave moves are allowed and restart the cooldown at a full interval.
    run(state, 5);
    tower.cooldown = 0.1;
    moveTower(state, tower.id, 12, 5);
    expect(tower.tile).toEqual([12, 5]);
    expect(tower.cooldown).toBeCloseTo(towerInterval(state, tower));
    expect(tower.cooldown).toBeGreaterThan(0.5);
  });

  it('allows placing a second party member mid-wave within the placement limit', () => {
    const def = { ...route201, placements: 2 };
    const state = createLevel(def, route201Map, { seed: 1, party: [turtwig(), createMonster(396, 5)] });
    placeTower(state, 0, 6, 2);
    startWave(state);
    const second = placeTower(state, 1, 9, 5);
    expect(state.towers).toHaveLength(2);
    expect(second.cooldown).toBeGreaterThan(0);
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
    tower.mon.moves = []; // never attacks
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
    tower.mon.moves = [];
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
  it('sets the party level outright and switches the time-of-day table', () => {
    const state = createLevel(route201, route201Map, { seed: 4, party: [turtwig(5)] });
    setPartyLevel(state, 0, 40);
    const mon = state.party[0]!.mon;
    expect(mon.level).toBe(40);
    expect(mon.hp).toBe(mon.stats.hp);
    expect(state.party[0]!.levelFrom).toBe(40);
    expect(() => setPartyLevel(state, 0, 0)).toThrow();
    setTimeOfDay(state, 'night');
    expect(state.table.some((e) => e.species === 401)).toBe(true); // Kricketot
    setTimeOfDay(state, 'day');
    expect(state.table.some((e) => e.species === 401)).toBe(false);
  });


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

const move = (name: string) => findMoveId(name) as number;

describe('moves and effects', () => {
  it('attacks with the active move and respects its range and targeting', () => {
    const state = createLevel(route201, route201Map, { seed: 3, party: [createMonster(387, 20, [move('tackle'), move('razor-leaf')])] });
    const tower = placeTower(state, 0, 9, 5);
    startWave(state);
    run(state, 6);
    expect(state.enemies.length).toBeGreaterThan(0);
    // Razor Leaf reaches 3 tiles; Tackle only 1.5.
    setActiveMove(state, tower.id, 1);
    const far = state.enemies[0]!;
    far.distance = 7; // tile (7,3): 2.83 tiles from (9,5)
    expect(pickTarget(state, tower)?.id).toBe(far.id);
    setActiveMove(state, tower.id, 0);
    expect(pickTarget(state, tower)).toBeUndefined();
    expect(() => setActiveMove(state, tower.id, 3)).toThrow();
  });

  it('inflicts ailments from status moves and damaging moves, with no stacking', () => {
    const poisoner = createMonster(387, 30, [move('poison-powder'), move('ember')]);
    poisoner.activeMove = 0; // the default would pick Ember, the first damaging move
    const state = createLevel(route201, route201Map, { seed: 11, party: [poisoner] });
    const tower = placeTower(state, 0, 9, 5);
    startWave(state);
    const events = run(state, 40);
    const statuses = events.filter((e) => e.type === 'status' && e.enemyId !== undefined);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((e) => e.ailment === 'poison')).toBe(true);
    expect(events.some((e) => e.type === 'statusDamage')).toBe(true);
    // Poison ticks credit the last attacker when they KO.
    const statusKos = events.filter((e) => e.type === 'ko' && e.towerId === tower.id);
    expect(statusKos.length).toBeGreaterThan(0);
  });

  it('applies stat stages to self and to targets', () => {
    const state = createLevel(route201, route201Map, { seed: 5, party: [createMonster(387, 10, [move('withdraw')])] });
    const tower = placeTower(state, 0, 9, 5);
    startWave(state);
    const events = run(state, 8);
    expect(events.some((e) => e.type === 'stages' && e.towerId === tower.id)).toBe(true);
    expect(tower.mon.status.stages.def).toBeGreaterThanOrEqual(1);

    const lowering = createLevel(route201, route201Map, { seed: 5, party: [createMonster(387, 10, [move('tail-whip')])] });
    placeTower(lowering, 0, 9, 5);
    startWave(lowering);
    const ev2 = run(lowering, 12);
    const change = ev2.find((e) => e.type === 'stages' && e.enemyId !== undefined);
    expect(change?.changes).toEqual([{ stat: 'def', change: -1 }]);
  });

  it('heals the user with drain moves', () => {
    const state = createLevel(route201, route201Map, { seed: 8, party: [createMonster(387, 15, [move('absorb')])] });
    const tower = placeTower(state, 0, 9, 5);
    tower.mon.hp = 10;
    startWave(state);
    const events = run(state, 20);
    expect(events.some((e) => e.type === 'heal' && e.towerId === tower.id)).toBe(true);
    expect(tower.mon.hp).toBeGreaterThan(10);
  });

  it('is slowed, stopped or turned around by statuses on enemies', () => {
    const state = createLevel(route201, route201Map, { seed: 2, party: [turtwig(1)] });
    const tower = placeTower(state, 0, 26, 3);
    tower.mon.moves = [];
    startWave(state);
    run(state, 3);
    const [a, b, c] = state.enemies;
    expect(a && b && c).toBeTruthy();
    const before = [a!.distance, b!.distance, c!.distance];
    applyAilment(a!.mon.status, 'paralysis', state.rng, state.config.status);
    applyAilment(b!.mon.status, 'sleep', state.rng, state.config.status);
    applyAilment(c!.mon.status, 'poison', state.rng, state.config.status);
    run(state, 1);
    expect(a!.distance - before[0]!).toBeCloseTo((c!.distance - before[2]!) * 0.5, 1);
    expect(b!.distance).toBe(before[1]);
    c!.mon.status = { ...c!.mon.status, ailment: 'confusion', ailmentSeconds: 10, confused: true, confusionTimer: 10 };
    const at = c!.distance;
    run(state, 1);
    expect(c!.distance).toBeLessThan(at);
  });

  it('blocks tower attacks while asleep and wastes some while confused', () => {
    const state = createLevel(route201, route201Map, { seed: 6, party: [turtwig(30)] });
    const tower = placeTower(state, 0, 9, 5);
    startWave(state);
    applyAilment(tower.mon.status, 'sleep', state.rng, state.config.status);
    tower.mon.status.ailmentSeconds = 1000;
    const events = run(state, 15);
    expect(events.filter((e) => e.type === 'attack').length).toBe(0);
    expect(events.some((e) => e.type === 'blocked' && e.block === 'sleep')).toBe(true);
    expect(towerInterval(state, tower)).toBe(Infinity);
  });
});

describe('move learning', () => {
  function levelUpTo(state: LevelState, tower: ReturnType<typeof placeTower>, level: number) {
    const events: LevelEvent[] = [];
    while (tower.mon.level < level) {
      // Grant EXP through the public API by simulating a KO credit: use setPartyLevel for the baseline then gain via a hit.
      const before = tower.mon.level;
      const needed = expForLevel(tower.mon.growth, before + 1) - tower.mon.exp;
      // Internal helper is private; drive through gainExp-equivalent path by awarding a KO of a strong enemy.
      // Path distance 12 is tile (10,5), one tile from the tower at (9,5).
      state.enemies.push({ id: 9999 + tower.mon.level, mon: createMonster(95, 100), distance: 12, tilesPerSec: 0, lastHitBy: tower.id });
      state.enemies[state.enemies.length - 1]!.mon.hp = 1;
      state.enemies[state.enemies.length - 1]!.mon.baseExp = Math.ceil((needed * 7) / 100);
      tower.mon.moves = tower.mon.moves.length ? tower.mon.moves : [];
      const prevPhase = state.phase;
      state.phase = 'wave';
      tower.cooldown = 0;
      tower.mon.status.ailment = 'none';
      events.push(...step(state, 0.01));
      state.phase = prevPhase;
      if (tower.mon.level === before) break;
    }
    return events;
  }

  it('learns a new move automatically with a free slot and prompts when full', () => {
    const state = createLevel(route201, route201Map, { seed: 1, party: [createMonster(387, 8, [move('tackle'), move('withdraw')])] });
    const tower = placeTower(state, 0, 9, 5);
    const toNine = levelUpTo(state, tower, 9);
    expect(toNine.some((e) => e.type === 'moveLearned' && e.moveId === move('absorb'))).toBe(true);
    expect(tower.mon.moves.map((m) => m.id)).toEqual([move('tackle'), move('withdraw'), move('absorb')]);
    expect(state.pendingLearns).toEqual([]);

    const full = createLevel(route201, route201Map, {
      seed: 1,
      party: [createMonster(387, 12, [move('tackle'), move('withdraw'), move('absorb'), move('growl')])],
    });
    const t2 = placeTower(full, 0, 9, 5);
    const to13 = levelUpTo(full, t2, 13);
    expect(to13.some((e) => e.type === 'moveLearnPrompt' && e.moveId === move('razor-leaf'))).toBe(true);
    expect(full.pendingLearns).toEqual([{ towerId: t2.id, moveId: move('razor-leaf') }]);
    expect(t2.mon.moves).toHaveLength(4);
    // Replace slot 3 (Growl).
    const learned = resolveLearn(full, t2.id, move('razor-leaf'), 3);
    expect(learned).toEqual([{ type: 'moveLearned', towerId: t2.id, moveId: move('razor-leaf') }]);
    expect(t2.mon.moves.map((m) => m.id)).toEqual([move('tackle'), move('withdraw'), move('absorb'), move('razor-leaf')]);
    expect(full.pendingLearns).toEqual([]);
    expect(() => resolveLearn(full, t2.id, move('razor-leaf'), 0)).toThrow();
  });

  it('can decline a move', () => {
    const state = createLevel(route201, route201Map, {
      seed: 1,
      party: [createMonster(387, 12, [move('tackle'), move('withdraw'), move('absorb'), move('growl')])],
    });
    const tower = placeTower(state, 0, 9, 5);
    levelUpTo(state, tower, 13);
    expect(state.pendingLearns).toHaveLength(1);
    expect(resolveLearn(state, tower.id, move('razor-leaf'), null)).toEqual([]);
    expect(state.pendingLearns).toEqual([]);
    expect(tower.mon.moves.map((m) => m.id)).not.toContain(move('razor-leaf'));
  });
});

describe('shiny roll', () => {
  it('follows shinyRate', () => {
    const always = defaultRuntimeConfig();
    always.shinyRate = 1;
    const s1 = createLevel(route201, route201Map, { seed: 1, party: [turtwig()], config: always });
    placeTower(s1, 0, 9, 5);
    startWave(s1);
    const ev = run(s1, 3);
    const spawns = ev.filter((e) => e.type === 'spawn');
    expect(spawns.length).toBeGreaterThan(0);
    expect(spawns.every((e) => e.shiny === true)).toBe(true);
    expect(s1.enemies.every((e) => e.mon.shiny)).toBe(true);

    const never = defaultRuntimeConfig();
    never.shinyRate = 0;
    const s0 = createLevel(route201, route201Map, { seed: 1, party: [turtwig()], config: never });
    placeTower(s0, 0, 9, 5);
    startWave(s0);
    expect(run(s0, 3).filter((e) => e.type === 'spawn').every((e) => e.shiny === false)).toBe(true);
  });
});
