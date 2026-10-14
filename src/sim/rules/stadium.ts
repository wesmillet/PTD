/**
 * The Conference's field roulette: grass (tall grass hides enemies for their
 * first stretch of path), rock (Rock and Ground enemies 20 % faster), water
 * (two water spots take only Water and Flying types) and ice (enemies slide).
 */
import { FLYING, GROUND, WATER } from './helpers';
import type { RuleModule } from './types';
import { num, str } from './types';

const ROCK = 6;

export const stadium: RuleModule = {
  id: 'stadium',
  create(params) {
    const floor = str(params, 'floor', 'grass');
    const hide = num(params, 'hide', 2.5);
    return {
      id: 'stadium',
      canTarget(_ctx, _tower, enemy) {
        return floor !== 'grass' || enemy.distance > hide;
      },
      enemySpeed(_ctx, enemy) {
        if (floor === 'rock' && (enemy.mon.types.includes(ROCK) || enemy.mon.types.includes(GROUND))) return 1.2;
        if (floor === 'ice') return 1.4;
        return 1;
      },
      canPlace(ctx, mon, tile) {
        if (floor !== 'water') return null;
        // The two spots nearest the path's far end are the water spots.
        const spots = [...ctx.state.map.placeable].sort((a, b) => a[0] - b[0]);
        const water = spots.slice(-2);
        const isWater = water.some(([x, y]) => x === tile[0] && y === tile[1]);
        return isWater && !mon.types.includes(WATER) && !mon.types.includes(FLYING) ? 'Only Water or Flying types can stand on the water spots' : null;
      },
      banner() {
        return `${floor.charAt(0).toUpperCase()}${floor.slice(1)} field`;
      },
      status() {
        return { id: 'stadium', label: `${floor.charAt(0).toUpperCase()}${floor.slice(1)} field` };
      },
    };
  },
};
