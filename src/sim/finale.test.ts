/**
 * The Team Galactic finale: Spear Pillar (grunts from both stairways, the
 * Mars and Jupiter tag battle with Barry's free towers, Cyrus with Weavile
 * as the boss, the Dialga/Palkia/Giratina cutscene) and the Distortion
 * World (gravity shifts, Cynthia's Garchomp for three waves, Giratina
 * Origin as a three-phase boss that can be caught under 10 % HP).
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId } from '../data/pokedata';
import { activeBoss, createLevel, isCatchable, lanesAreReversed, placeTower, startWave, step, throwBall, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';
import { createGameState, hasFlag, recordLevelResult } from './game';
import { waveTrainers, type WaveDef } from './waves';

function run(state: LevelState, seconds: number, dt = 1 / 20): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

const strongParty = () => [createMonster(389, 100, [findMoveId('earthquake')!]), createMonster(392, 100, [findMoveId('flamethrower')!]), createMonster(395, 100, [findMoveId('surf')!]), createMonster(445, 100, [findMoveId('dragon-claw')!])];

describe('Spear Pillar', () => {
  const def = getLevel('spear-pillar');
  const waves = def.waves as WaveDef[];

  it('is twelve waves in three acts on both stairways, with Barry and the orbs as the reward', () => {
    expect(waves).toHaveLength(12);
    expect(def.lanes).toEqual(['path', 'path-2']);
    for (let i = 0; i < 4; i++) expect(waveTrainers(waves[i])[0]!.lane).toBe('both');
    for (let i = 4; i < 8; i++) {
      const trainers = waveTrainers(waves[i]);
      expect(trainers.map((t) => t.id)).toEqual(['commander-mars', 'commander-jupiter']);
    }
    expect(waveTrainers(waves[7]).flatMap((t) => t.party.filter((p) => p.boss).map((p) => p.species))).toEqual(['purugly', 'skuntank']);
    expect(waves[4]!.allies?.map((a) => a.species)).toEqual(['staraptor', 'counter-starter-final']);
    for (let i = 8; i < 12; i++) expect(waveTrainers(waves[i])[0]!.id).toBe('galactic-boss');
    expect(waveTrainers(waves[11])[0]!.party[0]).toMatchObject({ species: 'weavile', boss: true });
    expect(waves[11]!.outro?.some((l) => l.show?.includes('giratina-origin'))).toBe(true);
    expect(def.reward).toMatchObject({ money: 6000, items: { 'adamant-orb': 1, 'lustrous-orb': 1 } });
  });

  it('plays through: grunts on both lanes, Barry’s towers from wave 5, the cutscene after Weavile', () => {
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 11, party: strongParty(), starter: 387 });
    map.placeable.slice(0, 4).forEach(([x, y], i) => placeTower(state, i, x, y));
    const lanes = new Set<string>();
    let cutscene: LevelEvent | undefined;
    let allies = 0;
    let guard = 0;
    while (state.phase === 'build' && guard++ < 14) {
      const started = startWave(state);
      if (state.wave <= 4) for (const s of state.pending) lanes.add(s.lane ?? 'path');
      if (state.wave === 5) {
        allies = started.filter((e) => e.type === 'allyPlaced').length;
        expect(state.towers.filter((t) => t.ally).map((t) => t.mon.species)).toEqual([findPokemonId('staraptor'), 389 + 3]); // Barry's Infernape counters Turtwig
      }
      const events = run(state, 200);
      cutscene = events.find((e) => e.type === 'cutscene' && e.lines?.some((l) => l.show?.includes('dialga'))) ?? cutscene;
    }
    expect(state.phase).toBe('won');
    expect(lanes).toEqual(new Set(['path', 'path-2']));
    expect(allies).toBe(2);
    expect(cutscene).toBeDefined();
    expect(state.trainersBeaten).toContain('Galactic Boss Cyrus');
    const game = createGameState();
    recordLevelResult(game, 'spear-pillar', 'won', 12, state.kos);
    expect(hasFlag(game, 'adamant-orb')).toBe(true);
    expect(hasFlag(game, 'spear-pillar-cleared')).toBe(true);
    expect(game.money).toBeGreaterThan(6000);
  });
});

describe('Distortion World', () => {
  const def = getLevel('distortion-world');
  const waves = def.waves as WaveDef[];

  it('shifts gravity every other wave, lends Garchomp for three waves and ends on a three-phase Giratina', () => {
    expect(waves).toHaveLength(10);
    expect(def.rules?.[0]).toMatchObject({ id: 'gravity-shift', every: 2 });
    expect(waves[0]!.allies?.[0]).toMatchObject({ species: 'garchomp', waves: [1, 3] });
    const giratina = waveTrainers(waves[9])[0]!.party[0]!;
    expect(giratina).toMatchObject({ species: 'giratina-origin', boss: true, catchableUnder: 0.1 });
    expect(giratina.phases?.map((p) => p.at)).toEqual([1, 0.6, 0.3]);
    expect(giratina.phases?.[1]?.moves?.[0]?.move).toBe('will-o-wisp');
    expect(giratina.phases?.[2]?.reverseEvery).toBe(10);
    expect(def.time).toBe('night');
    expect(getMap(def.map).theme).toBe('cave');
    expect(def.reward?.items).toEqual({ 'griseous-orb': 1 });
  });

  it('plays through with gravity shifts and Giratina’s phases; the catch window opens under 10 %', () => {
    const map = getMap(def.map);
    const state = createLevel(def, map, { seed: 5, party: strongParty(), starter: 387 });
    map.placeable.slice(0, 4).forEach(([x, y], i) => placeTower(state, i, x, y));
    state.items.balls.master = 1;
    const reversedWaves: number[] = [];
    let phases = 0;
    let vanished = false;
    let guard = 0;
    while (state.phase === 'build' && guard++ < 12) {
      startWave(state);
      if (state.wave <= 3) expect(state.towers.some((t) => t.ally?.name === "Cynthia's Garchomp")).toBe(true);
      if (state.wave === 4) expect(state.towers.some((t) => t.ally)).toBe(false);
      if (lanesAreReversed(state)) reversedWaves.push(state.wave);
      if (state.wave === 10) {
        // Watch the boss: phases open as it loses HP; it is catchable only under 10 %.
        for (let t = 0; t < 400 && (state.phase as string) === 'wave'; t += 1 / 20) {
          const events = step(state, 1 / 20);
          phases += events.filter((e) => e.type === 'bossPhase').length;
          if (events.some((e) => e.type === 'rule' && e.text?.includes('vanished'))) vanished = true;
          const boss = activeBoss(state);
          if (boss && boss.mon.hp > 0.1 * boss.mon.stats.hp) expect(isCatchable(boss)).toBe(false);
          if (boss && boss.vanish <= 0 && boss.mon.hp <= 0.1 * boss.mon.stats.hp) {
            expect(isCatchable(boss)).toBe(true);
            const thrown = throwBall(state, 'master', boss.id);
            expect(thrown.some((e) => e.type === 'caught')).toBe(true);
            break;
          }
        }
        continue;
      }
      run(state, 200);
    }
    expect(reversedWaves).toEqual([2, 4, 6, 8, 10]);
    expect(phases).toBeGreaterThanOrEqual(1);
    expect(vanished).toBe(true);
    expect(state.caught.some((c) => c.mon.species === findPokemonId('giratina-origin'))).toBe(true);
    expect(state.phase).toBe('won');
  });
});
