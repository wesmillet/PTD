import { describe, expect, it } from 'vitest';
import { summaryStars } from './stars';

const caught = [{ name: 'shinx', species: 403, level: 5, shiny: false, ball: 'poke' }];

describe('result stars', () => {
  it('scores clearing, lives kept (or three free waves) and a catch (or no leaks on defend)', () => {
    expect(summaryStars({ outcome: 'won', wavesCleared: 8, lives: 10, maxLives: 10, leaks: 0, caught: [] })).toBe(3);
    expect(summaryStars({ outcome: 'won', wavesCleared: 8, lives: 7, maxLives: 10, leaks: 3, caught: [] })).toBe(1);
    expect(summaryStars({ outcome: 'won', wavesCleared: 8, lives: 7, maxLives: 10, leaks: 3, caught })).toBe(2);
    expect(summaryStars({ outcome: 'lost', wavesCleared: 2, lives: 0, maxLives: 10, leaks: 10, caught: [] })).toBe(0);
    expect(summaryStars({ outcome: 'left', wavesCleared: 1, leaks: 0, caught: [] })).toBe(1);
    expect(summaryStars({ outcome: 'left', wavesCleared: 3, leaks: 2, caught })).toBe(3);
    expect(summaryStars({ outcome: 'left', wavesCleared: 0, leaks: 0, caught: [] })).toBe(0);
  });
});
