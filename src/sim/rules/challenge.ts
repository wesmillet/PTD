/**
 * Lottery challenge modifiers: solo (one Pokémon), monotype, no-catch,
 * level-cap (nothing above the cap placed), reverse (lanes backwards),
 * speedrun (the whole level within the time).
 */
import { lanesAreReversed, reverseLanes } from '../level';
import type { RuleModule } from './types';
import { num, str } from './types';

export const CHALLENGE_MODES = ['solo', 'monotype', 'no-catch', 'level-cap', 'reverse', 'speedrun'] as const;
export type ChallengeMode = (typeof CHALLENGE_MODES)[number];

export const challenge: RuleModule = {
  id: 'challenge',
  create(params) {
    const mode = str(params, 'mode', 'solo') as ChallengeMode;
    const type = num(params, 'type', 1);
    const cap = num(params, 'cap', 20);
    const seconds = num(params, 'seconds', 300);
    let elapsed = 0;
    return {
      id: 'challenge',
      onCreate(ctx) {
        if (mode === 'reverse' && !lanesAreReversed(ctx.state)) reverseLanes(ctx.state, ctx.events);
      },
      alwaysTick: true,
      onTick(_ctx, dt) {
        if (mode === 'speedrun') elapsed += dt;
      },
      canPlace(ctx, mon) {
        if (mode === 'solo' && ctx.state.towers.some((t) => !t.ally)) return 'Solo challenge: only one Pokémon';
        if (mode === 'monotype' && !mon.types.includes(type)) return 'Monotype challenge: wrong type';
        if (mode === 'level-cap' && mon.level > cap) return `Level cap ${cap}`;
        return null;
      },
      canThrow() {
        return mode === 'no-catch' ? 'No catching on this challenge' : null;
      },
      lost() {
        return mode === 'speedrun' && elapsed >= seconds;
      },
      banner() {
        return `Challenge: ${mode}`;
      },
      status() {
        return mode === 'speedrun' ? { id: 'challenge', label: 'Speedrun', value: Math.max(0, seconds - elapsed), max: seconds } : { id: 'challenge', label: `Challenge: ${mode}` };
      },
    };
  },
};
