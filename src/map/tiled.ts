/**
 * Tiled JSON map format for levels. No Phaser imports.
 *
 * A level map is a Tiled map (orthogonal, 32 px tiles) with:
 *   - `ground`      tile layer, tiles from the map's main tileset
 *   - `terrain`     tile layer, each cell either empty or the preview tile of
 *                   an autotile tileset named `autotile:<terrain id>`; the
 *                   renderer composes the real cells (src/map/autotile.ts)
 *   - `decoration`  tile layer, drawn above ground and terrain
 *   - `path`        object layer: a polyline `path` plus `spawn` and `exit` points
 *   - `placeable`   object layer: one 32x32 rectangle per placeable tile
 * and map properties `tileset` (main tileset id) and `theme` (grass or cave).
 *
 * The in-memory `MapModel` is the editable form; `toTiled` / `fromTiled`
 * convert, and `toMapDef` produces the simulation's MapDef.
 */
import type { MapDef, Tile } from '../sim/map';
import { entryAtIndex, hasTerrain, terrains, tileset, type TilesetInfo } from './catalogue';

export const TILE_SIZE = 32;
export const AUTOTILE_PREFIX = 'autotile:';
/** Tiles per autotile tileset as Tiled sees it (3x4 of the first frame). */
const AUTOTILE_TILECOUNT = 12;

export interface MapModel {
  name: string;
  tileset: string;
  theme: string;
  width: number;
  height: number;
  /** Per cell: 0 = empty, otherwise packed index + 1. */
  ground: number[];
  decoration: number[];
  /** Per cell: terrain id or '' for none. */
  terrain: string[];
  path: Tile[];
  placeable: Tile[];
}

// ----------------------------------------------------------------- Tiled types

export interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
  value: string | number | boolean;
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  columns: number;
  tilecount: number;
  margin: number;
  spacing: number;
}

export interface TiledTileLayer {
  id: number;
  name: string;
  type: 'tilelayer';
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  data: number[];
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  point?: boolean;
  polyline?: { x: number; y: number }[];
}

export interface TiledObjectLayer {
  id: number;
  name: string;
  type: 'objectgroup';
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  draworder: 'topdown';
  objects: TiledObject[];
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledMap {
  type: 'map';
  version: string;
  tiledversion: string;
  orientation: 'orthogonal';
  renderorder: 'right-down';
  compressionlevel: number;
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  properties: TiledProperty[];
  tilesets: TiledTileset[];
  layers: TiledLayer[];
}

// ----------------------------------------------------------------- model

export function createModel(name: string, width: number, height: number, tilesetId: string, theme: string, fillTile = 0): MapModel {
  const cells = width * height;
  return {
    name,
    tileset: tilesetId,
    theme,
    width,
    height,
    ground: new Array<number>(cells).fill(fillTile),
    decoration: new Array<number>(cells).fill(0),
    terrain: new Array<string>(cells).fill(''),
    path: [],
    placeable: [],
  };
}

export function cloneModel(model: MapModel): MapModel {
  return {
    ...model,
    ground: [...model.ground],
    decoration: [...model.decoration],
    terrain: [...model.terrain],
    path: model.path.map((t) => [t[0], t[1]] as Tile),
    placeable: model.placeable.map((t) => [t[0], t[1]] as Tile),
  };
}

export function inBounds(model: MapModel, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < model.width && y < model.height;
}

/** Returns a copy with a new size; cells keep their coordinates, waypoints outside are dropped. */
export function resizeModel(model: MapModel, width: number, height: number): MapModel {
  const out = createModel(model.name, width, height, model.tileset, model.theme);
  for (let y = 0; y < Math.min(height, model.height); y++) {
    for (let x = 0; x < Math.min(width, model.width); x++) {
      const from = y * model.width + x;
      const to = y * width + x;
      out.ground[to] = model.ground[from]!;
      out.decoration[to] = model.decoration[from]!;
      out.terrain[to] = model.terrain[from]!;
    }
  }
  out.path = model.path.filter(([x, y]) => x < width && y < height).map((t) => [t[0], t[1]] as Tile);
  out.placeable = model.placeable.filter(([x, y]) => x < width && y < height).map((t) => [t[0], t[1]] as Tile);
  return out;
}

/** Cells covered by solid decoration stamps. */
export function blockedTiles(model: MapModel): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      const v = model.decoration[y * model.width + x]!;
      if (v === 0) continue;
      if (entryAtIndex(model.tileset, v - 1)?.solid) out.push([x, y]);
    }
  }
  return out;
}

