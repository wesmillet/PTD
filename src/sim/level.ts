/**
 * The level state machine. Pure and deterministic: same level definition,
 * seed, party and sequence of calls produce the same result. The Phaser
 * scene renders this state and animates the events `step` returns.
 *
 * Waves come from the level's roster (or area table), from the single
 * trainer of the old format, or from a scripted wave list (`def.waves` as an
 * array) with wild lists, trainers, allies and dialogue per wave. Named
 * rules (src/sim/rules) hook into waves, ticks, spawns, hits, targeting and
 * placement. Maps can carry extra lanes; enemies remember theirs and lanes
 * can be reversed (gravity shifts).
 */
import typesJson from '../data/types.json';
import { expForLevel, findMoveId, getEncounterArea, getPokemon, type EncounterEntry, type TimeOfDay } from '../data/pokedata';
import { attemptCatch, ballModifier, BALLS } from './catch';
import { evolutionOptions, evolveMonster } from './evolution';
import config from '../data/config.json';
import { hits, rollDamage, type DamageResult } from './damage';
import { gainExp, hitExp, koExp } from './exp';
import { buildLanes, buildPath, isPlaceable, laneWaypoints, MAIN_LANE, pointAlongPath, reversedWaypoints, validateMap, type LevelPath, type MapDef, type Tile } from './map';
import { activeMoveId, createMonster, makeMoveSlot, setMonsterLevel, type Monster } from './monster';
import { learnableAt, resolveMove, type MoveSpec } from './moves';
import { Rng } from './rng';
import { activateRule, createRules, ruleStatuses, rulesAttackRate, rulesBanner, rulesCanPlace, rulesCanTarget, rulesCanThrow, rulesDamageMultiplier, rulesEnemySpeed, rulesLost, rulesOnCaught, rulesOnCreate, rulesOnHit, rulesOnKo, rulesOnReachEnd, rulesOnSpawn, rulesOnTick, rulesOnTowerPlaced, rulesOnWaveEnd, rulesOnWaveStart, rulesPickLane, rulesRange, type RuleInstance, type RuleStatus } from './rules';
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
import {
  generateWave,
  isScripted,
  levelTable,
  partySpecies,
  scriptedSpawns,
  scriptedWave,
  trainerWave,
  trainerWaveIndex,
  waveCount,
  waveTrainers,
  type AllyDef,
  type BadgeDef,
  type DialogueLine,
  type LevelDef,
  type SpawnDef,
  type TrainerDef,
} from './waves';

export type Phase = 'build' | 'wave' | 'won' | 'lost' | 'left';

export interface BossConfig {
  hpMultiplier: number;
  spriteScale: number;
  /** Losing during the boss wave restarts that wave once per attempt. */
  retryBossWave: boolean;
}

export interface RuntimeConfig {
  speed: SpeedConfig;
  combat: { critRate: number; defaultRangeTiles: number; maxMoves: number };
  exp: { expPerHitFraction: number; trainerExpMultiplier: number };
  waves: { freeWaveMaxEnemies: number; freeWaveGapSeconds: number };
  status: StatusConfig;
  shinyRate: number;
  bosses: BossConfig;
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
    bosses: { ...config.bosses },
  };
}

export interface Tower {
  id: number;
  mon: Monster;
  tile: Tile;
  /** Seconds until the next attack may fire. */
  cooldown: number;
  /** A free allied tower (a partner's Pokémon): no EXP, not in the party, leaves after its last wave. */
  ally?: { name: string; until: number; key: string };
}

export interface BossMoveTimer {
  moveId: number;
  every: number;
  /** Seconds until the move fires next. */
  timer: number;
  /** Reach override in tiles (Psystrike down the whole path). */
  range?: number;
  /** Every tower hit flinches. */
  flinchAll?: boolean;
}

export interface BossPhase {
  at: number;
  moves: { moveId: number; every: number }[];
  vanish?: number;
  burnNearest?: number;
  reverseEvery?: number;
}

export interface Enemy {
  id: number;
  mon: Monster;
  /** Tiles travelled along the lane. Spawns one tile before the start. */
  distance: number;
  tilesPerSec: number;
  /** Tower that last damaged this enemy; receives EXP for status KOs. */
  lastHitBy: number | null;
  /** Every tower that damaged this enemy; KO EXP is split among them. */
  damagedBy: Set<number>;
  /** Trainer-owned enemies cannot be caught. */
  trainer: boolean;
  trainerId?: string;
  /** Boss: boosted HP, bigger sprite, moves on timers. */
  boss?: { moves: BossMoveTimer[]; phases: BossPhase[]; phase: number; reverseTimer: number };
  /** Lane name (MAIN_LANE for the path) and whether it is being walked backwards. */
  lane: string;
  reversed: boolean;
  /** Iron Defense: shield HP that only breaking hits remove. */
  shield?: number;
  shadow?: boolean;
  alpha?: boolean;
  dynamax?: boolean;
  /** Legendary bosses: can be caught under this HP fraction. */
  catchableUnder?: number;
  /** Type ids it takes no damage from (it speeds up for 3 s when hit by one). */
  immune?: number[];
  /** Seconds left vanished (untargetable) after Shadow Force. */
  vanish: number;
  /** Seconds left stunned (Magnetic Flux). */
  stun: number;
  /** Seconds left of a speed boost (Motor Drive). */
  speedBoost: number;
  /** Seconds on the path before it flees; undefined never flees. */
  fleeAfter?: number;
  /** Only balls affect it; it flees at the end of the path instead of leaking. */
  catchOnly?: boolean;
  /** Hisui noble fight state. */
  noble?: NobleState;
  /** Sleeps for the whole wave and floats on regardless (Cresselia under the moon). */
  asleep?: boolean;
  /** Slow Start: seconds left at half speed with no boss moves. */
  slowStart?: number;
  /** Arceus's plates: the type changes every `every` seconds. */
  typeCycle?: { every: number; timer: number; index: number };
}

export interface NobleState {
  /** Stagger meter and its size (a share of the noble's max HP). */
  stagger: number;
  staggerMax: number;
  /** Seconds left in the current stagger window (0 = frenzied). */
  staggered: number;
  /** Stagger windows finished so far; three calm the noble. */
  staggers: number;
  /** Species it calls between staggers. */
  summons: number[];
  /** Summon groups still owed after the current stagger ends. */
  summonsOwed: number;
}

export interface Escort {
  name: string;
  species: number;
  distance: number;
  hp: number;
  maxHp: number;
  tilesPerSec: number;
}

