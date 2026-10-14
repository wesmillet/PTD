import { describe, expect, it } from 'vitest';
import { getMapModel } from '../data/maps';
import { findGridPath, isSolid, nearestWalkable, simplifyPath } from './gridPath';
import { walkGrid } from './tiled';

describe('grid walking', () => {
  const grid = { width: 5, height: 3, solid: [false, false, true, false, false, false, false, true, false, false, false, false, false, false, false] };

  it('paths around solid cells and off the map, and simplifies straight runs', () => {
    const path = findGridPath(grid, [0, 0], [4, 0])!;
    expect(path).toHaveLength(8); // around the two solid cells along the bottom row, never off the map
    expect(path[path.length - 1]).toEqual([4, 0]);
    for (const [x, y] of path) {
      expect(isSolid(grid, x, y)).toBe(false);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    const corners = simplifyPath(path);
    expect(corners.length).toBeLessThan(path.length);
    expect(corners[corners.length - 1]).toEqual([4, 0]);
    expect(findGridPath(grid, [1, 1], [1, 1])).toEqual([]);
    expect(findGridPath(grid, [0, 0], [-2, 0])).toEqual([
      [-1, 0],
      [-2, 0],
    ]);
    expect(nearestWalkable(grid, 2, 0)).toEqual([1, 0]);
    expect(nearestWalkable(grid, 1, 1)).toEqual([1, 1]);
    expect(isSolid(grid, 2, 0)).toBe(true);
    expect(isSolid(grid, 9, 9)).toBe(false);
  });

  it('marks the title map: trees and water solid, the route, the stage points and the path open', () => {
    const model = getMapModel('title');
    const g = walkGrid(model);
    expect(g.solid.filter(Boolean).length).toBeGreaterThan(40);
    for (const [x, y] of model.path) expect(isSolid(g, x, y), `path ${x},${y}`).toBe(false);
    for (const p of model.points) if (p.name !== 'sky') expect(isSolid(g, p.tile[0], p.tile[1]), p.name).toBe(false);
    const water = model.terrain.findIndex((t) => t === 'water');
    expect(water).toBeGreaterThanOrEqual(0);
    expect(g.solid[water]).toBe(true);
    const meadow = model.points.find((p) => p.name === 'meadow')!.tile;
    const beach = model.points.find((p) => p.name === 'beach')!.tile;
    expect(findGridPath(g, meadow, beach)).not.toBeNull();
  });
});
