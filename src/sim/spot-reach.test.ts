import { describe, expect, it } from 'vitest';
import { getLevel, levelIds } from '../data/levels';
import { getMap } from '../data/maps';
import { createLevel, placeTower, startWave, step, type LevelEvent } from './level';
import { laneNames } from './map';
import { createMonster } from './monster';
import { findMoveId } from '../data/pokedata';
import type { LevelDef } from './waves';

/**
 * Geometry only: every spot must reach at least one lane with a level 5
 * Tackle. Rules (hail shrinking range, darkness) and scripts are stripped;
 * a plain Bidoof wave is sent down each lane in turn.
 */
describe('every placement spot can hit the path with a level 5 Tackle', () => {
  for (const id of levelIds()) {
    it(id, () => {
      const original = getLevel(id);
      const map = getMap(original.map);
      const def: LevelDef = {
        ...original,
        objective: 'defend',
        waves: 3,
        lives: 99,
        roster: [{ species: 'bidoof', rarity: 1, levels: [5, 5] }],
        enemiesFirstWave: 8,
        enemiesPerWave: 0,
        spawnInterval: 1,
        rules: [],
        allies: [],
        trainer: undefined as never,
        lanes: undefined as never,
      };
      const bad: string[] = [];
      for (const [x, y] of map.placeable) {
        let reached = false;
        for (const lane of laneNames(map)) {
          const state = createLevel(def, map, { seed: 3, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
          placeTower(state, 0, x, y);
          startWave(state);
          for (const s of state.pending) s.lane = lane;
          const events: LevelEvent[] = [];
          for (let t = 0; t < 90; t += 1 / 30) events.push(...step(state, 1 / 30));
          if (events.some((e) => e.type === 'hit')) {
            reached = true;
            break;
          }
        }
        if (!reached) bad.push(`${x},${y}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
