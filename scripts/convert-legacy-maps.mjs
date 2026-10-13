#!/usr/bin/env node
/**
 * One-off converter from the pre-maps-branch map format
 * ({ theme, width, height, tileSize, path, placeable, blocked }) to the Tiled
 * JSON format described in docs/maps.md. Kept so the conversion is
 * reproducible and as a worked example of building a map from code.
 *
 * Usage: node scripts/convert-legacy-maps.mjs <legacy-dir> <out-dir>
 *
 * Outdoor maps (theme grass) use the gen5-outdoor tileset: grass ground with a
 * few sparse-grass variants, the dirt-path terrain along the enemy path, trees
 * where they fit on the old blocked tiles and small rocks elsewhere, and a
 * pond for Lake Verity. Cave maps (theme cave) stay on the placeholder
 * tileset until a cave tileset exists.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [legacyDir, outDir] = process.argv.slice(2);
if (!legacyDir || !outDir) {
  console.error('usage: node scripts/convert-legacy-maps.mjs <legacy-dir> <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const catalogue = JSON.parse(readFileSync(join(root, 'src/data/tiles.json'), 'utf8'));
const generated = JSON.parse(readFileSync(join(root, 'src/data/tilesets.json'), 'utf8'));
const TILE = 32;

const tileDefs = new Map(catalogue.tiles.map((t) => [t.id, t]));
function tileIndex(id) {
  const def = tileDefs.get(id);
  const idx = generated.tilesets[def.tileset]?.tiles[id];
  if (idx === undefined) throw new Error(`no packed index for ${id}`);
  return idx;
}
function columns(tilesetId) {
  return generated.tilesets[tilesetId].columns;
}

function tilesetsFor(tilesetId) {
  const main = generated.tilesets[tilesetId];
  const out = [{
    firstgid: 1, name: tilesetId, image: main.image, imagewidth: main.columns * TILE, imageheight: main.rows * TILE,
    tilewidth: TILE, tileheight: TILE, columns: main.columns, tilecount: main.tilecount, margin: 0, spacing: 0,
  }];
  let next = 1 + main.tilecount;
  for (const t of catalogue.terrains) {
    const gen = generated.autotiles[t.id];
    out.push({
      firstgid: next, name: `autotile:${t.id}`, image: gen.image, imagewidth: 96 * gen.frames, imageheight: 128,
      tilewidth: TILE, tileheight: TILE, columns: 3, tilecount: 12, margin: 0, spacing: 0,
    });
    next += 12;
  }
  return out;
}

/** Path tiles from axis-aligned waypoints. */
function pathTiles(path) {
  const set = new Set();
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    const len = Math.abs(bx - ax) + Math.abs(by - ay);
    for (let s = 0; s <= len; s++) set.add(`${ax + dx * s},${ay + dy * s}`);
  }
  return set;
}

