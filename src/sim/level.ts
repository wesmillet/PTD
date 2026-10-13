/**
 * The level state machine. Pure and deterministic: same level definition,
 * seed, party and sequence of calls produce the same result. The Phaser
 * scene renders this state and animates the events `step` returns.
 */
import { encounterTable, expForLevel, getEncounterArea, type EncounterEntry, type TimeOfDay } from '../data/pokedata';
import config from '../data/config.json';
import { hits, rollDamage, type DamageResult } from './damage';
import { gainExp, hitExp, koExp } from './exp';
import { isPlaceable, pointAlongPath, validateMap, type LevelPath, type MapDef, type Tile } from './map';
import { activeMoveId, createMonster, makeMoveSlot, setMonsterLevel, type Monster } from './monster';
import { learnableAt, resolveMove, type MoveSpec } from './moves';
import { Rng } from './rng';
import { attackCooldown, enemyTilesPerSec, type SpeedConfig } from './speed';
import {
  applyAilment,
  applyFlinch,
  applyStages,
  attackBlockedBy,
  attackRateMultiplier,
  isAilment,
  physicalDamageMultiplier,
  speedMultiplier,
  stageMultiplier,
  tickStatus,
  type AilmentKind,
  type AttackBlock,
  type StageChange,
  type StatusConfig,
} from './status';
import { selectTarget, type TargetCandidate } from './targeting';
import { generateWave, type LevelDef, type SpawnDef } from './waves';

export type Phase = 'build' | 'wave' | 'won' | 'lost' | 'left';

export interface RuntimeConfig {
  speed: SpeedConfig;
  combat: { critRate: number; defaultRangeTiles: number; maxMoves: number };
  exp: { expPerHitFraction: number };
  waves: { freeWaveMaxEnemies: number; freeWaveGapSeconds: number };
  status: StatusConfig;
  shinyRate: number;
  /** Debug: force spawned enemies to this level (undefined = off). */
  enemyLevelOverride?: number;
}

export function defaultRuntimeConfig(): RuntimeConfig {
  return {
    speed: { ...config.speed },
    combat: { ...config.combat },
    exp: { ...config.exp },
    waves: { freeWaveMaxEnemies: config.waves.freeWaveMaxEnemies, freeWaveGapSeconds: config.waves.freeWaveGapSeconds },
    status: { ...(config.status as StatusConfig), sleepSeconds: [...config.status.sleepSeconds] as [number, number], freezeSeconds: [...config.status.freezeSeconds] as [number, number], confusionSeconds: [...config.status.confusionSeconds] as [number, number] },
    shinyRate: config.shinyRate,
  };
}

export interface Tower {
  id: number;
  mon: Monster;
  tile: Tile;
  /** Seconds until the next attack may fire. */
  cooldown: number;
}

export interface Enemy {
  id: number;
  mon: Monster;
  /** Tiles travelled along the path. Spawns one tile before the start. */
  distance: number;
  tilesPerSec: number;
  /** Tower that last damaged this enemy; receives EXP for status KOs. */
  lastHitBy: number | null;
}

export interface PartyEntry {
  /** Index into the party, for summaries. */
  index: number;
  mon: Monster;
  expGained: number;
  levelFrom: number;
}

export interface PendingLearn {
  towerId: number;
  moveId: number;
}

export type LevelEventType =
  | 'spawn'
  | 'attack'
  | 'hit'
  | 'miss'
  | 'blocked'
  | 'ko'
  | 'leak'
  | 'levelUp'
  | 'status'
  | 'statusDamage'
  | 'statusEnd'
  | 'stages'
  | 'heal'
  | 'moveLearned'
  | 'moveLearnPrompt'
  | 'waveStart'
  | 'waveEnd'
  | 'phase';

export interface LevelEvent {
  type: LevelEventType;
  towerId?: number;
  enemyId?: number;
  moveId?: number;
  damage?: DamageResult;
  amount?: number;
  exp?: number;
  level?: number;
  wave?: number;
  phase?: Phase;
  ailment?: AilmentKind;
  block?: AttackBlock;
  changes?: StageChange[];
  shiny?: boolean;
}

