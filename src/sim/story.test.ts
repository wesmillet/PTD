/**
 * The story set pieces (src/data/levels/05-story.json): each level creates
 * and runs, its rule does what the design says, and the unlock chain runs
 * through them in the right order.
 */
import { describe, expect, it } from 'vitest';
import { getLevel, levelIds } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId } from '../data/pokedata';
import { createGameState, unlockBlockers } from './game';
import { createLevel, placeTower, startWave, step, throwBall, useRule, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';
import { ruleStatuses } from './rules';
import { scriptedWildTable, type WaveDef } from './waves';

const STORY = ['valley-windworks', 'eterna-forest', 'old-chateau', 'mt-coronet', 'galactic-warehouse', 'great-marsh', 'lake-valor', 'iron-island', 'lake-acuity', 'galactic-hq', 'victory-road', 'stark-mountain'];

function strong(level = 100): ReturnType<typeof createMonster> {
  return createMonster(389, level, [findMoveId('earthquake')!]);
}

function setup(id: string, party = [strong()], extra: Partial<Parameters<typeof createLevel>[2]> = {}): LevelState {
  const def = getLevel(id);
  const map = getMap(def.map);
  const state = createLevel(def, map, { seed: 7, party, starter: 387, ...extra });
  const [x, y] = map.placeable[0]!;
  placeTower(state, 0, x, y);
  return state;
}

function run(state: LevelState, seconds: number): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) events.push(...step(state, 1 / 30));
  return events;
}

