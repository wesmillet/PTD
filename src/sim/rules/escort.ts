/**
 * Escort (Eterna Forest): a partner walks the path during waves; enemies
 * within a tile hurt her and the level is lost if her HP runs out.
 */
import { findPokemonId } from '../../data/pokedata';
import type { RuleModule } from './types';
import { num, str } from './types';
import { enemyPos } from './helpers';

export const escort: RuleModule = {
  id: 'escort',
  create(params) {
    const name = str(params, 'name', 'Cheryl');
    const species = findPokemonId(str(params, 'species', 'chansey')) ?? 113;
    const hp = num(params, 'hp', 20);
    const speed = num(params, 'speed', 0.35);
    const reach = num(params, 'reach', 1);
    const dps = num(params, 'damagePerSecond', 1);
    let hurtTimer = 0;
    return {
      id: 'escort',
      onCreate(ctx) {
        ctx.state.escort = { name, species, distance: 0, hp, maxHp: hp, tilesPerSec: speed };
      },
      onTick(ctx, dt) {
        const e = ctx.state.escort;
        if (!e || e.hp <= 0) return;
        e.distance = Math.min(ctx.state.path.length, e.distance + e.tilesPerSec * dt);
        const p = pointOnMain(ctx.state, e.distance);
        const attackers = ctx.state.enemies.filter((en) => en.distance >= 0 && Math.hypot(enemyPos(ctx.state, en).x - p.x, enemyPos(ctx.state, en).y - p.y) <= reach).length;
        if (attackers === 0) return;
        hurtTimer += dt * attackers * dps;
        while (hurtTimer >= 1 && e.hp > 0) {
          hurtTimer -= 1;
          e.hp -= 1;
          ctx.events.push({ type: 'rule', rule: 'escort', amount: 1, text: `${name} is hurt!` });
        }
      },
      lost(ctx) {
        return (ctx.state.escort?.hp ?? 1) <= 0;
      },
      banner() {
        return `Escort ${name}`;
      },
      status(ctx) {
        const e = ctx.state.escort;
        return e ? { id: 'escort', label: name, value: e.hp, max: e.maxHp } : undefined;
      },
    };
  },
};

function pointOnMain(state: { path: { segments: { from: readonly [number, number]; dx: number; dy: number; length: number; start: number }[] } }, distance: number): { x: number; y: number } {
  for (const seg of state.path.segments) {
    if (distance <= seg.start + seg.length) {
      const t = distance - seg.start;
      return { x: seg.from[0] + seg.dx * t, y: seg.from[1] + seg.dy * t };
    }
  }
  const last = state.path.segments[state.path.segments.length - 1]!;
  return { x: last.from[0] + last.dx * last.length, y: last.from[1] + last.dy * last.length };
}
