/**
 * One-off build script: reads PokeAPI CSVs (data/v2/csv, see
 * scripts/fetch-pokeapi.sh) and emits compact JSON into src/data/.
 *
 * Run with plain Node 22+: `node scripts/build-pokedata.ts [csvDir] [outDir]`.
 * No dependencies. The species set is exactly the sprite folders in
 * src/data/spriteFolders.json (base species and forms of every
 * generation); Gen 1 to 4 species keep their Platinum learnsets, later
 * ones take the newest version group they appear in, and every move those
 * learnsets use is emitted. The ruleset stays Gen 4: Platinum encounters
 * and the Gen 4 type chart (Fairy maps to Normal).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const csvDir = resolve(process.argv[2] ?? process.env.POKEAPI_DIR ?? '/tmp/pokeapi', 'data/v2/csv');
const outDir = resolve(process.argv[3] ?? resolve(here, '../src/data'));

const MAX_GENERATION = 4;
const MAX_TYPE = 17; // normal .. dark; no fairy, stellar, unknown, shadow
/** Moves the content names that no shipped learnset carries (bosses). */
const EXTRA_MOVES = new Set(['psystrike']);
/**
 * Forms PokeAPI has no entry for: a synthetic id with the base species'
 * stats and a flag. Every other form folder resolves to the PokeAPI pokemon
 * "<species>-<form>" (growlithe-hisui, lucario-mega, giratina-origin).
 */
const SYNTHETIC_FORMS: Record<string, { id: number; name: string; flag: 'shadow' | 'primal' }> = {
  '0150-shadow': { id: 20150, name: 'mewtwo-shadow', flag: 'shadow' },
  '0249-shadow': { id: 20249, name: 'lugia-shadow', flag: 'shadow' },
  '0483-primal': { id: 20483, name: 'dialga-primal', flag: 'primal' },
};
const FORM_NAMES: Record<string, string> = { hisui: 'Hisui', mega: 'Mega', origin: 'Origin', sky: 'Sky', shadow: 'Shadow', primal: 'Primal' };
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

const spriteFolders = JSON.parse(readFileSync(resolve(here, '../src/data/spriteFolders.json'), 'utf8')) as Record<string, { species?: number; form?: string }>;
const folderNames = Object.keys(spriteFolders).sort();
const allSpeciesRows = readCsv('pokemon_species.csv');
const speciesRowById = new Map(allSpeciesRows.map((r) => [r.id, r]));
const growthNames = new Map(readCsv('growth_rates.csv').map((r) => [r.id, r.identifier]));
const statKeys: Record<string, string> = { '1': 'hp', '2': 'atk', '3': 'def', '4': 'spa', '5': 'spd', '6': 'spe' };
const allPokemonRows = readCsv('pokemon.csv');
const pokemonByName = new Map(allPokemonRows.map((r) => [r.identifier, r]));
const pokemonRowById = new Map(allPokemonRows.map((r) => [r.id, r]));

/** Base species folders ("0387") and form folders ("0058-hisui") resolved to PokeAPI rows. */
const baseFolders = folderNames.filter((f) => !f.includes('-'));
const formFolders = folderNames.filter((f) => f.includes('-'));
const speciesIds = new Set(baseFolders.map((f) => String(int(f))));
for (const id of speciesIds) if (!speciesRowById.has(id)) throw new Error(`folder ${id} is not a species in pokemon_species.csv`);
/** pokemon.csv ids whose stats, types and moves are needed: base species and the PokeAPI forms. */
const formPokemonRow = new Map<string, Row>(); // folder -> pokemon.csv row
for (const folder of formFolders) {
  if (SYNTHETIC_FORMS[folder]) continue;
  const [dex, form] = folder.split('-') as [string, string];
  const species = speciesRowById.get(String(int(dex)));
  if (!species) throw new Error(`form folder ${folder}: no species ${int(dex)}`);
  const row = pokemonByName.get(`${species.identifier}-${form}`);
  if (!row) throw new Error(`form folder ${folder}: ${species.identifier}-${form} is not in pokemon.csv`);
  formPokemonRow.set(folder, row);
}
const wantedPokemon = new Set<string>([...speciesIds, ...[...formPokemonRow.values()].map((r) => r.id)]);
// Base species of form folders whose own folder is missing (Zorua for 0570-hisui): data for the form only.
for (const folder of formFolders) {
  const [dex] = folder.split('-') as [string];
  wantedPokemon.add(String(int(dex)));
}

