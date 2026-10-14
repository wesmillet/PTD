/** Gravity shift (Distortion World): every other wave the lanes reverse; enemies come from the far end. */
import { lanesAreReversed, reverseLanes } from '../level';
import type { RuleModule } from './types';
import { num } from './types';

export const gravityShift: RuleModule = {
  id: 'gravity-shift',
  create(params) {
    const every = num(params, 'every', 2);
    const wantReversed = (waveIndex: number) => waveIndex % every === every - 1;
    return {
      id: 'gravity-shift',
      onWaveStart(ctx, waveIndex) {
        if (lanesAreReversed(ctx.state) !== wantReversed(waveIndex)) reverseLanes(ctx.state, ctx.events);
      },
      banner(ctx, waveIndex) {
        return wantReversed(waveIndex) ? 'Gravity shift: from the far end' : lanesAreReversed(ctx.state) ? 'Gravity shift' : undefined;
      },
      status(ctx) {
        return lanesAreReversed(ctx.state) ? { id: 'gravity-shift', label: 'Gravity shifted' } : undefined;
      },
    };
  },
};
