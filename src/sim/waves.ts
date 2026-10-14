/**
 * Seeded wave generation from a level's hand-written roster (or, for a
 * level without one, the area's Platinum encounter table), plus trainer
 * waves with fixed parties.
 */
import { encounterTable, findPokemonId, getEncounterArea, getPokemon, type EncounterEntry, type TimeOfDay } from '../data/pokedata';
import typesJson from '../data/types.json';

const TYPE_NAMES = (typesJson as { names: Record<string, string> }).names;
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

/** A boss phase: opens at this HP fraction with extra timed moves and optional tricks. */
export interface BossPhaseDef {
  /** HP fraction (1, 0.6, 0.3) at or below which the phase starts. */
  at: number;
  /** Timed moves added for this phase. */
  moves?: { move: string; every: number }[];
  /** Vanish (untargetable) for this many seconds at the phase start, then hit the nearest tower (Shadow Force). */
  vanish?: number;
  /** Burn the N nearest towers at the phase start (Will-O-Wisp). */
  burnNearest?: number;
  /** Reverse the lane every N seconds during this phase. */
  reverseEvery?: number;
}

export interface TrainerPokemonDef {
  /** Species name, or "counter-starter" for the starter that beats the player's ("counter-starter-final" for its final form). */
  species: string;
  level: number;
  boss?: boolean;
  /** Boss only: moves used on a timer against placed Pokémon in range. */
  moves?: { move: string; every: number }[];
  /** Boss HP multiplier instead of config.bosses.hpMultiplier (the Conference final's 5x). */
  hpMultiplier?: number;
  /** Legendary bosses: can be caught once under this HP fraction (0.1). */
  catchableUnder?: number;
  /** Type names this Pokémon takes no damage from (Motor Drive: ["electric"]); it speeds up for 3 s when hit by one. */
  immune?: string[];
  /** Boss phases, highest `at` first. */
  phases?: BossPhaseDef[];
  /** Shadow Pokémon: purple aura, 1.3x boss damage, no EXP when caught until purified. */
  shadow?: boolean;
  /** Flees (leaves the wave uncaught) after this many seconds on the path. */
  fleeAfter?: number;
  /** Cannot be damaged, only caught (Cresselia). */
  catchOnly?: boolean;
  /** Dynamax: 2.5x sprite, red aura, 3x HP. */
  dynamax?: boolean;
}

export interface TrainerDef {
  id: string;
  name: string;
  /** Shown on the intro card. */
  intro?: string;
  /** Said when beaten (the summary and the outro dialogue). */
  outro?: string;
  party: TrainerPokemonDef[];
  /** Free levels: the 1-based wave the trainer appears on (defend levels use the last wave). */
  wave?: number;
  /** Lane the party walks ("path", "path-2", "both": alternating). */
  lane?: string;
}

/** One hand-written wild entry of a scripted wave. */
export interface WildEntry {
  species: string;
  rarity?: number;
  levels?: [number, number];
  /** Alpha: 1.5x sprite, +10 levels, drops a Hisuian ball. */
  alpha?: boolean;
  shadow?: boolean;
}

export interface DialogueLine {
  /** Trainer id for the portrait (omit for the narrator). */
  speaker?: string;
  text: string;
  /** Species names shown on the altar / stage point as sprites while the line is up. */
  show?: string[];
  /** A riddle: the options and the index of the right answer; `correct` names a rule action. */
  options?: string[];
  answer?: number;
  onCorrect?: { rule: string; action: string };
}

export interface AllyDef {
  species: string;
  level: number;
  name?: string;
  moves?: string[];
  /** Where it stands: a tile, a stage point name, or "nearest-exit" / "nearest-spawn" / "nearest-<point>" among the spots. */
  spot: [number, number] | string;
  /** 1-based inclusive wave range it stays for (defaults to the whole level). */
  waves?: [number, number];
}

