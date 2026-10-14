/** Two lanes (Veilstone Gym): each wave the enemies pick a lane at the gate, announced on the banner. */
import type { RuleModule } from './types';

export const twoLanes: RuleModule = {
  id: 'two-lanes',
  create(params) {
    const names = Array.isArray(params.names) ? (params.names as string[]) : ['Left lane', 'Right lane'];
    let lane: string | undefined;
    let laneIndex = 0;
    return {
      id: 'two-lanes',
      onWaveStart(ctx, waveIndex) {
        // Decided once per wave, before the spawns asked (pickLane runs first and seeds this).
        if (lane === undefined) this.pickLane?.(ctx, waveIndex, 0);
        ctx.events.push({ type: 'rule', rule: 'two-lanes', text: `${names[laneIndex] ?? lane}!` });
      },
      onWaveEnd() {
        lane = undefined;
      },
      pickLane(ctx) {
        if (lane === undefined) {
          const all = ctx.state.def.lanes ?? Object.keys(ctx.state.lanes);
          laneIndex = ctx.state.rng.int(0, all.length - 1);
          lane = all[laneIndex];
        }
        return lane;
      },
      banner() {
        return names[laneIndex] ?? lane;
      },
      status() {
        return lane ? { id: 'two-lanes', label: names[laneIndex] ?? lane } : undefined;
      },
    };
  },
};
