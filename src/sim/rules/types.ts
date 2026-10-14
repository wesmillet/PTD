/**
 * The rules engine's contract. A rule is a small module with hooks the
 * level simulation calls; every hook is optional. Rules keep their own
 * state in the instance (closures or fields) and must use `ctx.state.rng`
 * for anything random so levels stay deterministic.
 */
import type { Enemy, LevelEvent, LevelState, Tower } from '../level';
import type { Tile } from '../map';
import type { Monster } from '../monster';
import type { MoveSpec } from '../moves';
import type { RuleDef, SpawnDef } from '../waves';

export interface RuleContext {
  state: LevelState;
  /** Push events here; the scene animates them. */
  events: LevelEvent[];
}

/** What the HUD shows for a rule: a label with an optional meter and button. */
export interface RuleStatus {
  id: string;
  label: string;
  /** Meter value and maximum (a timer, a charge count, a gratitude meter). */
  value?: number;
  max?: number;
  /** Button text when the rule has a player action ready. */
  button?: string;
  /** Spots the rule currently blocks or highlights, for the overlay. */
  blocked?: Tile[];
  /** Lit lanterns or glow centres, for the overlay. */
  glow?: { tile: Tile; radius: number }[];
}

export interface RuleInstance {
  readonly id: string;
  /** Called once the level state exists (towers, lanes). */
  onCreate?(ctx: RuleContext): void;
  /** Called with the 0-based wave index after the wave's spawns are queued; may edit `ctx.state.pending`. */
  onWaveStart?(ctx: RuleContext, waveIndex: number): void;
  /** Every simulation step during a wave (and build phase when `alwaysTick`). */
  onTick?(ctx: RuleContext, dt: number): void;
  alwaysTick?: boolean;
  onSpawn?(ctx: RuleContext, enemy: Enemy, def: SpawnDef): void;
  onTowerPlaced?(ctx: RuleContext, tower: Tower): void;
  onWaveEnd?(ctx: RuleContext, waveIndex: number): void;
  /** Catching or KO hooks (Shaymin's meter). */
  onCaught?(ctx: RuleContext, enemy: Enemy): void;
  onKo?(ctx: RuleContext, enemy: Enemy): void;
  /** Damage a tower's hit does to an enemy; return the damage to apply. */
  onHit?(ctx: RuleContext, tower: Tower, enemy: Enemy, move: MoveSpec, damage: number): number;
  /** Whether a tower may target this enemy (hidden in tall grass, vanished). */
  canTarget?(ctx: RuleContext, tower: Tower, enemy: Enemy): boolean;
  /** A reason a ball cannot be thrown at this enemy, or null. */
  canThrow?(ctx: RuleContext, enemy: Enemy): string | null;
  /** A reason the Pokémon cannot be placed on the tile, or null. */
  canPlace?(ctx: RuleContext, mon: Monster, tile: Tile): string | null;
  /** The tower's range in tiles after the rule (darkness caps it, hail shrinks it). */
  range?(ctx: RuleContext, tower: Tower, range: number): number;
  /** Multiplier on an enemy's walking speed. */
  enemySpeed?(ctx: RuleContext, enemy: Enemy): number;
  /** Multiplier on a tower's damage with this move (sun boosts Fire). */
  damageMultiplier?(ctx: RuleContext, tower: Tower, move: MoveSpec): number;
  /** Which lane the wave's wild spawns use when the wave does not say; undefined keeps the default. */
  pickLane?(ctx: RuleContext, waveIndex: number, spawnIndex: number): string | undefined;
  /** Text for the wave banner. */
  banner?(ctx: RuleContext, waveIndex: number): string | undefined;
  /** A player action (the generator button, a riddle answer); returns whether it did something. */
  activate?(ctx: RuleContext, action?: string): boolean;
  status?(ctx: RuleContext): RuleStatus | undefined;
  /** Whether the level is lost because of the rule (a timer ran out, the escort fell). */
  lost?(ctx: RuleContext): boolean;
}

export interface RuleModule {
  id: string;
  create(params: RuleDef): RuleInstance;
}

export const num = (params: RuleDef, key: string, fallback: number): number => {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
};

export const str = (params: RuleDef, key: string, fallback: string): string => {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
};
