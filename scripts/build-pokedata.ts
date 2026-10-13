/**
 * One-off build script: reads PokeAPI CSVs (data/v2/csv, see
 * scripts/fetch-pokeapi.sh) and emits compact JSON into src/data/.
 *
 * Run with plain Node 22+: `node scripts/build-pokedata.ts [csvDir] [outDir]`.
 * No dependencies. Output is limited to Gen 1 through 4 and the Gen 4
 * ruleset (Platinum learnsets and encounters, Gen 4 type chart).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const csvDir = resolve(process.argv[2] ?? process.env.POKEAPI_DIR ?? '/tmp/pokeapi', 'data/v2/csv');
const outDir = resolve(process.argv[3] ?? resolve(here, '../src/data'));

const MAX_GENERATION = 4;
const MAX_SPECIES = 493;
const MAX_TYPE = 17; // normal .. dark; no fairy, stellar, unknown, shadow
const PLATINUM_VERSION = 14;
const PLATINUM_VERSION_GROUP = 9;
const LEVEL_UP_METHOD = 1;
const ENCOUNTER_METHODS: Record<string, string> = { '1': 'walk', '2': 'old-rod', '3': 'good-rod', '5': 'surf' };
const TIME_CONDITIONS: Record<string, string> = { '3': 'morning', '4': 'day', '5': 'night' };
// Default-valued condition variants are the ordinary table: keep, unconditioned.
const DEFAULT_CONDITIONS = new Set(['2', '7', '8']); // swarm-no, radar-off, slot2-none

type Row = Record<string, string>;

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF, multi-line fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(name: string): Row[] {
  const [header, ...rows] = parseCsv(readFileSync(resolve(csvDir, name), 'utf8'));
  if (!header) throw new Error(`${name}: empty`);
  return rows
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const int = (s: string | undefined): number => {
  if (s === undefined || s === '') throw new Error(`expected integer, got "${s}"`);
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`expected integer, got "${s}"`);
  return n;
};
const optInt = (s: string | undefined): number | null => (s === undefined || s === '' ? null : int(s));

/** Writes JSON with one top-level entry per line, for readable diffs. */
function writeJson(name: string, value: Record<string, unknown> | unknown[]): void {
  let text: string;
  if (Array.isArray(value)) {
    text = `[\n${value.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`;
  } else {
    const lines = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    text = `{\n${lines.join(',\n')}\n}\n`;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, name), text);
  console.log(`wrote ${name} (${(text.length / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------- species

const speciesRows = readCsv('pokemon_species.csv').filter((r) => int(r.generation_id) <= MAX_GENERATION);
const speciesIds = new Set(speciesRows.map((r) => r.id));
if (speciesIds.size !== MAX_SPECIES) throw new Error(`expected ${MAX_SPECIES} species, got ${speciesIds.size}`);

const growthNames = new Map(readCsv('growth_rates.csv').map((r) => [r.id, r.identifier]));
const statKeys: Record<string, string> = { '1': 'hp', '2': 'atk', '3': 'def', '4': 'spa', '5': 'spd', '6': 'spe' };

const baseStats = new Map<string, Record<string, number>>();
for (const r of readCsv('pokemon_stats.csv')) {
  if (!speciesIds.has(r.pokemon_id)) continue; // default forms share the species id
  const key = statKeys[r.stat_id];
  if (!key) continue;
  const entry = baseStats.get(r.pokemon_id) ?? {};
  entry[key] = int(r.base_stat);
  baseStats.set(r.pokemon_id, entry);
}
const typesByPokemon = new Map<string, number[]>();
for (const r of readCsv('pokemon_types.csv')) {
  if (!speciesIds.has(r.pokemon_id)) continue;
  const list = typesByPokemon.get(r.pokemon_id) ?? [];
  list[int(r.slot) - 1] = int(r.type_id);
  typesByPokemon.set(r.pokemon_id, list);
}
const pokemonRows = new Map(readCsv('pokemon.csv').filter((r) => speciesIds.has(r.id)).map((r) => [r.id, r]));

const pokemon: Record<string, unknown> = {};
for (const s of speciesRows) {
  const p = pokemonRows.get(s.id);
  const base = baseStats.get(s.id);
  const types = typesByPokemon.get(s.id);
  if (!p || !base || !types) throw new Error(`incomplete data for species ${s.id}`);
  for (const k of Object.values(statKeys)) if (base[k] === undefined) throw new Error(`missing ${k} for ${s.id}`);
  pokemon[s.id] = {
    name: s.identifier,
    gen: int(s.generation_id),
    types,
    base: { hp: base.hp, atk: base.atk, def: base.def, spa: base.spa, spd: base.spd, spe: base.spe },
    growth: growthNames.get(s.growth_rate_id) ?? `unknown-${s.growth_rate_id}`,
    catchRate: int(s.capture_rate),
    baseExp: int(p.base_experience),
    baseHappiness: optInt(s.base_happiness) ?? 70,
    evolvesFrom: optInt(s.evolves_from_species_id) ?? 0,
    chain: int(s.evolution_chain_id),
  };
}
writeJson('pokemon.json', pokemon);

// --------------------------------------------------------------- learnsets

const learnsets: Record<string, [number, number][]> = {};
for (const r of readCsv('pokemon_moves.csv')) {
  if (r.version_group_id !== String(PLATINUM_VERSION_GROUP) || r.pokemon_move_method_id !== String(LEVEL_UP_METHOD)) continue;
  if (!speciesIds.has(r.pokemon_id)) continue;
  (learnsets[r.pokemon_id] ??= []).push([int(r.level), int(r.move_id)]);
}
for (const id of speciesIds) {
  const list = learnsets[id];
  if (!list || list.length === 0) throw new Error(`species ${id} has no Platinum level-up moves`);
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
writeJson('learnsets.json', Object.fromEntries(Object.entries(learnsets).sort((a, b) => int(a[0]) - int(b[0]))));

// ------------------------------------------------------------------- moves

const categories: Record<string, string> = { '1': 'status', '2': 'physical', '3': 'special' };
const moves: Record<string, unknown> = {};
for (const r of readCsv('moves.csv')) {
  if (int(r.generation_id) > MAX_GENERATION || int(r.id) >= 10000 || int(r.type_id) > MAX_TYPE) continue;
  moves[r.id] = {
    name: r.identifier,
    type: int(r.type_id),
    power: optInt(r.power),
    accuracy: optInt(r.accuracy),
    pp: optInt(r.pp),
    category: categories[r.damage_class_id] ?? 'status',
  };
}
writeJson('moves.json', moves);

// ------------------------------------------------------------------- types

const typeNames: Record<string, string> = {};
for (const r of readCsv('types.csv')) if (int(r.id) <= MAX_TYPE) typeNames[r.id] = r.identifier;
const factors = new Map<string, number>();
for (const r of readCsv('type_efficacy.csv')) {
  if (int(r.damage_type_id) > MAX_TYPE || int(r.target_type_id) > MAX_TYPE) continue;
  factors.set(`${r.damage_type_id}>${r.target_type_id}`, int(r.damage_factor));
}
// type_efficacy_past.csv rows give the factor that applied up to and
// including generation_id. For Gen 4 take the row with the smallest
// generation_id >= 4 for each pair.
const pastGen = new Map<string, number>();
for (const r of readCsv('type_efficacy_past.csv')) {
  const gen = int(r.generation_id);
  if (gen < MAX_GENERATION) continue;
  const key = `${r.damage_type_id}>${r.target_type_id}`;
  const prev = pastGen.get(key);
  if (prev === undefined || gen < prev) {
    pastGen.set(key, gen);
    factors.set(key, int(r.damage_factor));
  }
}
const chart: Record<string, Record<string, number>> = {};
for (const [key, factor] of factors) {
  if (factor === 100) continue;
  const [atk, def] = key.split('>') as [string, string];
  (chart[atk] ??= {})[def] = factor / 100;
}
writeJson('types.json', { names: typeNames, chart });

// -------------------------------------------------------------- exp curves

const expCurves: Record<string, number[]> = {};
for (const r of readCsv('experience.csv')) {
  const name = growthNames.get(r.growth_rate_id);
  if (!name) throw new Error(`unknown growth rate ${r.growth_rate_id}`);
  (expCurves[name] ??= [])[int(r.level) - 1] = int(r.experience);
}
for (const [name, curve] of Object.entries(expCurves)) {
  if (curve.length !== 100 || curve.some((v) => v === undefined)) throw new Error(`exp curve ${name} incomplete`);
}
writeJson('exp_curves.json', expCurves);

// -------------------------------------------------------------- evolutions

const triggerNames = new Map(readCsv('evolution_triggers.csv').map((r) => [r.id, r.identifier]));
const itemNames = new Map(readCsv('items.csv').map((r) => [r.id, r.identifier]));
const speciesById = new Map(speciesRows.map((r) => [r.id, r]));
const evolutions: Record<string, unknown[]> = {};
for (const r of readCsv('pokemon_evolution.csv')) {
  const to = speciesById.get(r.evolved_species_id);
  if (!to) continue;
  const from = to.evolves_from_species_id;
  if (!from) throw new Error(`${to.identifier} evolves from nothing`);
  const evo: Record<string, unknown> = { to: int(to.id), trigger: triggerNames.get(r.evolution_trigger_id) ?? 'unknown' };
  const level = optInt(r.minimum_level);
  if (level !== null) evo.level = level;
  if (r.trigger_item_id) evo.item = itemNames.get(r.trigger_item_id) ?? r.trigger_item_id;
  if (r.held_item_id) evo.heldItem = itemNames.get(r.held_item_id) ?? r.held_item_id;
  const happiness = optInt(r.minimum_happiness);
  if (happiness !== null) evo.happiness = happiness;
  if (r.time_of_day) evo.time = r.time_of_day;
  if (r.known_move_id) evo.knownMove = int(r.known_move_id);
  if (r.known_move_type_id) evo.knownMoveType = int(r.known_move_type_id);
  if (r.location_id) evo.location = int(r.location_id);
  if (r.gender_id) evo.gender = int(r.gender_id) === 1 ? 'female' : 'male';
  if (r.party_species_id) evo.partySpecies = int(r.party_species_id);
  if (r.trade_species_id) evo.tradeSpecies = int(r.trade_species_id);
  if (r.relative_physical_stats) evo.relativePhysicalStats = int(r.relative_physical_stats);
  if (r.needs_overworld_rain === '1') evo.rain = true;
  if (r.turn_upside_down === '1') evo.upsideDown = true;
  (evolutions[from] ??= []).push(evo);
}
const chains: Record<string, number[]> = {};
for (const s of speciesRows) (chains[s.evolution_chain_id] ??= []).push(int(s.id));
writeJson('evolutions.json', { ...Object.fromEntries(Object.entries(evolutions).sort((a, b) => int(a[0]) - int(b[0]))), chains });

// -------------------------------------------------------------- encounters

const locations = new Map(readCsv('locations.csv').map((r) => [r.id, r]));
const areas = new Map(readCsv('location_areas.csv').map((r) => [r.id, r]));
const slots = new Map(readCsv('encounter_slots.csv').map((r) => [r.id, r]));
const conditionsByEncounter = new Map<string, string[]>();
for (const r of readCsv('encounter_condition_value_map.csv')) {
  (conditionsByEncounter.get(r.encounter_id) ?? conditionsByEncounter.set(r.encounter_id, []).get(r.encounter_id)!).push(
    r.encounter_condition_value_id,
  );
}

interface EncounterEntry {
  species: number;
  min: number;
  max: number;
  rarity: number;
  time?: string;
}
const encounters: Record<string, { location: string; areaId: number; [method: string]: unknown }> = {};
let dropped = 0;
for (const r of readCsv('encounters.csv')) {
  if (r.version_id !== String(PLATINUM_VERSION)) continue;
  const slot = slots.get(r.encounter_slot_id);
  if (!slot) throw new Error(`unknown slot ${r.encounter_slot_id}`);
  const method = ENCOUNTER_METHODS[slot.encounter_method_id];
  if (!method) continue;
  if (!speciesIds.has(r.pokemon_id)) continue;
  const conds = conditionsByEncounter.get(r.id) ?? [];
  let time: string | undefined;
  let drop = false;
  for (const c of conds) {
    if (TIME_CONDITIONS[c]) time = TIME_CONDITIONS[c];
    else if (!DEFAULT_CONDITIONS.has(c)) drop = true;
  }
  if (drop) {
    dropped++;
    continue;
  }
  const area = areas.get(r.location_area_id);
  const location = area && locations.get(area.location_id);
  if (!area || !location) throw new Error(`unknown area ${r.location_area_id}`);
  const key = area.identifier ? `${location.identifier}/${area.identifier}` : location.identifier;
  const entry = (encounters[key] ??= { location: location.identifier, areaId: int(area.id) });
  const list = (entry[method] ??= []) as EncounterEntry[];
  const e: EncounterEntry = { species: int(r.pokemon_id), min: int(r.min_level), max: int(r.max_level), rarity: int(slot.rarity) };
  if (time) e.time = time;
  list.push(e);
}
// Walk tables normally sum to 100 for each time of day. A few areas do not
// in the source data (the Great Marsh's rotating daily slots, for example);
// list them so irregular tables are known rather than silently accepted.
const irregular: string[] = [];
for (const [key, entry] of Object.entries(encounters)) {
  const walk = entry.walk as EncounterEntry[] | undefined;
  if (!walk) continue;
  for (const time of ['morning', 'day', 'night']) {
    const sum = walk.filter((e) => !e.time || e.time === time).reduce((s, e) => s + e.rarity, 0);
    if (sum !== 100) irregular.push(`${key} (${time}: ${sum})`);
  }
}
if (irregular.length > 0) console.warn(`walk tables not summing to 100: ${irregular.join(', ')}`);
writeJson('encounters.json', Object.fromEntries(Object.entries(encounters).sort((a, b) => a[1].areaId - b[1].areaId)));
console.log(`encounters: ${Object.keys(encounters).length} areas, dropped ${dropped} non-default-condition rows`);
