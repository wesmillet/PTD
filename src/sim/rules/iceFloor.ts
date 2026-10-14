/**
 * Ice floor (Snowpoint Gym): enemies slide faster over the ice region (the
 * middle third of the map unless `ice: [x0, y0, x1, y1]` says otherwise);
 * hail pulses at each wave start shrink every tower's range for a few seconds.
 */
import { enemyPos } from './helpers';
import type { RuleModule } from './types';
import { num } from './types';

export const iceFloor: RuleModule = {
  id: 'ice-floor',
  create(params) {
    const speed = num(params, 'speed', 1.6);
    const hailShrink = num(params, 'hailShrink', 1);
    const hailSeconds = num(params, 'hailSeconds', 5);
    const hailFrom = num(params, 'hailFrom', 1);
    const given = Array.isArray(params.ice) ? (params.ice as number[]) : undefined;
    let ice: [number, number, number, number] = [0, 0, 0, 0];
    let hail = 0;
    return {
      id: 'ice-floor',
      onCreate(ctx) {
        const w = ctx.state.map.width;
        ice = given && given.length === 4 ? [given[0]!, given[1]!, given[2]!, given[3]!] : [Math.floor(w / 3), 0, Math.ceil((2 * w) / 3), ctx.state.map.height];
      },
      onWaveStart(ctx, waveIndex) {
        if (waveIndex + 1 < hailFrom) return;
        hail = hailSeconds;
        ctx.events.push({ type: 'rule', rule: 'ice-floor', text: 'Hail! Everyone sees a tile less.' });
      },
      onTick(_ctx, dt) {
        if (hail > 0) hail = Math.max(0, hail - dt);
      },
      enemySpeed(ctx, enemy) {
        const p = enemyPos(ctx.state, enemy);
        return p.x >= ice[0] && p.x < ice[2] && p.y >= ice[1] && p.y < ice[3] ? speed : 1;
      },
      range(_ctx, _tower, base) {
        return hail > 0 ? base - hailShrink : base;
      },
      banner() {
        return 'Ice floor';
      },
      status() {
        return hail > 0 ? { id: 'ice-floor', label: 'Hail', value: hail, max: hailSeconds } : { id: 'ice-floor', label: 'Ice floor' };
      },
    };
  },
};
