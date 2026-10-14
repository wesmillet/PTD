/**
 * Charge (Sunyshore Gym): every cleared wave charges a generator; at full
 * charge the Magnetic Flux button stuns every enemy on the path for a while.
 */
import type { RuleModule } from './types';
import { num } from './types';

export const charge: RuleModule = {
  id: 'charge',
  create(params) {
    const needed = num(params, 'needed', 3);
    const seconds = num(params, 'seconds', 5);
    let charges = num(params, 'start', 0);
    return {
      id: 'charge',
      onWaveEnd(ctx) {
        charges = Math.min(needed, charges + 1);
        ctx.events.push({ type: 'rule', rule: 'charge', text: charges >= needed ? 'Magnetic Flux is ready!' : `Generator charged ${charges}/${needed}.` });
      },
      activate(ctx) {
        if (charges < needed) return false;
        charges = 0;
        for (const enemy of ctx.state.enemies) if (enemy.distance >= 0) enemy.stun = Math.max(enemy.stun, seconds);
        ctx.events.push({ type: 'rule', rule: 'charge', text: 'Magnetic Flux! Every enemy on the path is paralysed.' });
        return true;
      },
      status() {
        return { id: 'charge', label: 'Generator', value: charges, max: needed, ...(charges >= needed ? { button: 'Magnetic Flux' } : {}) };
      },
    };
  },
};
