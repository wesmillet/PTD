/**
 * Target selection for towers. Pure over a candidate list the level builds.
 */
import type { Targeting } from './moves';

export interface TargetCandidate {
  id: number;
  /** Tiles from the tower's tile center. */
  tileDistance: number;
  /** Distance travelled along the path. */
  pathDistance: number;
  hp: number;
}

/**
 * Picks a target within `range` by rule. Ties: for nearest, strongest and
 * weakest the enemy furthest along the path wins; for furthest the nearer
 * one to the tower wins. `self` never selects an enemy.
 */
export function selectTarget<T extends TargetCandidate>(rule: Targeting, candidates: readonly T[], range: number): T | undefined {
  if (rule === 'self') return undefined;
  let best: T | undefined;
  for (const c of candidates) {
    if (c.tileDistance > range) continue;
    if (!best || better(rule, c, best)) best = c;
  }
  return best;
}

function better(rule: Targeting, a: TargetCandidate, b: TargetCandidate): boolean {
  const eps = 1e-9;
  switch (rule) {
    case 'nearest':
      if (Math.abs(a.tileDistance - b.tileDistance) > eps) return a.tileDistance < b.tileDistance;
      return a.pathDistance > b.pathDistance;
    case 'strongest':
      if (a.hp !== b.hp) return a.hp > b.hp;
      return a.pathDistance > b.pathDistance;
    case 'weakest':
      if (a.hp !== b.hp) return a.hp < b.hp;
      return a.pathDistance > b.pathDistance;
    case 'furthest':
      if (Math.abs(a.pathDistance - b.pathDistance) > eps) return a.pathDistance > b.pathDistance;
      return a.tileDistance < b.tileDistance;
    case 'self':
      return false;
  }
}
