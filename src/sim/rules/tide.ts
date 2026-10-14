/**
 * Tide (Pastoria Gym): on high-tide waves the spots marked `tide` flood and
 * only Water or Flying types may stand there (others are sent back to the
 * party); Rain Dance makes Water-type enemies faster on those waves.
 */
import { spotProps } from '../map';
import { unplaceTower } from '../level';
import { FLYING, WATER } from './helpers';
import type { RuleModule } from './types';
import { num } from './types';

export const tide: RuleModule = {
  id: 'tide',
  create(params) {
    const every = num(params, 'every', 2);
    let high = false;
    const swims = (types: readonly number[]) => types.includes(WATER) || types.includes(FLYING);
    return {
      id: 'tide',
      onWaveStart(ctx, waveIndex) {
        high = (waveIndex + 1) % every === 0;
        if (!high) return;
        for (const tower of [...ctx.state.towers]) {
          if (!spotProps(ctx.state.map, tower.tile[0], tower.tile[1]).tide || swims(tower.mon.types) || tower.ally) continue;
          unplaceTower(ctx.state, tower.id);
          ctx.events.push({ type: 'rule', rule: 'tide', towerId: tower.id, tile: tower.tile, text: `High tide! ${tower.mon.name} had to leave its spot.` });
        }
        ctx.events.push({ type: 'rule', rule: 'tide', text: 'High tide: the shore spots are under water.' });
      },
      canPlace(ctx, mon, tile) {
        return high && spotProps(ctx.state.map, tile[0], tile[1]).tide && !swims(mon.types) ? 'Only Water or Flying types can stand in the water' : null;
      },
      enemySpeed(_ctx, enemy) {
        return high && enemy.mon.types.includes(WATER) ? 1.3 : 1;
      },
      banner(_ctx, waveIndex) {
        return (waveIndex + 1) % every === 0 ? 'High tide' : 'Low tide';
      },
      status(ctx) {
        const flooded = high ? ctx.state.map.placeable.filter(([x, y]) => spotProps(ctx.state.map, x, y).tide) : [];
        return { id: 'tide', label: high ? 'High tide' : 'Low tide', blocked: flooded };
      },
    };
  },
};
