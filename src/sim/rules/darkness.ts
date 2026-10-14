/**
 * Darkness (Hearthome Gym): towers see only `range` tiles unless they stand
 * in a lit lantern's glow; one more lantern lights per wave, and the
 * riddle's right answer lights two more (`activate("light")`).
 */
import type { Tile } from '../map';
import { pathTiles } from './helpers';
import type { RuleModule } from './types';
import { num } from './types';

export const darkness: RuleModule = {
  id: 'darkness',
  create(params) {
    const range = num(params, 'range', 2);
    const glow = num(params, 'glow', 2.5);
    const perWave = num(params, 'perWave', 1);
    const count = num(params, 'lanterns', 5);
    const given = Array.isArray(params.positions) ? (params.positions as Tile[]) : undefined;
    let lanterns: Tile[] = given ?? [];
    let lit = num(params, 'lit', 1);
    const litTiles = () => lanterns.slice(0, Math.min(lit, lanterns.length));
    return {
      id: 'darkness',
      onCreate(ctx) {
        if (!given) lanterns = pathTiles(ctx.state, count);
      },
      onWaveStart(ctx, waveIndex) {
        if (waveIndex > 0) lit = Math.min(lanterns.length, lit + perWave);
        ctx.events.push({ type: 'rule', rule: 'darkness', text: `${litTiles().length} of ${lanterns.length} lanterns lit.` });
      },
      range(_ctx, tower, base) {
        const inGlow = litTiles().some(([x, y]) => Math.hypot(x - tower.tile[0], y - tower.tile[1]) <= glow);
        return inGlow ? base : Math.min(base, range);
      },
      activate(ctx, action) {
        if (action !== 'light') return false;
        lit = Math.min(lanterns.length, lit + 2);
        ctx.events.push({ type: 'rule', rule: 'darkness', text: 'Two more lanterns light up!' });
        return true;
      },
      banner() {
        return 'Darkness';
      },
      status() {
        return { id: 'darkness', label: 'Lanterns', value: litTiles().length, max: lanterns.length, glow: litTiles().map((tile) => ({ tile, radius: glow })) };
      },
    };
  },
};
