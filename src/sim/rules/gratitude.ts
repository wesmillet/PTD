/** Gratitude (Flower Paradise): catches raise the meter, KOs lower it; the last wave's boss needs it half full. */
import type { RuleModule } from './types';
import { num } from './types';

export const gratitude: RuleModule = {
  id: 'gratitude',
  create(params) {
    const max = num(params, 'max', 10);
    let meter = num(params, 'start', 0);
    return {
      id: 'gratitude',
      onCaught(ctx) {
        meter = Math.min(max, meter + 1);
        ctx.events.push({ type: 'rule', rule: 'gratitude', amount: meter, text: 'Gratitude rises.' });
      },
      onKo(ctx, enemy) {
        if (enemy.boss) return;
        meter = Math.max(0, meter - 1);
        ctx.events.push({ type: 'rule', rule: 'gratitude', amount: meter, text: 'Gratitude falls.' });
      },
      onWaveEnd(ctx) {
        if (meter >= max / 2) ctx.events.push({ type: 'rule', rule: 'gratitude', text: 'The flower path grows a little.' });
      },
      banner() {
        return 'Gratitude';
      },
      status() {
        return { id: 'gratitude', label: 'Gratitude', value: meter, max };
      },
    };
  },
};
