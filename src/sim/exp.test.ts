import { describe, expect, it } from 'vitest';
import { expForLevel } from '../data/pokedata';
import { expToNextFraction, gainExp, hitExp, koExp, levelForExp } from './exp';

describe('exp', () => {
  it('finds the level for a total EXP on a curve', () => {
    expect(levelForExp('medium-slow', 0)).toBe(1);
    expect(levelForExp('medium-slow', expForLevel('medium-slow', 5))).toBe(5);
    expect(levelForExp('medium-slow', expForLevel('medium-slow', 6) - 1)).toBe(5);
    expect(levelForExp('medium-slow', 1059860)).toBe(100);
    expect(levelForExp('medium-slow', 99999999)).toBe(100);
    expect(levelForExp('fast', 800000)).toBe(100);
  });

  it('uses the Gen 4 wild KO formula and a fraction for hits', () => {
    expect(koExp(64, 7)).toBe(64); // level 7 Turtwig-like: floor(448/7)
    expect(koExp(56, 2)).toBe(16); // level 2 Starly: floor(112/7)
    expect(hitExp(56, 2, 0.05)).toBe(1); // floor(0.8) -> at least 1
    expect(hitExp(64, 50, 0.05)).toBe(22); // koExp 457 * 0.05 = 22.85 -> 22
  });

  it('resolves single and multiple level-ups', () => {
    const start = { growth: 'medium-slow' as const, level: 5, exp: expForLevel('medium-slow', 5) };
    const toSix = expForLevel('medium-slow', 6) - start.exp;
    expect(gainExp(start, toSix - 1)).toEqual({ level: 5, exp: start.exp + toSix - 1, levelsGained: [] });
    expect(gainExp(start, toSix)).toEqual({ level: 6, exp: expForLevel('medium-slow', 6), levelsGained: [6] });
    const toEight = expForLevel('medium-slow', 8) - start.exp;
    expect(gainExp(start, toEight).levelsGained).toEqual([6, 7, 8]);
  });

  it('caps at level 100 and ignores negative amounts', () => {
    const near = { growth: 'medium-slow' as const, level: 99, exp: expForLevel('medium-slow', 99) };
    const result = gainExp(near, 10_000_000);
    expect(result.level).toBe(100);
    expect(result.exp).toBe(1059860);
    expect(gainExp(near, -50)).toEqual({ level: 99, exp: near.exp, levelsGained: [] });
  });

  it('reports progress to the next level', () => {
    const l5 = expForLevel('medium-slow', 5);
    const l6 = expForLevel('medium-slow', 6);
    expect(expToNextFraction({ growth: 'medium-slow', level: 5, exp: l5 })).toBe(0);
    expect(expToNextFraction({ growth: 'medium-slow', level: 5, exp: (l5 + l6) / 2 })).toBeCloseTo(0.5);
    expect(expToNextFraction({ growth: 'medium-slow', level: 100, exp: 1059860 })).toBe(1);
  });
});
