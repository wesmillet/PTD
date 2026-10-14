/**
 * Rooms (Turnback Cave): every wave one lane is the wrong room. Enemies
 * that walk it reach the end only to be sent back to the start; the banner
 * names the room that is wrong this wave.
 */
import type { RuleModule } from './types';

export const rooms: RuleModule = {
  id: 'rooms',
  create(params) {
    const names = Array.isArray(params.names) ? (params.names as string[]) : [];
    let wrong: string | undefined;
    let wrongIndex = -1;
    const label = () => names[wrongIndex] ?? wrong ?? '?';
    return {
      id: 'rooms',
      onWaveStart(ctx) {
        const lanes = ctx.state.def.lanes ?? Object.keys(ctx.state.lanes);
        wrongIndex = ctx.state.rng.int(0, lanes.length - 1);
        wrong = lanes[wrongIndex];
        ctx.events.push({ type: 'rule', rule: 'rooms', text: `The rooms shuffle: the ${label()} leads back to the start.` });
      },
      onReachEnd(ctx, enemy) {
        if (enemy.lane !== wrong) return false;
        enemy.distance = 0;
        ctx.events.push({ type: 'rule', rule: 'rooms', enemyId: enemy.id, text: `${enemy.mon.name} took the wrong room and is back at the start!` });
        return true;
      },
      banner() {
        return wrong ? `Wrong room: ${label()}` : undefined;
      },
      status() {
        return wrong ? { id: 'rooms', label: `Wrong room: ${label()}` } : undefined;
      },
    };
  },
};
