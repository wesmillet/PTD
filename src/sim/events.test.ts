/**
 * Mystery events: Shaymin (gratitude meter, conditional last wave, Gracidea
 * on catch), Cresselia (catch-only, asleep, the Lunar Wing), Darkrai
 * (nightmare rule, Dark Void and Bad Dreams), Shadow Lugia on the S.S.
 * Libra (Shadow waves, catch window), Shadow Mewtwo (Psystrike down the
 * path, teleport); Shadow Pokémon purification.
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId } from '../data/pokedata';
import { createGameState, hasFlag, recordLevelResult } from './game';
import { activeBoss, createLevel, isCatchable, placeTower, startWave, step, throwBall, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';
import { purifyProgress, purifiesAt, isShadow } from './shadow';
import { waveTrainers, type WaveDef } from './waves';

function run(state: LevelState, seconds: number, dt = 1 / 20): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

describe('mystery events', () => {
  it('Shaymin only comes when gratitude is at least half; catching it gives the Gracidea', () => {
    const def = getLevel('flower-paradise');
    expect(def.rules?.[0]?.id).toBe('gratitude');
    const last = (def.waves as WaveDef[])[5]!;
    expect(last.condition).toEqual({ rule: 'gratitude', min: 0.5 });
    expect(waveTrainers(last)[0]!.party[0]).toMatchObject({ species: 'shaymin', boss: true, fleeAfter: 60, catchableUnder: 1 });
    expect(def.catchRewards?.shaymin?.flags).toEqual(['gracidea']);
    const map = getMap(def.map);
    // Meter empty: the last wave has no Shaymin.
    const state = createLevel(def, map, { seed: 1, party: [createMonster(389, 100, [findMoveId('earthquake')!])] });
    placeTower(state, 0, ...map.placeable[0]!);
    state.wave = 5;
    const events = startWave(state);
    expect(state.pending.some((s) => s.trainerId)).toBe(false);
    expect(events.some((e) => e.type === 'rule' && e.rule === 'gratitude' && e.text?.includes('does not come'))).toBe(true);
    // Meter high (catches): Shaymin walks out and can be caught at once.
    const state2 = createLevel(def, map, { seed: 1, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
    const t = placeTower(state2, 0, ...map.placeable[0]!);
    t.mon.moves = [];
    state2.items.balls.master = 20;
    for (let wave = 0; wave < 2; wave++) {
      startWave(state2);
      for (let i = 0; i < 60 && (state2.phase as string) === 'wave'; i++) {
        run(state2, 0.5);
        for (const e of [...state2.enemies]) if (e.distance >= 0) throwBall(state2, 'master', e.id);
      }
    }
    expect(state2.caught.length).toBeGreaterThanOrEqual(5);
    state2.wave = 5;
    state2.phase = 'build';
    startWave(state2);
    run(state2, 2);
    const shaymin = activeBoss(state2);
    expect(shaymin?.mon.species).toBe(findPokemonId('shaymin'));
    expect(isCatchable(shaymin!)).toBe(true);
    expect(throwBall(state2, 'master', shaymin!.id).some((e) => e.type === 'caught')).toBe(true);
  });

  it('Cresselia floats the path asleep and cannot be fought; it flees at the end and the Lunar Wing stays', () => {
    const def = getLevel('fullmoon-island');
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 2, party: [createMonster(389, 100, [findMoveId('earthquake')!])] });
    placeTower(state, 0, ...map.placeable[0]!);
    state.wave = 5;
    startWave(state);
    run(state, 2);
    const cress = activeBoss(state)!;
    expect(cress.catchOnly).toBe(true);
    expect(cress.mon.status.ailment).toBe('sleep');
    const hp = cress.mon.hp;
    const events = run(state, 200);
    expect(cress.mon.hp).toBe(hp);
    expect(events.some((e) => e.type === 'flee' && e.species === findPokemonId('cresselia'))).toBe(true);
    expect(state.leaks).toBe(0);
    expect(state.phase).toBe('won');
    const game = createGameState();
    recordLevelResult(game, 'fullmoon-island', 'won', 6, 0);
    expect(hasFlag(game, 'lunar-wing')).toBe(true);
  });

  it('Darkrai: nightmares each wave unless the Lunar Wing is held; Dark Void sleeps towers in range', () => {
    const def = getLevel('newmoon-island');
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 3, party: [createMonster(389, 100, [findMoveId('earthquake')!])] });
    placeTower(state, 0, ...map.placeable[0]!);
    const events = startWave(state);
    expect(events.some((e) => e.rule === 'nightmare')).toBe(true);
    expect(state.towers[0]!.mon.status.ailment).toBe('sleep');
    const warded = createLevel(def, map, { seed: 3, party: [createMonster(389, 100, [findMoveId('earthquake')!])], flags: ['lunar-wing'] });
    placeTower(warded, 0, ...map.placeable[0]!);
    startWave(warded);
    expect(warded.towers[0]!.mon.status.ailment).toBe('none');
    const boss = waveTrainers((def.waves as WaveDef[])[6])[0]!.party[0]!;
    expect(boss).toMatchObject({ species: 'darkrai', catchableUnder: 0.1 });
    expect(boss.moves?.[0]).toMatchObject({ move: 'dark-void', every: 15, range: 3 });
  });

  it('the S.S. Libra sends Shadow waves down both lanes and Shadow Lugia as a catchable boss', () => {
    const def = getLevel('ss-libra');
    expect(def.lanes).toEqual(['path', 'path-2']);
    expect(def.rules?.[0]).toMatchObject({ id: 'shadow-wave', every: 1 });
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 4, party: [createMonster(389, 100, [findMoveId('earthquake')!])] });
    placeTower(state, 0, ...map.placeable[0]!);
    startWave(state);
    expect(state.pending.every((s) => s.shadow)).toBe(true);
    expect(new Set(state.pending.map((s) => s.lane)).size).toBe(2);
    const lugia = waveTrainers((def.waves as WaveDef[])[7])[0]!.party[0]!;
    expect(lugia).toMatchObject({ species: 'lugia-shadow', shadow: true, catchableUnder: 0.1 });
    expect(findPokemonId('lugia-shadow')).toBe(20249);
  });

  it('Shadow Mewtwo: a single boss, Psystrike down the whole path flinching everyone, a teleport every forty seconds', () => {
    const def = getLevel('shadow-mewtwo');
    expect(def.unlock?.flags).toEqual(['legend-ribbon']);
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 5, party: [createMonster(389, 100, [findMoveId('earthquake')!]), createMonster(392, 100, [findMoveId('flamethrower')!])] });
    const a = placeTower(state, 0, ...map.placeable[0]!);
    const b = placeTower(state, 1, ...map.placeable[map.placeable.length - 1]!);
    a.mon.moves = [];
    b.mon.moves = [];
    startWave(state);
    const events = run(state, 23);
    const psystrike = events.filter((e) => e.type === 'bossMove' && e.moveId === findMoveId('psystrike'));
    expect(psystrike.length).toBeGreaterThanOrEqual(1);
    const flinches = events.filter((e) => e.type === 'status' && e.block === 'flinch' && e.towerId !== undefined);
    expect(new Set(flinches.map((e) => e.towerId)).size).toBe(2); // both ends of the path
    const more = run(state, 20);
    expect([...events, ...more].some((e) => e.type === 'lanesReversed')).toBe(true);
  });

  it('Shadow Pokémon are purified after three cleared lake levels; Lugia needs Spear Pillar', () => {
    const mewtwo = createMonster(20150, 70);
    mewtwo.shadow = { purified: 0 };
    expect(isShadow(mewtwo)).toBe(true);
    expect(purifiesAt(mewtwo, 'route-201')).toBe(false);
    expect(purifiesAt(mewtwo, 'lake-verity')).toBe(true);
    purifyProgress([mewtwo], 'lake-verity');
    purifyProgress([mewtwo], 'lake-verity');
    expect(isShadow(mewtwo)).toBe(true);
    const done = purifyProgress([mewtwo], 'lake-verity');
    expect(done).toEqual([mewtwo]);
    expect(mewtwo.species).toBe(150);
    expect(mewtwo.name).toBe('mewtwo');
    expect(isShadow(mewtwo)).toBe(false);
    const lugia = createMonster(20249, 60);
    lugia.shadow = { purified: 0 };
    expect(purifiesAt(lugia, 'lake-verity')).toBe(false);
    expect(purifiesAt(lugia, 'spear-pillar')).toBe(true);
    const golbat = createMonster(42, 30);
    golbat.shadow = { purified: 2 };
    purifyProgress([golbat], 'lake-acuity');
    expect(golbat.species).toBe(42);
    expect(isShadow(golbat)).toBe(false);
  });
});
