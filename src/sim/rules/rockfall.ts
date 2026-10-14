/** Rockfall: every Nth wave a free placement spot is blocked for the wave (Onix drops it). */
import type { Tile } from '../map';
import type { RuleModule } from './types';
import { num } from './types';

export const rockfall: RuleModule = {
  id: 'rockfall',
  create(params) {
    const every = num(params, 'every', 3);
    let blocked: Tile | null = null;
    return {
      id: 'rockfall',
      onWaveStart(ctx, waveIndex) {
        blocked = null;
        if ((waveIndex + 1) % every !== 0) return;
        const free = ctx.state.map.placeable.filter(([x, y]) => !ctx.state.towers.some((t) => t.tile[0] === x && t.tile[1] === y));
        if (free.length === 0) return;
        blocked = ctx.state.rng.pick(free);
        ctx.events.push({ type: 'rule', rule: 'rockfall', tile: blocked, text: 'Rockfall! A spot is buried for this wave.' });
      },
      onWaveEnd() {
        blocked = null;
      },
      canPlace(_ctx, _mon, tile) {
        return blocked && blocked[0] === tile[0] && blocked[1] === tile[1] ? 'A rockfall blocks this spot' : null;
      },
      banner(_ctx, waveIndex) {
        return (waveIndex + 1) % every === 0 ? 'Rockfall' : undefined;
      },
      status() {
        return blocked ? { id: 'rockfall', label: 'Rockfall', blocked: [blocked] } : undefined;
      },
    };
  },
};
