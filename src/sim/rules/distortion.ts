/**
 * Space-time distortion (Hisui rifts): once per level, at a random wave, a
 * purple dome covers part of the map for a minute and rare Hisuian spawns
 * walk the path, one in twenty of them a shiny Alpha.
 */
import { findPokemonId } from '../../data/pokedata';
import type { RuleModule } from './types';
import { num } from './types';

export const distortion: RuleModule = {
  id: 'distortion',
  create(params) {
    const seconds = num(params, 'seconds', 60);
    const names = Array.isArray(params.rares) ? (params.rares as string[]) : ['typhlosion-hisui', 'samurott-hisui', 'decidueye-hisui', 'voltorb-hisui', 'electrode-hisui'];
    const count = num(params, 'count', 3);
    const shinyAlpha = num(params, 'shinyAlpha', 1 / 20);
    let wave = -1;
    let remaining = 0;
    let centre: [number, number] = [0, 0];
    return {
      id: 'distortion',
      onCreate(ctx) {
        const total = Array.isArray(ctx.state.def.waves) ? ctx.state.def.waves.length : (ctx.state.def.waves ?? 4);
        wave = ctx.state.rng.int(1, Math.max(1, total - 1));
      },
      onWaveStart(ctx, waveIndex) {
        if (waveIndex !== wave) return;
        remaining = seconds;
        const p = ctx.state.map.path[Math.floor(ctx.state.map.path.length / 2)] ?? [0, 0];
        centre = [p[0], p[1]];
        const levels = ctx.state.def.levels ?? [30, 40];
        const last = ctx.state.pending[ctx.state.pending.length - 1];
        const delay = (last?.delay ?? 0) + ctx.state.def.spawnInterval;
        for (let i = 0; i < count; i++) {
          const species = findPokemonId(ctx.state.rng.pick(names));
          if (species === undefined) continue;
          const alpha = ctx.state.rng.chance(shinyAlpha);
          ctx.state.pending.push({ species, level: ctx.state.rng.int(levels[0], levels[1]) + (alpha ? 10 : 0), delay: delay + i * ctx.state.def.spawnInterval, ...(alpha ? { alpha: true, shiny: true } : {}) });
        }
        ctx.events.push({ type: 'rule', rule: 'distortion', tile: centre, text: 'A space-time distortion opens!' });
      },
      onTick(ctx, dt) {
        if (remaining <= 0) return;
        remaining = Math.max(0, remaining - dt);
        if (remaining === 0) ctx.events.push({ type: 'rule', rule: 'distortion', text: 'The distortion fades.' });
      },
      banner(_ctx, waveIndex) {
        return waveIndex === wave ? 'Space-time distortion' : undefined;
      },
      status() {
        return remaining > 0 ? { id: 'distortion', label: 'Distortion', value: remaining, max: seconds, glow: [{ tile: centre, radius: 5 }] } : undefined;
      },
    };
  },
};
