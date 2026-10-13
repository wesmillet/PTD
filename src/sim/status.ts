/**
 * Status conditions and stat stages. Constants come from config.json
 * ("status") and are passed in so the debug panel can tune them live.
 *
 * Effects (documented in GAME_DESIGN.md):
 *   poison     loses poisonFraction of max HP every tickSeconds
 *   burn       loses burnFraction of max HP every tickSeconds; physical damage dealt x burnPhysicalMultiplier
 *   paralysis  path speed x paralysisSpeedMultiplier; attack rate x paralysisAttackRateMultiplier;
 *              each attack skipped with paralysisSkipChance
 *   sleep      stops moving / attacking for sleepSeconds (rolled)
 *   freeze     same as sleep, for freezeSeconds (rolled)
 *   confusion  for confusionSeconds (rolled): each second, with confusionChance, an enemy walks
 *              backwards and a tower wastes its attack
 *   flinch     stops moving / delays the attack for flinchSeconds
 */
import config from '../data/config.json';
import type { StageKey, StatKey } from '../data/pokedata';
import type { Rng } from './rng';

export type AilmentKind = 'none' | 'poison' | 'burn' | 'paralysis' | 'sleep' | 'freeze' | 'confusion';

export const AILMENTS: readonly AilmentKind[] = ['poison', 'burn', 'paralysis', 'sleep', 'freeze', 'confusion'];

export interface StatusConfig {
  tickSeconds: number;
  poisonFraction: number;
  burnFraction: number;
  burnPhysicalMultiplier: number;
  paralysisSpeedMultiplier: number;
  paralysisAttackRateMultiplier: number;
  paralysisSkipChance: number;
  sleepSeconds: [number, number];
  freezeSeconds: [number, number];
  confusionSeconds: [number, number];
  confusionChance: number;
  flinchSeconds: number;
}

export const DEFAULT_STATUS_CONFIG: StatusConfig = config.status as StatusConfig;

export type Stages = Record<StatKey, number>;

export interface StatusState {
  ailment: AilmentKind;
  /** Remaining seconds for timed ailments (sleep, freeze, confusion); 0 for untimed. */
  ailmentSeconds: number;
  flinchSeconds: number;
  /** Time since the last poison/burn tick. */
  tickTimer: number;
  /** Confusion: time until the next backwards/wasted roll, and the current roll. */
  confusionTimer: number;
  confused: boolean;
  stages: Stages;
}

export function createStatus(): StatusState {
  return {
    ailment: 'none',
    ailmentSeconds: 0,
    flinchSeconds: 0,
    tickTimer: 0,
    confusionTimer: 0,
    confused: false,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };
}

export function isAilment(name: string): name is Exclude<AilmentKind, 'none'> {
  return (AILMENTS as readonly string[]).includes(name);
}

/** Applies an ailment unless one is already present. Returns whether it took. */
export function applyAilment(status: StatusState, ailment: AilmentKind, rng: Rng, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): boolean {
  if (ailment === 'none' || status.ailment !== 'none') return false;
  status.ailment = ailment;
  status.tickTimer = 0;
  status.confusionTimer = 0;
  status.confused = false;
  const range =
    ailment === 'sleep' ? cfg.sleepSeconds : ailment === 'freeze' ? cfg.freezeSeconds : ailment === 'confusion' ? cfg.confusionSeconds : null;
  status.ailmentSeconds = range ? rng.float(range[0], range[1]) : 0;
  return true;
}

export function cureAilment(status: StatusState): void {
  status.ailment = 'none';
  status.ailmentSeconds = 0;
  status.confused = false;
}

export function applyFlinch(status: StatusState, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): void {
  status.flinchSeconds = Math.max(status.flinchSeconds, cfg.flinchSeconds);
}

/** Gen 4 stage multiplier for the five battle stats. */
export function stageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return Math.max(2, 2 + s) / Math.max(2, 2 - s);
}

export interface StageChange {
  stat: StageKey;
  change: number;
}