export interface LevelState {
  def: LevelDef;
  map: MapDef;
  path: LevelPath;
  table: EncounterEntry[];
  time: TimeOfDay;
  seed: number;
  rng: Rng;
  config: RuntimeConfig;
  phase: Phase;
  /** Waves started so far (1-based once the first wave starts). */
  wave: number;
  lives: number;
  elapsed: number;
  waveTime: number;
  /** Free levels: seconds until the next wave auto-starts during build phase. */
  buildTimer: number;
  party: PartyEntry[];
  towers: Tower[];
  enemies: Enemy[];
  pending: SpawnDef[];
  /** Move-learn prompts waiting for the player (all four slots full). */
  pendingLearns: PendingLearn[];
  kos: number;
  leaks: number;
  wavesCleared: number;
  nextId: number;
}

export interface CreateLevelOptions {
  seed: number;
  party: Monster[];
  config?: RuntimeConfig;
  time?: TimeOfDay;
}

/** Moves that confuse their user after use (Gen 4). */
const SELF_CONFUSING = new Set(['thrash', 'outrage', 'petal-dance']);

export function createLevel(def: LevelDef, map: MapDef, options: CreateLevelOptions): LevelState {
  const path = validateMap(map);
  const time = options.time ?? def.time;
  const cfg = options.config ?? defaultRuntimeConfig();
  const state: LevelState = {
    def,
    map,
    path,
    table: encounterTable(getEncounterArea(def.area), 'walk', time),
    time,
    seed: options.seed,
    rng: new Rng(options.seed),
    config: cfg,
    phase: 'build',
    wave: 0,
    lives: def.objective === 'defend' ? (def.lives ?? 0) : 0,
    elapsed: 0,
    waveTime: 0,
    buildTimer: def.objective === 'free' ? cfg.waves.freeWaveGapSeconds : 0,
    party: options.party.map((mon, index) => ({ index, mon, expGained: 0, levelFrom: mon.level })),
    towers: [],
    enemies: [],
    pending: [],
    pendingLearns: [],
    kos: 0,
    leaks: 0,
    wavesCleared: 0,
    nextId: 1,
  };
  if (state.table.length === 0) throw new Error(`createLevel: no walk table for ${def.area} at ${time}`);
  if (def.objective === 'defend' && (!def.waves || !def.lives)) throw new Error('createLevel: defend levels need waves and lives');
  return state;
}

export function isOver(state: LevelState): boolean {
  return state.phase === 'won' || state.phase === 'lost' || state.phase === 'left';
}

/** Debug: sets a party member's level outright (stats, EXP and the summary baseline follow). */
export function setPartyLevel(state: LevelState, partyIndex: number, level: number): void {
  const entry = state.party[partyIndex];
  if (!entry) throw new Error(`setPartyLevel: no party member ${partyIndex}`);
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new Error(`setPartyLevel: bad level ${level}`);
  setMonsterLevel(entry.mon, level);
  entry.mon.exp = expForLevel(entry.mon.growth, level);
  entry.mon.hp = entry.mon.stats.hp;
  entry.levelFrom = level;
  entry.expGained = 0;
}

/** Changes the time of day; the next wave uses the matching table. */
export function setTimeOfDay(state: LevelState, time: TimeOfDay): void {
  state.time = time;
  state.table = encounterTable(getEncounterArea(state.def.area), 'walk', time);
}

export function towerAt(state: LevelState, x: number, y: number): Tower | undefined {
  return state.towers.find((t) => t.tile[0] === x && t.tile[1] === y);
}

export function towerById(state: LevelState, towerId: number): Tower {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) throw new Error(`no tower ${towerId}`);
  return tower;
}

/** The move spec a tower attacks with, or undefined if it knows no moves. */
export function towerMove(tower: Tower): MoveSpec | undefined {
  const id = activeMoveId(tower.mon);
  return id === undefined ? undefined : resolveMove(id);
}

/** Seconds between two attacks of a tower with its active move and status. */
export function towerInterval(state: LevelState, tower: Tower): number {
  const move = towerMove(tower);
  const rate = attackRateMultiplier(tower.mon.status, state.config.status);
  const base = attackCooldown(tower.mon.stats.spe, state.config.speed) * (move?.cooldownMultiplier ?? 1);
  return rate > 0 ? base / rate : Infinity;
}

