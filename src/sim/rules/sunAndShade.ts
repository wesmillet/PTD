/**
 * Sun and shade (Eterna Gym): odd waves are Sunny Day (Grass enemies 30 %
 * faster, Fire moves +50 %); on even waves tall grass hides enemies until a
 * tower stands next to them.
 */
import { FIRE, GRASS, towerNear } from './helpers';
import type { RuleModule } from './types';
import { num } from './types';

export const sunAndShade: RuleModule = {
  id: 'sun-and-shade',
  create(params) {
    const reveal = num(params, 'reveal', 1.5);
    let sunny = true;
    return {
      id: 'sun-and-shade',
      onWaveStart(ctx, waveIndex) {
        sunny = waveIndex % 2 === 0;
        ctx.events.push({ type: 'rule', rule: 'sun-and-shade', text: sunny ? 'Cherrim calls Sunny Day!' : 'Shade: the tall grass hides the path.' });
      },
      enemySpeed(_ctx, enemy) {
        return sunny && enemy.mon.types.includes(GRASS) ? 1.3 : 1;
      },
      damageMultiplier(_ctx, _tower, move) {
        return sunny && move.type === FIRE ? 1.5 : 1;
      },
      canTarget(ctx, _tower, enemy) {
        return sunny || towerNear(ctx.state, enemy, reveal);
      },
      banner(_ctx, waveIndex) {
        return waveIndex % 2 === 0 ? 'Sunny Day' : 'Shade';
      },
      status() {
        return { id: 'sun-and-shade', label: sunny ? 'Sunny Day' : 'Shade' };
      },
    };
  },
};
