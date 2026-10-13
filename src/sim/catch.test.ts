import { describe, expect, it } from 'vitest';
import { attemptCatch, ballModifier, catchValue, shakeThreshold, BALLS } from './catch';
import { createMonster } from './monster';
import { Rng } from './rng';
import { applyAilment } from './status';

describe('catch formula', () => {
  it('computes the Gen 4 a value', () => {
    // Full HP, rate 255, Poké Ball: floor((300-200)*255/300) = 85 (not guaranteed, as in the games).
    expect(catchValue(100, 100, 255, 1, 1)).toBe(85);
    // 1 HP, rate 255, Ultra Ball: floor(298*255*2/300) = 506 -> capped at 255.
    expect(catchValue(100, 1, 255, 2, 1)).toBe(255);
    // Full HP, rate 45 (Turtwig), Poké Ball: floor((300-200)*45/300) = 15
    expect(catchValue(100, 100, 45, 1, 1)).toBe(15);
    // 1 HP: floor((300-2)*45/300) = 44
    expect(catchValue(100, 1, 45, 1, 1)).toBe(44);
    // Ultra Ball at 1 HP: floor(298*45*2/300) = 89; asleep x2 = 178
    expect(catchValue(100, 1, 45, 2, 1)).toBe(89);
    expect(catchValue(100, 1, 45, 2, 2)).toBe(178);
    expect(catchValue(100, 100, 3, 1, 1)).toBe(1); // never below 1
  });

  it('computes the shake threshold', () => {
    expect(shakeThreshold(255)).toBe(65535);
    expect(shakeThreshold(15)).toBe(32274); // floor(1048560 / (16711680/15)^(1/4))
    expect(shakeThreshold(85)).toBe(49795);
    expect(shakeThreshold(1)).toBeGreaterThan(16000);
    expect(shakeThreshold(1)).toBeLessThan(16500);
  });

  it('applies ball conditions', () => {
    const none = { types: [1], undamaged: false, caveOrNight: false };
    expect(ballModifier('poke', none)).toBe(1);
    expect(ballModifier('great', none)).toBe(1.5);
    expect(ballModifier('ultra', none)).toBe(2);
    expect(ballModifier('dusk', none)).toBe(1);
    expect(ballModifier('dusk', { ...none, caveOrNight: true })).toBe(3.5);
    expect(ballModifier('net', none)).toBe(1);
    expect(ballModifier('net', { ...none, types: [7, 3] })).toBe(3);
    expect(ballModifier('net', { ...none, types: [11] })).toBe(3);
    expect(ballModifier('quick', none)).toBe(1);
    expect(ballModifier('quick', { ...none, undamaged: true })).toBe(4);
    expect(ballModifier('master', none)).toBe(255);
    expect(BALLS.master?.obtainable).toBe(false);
    expect(() => ballModifier('beast', none)).toThrow();
  });

  it('always catches at a >= 255 and never with four failed shakes', () => {
    const mon = createMonster(399, 3); // Bidoof, catch rate 255
    mon.hp = 1;
    expect(attemptCatch(mon, 255, 2, new Rng(1))).toEqual({ caught: true, shakes: 4, a: 255 });
    const rare = createMonster(491, 50); // Darkrai, rate 3
    let caught = 0;
    const rng = new Rng(2);
    for (let i = 0; i < 2000; i++) if (attemptCatch(rare, 3, 1, rng).caught) caught++;
    expect(caught).toBeLessThan(20); // a = 1: ~0.4% per attempt
  });

  it('rewards low HP, better balls and status, deterministically', () => {
    const mon = createMonster(387, 10); // Turtwig, rate 45
    const trials = (hp: number, ball: number, ailment: 'none' | 'sleep', seed: number) => {
      const rng = new Rng(seed);
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const m = createMonster(387, 10);
        m.hp = hp;
        if (ailment === 'sleep') applyAilment(m.status, 'sleep', rng);
        if (attemptCatch(m, 45, ball, rng).caught) n++;
      }
      return n;
    };
    const full = trials(mon.stats.hp, 1, 'none', 1);
    const low = trials(1, 1, 'none', 1);
    const ultra = trials(1, 2, 'none', 1);
    const asleep = trials(1, 2, 'sleep', 1);
    expect(full).toBeLessThan(low);
    expect(low).toBeLessThan(ultra);
    expect(ultra).toBeLessThan(asleep);
    expect(trials(1, 1, 'none', 7)).toBe(trials(1, 1, 'none', 7));
    const r = attemptCatch(mon, 45, 1, new Rng(3));
    expect(r.shakes).toBeGreaterThanOrEqual(0);
    expect(r.shakes).toBeLessThanOrEqual(4);
    expect(r.caught).toBe(r.shakes === 4);
  });
});
