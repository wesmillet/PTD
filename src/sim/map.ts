/**
 * Level maps: a tile grid with an axis-aligned enemy path given as waypoints,
 * placeable tiles for towers and blocked decoration tiles. No Phaser imports.
 */
export type Tile = readonly [number, number];

export interface MapDef {
  theme: string;
  width: number;
  height: number;
  tileSize: number;
  path: Tile[];
  placeable: Tile[];
  blocked?: Tile[];
}

export interface PathSegment {
  from: Tile;
  to: Tile;
  /** Unit direction of travel, tile units. */
  dx: number;
  dy: number;
  length: number;
  /** Distance along the path at the segment start. */
  start: number;
}

export interface PathPoint {
  /** Tile-space coordinates (tile centers are at integer values). */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface LevelPath {
  segments: PathSegment[];
  length: number;
  tiles: Set<string>;
}

export const tileKey = (x: number, y: number): string => `${x},${y}`;

/** Builds segment data from waypoints. Waypoints must be axis-aligned and distinct. */
export function buildPath(waypoints: readonly Tile[]): LevelPath {
  if (waypoints.length < 2) throw new Error('buildPath: need at least two waypoints');
  const segments: PathSegment[] = [];
  const tiles = new Set<string>();
  let start = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1] as Tile;
    const to = waypoints[i] as Tile;
    const ddx = to[0] - from[0];
    const ddy = to[1] - from[1];
    if ((ddx !== 0 && ddy !== 0) || (ddx === 0 && ddy === 0)) {
      throw new Error(`buildPath: segment ${i} must be axis-aligned and non-empty`);
    }
    const length = Math.abs(ddx) + Math.abs(ddy);
    const dx = Math.sign(ddx);
    const dy = Math.sign(ddy);
    segments.push({ from, to, dx, dy, length, start });
    for (let s = 0; s <= length; s++) tiles.add(tileKey(from[0] + dx * s, from[1] + dy * s));
    start += length;
  }
  return { segments, length: start, tiles };
}

/** Position and travel direction at a distance along the path (clamped to the ends). */
export function pointAlongPath(path: LevelPath, distance: number): PathPoint {
  const last = path.segments[path.segments.length - 1] as PathSegment;
  if (distance <= 0) {
    const first = path.segments[0] as PathSegment;
    return { x: first.from[0] + first.dx * distance, y: first.from[1] + first.dy * distance, dx: first.dx, dy: first.dy };
  }
  for (const seg of path.segments) {
    if (distance <= seg.start + seg.length) {
      const t = distance - seg.start;
      return { x: seg.from[0] + seg.dx * t, y: seg.from[1] + seg.dy * t, dx: seg.dx, dy: seg.dy };
    }
  }
  const over = distance - path.length;
  return { x: last.to[0] + last.dx * over, y: last.to[1] + last.dy * over, dx: last.dx, dy: last.dy };
}

export function isPlaceable(map: MapDef, x: number, y: number): boolean {
  return map.placeable.some(([px, py]) => px === x && py === y);
}

export function validateMap(map: MapDef): LevelPath {
  const path = buildPath(map.path);
  const inBounds = ([x, y]: Tile) => x >= 0 && y >= 0 && x < map.width && y < map.height;
  for (const t of map.path) if (!inBounds(t)) throw new Error(`map: waypoint ${t} out of bounds`);
  for (const t of map.placeable) {
    if (!inBounds(t)) throw new Error(`map: placeable ${t} out of bounds`);
    if (path.tiles.has(tileKey(t[0], t[1]))) throw new Error(`map: placeable ${t} is on the path`);
  }
  for (const t of map.blocked ?? []) {
    if (path.tiles.has(tileKey(t[0], t[1]))) throw new Error(`map: blocked ${t} is on the path`);
  }
  return path;
}
