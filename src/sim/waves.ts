/**
 * Seeded wave generation from a level's hand-written roster (or, for a
 * level without one, the area's Platinum encounter table), plus trainer
 * waves with fixed parties.
 */
import { encounterTable, findPokemonId, getEncounterArea, getPokemon, type EncounterEntry, type TimeOfDay } from '../data/pokedata';
import type { Rng } from './rng';

export type Objective = 'defend' | 'free';

/** One hand-written roster line: a species name, its weight and an optional level range. */
export interface RosterEntry {
  species: string;
  rarity: number;
  /** Level range; defaults to the species' range in the area's walk table, else the area's overall range. */
  levels?: [number, number];
}

/** The share of a level's spawns above which a roster species counts as featured. */
export const RARE_SHARE = 0.1;

export interface TrainerPokemonDef {
  /** Species name, or "counter-starter" for the starter that beats the player's. */
  species: string;
  level: number;
  boss?: boolean;
  /** Boss only: moves used on a timer against placed Pokémon in range. */
  moves?: { move: string; every: number }[];
}

export interface TrainerDef {
  id: string;
  name: string;
  /** Shown on the intro card. */
  intro?: string;
  party: TrainerPokemonDef[];
  /** Free levels: the 1-based wave the trainer appears on (defend levels use the last wave). */
  wave?: number;
}

export interface BadgeDef {
  id: string;
  name: string;
}

export interface LevelDef {
  name: string;
  area: string;
  time: TimeOfDay;
  objective: Objective;
  map: string;
  /** Defend only: number of waves to clear. */
  waves?: number;
  /** Defend only: starting lives. */
  lives?: number;
  enemiesFirstWave: number;
  enemiesPerWave: number;
  /** Seconds between spawns within a wave. */
  spawnInterval: number;
  /** How many Pokémon the player may place. */
  placements: number;
  /** Level that must be completed first (null or absent = always open). */
  requires?: string | null;
  /** Hand-written spawn roster; without one the area's walk table is used. */
  roster?: RosterEntry[];
  /** Trainer battle on the final (or `trainer.wave`-th) wave. */
  trainer?: TrainerDef;
  /** Awarded when the level is won. */
  badge?: BadgeDef;
  /** Legacy flag: every wave is trainer-owned. */
  trainerWaves?: boolean;
}

export interface SpawnDef {
  species: number;
  level: number;
  /** Seconds after the wave starts. */
  delay: number;
  /** Trainer-owned: cannot be caught. */
  trainer?: boolean;
  boss?: boolean;
  /** Boss moves (resolved ids) with their timers. */
  bossMoves?: { moveId: number; every: number }[];
}

export interface WaveOptions {
  /** Cap on enemies per wave on "free" levels. */
  freeWaveMaxEnemies: number;
  /** Debug: force every spawn to this level. */
  levelOverride?: number;
}

/** Enemies in wave `waveIndex` (0-based). Free levels ramp the count only, up to a cap. */
export function waveEnemyCount(def: LevelDef, waveIndex: number, opts: WaveOptions): number {
  const count = def.enemiesFirstWave + def.enemiesPerWave * waveIndex;
  return def.objective === 'free' ? Math.min(count, opts.freeWaveMaxEnemies) : count;
}

/** Rarity-weighted pick. Entries must have positive rarity. */
export function pickEntry(table: readonly EncounterEntry[], rng: Rng): EncounterEntry {
  if (table.length === 0) throw new Error('pickEntry: empty table');
  const total = table.reduce((s, e) => s + e.rarity, 0);
  let r = rng.next() * total;
  for (const entry of table) {
    r -= entry.rarity;
    if (r < 0) return entry;
  }
  return table[table.length - 1] as EncounterEntry;
}

function speciesId(name: string, where: string): number {
  const id = findPokemonId(name);
  if (id === undefined) throw new Error(`${where}: unknown species "${name}"`);
  return id;
}