/** A scripted wave. */
export interface WaveDef {
  /** Wild spawns (names or entries); `count` and `levels` give the amount and default range. */
  wild?: (string | WildEntry)[];
  count?: number;
  levels?: [number, number];
  /** One trainer's party (its intro plays first). */
  trainer?: TrainerDef;
  /** Several trainers at once (tag battles). */
  trainers?: TrainerDef[];
  allies?: AllyDef[];
  /** Dialogue before the wave (after the trainer intro). */
  lines?: DialogueLine[];
  /** Dialogue once the wave is cleared. */
  outro?: DialogueLine[];
  /** Lane for the wild spawns: a lane name, "random" or "both" (alternating). */
  lane?: string;
  /** Text for the wave banner (rules add theirs). */
  banner?: string;
  /** Every spawn is a Shadow Pokémon. */
  shadow?: boolean;
  /** Trainer Pokémon that are Dynamaxed. */
  spawnInterval?: number;
}

export interface RuleDef {
  id: string;
  [param: string]: unknown;
}

export interface UnlockDef {
  /** Levels that must be completed. */
  levels?: string[];
  badges?: string[];
  /** Key items / TMs / HM flags the save must hold. */
  items?: string[];
  flags?: string[];
}

export interface RewardDef {
  badge?: BadgeDef;
  /** TM name ("stealth-rock"): a flag `tm-<name>` plus the TM item sprite. */
  tm?: string;
  /** Items by id (balls by ball id, "potion", "rare-candy", key items). */
  items?: Record<string, number>;
  money?: number;
  /** Flags set when the level is won ("cut", "surf", "oaks-letter"). */
  flags?: string[];
}

export const POPUP_KINDS = ['route', 'city', 'town', 'cave', 'forest', 'lake', 'water', 'indoors', 'park'] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

