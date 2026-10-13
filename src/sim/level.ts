/**
 * The level state machine. Pure and deterministic: same level definition,
 * seed, party and sequence of calls produce the same result. The Phaser
 * scene renders this state and animates the events `step` returns.
 */
import { encounterTable, getEncounterArea, getMove, type EncounterEntry, type TimeOfDay } from '../data/pokedata';
import config from '../data/config.json';
import { hits, rollDamage, type DamageResult } from './damage';
import { gainExp, hitExp, koExp } from './exp';
import { buildPath, isPlaceable, pointAlongPath, validateMap, type LevelPath, type MapDef, type Tile } from './map';
import { createMonster, setMonsterLevel, type Monster } from './monster';
import { Rng } from './rng';
import { attackCooldown, enemyTilesPerSec, type SpeedConfig } from './speed';
import { generateWave, type LevelDef, type SpawnDef } from './waves';

export type Phase = 'build' | 'wave' | 'won' | 'lost' | 'left';

export interface RuntimeConfig {
  speed: SpeedConfig;
  combat: { critRate: number; defaultRangeTiles: number };
  exp: { expPerHitFraction: number };
  waves: { freeWaveMaxEnemies: number; freeWaveGapSeconds: number };
  /** Debug: force spawned enemies to this level (undefined = off). */
  enemyLevelOverride?: number;
}

export function defaultRuntimeConfig(): RuntimeConfig {
  return {
    speed: { ...config.speed },
    combat: { ...config.combat },
    exp: { ...config.exp },
    waves: { freeWaveMaxEnemies: config.waves.freeWaveMaxEnemies, freeWaveGapSeconds: config.waves.freeWaveGapSeconds },
  };
}

export interface Tower {
  id: number;
  mon: Monster;
  tile: Tile;
  /** Seconds until the next attack may fire. */
  cooldown: number;
  rangeTiles: number;
}

export interface Enemy {
  id: number;
  mon: Monster;
  /** Tiles travelled along the path. Spawns one tile before the start. */
  distance: number;
  tilesPerSec: number;
}

export interface PartyEntry {
  /** Index into the party, for summaries. */
  index: number;
  mon: Monster;
  expGained: number;
  levelFrom: number;
}

export interface LevelEvent {
  type: 'spawn' | 'attack' | 'hit' | 'miss' | 'ko' | 'leak' | 'levelUp' | 'waveStart' | 'waveEnd' | 'phase';
  towerId?: number;
  enemyId?: number;
  damage?: DamageResult;
  exp?: number;
  level?: number;
  wave?: number;
  phase?: Phase;
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
    kos: 0,
    leaks: 0,
    wavesCleared: 0,
    nextId: 1,
  };
  if (state.table.length === 0) throw new Error(`createLevel: no walk table for ${def.area} at ${time}`);
  if (def.objective === 'defend' && (!def.waves || !def.lives)) throw new Error('createLevel: defend levels need waves and lives');
  return state;
}

/** Changes the time of day; the next wave uses the matching table. */
export function setTimeOfDay(state: LevelState, time: TimeOfDay): void {
  state.time = time;
  state.table = encounterTable(getEncounterArea(state.def.area), 'walk', time);
}

export function towerAt(state: LevelState, x: number, y: number): Tower | undefined {
  return state.towers.find((t) => t.tile[0] === x && t.tile[1] === y);
}

/** Places a party member on a placeable tile. Build phase only. */
export function placeTower(state: LevelState, partyIndex: number, x: number, y: number): Tower {
  if (state.phase !== 'build') throw new Error('placeTower: only during build phase');
  const entry = state.party[partyIndex];
  if (!entry) throw new Error(`placeTower: no party member ${partyIndex}`);
  if (!isPlaceable(state.map, x, y)) throw new Error(`placeTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`placeTower: (${x},${y}) is occupied`);
  if (state.towers.some((t) => t.mon === entry.mon)) throw new Error('placeTower: already placed');
  if (state.towers.length >= state.def.placements) throw new Error('placeTower: placement limit reached');
  const tower: Tower = {
    id: state.nextId++,
    mon: entry.mon,
    tile: [x, y],
    cooldown: 0,
    rangeTiles: state.config.combat.defaultRangeTiles,
  };
  state.towers.push(tower);
  return tower;
}

/** Moves a placed tower to another placeable tile. Build phase only. */
export function moveTower(state: LevelState, towerId: number, x: number, y: number): void {
  if (state.phase !== 'build') throw new Error('moveTower: only during build phase');
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) throw new Error(`moveTower: no tower ${towerId}`);
  if (!isPlaceable(state.map, x, y)) throw new Error(`moveTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`moveTower: (${x},${y}) is occupied`);
  tower.tile = [x, y];
}

