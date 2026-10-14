#!/usr/bin/env node
/**
 * Builds the shipped tilesets from the catalogue in src/data/tiles.json:
 *
 *   public/assets/tilesets/<tileset>.png          packed sheet, 8 tiles wide,
 *                                                 only the tiles the catalogue names
 *   public/assets/tilesets/autotiles/<terrain>.png RPG Maker XP autotile (96x128 per frame)
 *   public/assets/tilesets/CREDITS.txt            copied from assets-src
 *   src/data/tilesets.json                        generated index: tile id -> packed index
 *
 * Packing is sequential in catalogue order (shelf packing, no gap filling), so
 * appending entries never moves existing tiles and saved maps keep working.
 * Usage: node scripts/build-tilesets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blit, createImage, decodePng, encodePng, fillRect } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 32;
const HALF = TILE / 2;
const catalogue = JSON.parse(readFileSync(join(root, 'src/data/tiles.json'), 'utf8'));
const outDir = join(root, 'public/assets/tilesets');
mkdirSync(join(outDir, 'autotiles'), { recursive: true });

const sources = new Map();
function source(name) {
  if (!sources.has(name)) {
    const def = catalogue.sources[name];
    if (!def) throw new Error(`tiles.json: unknown source "${name}"`);
    const img = decodePng(readFileSync(join(root, def.file)));
    if (img.width % TILE !== 0 || img.height % TILE !== 0) throw new Error(`${def.file}: not a multiple of ${TILE} px`);
    sources.set(name, img);
  }
  return sources.get(name);
}

function parseColor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255];
}

/** Draws a flat placeholder tile: a solid colour with a slightly darker 1px inset so cells read as tiles. */
function placeholderTile(dst, dx, dy, color) {
  const [r, g, b] = parseColor(color);
  fillRect(dst, dx, dy, TILE, TILE, [r, g, b, 255]);
  const dark = [Math.max(0, r - 10), Math.max(0, g - 10), Math.max(0, b - 10), 255];
  fillRect(dst, dx, dy + TILE - 1, TILE, 1, dark);
  fillRect(dst, dx + TILE - 1, dy, 1, TILE, dark);
}

// ---------------------------------------------------------------- tilesets
const index = { tilesets: {}, autotiles: {} };

for (const [tilesetId, tilesetDef] of Object.entries(catalogue.tilesets)) {
  const columns = tilesetDef.columns ?? 8;
  const entries = catalogue.tiles.filter((t) => t.tileset === tilesetId);
  // Shelf packing in catalogue order.
  const placed = [];
  let cx = 0;
  let shelfY = 0;
  let shelfH = 0;
  for (const tile of entries) {
    const w = tile.w ?? 1;
    const h = tile.h ?? 1;
    if (w > columns) throw new Error(`tile ${tile.id}: wider than the sheet`);
    if (cx + w > columns) {
      cx = 0;
      shelfY += shelfH;
      shelfH = 0;
    }
    placed.push({ tile, col: cx, row: shelfY, w, h });
    cx += w;
    shelfH = Math.max(shelfH, h);
  }
  const rows = shelfY + shelfH;
  const sheet = createImage(columns * TILE, Math.max(1, rows) * TILE);
  const tiles = {};
  for (const { tile, col, row, w, h } of placed) {
    if (tile.color) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) placeholderTile(sheet, (col + x) * TILE, (row + y) * TILE, tile.color);
    } else {
      const src = source(tile.source);
      if ((tile.col + w) * TILE > src.width || (tile.row + h) * TILE > src.height) {
        throw new Error(`tile ${tile.id}: (${tile.col},${tile.row}) ${w}x${h} is outside ${tile.source}`);
      }
      blit(src, tile.col * TILE, tile.row * TILE, w * TILE, h * TILE, sheet, col * TILE, row * TILE);
    }
    tiles[tile.id] = row * columns + col;
  }
  const image = `assets/tilesets/${tilesetId}.png`;
  writeFileSync(join(outDir, `${tilesetId}.png`), encodePng(sheet));
  index.tilesets[tilesetId] = { image, columns, rows, tilecount: columns * rows, tilewidth: TILE, tileheight: TILE, tiles };
  console.log(`${tilesetId}: ${entries.length} entries, ${columns}x${rows} tiles -> ${image}`);
}

// ---------------------------------------------------------------- autotiles
/**
 * RMXP autotile layout (3x4 tiles of 32px per animation frame):
 *   row 0: preview | (blank) | inner corners
 *   row 1: TL  T  TR
 *   row 2: L   C  R
 *   row 3: BL  B  BR
 */
function copyTile(src, sc, sr, dst, dc, dr) {
  blit(src, sc * TILE, sr * TILE, TILE, TILE, dst, dc * TILE, dr * TILE);
}
function copyQuarter(src, sc, sr, qx, qy, dst, dc, dr) {
  blit(src, sc * TILE + qx * HALF, sr * TILE + qy * HALF, HALF, HALF, dst, dc * TILE + qx * HALF, dr * TILE + qy * HALF);
}

for (const terrain of catalogue.terrains) {
  const src = source(terrain.source);
  const frames = [terrain.block, ...(terrain.frames ?? [])];
  const size = terrain.blockSize ?? 3;
  const idx = size === 4 ? [0, 1, 3] : [0, 1, 2];
  const out = createImage(96 * frames.length, 128);
  frames.forEach(([bc, br], f) => {
    const ox = f * 3;
    const cell = (i, j) => [bc + idx[i], br + idx[j]];
    const [cc, cr] = cell(1, 1);
    copyTile(src, cc, cr, out, ox + 0, 0); // preview
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) copyTile(src, ...cell(i, j), out, ox + i, 1 + j);
    // Inner corners: from the 2x2 inner block when the sheet has one, else the
    // outer corner quarters (a right-angled fallback that still closes the edge).
    const inner = f === 0 ? terrain.inner : (terrain.innerFrames?.[f - 1] ?? terrain.inner);
    if (inner) {
      const [ic, ir] = inner;
      copyQuarter(src, ic, ir, 0, 0, out, ox + 2, 0);
      copyQuarter(src, ic + 1, ir, 1, 0, out, ox + 2, 0);
      copyQuarter(src, ic, ir + 1, 0, 1, out, ox + 2, 0);
      copyQuarter(src, ic + 1, ir + 1, 1, 1, out, ox + 2, 0);
    } else {
      copyQuarter(src, ...cell(0, 0), 0, 0, out, ox + 2, 0);
      copyQuarter(src, ...cell(2, 0), 1, 0, out, ox + 2, 0);
      copyQuarter(src, ...cell(0, 2), 0, 1, out, ox + 2, 0);
      copyQuarter(src, ...cell(2, 2), 1, 1, out, ox + 2, 0);
    }
  });
  const image = `assets/tilesets/autotiles/${terrain.id}.png`;
  writeFileSync(join(outDir, 'autotiles', `${terrain.id}.png`), encodePng(out));
  index.autotiles[terrain.id] = { image, frames: frames.length, frameMs: terrain.frameMs ?? 250, hasInner: Boolean(terrain.inner) };
  console.log(`autotile ${terrain.id}: ${frames.length} frame(s)${terrain.inner ? ', inner corners' : ''} -> ${image}`);
}

copyFileSync(join(root, 'assets-src/tilesets/gen5/CREDITS.txt'), join(outDir, 'CREDITS.txt'));
writeFileSync(join(root, 'src/data/tilesets.json'), JSON.stringify(index, null, 1) + '\n');
console.log('wrote src/data/tilesets.json');
