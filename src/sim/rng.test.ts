import { describe, expect, it } from 'vitest';
import { Rng, hashString } from './rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('accepts string seeds via a stable hash', () => {
    expect(hashString('route-201')).toBe(hashString('route-201'));
    expect(hashString('route-201')).not.toBe(hashString('route-202'));
    expect(new Rng('daily-2026-10-13').next()).toBe(new Rng('daily-2026-10-13').next());
  });

  it('produces floats in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() covers the whole inclusive range', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    expect(() => rng.int(5, 4)).toThrow();
  });

  it('chance() respects the edges and roughly the probability', () => {
    const rng = new Rng(5);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.chance(0.25)) hits++;
    expect(hits).toBeGreaterThan(2200);
    expect(hits).toBeLessThan(2800);
  });

  it('pick() and shuffle() keep elements intact', () => {
    const rng = new Rng(3);
    const items = ['a', 'b', 'c', 'd'];
    expect(items).toContain(rng.pick(items));
    const shuffled = rng.shuffle(items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
    expect(() => rng.pick([])).toThrow();
  });

  it('can resume from an exposed seed and fork independent streams', () => {
    const rng = new Rng(42);
    rng.next();
    const resumed = new Rng(rng.seed);
    expect(resumed.next()).toBe(rng.next());

    const parent = new Rng(42);
    const forkA = parent.fork();
    const forkB = parent.fork();
    expect(forkA.next()).not.toBe(forkB.next());
  });
});