const baseStats = new Map<string, Record<string, number>>();
for (const r of readCsv('pokemon_stats.csv')) {
  if (!wantedPokemon.has(r.pokemon_id)) continue; // default forms share the species id
  const key = statKeys[r.stat_id];
  if (!key) continue;
  const entry = baseStats.get(r.pokemon_id) ?? {};
  entry[key] = int(r.base_stat);
  baseStats.set(r.pokemon_id, entry);
}
const typesByPokemon = new Map<string, number[]>();
for (const r of readCsv('pokemon_types.csv')) {
  if (!wantedPokemon.has(r.pokemon_id)) continue;
  const list = typesByPokemon.get(r.pokemon_id) ?? [];
  list[int(r.slot) - 1] = int(r.type_id);
  typesByPokemon.set(r.pokemon_id, list);
}
/** Types past the Gen 4 chart: a Fairy slot is dropped from a dual type and becomes Normal on a pure Fairy. */
const gen4Types = (types: number[]): number[] => {
  const kept = types.filter((t) => t <= MAX_TYPE);
  return kept.length > 0 ? kept : [1];
};
const stats6 = (id: string, where: string): Record<string, number> => {
  const own = baseStats.get(id);
  if (!own) throw new Error(`${where}: no stats`);
  for (const k of Object.values(statKeys)) if (own[k] === undefined) throw new Error(`${where}: missing ${k}`);
  return { hp: own.hp!, atk: own.atk!, def: own.def!, spa: own.spa!, spd: own.spd!, spe: own.spe! };
};
const isLegendary = (s: Row): boolean => s.is_legendary === '1' || s.is_mythical === '1';

const pokemon: Record<string, unknown> = {};
for (const id of [...speciesIds].sort((a, b) => int(a) - int(b))) {
  const s = speciesRowById.get(id)!;
  const p = pokemonRowById.get(id);
  const types = typesByPokemon.get(id);
  if (!p || !types) throw new Error(`incomplete data for species ${id}`);
  const from = optInt(s.evolves_from_species_id) ?? 0;
  pokemon[id] = {
    name: s.identifier,
    gen: int(s.generation_id),
    types: gen4Types(types),
    base: stats6(id, `species ${id}`),
    growth: growthNames.get(s.growth_rate_id) ?? `unknown-${s.growth_rate_id}`,
    catchRate: int(s.capture_rate),
    baseExp: optInt(p.base_experience) ?? 150,
    baseHappiness: optInt(s.base_happiness) ?? 70,
    evolvesFrom: speciesIds.has(String(from)) ? from : 0,
    chain: int(s.evolution_chain_id),
    ...(isLegendary(s) ? { legendary: true } : {}),
  };
}