/** The location banner for a level: its `popup`, else guessed from the area (lakes, caves and mines, forests, routes). */
export function levelPopup(def: Pick<LevelDef, 'area' | 'popup'>): PopupKind {
  if (def.popup) return def.popup;
  const area = def.area;
  if (/lake/.test(area)) return 'lake';
  if (/mine|gate|cave|cavern|tunnel|ruins/.test(area)) return 'cave';
  if (/forest/.test(area)) return 'forest';
  return 'route';
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
  /** Marker position on the Platinum town map (256x192 map pixels). */
  mapPos?: [number, number];
  /** Location popup banner kind (ui/gen4/popups/<kind>.png); defaults by area, see levelPopup. */
  popup?: PopupKind;
  /** Defend only: number of waves to clear, or the scripted waves themselves. */
  waves?: number | WaveDef[];
  /** Defend only: starting lives. */
  lives?: number;
  /** Named rules in play (src/sim/rules). */
  rules?: RuleDef[];
  /** Free allied towers for the whole level (scripted waves can add their own). */
  allies?: AllyDef[];
  /** Lanes enemies may use (defaults to the main path; "path-2" and "path-water" come from the map). */
  lanes?: string[];
  /** What the save needs for the level to open (besides `requires`). */
  unlock?: UnlockDef;
  reward?: RewardDef;
  /** Placed Pokémon gain no EXP past this level here (PTD's level caps). */
  levelCap?: number;
  /** Default level range for scripted wild waves. */
  levels?: [number, number];
  /** Content check: the highest wild level the tests allow (defaults to the opening-route cap). */
  maxWildLevel?: number;
  /** Legends rules: no money, no shop; only these balls can be thrown (ids). */
  ballsOnly?: string[];
  /** Hisui rifts and events: the level does not pay money. */
  noMoney?: boolean;
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
  /** The trainer it belongs to (for banners and the field pose). */
  trainerId?: string;
  boss?: boolean;
  /** Boss moves (resolved ids) with their timers. */
  bossMoves?: { moveId: number; every: number }[];
  hpMultiplier?: number;
  catchableUnder?: number;
  immune?: number[];
  phases?: { at: number; moves: { moveId: number; every: number }[]; vanish?: number; burnNearest?: number; reverseEvery?: number }[];
  shadow?: boolean;
  alpha?: boolean;
  fleeAfter?: number;
  catchOnly?: boolean;
  dynamax?: boolean;
  /** Lane name; the main path when absent. */
  lane?: string;
  /** Forced shiny (space-time distortions). */
  shiny?: boolean;
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

/** Number of waves a defend level has (scripted levels: the script's length); 0 for free levels. */
export function waveCount(def: LevelDef): number {
  if (Array.isArray(def.waves)) return def.waves.length;
  return def.waves ?? 0;
}

export function isScripted(def: LevelDef): boolean {
  return Array.isArray(def.waves);
}

/** The scripted entry of wave `waveIndex` (0-based), if the level is scripted. */
export function scriptedWave(def: LevelDef, waveIndex: number): WaveDef | undefined {
  return Array.isArray(def.waves) ? def.waves[waveIndex] : undefined;
}

/** The trainers a scripted wave sends, in order. */
export function waveTrainers(wave: WaveDef | undefined): TrainerDef[] {
  if (!wave) return [];
  return [...(wave.trainer ? [wave.trainer] : []), ...(wave.trainers ?? [])];
}

/** Every trainer a level names (the single `trainer` or the scripted waves'). */
export function levelTrainers(def: LevelDef): TrainerDef[] {
  const out: TrainerDef[] = [];
  if (def.trainer) out.push(def.trainer);
  if (Array.isArray(def.waves)) for (const w of def.waves) out.push(...waveTrainers(w));
  return out;
}

/** Every species name a scripted level can spawn (wild entries, trainer parties, allies). */
export function scriptedSpeciesNames(def: LevelDef): string[] {
  const out = new Set<string>();
  if (!Array.isArray(def.waves)) return [];
  for (const w of def.waves) {
    for (const e of w.wild ?? []) out.add(typeof e === 'string' ? e : e.species);
    for (const t of waveTrainers(w)) for (const p of t.party) out.add(p.species);
    for (const a of w.allies ?? []) out.add(a.species);
    for (const line of [...(w.lines ?? []), ...(w.outro ?? [])]) for (const name of line.show ?? []) out.add(name);
  }
  return [...out];
}

/** The 0-based wave index the trainer appears on, or -1 without a trainer. */
export function trainerWaveIndex(def: LevelDef): number {
  if (!def.trainer) return -1;
  if (def.objective === 'defend') return waveCount(def) - 1;
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

/** Final evolution of a starter line (Torterra, Infernape, Empoleon). */
export function finalStarter(starter: number): number {
  return starter + 2;
}

/** Resolves a party entry's species: names, the rival's counter-starter and its final form. */
export function partySpecies(name: string, starter: number | undefined, where: string): number {
  if (name === 'counter-starter') return counterStarter(starter);
  if (name === 'counter-starter-final') return finalStarter(counterStarter(starter));
  return speciesId(name, where);
}

/** One trainer's party as spawns, in order, one every spawnInterval, from `offset` seconds. */
export function partySpawns(trainer: TrainerDef, starter: number | undefined, moveId: (name: string) => number, spawnInterval: number, offset = 0, lane?: string): SpawnDef[] {
  const typeId = (name: string): number => {
    const id = Object.entries(TYPE_NAMES).find(([, n]) => n === name)?.[0];
    if (id === undefined) throw new Error(`partySpawns: ${trainer.name}: unknown type "${name}"`);
    return Number(id);
  };
  return trainer.party.map((p, i) => {
    const species = partySpecies(p.species, starter, `partySpawns: ${trainer.name}`);
    getPokemon(species);
    const spawn: SpawnDef = { species, level: p.level, delay: offset + i * spawnInterval, trainer: true, trainerId: trainer.id };
    if (p.boss) {
      spawn.boss = true;
      spawn.bossMoves = (p.moves ?? []).map((m) => ({ moveId: moveId(m.move), every: m.every }));
    }
    if (p.hpMultiplier !== undefined) spawn.hpMultiplier = p.hpMultiplier;
    if (p.catchableUnder !== undefined) spawn.catchableUnder = p.catchableUnder;
    if (p.immune) spawn.immune = p.immune.map(typeId);
    if (p.phases) {
      spawn.phases = p.phases.map((ph) => ({
        at: ph.at,
        moves: (ph.moves ?? []).map((m) => ({ moveId: moveId(m.move), every: m.every })),
        ...(ph.vanish !== undefined ? { vanish: ph.vanish } : {}),
        ...(ph.burnNearest !== undefined ? { burnNearest: ph.burnNearest } : {}),
        ...(ph.reverseEvery !== undefined ? { reverseEvery: ph.reverseEvery } : {}),
      }));
    }
    if (p.shadow) spawn.shadow = true;
    if (p.fleeAfter !== undefined) spawn.fleeAfter = p.fleeAfter;
    if (p.catchOnly) spawn.catchOnly = true;
    if (p.dynamax) spawn.dynamax = true;
    const laneName = lane ?? trainer.lane;
    if (laneName && laneName !== 'both') spawn.lane = laneName;
    else if (laneName === 'both') spawn.lane = i % 2 === 0 ? 'path' : 'path-2';
    return spawn;
  });
}

/** A trainer's party as spawns, in order, one every spawnInterval. */
export function trainerWave(def: LevelDef, starter: number | undefined, moveId: (name: string) => number): SpawnDef[] {
  const trainer = def.trainer;
  if (!trainer) throw new Error(`trainerWave: ${def.name} has no trainer`);
  return partySpawns(trainer, starter, moveId, def.spawnInterval);
}

/** Resolves a scripted wave's wild list to an encounter table. */
export function scriptedWildTable(def: LevelDef, wave: WaveDef): (EncounterEntry & { alpha?: boolean; shadow?: boolean })[] {
  return (wave.wild ?? []).map((raw) => {
    const e: WildEntry = typeof raw === 'string' ? { species: raw } : raw;
    const species = speciesId(e.species, `scriptedWildTable: ${def.name}`);
    const [min, max] = e.levels ?? wave.levels ?? def.levels ?? (() => {
      try {
        return areaLevelRange(def.area, species);
      } catch {
        return [5, 10] as [number, number];
      }
    })();
    return { species, min, max, rarity: e.rarity ?? 10, ...(e.alpha ? { alpha: true } : {}), ...(e.shadow ? { shadow: true } : {}) };
  });
}

/**
 * The spawns of a scripted wave: the wild list (`count` of them, default the
 * level's ramp), then each trainer's party in order, all on the wave's lane.
 */
export function scriptedSpawns(
  def: LevelDef,
  waveIndex: number,
  starter: number | undefined,
  moveId: (name: string) => number,
  rng: Rng,
  opts: WaveOptions,
  lanePicker: (choice: string | undefined, i: number) => string | undefined,
): SpawnDef[] {
  const wave = scriptedWave(def, waveIndex);
  if (!wave) throw new Error(`scriptedSpawns: ${def.name} has no wave ${waveIndex + 1}`);
  const interval = wave.spawnInterval ?? def.spawnInterval;
  const spawns: SpawnDef[] = [];
  const table = scriptedWildTable(def, wave);
  if (table.length > 0) {
    const count = wave.count ?? waveEnemyCount(def, waveIndex, opts);
    for (let i = 0; i < count; i++) {
      const entry = pickEntry(table, rng) as (typeof table)[number];
      const level = (opts.levelOverride ?? rng.int(entry.min, entry.max)) + (entry.alpha ? 10 : 0);
      const lane = lanePicker(wave.lane, i);
      spawns.push({
        species: entry.species,
        level: Math.min(100, level),
        delay: i * interval,
        ...(entry.alpha ? { alpha: true } : {}),
        ...(entry.shadow || wave.shadow ? { shadow: true } : {}),
        ...(lane ? { lane } : {}),
      });
    }
  }
  let offset = spawns.length * interval;
  for (const trainer of waveTrainers(wave)) {
    const party = partySpawns(trainer, starter, moveId, interval, offset, wave.lane === 'random' || wave.lane === 'both' ? undefined : wave.lane);
    for (const p of party) {
      if (!p.lane && !trainer.lane) {
        const lane = lanePicker(wave.lane, spawns.length);
        if (lane) p.lane = lane;
      }
      if (wave.shadow) p.shadow = true;
    }
    spawns.push(...party);
    offset += party.length * interval;
  }
  return spawns;
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
