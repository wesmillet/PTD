/** Tag ally: free allied towers on named spots for a range of waves (Riley's Lucario, Cheryl's Chansey). */
import { placeAlly } from '../level';
import type { AllyDef } from '../waves';
import type { RuleModule } from './types';

export const tagAlly: RuleModule = {
  id: 'tag-ally',
  create(params) {
    const allies = Array.isArray(params.allies) ? (params.allies as AllyDef[]) : [];
    return {
      id: 'tag-ally',
      onWaveStart(ctx, waveIndex) {
        const wave = waveIndex + 1;
        allies.forEach((ally, i) => {
          const [a, b] = ally.waves ?? [1, Number.MAX_SAFE_INTEGER];
          if (wave >= a && wave <= b) placeAlly(ctx.state, ally, `tag-${i}`, b, ctx.events);
        });
      },
      banner(_ctx, waveIndex) {
        const wave = waveIndex + 1;
        const names = allies.filter((a) => wave >= (a.waves?.[0] ?? 1) && wave <= (a.waves?.[1] ?? Number.MAX_SAFE_INTEGER)).map((a) => a.name ?? a.species);
        return names.length ? `With ${names.join(' and ')}` : undefined;
      },
    };
  },
};
