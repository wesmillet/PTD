/**
 * The 8 facing directions, in SpriteCollab sprite sheet row order.
 * Row 0 is the top row of every `<Action>-Anim.png`.
 */
export const Direction = {
  Down: 0,
  DownRight: 1,
  Right: 2,
  UpRight: 3,
  Up: 4,
  UpLeft: 5,
  Left: 6,
  DownLeft: 7,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const ALL_DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5, 6, 7];

export const DIRECTION_NAMES: readonly string[] = [
  'down',
  'down-right',
  'right',
  'up-right',
  'up',
  'up-left',
  'left',
  'down-left',
];

/**
 * Picks the nearest of the 8 directions for a movement vector in screen
 * coordinates (x right, y down). A zero vector returns `fallback`.
 */
export function directionFromVector(
  dx: number,
  dy: number,
  fallback: Direction = Direction.Down,
): Direction {
  if (dx === 0 && dy === 0) return fallback;
  // Screen-space angle: 0 = right, 90 = down. Sheet rows go down, down-right,
  // right, ... which walks through decreasing angles, so row i sits at
  // angle 90 - 45 * i.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const index = Math.round((90 - angle) / 45);
  return (((index % 8) + 8) % 8) as Direction;
}

/** Step vector for a direction in screen coordinates (diagonals are (±1, ±1)). */
export function directionToVector(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case Direction.Down:
      return { dx: 0, dy: 1 };
    case Direction.DownRight:
      return { dx: 1, dy: 1 };
    case Direction.Right:
      return { dx: 1, dy: 0 };
    case Direction.UpRight:
      return { dx: 1, dy: -1 };
    case Direction.Up:
      return { dx: 0, dy: -1 };
    case Direction.UpLeft:
      return { dx: -1, dy: -1 };
    case Direction.Left:
      return { dx: -1, dy: 0 };
    case Direction.DownLeft:
      return { dx: -1, dy: 1 };
  }
}