// Forms: PokeAPI's 10000+ ids (or synthetic ones) with the base species'
// catch rate and growth, their own stats and types, and the sprite folder.
const formIds = new Map<string, string>(); // game id -> pokemon.csv id for learnsets
for (const folder of formFolders) {
  const [dex, form] = folder.split('-') as [string, string];
  const baseId = String(int(dex));
  const baseSpecies = speciesRowById.get(baseId);
  const basePokemon = pokemonRowById.get(baseId);
  if (!baseSpecies || !basePokemon) throw new Error(`form ${folder}: base species ${baseId} missing`);
  const synthetic = SYNTHETIC_FORMS[folder];
  let id: string;
  let name: string;
  let stats: Record<string, number>;
  let types: number[];
  let baseExp: number;
  let flag: Record<string, boolean> = {};
  if (synthetic) {
    id = String(synthetic.id);
    name = synthetic.name;
    stats = stats6(baseId, `form ${folder}`);
    types = gen4Types(typesByPokemon.get(baseId) ?? [1]);
    baseExp = optInt(basePokemon.base_experience) ?? 150;
    flag = { [synthetic.flag]: true };
  } else {
    const row = formPokemonRow.get(folder)!;
    id = row.id;
    name = row.identifier;
    stats = stats6(row.id, `form ${folder}`);
    const own = typesByPokemon.get(row.id);
    if (!own) throw new Error(`form ${folder}: no types`);
    types = gen4Types(own);
    baseExp = optInt(row.base_experience) ?? optInt(basePokemon.base_experience) ?? 150;
    formIds.set(id, row.id);
  }
  if (pokemon[id]) throw new Error(`form ${folder}: id ${id} is taken`);
  pokemon[id] = {
    name,
    gen: int(baseSpecies.generation_id),
    types,
    base: stats,
    growth: growthNames.get(baseSpecies.growth_rate_id) ?? `unknown-${baseSpecies.growth_rate_id}`,
    catchRate: int(baseSpecies.capture_rate),
    baseExp,
    baseHappiness: optInt(baseSpecies.base_happiness) ?? 70,
    evolvesFrom: 0,
    chain: int(baseSpecies.evolution_chain_id),
    species: int(baseId),
    form,
    formName: FORM_NAMES[form] ?? form.charAt(0).toUpperCase() + form.slice(1),
    folder,
    ...(isLegendary(baseSpecies) ? { legendary: true } : {}),
    ...flag,
  };
}
writeJson('pokemon.json', pokemon);

// --------------------------------------------------------------- learnsets