/** Applies stage changes, clamped to -6..+6. Accuracy and evasion are ignored for now. Returns what actually changed. */
export function applyStages(status: StatusState, changes: readonly StageChange[]): StageChange[] {
  const applied: StageChange[] = [];
  for (const { stat, change } of changes) {
    if (stat === 'accuracy' || stat === 'evasion' || stat === 'hp') continue;
    const before = status.stages[stat];
    const after = Math.max(-6, Math.min(6, before + change));
    if (after !== before) {
      status.stages[stat] = after;
      applied.push({ stat, change: after - before });
    }
  }
  return applied;
}

export function effectiveStat(baseValue: number, status: StatusState, key: StatKey): number {
  if (key === 'hp') return baseValue;
  return Math.max(1, Math.floor(baseValue * stageMultiplier(status.stages[key])));
}

export interface StatusTick {
  /** HP lost to poison or burn this step. */
  damage: number;
  /** An ailment that expired this step. */
  ended: AilmentKind | null;
}

/** Advances timers; returns damage dealt by poison/burn and any ailment that ended. */
export function tickStatus(
  status: StatusState,
  maxHp: number,
  dt: number,
  rng: Rng,
  cfg: StatusConfig = DEFAULT_STATUS_CONFIG,
): StatusTick {
  const result: StatusTick = { damage: 0, ended: null };
  if (status.flinchSeconds > 0) status.flinchSeconds = Math.max(0, status.flinchSeconds - dt);
  switch (status.ailment) {
    case 'poison':
    case 'burn': {
      status.tickTimer += dt;
      const fraction = status.ailment === 'poison' ? cfg.poisonFraction : cfg.burnFraction;
      while (status.tickTimer >= cfg.tickSeconds) {
        status.tickTimer -= cfg.tickSeconds;
        result.damage += Math.max(1, Math.floor(maxHp * fraction));
      }
      break;
    }
    case 'sleep':
    case 'freeze':
    case 'confusion': {
      if (status.ailment === 'confusion') {
        status.confusionTimer -= dt;
        if (status.confusionTimer <= 0) {
          status.confusionTimer += 1;
          status.confused = rng.chance(cfg.confusionChance);
        }
      }
      status.ailmentSeconds -= dt;
      if (status.ailmentSeconds <= 0) {
        result.ended = status.ailment;
        cureAilment(status);
      }
      break;
    }
    default:
      break;
  }
  return result;
}

/**
 * Multiplier on path movement. 0 = stopped; negative = walking backwards
 * (confusion). Paralysis slows.
 */
export function speedMultiplier(status: StatusState, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): number {
  if (status.flinchSeconds > 0 || status.ailment === 'sleep' || status.ailment === 'freeze') return 0;
  const base = status.ailment === 'paralysis' ? cfg.paralysisSpeedMultiplier : 1;
  return status.ailment === 'confusion' && status.confused ? -base : base;
}

/** Multiplier on attack rate (cooldown divides by this). 0 = cannot attack. */
export function attackRateMultiplier(status: StatusState, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): number {
  if (status.ailment === 'sleep' || status.ailment === 'freeze') return 0;
  return status.ailment === 'paralysis' ? cfg.paralysisAttackRateMultiplier : 1;
}

export type AttackBlock = 'flinch' | 'sleep' | 'freeze' | 'paralysis' | 'confusion' | null;

/** Whether an attack that is off cooldown may fire now; returns the reason it cannot. */
export function attackBlockedBy(status: StatusState, rng: Rng, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): AttackBlock {
  if (status.flinchSeconds > 0) return 'flinch';
  if (status.ailment === 'sleep') return 'sleep';
  if (status.ailment === 'freeze') return 'freeze';
  if (status.ailment === 'paralysis' && rng.chance(cfg.paralysisSkipChance)) return 'paralysis';
  if (status.ailment === 'confusion' && status.confused) return 'confusion';
  return null;
}

export function physicalDamageMultiplier(status: StatusState, cfg: StatusConfig = DEFAULT_STATUS_CONFIG): number {
  return status.ailment === 'burn' ? cfg.burnPhysicalMultiplier : 1;
}
