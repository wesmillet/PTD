import { describe, expect, it } from 'vitest';
import {
  ALL_DIRECTIONS,
  DIRECTION_NAMES,
  Direction,
  directionFromVector,
  directionToVector,
} from './direction';

describe('Direction', () => {
  it('matches the sprite sheet row order', () => {
    expect(DIRECTION_NAMES).toEqual([
      'down',
      'down-right',
      'right',
      'up-right',
      'up',
      'up-left',
      'left',
      'down-left',
    ]);
    expect(Direction.Down).toBe(0);
    expect(Direction.DownLeft).toBe(7);
  });

  it('round-trips every direction through its vector', () => {
    for (const dir of ALL_DIRECTIONS) {
      const { dx, dy } = directionToVector(dir);
      expect(directionFromVector(dx, dy)).toBe(dir);
    }
  });

  it('snaps off-axis vectors to the nearest direction', () => {
    expect(directionFromVector(10, 1)).toBe(Direction.Right);
    expect(directionFromVector(10, 9)).toBe(Direction.DownRight);
    expect(directionFromVector(-1, -10)).toBe(Direction.Up);
    expect(directionFromVector(-10, 10)).toBe(Direction.DownLeft);
    expect(directionFromVector(-10, -1)).toBe(Direction.Left);
  });

  it('uses the fallback for a zero vector', () => {
    expect(directionFromVector(0, 0)).toBe(Direction.Down);
    expect(directionFromVector(0, 0, Direction.Left)).toBe(Direction.Left);
  });
});
