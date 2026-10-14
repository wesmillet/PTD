/**
 * Typed access to the generated PokeAPI data (see scripts/build-pokedata.ts).
 * No Phaser imports; usable from src/sim.
 */
import pokemonJson from './pokemon.json';
import learnsetsJson from './learnsets.json';
import movesJson from './moves.json';
import typesJson from './types.json';
import expCurvesJson from './exp_curves.json';
import evolutionsJson from './evolutions.json';
import encountersJson from './encounters.json';

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type BaseStats = Record<StatKey, number>;
export type GrowthRate =
  | 'slow'
  | 'medium'
  | 'fast'
  | 'medium-slow'
  | 'slow-then-very-fast'
  | 'fast-then-very-slow';
export type MoveCategory = 'physical' | 'special' | 'status';
export type TimeOfDay = 'morning' | 'day' | 'night';
export type EncounterMethod = 'walk' | 'surf' | 'old-rod' | 'good-rod';

export interface PokemonData {
  name: string;
  gen: number;
  types: number[];
  base: BaseStats;
  growth: GrowthRate;
  catchRate: number;
  baseExp: number;
  baseHappiness: number;
  evolvesFrom: number;
  chain: number;
  /** Forms only: the base species' dex number (the id is PokeAPI's 10000+ form id or a synthetic one). */
  species?: number;
  /** Forms only: "hisui", "mega", "origin", "sky", "shadow", "primal". */
  form?: string;
  formName?: string;
  /** Forms only: the sprite folder ("0058-hisui"). */
  folder?: string;
  /** Shadow Mewtwo and Shadow Lugia. */
  shadow?: boolean;
  /** Primal Dialga. */
  primal?: boolean;
}

export type StageKey = StatKey | 'accuracy' | 'evasion';
export type Ailment = 'none' | 'paralysis' | 'sleep' | 'freeze' | 'burn' | 'poison' | 'confusion' | string;

/** Secondary effect data from PokeAPI's move_meta tables. */
export interface MoveEffect {
  /** PokeAPI meta category: damage, ailment, net-good-stats, heal, damage-ailment, damage-lower, damage-raise, damage-heal, ohko, unique, ... */
  kind: string;
  ailment: Ailment;
  /** Percent chance of the ailment on hit; 0 on pure "ailment" moves means always. */
  ailmentChance: number;
  flinchChance: number;
  /** Percent chance of the stat changes on hit; 0 on pure stat moves means always. */
  statChance: number;
  stats: { stat: StageKey; change: number }[];
  /** Percent of damage dealt healed (positive) or taken as recoil (negative). */
  drain: number;
  /** Percent of max HP healed. */
  healing: number;
  critRate: number;
  hits: [number, number] | null;
}

export interface MoveData {
  name: string;
  type: number;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  category: MoveCategory;
  priority: number;
  /** PokeAPI target identifier: user, selected-pokemon, all-opponents, ... */
  target: string;
  effect: MoveEffect;
}

export interface EvolutionData {
  to: number;
  trigger: string;
  level?: number;
  item?: string;
  heldItem?: string;
  happiness?: number;
  time?: string;
  knownMove?: number;
  location?: number;
  [extra: string]: unknown;
}

export interface EncounterEntry {
  species: number;
  min: number;
  max: number;
  rarity: number;
  time?: TimeOfDay;
}

export interface EncounterArea {
  location: string;
  areaId: number;
  walk?: EncounterEntry[];
  surf?: EncounterEntry[];
  'old-rod'?: EncounterEntry[];
  'good-rod'?: EncounterEntry[];
}

const pokemon = pokemonJson as Record<string, PokemonData>;
const learnsets = learnsetsJson as unknown as Record<string, [number, number][]>;
const moves = movesJson as unknown as Record<string, MoveData>;
const types = typesJson as { names: Record<string, string>; chart: Record<string, Record<string, number>> };
const expCurves = expCurvesJson as Record<GrowthRate, number[]>;
const evolutions = evolutionsJson as Record<string, EvolutionData[] | Record<string, number[]>>;
const encounters = encountersJson as Record<string, EncounterArea>;

