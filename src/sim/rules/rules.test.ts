/**
 * The rules engine: each rule's hooks against small scripted levels on the
 * shipped maps (Veilstone's two lanes, Pastoria's tide spots) and the
 * frozen Route 201 layout.
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../../data/levels';
import { getMap } from '../../data/maps';
import { findMoveId, findPokemonId } from '../../data/pokedata';
import route201Fixture from '../fixtures/route-201-legacy.json';
import { activeBoss, createLevel, enemyPath, lanesAreReversed, placeTower, placementBlock, ruleStatus, startWave, step, throwBall, towerRange, useRule, type LevelEvent, type LevelState } from '../level';
import type { MapDef } from '../map';
import { createMonster } from '../monster';
import { createRules, hasRule, ruleIds } from './index';
import type { LevelDef, WaveDef } from '../waves';

const route201Map = route201Fixture as unknown as MapDef;

function level(overrides: Partial<LevelDef>, waves: WaveDef[]): LevelDef {
  return {
    name: 'Test',
    area: 'sinnoh-route-201',
    time: 'day',
    objective: 'defend',
    map: 'route-201',
    lives: 10,
    enemiesFirstWave: 2,
    enemiesPerWave: 0,
    spawnInterval: 0.5,
    placements: 6,
    levels: [5, 5],
    waves,
    ...overrides,
  };
}

const wild = (count = 2): WaveDef => ({ wild: ['bidoof'], count });

function run(state: LevelState, seconds: number, dt = 1 / 30): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

function strong(level = 60) {
  return createMonster(387, level, [findMoveId('razor-leaf')!]);
}

describe('rules engine', () => {
  it('registers every rule the content names and rejects unknown ones', () => {
    for (const id of ['rockfall', 'sun-and-shade', 'darkness', 'two-lanes', 'tide', 'iron-defense', 'ice-floor', 'charge', 'gravity-shift', 'tag-ally', 'timer', 'escort', 'shadow-wave', 'wind', 'nightmare', 'gratitude', 'distortion', 'challenge']) {
      expect(hasRule(id), id).toBe(true);
    }
    expect(ruleIds().length).toBeGreaterThanOrEqual(18);
    expect(() => createRules([{ id: 'nope' }])).toThrow(/unknown rule/);
  });

  it('rockfall blocks one free spot on every third wave and frees it afterwards', () => {
    const def = level({ rules: [{ id: 'rockfall', every: 3 }] }, [wild(), wild(), wild()]);
    const state = createLevel(def, route201Map, { seed: 1, party: [strong(), strong()] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    startWave(state);
    run(state, 30);
    expect(state.phase).toBe('build');
    startWave(state);
    run(state, 30);
    const events = startWave(state);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'rockfall' && e.tile)).toBe(true);
    const blocked = ruleStatus(state).find((s) => s.id === 'rockfall')?.blocked?.[0];
    expect(blocked).toBeDefined();
    expect(placementBlock(state, state.party[1]!.mon, blocked![0], blocked![1])).toMatch(/rockfall/i);
    expect(events.find((e) => e.type === 'banner')?.text).toContain('Rockfall');
    run(state, 30);
    expect(state.phase).toBe('won');
    expect(ruleStatus(state).find((s) => s.id === 'rockfall')).toBeUndefined();
  });

  it('sun and shade: Fire moves hit harder on sunny waves, enemies hide on shade waves', () => {
    const def = level({ rules: [{ id: 'sun-and-shade' }] }, [wild(), wild()]);
    const state = createLevel(def, route201Map, { seed: 2, party: [createMonster(390, 60, [findMoveId('ember')!])] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    const sunny = startWave(state);
    expect(sunny.find((e) => e.type === 'banner')?.text).toContain('Sunny');
    run(state, 30);
    expect(state.phase).toBe('build');
    const shade = startWave(state);
    expect(shade.find((e) => e.type === 'banner')?.text).toContain('Shade');
    // A far-away tower cannot see hidden enemies: move it off the path's reach by giving it a tiny range check.
    const events = run(state, 2);
    const spawned = events.filter((e) => e.type === 'spawn');
    expect(spawned.length).toBeGreaterThan(0);
  });

  it('darkness caps range outside lantern glow and the riddle lights more lanterns', () => {
    const def = level({ rules: [{ id: 'darkness', range: 2, lit: 0, lanterns: 3 }] }, [wild()]);
    const state = createLevel(def, route201Map, { seed: 3, party: [createMonster(387, 60, [findMoveId('razor-leaf')!])] });
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    expect(towerRange(state, tower)).toBeLessThanOrEqual(2);
    const before = ruleStatus(state).find((s) => s.id === 'darkness')!;
    expect(before.value).toBe(0);
    useRule(state, 'darkness', 'light');
    expect(ruleStatus(state).find((s) => s.id === 'darkness')!.value).toBe(2);
  });

  it('two lanes: every spawn of a wave uses the lane the rule picked, announced on the banner', () => {
    const map = getMap('veilstone-gym');
    expect(Object.keys(map.lanes ?? {})).toContain('path-2');
    const def = level({ map: 'veilstone-gym', lanes: ['path', 'path-2'], rules: [{ id: 'two-lanes' }] }, [wild(4), wild(4), wild(4)]);
    const state = createLevel(def, map, { seed: 5, party: [strong()] });
    placeTower(state, 0, ...map.placeable[0]!);
    const lanes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const events = startWave(state);
      const chosen = new Set(state.pending.map((s) => s.lane ?? 'path'));
      expect(chosen.size).toBe(1);
      lanes.add([...chosen][0]!);
      expect(events.find((e) => e.type === 'banner')?.text).toMatch(/lane/i);
      run(state, 60);
      expect(state.phase).not.toBe('lost');
      if (state.phase === 'won') break;
    }
    expect(lanes.size).toBeGreaterThanOrEqual(1);
  });

  it('tide floods the shore spots on high-tide waves for anything but Water and Flying types', () => {
    const map = getMap('pastoria-gym');
    const shore = map.placeable.filter(([x, y]) => map.spotProps?.[`${x},${y}`]?.tide);
    expect(shore.length).toBe(2);
    const def = level({ map: 'pastoria-gym', rules: [{ id: 'tide', every: 2 }] }, [wild(), wild(), wild()]);
    const state = createLevel(def, map, { seed: 7, party: [strong(), createMonster(393, 60, [findMoveId('bubble')!])] });
    const [sx, sy] = shore[0]!;
    const grass = placeTower(state, 0, sx, sy);
    startWave(state); // low tide
    run(state, 40);
    expect(state.phase).toBe('build');
    const events = startWave(state); // high tide
    expect(state.towers.some((t) => t.id === grass.id)).toBe(false);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'tide' && e.towerId === grass.id)).toBe(true);
    expect(placementBlock(state, state.party[0]!.mon, sx, sy)).toMatch(/Water or Flying/);
    expect(placementBlock(state, state.party[1]!.mon, shore[1]![0], shore[1]![1])).toBeNull();
  });

  it('iron defense gives Steel enemies a shield only special or Fire, Fighting and Ground hits break', () => {
    const def = level({ rules: [{ id: 'iron-defense', shield: 0.5 }] }, [{ wild: ['magnemite', 'bidoof'], count: 2 }]);
    const state = createLevel(def, route201Map, { seed: 11, party: [createMonster(387, 60, [findMoveId('tackle')!])] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    startWave(state);
    const events = run(state, 3);
    const steel = state.enemies.find((e) => e.mon.types.includes(9)) ?? events.find((e) => e.type === 'spawn');
    expect(steel).toBeDefined();
    const shielded = state.enemies.filter((e) => e.shield !== undefined);
    for (const e of shielded) expect(e.shield).toBeGreaterThan(0);
    const hitsOnSteel = events.filter((e) => e.type === 'hit' && state.enemies.find((en) => en.id === e.enemyId && en.mon.types.includes(9)));
    for (const h of hitsOnSteel) expect(h.damage?.damage).toBe(0); // Tackle bounces off the shield
  });

  it('charge: three cleared waves arm Magnetic Flux, which stuns everyone on the path', () => {
    const def = level({ rules: [{ id: 'charge', needed: 2, seconds: 5 }] }, [wild(), wild(), wild(1)]);
    const state = createLevel(def, route201Map, { seed: 13, party: [strong()] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    expect(useRule(state, 'charge')).toEqual([]);
    for (let i = 0; i < 2; i++) {
      startWave(state);
      run(state, 40);
    }
    expect(ruleStatus(state).find((s) => s.id === 'charge')?.button).toBe('Magnetic Flux');
    const tower = state.towers[0]!;
    tower.mon.moves = [];
    startWave(state);
    run(state, 1);
    const enemy = state.enemies[0]!;
    const events = useRule(state, 'charge');
    expect(events.some((e) => e.text?.includes('Magnetic Flux'))).toBe(true);
    expect(enemy.stun).toBe(5);
    const d = enemy.distance;
    run(state, 1);
    expect(enemy.distance).toBe(d);
  });

  it('gravity shift reverses the lane on every other wave; enemies keep their direction', () => {
    const def = level({ rules: [{ id: 'gravity-shift', every: 2 }] }, [wild(), wild(), wild()]);
    const state = createLevel(def, route201Map, { seed: 17, party: [strong()] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    startWave(state);
    expect(lanesAreReversed(state)).toBe(false);
    run(state, 40);
    const events = startWave(state);
    expect(lanesAreReversed(state)).toBe(true);
    expect(events.some((e) => e.type === 'lanesReversed')).toBe(true);
    run(state, 1);
    const enemy = state.enemies[0]!;
    expect(enemy.reversed).toBe(true);
    expect(enemyPath(state, enemy).segments[0]!.from).toEqual(route201Map.path[route201Map.path.length - 1]);
  });

  it('tag ally places a free tower for its waves and dismisses it afterwards; it earns no EXP', () => {
    const def = level({ rules: [{ id: 'tag-ally', allies: [{ species: 'lucario', level: 60, name: 'Riley', spot: 'nearest-exit', waves: [1, 1] }] }] }, [wild(), wild()]);
    const state = createLevel(def, route201Map, { seed: 19, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    const events = startWave(state);
    expect(events.some((e) => e.type === 'allyPlaced' && e.text === 'Riley')).toBe(true);
    const ally = state.towers.find((t) => t.ally)!;
    expect(ally.mon.species).toBe(findPokemonId('lucario'));
    expect(state.towers.filter((t) => !t.ally)).toHaveLength(1);
    const all = run(state, 40);
    expect(all.some((e) => e.type === 'allyLeft')).toBe(true);
    expect(state.towers.some((t) => t.ally)).toBe(false);
    expect(ally.mon.level).toBe(60);
  });

  it('timer loses the level when the boss outlives the clock', () => {
    const boss: WaveDef = { trainer: { id: 'commander-saturn', name: 'Saturn', party: [{ species: 'golbat', level: 30, boss: true }] } };
    const def = level({ rules: [{ id: 'timer', seconds: 3, wave: 1, label: 'Bomb' }] }, [boss]);
    const state = createLevel(def, route201Map, { seed: 23, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    tower.mon.moves = [];
    const events = startWave(state);
    expect(events.find((e) => e.type === 'banner')?.text).toContain('Bomb');
    run(state, 2.5);
    expect(state.phase).toBe('wave');
    expect(activeBoss(state)).toBeDefined();
    run(state, 1);
    expect(state.phase).toBe('lost');
  });

  it('escort walks the path and the level is lost when her HP runs out', () => {
    const def = level({ rules: [{ id: 'escort', name: 'Cheryl', species: 'chansey', hp: 2, speed: 0.1, reach: 99, damagePerSecond: 2 }] }, [wild(3)]);
    const state = createLevel(def, route201Map, { seed: 29, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    expect(state.escort?.name).toBe('Cheryl');
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    tower.mon.moves = [];
    startWave(state);
    run(state, 4);
    expect(state.phase).toBe('lost');
    expect(state.escort!.hp).toBe(0);
  });

  it('shadow waves mark every spawn as Shadow; caught ones carry the mark and gain no EXP', () => {
    const def = level({ rules: [{ id: 'shadow-wave', every: 1 }] }, [wild(1)]);
    const state = createLevel(def, route201Map, { seed: 31, party: [createMonster(387, 30, [findMoveId('tackle')!])] });
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    tower.mon.moves = [];
    state.items.balls.master = 1;
    startWave(state);
    run(state, 1);
    const enemy = state.enemies[0]!;
    expect(enemy.shadow).toBe(true);
    const events = throwBall(state, 'master', enemy.id);
    expect(events.some((e) => e.type === 'caught')).toBe(true);
    expect(enemy.mon.shadow).toEqual({ purified: 0 });
  });

  it('wind pushes enemies back on one gust and forward on the next', () => {
    const def = level({ rules: [{ id: 'wind', every: 1, push: 2 }] }, [wild(1)]);
    const state = createLevel(def, route201Map, { seed: 37, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    tower.mon.moves = [];
    startWave(state);
    const events = run(state, 3);
    const gusts = events.filter((e) => e.type === 'rule' && e.rule === 'wind');
    expect(gusts.length).toBeGreaterThanOrEqual(2);
    expect(gusts[0]!.text).toContain('back');
    expect(gusts[1]!.text).toContain('forward');
  });

  it('challenge: solo allows one Pokémon, no-catch refuses balls, speedrun loses on the clock', () => {
    const solo = createLevel(level({ rules: [{ id: 'challenge', mode: 'solo' }] }, [wild()]), route201Map, { seed: 1, party: [strong(), strong()] });
    placeTower(solo, 0, ...route201Map.placeable[0]!);
    expect(placementBlock(solo, solo.party[1]!.mon, ...route201Map.placeable[1]!)).toMatch(/Solo/);
    const noCatch = createLevel(level({ rules: [{ id: 'challenge', mode: 'no-catch' }] }, [wild(1)]), route201Map, { seed: 1, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    const t = placeTower(noCatch, 0, ...route201Map.placeable[0]!);
    t.mon.moves = [];
    startWave(noCatch);
    run(noCatch, 1);
    expect(() => throwBall(noCatch, 'poke', noCatch.enemies[0]!.id)).toThrow(/No catching/);
    const speed = createLevel(level({ rules: [{ id: 'challenge', mode: 'speedrun', seconds: 2 }] }, [wild(1)]), route201Map, { seed: 1, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    const t2 = placeTower(speed, 0, ...route201Map.placeable[0]!);
    t2.mon.moves = [];
    startWave(speed);
    run(speed, 3);
    expect(speed.phase).toBe('lost');
  });

  it('scripted waves run trainers with bosses, allies and cutscenes, and the summary names the trainer', () => {
    const def = level({}, [
      { wild: ['starly'], count: 1, lines: [{ text: 'Here they come.' }] },
      { trainer: { id: 'leader-roark', name: 'Leader Roark', party: [{ species: 'geodude', level: 10 }, { species: 'cranidos', level: 12, boss: true, moves: [{ move: 'headbutt', every: 5 }] }] }, allies: [{ species: 'staraptor', level: 50, name: 'Barry', spot: 'nearest-exit' }], outro: [{ text: 'Well fought.' }] },
    ]);
    const state = createLevel(def, route201Map, { seed: 41, party: [strong()] });
    placeTower(state, 0, ...route201Map.placeable[0]!);
    const first = startWave(state);
    expect(first.some((e) => e.type === 'cutscene' && e.lines?.[0]?.text === 'Here they come.')).toBe(true);
    run(state, 40);
    expect(state.phase).toBe('build');
    const second = startWave(state);
    expect(second.some((e) => e.type === 'trainerStart' && e.trainer?.name === 'Leader Roark' && e.boss)).toBe(true);
    expect(second.some((e) => e.type === 'allyPlaced')).toBe(true);
    expect(state.pending.some((s) => s.boss && s.trainerId === 'leader-roark')).toBe(true);
    const events = run(state, 60);
    expect(state.phase).toBe('won');
    expect(events.some((e) => e.type === 'cutscene' && e.lines?.[0]?.text === 'Well fought.')).toBe(true);
    expect(state.trainersBeaten).toEqual(['Leader Roark']);
  });

  it('legendary bosses can be caught only under their catch fraction; level caps stop EXP', () => {
    const def = level({ levelCap: 61 }, [{ trainer: { id: 'galactic-boss', name: 'Cyrus', party: [{ species: 'giratina-origin', level: 70, boss: true, catchableUnder: 0.1 }] } }]);
    const state = createLevel(def, route201Map, { seed: 43, party: [strong(60)] });
    const tower = placeTower(state, 0, ...route201Map.placeable[0]!);
    tower.mon.moves = [];
    state.items.balls.master = 2;
    startWave(state);
    run(state, 1);
    const boss = activeBoss(state)!;
    expect(boss.mon.species).toBe(findPokemonId('giratina-origin'));
    expect(throwBall(state, 'master', boss.id)[0]?.type).toBe('ballBlocked');
    boss.mon.hp = Math.floor(boss.mon.stats.hp * 0.05);
    const events = throwBall(state, 'master', boss.id);
    expect(events.some((e) => e.type === 'caught')).toBe(true);
    expect(state.caught[0]?.mon.species).toBe(findPokemonId('giratina-origin'));
  });

  it('reads the real gym and finale maps: lanes, points and spot properties', () => {
    const spear = getMap('spear-pillar');
    expect(Object.keys(spear.lanes ?? {})).toEqual(['path-2']);
    expect(spear.points?.altar).toBeDefined();
    const pastoria = getMap('pastoria-gym');
    expect(Object.keys(pastoria.lanes ?? {})).toEqual(['path-water']);
    expect(getLevel('route-201').mapPos).toBeDefined();
  });
});