/** The simulation's view of the map. Throws on an invalid path (validateMap does the rest). */
export function toMapDef(model: MapModel): MapDef {
  return {
    theme: model.theme,
    width: model.width,
    height: model.height,
    tileSize: TILE_SIZE,
    path: model.path.map((t) => [t[0], t[1]] as Tile),
    placeable: model.placeable.map((t) => [t[0], t[1]] as Tile),
    blocked: blockedTiles(model),
  };
}

// ----------------------------------------------------------------- Tiled encode

function tilesetEntry(info: TilesetInfo, firstgid: number): TiledTileset {
  return {
    firstgid,
    name: info.id,
    image: info.image,
    imagewidth: info.columns * info.tilewidth,
    imageheight: info.rows * info.tileheight,
    tilewidth: info.tilewidth,
    tileheight: info.tileheight,
    columns: info.columns,
    tilecount: info.tilecount,
    margin: 0,
    spacing: 0,
  };
}

/** The tileset list every exported map carries: the main tileset first, then one entry per terrain. */
export function tilesetsFor(tilesetId: string): TiledTileset[] {
  const main = tileset(tilesetId);
  const out: TiledTileset[] = [tilesetEntry(main, 1)];
  let next = 1 + main.tilecount;
  for (const t of terrains()) {
    out.push({
      firstgid: next,
      name: `${AUTOTILE_PREFIX}${t.id}`,
      image: t.image,
      imagewidth: 96 * t.frames,
      imageheight: 128,
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      columns: 3,
      tilecount: AUTOTILE_TILECOUNT,
      margin: 0,
      spacing: 0,
    });
    next += AUTOTILE_TILECOUNT;
  }
  return out;
}

const px = (tile: number): number => tile * TILE_SIZE;
const centre = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2;