/** Level range of a species in an area's walk table (all times), or the table's overall range. */
export function areaLevelRange(areaKey: string, species: number): [number, number] {
  const walk = getEncounterArea(areaKey).walk ?? [];
  const own = walk.filter((e) => e.species === species);
  const pool = own.length ? own : walk;
  if (pool.length === 0) throw new Error(`areaLevelRange: ${areaKey} has no walk table`);
  return [Math.min(...pool.map((e) => e.min)), Math.max(...pool.map((e) => e.max))];
}

/** Resolves a level's roster to encounter entries (names to ids, default level ranges). */
export function rosterTable(def: LevelDef): EncounterEntry[] {
  if (!def.roster || def.roster.length === 0) throw new Error(`rosterTable: ${def.name} has no roster`);
  return def.roster.map((entry) => {
    if (!(entry.rarity > 0)) throw new Error(`rosterTable: ${def.name}: ${entry.species} needs a positive rarity`);
    const species = speciesId(entry.species, `rosterTable: ${def.name}`);
    const [min, max] = entry.levels ?? areaLevelRange(def.area, species);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) throw new Error(`rosterTable: ${def.name}: bad levels for ${entry.species}`);
    return { species, min, max, rarity: entry.rarity };
  });
}

/** The spawn table a level uses at a time of day: its roster, or the area's walk table. */
export function levelTable(def: LevelDef, time: TimeOfDay): EncounterEntry[] {
  if (def.roster) return rosterTable(def);
  return encounterTable(getEncounterArea(def.area), 'walk', time);
}

/** Roster species whose share of spawns is above RARE_SHARE (names). */
export function featuredSpecies(def: LevelDef): string[] {
  if (!def.roster) return [];
  const total = def.roster.reduce((s, e) => s + e.rarity, 0);
  return def.roster.filter((e) => e.rarity / total > RARE_SHARE + 1e-9).map((e) => e.species);
}

/** Roster species at or below RARE_SHARE. */
export function rareSpecies(def: LevelDef): string[] {
  if (!def.roster) return [];
  const featured = new Set(featuredSpecies(def));
  return def.roster.map((e) => e.species).filter((s) => !featured.has(s));
}

/** The 0-based wave index the trainer appears on, or -1 without a trainer. */
export function trainerWaveIndex(def: LevelDef): number {
  if (!def.trainer) return -1;
  if (def.objective === 'defend') return (def.waves ?? 1) - 1;
  return (def.trainer.wave ?? 1) - 1;
}

/** Starter that beats a starter (Turtwig < Chimchar < Piplup < Turtwig). */
export function counterStarter(starter: number | undefined): number {
  switch (starter) {
    case 387:
      return 390;
    case 390:
      return 393;
    default:
      return 387;
  }
}

/** A trainer's party as spawns, in order, one every spawnInterval. */
export function trainerWave(def: LevelDef, starter: number | undefined, moveId: (name: string) => number): SpawnDef[] {
  const trainer = def.trainer;
  if (!trainer) throw new Error(`trainerWave: ${def.name} has no trainer`);
  return trainer.party.map((p, i) => {
    const species = p.species === 'counter-starter' ? counterStarter(starter) : speciesId(p.species, `trainerWave: ${trainer.name}`);
    getPokemon(species);
    const spawn: SpawnDef = { species, level: p.level, delay: i * def.spawnInterval, trainer: true };
    if (p.boss) {
      spawn.boss = true;
      spawn.bossMoves = (p.moves ?? []).map((m) => ({ moveId: moveId(m.move), every: m.every }));
    }
    return spawn;
  });
}

export function generateWave(
  table: readonly EncounterEntry[],
  def: LevelDef,
  waveIndex: number,
  rng: Rng,
  opts: WaveOptions,
): SpawnDef[] {
  const count = waveEnemyCount(def, waveIndex, opts);
  const spawns: SpawnDef[] = [];
  for (let i = 0; i < count; i++) {
    const entry = pickEntry(table, rng);
    const level = opts.levelOverride ?? rng.int(entry.min, entry.max);
    spawns.push({ species: entry.species, level, delay: i * def.spawnInterval, ...(def.trainerWaves ? { trainer: true } : {}) });
  }
  return spawns;
}
