/**
 * Seeded wave generation from a Platinum encounter table.
 */
import type { EncounterEntry, TimeOfDay } from '../data/pokedata';
import type { Rng } from './rng';

export type Objective = 'defend' | 'free';

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
}

export interface SpawnDef {
  species: number;
  level: number;
  /** Seconds after the wave starts. */
  delay: number;
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
    spawns.push({ species: entry.species, level, delay: i * def.spawnInterval });
  }
  return spawns;
}