// Version groups ranked newest first by generation, then by their order.
const versionGroupRank = new Map<number, number>();
for (const r of readCsv('version_groups.csv')) versionGroupRank.set(int(r.id), int(r.generation_id) * 1000 + int(r.order));
const learnsets: Record<string, [number, number][]> = {};
const levelUpRows = new Map<string, Map<number, [number, number][]>>(); // pokemon.csv id -> version group -> rows
for (const r of readCsv('pokemon_moves.csv')) {
  if (r.pokemon_move_method_id !== String(LEVEL_UP_METHOD)) continue;
  if (!wantedPokemon.has(r.pokemon_id)) continue;
  const byGroup = levelUpRows.get(r.pokemon_id) ?? levelUpRows.set(r.pokemon_id, new Map()).get(r.pokemon_id)!;
  const vg = int(r.version_group_id);
  (byGroup.get(vg) ?? byGroup.set(vg, []).get(vg)!).push([int(r.level), int(r.move_id)]);
}
/** Platinum's level-up moves for a Gen 1 to 4 Pokémon, else the newest version group it appears in. */
function learnsetFor(pokemonId: string, generation: number): [number, number][] {
  const byGroup = levelUpRows.get(pokemonId);
  if (!byGroup) return [];
  if (generation <= MAX_GENERATION && byGroup.has(PLATINUM_VERSION_GROUP)) return byGroup.get(PLATINUM_VERSION_GROUP)!;
  const newest = [...byGroup.keys()].sort((a, b) => (versionGroupRank.get(b) ?? 0) - (versionGroupRank.get(a) ?? 0))[0];
  return newest === undefined ? [] : byGroup.get(newest)!;
}
for (const [gameId, entry] of Object.entries(pokemon)) {
  const e = entry as { species?: number; gen: number };
  const csvId = e.species === undefined ? gameId : formIds.get(gameId);
  let list = csvId ? learnsetFor(csvId, e.gen) : [];
  if (list.length === 0 && e.species !== undefined) list = learnsetFor(String(e.species), e.gen); // synthetic forms: the base species' moves
  if (list.length === 0) throw new Error(`species ${gameId} has no level-up moves`);
  learnsets[gameId] = [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
writeJson('learnsets.json', Object.fromEntries(Object.entries(learnsets).sort((a, b) => int(a[0]) - int(b[0]))));

// Moves: the Gen 1 to 4 table plus every move a shipped learnset uses (and the content's extras).
const movesCsv = readCsv('moves.csv');
// Moves of a type past the Gen 4 chart (Fairy) count as Normal.
const gen4Type = (r: Row): number => (int(r.type_id) > MAX_TYPE ? 1 : int(r.type_id));
const usedMoveIds = new Set<string>();
for (const list of Object.values(learnsets)) for (const [, move] of list) usedMoveIds.add(String(move));
const knownMoveIds = new Set(movesCsv.filter((r) => int(r.id) < 10000 && (int(r.generation_id) <= MAX_GENERATION || usedMoveIds.has(r.id) || EXTRA_MOVES.has(r.identifier))).map((r) => r.id));
for (const id of usedMoveIds) if (!knownMoveIds.has(id)) throw new Error(`learnset move ${id} is not in moves.csv`);

// ------------------------------------------------------------------- moves

const categories: Record<string, string> = { '1': 'status', '2': 'physical', '3': 'special' };
const targetNames = new Map(readCsv('move_targets.csv').map((r) => [r.id, r.identifier]));
const metaCategories = new Map(readCsv('move_meta_categories.csv').map((r) => [r.id, r.identifier]));
const ailmentNames = new Map(readCsv('move_meta_ailments.csv').map((r) => [r.id, r.identifier]));
const meta = new Map(readCsv('move_meta.csv').map((r) => [r.move_id, r]));
const stageStatKeys: Record<string, string> = { ...statKeys, '7': 'accuracy', '8': 'evasion' };
const statChanges = new Map<string, { stat: string; change: number }[]>();
for (const r of readCsv('move_meta_stat_changes.csv')) {
  const stat = stageStatKeys[r.stat_id];
  if (!stat) continue;
  (statChanges.get(r.move_id) ?? statChanges.set(r.move_id, []).get(r.move_id)!).push({ stat, change: int(r.change) });
}
const moves: Record<string, unknown> = {};
for (const r of movesCsv) {
  if (!knownMoveIds.has(r.id)) continue;
  const m = meta.get(r.id);
  const minHits = m ? optInt(m.min_hits) : null;
  const maxHits = m ? optInt(m.max_hits) : null;
  moves[r.id] = {
    name: r.identifier,
    type: gen4Type(r),
    power: optInt(r.power),
    accuracy: optInt(r.accuracy),
    pp: optInt(r.pp),
    category: categories[r.damage_class_id] ?? 'status',
    priority: optInt(r.priority) ?? 0,
    target: targetNames.get(r.target_id) ?? 'selected-pokemon',
    effect: {
      kind: (m && metaCategories.get(m.meta_category_id)) ?? 'damage',
      ailment: (m && ailmentNames.get(m.meta_ailment_id)) ?? 'none',
      ailmentChance: m ? optInt(m.ailment_chance) ?? 0 : 0,
      flinchChance: m ? optInt(m.flinch_chance) ?? 0 : 0,
      statChance: m ? optInt(m.stat_chance) ?? 0 : 0,
      stats: statChanges.get(r.id) ?? [],
      drain: m ? optInt(m.drain) ?? 0 : 0,
      healing: m ? optInt(m.healing) ?? 0 : 0,
      critRate: m ? optInt(m.crit_rate) ?? 0 : 0,
      hits: minHits !== null && maxHits !== null ? [minHits, maxHits] : null,
    },
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
// Only pairs where both species ship (a Vaporeon without sprites is not offered to Eevee).
const evolutions: Record<string, unknown[]> = {};
for (const r of readCsv('pokemon_evolution.csv')) {
  if (!speciesIds.has(r.evolved_species_id)) continue;
  const to = speciesRowById.get(r.evolved_species_id)!;
  const from = to.evolves_from_species_id;
  if (!from) throw new Error(`${to.identifier} evolves from nothing`);
  if (!speciesIds.has(from)) continue;
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
for (const id of [...speciesIds].sort((a, b) => int(a) - int(b))) {
  const row = speciesRowById.get(id)!;
  (chains[row.evolution_chain_id] ??= []).push(int(id));
}
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
