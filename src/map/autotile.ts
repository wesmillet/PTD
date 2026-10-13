/**
 * RPG Maker XP autotiling. No Phaser imports.
 *
 * An autotile image is 96x128 px per animation frame (frames side by side),
 * laid out as 3x4 tiles of 32 px:
 *
 *   row 0: preview | (unused) | inner corners
 *   row 1: TL      | T        | TR
 *   row 2: L       | C        | R
 *   row 3: BL      | B        | BR
 *
 * Each rendered cell is composed from four 16x16 quarters. The quarter for a
 * quadrant depends only on that quadrant's two edge neighbours and its
 * diagonal neighbour, which is exactly the 47-combination table RPG Maker
 * uses, expressed per quadrant instead of per cell.
 */

export const TILE = 32;
export const QUARTER = TILE / 2;
export const FRAME_WIDTH = 3 * TILE;
export const FRAME_HEIGHT = 4 * TILE;

/** Neighbour bits, clockwise from north. */
export const N = 1;
export const NE = 2;
export const E = 4;
export const SE = 8;
export const S = 16;
export const SW = 32;
export const W = 64;
export const NW = 128;

/** Quadrants of a cell. */
export const TL = 0;
export const TR = 1;
export const BL = 2;
export const BR = 3;
export type Quadrant = 0 | 1 | 2 | 3;

/** Pixel offset of a 16x16 quarter inside frame 0 of the autotile image. */
export interface QuarterRef {
  x: number;
  y: number;
}

/** Tile positions (in tile units) inside one frame. */
const PREVIEW = [0, 0] as const;
const INNER = [2, 0] as const;
const TILE_TL = [0, 1] as const;
const TILE_T = [1, 1] as const;
const TILE_TR = [2, 1] as const;
const TILE_L = [0, 2] as const;
const TILE_C = [1, 2] as const;
const TILE_R = [2, 2] as const;
const TILE_BL = [0, 3] as const;
const TILE_B = [1, 3] as const;
const TILE_BR = [2, 3] as const;

const QUADRANT_OFFSET: Record<Quadrant, [number, number]> = { 0: [0, 0], 1: [1, 0], 2: [0, 1], 3: [1, 1] };

function quarterOf(tile: readonly [number, number], quadrant: Quadrant): QuarterRef {
  const [qx, qy] = QUADRANT_OFFSET[quadrant];
  return { x: tile[0] * TILE + qx * QUARTER, y: tile[1] * TILE + qy * QUARTER };
}

/** The preview tile (top-left of the image), used for thumbnails and Tiled. */
export function previewRect(frame = 0): { x: number; y: number; w: number; h: number } {
  return { x: frame * FRAME_WIDTH + PREVIEW[0] * TILE, y: PREVIEW[1] * TILE, w: TILE, h: TILE };
}

/**
 * Builds the 8-neighbour mask. `same(dx, dy)` says whether the neighbour at
 * that offset has the same terrain.
 */
export function neighbourMask(same: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  if (same(0, -1)) mask |= N;
  if (same(1, -1)) mask |= NE;
  if (same(1, 0)) mask |= E;
  if (same(1, 1)) mask |= SE;
  if (same(0, 1)) mask |= S;
  if (same(-1, 1)) mask |= SW;
  if (same(-1, 0)) mask |= W;
  if (same(-1, -1)) mask |= NW;
  return mask;
}

/** Per-quadrant neighbour bits: [vertical edge neighbour, horizontal edge neighbour, diagonal]. */
const QUADRANT_BITS: Record<Quadrant, [number, number, number]> = {
  0: [N, W, NW],
  1: [N, E, NE],
  2: [S, W, SW],
  3: [S, E, SE],
};

/** Source tiles per quadrant: [outer corner, tile when only the vertical neighbour is present, tile when only the horizontal neighbour is present]. */
const QUADRANT_TILES: Record<Quadrant, [readonly [number, number], readonly [number, number], readonly [number, number]]> = {
  0: [TILE_TL, TILE_L, TILE_T],
  1: [TILE_TR, TILE_R, TILE_T],
  2: [TILE_BL, TILE_L, TILE_B],
  3: [TILE_BR, TILE_R, TILE_B],
};

/** Which quarter a quadrant shows for a neighbour mask. */
export function quadrantQuarter(mask: number, quadrant: Quadrant): QuarterRef {
  const [vBit, hBit, dBit] = QUADRANT_BITS[quadrant];
  const [corner, vertical, horizontal] = QUADRANT_TILES[quadrant];
  const v = (mask & vBit) !== 0;
  const h = (mask & hBit) !== 0;
  const d = (mask & dBit) !== 0;
  if (!v && !h) return quarterOf(corner, quadrant);
  if (v && !h) return quarterOf(vertical, quadrant);
  if (!v && h) return quarterOf(horizontal, quadrant);
  if (!d) return quarterOf(INNER, quadrant);
  return quarterOf(TILE_C, quadrant);
}

/** The four quarters (TL, TR, BL, BR) that make up a cell with this mask. */
export function composeCell(mask: number): [QuarterRef, QuarterRef, QuarterRef, QuarterRef] {
  return [quadrantQuarter(mask, TL), quadrantQuarter(mask, TR), quadrantQuarter(mask, BL), quadrantQuarter(mask, BR)];
}

/** Pixel rectangle of a quarter in a given animation frame. */
export function quarterRect(ref: QuarterRef, frame = 0): { x: number; y: number; w: number; h: number } {
  return { x: ref.x + frame * FRAME_WIDTH, y: ref.y, w: QUARTER, h: QUARTER };
}

/** Destination offset of a quadrant inside a 32 px cell. */
export function quadrantOffset(quadrant: Quadrant): { x: number; y: number } {
  const [qx, qy] = QUADRANT_OFFSET[quadrant];
  return { x: qx * QUARTER, y: qy * QUARTER };
}

export interface ComposeOptions {
  /** Treat cells outside the map as the same terrain, so patches touching the map edge have no border there. Default true. */
  edgesConnect?: boolean;
}

/**
 * Neighbour mask for every cell of a terrain grid. `grid[y * width + x]` is
 * the terrain id or '' / null for none. Cells without terrain get -1.
 */
export function maskGrid(grid: readonly (string | null | undefined)[], width: number, height: number, options: ComposeOptions = {}): number[] {
  const edgesConnect = options.edgesConnect ?? true;
  const at = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return grid[y * width + x] || null;
  };
  const out = new Array<number>(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = at(x, y);
      if (!id) continue;
      out[y * width + x] = neighbourMask((dx, dy) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return edgesConnect;
        return at(nx, ny) === id;
      });
    }
  }
  return out;
}

/** Number of distinct cell appearances (RPG Maker's 47 plus one for "no neighbours" duplicates). */
export function distinctCells(): number {
  const seen = new Set<string>();
  for (let mask = 0; mask < 256; mask++) seen.add(JSON.stringify(composeCell(mask)));
  return seen.size;
}
