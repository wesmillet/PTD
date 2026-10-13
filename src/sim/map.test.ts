import { describe, expect, it } from 'vitest';
import { getMap } from '../data/maps';
import { buildPath, isPlaceable, pointAlongPath, tileKey, validateMap } from './map';

describe('map paths', () => {
  const path = buildPath([
    [0, 3],
    [4, 3],
    [4, 6],
  ]);

  it('measures segments and total length in tiles', () => {
    expect(path.segments).toHaveLength(2);
    expect(path.length).toBe(7);
    expect(path.segments[1]).toMatchObject({ dx: 0, dy: 1, length: 3, start: 4 });
    expect(path.tiles.has(tileKey(4, 3))).toBe(true);
    expect(path.tiles.has(tileKey(4, 6))).toBe(true);
    expect(path.tiles.has(tileKey(5, 3))).toBe(false);
    expect(path.tiles.size).toBe(8);
  });

  it('interpolates positions and directions along the path', () => {
    expect(pointAlongPath(path, 0)).toEqual({ x: 0, y: 3, dx: 1, dy: 0 });
    expect(pointAlongPath(path, 2.5)).toEqual({ x: 2.5, y: 3, dx: 1, dy: 0 });
    expect(pointAlongPath(path, 4)).toEqual({ x: 4, y: 3, dx: 1, dy: 0 });
    expect(pointAlongPath(path, 5.5)).toEqual({ x: 4, y: 4.5, dx: 0, dy: 1 });
    expect(pointAlongPath(path, -1)).toEqual({ x: -1, y: 3, dx: 1, dy: 0 });
    expect(pointAlongPath(path, 8)).toEqual({ x: 4, y: 7, dx: 0, dy: 1 });
  });

  it('rejects diagonal or empty segments', () => {
    expect(() =>
      buildPath([
        [0, 0],
        [1, 1],
      ]),
    ).toThrow(/axis-aligned/);
    expect(() =>
      buildPath([
        [0, 0],
        [0, 0],
      ]),
    ).toThrow();
    expect(() => buildPath([[0, 0]])).toThrow();
  });
});

describe('level maps', () => {
  it.each([
    ['route-201', getMap('route-201')],
    ['oreburgh-mine-1f', getMap('oreburgh-mine-1f')],
  ])('%s is valid and has placeable tiles off the path', (_name, map) => {
    const path = validateMap(map);
    expect(path.length).toBeGreaterThan(20);
    expect(map.placeable.length).toBeGreaterThanOrEqual(6);
    for (const [x, y] of map.placeable) expect(isPlaceable(map, x, y)).toBe(true);
    expect(isPlaceable(map, map.path[0]![0], map.path[0]![1])).toBe(false);
  });
});
