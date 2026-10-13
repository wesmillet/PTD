import { describe, expect, it } from 'vitest';
import { expForLevel, findMoveId } from '../data/pokedata';
import { replaceMove, usePotion, useRareCandy } from './items';
import { createMonster } from './monster';

describe('items', () => {
  it('potion restores full HP and reports the amount', () => {
    const mon = createMonster(387, 10);
    mon.hp = 5;
    expect(usePotion(mon)).toBe(mon.stats.hp - 5);
    expect(mon.hp).toBe(mon.stats.hp);
    expect(usePotion(mon)).toBe(0);
  });

  it('rare candy raises one level, learns or queues moves, and reports evolution', () => {
    const mon = createMonster(387, 8); // Tackle, Withdraw
    const r9 = useRareCandy(mon);
    expect(r9.level).toBe(9);
    expect(mon.level).toBe(9);
    expect(mon.exp).toBe(expForLevel('medium-slow', 9));
    expect(r9.learned).toEqual([findMoveId('absorb')]);
    expect(r9.toLearn).toEqual([]);
    expect(r9.evolution).toBeUndefined();

    const full = createMonster(387, 12, [33, 110, 71, 45]);
    const r13 = useRareCandy(full);
    expect(r13.toLearn).toEqual([findMoveId('razor-leaf')]);
    expect(full.moves).toHaveLength(4);
    replaceMove(full, 3, findMoveId('razor-leaf') as number);
    expect(full.moves[3]?.id).toBe(findMoveId('razor-leaf'));

    const pre = createMonster(387, 17);
    expect(useRareCandy(pre).evolution).toEqual({ to: 388, toName: 'grotle' });
  });

  it('rare candy stops at level 100', () => {
    const mon = createMonster(387, 99);
    expect(useRareCandy(mon).level).toBe(100);
    expect(() => useRareCandy(mon)).toThrow(/100/);
  });
});
