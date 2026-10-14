/**
 * Iron Defense (Canalave Gym): Steel-type enemies carry a shield worth a
 * share of their HP; only special moves or Fire, Fighting and Ground hits
 * wear it down, other physical hits bounce off.
 */
import { FIGHTING, FIRE, GROUND, STEEL } from './helpers';
import type { RuleModule } from './types';
import { num } from './types';

export const ironDefense: RuleModule = {
  id: 'iron-defense',
  create(params) {
    const share = num(params, 'shield', 0.25);
    return {
      id: 'iron-defense',
      onSpawn(_ctx, enemy) {
        if (enemy.mon.types.includes(STEEL)) enemy.shield = Math.max(1, Math.round(enemy.mon.stats.hp * share));
      },
      onHit(ctx, _tower, enemy, move, damage) {
        if (!enemy.shield || enemy.shield <= 0) return damage;
        const breaks = move.category === 'special' || [FIRE, FIGHTING, GROUND].includes(move.type);
        if (!breaks) return 0;
        const absorbed = Math.min(enemy.shield, damage);
        enemy.shield -= absorbed;
        if (enemy.shield <= 0) ctx.events.push({ type: 'rule', rule: 'iron-defense', enemyId: enemy.id, text: 'The shield broke!' });
        return damage - absorbed;
      },
      banner() {
        return 'Iron Defense';
      },
    };
  },
};