/** Places a party member on a placeable tile. Allowed in any phase before the level ends. */
export function placeTower(state: LevelState, partyIndex: number, x: number, y: number): Tower {
  if (isOver(state)) throw new Error('placeTower: level is over');
  const entry = state.party[partyIndex];
  if (!entry) throw new Error(`placeTower: no party member ${partyIndex}`);
  if (!isPlaceable(state.map, x, y)) throw new Error(`placeTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`placeTower: (${x},${y}) is occupied`);
  if (state.towers.some((t) => t.mon === entry.mon)) throw new Error('placeTower: already placed');
  if (state.towers.length >= state.def.placements) throw new Error('placeTower: placement limit reached');
  const tower: Tower = { id: state.nextId++, mon: entry.mon, tile: [x, y], cooldown: 0 };
  tower.cooldown = towerInterval(state, tower);
  state.towers.push(tower);
  return tower;
}

/**
 * Moves a placed tower to another placeable tile, in any phase. The cooldown
 * restarts at a full interval so moving never skips it.
 */
export function moveTower(state: LevelState, towerId: number, x: number, y: number): void {
  if (isOver(state)) throw new Error('moveTower: level is over');
  const tower = towerById(state, towerId);
  if (!isPlaceable(state.map, x, y)) throw new Error(`moveTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`moveTower: (${x},${y}) is occupied`);
  tower.tile = [x, y];
  tower.cooldown = towerInterval(state, tower);
}

export function removeTower(state: LevelState, towerId: number): void {
  if (state.phase !== 'build') throw new Error('removeTower: only during build phase');
  state.towers = state.towers.filter((t) => t.id !== towerId);
}

export function setActiveMove(state: LevelState, towerId: number, index: number): void {
  const tower = towerById(state, towerId);
  if (!tower.mon.moves[index]) throw new Error(`setActiveMove: no move slot ${index}`);
  tower.mon.activeMove = index;
}

/** Starts the next wave. Build phase only; needs at least one tower. */
export function startWave(state: LevelState): LevelEvent[] {
  if (state.phase !== 'build') throw new Error('startWave: only during build phase');
  if (state.towers.length === 0) throw new Error('startWave: place a Pokémon first');
  const waveIndex = state.wave;
  const spawns = generateWave(state.table, state.def, waveIndex, state.rng, {
    freeWaveMaxEnemies: state.config.waves.freeWaveMaxEnemies,
    ...(state.config.enemyLevelOverride !== undefined ? { levelOverride: state.config.enemyLevelOverride } : {}),
  });
  state.pending = spawns;
  state.wave = waveIndex + 1;
  state.waveTime = 0;
  state.phase = 'wave';
  return [
    { type: 'waveStart', wave: state.wave },
    { type: 'phase', phase: 'wave' },
  ];
}

/** Free levels only: ends the level with everything kept. */
export function leaveLevel(state: LevelState): LevelEvent[] {
  if (state.def.objective !== 'free') throw new Error('leaveLevel: only on free levels');
  if (isOver(state)) return [];
  state.phase = 'left';
  state.enemies = [];
  state.pending = [];
  return [{ type: 'phase', phase: 'left' }];
}

// ------------------------------------------------------------- move learning

/**
 * Resolves a pending learn prompt. `replaceIndex` null declines; otherwise
 * that slot is replaced with the new move.
 */
export function resolveLearn(state: LevelState, towerId: number, moveId: number, replaceIndex: number | null): LevelEvent[] {
  const idx = state.pendingLearns.findIndex((p) => p.towerId === towerId && p.moveId === moveId);
  if (idx < 0) throw new Error(`resolveLearn: no pending learn of ${moveId} for tower ${towerId}`);
  state.pendingLearns.splice(idx, 1);
  if (replaceIndex === null) return [];
  const tower = towerById(state, towerId);
  if (!tower.mon.moves[replaceIndex]) throw new Error(`resolveLearn: no move slot ${replaceIndex}`);
  tower.mon.moves[replaceIndex] = makeMoveSlot(moveId);
  return [{ type: 'moveLearned', towerId, moveId }];
}

function learnAtLevel(state: LevelState, tower: Tower, level: number, events: LevelEvent[]): void {
  for (const moveId of learnableAt(tower.mon.species, level)) {
    if (tower.mon.moves.some((m) => m.id === moveId)) continue;
    if (tower.mon.moves.length < state.config.combat.maxMoves) {
      tower.mon.moves.push(makeMoveSlot(moveId));
      events.push({ type: 'moveLearned', towerId: tower.id, moveId });
    } else if (!state.pendingLearns.some((p) => p.towerId === tower.id && p.moveId === moveId)) {
      state.pendingLearns.push({ towerId: tower.id, moveId });
      events.push({ type: 'moveLearnPrompt', towerId: tower.id, moveId });
    }
  }
}

