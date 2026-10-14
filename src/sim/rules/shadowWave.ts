/** Shadow wave (Galactic HQ): every Nth wave every spawn is a Shadow Pokémon. */
import type { RuleModule } from './types';
import { num } from './types';

export const shadowWave: RuleModule = {
  id: 'shadow-wave',
  create(params) {
    const every = num(params, 'every', 3);
    const isShadow = (waveIndex: number) => (waveIndex + 1) % every === 0;
    return {
      id: 'shadow-wave',
      onWaveStart(ctx, waveIndex) {
        if (!isShadow(waveIndex)) return;
        for (const s of ctx.state.pending) s.shadow = true;
        ctx.events.push({ type: 'rule', rule: 'shadow-wave', text: 'A Shadow wave! The machine’s Pokémon have no heart.' });
      },
      banner(_ctx, waveIndex) {
        return isShadow(waveIndex) ? 'Shadow wave' : undefined;
      },
    };
  },
};
