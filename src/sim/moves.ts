/**
 * Move resolution: moves.json data merged with the hand-written
 * src/data/move_overrides.json (range, cooldown multiplier, targeting),
 * plus learnset helpers. No Phaser imports.
 */
import overridesJson from '../data/move_overrides.json';
import { findMoveId, getLearnset, getMove, type MoveData } from '../data/pokedata';

export type Targeting = 'nearest' | 'strongest' | 'weakest' | 'furthest' | 'self';

export interface MoveSpec extends MoveData {
  id: number;
  /** Reach in tiles from the tower's tile center. */
  range: number;
  /** Multiplier on the Speed-derived attack interval. */
  cooldownMultiplier: number;
  targeting: Targeting;
}

interface OverrideEntry {
  range?: number;
  cooldown?: number;
  targeting?: Targeting;
}

const overrides = overridesJson as { defaults: Required<OverrideEntry>; moves: Record<string, OverrideEntry> };
const cache = new Map<number, MoveSpec>();

export const MOVE_OVERRIDE_DEFAULTS = overrides.defaults;

export function resolveMove(id: number): MoveSpec {
  const cached = cache.get(id);
  if (cached) return cached;
  const data = getMove(id);
  const o = overrides.moves[data.name] ?? {};
  const spec: MoveSpec = {
    ...data,
    id,
    range: o.range ?? overrides.defaults.range,
    cooldownMultiplier: o.cooldown ?? overrides.defaults.cooldown,
    targeting: o.targeting ?? (data.target === 'user' ? 'self' : overrides.defaults.targeting),
  };
  cache.set(id, spec);
  return spec;
}

/** Every override must name a real move; returns the unknown names. */
export function unknownOverrideNames(): string[] {
  return Object.keys(overrides.moves).filter((name) => findMoveId(name) === undefined);
}

/**
 * The moves a Pokémon knows when met at `level`: the last `max` distinct
 * level-up moves learned at or below that level, in learn order.
 */
export function startingMoves(species: number, level: number, max = 4): number[] {
  const known: number[] = [];
  for (const [learnLevel, moveId] of getLearnset(species)) {
    if (learnLevel > level) break;
    const existing = known.indexOf(moveId);
    if (existing >= 0) known.splice(existing, 1);
    known.push(moveId);
  }
  return known.slice(-max);
}

/** Moves unlocked exactly at `level` (level-up learnset), distinct, in order. */
export function learnableAt(species: number, level: number): number[] {
  const ids: number[] = [];
  for (const [learnLevel, moveId] of getLearnset(species)) {
    if (learnLevel === level && !ids.includes(moveId)) ids.push(moveId);
  }
  return ids;
}