function grantExp(state: LevelState, tower: Tower, amount: number, events: LevelEvent[]): void {
  const entry = state.party.find((p) => p.mon === tower.mon);
  if (!entry) return;
  const result = gainExp({ growth: tower.mon.growth, level: tower.mon.level, exp: tower.mon.exp }, amount);
  tower.mon.exp = result.exp;
  entry.expGained += amount;
  for (const level of result.levelsGained) {
    setMonsterLevel(tower.mon, level);
    events.push({ type: 'levelUp', towerId: tower.id, level });
    learnAtLevel(state, tower, level, events);
  }
}

// ------------------------------------------------------------------ combat

function enemyPoint(state: LevelState, enemy: Enemy) {
  return pointAlongPath(state.path, enemy.distance);
}

function candidates(state: LevelState, tower: Tower): (TargetCandidate & { enemy: Enemy })[] {
  const list: (TargetCandidate & { enemy: Enemy })[] = [];
  for (const enemy of state.enemies) {
    if (enemy.distance < 0) continue; // not on screen yet
    const p = enemyPoint(state, enemy);
    list.push({
      id: enemy.id,
      tileDistance: Math.hypot(p.x - tower.tile[0], p.y - tower.tile[1]),
      pathDistance: enemy.distance,
      hp: enemy.mon.hp,
      enemy,
    });
  }
  return list;
}

/** The enemy a tower would attack right now with its active move, if any. */
export function pickTarget(state: LevelState, tower: Tower): Enemy | undefined {
  const move = towerMove(tower);
  if (!move) return undefined;
  return selectTarget(move.targeting, candidates(state, tower), move.range)?.enemy;
}

function removeEnemy(state: LevelState, enemy: Enemy): void {
  state.enemies = state.enemies.filter((e) => e !== enemy);
}

function koEnemy(state: LevelState, enemy: Enemy, creditTowerId: number | null, events: LevelEvent[]): void {
  const exp = koExp(enemy.mon.baseExp, enemy.mon.level);
  state.kos++;
  removeEnemy(state, enemy);
  const credit = creditTowerId !== null ? state.towers.find((t) => t.id === creditTowerId) : undefined;
  events.push({ type: 'ko', enemyId: enemy.id, exp, ...(credit ? { towerId: credit.id } : {}) });
  if (credit) grantExp(state, credit, exp, events);
}

function effectTargetIsUser(move: MoveSpec): boolean {
  return move.target === 'user' || move.target === 'users-field' || move.effect.kind === 'damage-raise';
}

/** Applies a move's secondary effects after it connected (or, for status moves, after it fired). */
function applyEffects(state: LevelState, tower: Tower, move: MoveSpec, enemy: Enemy | undefined, damageDealt: number, events: LevelEvent[]): void {
  const e = move.effect;
  const rng = state.rng;
  const alwaysAilment = e.kind === 'ailment';
  const alwaysStats = e.kind === 'net-good-stats' || e.kind === 'swagger' || e.kind === 'unique';

  // Ailments on the target (status moves always, damaging moves by chance).
  if (enemy && isAilment(e.ailment) && (alwaysAilment || rng.chance(e.ailmentChance / 100))) {
    if (applyAilment(enemy.mon.status, e.ailment, rng, state.config.status)) {
      enemy.lastHitBy = tower.id; // status KOs credit whoever inflicted the ailment
      events.push({ type: 'status', enemyId: enemy.id, ailment: e.ailment });
    }
  }
  if (enemy && e.flinchChance > 0 && rng.chance(e.flinchChance / 100)) {
    applyFlinch(enemy.mon.status, state.config.status);
    events.push({ type: 'status', enemyId: enemy.id, ailment: 'none', block: 'flinch' });
  }
  // Stat stages on the user or the target: by chance when one is given,
  // always for pure stat moves, never as a free rider on plain damage.
  const statsApply =
    e.stats.length > 0 && (e.statChance > 0 ? rng.chance(e.statChance / 100) : alwaysStats || !e.kind.startsWith('damage'));
  if (statsApply) {
    if (effectTargetIsUser(move)) {
      const changes = applyStages(tower.mon.status, e.stats);
      if (changes.length) events.push({ type: 'stages', towerId: tower.id, changes });
    } else if (enemy) {
      const changes = applyStages(enemy.mon.status, e.stats);
      if (changes.length) events.push({ type: 'stages', enemyId: enemy.id, changes });
    }
  }
  // Drain / recoil and self-healing.
  if (e.drain !== 0 && damageDealt > 0) {
    const amount = Math.max(1, Math.floor((damageDealt * Math.abs(e.drain)) / 100)) * Math.sign(e.drain);
    tower.mon.hp = Math.max(1, Math.min(tower.mon.stats.hp, tower.mon.hp + amount));
    events.push({ type: 'heal', towerId: tower.id, amount });
  }
  if (e.healing > 0) {
    const amount = Math.max(1, Math.floor((tower.mon.stats.hp * e.healing) / 100));
    const healed = Math.min(amount, tower.mon.stats.hp - tower.mon.hp);
    if (healed > 0) {
      tower.mon.hp += healed;
      events.push({ type: 'heal', towerId: tower.id, amount: healed });
    }
  }
  if (SELF_CONFUSING.has(move.name) && applyAilment(tower.mon.status, 'confusion', rng, state.config.status)) {
    events.push({ type: 'status', towerId: tower.id, ailment: 'confusion' });
  }
}