export function toTiled(model: MapModel): TiledMap {
  const tilesetList = tilesetsFor(model.tileset);
  const autotileGid = new Map<string, number>();
  for (const ts of tilesetList) if (ts.name.startsWith(AUTOTILE_PREFIX)) autotileGid.set(ts.name.slice(AUTOTILE_PREFIX.length), ts.firstgid);
  const size = { width: model.width, height: model.height, x: 0, y: 0, opacity: 1, visible: true } as const;
  const tileLayer = (id: number, name: string, data: number[]): TiledTileLayer => ({ id, name, type: 'tilelayer', ...size, data });
  const terrainData = model.terrain.map((id) => {
    if (!id) return 0;
    const gid = autotileGid.get(id);
    if (gid === undefined) throw new Error(`map "${model.name}": unknown terrain "${id}"`);
    return gid;
  });
  let objectId = 1;
  const pathObjects: TiledObject[] = [];
  if (model.path.length >= 2) {
    const [sx, sy] = model.path[0]!;
    pathObjects.push({
      id: objectId++,
      name: 'path',
      type: 'path',
      x: centre(sx),
      y: centre(sy),
      width: 0,
      height: 0,
      rotation: 0,
      visible: true,
      polyline: model.path.map(([x, y]) => ({ x: centre(x) - centre(sx), y: centre(y) - centre(sy) })),
    });
  }
  if (model.path.length >= 1) {
    const [sx, sy] = model.path[0]!;
    pathObjects.push({ id: objectId++, name: 'spawn', type: 'spawn', x: centre(sx), y: centre(sy), width: 0, height: 0, rotation: 0, visible: true, point: true });
  }
  if (model.path.length >= 2) {
    const [ex, ey] = model.path[model.path.length - 1]!;
    pathObjects.push({ id: objectId++, name: 'exit', type: 'exit', x: centre(ex), y: centre(ey), width: 0, height: 0, rotation: 0, visible: true, point: true });
  }
  const placeableObjects: TiledObject[] = model.placeable.map(([x, y]) => ({
    id: objectId++,
    name: 'placeable',
    type: 'placeable',
    x: px(x),
    y: px(y),
    width: TILE_SIZE,
    height: TILE_SIZE,
    rotation: 0,
    visible: true,
  }));
  const objectLayer = (id: number, name: string, objects: TiledObject[]): TiledObjectLayer => ({ id, name, type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    compressionlevel: -1,
    infinite: false,
    width: model.width,
    height: model.height,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    nextlayerid: 6,
    nextobjectid: objectId,
    properties: [
      { name: 'name', type: 'string', value: model.name },
      { name: 'theme', type: 'string', value: model.theme },
      { name: 'tileset', type: 'string', value: model.tileset },
    ],
    tilesets: tilesetList,
    layers: [
      tileLayer(1, 'ground', [...model.ground]),
      tileLayer(2, 'terrain', terrainData),
      tileLayer(3, 'decoration', [...model.decoration]),
      objectLayer(4, 'path', pathObjects),
      objectLayer(5, 'placeable', placeableObjects),
    ],
  };
}

// ----------------------------------------------------------------- Tiled decode

const FLIP_MASK = 0x1fffffff;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function property(map: TiledMap, name: string): string | undefined {
  const p = (map.properties ?? []).find((q) => q.name === name);
  return p === undefined ? undefined : String(p.value);
}

function tileLayerOf(map: TiledMap, name: string): TiledTileLayer | undefined {
  return map.layers.find((l): l is TiledTileLayer => l.type === 'tilelayer' && l.name === name);
}

function objectLayerOf(map: TiledMap, name: string): TiledObjectLayer | undefined {
  return map.layers.find((l): l is TiledObjectLayer => l.type === 'objectgroup' && l.name === name);
}

/** Checks the shape of a parsed JSON value loosely and returns it typed. */
export function parseTiledJson(json: unknown): TiledMap {
  if (!isRecord(json)) throw new Error('map: not an object');
  if (json.type !== 'map' || json.orientation !== 'orthogonal') throw new Error('map: not an orthogonal Tiled map');
  if (typeof json.width !== 'number' || typeof json.height !== 'number') throw new Error('map: missing width or height');
  if (json.tilewidth !== TILE_SIZE || json.tileheight !== TILE_SIZE) throw new Error(`map: tiles must be ${TILE_SIZE} px`);
  if (!Array.isArray(json.layers) || !Array.isArray(json.tilesets)) throw new Error('map: missing layers or tilesets');
  if (json.width < 1 || json.height < 1 || json.width > 200 || json.height > 200) throw new Error('map: size out of range');
  for (const layer of json.layers) {
    if (!isRecord(layer) || typeof layer.name !== 'string') throw new Error('map: bad layer');
    if (layer.type === 'tilelayer') {
      if (!Array.isArray(layer.data)) throw new Error(`map: layer "${layer.name}" must have uncompressed data`);
      if (layer.data.length !== json.width * json.height) throw new Error(`map: layer "${layer.name}" has the wrong size`);
    } else if (layer.type === 'objectgroup') {
      if (!Array.isArray(layer.objects)) throw new Error(`map: layer "${layer.name}" has no objects`);
    }
  }
  return json as unknown as TiledMap;
}

/** Decodes a Tiled map into the editable model, resolving tilesets by name. */
export function fromTiled(json: unknown, fallbackName = 'map'): MapModel {
  const map = parseTiledJson(json);
  const tilesetId = property(map, 'tileset');
  if (!tilesetId) throw new Error('map: missing "tileset" property');
  tileset(tilesetId); // throws for unknown tilesets
  const theme = property(map, 'theme') ?? tileset(tilesetId).theme;
  const name = property(map, 'name') ?? fallbackName;
  const model = createModel(name, map.width, map.height, tilesetId, theme);

  const sorted = [...map.tilesets].sort((a, b) => a.firstgid - b.firstgid);
  const resolve = (gid: number): { tileset: TiledTileset; local: number } | null => {
    const id = gid & FLIP_MASK;
    if (id === 0) return null;
    let found: TiledTileset | undefined;
    for (const ts of sorted) if (ts.firstgid <= id) found = ts;
    if (!found) throw new Error(`map: gid ${id} has no tileset`);
    return { tileset: found, local: id - found.firstgid };
  };
  const readTiles = (layerName: string, into: number[]): void => {
    const layer = tileLayerOf(map, layerName);
    if (!layer) return;
    layer.data.forEach((gid, i) => {
      const r = resolve(gid);
      if (!r) return;
      if (r.tileset.name !== tilesetId) {
        if (r.tileset.name.startsWith(AUTOTILE_PREFIX)) throw new Error(`map: layer "${layerName}" cell ${i} uses an autotile; autotiles go on the terrain layer`);
        throw new Error(`map: layer "${layerName}" uses tileset "${r.tileset.name}" but the map's tileset is "${tilesetId}"`);
      }
      into[i] = r.local + 1;
    });
  };
  readTiles('ground', model.ground);
  readTiles('decoration', model.decoration);
  const terrainLayer = tileLayerOf(map, 'terrain');
  if (terrainLayer) {
    terrainLayer.data.forEach((gid, i) => {
      const r = resolve(gid);
      if (!r) return;
      if (!r.tileset.name.startsWith(AUTOTILE_PREFIX)) throw new Error(`map: terrain layer cell ${i} is not an autotile`);
      const id = r.tileset.name.slice(AUTOTILE_PREFIX.length);
      if (!hasTerrain(id)) throw new Error(`map: unknown terrain "${id}"`);
      model.terrain[i] = id;
    });
  }

  const toTile = (x: number, y: number): Tile => [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)];
  const pathLayer = objectLayerOf(map, 'path');
  const polyline = pathLayer?.objects.find((o) => Array.isArray(o.polyline));
  if (polyline?.polyline) {
    model.path = polyline.polyline.map((p) => toTile(polyline.x + p.x, polyline.y + p.y));
  } else if (pathLayer) {
    const spawn = pathLayer.objects.find((o) => o.name === 'spawn');
    const exit = pathLayer.objects.find((o) => o.name === 'exit');
    if (spawn) model.path.push(toTile(spawn.x, spawn.y));
    if (exit) model.path.push(toTile(exit.x, exit.y));
  }
  const placeableLayer = objectLayerOf(map, 'placeable');
  if (placeableLayer) {
    for (const o of placeableLayer.objects) {
      const t = toTile(o.x + (o.width ? o.width / 2 : 0), o.y + (o.height ? o.height / 2 : 0));
      if (!model.placeable.some(([x, y]) => x === t[0] && y === t[1])) model.placeable.push(t);
    }
  }
  for (const [x, y] of [...model.path, ...model.placeable]) {
    if (!inBounds(model, x, y)) throw new Error(`map: object at (${x},${y}) is outside the map`);
  }
  return model;
}

/**
 * The map as Phaser's Tiled loader should see it: only the two real tile
 * layers and the main tileset with its current image size (an old export may
 * carry stale dimensions after the sheet was rebuilt).
 */
export function toPhaserTiled(model: MapModel): TiledMap {
  const full = toTiled(model);
  return {
    ...full,
    tilesets: [tilesetEntry(tileset(model.tileset), 1)],
    layers: full.layers.filter((l) => l.type === 'tilelayer' && (l.name === 'ground' || l.name === 'decoration')),
  };
}

export function serializeTiled(model: MapModel): string {
  return JSON.stringify(toTiled(model), null, 1) + '\n';
}