export interface PendingEvolution {
  towerId: number;
  to: number;
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

export interface CaughtEntry {
  mon: Monster;
  ball: string;
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
  | 'ballThrow'
  | 'ballBlocked'
  | 'caught'
  | 'evolutionPrompt'
  | 'evolved'
  | 'waveStart'
  | 'trainerStart'
  | 'bossMove'
  | 'towerHit'
  | 'bossRetry'
  | 'waveEnd'
  | 'phase'
  /** A rule did something visible (`rule`, `text`, maybe a tile or enemy). */
  | 'rule'
  /** The wave banner text (trainer, lane, rule in play). */
  | 'banner'
  /** Dialogue lines to show (the sim pauses while the scene shows them). */
  | 'cutscene'
  | 'allyPlaced'
  | 'allyLeft'
  | 'flee'
  | 'bossPhase'
  | 'lanesReversed'
  | 'drop'
  /** A noble staggered (text) or was calmed (species). */
  | 'noble';

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
  ball?: string;
  shakes?: number;
  caught?: boolean;
  species?: number;
  trainer?: TrainerDef;
  boss?: boolean;
  rule?: string;
  text?: string;
  tile?: Tile;
  lines?: DialogueLine[];
  /** Boss phase index (bossPhase). */
  index?: number;
  /** Item id dropped (drop). */
  item?: string;
}

export interface LevelState {
  def: LevelDef;
  map: MapDef;
  path: LevelPath;
  /** Every lane as a built path, MAIN_LANE first, plus each walked backwards. */
  lanes: Record<string, LevelPath>;
  lanesReversed: Record<string, LevelPath>;
  /** Lanes currently walked backwards (gravity shifts). */
  laneReversed: Record<string, boolean>;
  table: EncounterEntry[];
  time: TimeOfDay;
  seed: number;
  rng: Rng;
  config: RuntimeConfig;
  /** The player's starter species (the rival's counter-starter depends on it). */
  starter: number | undefined;
  phase: Phase;
  /** Waves started so far (1-based once the first wave starts). */
  wave: number;
  lives: number;
  /** Lives at the start of the running wave (a boss retry restores them). */
  waveStartLives: number;
  bossRetryUsed: boolean;
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
  /** Evolution prompts waiting for the player. */
  pendingEvolutions: PendingEvolution[];
  /** Ball inventory, shared with the game state object that was passed in. */
  items: { balls: Record<string, number> };
  /** Pokémon caught in this level, in order, with the ball used. */
  caught: CaughtEntry[];
  maxParty: number;
  /** How many of the player's Pokémon may be placed (allies do not count). */
  placements: number;
  kos: number;
  leaks: number;
  wavesCleared: number;
  /** Set once the trainer wave has been cleared. */
  trainerBeaten: boolean;
  /** Names of trainers beaten this run, in order. */
  trainersBeaten: string[];
  rules: RuleInstance[];
  escort?: Escort;
  /** Save flags the rules may read (key items, HMs). */
  flags: Set<string>;
  /** Ball ids the level allows (Legends rules); undefined allows every ball. */
  ballsOnly?: string[];
  /** Day of the week for weekday-only wild entries. */
  weekday?: number;
  nextId: number;
}

export interface CreateLevelOptions {
  seed: number;
  party: Monster[];
  config?: RuntimeConfig;
  time?: TimeOfDay;
  /** Ball inventory to draw from (mutated). Defaults to config.startingItems. */
  items?: { balls: Record<string, number> };
  maxParty?: number;
  starter?: number;
  /** Placement limit (badge perks); defaults to the level's. */
  placements?: number;
  flags?: Iterable<string>;
  /** Day of the week (0 = Sunday) for weekday-only wild entries; unset keeps them all. */
  weekday?: number;
}

/** Moves that confuse their user after use (Gen 4). */
const SELF_CONFUSING = new Set(['thrash', 'outrage', 'petal-dance']);
const FIRE = 10;
const FIGHTING = 2;
const GROUND = 5;
const SHADOW_DAMAGE = 1.3;
const DYNAMAX_HP = 3;
const MOTOR_DRIVE_SECONDS = 3;
const NOBLE_STAGGER_SHARE = 0.25;
const NOBLE_STAGGER_SECONDS = 6;
const NOBLE_STAGGERS_TO_CALM = 3;
const NOBLE_BALM_FRACTION = 0.15;
const NOBLE_FRENZY_SPEED = 1.5;
const SLOW_START_SPEED = 0.5;
const TYPE_COUNT = 17;
const TYPE_NAMES = (typesJson as { names: Record<string, string> }).names;
const NOBLE_SUMMON_WAVES = 2;
const NOBLE_SUMMON_SIZE = 3;

/** The map with the level's `extraSpots` added as placeable tiles (stage points by name; tiles on a lane are skipped). */
function withExtraSpots(def: LevelDef, map: MapDef): MapDef {
  if (!def.extraSpots?.length) return map;
  const laneTiles = new Set<string>();
  for (const waypoints of [map.path, ...Object.values(map.lanes ?? {})]) for (const key of buildPath(waypoints).tiles) laneTiles.add(key);
  const placeable = [...map.placeable];
  for (const spot of def.extraSpots) {
    const tile = Array.isArray(spot) ? spot : map.points?.[spot];
    if (!tile) throw new Error(`createLevel: ${def.name}: extra spot "${String(spot)}" is not a stage point of the map`);
    if (laneTiles.has(`${tile[0]},${tile[1]}`) || isPlaceable(map, tile[0], tile[1])) continue;
    placeable.push([tile[0], tile[1]]);
  }
  return { ...map, placeable };
}

function moveIdByName(name: string): number {
  const id = findMoveId(name);
  if (id === undefined) throw new Error(`unknown move "${name}"`);
  return id;
}

export function createLevel(def: LevelDef, mapIn: MapDef, options: CreateLevelOptions): LevelState {
  const map = withExtraSpots(def, mapIn);
  const path = validateMap(map);
  const time = options.time ?? def.time;
  const cfg = options.config ?? defaultRuntimeConfig();
  const lanes = buildLanes(map);
  const lanesReversed: Record<string, LevelPath> = {};
  for (const name of Object.keys(lanes)) lanesReversed[name] = buildPath(reversedWaypoints(laneWaypoints(map, name)));
  for (const name of def.lanes ?? []) if (!lanes[name]) throw new Error(`createLevel: ${def.name} names lane "${name}" the map does not have`);
  const state: LevelState = {
    def,
    map,
    path,
    lanes,
    lanesReversed,
    laneReversed: Object.fromEntries(Object.keys(lanes).map((n) => [n, false])),
    table: isScripted(def) ? [] : levelTable(def, time),
    time,
    seed: options.seed,
    rng: new Rng(options.seed),
    config: cfg,
    starter: options.starter,
    phase: 'build',
    wave: 0,
    lives: def.objective === 'defend' ? (def.lives ?? 0) : 0,
    waveStartLives: def.objective === 'defend' ? (def.lives ?? 0) : 0,
    bossRetryUsed: false,
    elapsed: 0,
    waveTime: 0,
    buildTimer: def.objective === 'free' ? cfg.waves.freeWaveGapSeconds : 0,
    party: options.party.map((mon, index) => ({ index, mon, expGained: 0, levelFrom: mon.level })),
    towers: [],
    enemies: [],
    pending: [],
    pendingLearns: [],
    pendingEvolutions: [],
    items: options.items ?? { balls: { ...config.startingItems.balls } },
    caught: [],
    maxParty: options.maxParty ?? config.party.maxParty,
    placements: options.placements ?? def.placements,
    kos: 0,
    leaks: 0,
    wavesCleared: 0,
    trainerBeaten: false,
    trainersBeaten: [],
    rules: createRules(def.rules),
    flags: new Set(options.flags ?? []),
    ...(def.ballsOnly ? { ballsOnly: [...def.ballsOnly] } : {}),
    ...(options.weekday !== undefined ? { weekday: options.weekday } : {}),
    nextId: 1,
  };
  for (const [ball, n] of Object.entries(def.giveBalls ?? {})) state.items.balls[ball] = (state.items.balls[ball] ?? 0) + n;
  if (!isScripted(def) && state.table.length === 0) throw new Error(`createLevel: no spawn table for ${def.name} at ${time}`);
  if (def.objective === 'defend' && (waveCount(def) === 0 || !def.lives)) throw new Error('createLevel: defend levels need waves and lives');
  if (def.trainer) trainerWave(def, state.starter, moveIdByName); // validate names early
  if (isScripted(def)) {
    for (let i = 0; i < waveCount(def); i++) scriptedSpawns(def, i, state.starter, moveIdByName, new Rng(0), { freeWaveMaxEnemies: 1 }, () => undefined); // validate names early
  }
  rulesOnCreate(state, []);
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

/** Changes the time of day; the next wave uses the matching table (rosters ignore time). */
export function setTimeOfDay(state: LevelState, time: TimeOfDay): void {
  state.time = time;
  if (isScripted(state.def)) return;
  getEncounterArea(state.def.area);
  state.table = levelTable(state.def, time);
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
  const rate = attackRateMultiplier(tower.mon.status, state.config.status) * rulesAttackRate(state, tower);
  const base = attackCooldown(getPokemon(tower.mon.species).base.spe, state.config.speed) * (move?.cooldownMultiplier ?? 1);
  return rate > 0 ? base / rate : Infinity;
}

/** A tower's reach in tiles with its active move, after the rules in play. */
export function towerRange(state: LevelState, tower: Tower): number {
  const move = towerMove(tower);
  return rulesRange(state, tower, move?.range ?? state.config.combat.defaultRangeTiles);
}

/** The player's placed Pokémon (allies excluded). */
export function playerTowers(state: LevelState): Tower[] {
  return state.towers.filter((t) => !t.ally);
}

/** A reason the party member cannot be placed on the tile, or null. */
export function placementBlock(state: LevelState, mon: Monster, x: number, y: number): string | null {
  if (!isPlaceable(state.map, x, y)) return 'not a placeable spot';
  if (towerAt(state, x, y)) return 'occupied';
  return rulesCanPlace(state, mon, [x, y]);
}

/** Places a party member on a placeable tile. Allowed in any phase before the level ends. */
export function placeTower(state: LevelState, partyIndex: number, x: number, y: number): Tower {
  if (isOver(state)) throw new Error('placeTower: level is over');
  const entry = state.party[partyIndex];
  if (!entry) throw new Error(`placeTower: no party member ${partyIndex}`);
  if (!isPlaceable(state.map, x, y)) throw new Error(`placeTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`placeTower: (${x},${y}) is occupied`);
  if (state.towers.some((t) => t.mon === entry.mon)) throw new Error('placeTower: already placed');
  if (playerTowers(state).length >= state.placements) throw new Error('placeTower: placement limit reached');
  const reason = rulesCanPlace(state, entry.mon, [x, y]);
  if (reason) throw new Error(`placeTower: ${reason}`);
  const tower: Tower = { id: state.nextId++, mon: entry.mon, tile: [x, y], cooldown: 0 };
  tower.cooldown = towerInterval(state, tower);
  state.towers.push(tower);
  rulesOnTowerPlaced(state, tower, []);
  return tower;
}

/**
 * Moves a placed tower to another placeable tile, in any phase. The cooldown
 * restarts at a full interval so moving never skips it.
 */
export function moveTower(state: LevelState, towerId: number, x: number, y: number): void {
  if (isOver(state)) throw new Error('moveTower: level is over');
  const tower = towerById(state, towerId);
  if (tower.ally) throw new Error('moveTower: allies stay where they are');
  if (!isPlaceable(state.map, x, y)) throw new Error(`moveTower: (${x},${y}) is not placeable`);
  if (towerAt(state, x, y)) throw new Error(`moveTower: (${x},${y}) is occupied`);
  const reason = rulesCanPlace(state, tower.mon, [x, y]);
  if (reason) throw new Error(`moveTower: ${reason}`);
  tower.tile = [x, y];
  tower.cooldown = towerInterval(state, tower);
}

export function removeTower(state: LevelState, towerId: number): void {
  if (state.phase !== 'build') throw new Error('removeTower: only during build phase');
  const tower = towerById(state, towerId);
  if (tower.ally) throw new Error('removeTower: allies cannot be returned');
  state.towers = state.towers.filter((t) => t.id !== towerId);
}

/** Returns a player's tower to the party at any time (rules do this: the tide floods a spot). */
export function unplaceTower(state: LevelState, towerId: number): void {
  state.towers = state.towers.filter((t) => t.id !== towerId);
}

export function setActiveMove(state: LevelState, towerId: number, index: number): void {
  const tower = towerById(state, towerId);
  if (!tower.mon.moves[index]) throw new Error(`setActiveMove: no move slot ${index}`);
  tower.mon.activeMove = index;
}

// ------------------------------------------------------------------- allies

/** Nearest free placeable spot to a tile. */
function nearestFreeSpot(state: LevelState, to: Tile): Tile | undefined {
  let best: Tile | undefined;
  let bestD = Infinity;
  for (const spot of state.map.placeable) {
    if (towerAt(state, spot[0], spot[1])) continue;
    const d = Math.hypot(spot[0] - to[0], spot[1] - to[1]);
    if (d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

function resolveAllySpot(state: LevelState, spot: AllyDef['spot']): Tile | undefined {
  if (Array.isArray(spot)) return towerAt(state, spot[0], spot[1]) ? nearestFreeSpot(state, spot) : spot;
  const path = state.map.path;
  if (spot === 'nearest-exit') return nearestFreeSpot(state, path[path.length - 1]!);
  if (spot === 'nearest-spawn') return nearestFreeSpot(state, path[0]!);
  const pointName = spot.startsWith('nearest-') ? spot.slice('nearest-'.length) : spot;
  const point = state.map.points?.[pointName];
  if (point) return nearestFreeSpot(state, point);
  return nearestFreeSpot(state, path[path.length - 1]!);
}

/**
 * Places a free allied tower (not from the party) for the given 1-based
 * wave range. `key` keeps the same ally from being placed twice.
 */
export function placeAlly(state: LevelState, ally: AllyDef, key: string, until: number, events: LevelEvent[]): Tower | undefined {
  if (state.towers.some((t) => t.ally?.key === key)) return undefined;
  const tile = resolveAllySpot(state, ally.spot);
  if (!tile) return undefined;
  const species = partySpecies(ally.species, state.starter, `ally ${key}`);
  const moves = ally.moves?.map(moveIdByName);
  const mon = createMonster(species, ally.level, moves);
  const tower: Tower = { id: state.nextId++, mon, tile, cooldown: 0, ally: { name: ally.name ?? mon.name, until, key } };
  tower.cooldown = towerInterval(state, tower);
  state.towers.push(tower);
  events.push({ type: 'allyPlaced', towerId: tower.id, species, text: ally.name ?? mon.name, tile });
  return tower;
}

function allyRange(ally: AllyDef, fromWave: number): [number, number] {
  return ally.waves ?? [fromWave, Number.MAX_SAFE_INTEGER];
}

/** Scripted and level-wide allies for the wave about to start (1-based). */
function placeWaveAllies(state: LevelState, wave: number, events: LevelEvent[]): void {
  const def = state.def;
  const entries: { ally: AllyDef; key: string; from: number }[] = [];
  (def.allies ?? []).forEach((ally, i) => entries.push({ ally, key: `level-${i}`, from: 1 }));
  if (Array.isArray(def.waves)) {
    def.waves.forEach((w, wi) => (w.allies ?? []).forEach((ally, i) => entries.push({ ally, key: `wave-${wi + 1}-${i}`, from: wi + 1 })));
  }
  for (const { ally, key, from } of entries) {
    const [a, b] = allyRange(ally, from);
    if (wave >= a && wave <= b) placeAlly(state, ally, key, b, events);
  }
}

function dismissAllies(state: LevelState, waveDone: number, events: LevelEvent[]): void {
  for (const tower of [...state.towers]) {
    if (!tower.ally || tower.ally.until > waveDone) continue;
    state.towers = state.towers.filter((t) => t !== tower);
    events.push({ type: 'allyLeft', towerId: tower.id, text: tower.ally.name });
  }
}

// -------------------------------------------------------------------- lanes

/** The path an enemy walks (its lane, in its current direction). */
export function enemyPath(state: LevelState, enemy: Enemy): LevelPath {
  return (enemy.reversed ? state.lanesReversed : state.lanes)[enemy.lane] ?? state.path;
}

/** Flips every lane's direction; enemies on the path turn round where they are. */
export function reverseLanes(state: LevelState, events: LevelEvent[]): void {
  for (const name of Object.keys(state.laneReversed)) state.laneReversed[name] = !state.laneReversed[name];
  for (const enemy of state.enemies) {
    const len = enemyPath(state, enemy).length;
    enemy.reversed = !enemy.reversed;
    if (enemy.distance >= 0) enemy.distance = Math.max(0, len - enemy.distance);
  }
  if (state.escort) {
    state.escort.distance = Math.max(0, state.path.length - state.escort.distance);
  }
  events.push({ type: 'lanesReversed', text: state.laneReversed[MAIN_LANE] ? 'Gravity shift! Enemies come from the far end.' : 'Gravity is back to normal.' });
}

/** Whether the main path is currently walked backwards. */
export function lanesAreReversed(state: LevelState): boolean {
  return state.laneReversed[MAIN_LANE] ?? false;
}

// -------------------------------------------------------------------- waves

/** Whether wave `waveIndex` (0-based) is the trainer's. */
export function isTrainerWave(state: LevelState, waveIndex: number): boolean {
  if (isScripted(state.def)) return waveTrainers(scriptedWave(state.def, waveIndex)).length > 0;
  return state.def.trainer !== undefined && trainerWaveIndex(state.def) === waveIndex;
}

/** The trainer wave contains a boss. */
export function trainerHasBoss(def: LevelDef, waveIndex?: number): boolean {
  if (Array.isArray(def.waves)) {
    const wave = waveIndex === undefined ? undefined : def.waves[waveIndex];
    return waveTrainers(wave).some((t) => t.party.some((p) => p.boss));
  }
  return def.trainer?.party.some((p) => p.boss) ?? false;
}

/** Total waves of the level (defend levels; 0 for endless free levels). */
export function totalWaves(state: LevelState): number {
  return waveCount(state.def);
}

function pickLaneFor(state: LevelState, waveIndex: number, choice: string | undefined, spawnIndex: number, species?: number): string | undefined {
  const names = state.def.lanes ?? Object.keys(state.lanes);
  if (choice === 'random') return state.rng.pick(names);
  if (choice === 'both') return names[spawnIndex % names.length];
  if (choice) return choice;
  return rulesPickLane(state, waveIndex, spawnIndex, species);
}

/** Starts the next wave. Build phase only; needs at least one tower. */
export function startWave(state: LevelState): LevelEvent[] {
  if (state.phase !== 'build') throw new Error('startWave: only during build phase');
  if (state.towers.length === 0) throw new Error('startWave: place a Pokémon first');
  const waveIndex = state.wave;
  const events: LevelEvent[] = [];
  const opts = {
    freeWaveMaxEnemies: state.config.waves.freeWaveMaxEnemies,
    ...(state.config.enemyLevelOverride !== undefined ? { levelOverride: state.config.enemyLevelOverride } : {}),
    ...(state.weekday !== undefined ? { weekday: state.weekday } : {}),
  };
  let trainers: TrainerDef[] = [];
  let spawns: SpawnDef[];
  const script = scriptedWave(state.def, waveIndex);
  if (script) {
    trainers = waveTrainers(script);
    spawns = scriptedSpawns(state.def, waveIndex, state.starter, moveIdByName, state.rng, opts, (choice, i, species) => pickLaneFor(state, waveIndex, choice, i, species));
    if (script.condition) {
      const status = ruleStatuses(state).find((r) => r.id === script.condition!.rule);
      const value = status && status.max ? (status.value ?? 0) / status.max : 0;
      if (value < script.condition.min) {
        const names = trainers.map((t) => t.name).join(', ');
        trainers = [];
        spawns = spawns.filter((sp) => !sp.trainerId);
        events.push({ type: 'rule', rule: script.condition.rule, text: `${names || 'The visitor'} does not come: the ${status?.label ?? script.condition.rule} meter is too low.` });
      }
    }
  } else if (isTrainerWave(state, waveIndex) && state.def.trainer) {
    trainers = [state.def.trainer];
    spawns = trainerWave(state.def, state.starter, moveIdByName);
  } else {
    spawns = generateWave(state.table, state.def, waveIndex, state.rng, opts);
    spawns.forEach((s, i) => {
      const lane = pickLaneFor(state, waveIndex, undefined, i, s.species);
      if (lane) s.lane = lane;
    });
  }
  state.pending = spawns;
  state.wave = waveIndex + 1;
  state.waveTime = 0;
  state.waveStartLives = state.lives;
  state.phase = 'wave';
  const first = trainers[0];
  events.push({ type: 'waveStart', wave: state.wave, ...(first ? { trainer: first } : {}) });
  for (const trainer of trainers) {
    events.push({ type: 'trainerStart', wave: state.wave, trainer, boss: trainer.party.some((p) => p.boss) });
  }
  if (script?.lines?.length) events.push({ type: 'cutscene', wave: state.wave, lines: script.lines });
  placeWaveAllies(state, state.wave, events);
  rulesOnWaveStart(state, waveIndex, events);
  const banner = [...(script?.banner ? [script.banner] : []), ...rulesBanner(state, waveIndex)];
  if (banner.length) events.push({ type: 'banner', wave: state.wave, text: banner.join(' · ') });
  events.push({ type: 'phase', phase: 'wave' });
  return events;
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

/** Runs a rule's player action (the generator button, a riddle answer). */
export function useRule(state: LevelState, ruleId: string, action?: string): LevelEvent[] {
  if (isOver(state)) return [];
  return activateRule(state, ruleId, action);
}

/** What the HUD shows for the rules in play. */
export function ruleStatus(state: LevelState): RuleStatus[] {
  return ruleStatuses(state);
}

// ------------------------------------------------------------------ catching

export function enemyById(state: LevelState, enemyId: number): Enemy | undefined {
  return state.enemies.find((e) => e.id === enemyId);
}

/** A trainer's legendary that has dropped into its catch window. */
export function isCatchable(enemy: Enemy): boolean {
  if (!enemy.trainer) return true;
  if (enemy.catchableUnder === undefined) return false;
  return enemy.catchableUnder >= 1 || enemy.mon.hp / enemy.mon.stats.hp < enemy.catchableUnder;
}

/**
 * Whether a ball can be thrown at this enemy right now (reason if not). A
 * trainer's Pokémon can be thrown at: the throw is blocked instead (see
 * `throwBall`), as in the games.
 */
export function canThrow(state: LevelState, ballId: string, enemyId: number): string | null {
  if (state.phase !== 'wave') return 'no wave running';
  if (!BALLS[ballId]) return `unknown ball ${ballId}`;
  if (state.ballsOnly && !state.ballsOnly.includes(ballId)) return `only ${state.ballsOnly.map((b) => BALLS[b]?.name ?? b).join(', ')} work here`;
  if ((state.items.balls[ballId] ?? 0) <= 0) return `no ${BALLS[ballId]?.name ?? ballId} left`;
  const enemy = enemyById(state, enemyId);
  if (!enemy) return 'no such enemy';
  if (enemy.distance < 0) return 'not on the path yet';
  if (enemy.vanish > 0) return 'it vanished';
  return rulesCanThrow(state, enemy);
}

export const TRAINER_BLOCK_MESSAGE = "You can't catch a trainer's Pokémon!";

/**
 * Throws a ball. At a trainer's Pokémon the ball bounces off (`ballBlocked`,
 * nothing consumed), unless it is a legendary in its catch window.
 * Otherwise one ball is used; on a catch the enemy leaves the wave and
 * joins the party or the catch list.
 */
export function throwBall(state: LevelState, ballId: string, enemyId: number): LevelEvent[] {
  const reason = canThrow(state, ballId, enemyId);
  if (reason) throw new Error(`throwBall: ${reason}`);
  const enemy = enemyById(state, enemyId) as Enemy;
  if (enemy.noble) return throwBalm(state, ballId, enemy);
  if (!isCatchable(enemy)) return [{ type: 'ballBlocked', enemyId, ball: ballId }];
  state.items.balls[ballId] = (state.items.balls[ballId] ?? 0) - 1;
  const mod = ballModifier(ballId, {
    types: enemy.mon.types,
    undamaged: enemy.mon.hp >= enemy.mon.stats.hp,
    caveOrNight: state.map.theme === 'cave' || state.time === 'night',
  });
  const result = attemptCatch(enemy.mon, getPokemon(enemy.mon.species).catchRate, mod, state.rng);
  const events: LevelEvent[] = [{ type: 'ballThrow', enemyId, ball: ballId, shakes: result.shakes, caught: result.caught }];
  if (!result.caught) return events;
  removeEnemy(state, enemy);
  if (enemy.shadow) enemy.mon.shadow = { purified: 0 };
  if (enemy.alpha) enemy.mon.alpha = true;
  state.caught.push({ mon: enemy.mon, ball: ballId });
  if (state.party.length < state.maxParty) {
    state.party.push({ index: state.party.length, mon: enemy.mon, expGained: 0, levelFrom: enemy.mon.level });
  }
  events.push({ type: 'caught', enemyId, species: enemy.mon.species, shiny: enemy.mon.shiny, ball: ballId });
  if (enemy.alpha) dropBall(state, events);
  rulesOnCaught(state, enemy, events);
  if (state.pending.length === 0 && state.enemies.length === 0) endWave(state, events);
  return events;
}

/** A ball at a noble is a balm: it lands only while the noble is staggered and takes a share of its HP. */
function throwBalm(state: LevelState, ballId: string, enemy: Enemy): LevelEvent[] {
  const noble = enemy.noble as NobleState;
  if (noble.staggered <= 0) return [{ type: 'ballBlocked', enemyId: enemy.id, ball: ballId }];
  state.items.balls[ballId] = (state.items.balls[ballId] ?? 0) - 1;
  const amount = Math.max(1, Math.round(enemy.mon.stats.hp * NOBLE_BALM_FRACTION));
  enemy.mon.hp = Math.max(0, enemy.mon.hp - amount);
  const events: LevelEvent[] = [{ type: 'ballThrow', enemyId: enemy.id, ball: ballId, shakes: 0, caught: false }, { type: 'hit', enemyId: enemy.id, damage: { damage: amount, crit: false, effectiveness: 1, stab: false } as DamageResult }];
  if (enemy.mon.hp <= 0) calmNoble(state, enemy, events);
  return events;
}

/** The noble is calmed: it leaves the field uncaught and the wave can end. */
function calmNoble(state: LevelState, enemy: Enemy, events: LevelEvent[]): void {
  removeEnemy(state, enemy);
  state.kos++;
  events.push({ type: 'noble', enemyId: enemy.id, species: enemy.mon.species, text: `${enemy.mon.name} is calmed!` });
  if (state.pending.length === 0 && state.enemies.length === 0) endWave(state, events);
}

/** Alphas drop one of the level's Hisuian balls (the first allowed ball when the level restricts them). */
function dropBall(state: LevelState, events: LevelEvent[]): void {
  const pool = state.ballsOnly ?? ['poke'];
  const ball = state.rng.pick(pool);
  state.items.balls[ball] = (state.items.balls[ball] ?? 0) + 1;
  events.push({ type: 'drop', item: ball, text: `${BALLS[ball]?.name ?? ball} dropped!` });
}

// ----------------------------------------------------------------- evolution

/** Resolves an evolution prompt; accepting changes the species and may learn moves of the new form. */
export function resolveEvolution(state: LevelState, towerId: number, accept: boolean): LevelEvent[] {
  const idx = state.pendingEvolutions.findIndex((p) => p.towerId === towerId);
  if (idx < 0) throw new Error(`resolveEvolution: no pending evolution for tower ${towerId}`);
  const [pending] = state.pendingEvolutions.splice(idx, 1);
  if (!accept || !pending) return [];
  const tower = towerById(state, towerId);
  evolveMonster(tower.mon, pending.to);
  const events: LevelEvent[] = [{ type: 'evolved', towerId, species: pending.to }];
  learnAtLevel(state, tower, tower.mon.level, events);
  return events;
}

function queueEvolution(state: LevelState, tower: Tower, events: LevelEvent[]): void {
  const ready = evolutionOptions(tower.mon).ready[0];
  if (!ready) return;
  if (state.pendingEvolutions.some((p) => p.towerId === tower.id)) return;
  state.pendingEvolutions.push({ towerId: tower.id, to: ready.to });
  events.push({ type: 'evolutionPrompt', towerId: tower.id, species: ready.to });
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
  if (!entry || tower.ally) return;
  if (tower.mon.shadow && !tower.mon.shadow.purifiedAt) return; // Shadow Pokémon gain nothing until purified
  const cap = state.def.levelCap;
  if (cap !== undefined && tower.mon.level >= cap) return;
  const result = gainExp({ growth: tower.mon.growth, level: tower.mon.level, exp: tower.mon.exp }, amount);
  tower.mon.exp = result.exp;
  entry.expGained += amount;
  for (const level of result.levelsGained) {
    if (cap !== undefined && level > cap) break;
    setMonsterLevel(tower.mon, level);
    events.push({ type: 'levelUp', towerId: tower.id, level });
    learnAtLevel(state, tower, level, events);
  }
  if (cap !== undefined && tower.mon.level >= cap) tower.mon.exp = Math.min(tower.mon.exp, expForLevel(tower.mon.growth, cap + 1) - 1);
  if (result.levelsGained.length > 0) queueEvolution(state, tower, events);
}

// ------------------------------------------------------------------ combat

/** Position of an enemy on its lane, in tile space. */
export function enemyPoint(state: LevelState, enemy: Enemy) {
  return pointAlongPath(enemyPath(state, enemy), enemy.distance);
}

/** Whether a tower can see and attack this enemy right now. */
export function targetable(state: LevelState, tower: Tower, enemy: Enemy): boolean {
  if (enemy.distance < 0 || enemy.vanish > 0 || enemy.catchOnly) return false;
  return rulesCanTarget(state, tower, enemy);
}

function candidates(state: LevelState, tower: Tower): (TargetCandidate & { enemy: Enemy })[] {
  const list: (TargetCandidate & { enemy: Enemy })[] = [];
  for (const enemy of state.enemies) {
    if (!targetable(state, tower, enemy)) continue;
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
  return selectTarget(move.targeting, candidates(state, tower), rulesRange(state, tower, move.range))?.enemy;
}

function removeEnemy(state: LevelState, enemy: Enemy): void {
  state.enemies = state.enemies.filter((e) => e !== enemy);
}

function koEnemy(state: LevelState, enemy: Enemy, creditTowerId: number | null, events: LevelEvent[]): void {
  const base = koExp(enemy.mon.baseExp, enemy.mon.level);
  const exp = enemy.trainer ? Math.floor(base * state.config.exp.trainerExpMultiplier) : base;
  state.kos++;
  removeEnemy(state, enemy);
  const ids = new Set(enemy.damagedBy);
  if (creditTowerId !== null) ids.add(creditTowerId);
  const participants = state.towers.filter((t) => ids.has(t.id) && !t.ally);
  const credit = creditTowerId !== null ? state.towers.find((t) => t.id === creditTowerId) : undefined;
  events.push({ type: 'ko', enemyId: enemy.id, exp, ...(credit ? { towerId: credit.id } : {}), ...(enemy.boss ? { boss: true } : {}) });
  if (enemy.alpha) dropBall(state, events);
  rulesOnKo(state, enemy, events);
  if (participants.length === 0) return;
  const share = Math.max(1, Math.floor(exp / participants.length));
  for (const tower of participants) grantExp(state, tower, share, events);
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
  let dealt = Math.round(damage.damage * rulesDamageMultiplier(state, tower, move));
  if (enemy.immune?.includes(move.type)) {
    dealt = 0;
    enemy.speedBoost = MOTOR_DRIVE_SECONDS;
  }
  dealt = rulesOnHit(state, tower, enemy, move, dealt, events);
  if (enemy.noble) {
    nobleHit(state, enemy, dealt, events);
    enemy.lastHitBy = tower.id;
    enemy.damagedBy.add(tower.id);
    events.push({ type: 'hit', towerId: tower.id, enemyId: enemy.id, damage: { ...damage, damage: 0 } });
    return;
  }
  enemy.mon.hp = Math.max(0, enemy.mon.hp - dealt);
  enemy.lastHitBy = tower.id;
  enemy.damagedBy.add(tower.id);
  events.push({ type: 'hit', towerId: tower.id, enemyId: enemy.id, damage: { ...damage, damage: dealt } });
  if (enemy.mon.hp <= 0) {
    applyEffects(state, tower, move, undefined, dealt, events);
    koEnemy(state, enemy, tower.id, events);
  } else {
    applyEffects(state, tower, move, enemy, dealt, events);
    grantExp(state, tower, hitExp(enemy.mon.baseExp, enemy.mon.level, state.config.exp.expPerHitFraction), events);
  }
}

/** A frenzied noble takes no damage: the hit fills the stagger meter; a full meter opens a stagger window. */
function nobleHit(state: LevelState, enemy: Enemy, dealt: number, events: LevelEvent[]): void {
  const noble = enemy.noble as NobleState;
  if (noble.staggered > 0) return;
  noble.stagger = Math.min(noble.staggerMax, noble.stagger + dealt);
  if (noble.stagger < noble.staggerMax) return;
  noble.stagger = 0;
  noble.staggered = NOBLE_STAGGER_SECONDS;
  events.push({ type: 'noble', enemyId: enemy.id, text: `${enemy.mon.name} staggers! Throw the balms!` });
}

/** The noble's stagger timer; when the window closes it calls its summons, and the third window calms it. */
function tickNoble(state: LevelState, enemy: Enemy, dt: number, events: LevelEvent[]): void {
  const noble = enemy.noble as NobleState;
  if (noble.staggered <= 0) return;
  noble.staggered = Math.max(0, noble.staggered - dt);
  if (noble.staggered > 0) return;
  noble.staggers += 1;
  if (noble.staggers >= NOBLE_STAGGERS_TO_CALM) {
    calmNoble(state, enemy, events);
    return;
  }
  if (noble.summons.length > 0) {
    const levels = state.def.levels ?? [enemy.mon.level - 12, enemy.mon.level - 6];
    const base = state.waveTime + 1;
    for (let w = 0; w < NOBLE_SUMMON_WAVES; w++) {
      for (let i = 0; i < NOBLE_SUMMON_SIZE; i++) {
        state.pending.push({ species: state.rng.pick(noble.summons), level: Math.max(1, state.rng.int(levels[0], levels[1])), delay: base + w * 6 + i * state.def.spawnInterval, lane: enemy.lane });
      }
    }
    state.pending.sort((a, b) => a.delay - b.delay);
    events.push({ type: 'noble', enemyId: enemy.id, text: `${enemy.mon.name} calls for help!` });
  }
  events.push({ type: 'rule', rule: 'noble', enemyId: enemy.id, text: `${enemy.mon.name} is frenzied again.` });
}

/** Damage a boss move does to one tower (never below 1 HP left). */
function hurtTower(state: LevelState, enemy: Enemy, tower: Tower, move: MoveSpec, events: LevelEvent[]): void {
  if (move.category !== 'status' && move.power !== null) {
    const damage = rollDamage(
      {
        level: enemy.mon.level,
        power: move.power,
        moveType: move.type,
        category: move.category,
        attackerTypes: enemy.mon.types,
        attackerStats: enemy.mon.stats,
        defenderTypes: tower.mon.types,
        defenderStats: tower.mon.stats,
        attackStage: enemy.mon.status.stages[move.category === 'physical' ? 'atk' : 'spa'],
        defenseStage: tower.mon.status.stages[move.category === 'physical' ? 'def' : 'spd'],
        attackerBurned: enemy.mon.status.ailment === 'burn',
        burnMultiplier: physicalDamageMultiplier({ ...enemy.mon.status, ailment: 'burn' }, state.config.status),
      },
      state.rng,
      state.config.combat.critRate,
    );
    const raw = enemy.shadow ? Math.round(damage.damage * SHADOW_DAMAGE) : damage.damage;
    const dealt = Math.min(raw, tower.mon.hp - 1); // towers cannot faint yet
    tower.mon.hp = Math.max(1, tower.mon.hp - raw);
    events.push({ type: 'towerHit', towerId: tower.id, enemyId: enemy.id, damage: { ...damage, damage: Math.max(0, dealt) } });
  }
  const e = move.effect;
  if (isAilment(e.ailment) && (e.kind === 'ailment' || state.rng.chance(e.ailmentChance / 100))) {
    if (applyAilment(tower.mon.status, e.ailment, state.rng, state.config.status)) events.push({ type: 'status', towerId: tower.id, ailment: e.ailment });
  }
  if (e.flinchChance > 0 && state.rng.chance(e.flinchChance / 100)) {
    applyFlinch(tower.mon.status, state.config.status);
    events.push({ type: 'status', towerId: tower.id, ailment: 'none', block: 'flinch' });
  }
}

/**
 * A boss uses one of its timed moves: every placed Pokémon within the move's
 * range takes Gen 4 damage (never below 1 HP) and may flinch or be afflicted.
 */
function bossAttack(state: LevelState, enemy: Enemy, timer: BossMoveTimer, events: LevelEvent[]): void {
  const move = resolveMove(timer.moveId);
  const p = enemyPoint(state, enemy);
  const reach = timer.range ?? move.range;
  events.push({ type: 'bossMove', enemyId: enemy.id, moveId: timer.moveId });
  for (const tower of state.towers) {
    if (Math.hypot(p.x - tower.tile[0], p.y - tower.tile[1]) > reach) continue;
    if (!hits(move.accuracy, state.rng)) {
      events.push({ type: 'miss', enemyId: enemy.id, towerId: tower.id });
      continue;
    }
    hurtTower(state, enemy, tower, move, events);
    if (timer.flinchAll) {
      applyFlinch(tower.mon.status, state.config.status);
      events.push({ type: 'status', towerId: tower.id, ailment: 'none', block: 'flinch' });
    }
  }
}

/** Towers sorted by distance to an enemy. */
function nearestTowers(state: LevelState, enemy: Enemy, count: number): Tower[] {
  const p = enemyPoint(state, enemy);
  return [...state.towers].sort((a, b) => Math.hypot(p.x - a.tile[0], p.y - a.tile[1]) - Math.hypot(p.x - b.tile[0], p.y - b.tile[1])).slice(0, count);
}

/** Enters a boss phase: new timed moves, Shadow Force, Will-O-Wisp, gravity timer. */
function enterPhase(state: LevelState, enemy: Enemy, index: number, events: LevelEvent[]): void {
  const boss = enemy.boss;
  const phase = boss?.phases[index];
  if (!boss || !phase) return;
  boss.phase = index;
  for (const m of phase.moves) boss.moves.push({ moveId: m.moveId, every: m.every, timer: m.every });
  events.push({ type: 'bossPhase', enemyId: enemy.id, index, text: `${enemy.mon.name} enters phase ${index + 1}` });
  if (phase.vanish) {
    enemy.vanish = phase.vanish;
    events.push({ type: 'rule', rule: 'boss', enemyId: enemy.id, text: `${enemy.mon.name} vanished!` });
  }
  if (phase.burnNearest) {
    for (const tower of nearestTowers(state, enemy, phase.burnNearest)) {
      if (applyAilment(tower.mon.status, 'burn', state.rng, state.config.status)) events.push({ type: 'status', towerId: tower.id, ailment: 'burn' });
    }
  }
  boss.reverseTimer = phase.reverseEvery ?? 0;
}

function spawn(state: LevelState, def: SpawnDef, events: LevelEvent[]): void {
  const shiny = def.shiny ?? (def.trainer ? false : state.rng.chance(state.config.shinyRate));
  const mon = createMonster(def.species, def.level, undefined, { shiny });
  const lane = def.lane && state.lanes[def.lane] ? def.lane : MAIN_LANE;
  const enemy: Enemy = {
    id: state.nextId++,
    mon,
    distance: -1,
    tilesPerSec: enemyTilesPerSec(mon.stats.spe, state.config.speed),
    lastHitBy: null,
    damagedBy: new Set(),
    trainer: def.trainer ?? false,
    ...(def.trainerId ? { trainerId: def.trainerId } : {}),
    lane,
    reversed: state.laneReversed[lane] ?? false,
    vanish: 0,
    stun: 0,
    speedBoost: 0,
  };
  let hpMult = 1;
  if (def.boss) {
    hpMult *= def.hpMultiplier ?? state.config.bosses.hpMultiplier;
    enemy.boss = {
      moves: (def.bossMoves ?? []).map((m) => ({ moveId: m.moveId, every: m.every, timer: m.every, ...(m.range !== undefined ? { range: m.range } : {}), ...(m.flinchAll ? { flinchAll: true } : {}) })),
      phases: (def.phases ?? []).map((p) => ({ ...p })),
      phase: -1,
      reverseTimer: 0,
    };
  }
  if (def.dynamax) {
    hpMult *= DYNAMAX_HP;
    enemy.dynamax = true;
  }
  if (hpMult !== 1) {
    mon.stats = { ...mon.stats, hp: Math.max(1, Math.round(mon.stats.hp * hpMult)) };
    mon.hp = mon.stats.hp;
  }
  if (def.shadow) enemy.shadow = true;
  if (def.alpha) enemy.alpha = true;
  if (def.catchableUnder !== undefined) enemy.catchableUnder = def.catchableUnder;
  if (def.immune) enemy.immune = [...def.immune];
  if (def.fleeAfter !== undefined) enemy.fleeAfter = def.fleeAfter;
  if (def.catchOnly) enemy.catchOnly = true;
  if (def.asleep) {
    enemy.asleep = true;
    mon.status.ailment = 'sleep';
    mon.status.ailmentSeconds = 1e6;
  }
  if (def.noble) {
    enemy.noble = { stagger: 0, staggerMax: Math.max(1, Math.round(mon.stats.hp * NOBLE_STAGGER_SHARE)), staggered: 0, staggers: 0, summons: [...(def.summons ?? [])], summonsOwed: 0 };
  }
  if (def.slowStart !== undefined) enemy.slowStart = def.slowStart;
  if (def.typeCycle !== undefined) enemy.typeCycle = { every: def.typeCycle, timer: def.typeCycle, index: 0 };
  state.enemies.push(enemy);
  events.push({ type: 'spawn', enemyId: enemy.id, shiny, ...(def.boss ? { boss: true } : {}) });
  rulesOnSpawn(state, enemy, def, events);
}

function endWave(state: LevelState, events: LevelEvent[]): void {
  state.wavesCleared++;
  const waveIndex = state.wave - 1;
  const trainerWaveDone = isTrainerWave(state, waveIndex);
  if (trainerWaveDone) {
    state.trainerBeaten = true;
    const script = scriptedWave(state.def, waveIndex);
    for (const t of script ? waveTrainers(script) : state.def.trainer ? [state.def.trainer] : []) state.trainersBeaten.push(t.name);
  }
  events.push({ type: 'waveEnd', wave: state.wave });
  const script = scriptedWave(state.def, waveIndex);
  if (script?.outro?.length) events.push({ type: 'cutscene', wave: state.wave, lines: script.outro });
  rulesOnWaveEnd(state, waveIndex, events);
  dismissAllies(state, state.wave, events);
  const won = state.def.objective === 'defend' ? state.wave >= waveCount(state.def) : trainerWaveDone;
  if (won) {
    state.phase = 'won';
    events.push({ type: 'phase', phase: 'won' });
    return;
  }
  state.phase = 'build';
  state.buildTimer = state.config.waves.freeWaveGapSeconds;
  events.push({ type: 'phase', phase: 'build' });
}

/** Out of lives: lose, or restart the boss wave once per attempt. */
function loseOrRetry(state: LevelState, events: LevelEvent[]): void {
  const bossWave = isTrainerWave(state, state.wave - 1) && trainerHasBoss(state.def, state.wave - 1);
  if (bossWave && state.config.bosses.retryBossWave && !state.bossRetryUsed) {
    state.bossRetryUsed = true;
    state.lives = state.waveStartLives;
    state.enemies = [];
    state.pending = [];
    state.wave -= 1;
    state.phase = 'build';
    state.buildTimer = state.config.waves.freeWaveGapSeconds;
    events.push({ type: 'bossRetry', wave: state.wave + 1 }, { type: 'phase', phase: 'build' });
    return;
  }
  state.phase = 'lost';
  state.enemies = [];
  state.pending = [];
  events.push({ type: 'phase', phase: 'lost' });
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

/** The end of an enemy's lane: a leak, or a flee for catch-only Pokémon, unless a rule sends it elsewhere. */
function enemyReachedEnd(state: LevelState, enemy: Enemy, events: LevelEvent[]): boolean {
  if (rulesOnReachEnd(state, enemy, events)) return false;
  removeEnemy(state, enemy);
  if (enemy.catchOnly) {
    events.push({ type: 'flee', enemyId: enemy.id, species: enemy.mon.species, text: `${enemy.mon.name} fled!` });
    return false;
  }
  state.leaks++;
  events.push({ type: 'leak', enemyId: enemy.id });
  if (state.def.objective === 'defend') {
    state.lives = Math.max(0, state.lives - 1);
    if (state.lives === 0) {
      loseOrRetry(state, events);
      return true;
    }
  }
  return false;
}

/** Advances the simulation by `dt` seconds (already multiplied by game speed). */
export function step(state: LevelState, dt: number): LevelEvent[] {
  const events: LevelEvent[] = [];
  if (dt <= 0) return events;
  state.elapsed += dt;

  if (state.phase === 'build') {
    tickTowerStatuses(state, dt, events);
    rulesOnTick(state, dt, events, true);
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
    if (!state.enemies.includes(enemy)) continue;
    const r = tickStatus(enemy.mon.status, enemy.mon.stats.hp, dt, state.rng, state.config.status);
    if (enemy.asleep) {
      enemy.mon.status.ailment = 'sleep';
      enemy.mon.status.ailmentSeconds = 1e6;
    }
    if (r.ended && !enemy.asleep) events.push({ type: 'statusEnd', enemyId: enemy.id, ailment: r.ended });
    if (r.damage > 0 && !enemy.catchOnly) {
      enemy.mon.hp = Math.max(0, enemy.mon.hp - r.damage);
      events.push({ type: 'statusDamage', enemyId: enemy.id, amount: r.damage });
      if (enemy.mon.hp <= 0) {
        koEnemy(state, enemy, enemy.lastHitBy, events);
        continue;
      }
    }
    if (enemy.vanish > 0) enemy.vanish = Math.max(0, enemy.vanish - dt);
    if (enemy.speedBoost > 0) enemy.speedBoost = Math.max(0, enemy.speedBoost - dt);
    if (enemy.slowStart !== undefined && enemy.slowStart > 0 && enemy.distance >= 0) {
      enemy.slowStart = Math.max(0, enemy.slowStart - dt);
      if (enemy.slowStart === 0) events.push({ type: 'rule', rule: 'slow-start', enemyId: enemy.id, text: `${enemy.mon.name}'s Slow Start wore off!` });
    }
    if (enemy.typeCycle && enemy.distance >= 0) {
      enemy.typeCycle.timer -= dt;
      if (enemy.typeCycle.timer <= 0) {
        enemy.typeCycle.timer += enemy.typeCycle.every;
        enemy.typeCycle.index = (enemy.typeCycle.index + 1) % TYPE_COUNT;
        const type = enemy.typeCycle.index + 1;
        enemy.mon.types = [type];
        events.push({ type: 'rule', rule: 'plates', enemyId: enemy.id, text: `${enemy.mon.name} holds a new Plate: it is ${TYPE_NAMES[String(type)] ?? '???'} type now.` });
      }
    }
    if (enemy.fleeAfter !== undefined && enemy.distance >= 0) {
      enemy.fleeAfter -= dt;
      if (enemy.fleeAfter <= 0) {
        removeEnemy(state, enemy);
        events.push({ type: 'flee', enemyId: enemy.id, species: enemy.mon.species, text: `${enemy.mon.name} fled!` });
        continue;
      }
    }
    if (enemy.noble) {
      tickNoble(state, enemy, dt, events);
      if (!state.enemies.includes(enemy)) continue;
    }
    if (enemy.stun > 0) {
      enemy.stun = Math.max(0, enemy.stun - dt);
    } else if (enemy.noble && enemy.noble.staggered > 0) {
      // Staggered: it stands still.
    } else {
      const speedMult =
        (enemy.asleep ? 1 : speedMultiplier(enemy.mon.status, state.config.status)) *
        stageMultiplier(enemy.mon.status.stages.spe) *
        rulesEnemySpeed(state, enemy) *
        (enemy.speedBoost > 0 ? 1.5 : 1) *
        (enemy.slowStart !== undefined && enemy.slowStart > 0 ? SLOW_START_SPEED : 1) *
        (enemy.noble ? NOBLE_FRENZY_SPEED : 1);
      enemy.distance = Math.max(0, enemy.distance + enemy.tilesPerSec * speedMult * dt);
    }
    if (enemy.distance >= enemyPath(state, enemy).length + 1) {
      if (enemy.noble) {
        enemy.distance = 0; // a noble charges the path again and again
        continue;
      }
      if (enemyReachedEnd(state, enemy, events)) return events;
      continue;
    }
    // Boss phases and moves on their timers, once the boss is on the path.
    if (enemy.boss && enemy.distance > 0) {
      const next = enemy.boss.phase + 1;
      const phase = enemy.boss.phases[next];
      if (phase && enemy.mon.hp <= phase.at * enemy.mon.stats.hp) enterPhase(state, enemy, next, events);
      if (enemy.boss.reverseTimer > 0) {
        enemy.boss.reverseTimer -= dt;
        if (enemy.boss.reverseTimer <= 0) {
          enemy.boss.reverseTimer = enemy.boss.phases[enemy.boss.phase]?.reverseEvery ?? 0;
          reverseLanes(state, events);
        }
      }
      if (enemy.vanish > 0) continue;
      if (enemy.slowStart !== undefined && enemy.slowStart > 0) continue; // Slow Start: no boss moves yet
      for (const m of enemy.boss.moves) {
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer += m.every;
          bossAttack(state, enemy, m, events);
        }
      }
    }
  }