function attack(state: LevelState, tower: Tower, move: MoveSpec, enemy: Enemy | undefined, events: LevelEvent[]): void {
  events.push({ type: 'attack', towerId: tower.id, moveId: move.id, ...(enemy ? { enemyId: enemy.id } : {}) });
  if (enemy && !hits(move.accuracy, state.rng)) {
    events.push({ type: 'miss', towerId: tower.id, enemyId: enemy.id });
    return;
  }
  if (!enemy || move.category === 'status' || move.power === null) {
    applyEffects(state, tower, move, enemy, 0, events);
    return;
  }
  const damage = rollDamage(
    {
      level: tower.mon.level,
      power: move.power,
      moveType: move.type,
      category: move.category,
      attackerTypes: tower.mon.types,
      attackerStats: tower.mon.stats,
      defenderTypes: enemy.mon.types,
      defenderStats: enemy.mon.stats,
      attackStage: tower.mon.status.stages[move.category === 'physical' ? 'atk' : 'spa'],
      defenseStage: enemy.mon.status.stages[move.category === 'physical' ? 'def' : 'spd'],
      attackerBurned: tower.mon.status.ailment === 'burn',
      burnMultiplier: physicalDamageMultiplier({ ...tower.mon.status, ailment: 'burn' }, state.config.status),
    },
    state.rng,
    state.config.combat.critRate,
  );
  enemy.mon.hp = Math.max(0, enemy.mon.hp - damage.damage);
  enemy.lastHitBy = tower.id;
  events.push({ type: 'hit', towerId: tower.id, enemyId: enemy.id, damage });
  if (enemy.mon.hp <= 0) {
    applyEffects(state, tower, move, undefined, damage.damage, events);
    koEnemy(state, enemy, tower.id, events);
  } else {
    applyEffects(state, tower, move, enemy, damage.damage, events);
    grantExp(state, tower, hitExp(enemy.mon.baseExp, enemy.mon.level, state.config.exp.expPerHitFraction), events);
  }
}

function spawn(state: LevelState, def: SpawnDef, events: LevelEvent[]): void {
  const shiny = state.rng.chance(state.config.shinyRate);
  const mon = createMonster(def.species, def.level, undefined, { shiny });
  const enemy: Enemy = {
    id: state.nextId++,
    mon,
    distance: -1,
    tilesPerSec: enemyTilesPerSec(mon.stats.spe, state.config.speed),
    lastHitBy: null,
  };
  state.enemies.push(enemy);
  events.push({ type: 'spawn', enemyId: enemy.id, shiny });
}

function endWave(state: LevelState, events: LevelEvent[]): void {
  state.wavesCleared++;
  events.push({ type: 'waveEnd', wave: state.wave });
  if (state.def.objective === 'defend' && state.wave >= (state.def.waves ?? 0)) {
    state.phase = 'won';
    events.push({ type: 'phase', phase: 'won' });
    return;
  }
  state.phase = 'build';
  state.buildTimer = state.config.waves.freeWaveGapSeconds;
  events.push({ type: 'phase', phase: 'build' });
}

