/**
 * Rule registry: `createRules` builds the instances a level names, and the
 * `rule*` helpers fold every instance's answer for the simulation.
 */
import type { Enemy, LevelEvent, LevelState, Tower } from '../level';
import type { Tile } from '../map';
import type { Monster } from '../monster';
import type { MoveSpec } from '../moves';
import type { RuleDef, SpawnDef } from '../waves';
import { charge } from './charge';
import { darkness } from './darkness';
import { escort } from './escort';
import { gravityShift } from './gravityShift';
import { iceFloor } from './iceFloor';
import { ironDefense } from './ironDefense';
import { rockfall } from './rockfall';
import { shadowWave } from './shadowWave';
import { sunAndShade } from './sunAndShade';
import { tagAlly } from './tagAlly';
import { tide } from './tide';
import { timer } from './timer';
import { twoLanes } from './twoLanes';
import { wind } from './wind';
import { nightmare } from './nightmare';
import { gratitude } from './gratitude';
import { distortion } from './distortion';
import { challenge } from './challenge';
import { stadium } from './stadium';
import { safari } from './safari';
import { waterLane } from './waterLane';
import { rooms } from './rooms';
import type { RuleContext, RuleInstance, RuleModule, RuleStatus } from './types';

export type { RuleContext, RuleInstance, RuleModule, RuleStatus } from './types';

const MODULES: RuleModule[] = [rockfall, sunAndShade, darkness, twoLanes, tide, ironDefense, iceFloor, charge, gravityShift, tagAlly, timer, escort, shadowWave, wind, nightmare, gratitude, distortion, challenge, stadium, safari, waterLane, rooms];
const REGISTRY = new Map(MODULES.map((m) => [m.id, m]));

export function ruleIds(): string[] {
  return [...REGISTRY.keys()];
}

export function hasRule(id: string): boolean {
  return REGISTRY.has(id);
}

/** Instances for a level's rule list; unknown ids throw so content mistakes show in the tests. */
export function createRules(defs: readonly RuleDef[] | undefined): RuleInstance[] {
  return (defs ?? []).map((def) => {
    const mod = REGISTRY.get(def.id);
    if (!mod) throw new Error(`unknown rule "${def.id}"`);
    return mod.create(def);
  });
}

const ctx = (state: LevelState, events: LevelEvent[]): RuleContext => ({ state, events });

