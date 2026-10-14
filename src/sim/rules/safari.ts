/**
 * Safari (Great Marsh): no damage, bait and mud only. Towers' hits do
 * nothing; every wild Pokémon walks the path for `flee` seconds and then
 * runs, so the only way to keep one is a ball. The Bait button slows every
 * Pokémon on the path by half for `baitSeconds`, then needs `baitCooldown`
 * seconds; Mud (the second press while bait is out) makes them easier to
 * catch by stopping them for a second instead.
 */
import type { RuleModule } from './types';
import { num } from './types';

export const safari: RuleModule = {
  id: 'safari',
  create(params) {
    const flee = num(params, 'flee', 20);
    const baitSeconds = num(params, 'baitSeconds', 8);
    const baitCooldown = num(params, 'baitCooldown', 15);
    let bait = 0;
    let cooldown = 0;
    return {
      id: 'safari',
      onWaveStart(ctx) {
        for (const s of ctx.state.pending) if (!s.trainer && s.fleeAfter === undefined) s.fleeAfter = flee;
        bait = 0;
        cooldown = 0;
      },
      onTick(_ctx, dt) {
        if (bait > 0) bait = Math.max(0, bait - dt);
        else if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      },
      onHit() {
        return 0;
      },
      enemySpeed() {
        return bait > 0 ? 0.5 : 1;
      },
      activate(ctx, action) {
        if (action !== undefined && action !== 'bait' && action !== 'mud') return false;
        if (cooldown > 0 || bait > 0) return false;
        if (action === 'mud') {
          for (const e of ctx.state.enemies) if (e.distance >= 0) e.stun = Math.max(e.stun, 1);
          cooldown = baitCooldown;
          ctx.events.push({ type: 'rule', rule: 'safari', text: 'Mud! Everyone on the path stops for a moment.' });
          return true;
        }
        bait = baitSeconds;
        cooldown = baitCooldown;
        ctx.events.push({ type: 'rule', rule: 'safari', text: 'Bait! The Pokémon slow down to eat.' });
        return true;
      },
      banner() {
        return 'Safari rules';
      },
      status() {
        if (bait > 0) return { id: 'safari', label: 'Bait out', value: bait, max: baitSeconds };
        if (cooldown > 0) return { id: 'safari', label: 'Bait', value: baitCooldown - cooldown, max: baitCooldown };
        return { id: 'safari', label: 'Safari', button: 'Throw bait' };
      },
    };
  },
};