  tickTowerStatuses(state, dt, events);
  rulesOnTick(state, dt, events, false);
  if (rulesLost(state)) {
    state.phase = 'lost';
    state.enemies = [];
    state.pending = [];
    events.push({ type: 'phase', phase: 'lost' });
    return events;
  }

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

  if (state.phase === 'wave' && state.pending.length === 0 && state.enemies.length === 0) endWave(state, events);
  return events;
}

/** The first living boss, for the boss HP bar. */
export function activeBoss(state: LevelState): Enemy | undefined {
  return state.enemies.find((e) => e.boss !== undefined);
}

export interface LevelSummary {
  outcome: Phase;
  wavesCleared: number;
  kos: number;
  leaks: number;
  party: { name: string; species: number; shiny: boolean; levelFrom: number; levelTo: number; expGained: number }[];
  caught: { name: string; species: number; level: number; shiny: boolean; ball: string }[];
  /** The trainer beaten this run, if any (the last one on scripted levels). */
  trainer?: string;
  /** Badge earned by winning (the game state decides whether it is new). */
  badge?: BadgeDef;
  lives?: number;
  maxLives?: number;
  totalWaves?: number;
}

export function summarize(state: LevelState): LevelSummary {
  const caughtSet = new Set(state.caught.map((c) => c.mon));
  const lastTrainer = state.trainersBeaten[state.trainersBeaten.length - 1] ?? (state.trainerBeaten && state.def.trainer ? state.def.trainer.name : undefined);
  const badge = state.def.badge ?? state.def.reward?.badge;
  return {
    outcome: state.phase,
    wavesCleared: state.wavesCleared,
    kos: state.kos,
    leaks: state.leaks,
    party: state.party
      .filter((p) => !caughtSet.has(p.mon))
      .map((p) => ({ name: p.mon.name, species: p.mon.species, shiny: p.mon.shiny, levelFrom: p.levelFrom, levelTo: p.mon.level, expGained: p.expGained })),
    caught: state.caught.map((c) => ({ name: c.mon.name, species: c.mon.species, level: c.mon.level, shiny: c.mon.shiny, ball: c.ball })),
    ...(lastTrainer ? { trainer: lastTrainer } : {}),
    ...(state.phase === 'won' && badge ? { badge } : {}),
    ...(state.def.objective === 'defend' ? { lives: state.lives, maxLives: state.def.lives ?? 0, totalWaves: waveCount(state.def) } : {}),
  };
}
