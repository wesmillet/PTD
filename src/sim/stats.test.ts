import { describe, expect, it } from 'vitest';
import { computeStat, computeStats } from './stats';

const turtwig = { hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31 };

describe('computeStats', () => {
  it('matches the known level 50 Turtwig values with IV 31', () => {
    expect(computeStats(turtwig, 50, { iv: 31, ev: 0 })).toEqual({
      hp: 130,
      atk: 88,
      def: 84,
      spa: 65,
      spd: 75,
      spe: 51,
    });
  });

  it('gives the IV 15 values when asked', () => {
    expect(computeStats(turtwig, 50, { iv: 15, ev: 0 })).toEqual({
      hp: 122,
      atk: 80,
      def: 76,
      spa: 57,
      spd: 67,
      spe: 43,
    });
  });

  it('uses the project config by default', () => {
    // config.json currently sets iv 31, ev 0, so the known values hold.
    expect(computeStats(turtwig, 50)).toEqual({ hp: 130, atk: 88, def: 84, spa: 65, spd: 75, spe: 51 });
  });

  it('handles level 1 and level 100 edges', () => {
    expect(computeStat('hp', 55, 1, { iv: 31, ev: 0 })).toBe(1 + 1 + 10);
    expect(computeStat('spe', 31, 100, { iv: 31, ev: 0 })).toBe(93 + 5);
    expect(() => computeStat('hp', 55, 0)).toThrow();
    expect(() => computeStat('hp', 55, 101)).toThrow();
    expect(() => computeStat('hp', 55, 5.5)).toThrow();
  });

  it('counts EVs in quarters', () => {
    expect(computeStat('atk', 68, 50, { iv: 31, ev: 252 })).toBe(Math.floor(((136 + 31 + 63) * 50) / 100) + 5);
  });
});