export function removeTower(state: LevelState, towerId: number): void {
  if (state.phase !== 'build') throw new Error('removeTower: only during build phase');
  state.towers = state.towers.filter((t) => t.id !== towerId);
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
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'left') return [];
  state.phase = 'left';
  state.enemies = [];
  state.pending = [];
  return [{ type: 'phase', phase: 'left' }];
}

function enemyPoint(state: LevelState, enemy: Enemy) {
  return pointAlongPath(state.path, enemy.distance);
}

function distanceTiles(state: LevelState, tower: Tower, enemy: Enemy): number {
  const p = enemyPoint(state, enemy);
  return Math.hypot(p.x - tower.tile[0], p.y - tower.tile[1]);
}

/** Nearest enemy within range; ties go to the one furthest along the path. */
export function pickTarget(state: LevelState, tower: Tower): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.distance < 0) continue; // not on screen yet
    const d = distanceTiles(state, tower, enemy);
    if (d > tower.rangeTiles) continue;
    if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && best && enemy.distance > best.distance)) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
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
  }
}

function attack(state: LevelState, tower: Tower, enemy: Enemy, events: LevelEvent[]): void {
  const moveId = tower.mon.moves[0];
  if (moveId === undefined) return;
  const move = getMove(moveId);
  events.push({ type: 'attack', towerId: tower.id, enemyId: enemy.id });
  if (!hits(move.accuracy, state.rng)) {
    events.push({ type: 'miss', towerId: tower.id, enemyId: enemy.id });
    return;
  }
  if (move.category === 'status' || move.power === null) return; // no damaging moves without power yet
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
    },
    state.rng,
    state.config.combat.critRate,
  );
  enemy.mon.hp = Math.max(0, enemy.mon.hp - damage.damage);
  events.push({ type: 'hit', towerId: tower.id, enemyId: enemy.id, damage });
  if (enemy.mon.hp <= 0) {
    const exp = koExp(enemy.mon.baseExp, enemy.mon.level);
    state.kos++;
    state.enemies = state.enemies.filter((e) => e !== enemy);
    events.push({ type: 'ko', towerId: tower.id, enemyId: enemy.id, exp });
    grantExp(state, tower, exp, events);
  } else {
    const exp = hitExp(enemy.mon.baseExp, enemy.mon.level, state.config.exp.expPerHitFraction);
    grantExp(state, tower, exp, events);
  }
}

function spawn(state: LevelState, def: SpawnDef, events: LevelEvent[]): void {
  const mon = createMonster(def.species, def.level);
  const enemy: Enemy = {
    id: state.nextId++,
    mon,
    distance: -1,
    tilesPerSec: enemyTilesPerSec(mon.stats.spe, state.config.speed),
  };
  state.enemies.push(enemy);
  events.push({ type: 'spawn', enemyId: enemy.id });
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

/** Advances the simulation by `dt` seconds (already multiplied by game speed). */
export function step(state: LevelState, dt: number): LevelEvent[] {
  const events: LevelEvent[] = [];
  if (dt <= 0) return events;
  state.elapsed += dt;

  if (state.phase === 'build') {
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

  // Movement and leaks.
  for (const enemy of [...state.enemies]) {
    enemy.distance += enemy.tilesPerSec * dt;
    if (enemy.distance >= state.path.length + 1) {
      state.enemies = state.enemies.filter((e) => e !== enemy);
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

  // Attacks. Speed refreshes the cooldown each shot so level-ups apply at once.
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const target = pickTarget(state, tower);
    if (!target) continue;
    attack(state, tower, target, events);
    tower.cooldown = attackCooldown(tower.mon.stats.spe, state.config.speed);
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

/** Rebuilds the path, for tests or map hot reloads. */
export function rebuildPath(map: MapDef): LevelPath {
  return buildPath(map.path);
}
