/**
 * The secret HM levels (src/data/levels/50-secret.json): gates on the HM
 * flags, the water lane and its island spots, the refilling lake, ice,
 * the shuffling rooms, Regigigas's Slow Start, Arceus's plates and the
 * altar spot.
 */
import { describe, expect, it } from 'vitest';
import { getLevel, levelIds } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId, getPokemon } from '../data/pokedata';
import { createGameState, unlockBlockers } from './game';
import { createLevel, placeTower, startWave, step, type LevelEvent, type LevelState } from './level';
import { isPlaceable } from './map';
import { createMonster } from './monster';
import { ruleStatuses } from './rules';
import { scriptedSpawns, type WaveDef } from './waves';

const SECRET = ['lake-verity-island', 'lake-valor-island', 'lake-acuity-island', 'regice-chamber', 'regirock-chamber', 'registeel-chamber', 'snowpoint-temple', 'spear-pillar-origin', 'turnback-cave', 'hall-of-origin'];

function make(id: string, party = [createMonster(389, 100, [findMoveId('earthquake')!])]): LevelState {
  const def = getLevel(id);
  return createLevel(def, getMap(def.map), { seed: 11, party, starter: 387 });
}

function run(state: LevelState, seconds: number): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) events.push(...step(state, 1 / 30));
  return events;
}

/** Places party member `index` on the first spot that takes it (water spots refuse land types). */
function placeAnywhere(state: LevelState, index = 0): void {
  for (const [x, y] of state.map.placeable) {
    try {
      placeTower(state, index, x, y);
      return;
    } catch {
      // try the next spot
    }
  }
  throw new Error('no spot takes the Pokémon');
}

/** Starts wave `n` (1-based) directly, clearing whatever is on the field. */
function jumpToWave(state: LevelState, n: number): void {
  state.wave = n - 1;
  state.phase = 'build';
  state.enemies = [];
  state.pending = [];
  startWave(state);
}

