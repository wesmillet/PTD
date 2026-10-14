import { describe, expect, it } from 'vitest';
import { stampIndex, tileEntry, tileset } from './catalogue';
import { createModel, fromTiled, resizeModel, toMapDef, toTiled } from './tiled';
import { validateMap } from '../sim/map';
import { getMapModel, mapNames } from '../data/maps';

function sample() {
  const m = createModel('test', 6, 4, 'gen5-outdoor', 'grass', tileEntry('grass').index + 1);
  m.path = [[0, 1], [3, 1], [3, 3]];
  m.placeable = [[1, 0], [4, 2]];
  m.terrain[1 * 6 + 0] = 'dirt-path';
  m.terrain[1 * 6 + 1] = 'dirt-path';
  const tree = tileEntry('rock-grey'); // a solid 2x3 stamp
  for (let dy = 0; dy < tree.h; dy++) for (let dx = 0; dx < tree.w; dx++) m.decoration[(0 + dy) * 6 + 4 + dx] = stampIndex(tree, dx, dy) + 1;
  m.decoration[3 * 6 + 0] = tileEntry('flowers-blue').index + 1;
  return m;
}

describe('Tiled map format', () => {
  it('round-trips through Tiled JSON', () => {
    const model = sample();
    const json = JSON.parse(JSON.stringify(toTiled(model)));
    expect(fromTiled(json)).toEqual(model);
  });

  it('writes the expected layers, tilesets and properties', () => {
    const tiled = toTiled(sample());
    expect(tiled.layers.map((l) => `${l.type}:${l.name}`)).toEqual([
      'tilelayer:ground', 'tilelayer:terrain', 'tilelayer:decoration', 'objectgroup:path', 'objectgroup:placeable',
    ]);
    expect(tiled.properties.find((p) => p.name === 'tileset')?.value).toBe('gen5-outdoor');
    expect(tiled.properties.find((p) => p.name === 'theme')?.value).toBe('grass');
    expect(tiled.tilesets[0]).toMatchObject({ firstgid: 1, name: 'gen5-outdoor', columns: tileset('gen5-outdoor').columns });
    expect(tiled.tilesets.some((t) => t.name === 'autotile:dirt-path')).toBe(true);
    const path = tiled.layers.find((l) => l.name === 'path');
    expect(path?.type).toBe('objectgroup');
    if (path?.type !== 'objectgroup') throw new Error('unreachable');
    expect(path.objects.map((o) => o.name)).toEqual(['path', 'spawn', 'exit']);
    expect(path.objects[0]?.polyline).toHaveLength(3);
    expect(path.objects[1]).toMatchObject({ x: 16, y: 48, point: true });
    expect(path.objects[2]).toMatchObject({ x: 112, y: 112, point: true });
    const placeable = tiled.layers.find((l) => l.name === 'placeable');
    if (placeable?.type !== 'objectgroup') throw new Error('unreachable');
    expect(placeable.objects[0]).toMatchObject({ x: 32, y: 0, width: 32, height: 32 });
  });

  it('terrain cells are gids of the autotile tileset', () => {
    const tiled = toTiled(sample());
    const terrain = tiled.layers.find((l) => l.name === 'terrain');
    const ts = tiled.tilesets.find((t) => t.name === 'autotile:dirt-path')!;
    if (terrain?.type !== 'tilelayer') throw new Error('unreachable');
    expect(terrain.data[6]).toBe(ts.firstgid);
    expect(terrain.data[0]).toBe(0);
  });

  it('produces a MapDef the simulation accepts, with solid decoration as blocked', () => {
    const def = toMapDef(sample());
    expect(def).toMatchObject({ theme: 'grass', width: 6, height: 4, tileSize: 32 });
    expect(def.path).toEqual([[0, 1], [3, 1], [3, 3]]);
    expect(def.placeable).toEqual([[1, 0], [4, 2]]);
    // The 2x3 rock is solid; the flowers are not.
    expect(def.blocked).toEqual([[4, 0], [5, 0], [4, 1], [5, 1], [4, 2], [5, 2]]);
    expect(validateMap(def).length).toBe(5);
  });

  it('rejects maps that are not Tiled orthogonal 32px maps', () => {
    expect(() => fromTiled({ type: 'map', orientation: 'isometric' })).toThrow(/orthogonal/);
    expect(() => fromTiled({ ...toTiled(sample()), tilewidth: 16 })).toThrow(/32 px/);
    expect(() => fromTiled({ ...toTiled(sample()), properties: [] })).toThrow(/tileset/);
    const bad = toTiled(sample());
    const ground = bad.layers[0];
    if (ground?.type !== 'tilelayer') throw new Error('unreachable');
    ground.data = ground.data.slice(1);
    expect(() => fromTiled(bad)).toThrow(/wrong size/);
  });

  it('resizes without moving cells and drops objects outside', () => {
    const model = sample();
    const bigger = resizeModel(model, 8, 5);
    expect(bigger.ground[1 * 8 + 2]).toBe(model.ground[1 * 6 + 2]);
    expect(bigger.path).toEqual(model.path);
    const smaller = resizeModel(model, 3, 2);
    expect(smaller.path).toEqual([[0, 1]]);
    expect(smaller.placeable).toEqual([[1, 0]]);
  });
});

describe('shipped maps', () => {
  it.each(mapNames())('%s loads, validates and round-trips', (name) => {
    const model = getMapModel(name);
    const def = toMapDef(model);
    const path = validateMap(def);
    expect(path.length).toBeGreaterThan(20);
    expect(model.placeable.length).toBeGreaterThanOrEqual(6);
    expect(model.ground.every((v) => v > 0)).toBe(true);
    expect(fromTiled(JSON.parse(JSON.stringify(toTiled(model))), name)).toEqual(model);
  });
});
