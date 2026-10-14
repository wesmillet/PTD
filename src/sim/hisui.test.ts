/**
 * Hisui rifts: Legends rules (no money, Hisuian balls only), Alphas that
 * drop balls, the noble three-phase fight (frenzy, stagger meter, balms in
 * the window, summons between staggers, calmed on the third), the
 * space-time distortion once per level, and the Temporal Spire capstone.
 */
import { describe, expect, it } from 'vitest';
import { getLevel, levelIds } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId } from '../data/pokedata';
import { createGameState, hasFlag, recordLevelResult, unlockBlockers, DEMO_MODE } from './game';
import { activeBoss, canThrow, createLevel, placeTower, startWave, step, throwBall, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';
import { waveTrainers, type WaveDef } from './waves';

const RIFTS = ['rift-fieldlands', 'rift-mirelands', 'rift-coastlands', 'rift-icelands'];
const NOBLES: Record<string, string> = { 'rift-fieldlands': 'kleavor', 'rift-mirelands': 'lilligant-hisui', 'rift-coastlands': 'arcanine-hisui', 'rift-icelands': 'avalugg-hisui' };

function run(state: LevelState, seconds: number, dt = 1 / 20): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

describe('Hisui rifts', () => {
  it('four rifts with Legends rules, Alphas, a noble on the last wave and the distortion rule', () => {
    for (const id of RIFTS) {
      const def = getLevel(id);
      expect(def.rift).toBe(true);
      expect(def.noMoney).toBe(true);
      expect(def.ballsOnly).toEqual(['feather', 'wing', 'jet', 'heavy']);
      expect(def.rules?.some((r) => r.id === 'distortion')).toBe(true);
      const waves = def.waves as WaveDef[];
      expect(waves.length).toBe(9);
      const alphas = waves.flatMap((w) => (w.wild ?? []).filter((e) => typeof e !== 'string' && e.alpha));
      expect(alphas.length).toBeGreaterThan(0);
      const noble = waveTrainers(waves[8])[0]!.party[0]!;
      expect(noble).toMatchObject({ species: NOBLES[id], boss: true, noble: true });
      expect(noble.summons?.length).toBeGreaterThan(0);
      expect(def.reward?.flags).toContain(`noble-${NOBLES[id]!.replace('-hisui', '')}`);
      expect(def.unlock?.flags).toContain('spear-pillar-cleared');
    }
  });

  it('the noble fight: hits fill the stagger meter, balms land only while staggered, summons come between windows, the third calms it', () => {
    const def = getLevel('rift-fieldlands');
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 4, party: [createMonster(392, 100, [findMoveId('flamethrower')!]), createMonster(389, 100, [findMoveId('earthquake')!])], starter: 387 });
    expect(state.items.balls.feather).toBeGreaterThanOrEqual(8);
    const t1 = placeTower(state, 0, ...map.placeable[0]!);
    const t2 = placeTower(state, 1, ...map.placeable[1]!);
    const moves1 = t1.mon.moves;
    const moves2 = t2.mon.moves;
    t1.mon.moves = [];
    t2.mon.moves = []; // hold fire until the frenzy checks are done
    state.wave = 8; // straight to the noble
    startWave(state);
    run(state, 2);
    expect(canThrow(state, 'poke', state.enemies[0]!.id)).toMatch(/only/i);
    const noble = activeBoss(state)!;
    expect(noble.noble).toBeDefined();
    expect(noble.mon.species).toBe(findPokemonId('kleavor'));
    const hpBefore = noble.mon.hp;
    // Frenzied: a balm bounces off; hits (once the towers fire) do no HP damage.
    expect(throwBall(state, 'feather', noble.id)[0]?.type).toBe('ballBlocked');
    t1.mon.moves = moves1;
    t2.mon.moves = moves2;
    const first = run(state, 0.5);
    expect(first.filter((e) => e.type === 'hit' && e.enemyId === noble.id).every((e) => e.damage?.damage === 0)).toBe(true);
    expect(noble.mon.hp).toBe(hpBefore);
    // Let the towers fill the meter.
    let events: LevelEvent[] = [...first];
    for (let t = 0; t < 120 && noble.noble!.staggered <= 0 && state.enemies.includes(noble); t += 1 / 20) events.push(...step(state, 1 / 20));
    expect(events.some((e) => e.type === 'noble' && e.text?.includes('staggers'))).toBe(true);
    expect(noble.noble!.staggered).toBeGreaterThan(0);
    const balm = throwBall(state, 'feather', noble.id);
    expect(balm.some((e) => e.type === 'hit')).toBe(true);
    expect(noble.mon.hp).toBeLessThanOrEqual(Math.round(hpBefore * 0.85) + 1);
    // Through the window: summons arrive, frenzy resumes; two more staggers calm it (or the balms do).
    events = run(state, 7);
    expect(events.some((e) => e.text?.includes('calls for help'))).toBe(true);
    expect(state.pending.length + state.enemies.length).toBeGreaterThan(1);
    let guard = 0;
    while (state.enemies.includes(noble) && guard++ < 6) {
      for (let t = 0; t < 120 && noble.noble!.staggered <= 0 && state.enemies.includes(noble); t += 1 / 20) step(state, 1 / 20);
      if (state.enemies.includes(noble) && noble.noble!.staggered > 0 && (state.items.balls.feather ?? 0) > 0) throwBall(state, 'feather', noble.id);
      run(state, 7);
    }
    expect(state.enemies.includes(noble)).toBe(false);
    expect(noble.noble!.staggers >= 3 || noble.mon.hp <= 0).toBe(true);
    run(state, 120);
    expect(state.phase).toBe('won');
    expect(state.caught.some((c) => c.mon.species === noble.mon.species)).toBe(false); // nobles are never caught
    const game = createGameState();
    const money = game.money;
    recordLevelResult(game, 'rift-fieldlands', 'won', 9, state.kos);
    expect(game.money).toBe(money); // Legends rules: no money
    expect(hasFlag(game, 'noble-kleavor')).toBe(true);
    expect(hasFlag(game, 'dusk-stone')).toBe(true);
    expect(game.items.balls.feather).toBeGreaterThanOrEqual(6);
  });

  it('Alphas are ten levels up, bigger, catchable, and drop a Hisuian ball', () => {
    const def = getLevel('rift-coastlands');
    const map = getMap(def.map);
    const state = createLevel({ ...def, waves: [{ wild: [{ species: 'gyarados', alpha: true }], count: 1, levels: [30, 30] }], rules: [] }, map, { seed: 2, party: [createMonster(387, 30, [findMoveId('tackle')!])] });
    const t = placeTower(state, 0, ...map.placeable[0]!);
    t.mon.moves = [];
    state.items.balls.heavy = 0;
    state.items.balls.feather = 1;
    startWave(state);
    run(state, 1);
    const alpha = state.enemies[0]!;
    expect(alpha.alpha).toBe(true);
    expect(alpha.mon.level).toBe(40);
    const before = Object.values(state.items.balls).reduce((a, b) => a + b, 0);
    alpha.mon.hp = 1;
    alpha.mon.status.ailment = 'sleep';
    let caught = false;
    for (let i = 0; i < 20 && !caught; i++) {
      state.items.balls.feather = 1;
      caught = throwBall(state, 'feather', alpha.id).some((e) => e.type === 'caught');
    }
    expect(caught).toBe(true);
    expect(state.caught[0]!.mon.alpha).toBe(true);
    expect(Object.values(state.items.balls).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(before);
  });

  it('a space-time distortion opens once per level and brings rare Hisuian spawns', () => {
    const def = getLevel('rift-icelands');
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 8, party: [createMonster(392, 100, [findMoveId('flamethrower')!])], starter: 387 });
    placeTower(state, 0, ...map.placeable[0]!);
    let opened = 0;
    let rare = false;
    let guard = 0;
    while (state.phase === 'build' && state.wave < 8 && guard++ < 9) {
      const events = startWave(state);
      if (events.some((e) => e.type === 'rule' && e.rule === 'distortion')) {
        opened++;
        rare = state.pending.some((s) => [findPokemonId('typhlosion-hisui'), findPokemonId('samurott-hisui'), findPokemonId('decidueye-hisui'), findPokemonId('voltorb-hisui'), findPokemonId('electrode-hisui')].includes(s.species));
      }
      run(state, 150);
    }
    expect(opened).toBe(1);
    expect(rare).toBe(true);
  });

  it('the Temporal Spire opens after all four nobles and ends on Primal Dialga', () => {
    const def = getLevel('temporal-spire');
    expect(def.unlock?.flags).toEqual(['noble-kleavor', 'noble-lilligant', 'noble-arcanine', 'noble-avalugg']);
    const boss = waveTrainers((def.waves as WaveDef[])[5])[0]!.party[0]!;
    expect(boss).toMatchObject({ species: 'dialga-primal', boss: true });
    expect(findPokemonId('dialga-primal')).toBe(20483);
    const game = createGameState();
    if (!DEMO_MODE) expect(unlockBlockers(game, 'temporal-spire').length).toBeGreaterThan(0);
    for (const f of ['noble-kleavor', 'noble-lilligant', 'noble-arcanine', 'noble-avalugg', 'spear-pillar-cleared']) game.flags.push(f);
    game.progress['rift-icelands'] = { wavesCleared: 9, won: true, completed: true };
    expect(unlockBlockers(game, 'temporal-spire')).toEqual([]);
    expect(levelIds()).toContain('temporal-spire');
  });
});