export function rulesOnCreate(state: LevelState, events: LevelEvent[]): void {
  for (const r of state.rules) r.onCreate?.(ctx(state, events));
}
export function rulesOnWaveStart(state: LevelState, waveIndex: number, events: LevelEvent[]): void {
  for (const r of state.rules) r.onWaveStart?.(ctx(state, events), waveIndex);
}
export function rulesOnTick(state: LevelState, dt: number, events: LevelEvent[], building: boolean): void {
  for (const r of state.rules) if (!building || r.alwaysTick) r.onTick?.(ctx(state, events), dt);
}
export function rulesOnSpawn(state: LevelState, enemy: Enemy, def: SpawnDef, events: LevelEvent[]): void {
  for (const r of state.rules) r.onSpawn?.(ctx(state, events), enemy, def);
}
export function rulesOnTowerPlaced(state: LevelState, tower: Tower, events: LevelEvent[]): void {
  for (const r of state.rules) r.onTowerPlaced?.(ctx(state, events), tower);
}
export function rulesOnWaveEnd(state: LevelState, waveIndex: number, events: LevelEvent[]): void {
  for (const r of state.rules) r.onWaveEnd?.(ctx(state, events), waveIndex);
}
export function rulesOnCaught(state: LevelState, enemy: Enemy, events: LevelEvent[]): void {
  for (const r of state.rules) r.onCaught?.(ctx(state, events), enemy);
}
export function rulesOnKo(state: LevelState, enemy: Enemy, events: LevelEvent[]): void {
  for (const r of state.rules) r.onKo?.(ctx(state, events), enemy);
}
export function rulesOnHit(state: LevelState, tower: Tower, enemy: Enemy, move: MoveSpec, damage: number, events: LevelEvent[]): number {
  let d = damage;
  for (const r of state.rules) if (r.onHit) d = r.onHit(ctx(state, events), tower, enemy, move, d);
  return d;
}
export function rulesCanTarget(state: LevelState, tower: Tower, enemy: Enemy): boolean {
  const c = ctx(state, []);
  return state.rules.every((r) => r.canTarget?.(c, tower, enemy) ?? true);
}
export function rulesCanThrow(state: LevelState, enemy: Enemy): string | null {
  const c = ctx(state, []);
  for (const r of state.rules) {
    const reason = r.canThrow?.(c, enemy);
    if (reason) return reason;
  }
  return null;
}
export function rulesCanPlace(state: LevelState, mon: Monster, tile: Tile): string | null {
  const c = ctx(state, []);
  for (const r of state.rules) {
    const reason = r.canPlace?.(c, mon, tile);
    if (reason) return reason;
  }
  return null;
}
export function rulesRange(state: LevelState, tower: Tower, range: number): number {
  const c = ctx(state, []);
  let out = range;
  for (const r of state.rules) if (r.range) out = r.range(c, tower, out);
  return Math.max(0.5, out);
}
export function rulesAttackRate(state: LevelState, tower: Tower): number {
  const c = ctx(state, []);
  let m = 1;
  for (const r of state.rules) if (r.attackRate) m *= r.attackRate(c, tower);
  return m;
}
export function rulesEnemySpeed(state: LevelState, enemy: Enemy): number {
  const c = ctx(state, []);
  let m = 1;
  for (const r of state.rules) if (r.enemySpeed) m *= r.enemySpeed(c, enemy);
  return m;
}
export function rulesDamageMultiplier(state: LevelState, tower: Tower, move: MoveSpec): number {
  const c = ctx(state, []);
  let m = 1;
  for (const r of state.rules) if (r.damageMultiplier) m *= r.damageMultiplier(c, tower, move);
  return m;
}
export function rulesPickLane(state: LevelState, waveIndex: number, spawnIndex: number, species?: number): string | undefined {
  const c = ctx(state, []);
  for (const r of state.rules) {
    const lane = r.pickLane?.(c, waveIndex, spawnIndex, species);
    if (lane) return lane;
  }
  return undefined;
}
/** Whether a rule handled an enemy reaching the end of its lane (no leak). */
export function rulesOnReachEnd(state: LevelState, enemy: Enemy, events: LevelEvent[]): boolean {
  const c = ctx(state, events);
  return state.rules.some((r) => r.onReachEnd?.(c, enemy) ?? false);
}
export function rulesBanner(state: LevelState, waveIndex: number): string[] {
  const c = ctx(state, []);
  return state.rules.map((r) => r.banner?.(c, waveIndex)).filter((t): t is string => !!t);
}
/** Runs a rule's player action; returns the events it produced (empty when nothing happened). */
export function activateRule(state: LevelState, ruleId: string, action?: string): LevelEvent[] {
  const events: LevelEvent[] = [];
  const rule = state.rules.find((r) => r.id === ruleId);
  if (!rule?.activate) return events;
  rule.activate(ctx(state, events), action);
  return events;
}
export function ruleStatuses(state: LevelState): RuleStatus[] {
  const c = ctx(state, []);
  return state.rules.map((r) => r.status?.(c)).filter((s): s is RuleStatus => !!s);
}
export function rulesLost(state: LevelState): boolean {
  const c = ctx(state, []);
  return state.rules.some((r) => r.lost?.(c) ?? false);
}
/** The rule instance with this id, if the level runs it. */
export function findRule(state: LevelState, id: string): RuleInstance | undefined {
  return state.rules.find((r) => r.id === id);
}
