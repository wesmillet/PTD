/**
 * Timer (Lake Valor): on the named wave (or every boss wave) the player has
 * `seconds` to KO the boss; when time runs out the level is lost.
 */
import { activeBoss } from '../level';
import type { RuleModule } from './types';
import { num } from './types';

export const timer: RuleModule = {
  id: 'timer',
  create(params) {
    const seconds = num(params, 'seconds', 90);
    const wave = num(params, 'wave', 0); // 1-based; 0 = every wave with a boss
    const label = typeof params.label === 'string' ? params.label : 'Timer';
    let remaining = 0;
    let armed = false;
    let expired = false;
    return {
      id: 'timer',
      onWaveStart(ctx, waveIndex) {
        armed = wave ? wave === waveIndex + 1 : ctx.state.pending.some((s) => s.boss);
        remaining = armed ? seconds : 0;
        expired = false;
        if (armed) ctx.events.push({ type: 'rule', rule: 'timer', text: `${label}: ${seconds} seconds!` });
      },
      onWaveEnd() {
        armed = false;
      },
      onTick(ctx, dt) {
        if (!armed) return;
        remaining = Math.max(0, remaining - dt);
        const bossAlive = activeBoss(ctx.state) !== undefined || ctx.state.pending.some((s) => s.boss);
        if (remaining <= 0 && bossAlive) expired = true;
      },
      lost() {
        return expired;
      },
      banner(_ctx, waveIndex) {
        return wave === waveIndex + 1 ? `${label}: ${seconds} s` : undefined;
      },
      status() {
        return armed ? { id: 'timer', label, value: remaining, max: seconds } : undefined;
      },
    };
  },
};