describe('secret HM levels', () => {
  it('ships the ten levels, each gated on its HM or story flag', () => {
    const ids = levelIds();
    for (const id of SECRET) expect(ids, id).toContain(id);
    const game = createGameState();
    expect(unlockBlockers(game, 'lake-verity-island')).toEqual(expect.arrayContaining(['surf', 'spear pillar cleared']));
    expect(unlockBlockers(game, 'turnback-cave')).toContain('waterfall');
    expect(unlockBlockers(game, 'registeel-chamber')).toContain('strength');
    expect(unlockBlockers(game, 'regirock-chamber')).toContain('rock smash');
    expect(unlockBlockers(game, 'snowpoint-temple')).toEqual(expect.arrayContaining(['regi rock', 'regi ice', 'regi steel']));
    expect(unlockBlockers(game, 'spear-pillar-origin')).toContain('temporal spire cleared');
  });

  it('gates the Hall of Origin on eighteen shards that the story levels hand out', () => {
    const gate = getLevel('hall-of-origin').unlock?.flags ?? [];
    expect(gate).toHaveLength(18);
    const given = new Set<string>();
    for (const id of levelIds()) for (const f of getLevel(id).reward?.flags ?? []) if (f.startsWith('shard-')) given.add(f);
    expect([...given].sort()).toEqual([...gate].sort());
  });

  it('Lake Verity: island spots take only Water or Flying types, Water Pokémon cross the lake', () => {
    const state = make('lake-verity-island', [createMonster(389, 60, [findMoveId('earthquake')!]), createMonster(130, 60, [findMoveId('bite')!])]);
    const island = state.map.placeable.filter(([x, y]) => state.map.spotProps?.[`${x},${y}`]?.island);
    expect(island.length).toBe(4);
    const [ix, iy] = island[0]!;
    expect(() => placeTower(state, 0, ix, iy)).toThrow(/Water or Flying/);
    placeTower(state, 1, ix, iy);
    startWave(state);
    expect(state.pending.some((s) => s.lane === 'path-water')).toBe(true);
    expect(state.pending.some((s) => s.lane !== 'path-water')).toBe(true);
    const blocked = ruleStatuses(state).find((s) => s.id === 'water-lane')?.blocked ?? [];
    expect(blocked).toHaveLength(4);
  });

  it('Lake Valor: the bed is dry for three waves, then refills and the red Gyarados surfaces', () => {
    const state = make('lake-valor-island', [createMonster(389, 60, [findMoveId('earthquake')!])]);
    const water = ruleStatuses(state).find((s) => s.id === 'water-lane');
    expect(water?.label).toBe('Dry lake bed');
    const end = state.map.path[state.map.path.length - 1]!;
    const nearest = [...state.map.placeable].sort((a, b) => Math.hypot(a[0] - end[0], a[1] - end[1]) - Math.hypot(b[0] - end[0], b[1] - end[1]))[0]!;
    placeTower(state, 0, nearest[0], nearest[1]);
    startWave(state);
    expect(state.towers).toHaveLength(1);
    jumpToWave(state, 4);
    expect(state.towers).toHaveLength(0);
    expect(ruleStatuses(state).find((s) => s.id === 'water-lane')?.label).toBe('Water spots');
    expect(state.pending.some((s) => s.shiny && s.species === findPokemonId('gyarados'))).toBe(true);
  });

  it('Lake Acuity: ice slows every enemy on the shore', () => {
    const state = make('lake-acuity-island');
    placeAnywhere(state);
    state.towers[0]!.cooldown = 1e9;
    startWave(state);
    run(state, 2);
    const e = state.enemies.find((en) => en.distance >= 0)!;
    const before = e.distance;
    step(state, 1);
    const moved = e.distance - before;
    expect(moved).toBeLessThan(e.tilesPerSec * 0.75);
    expect(moved).toBeGreaterThan(e.tilesPerSec * 0.6);
  });

  it('Turnback Cave: enemies that take the wrong room are sent back to the start', () => {
    const state = make('turnback-cave', [createMonster(387, 5, [findMoveId('tackle')!])]);
    const [x, y] = state.map.placeable[0]!;
    placeTower(state, 0, x, y);
    startWave(state);
    const status = ruleStatuses(state).find((s) => s.id === 'rooms');
    expect(status?.label).toMatch(/Wrong room: (Left|Right) room/);
    run(state, 5);
    const wrongLane = status!.label.includes('Left') ? 'path' : 'path-2';
    const e = state.enemies.find((en) => en.lane === wrongLane)!;
    expect(e).toBeDefined();
    e.distance = state.lanes[wrongLane]!.length - 0.01;
    const events = run(state, 1);
    expect(events.some((ev) => ev.type === 'rule' && ev.rule === 'rooms' && ev.enemyId === e.id)).toBe(true);
    expect(events.some((ev) => ev.type === 'leak')).toBe(false);
    expect(state.enemies).toContain(e);
    expect(e.distance).toBeLessThan(5);
  });

  it('Snowpoint Temple: Regigigas starts slow, with no attacks, and wakes after thirty seconds', () => {
    const state = make('snowpoint-temple', [createMonster(387, 5, [findMoveId('tackle')!])]);
    const [x, y] = state.map.placeable[0]!;
    placeTower(state, 0, x, y);
    jumpToWave(state, 8);
    const spawn = state.pending.find((s) => s.boss)!;
    expect(spawn).toMatchObject({ slowStart: 30, catchableUnder: 0.1 });
    run(state, 14);
    const giga = state.enemies.find((e) => e.boss)!;
    expect(giga.slowStart).toBeGreaterThan(0);
    const before = giga.distance;
    step(state, 1);
    expect(giga.distance - before).toBeLessThan(giga.tilesPerSec * 0.6);
    const events = run(state, 30);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'slow-start')).toBe(true);
    expect(giga.slowStart).toBe(0);
  });

  it('Hall of Origin: Arceus changes type every twenty seconds and the altar is placeable', () => {
    const def = getLevel('hall-of-origin');
    const state = make('hall-of-origin', [createMonster(387, 5, [findMoveId('tackle')!])]);
    const altar = getMap(def.map).points!['altar']!;
    expect(isPlaceable(getMap(def.map), altar[0], altar[1])).toBe(false);
    expect(isPlaceable(state.map, altar[0], altar[1])).toBe(true);
    placeTower(state, 0, altar[0], altar[1]);
    startWave(state);
    run(state, 3);
    const arceus = state.enemies.find((e) => e.boss)!;
    expect(arceus.mon.species).toBe(findPokemonId('arceus'));
    expect(arceus.mon.types).toEqual(getPokemon(arceus.mon.species).types);
    arceus.tilesPerSec = 0.05; // keep it on the path long enough to see a plate change
    const events = run(state, 18);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'plates')).toBe(true);
    expect(arceus.mon.types).toEqual([2]);
  });

  it('Spear Pillar Origin: Dialga and Palkia come down both stairways, both catchable', () => {
    const def = getLevel('spear-pillar-origin');
    const last = (def.waves as WaveDef[])[7]!;
    const spawns = scriptedSpawns(def, 7, 387, (n) => findMoveId(n)!, { int: () => 0, next: () => 0, pick: <T>(a: T[]) => a[0]! } as never, { freeWaveMaxEnemies: 9 }, (c, i) => (c === 'both' ? (i % 2 ? 'path-2' : 'path') : undefined));
    const bosses = spawns.filter((s) => s.boss);
    expect(bosses).toHaveLength(2);
    expect(new Set(bosses.map((b) => b.lane))).toEqual(new Set(['path', 'path-2']));
    for (const b of bosses) expect(b.catchableUnder).toBe(0.1);
    expect(last.trainer?.id).toBe('event-origin');
  });

  it('every secret level runs its first wave without throwing', () => {
    for (const id of SECRET) {
      const state = make(id);
      placeAnywhere(state);
      startWave(state);
      run(state, 40);
      expect(state.phase, id).not.toBe('lost');
    }
  });
});
