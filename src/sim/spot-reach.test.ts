import { describe, expect, it } from 'vitest';
import { getLevel, levelIds } from '../data/levels';
import { getMap } from '../data/maps';
import { createLevel, placeTower, startWave, step, type LevelEvent } from './level';
import { createMonster } from './monster';
import { findMoveId } from '../data/pokedata';

describe('every placement spot can hit the path with a level 5 Tackle', () => {
  for (const id of levelIds()) {
    it(id, () => {
      const def = getLevel(id);
      const map = getMap(def.map);
      const bad: string[] = [];
      for (const [x, y] of map.placeable) {
        const state = createLevel(def, map, { seed: 3, party: [createMonster(387, 5, [findMoveId('tackle')!])] });
        placeTower(state, 0, x, y);
        startWave(state);
        const events: LevelEvent[] = [];
        for (let t = 0; t < 90; t += 1 / 30) events.push(...step(state, 1 / 30));
        const attacks = events.filter((e) => e.type === 'hit');
        if (attacks.length === 0) bad.push(`${x},${y}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
