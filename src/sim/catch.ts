/**
 * Gen 4 capture formula. Constants and ball data come from config.json.
 */
import config from '../data/config.json';
import type { Rng } from './rng';
import type { Monster } from './monster';

export interface BallDef {
  name: string;
  modifier: number;
  price: number;
  /** PokeAPI item sprite name (public/assets/items/<sprite>.png). */
  sprite: string;
  condition?: string;
  obtainable?: boolean;
}

export const BALLS = config.balls as Record<string, BallDef>;
export const BALL_IDS = Object.keys(BALLS);
export const STATUS_CATCH_BONUS = config.catch.statusBonus as Record<string, number>;

export interface BallContext {
  /** Enemy types (Net Ball). */
  types: readonly number[];
  /** Target at full HP (Quick Ball). */
  undamaged: boolean;
  /** Level is in a cave or it is night (Dusk Ball). */
  caveOrNight: boolean;
}

const BUG = 7;
const WATER = 11;

/** Effective ball multiplier for a target in context. */
export function ballModifier(ballId: string, ctx: BallContext): number {
  const ball = BALLS[ballId];
  if (!ball) throw new Error(`unknown ball ${ballId}`);
  switch (ball.condition) {
    case 'cave-or-night':
      return ctx.caveOrNight ? ball.modifier : 1;
    case 'bug-or-water':
      return ctx.types.includes(BUG) || ctx.types.includes(WATER) ? ball.modifier : 1;
    case 'undamaged':
      return ctx.undamaged ? ball.modifier : 1;
    default:
      return ball.modifier;
  }
}

/** The "a" value of the Gen 4 formula, capped at 255 meaning a sure catch. */
export function catchValue(maxHp: number, hp: number, catchRate: number, ballMod: number, statusBonus: number): number {
  const base = Math.floor(((3 * maxHp - 2 * hp) * catchRate * ballMod) / (3 * maxHp));
  return Math.min(255, Math.max(1, Math.floor(base * statusBonus)));
}

/** Shake probability threshold (0..65535) for an "a" value below 255. */
export function shakeThreshold(a: number): number {
  return Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)));
}

export interface CatchResult {
  caught: boolean;
  /** Successful shakes, 0..3 on a failure, 4 on a catch. */
  shakes: number;
  a: number;
}

export function statusBonusFor(mon: Monster): number {
  return STATUS_CATCH_BONUS[mon.status.ailment] ?? 1;
}

/** Rolls a capture attempt with the seeded RNG. */
export function attemptCatch(mon: Monster, catchRate: number, ballMod: number, rng: Rng): CatchResult {
  const a = catchValue(mon.stats.hp, mon.hp, catchRate, ballMod, statusBonusFor(mon));
  if (a >= 255) return { caught: true, shakes: 4, a };
  const b = shakeThreshold(a);
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) >= b) break;
    shakes++;
  }
  return { caught: shakes === 4, shakes, a };
}
