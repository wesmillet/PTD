/**
 * Grid walking for the title diorama (and anything else that moves actors
 * over a map): which cells are solid, the nearest walkable cell to a point,
 * and a breadth-first path between two cells over the walkable ones. No
 * Phaser imports.
 */
import type { Tile } from '../sim/map';

export interface WalkGrid {
  width: number;
  height: number;
  /** Row-major, true where an actor cannot stand (trees, cliffs, rocks, water). */
  solid: readonly boolean[];
}

export function isSolid(grid: WalkGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return false; // off the map is open (actors walk off the edges)
  return grid.solid[y * grid.width + x] ?? false;
}

/** The nearest walkable cell to (x, y) by Manhattan rings, (x, y) itself when it is open. */
export function nearestWalkable(grid: WalkGrid, x: number, y: number, maxRadius = 6): Tile {
  if (!isSolid(grid, x, y)) return [x, y];
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        if (!isSolid(grid, nx, ny)) return [nx, ny];
      }
    }
  }
  return [x, y];
}

/**
 * Shortest 4-neighbour path from `from` to `to` over walkable cells, as the
 * cells to visit after `from` (empty when already there). Cells outside the
 * map count as walkable, but only a goal off the map lets the search go
 * there (an actor leaving the frame); null when no path exists.
 */
export function findGridPath(grid: WalkGrid, from: Tile, to: Tile, limit = 4000): Tile[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < grid.width && y < grid.height;
  // The search leaves the map only when the goal is off it (an actor walking out of frame).
  const margin = inBounds(to[0], to[1]) ? 0 : 2;
  const inSearch = (x: number, y: number) => x >= -margin && y >= -margin && x < grid.width + margin && y < grid.height + margin;
  const prev = new Map<string, string | null>();
  const queue: Tile[] = [from];
  prev.set(key(from[0], from[1]), null);
  let steps = 0;
  while (queue.length > 0 && steps++ < limit) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inSearch(nx, ny) || isSolid(grid, nx, ny)) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, key(x, y));
      if (nx === to[0] && ny === to[1]) {
        const out: Tile[] = [];
        let cur: string | null = k;
        while (cur && cur !== key(from[0], from[1])) {
          const [cx, cy] = cur.split(',').map(Number) as [number, number];
          out.push([cx, cy]);
          cur = prev.get(cur) ?? null;
        }
        return out.reverse();
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** Drops the middle cells of straight runs so a path becomes its corners (fewer tweens). */
export function simplifyPath(path: readonly Tile[]): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const a = path[i - 1];
    const b = path[i + 1];
    if (a && b && Math.sign(p[0] - a[0]) === Math.sign(b[0] - p[0]) && Math.sign(p[1] - a[1]) === Math.sign(b[1] - p[1])) continue;
    out.push(p);
  }
  return out;
}
