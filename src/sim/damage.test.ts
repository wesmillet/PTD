import { describe, expect, it } from 'vitest';
import { baseDamage, computeDamage, hits, rollDamage, typeMultiplier, type DamageContext } from './damage';
import { Rng } from './rng';
import { computeStats } from './stats';

const turtwigBase = { hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31 };
const starlyBase = { hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 60 };

// Level 5 Turtwig using Tackle (Normal, 40 power, physical) on a level 2 Starly.
const tackle: DamageContext = {
  level: 5,
  power: 40,
  moveType: 1,
  category: 'physical',
  attackerTypes: [12],
  attackerStats: computeStats(turtwigBase, 5, { iv: 31, ev: 0 }),
  defenderTypes: [1, 3],
  defenderStats: computeStats(starlyBase, 2, { iv: 31, ev: 0 }),
};

describe('baseDamage', () => {
  it('floors at each stage of the Gen 4 core formula', () => {
    // level 5: floor(2*5/5 + 2) = 4; 4 * 40 * 13 / 6 = 346.67 -> 346; 346/50 = 6.92 -> 6; +2 = 8
    expect(tackle.attackerStats.atk).toBe(13);
    expect(tackle.defenderStats.def).toBe(6);
    expect(baseDamage(5, 40, 13, 6)).toBe(8);
    // level 50 Turtwig Tackle vs itself: floor(22) = 22; 22*40*88/84 = 921.9 -> 921; /50 = 18.42 -> 18; +2 = 20
    expect(baseDamage(50, 40, 88, 84)).toBe(20);
  });

  it('never divides by zero', () => {
    expect(baseDamage(5, 40, 13, 0)).toBe(baseDamage(5, 40, 13, 1));
  });
});

describe('computeDamage', () => {
  it('applies the random roll with flooring', () => {
    expect(computeDamage(tackle, false, 100).damage).toBe(8);
    expect(computeDamage(tackle, false, 85).damage).toBe(Math.floor((8 * 85) / 100)); // 6
    expect(computeDamage(tackle, false, 85).stab).toBe(false);
  });

  it('doubles on a crit before the roll', () => {
    expect(computeDamage(tackle, true, 100).damage).toBe(16);
    expect(computeDamage(tackle, true, 90).damage).toBe(Math.floor((16 * 90) / 100)); // 14
  });

  it('applies STAB after the roll', () => {
    const razorLeaf: DamageContext = { ...tackle, moveType: 12, power: 55 };
    // base: 4*55*13/6 = 476.67 -> 476; /50 -> 9; +2 = 11; roll 100 -> 11; STAB floor(16.5) -> 16
    const result = computeDamage(razorLeaf, false, 100);
    expect(result.stab).toBe(true);
    expect(result.damage).toBe(16);
  });

  it('applies type effectiveness per defending type', () => {
    const rockThrow: DamageContext = { ...tackle, moveType: 6, power: 50, attackerTypes: [6] };
    // Rock vs Normal/Flying: 1 * 2 = 2x. base: 4*50*13/6 = 433.3 -> 433; /50 -> 8; +2 = 10; STAB 15; x2 = 30
    const result = computeDamage(rockThrow, false, 100);
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBe(30);
    expect(typeMultiplier(6, [1, 3])).toBe(2);
    expect(typeMultiplier(13, [5])).toBe(0); // electric vs ground
  });

  it('does zero damage on immunity and at least one otherwise', () => {
    const ghost: DamageContext = { ...tackle, defenderTypes: [8] };
    expect(computeDamage(ghost, false, 100).damage).toBe(0);
    expect(computeDamage(ghost, false, 100).effectiveness).toBe(0);
    const weak: DamageContext = {
      ...tackle,
      level: 1,
      power: 1,
      defenderStats: { ...tackle.defenderStats, def: 999 },
      defenderTypes: [9, 6], // steel/rock takes 0.25 from normal
    };
    expect(computeDamage(weak, false, 85).damage).toBe(1);
  });

  it('uses special stats for special moves', () => {
    const special: DamageContext = { ...tackle, category: 'special' };
    // spa 11 vs spd 6: 4*40*11/6 = 293.3 -> 293; /50 -> 5; +2 = 7
    expect(special.attackerStats.spa).toBe(11);
    expect(special.defenderStats.spd).toBe(6);
    expect(computeDamage(special, false, 100).damage).toBe(7);
  });

  it('rejects rolls outside 85..100', () => {
    expect(() => computeDamage(tackle, false, 84)).toThrow();
    expect(() => computeDamage(tackle, false, 101)).toThrow();
  });
});

describe('rollDamage and hits', () => {
  it('is deterministic for a seed and stays within the roll bounds', () => {
    const a = rollDamage(tackle, new Rng(7), 1 / 16);
    const b = rollDamage(tackle, new Rng(7), 1 / 16);
    expect(a).toEqual(b);
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const r = rollDamage(tackle, rng, 1 / 16);
      expect(r.roll).toBeGreaterThanOrEqual(85);
      expect(r.roll).toBeLessThanOrEqual(100);
      expect(r.damage).toBeGreaterThanOrEqual(6);
      expect(r.damage).toBeLessThanOrEqual(16);
    }
  });

  it('crits at roughly the configured rate', () => {
    const rng = new Rng(11);
    let crits = 0;
    for (let i = 0; i < 8000; i++) if (rollDamage(tackle, rng, 1 / 16).crit) crits++;
    expect(crits).toBeGreaterThan(380);
    expect(crits).toBeLessThan(620);
  });

  it('honours accuracy, with null never missing', () => {
    const rng = new Rng(5);
    expect(hits(null, rng)).toBe(true);
    let landed = 0;
    for (let i = 0; i < 4000; i++) if (hits(70, rng)) landed++;
    expect(landed).toBeGreaterThan(2650);
    expect(landed).toBeLessThan(2950);
    for (let i = 0; i < 100; i++) expect(hits(100, rng)).toBe(true);
  });
});
