/** Nightmare (Newmoon Island): each wave one random tower sleeps for the wave unless the save holds the ward item. */
import type { Tower } from '../level';
import type { RuleModule } from './types';
import { str } from './types';

export const nightmare: RuleModule = {
  id: 'nightmare',
  create(params) {
    const ward = str(params, 'ward', 'lunar-wing');
    let sleeping: Tower | null = null;
    return {
      id: 'nightmare',
      onWaveStart(ctx) {
        if (ctx.state.flags.has(ward) || ctx.state.towers.length === 0) return;
        sleeping = ctx.state.rng.pick(ctx.state.towers);
        sleeping.mon.status.ailment = 'sleep';
        sleeping.mon.status.ailmentSeconds = 1e6;
        ctx.events.push({ type: 'rule', rule: 'nightmare', towerId: sleeping.id, text: `${sleeping.mon.name} fell into a nightmare!` });
      },
      onWaveEnd() {
        if (sleeping && sleeping.mon.status.ailment === 'sleep') {
          sleeping.mon.status.ailment = 'none';
          sleeping.mon.status.ailmentSeconds = 0;
        }
        sleeping = null;
      },
      banner(ctx) {
        return ctx.state.flags.has(ward) ? 'Nightmares warded off' : 'Nightmare';
      },
    };
  },
};
