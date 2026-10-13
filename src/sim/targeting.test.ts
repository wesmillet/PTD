import { describe, expect, it } from 'vitest';
import { selectTarget, type TargetCandidate } from './targeting';

const enemies: TargetCandidate[] = [
  { id: 1, tileDistance: 2.0, pathDistance: 10, hp: 30 },
  { id: 2, tileDistance: 1.0, pathDistance: 12, hp: 50 },
  { id: 3, tileDistance: 1.0, pathDistance: 14, hp: 20 },
  { id: 4, tileDistance: 3.5, pathDistance: 20, hp: 80 }, // out of range at 3
];

describe('selectTarget', () => {
  it('excludes enemies out of range and returns undefined when none qualify', () => {
    expect(selectTarget('nearest', enemies, 3)?.id).not.toBe(4);
    expect(selectTarget('nearest', enemies, 0.5)).toBeUndefined();
    expect(selectTarget('nearest', [], 3)).toBeUndefined();
  });

  it('nearest picks the closest, tie to the one furthest along the path', () => {
    expect(selectTarget('nearest', enemies, 3)?.id).toBe(3);
  });

  it('strongest picks the highest current HP', () => {
    expect(selectTarget('strongest', enemies, 3)?.id).toBe(2);
    expect(selectTarget('strongest', enemies, 4)?.id).toBe(4);
  });

  it('weakest picks the lowest current HP', () => {
    expect(selectTarget('weakest', enemies, 3)?.id).toBe(3);
  });

  it('furthest picks the enemy furthest along the path', () => {
    expect(selectTarget('furthest', enemies, 3)?.id).toBe(3);
    expect(selectTarget('furthest', enemies, 4)?.id).toBe(4);
  });

  it('breaks ties deterministically', () => {
    const tied: TargetCandidate[] = [
      { id: 1, tileDistance: 1, pathDistance: 5, hp: 10 },
      { id: 2, tileDistance: 2, pathDistance: 5, hp: 10 },
    ];
    expect(selectTarget('furthest', tied, 3)?.id).toBe(1); // nearer wins the path tie
    expect(selectTarget('strongest', tied, 3)?.id).toBe(1); // equal hp and path: first kept
    expect(selectTarget('weakest', [...tied].reverse(), 3)?.id).toBe(2);
  });

  it('self never selects an enemy', () => {
    expect(selectTarget('self', enemies, 10)).toBeUndefined();
  });
});