describe('story set pieces', () => {
  it('ships the twelve levels in story order, each with a map position and a reward', () => {
    const ids = levelIds();
    for (const id of STORY) {
      const def = getLevel(id);
      expect(ids, id).toContain(id);
      expect(def.mapPos, id).toBeDefined();
      expect(def.reward?.money ?? 0, id).toBeGreaterThan(0);
      expect(getMap(def.map).placeable.length, id).toBeGreaterThan(0);
    }
    // File order follows the design table.
    const positions = STORY.map((id) => ids.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('chains the story through the gyms: forest before Eterna, marsh before Pastoria, HQ before Sunyshore', () => {
    const game = createGameState();
    expect(unlockBlockers(game, 'eterna-gym')).toContain('clear Eterna Forest');
    expect(unlockBlockers(game, 'hearthome-gym')).toContain('clear Mt. Coronet');
    expect(unlockBlockers(game, 'pastoria-gym')).toContain('clear Great Marsh');
    expect(unlockBlockers(game, 'canalave-gym')).toContain('clear Lake Valor');
    expect(unlockBlockers(game, 'snowpoint-gym')).toContain('clear Lake Acuity');
    expect(unlockBlockers(game, 'sunyshore-gym')).toContain('clear Galactic HQ');
    expect(unlockBlockers(game, 'old-chateau')).toContain('chateau open');
    expect(unlockBlockers(game, 'victory-road')).toContain('clear Distortion World');
    expect(unlockBlockers(game, 'stark-mountain')).toContain('trophy');
  });

  it('Windworks: Drifloon only spawns on Fridays and the gusts push enemies back', () => {
    const def = getLevel('valley-windworks');
    const wave = (def.waves as WaveDef[])[0]!;
    const drifloon = findPokemonId('drifloon')!;
    expect(scriptedWildTable(def, wave).some((e) => e.species === drifloon)).toBe(true);
    expect(scriptedWildTable(def, wave, 5).some((e) => e.species === drifloon)).toBe(true);
    expect(scriptedWildTable(def, wave, 1).some((e) => e.species === drifloon)).toBe(false);
    const state = setup('valley-windworks', [createMonster(387, 5, [findMoveId('tackle')!])]);
    startWave(state);
    const events = run(state, 9);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'wind')).toBe(true);
    expect(ruleStatuses(state).find((s) => s.id === 'wind')).toBeDefined();
  });

  it('Eterna Forest: Cheryl walks the path with her Chansey as a free tower, and the Chansey heals her', () => {
    const state = setup('eterna-forest', [createMonster(387, 5, [findMoveId('tackle')!])]);
    startWave(state);
    expect(state.escort?.name).toBe('Cheryl');
    const chansey = state.towers.find((t) => t.ally && t.mon.species === findPokemonId('chansey'));
    expect(chansey).toBeDefined();
    run(state, 3);
    expect(state.escort!.distance).toBeGreaterThan(0);
    // Hurt her near the Chansey and watch the heals come in.
    // Hurt her at the path start, park the enemies far down the path (stunned so the wave stays open).
    state.escort!.hp = 10;
    state.escort!.distance = 0;
    state.pending = [];
    for (const e of state.enemies) {
      e.distance = Math.max(6, e.distance);
      e.stun = 100;
    }
    const events = run(state, 5);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'escort' && (e.text ?? '').includes('healed'))).toBe(true);
    expect(state.escort!.hp).toBeGreaterThan(10);
  });

  it('Old Chateau: darkness with a lantern per wave and Rotom as a catchable boss on the last wave', () => {
    const def = getLevel('old-chateau');
    const last = (def.waves as WaveDef[])[7]!;
    expect(last.trainer?.party[0]).toMatchObject({ species: 'rotom', boss: true, catchableUnder: 0.1 });
    const state = setup('old-chateau');
    startWave(state);
    expect(ruleStatuses(state).find((s) => s.id === 'darkness')).toMatchObject({ value: 1, max: 6 });
  });

  it('Great Marsh: towers do no damage, bait slows everyone and the Pokémon flee', () => {
    const state = setup('great-marsh');
    state.items.balls.master = 3;
    startWave(state);
    const events = run(state, 4);
    expect(events.some((e) => e.type === 'ko')).toBe(false);
    for (const e of state.enemies) expect(e.mon.hp).toBe(e.mon.stats.hp);
    const bait = useRule(state, 'safari', 'bait');
    expect(bait.some((e) => e.type === 'rule' && e.rule === 'safari')).toBe(true);
    expect(ruleStatuses(state).find((s) => s.id === 'safari')?.label).toBe('Bait out');
    const first = state.enemies.find((e) => e.distance >= 0)!;
    const before = first.distance;
    step(state, 1);
    const slowed = first.distance - before;
    run(state, 8);
    const after = first.distance;
    step(state, 1);
    expect(first.distance - after).toBeGreaterThan(slowed * 1.5);
    // A ball still works; everything else flees in time.
    const caught = throwBall(state, 'master', first.id);
    expect(caught.some((e) => e.type === 'caught')).toBe(true);
    const later = run(state, 30);
    expect(later.some((e) => e.type === 'flee')).toBe(true);
    expect(state.lives).toBe(10);
  });

  it('Lake Valor: the bomb timer arms on Saturn’s wave and Golbat is the boss', () => {
    const def = getLevel('lake-valor');
    const last = (def.waves as WaveDef[])[7]!;
    expect(last.trainer?.id).toBe('commander-saturn');
    expect(last.trainer?.party.find((p) => p.boss)?.species).toBe('golbat');
    const state = setup('lake-valor');
    startWave(state);
    expect(ruleStatuses(state).find((s) => s.id === 'timer')).toBeUndefined();
    state.wave = 7;
    state.phase = 'build';
    state.enemies = [];
    state.pending = [];
    startWave(state);
    expect(ruleStatuses(state).find((s) => s.id === 'timer')).toMatchObject({ label: 'Bomb', max: 90 });
  });

  it('Iron Island: Riley’s Lucario holds the exit and the grunts come down both tunnels', () => {
    const state = setup('iron-island');
    startWave(state);
    const lucario = state.towers.find((t) => t.ally && t.mon.species === findPokemonId('lucario'));
    expect(lucario?.ally?.name).toBe("Riley's Lucario");
    expect(ruleStatuses(state).find((s) => s.id === 'two-lanes')).toBeDefined();
    const def = getLevel('iron-island');
    const tag = (def.waves as WaveDef[])[3]!;
    expect(tag.trainers?.map((t) => t.lane)).toEqual(['path', 'path-2']);
  });

  it('Galactic Warehouse: Dawn’s Piplup fights beside you from the first wave', () => {
    const state = setup('galactic-warehouse');
    startWave(state);
    expect(state.towers.find((t) => t.ally)?.ally?.name).toBe("Dawn's Piplup");
  });

  it('Galactic HQ: every third wave is a Shadow wave and Saturn’s Toxicroak is the boss', () => {
    const state = setup('galactic-hq');
    startWave(state);
    expect(state.pending.some((s) => s.shadow)).toBe(false);
    state.wave = 2;
    state.phase = 'build';
    state.enemies = [];
    state.pending = [];
    startWave(state);
    expect(state.pending.every((s) => s.shadow)).toBe(true);
    const def = getLevel('galactic-hq');
    const last = (def.waves as WaveDef[])[8]!;
    expect(last.trainer?.party.find((p) => p.boss)?.species).toBe('toxicroak');
    expect(def.reward?.items?.['looker-ticket']).toBe(1);
  });

  it('Stark Mountain: Heatran is a catchable boss on the last wave', () => {
    const def = getLevel('stark-mountain');
    const last = (def.waves as WaveDef[])[9]!;
    expect(last.trainer?.party[0]).toMatchObject({ species: 'heatran', boss: true, catchableUnder: 0.1 });
    const state = setup('stark-mountain');
    startWave(state);
    expect(state.towers.find((t) => t.ally)?.ally?.name).toBe("Buck's Claydol");
  });

  it('every story level runs its first two waves without throwing', () => {
    for (const id of STORY) {
      const state = setup(id, [strong()], { weekday: 5 });
      startWave(state);
      run(state, 60);
      if (state.phase === 'build') startWave(state);
      run(state, 60);
      expect(state.phase, id).not.toBe('lost');
    }
  });
});
