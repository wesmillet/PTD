/**
 * Tile catalogue: named tiles and terrains from src/data/tiles.json joined
 * with the packed indices in the generated src/data/tilesets.json. No Phaser.
 */
import tilesJson from '../data/tiles.json';
import tilesetsJson from '../data/tilesets.json';

export type Layer = 'ground' | 'decoration';

export interface TileEntry {
  id: string;
  name: string;
  group: string;
  layer: Layer;
  tileset: string;
  /** Stamp size in tiles. */
  w: number;
  h: number;
  /** Blocks placement (trees, rocks, walls). */
  solid: boolean;
  placeholder: boolean;
  /** Index of the stamp's top-left tile in the packed sheet. */
  index: number;
}

export interface TerrainEntry {
  id: string;
  name: string;
  group: string;
  /** Suggested ground tile under the terrain, when its edges are drawn on a specific ground. */
  base?: string;
  image: string;
  frames: number;
  frameMs: number;
  hasInner: boolean;
}

export interface TilesetInfo {
  id: string;
  name: string;
  theme: string;
  image: string;
  columns: number;
  rows: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
}

interface CatalogueTile {
  id: string;
  name: string;
  group: string;
  layer: Layer;
  tileset: string;
  w?: number;
  h?: number;
  solid?: boolean;
  placeholder?: boolean;
}

interface CatalogueTerrain {
  id: string;
  name: string;
  group: string;
  base?: string;
}

interface GeneratedTileset {
  image: string;
  columns: number;
  rows: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
  tiles: Record<string, number>;
}

const catalogue = tilesJson as unknown as {
  tilesets: Record<string, { name: string; columns: number; theme: string }>;
  tiles: CatalogueTile[];
  terrains: CatalogueTerrain[];
  credits: { title: string; lines: string[] };
};
const generated = tilesetsJson as unknown as {
  tilesets: Record<string, GeneratedTileset>;
  autotiles: Record<string, { image: string; frames: number; frameMs: number; hasInner: boolean }>;
};

const tilesetList: TilesetInfo[] = Object.entries(catalogue.tilesets).map(([id, def]) => {
  const gen = generated.tilesets[id];
  if (!gen) throw new Error(`tilesets.json has no entry for "${id}"; run node scripts/build-tilesets.mjs`);
  return { id, name: def.name, theme: def.theme, image: gen.image, columns: gen.columns, rows: gen.rows, tilecount: gen.tilecount, tilewidth: gen.tilewidth, tileheight: gen.tileheight };
});

const tileList: TileEntry[] = catalogue.tiles.map((t) => {
  const index = generated.tilesets[t.tileset]?.tiles[t.id];
  if (index === undefined) throw new Error(`tilesets.json has no packed index for tile "${t.id}"; run node scripts/build-tilesets.mjs`);
  return { id: t.id, name: t.name, group: t.group, layer: t.layer, tileset: t.tileset, w: t.w ?? 1, h: t.h ?? 1, solid: t.solid ?? false, placeholder: t.placeholder ?? false, index };
});

const terrainList: TerrainEntry[] = catalogue.terrains.map((t) => {
  const gen = generated.autotiles[t.id];
  if (!gen) throw new Error(`tilesets.json has no autotile for terrain "${t.id}"; run node scripts/build-tilesets.mjs`);
  const entry: TerrainEntry = { id: t.id, name: t.name, group: t.group, image: gen.image, frames: gen.frames, frameMs: gen.frameMs, hasInner: gen.hasInner };
  if (t.base) entry.base = t.base;
  return entry;
});

const byId = new Map(tileList.map((t) => [t.id, t]));
const terrainById = new Map(terrainList.map((t) => [t.id, t]));
/** tileset id -> packed index -> entry covering that cell (stamps cover several). */
const byIndex = new Map<string, Map<number, TileEntry>>();
for (const t of tileList) {
  let m = byIndex.get(t.tileset);
  if (!m) byIndex.set(t.tileset, (m = new Map()));
  const columns = generated.tilesets[t.tileset]!.columns;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) m.set(t.index + y * columns + x, t);
}

export function tilesets(): TilesetInfo[] {
  return tilesetList;
}

export function tileset(id: string): TilesetInfo {
  const ts = tilesetList.find((t) => t.id === id);
  if (!ts) throw new Error(`catalogue: unknown tileset "${id}"`);
  return ts;
}

export function tileEntries(tilesetId?: string): TileEntry[] {
  return tilesetId ? tileList.filter((t) => t.tileset === tilesetId) : tileList;
}

export function tileEntry(id: string): TileEntry {
  const t = byId.get(id);
  if (!t) throw new Error(`catalogue: unknown tile "${id}"`);
  return t;
}

/** The catalogue entry whose stamp covers a packed index, if any. */
export function entryAtIndex(tilesetId: string, index: number): TileEntry | undefined {
  return byIndex.get(tilesetId)?.get(index);
}

/** Packed index of one cell of a stamp. */
export function stampIndex(entry: TileEntry, dx: number, dy: number): number {
  return entry.index + dy * tileset(entry.tileset).columns + dx;
}

export function terrains(): TerrainEntry[] {
  return terrainList;
}

export function terrain(id: string): TerrainEntry {
  const t = terrainById.get(id);
  if (!t) throw new Error(`catalogue: unknown terrain "${id}"`);
  return t;
}

export function hasTerrain(id: string): boolean {
  return terrainById.has(id);
}

export function tilesetCredits(): { title: string; lines: string[] } {
  return catalogue.credits;
}
