/** Wind (Valley Windworks): every N seconds a gust pushes enemies back, the next one blows them forward. */
import type { RuleModule } from './types';
import { num } from './types';

export const wind: RuleModule = {
  id: 'wind',
  create(params) {
    const every = num(params, 'every', 8);
    const push = num(params, 'push', 2);
    let timer = every;
    let back = true;
    return {
      id: 'wind',
      onWaveStart() {
        timer = every;
        back = true;
      },
      onTick(ctx, dt) {
        timer -= dt;
        if (timer > 0) return;
        timer += every;
        for (const enemy of ctx.state.enemies) {
          if (enemy.distance < 0) continue;
          enemy.distance = Math.max(0, enemy.distance + (back ? -push : push));
        }
        ctx.events.push({ type: 'rule', rule: 'wind', text: back ? 'Gust! The fans push everyone back.' : 'The gust blows them forward!' });
        back = !back;
      },
      banner() {
        return 'Wind';
      },
      status() {
        return { id: 'wind', label: back ? 'Gust (back)' : 'Gust (forward)', value: every - timer, max: every };
      },
    };
  },
};
