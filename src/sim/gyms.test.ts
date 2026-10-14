/**
 * Gyms 2 to 8: ten scripted waves each (six gym-trainer waves, three leader
 * waves, the ace as a 4x boss with its signature move), the gym's rule,
 * the badge with its TM and HM flag, and a full play-through on the arena
 * map with a strong party.
 */
import { describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { findMoveId } from '../data/pokedata';
import { TRAINER_ART } from '../data/trainers';
import { createLevel, placeTower, startWave, step, summarize, type LevelEvent, type LevelState } from './level';
import { createMonster } from './monster';
import { createGameState, placementLimit, recordLevelResult, hasFlag, DEMO_MODE } from './game';
import { waveTrainers, type WaveDef } from './waves';

const GYMS: Record<string, { leader: string; badge: string; rule: string; ace: string; tm: string; hm: string }> = {
  'eterna-gym': { leader: 'leader-gardenia', badge: 'forest', rule: 'sun-and-shade', ace: 'roserade', tm: 'grass-knot', hm: 'cut' },
  'hearthome-gym': { leader: 'leader-fantina', badge: 'relic', rule: 'darkness', ace: 'mismagius', tm: 'shadow-claw', hm: 'defog' },
  'veilstone-gym': { leader: 'leader-maylene', badge: 'cobble', rule: 'two-lanes', ace: 'lucario', tm: 'drain-punch', hm: 'fly' },
  'pastoria-gym': { leader: 'leader-wake', badge: 'fen', rule: 'tide', ace: 'floatzel', tm: 'brine', hm: 'surf' },
  'canalave-gym': { leader: 'leader-byron', badge: 'mine', rule: 'iron-defense', ace: 'bastiodon', tm: 'flash-cannon', hm: 'strength' },
  'snowpoint-gym': { leader: 'leader-candice', badge: 'icicle', rule: 'ice-floor', ace: 'froslass', tm: 'avalanche', hm: 'rock-climb' },
  'sunyshore-gym': { leader: 'leader-volkner', badge: 'beacon', rule: 'charge', ace: 'electivire', tm: 'charge-beam', hm: 'waterfall' },
};

function run(state: LevelState, seconds: number, dt = 1 / 20): LevelEvent[] {
  const events: LevelEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...step(state, dt));
  return events;
}

describe('gyms 2 to 8', () => {
  for (const [id, g] of Object.entries(GYMS)) {
    it(`${id}: ten waves, six trainers, three leader waves, the ace as a boss, the rule and the badge`, () => {
      const def = getLevel(id);
      const waves = def.waves as WaveDef[];
      expect(waves).toHaveLength(10);
      for (let i = 0; i < 6; i++) {
        const trainers = waveTrainers(waves[i]);
        expect(trainers).toHaveLength(1);
        expect(trainers[0]!.id).not.toBe(g.leader);
        expect(TRAINER_ART[trainers[0]!.id], trainers[0]!.id).toBeDefined();
      }
      for (let i = 6; i < 10; i++) expect(waveTrainers(waves[i])[0]!.id).toBe(g.leader);
      expect(TRAINER_ART[g.leader]!.mugshot).toBe(true);
      const ace = waveTrainers(waves[9])[0]!.party;
      expect(ace).toHaveLength(1);
      expect(ace[0]).toMatchObject({ species: g.ace, boss: true });
      expect(findMoveId(ace[0]!.moves![0]!.move)).toBeDefined();
      expect(def.rules?.map((r) => r.id)).toContain(g.rule);
      expect(def.reward).toMatchObject({ badge: { id: g.badge }, tm: g.tm, flags: expect.arrayContaining([g.hm]) });
      expect(def.badge?.id).toBe(g.badge);
      expect(def.levelCap).toBeGreaterThanOrEqual(25);
      expect(def.mapPos).toBeDefined();
      const levels = waves.flatMap((w) => waveTrainers(w).flatMap((t) => t.party.map((p) => p.level)));
      expect(Math.min(...levels)).toBeGreaterThanOrEqual(16);
      expect(Math.max(...levels)).toBeLessThanOrEqual(50);
    });

    it(`${id}: plays through to the badge with a strong party`, () => {
      const def = getLevel(id);
      const map = getMap(def.map);
      const party = [createMonster(389, 100, [findMoveId('earthquake')!]), createMonster(392, 100, [findMoveId('flamethrower')!]), createMonster(395, 100, [findMoveId('surf')!]), createMonster(448, 100, [findMoveId('aura-sphere')!])];
      const state = createLevel(def, map, { seed: 7, party, starter: 387 });
      map.placeable.slice(0, party.length).forEach(([x, y], i) => {
        try {
          placeTower(state, i, x, y);
        } catch {
          // a flooded shore spot or the like: skip it
        }
      });
      expect(state.towers.length).toBeGreaterThan(0);
      let guard = 0;
      while (state.phase === 'build' && guard++ < 12) {
        const events = startWave(state);
        if (state.wave === 7) expect(events.some((e) => e.type === 'trainerStart' && e.trainer?.id === g.leader)).toBe(true);
        if (state.wave === 10) expect(state.pending.some((s) => s.boss)).toBe(true);
        run(state, 150);
      }
      expect(state.phase).toBe('won');
      expect(state.wavesCleared).toBe(10);
      const summary = summarize(state);
      expect(summary.badge?.id).toBe(g.badge);
      expect(summary.trainer).toContain(waveTrainers((def.waves as WaveDef[])[9])[0]!.name.split(' ').pop());
      const game = createGameState();
      recordLevelResult(game, id, 'won', 10, state.kos);
      expect(game.badges).toContain(g.badge);
      expect(hasFlag(game, `tm-${g.tm}`)).toBe(true);
      expect(hasFlag(game, g.hm)).toBe(true);
    });
  }

  it('badge perks: placements grow one per badge from two outside demo mode', () => {
    const game = createGameState();
    const def = getLevel('eterna-gym');
    if (DEMO_MODE) {
      expect(placementLimit(game, def)).toBe(def.placements);
      return;
    }
    expect(placementLimit(game, def)).toBe(2);
    game.badges.push('coal', 'forest');
    expect(placementLimit(game, def)).toBe(4);
  });

  it('gym 1 keeps its rockfall and awards the Coal Badge with Stealth Rock and Rock Smash', () => {
    const mine = getLevel('oreburgh-mine-1f');
    expect(mine.rules?.[0]?.id).toBe('rockfall');
    expect(mine.badge?.id).toBe('coal');
    expect(mine.reward).toMatchObject({ tm: 'stealth-rock', flags: expect.arrayContaining(['rock-smash']) });
  });
});