function convert(name, legacy) {
  const { width, height, theme } = legacy;
  const cave = theme === 'cave';
  const tilesetId = cave ? 'placeholder' : 'gen5-outdoor';
  const cols = columns(tilesetId);
  const cells = width * height;
  const ground = new Array(cells).fill(0);
  const terrain = new Array(cells).fill(0);
  const decoration = new Array(cells).fill(0);
  const onPath = pathTiles(legacy.path);
  const placeable = new Set(legacy.placeable.map(([x, y]) => `${x},${y}`));
  const blocked = legacy.blocked ?? [];
  const taken = new Set([...onPath, ...placeable]);
  const key = (x, y) => `${x},${y}`;
  const idx = (x, y) => y * width + x;
  const tilesets = tilesetsFor(tilesetId);
  const autotileGid = (id) => tilesets.find((t) => t.name === `autotile:${id}`).firstgid;

  // Ground.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cave) {
        if (onPath.has(key(x, y))) ground[idx(x, y)] = tileIndex('cave-path') + 1;
        else ground[idx(x, y)] = tileIndex((x + y) % 2 === 0 ? 'cave-floor' : 'cave-floor-2') + 1;
      } else {
        const sparse = (x * 7 + y * 13) % 11 === 0;
        ground[idx(x, y)] = tileIndex(sparse ? 'grass-2' : 'grass') + 1;
        if (onPath.has(key(x, y))) terrain[idx(x, y)] = autotileGid('dirt-path');
      }
    }
  }

  // Decoration: stamps on the old blocked tiles.
  const stamp = (id, x0, y0) => {
    const def = tileDefs.get(id);
    const w = def.w ?? 1;
    const h = def.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        if (taken.has(key(x, y)) || decoration[idx(x, y)] !== 0) return false;
      }
    }
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) decoration[idx(x0 + dx, y0 + dy)] = tileIndex(id) + dy * cols + dx + 1;
    }
    return true;
  };
  for (const [x, y] of blocked) {
    if (decoration[idx(x, y)] !== 0) continue;
    if (cave) {
      stamp('cave-wall', x, y);
      continue;
    }
    // A tree's base sits on the blocked tile; the canopy rises two rows above it.
    if (stamp('tree', x, y - 2)) continue;
    if (stamp('rock-small', x, y)) continue;
  }

  // Lake Verity gets a pond: the first free 5x3 area with a one-tile margin from the path.
  if (name === 'lake-verity') {
    outer: for (let y = 1; y < height - 4; y++) {
      for (let x = 1; x < width - 6; x++) {
        let free = true;
        for (let dy = -1; dy <= 3 && free; dy++) {
          for (let dx = -1; dx <= 5; dx++) {
            if (taken.has(key(x + dx, y + dy)) || decoration[idx(x + dx, y + dy)] !== 0) {
              free = false;
              break;
            }
          }
        }
        if (!free) continue;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 5; dx++) terrain[idx(x + dx, y + dy)] = autotileGid('water');
        decoration[idx(x + 1, y + 1)] = 0;
        ground[idx(x + 1, y + 1)] = tileIndex('grass') + 1;
        break outer;
      }
    }
  }

  const centre = (t) => t * TILE + TILE / 2;
  const [sx, sy] = legacy.path[0];
  const [ex, ey] = legacy.path[legacy.path.length - 1];
  let objectId = 1;
  const pathObjects = [
    { id: objectId++, name: 'path', type: 'path', x: centre(sx), y: centre(sy), width: 0, height: 0, rotation: 0, visible: true,
      polyline: legacy.path.map(([x, y]) => ({ x: centre(x) - centre(sx), y: centre(y) - centre(sy) })) },
    { id: objectId++, name: 'spawn', type: 'spawn', x: centre(sx), y: centre(sy), width: 0, height: 0, rotation: 0, visible: true, point: true },
    { id: objectId++, name: 'exit', type: 'exit', x: centre(ex), y: centre(ey), width: 0, height: 0, rotation: 0, visible: true, point: true },
  ];
  const placeableObjects = legacy.placeable.map(([x, y]) => ({
    id: objectId++, name: 'placeable', type: 'placeable', x: x * TILE, y: y * TILE, width: TILE, height: TILE, rotation: 0, visible: true,
  }));
  const size = { width, height, x: 0, y: 0, opacity: 1, visible: true };
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', compressionlevel: -1,
    infinite: false, width, height, tilewidth: TILE, tileheight: TILE, nextlayerid: 6, nextobjectid: objectId,
    properties: [
      { name: 'name', type: 'string', value: name },
      { name: 'theme', type: 'string', value: theme },
      { name: 'tileset', type: 'string', value: tilesetId },
    ],
    tilesets,
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', ...size, data: ground },
      { id: 2, name: 'terrain', type: 'tilelayer', ...size, data: terrain },
      { id: 3, name: 'decoration', type: 'tilelayer', ...size, data: decoration },
      { id: 4, name: 'path', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: pathObjects },
      { id: 5, name: 'placeable', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: placeableObjects },
    ],
  };
}

for (const file of readdirSync(legacyDir).filter((f) => f.endsWith('.json'))) {
  const legacy = JSON.parse(readFileSync(join(legacyDir, file), 'utf8'));
  if (!Array.isArray(legacy.path) || !Array.isArray(legacy.placeable)) {
    console.log(`skip ${file}: not a legacy map`);
    continue;
  }
  const name = basename(file, '.json');
  const tiled = convert(name, legacy);
  writeFileSync(join(outDir, file), JSON.stringify(tiled, null, 1) + '\n');
  console.log(`converted ${file} (${legacy.theme}, ${legacy.width}x${legacy.height})`);
}