export function getPokemon(id: number): PokemonData {
  const p = pokemon[String(id)];
  if (!p) throw new Error(`pokedata: unknown Pokémon ${id}`);
  return p;
}

/**
 * Species id for a lowercase name such as "turtwig" or "growlithe-hisui",
 * or undefined. "hisuian-growlithe", "mega-lucario", "shadow-mewtwo" and
 * "primal-dialga" (the display spellings) resolve too.
 */
export function findPokemonId(name: string): number | undefined {
  const needle = name.toLowerCase();
  for (const [id, p] of Object.entries(pokemon)) if (p.name === needle) return Number(id);
  for (const [id, p] of Object.entries(pokemon)) if (displayName(Number(id)) === needle || (p.form && `${p.name.replace(`-${p.form}`, '')}-${p.form}` === needle)) return Number(id);
  return undefined;
}

/** Every species id in the data, base species and forms. */
export function allPokemonIds(): number[] {
  return Object.keys(pokemon).map(Number);
}

/** The base species of a form (itself for a base species). */
export function baseSpecies(id: number): number {
  return getPokemon(id).species ?? id;
}

/**
 * Hyphenated display spelling: "hisuian-growlithe", "mega-lucario",
 * "giratina-origin", "shaymin-sky", "shadow-mewtwo", "primal-dialga";
 * base species keep their name. capitalizeName turns it into words.
 */
export function displayName(id: number): string {
  const p = getPokemon(id);
  if (!p.form) return p.name;
  const base = getPokemon(p.species ?? id).name;
  switch (p.form) {
    case 'hisui':
      return `hisuian-${base}`;
    case 'mega':
      return `mega-${base}`;
    case 'shadow':
      return `shadow-${base}`;
    case 'primal':
      return `primal-${base}`;
    default:
      return `${base}-${p.form}`;
  }
}

export function getMove(id: number): MoveData {
  const m = moves[String(id)];
  if (!m) throw new Error(`pokedata: unknown move ${id}`);
  return m;
}

export function findMoveId(name: string): number | undefined {
  const needle = name.toLowerCase();
  for (const [id, m] of Object.entries(moves)) if (m.name === needle) return Number(id);
  return undefined;
}

/** Platinum level-up learnset as `[level, moveId]` pairs sorted by level. */
export function getLearnset(id: number): readonly [number, number][] {
  return learnsets[String(id)] ?? [];
}

export function typeName(id: number): string {
  return types.names[String(id)] ?? `type-${id}`;
}

/** Gen 4 effectiveness multiplier of an attacking type against one defending type. */
export function typeEffectiveness(attackType: number, defendType: number): number {
  return types.chart[String(attackType)]?.[String(defendType)] ?? 1;
}

/** Total EXP needed to be at `level` (1..100) on a growth curve. */
export function expForLevel(growth: GrowthRate, level: number): number {
  const curve = expCurves[growth];
  if (!curve) throw new Error(`pokedata: unknown growth rate ${growth}`);
  const clamped = Math.max(1, Math.min(100, Math.floor(level)));
  return curve[clamped - 1] ?? 0;
}

export function getEvolutions(id: number): EvolutionData[] {
  const list = evolutions[String(id)];
  return Array.isArray(list) ? list : [];
}

export function getEncounterArea(key: string): EncounterArea {
  const area = encounters[key];
  if (!area) throw new Error(`pokedata: unknown encounter area "${key}"`);
  return area;
}

export function encounterAreaKeys(): string[] {
  return Object.keys(encounters);
}

/**
 * The entries of one method's table that apply at a time of day: entries
 * with no time condition plus those matching `time`.
 */
export function encounterTable(area: EncounterArea, method: EncounterMethod, time: TimeOfDay): EncounterEntry[] {
  return (area[method] ?? []).filter((e) => !e.time || e.time === time);
}