function tickTowerStatuses(state: LevelState, dt: number, events: LevelEvent[]): void {
  for (const tower of state.towers) {
    const r = tickStatus(tower.mon.status, tower.mon.stats.hp, dt, state.rng, state.config.status);
    if (r.damage > 0) {
      tower.mon.hp = Math.max(1, tower.mon.hp - r.damage); // towers cannot faint yet
      events.push({ type: 'statusDamage', towerId: tower.id, amount: r.damage });
    }
    if (r.ended) events.push({ type: 'statusEnd', towerId: tower.id, ailment: r.ended });
  }
}

/** Advances the simulation by `dt` seconds (already multiplied by game speed). */
export function step(state: LevelState, dt: number): LevelEvent[] {
  const events: LevelEvent[] = [];
  if (dt <= 0) return events;
  state.elapsed += dt;

  if (state.phase === 'build') {
    tickTowerStatuses(state, dt, events);
    if (state.def.objective === 'free' && state.towers.length > 0) {
      state.buildTimer -= dt;
      if (state.buildTimer <= 0) events.push(...startWave(state));
    }
    return events;
  }
  if (state.phase !== 'wave') return events;

  state.waveTime += dt;
  while (state.pending.length > 0 && (state.pending[0] as SpawnDef).delay <= state.waveTime) {
    spawn(state, state.pending.shift() as SpawnDef, events);
  }

  // Enemy statuses, movement and leaks.
  for (const enemy of [...state.enemies]) {
    const r = tickStatus(enemy.mon.status, enemy.mon.stats.hp, dt, state.rng, state.config.status);
    if (r.ended) events.push({ type: 'statusEnd', enemyId: enemy.id, ailment: r.ended });
    if (r.damage > 0) {
      enemy.mon.hp = Math.max(0, enemy.mon.hp - r.damage);
      events.push({ type: 'statusDamage', enemyId: enemy.id, amount: r.damage });
      if (enemy.mon.hp <= 0) {
        koEnemy(state, enemy, enemy.lastHitBy, events);
        continue;
      }
    }
    const speedMult = speedMultiplier(enemy.mon.status, state.config.status) * stageMultiplier(enemy.mon.status.stages.spe);
    enemy.distance = Math.max(0, enemy.distance + enemy.tilesPerSec * speedMult * dt);
    if (enemy.distance >= state.path.length + 1) {
      removeEnemy(state, enemy);
      state.leaks++;
      events.push({ type: 'leak', enemyId: enemy.id });
      if (state.def.objective === 'defend') {
        state.lives = Math.max(0, state.lives - 1);
        if (state.lives === 0) {
          state.phase = 'lost';
          state.enemies = [];
          state.pending = [];
          events.push({ type: 'phase', phase: 'lost' });
          return events;
        }
      }
    }
  }

  tickTowerStatuses(state, dt, events);

  // Attacks. The interval is recomputed per shot so level-ups and statuses apply at once.
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const move = towerMove(tower);
    if (!move) continue;
    const target = move.targeting === 'self' ? undefined : pickTarget(state, tower);
    if (move.targeting !== 'self' && !target) continue;
    const block = attackBlockedBy(tower.mon.status, state.rng, state.config.status);
    if (block) {
      events.push({ type: 'blocked', towerId: tower.id, block });
      tower.cooldown = block === 'flinch' ? tower.mon.status.flinchSeconds : towerInterval(state, tower);
      continue;
    }
    attack(state, tower, move, target, events);
    tower.cooldown = towerInterval(state, tower);
  }

  if (state.pending.length === 0 && state.enemies.length === 0) endWave(state, events);
  return events;
}

export interface LevelSummary {
  outcome: Phase;
  wavesCleared: number;
  kos: number;
  leaks: number;
  party: { name: string; levelFrom: number; levelTo: number; expGained: number }[];
}

export function summarize(state: LevelState): LevelSummary {
  return {
    outcome: state.phase,
    wavesCleared: state.wavesCleared,
    kos: state.kos,
    leaks: state.leaks,
    party: state.party.map((p) => ({ name: p.mon.name, levelFrom: p.levelFrom, levelTo: p.mon.level, expGained: p.expGained })),
  };
}
