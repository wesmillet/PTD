import { describe, expect, it } from 'vitest';
import { findMoveId } from '../data/pokedata';
import { createMonster } from './monster';
import { MOVE_OVERRIDE_DEFAULTS, learnableAt, resolveMove, startingMoves, unknownOverrideNames } from './moves';

const id = (name: string) => findMoveId(name) as number;

describe('resolveMove', () => {
  it('applies defaults for moves without overrides', () => {
    const tackle = resolveMove(id('tackle'));
    expect(tackle).toMatchObject({ name: 'tackle', range: 1.5, cooldownMultiplier: 1, targeting: 'nearest' });
    expect(MOVE_OVERRIDE_DEFAULTS).toEqual({ range: 1.5, cooldown: 1.0, targeting: 'nearest' });
  });

  it('merges overrides over data', () => {
    expect(resolveMove(id('razor-leaf'))).toMatchObject({ range: 3, cooldownMultiplier: 1, targeting: 'nearest', power: 55 });
    expect(resolveMove(id('rock-throw'))).toMatchObject({ range: 3, targeting: 'strongest' });
    expect(resolveMove(id('quick-attack'))).toMatchObject({ range: 1.5, cooldownMultiplier: 0.7 });
    expect(resolveMove(id('supersonic'))).toMatchObject({ targeting: 'furthest', category: 'status' });
  });

  it('targets self for user-targeted moves even without an override', () => {
    expect(resolveMove(id('withdraw')).targeting).toBe('self');
    expect(resolveMove(id('sharpen')).targeting).toBe('self'); // not in overrides, target "user"
  });

  it('only overrides real moves', () => {
    expect(unknownOverrideNames()).toEqual([]);
  });
});

describe('learnsets', () => {
  it('gives the last four moves known at a level', () => {
    expect(startingMoves(387, 5).map((m) => resolveMove(m).name)).toEqual(['tackle', 'withdraw']);
    expect(startingMoves(387, 20).map((m) => resolveMove(m).name)).toEqual(['withdraw', 'absorb', 'razor-leaf', 'curse']);
    expect(startingMoves(387, 21).map((m) => resolveMove(m).name)).toEqual(['absorb', 'razor-leaf', 'curse', 'bite']);
    expect(startingMoves(387, 1).map((m) => resolveMove(m).name)).toEqual(['tackle']);
    expect(startingMoves(396, 2).map((m) => resolveMove(m).name)).toEqual(['tackle', 'growl']);
  });

  it('defaults the active move to the first damaging move', () => {
    const darkrai = createMonster(491, 50); // Hypnosis, Feint Attack, Nightmare, Double Team
    expect(darkrai.moves.map((m) => resolveMove(m.id).name)).toEqual(['hypnosis', 'feint-attack', 'nightmare', 'double-team']);
    expect(darkrai.activeMove).toBe(1);
    expect(createMonster(387, 5).activeMove).toBe(0); // Tackle, Withdraw
    expect(createMonster(387, 5, [110]).activeMove).toBe(0); // only a status move
  });

  it('lists moves learned exactly at a level', () => {
    expect(learnableAt(387, 9).map((m) => resolveMove(m).name)).toEqual(['absorb']);
    expect(learnableAt(387, 10)).toEqual([]);
    expect(learnableAt(387, 13).map((m) => resolveMove(m).name)).toEqual(['razor-leaf']);
  });
});
