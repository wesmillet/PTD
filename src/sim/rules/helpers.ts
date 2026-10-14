/** Small shared pieces for rule modules. */
import type { Enemy, LevelState, Tower } from '../level';
import { enemyPoint } from '../level';
import type { Tile } from '../map';

export const GRASS = 12;
export const WATER = 11;
export const FLYING = 3;
export const STEEL = 9;
export const FIRE = 10;
export const FIGHTING = 2;
export const GROUND = 5;

export function dist(a: Tile, b: { x: number; y: number }): number {
  return Math.hypot(a[0] - b.x, a[1] - b.y);
}

/** Tile-space position of an enemy on its lane. */
export function enemyPos(state: LevelState, enemy: Enemy): { x: number; y: number } {
  return enemyPoint(state, enemy);
}

/** Whether any tower stands within `tiles` of the enemy. */
export function towerNear(state: LevelState, enemy: Enemy, tiles: number): boolean {
  const p = enemyPos(state, enemy);
  return state.towers.some((t) => dist(t.tile, p) <= tiles);
}

export function towerNearTile(state: LevelState, tile: Tile, tiles: number): Tower | undefined {
  return state.towers.find((t) => Math.hypot(t.tile[0] - tile[0], t.tile[1] - tile[1]) <= tiles);
}

/** Evenly spaced tiles along the main path (fractions 1/(n+1) .. n/(n+1)). */
export function pathTiles(state: LevelState, n: number): Tile[] {
  const out: Tile[] = [];
  for (let i = 1; i <= n; i++) {
    const p = state.path.segments.length ? pointAt(state, (state.path.length * i) / (n + 1)) : { x: 0, y: 0 };
    out.push([Math.round(p.x), Math.round(p.y)]);
  }
  return out;
}

function pointAt(state: LevelState, distance: number): { x: number; y: number } {
  for (const seg of state.path.segments) {
    if (distance <= seg.start + seg.length) {
      const t = distance - seg.start;
      return { x: seg.from[0] + seg.dx * t, y: seg.from[1] + seg.dy * t };
    }
  }
  const last = state.path.segments[state.path.segments.length - 1]!;
  return { x: last.to[0], y: last.to[1] };
}
