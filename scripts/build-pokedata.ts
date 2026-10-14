/**
 * One-off build script: reads PokeAPI CSVs (data/v2/csv, see
 * scripts/fetch-pokeapi.sh) and emits compact JSON into src/data/.
 *
 * Run with plain Node 22+: `node scripts/build-pokedata.ts [csvDir] [outDir]`.
 * No dependencies. Output is limited to Gen 1 through 4 and the Gen 4
 * ruleset (Platinum learnsets and encounters, Gen 4 type chart), plus the
 * later species and forms the content needs (EXTRA_SPECIES and FORMS below,
 * the ones scripts/sprite-list.txt ships sprites for).
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
/** Later-generation moves the content names (bosses); added on top of the Gen 1 to 4 table. */
const EXTRA_MOVES = new Set(['psystrike']);
/**
 * Species past Gen 4: Hisui's new evolutions (sprites shipped) and the base
 * species the Hisuian forms belong to (data only, no sprites of their own).
 */
const EXTRA_SPECIES = ['899', '900', '901', '902', '903', '904', '503', '549', '570', '571', '628', '713', '724'];
/**
 * Forms with sprite folders: the PokeAPI pokemon identifier (its 10000+ id
 * becomes the species id in the game) or, for forms PokeAPI has no entry
 * for, a synthetic id with the base species' stats and a flag.
 */
const FORMS: Record<string, { pokemon?: string; synthetic?: { id: number; base: string; name: string; flag: 'shadow' | 'primal' }; formName: string }> = {
  '0058-hisui': { pokemon: 'growlithe-hisui', formName: 'Hisui' },
  '0059-hisui': { pokemon: 'arcanine-hisui', formName: 'Hisui' },
  '0570-hisui': { pokemon: 'zorua-hisui', formName: 'Hisui' },
  '0571-hisui': { pokemon: 'zoroark-hisui', formName: 'Hisui' },
  '0215-hisui': { pokemon: 'sneasel-hisui', formName: 'Hisui' },
  '0211-hisui': { pokemon: 'qwilfish-hisui', formName: 'Hisui' },
  '0100-hisui': { pokemon: 'voltorb-hisui', formName: 'Hisui' },
  '0101-hisui': { pokemon: 'electrode-hisui', formName: 'Hisui' },
  '0549-hisui': { pokemon: 'lilligant-hisui', formName: 'Hisui' },
  '0628-hisui': { pokemon: 'braviary-hisui', formName: 'Hisui' },
  '0713-hisui': { pokemon: 'avalugg-hisui', formName: 'Hisui' },
  '0157-hisui': { pokemon: 'typhlosion-hisui', formName: 'Hisui' },
  '0503-hisui': { pokemon: 'samurott-hisui', formName: 'Hisui' },
  '0724-hisui': { pokemon: 'decidueye-hisui', formName: 'Hisui' },
  '0448-mega': { pokemon: 'lucario-mega', formName: 'Mega' },
  '0359-mega': { pokemon: 'absol-mega', formName: 'Mega' },
  '0229-mega': { pokemon: 'houndoom-mega', formName: 'Mega' },
  '0065-mega': { pokemon: 'alakazam-mega', formName: 'Mega' },
  '0208-mega': { pokemon: 'steelix-mega', formName: 'Mega' },
  '0362-mega': { pokemon: 'glalie-mega', formName: 'Mega' },
  '0142-mega': { pokemon: 'aerodactyl-mega', formName: 'Mega' },
  '0475-mega': { pokemon: 'gallade-mega', formName: 'Mega' },
  '0428-mega': { pokemon: 'lopunny-mega', formName: 'Mega' },
  '0308-mega': { pokemon: 'medicham-mega', formName: 'Mega' },
  '0334-mega': { pokemon: 'altaria-mega', formName: 'Mega' },
  '0381-mega': { pokemon: 'latios-mega', formName: 'Mega' },
  '0282-mega': { pokemon: 'gardevoir-mega', formName: 'Mega' },
  '0094-mega': { pokemon: 'gengar-mega', formName: 'Mega' },
  '0115-mega': { pokemon: 'kangaskhan-mega', formName: 'Mega' },
  '0227-mega': { pokemon: 'skarmory-mega', formName: 'Mega' },
  '0487-origin': { pokemon: 'giratina-origin', formName: 'Origin' },
  '0483-origin': { pokemon: 'dialga-origin', formName: 'Origin' },
  '0484-origin': { pokemon: 'palkia-origin', formName: 'Origin' },
  '0492-sky': { pokemon: 'shaymin-sky', formName: 'Sky' },
  '0150-shadow': { synthetic: { id: 20150, base: 'mewtwo', name: 'mewtwo-shadow', flag: 'shadow' }, formName: 'Shadow' },
  '0249-shadow': { synthetic: { id: 20249, base: 'lugia', name: 'lugia-shadow', flag: 'shadow' }, formName: 'Shadow' },
  '0483-primal': { synthetic: { id: 20483, base: 'dialga', name: 'dialga-primal', flag: 'primal' }, formName: 'Primal' },
};
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

const allSpeciesRows = readCsv('pokemon_species.csv');
const speciesRows = allSpeciesRows.filter((r) => int(r.generation_id) <= MAX_GENERATION || EXTRA_SPECIES.includes(r.id));
const speciesIds = new Set(speciesRows.map((r) => r.id));
if (speciesIds.size !== MAX_SPECIES + EXTRA_SPECIES.length) throw new Error(`expected ${MAX_SPECIES + EXTRA_SPECIES.length} species, got ${speciesIds.size}`);
const speciesRowById = new Map(allSpeciesRows.map((r) => [r.id, r]));

const growthNames = new Map(readCsv('growth_rates.csv').map((r) => [r.id, r.identifier]));
const statKeys: Record<string, string> = { '1': 'hp', '2': 'atk', '3': 'def', '4': 'spa', '5': 'spd', '6': 'spe' };

const baseStats = new Map<string, Record<string, number>>();
const allPokemonRows = readCsv('pokemon.csv');
const pokemonByName = new Map(allPokemonRows.map((r) => [r.identifier, r]));
const formPokemonIds = new Set<string>();
for (const f of Object.values(FORMS)) {
  if (!f.pokemon) continue;
  const row = pokemonByName.get(f.pokemon);
  if (!row) throw new Error(`form ${f.pokemon} is not in pokemon.csv`);
  formPokemonIds.add(row.id);
}
const wantedPokemon = (id: string): boolean => speciesIds.has(id) || formPokemonIds.has(id);
for (const r of readCsv('pokemon_stats.csv')) {
  if (!wantedPokemon(r.pokemon_id)) continue; // default forms share the species id
  const key = statKeys[r.stat_id];
  if (!key) continue;
  const entry = baseStats.get(r.pokemon_id) ?? {};
  entry[key] = int(r.base_stat);
  baseStats.set(r.pokemon_id, entry);
}
const typesByPokemon = new Map<string, number[]>();
for (const r of readCsv('pokemon_types.csv')) {
  if (!wantedPokemon(r.pokemon_id)) continue;
  const list = typesByPokemon.get(r.pokemon_id) ?? [];
  list[int(r.slot) - 1] = int(r.type_id);
  typesByPokemon.set(r.pokemon_id, list);
}
const pokemonRows = new Map(allPokemonRows.filter((r) => wantedPokemon(r.id)).map((r) => [r.id, r]));

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

// Forms: PokeAPI's 10000+ ids (or synthetic ones) with the base species'
// catch rate and growth, their own stats and types (types past the Gen 4
// chart fall back to the base species'), and the sprite folder.
const spriteFolders = JSON.parse(readFileSync(resolve(here, '../src/data/spriteFolders.json'), 'utf8')) as Record<string, { species?: number; form?: string }>;
const formIds = new Map<string, string>(); // game id -> pokemon.csv id for learnsets
for (const [folder, f] of Object.entries(FORMS)) {
  if (!spriteFolders[folder]) throw new Error(`form folder ${folder} is not in spriteFolders.json`);
  const [dex, form] = folder.split('-') as [string, string];
  const baseId = String(int(dex));
  const base = pokemon[baseId] as Record<string, unknown> | undefined;
  const baseSpecies = speciesRowById.get(baseId);
  if (!base || !baseSpecies) throw new Error(`form ${folder}: base species ${baseId} missing`);
  let id: string;
  let name: string;
  let stats: Record<string, number>;
  let types: number[];
  let flag: Record<string, boolean> = {};
  if (f.synthetic) {
    id = String(f.synthetic.id);
    name = f.synthetic.name;
    stats = (base.base as Record<string, number>);
    types = base.types as number[];
    flag = { [f.synthetic.flag]: true };
  } else {
    const row = pokemonByName.get(f.pokemon as string) as Row;
    id = row.id;
    name = row.identifier;
    const own = baseStats.get(row.id);
    const ownTypes = typesByPokemon.get(row.id);
    if (!own || !ownTypes) throw new Error(`form ${folder}: incomplete stats or types`);
    for (const k of Object.values(statKeys)) if (own[k] === undefined) throw new Error(`form ${folder}: missing ${k}`);
    stats = own;
    types = ownTypes.some((t) => t > MAX_TYPE) ? (base.types as number[]) : ownTypes;
    formIds.set(id, row.id);
  }
  pokemon[id] = {
    name,
    gen: int(baseSpecies.generation_id),
    types,
    base: { hp: stats.hp, atk: stats.atk, def: stats.def, spa: stats.spa, spd: stats.spd, spe: stats.spe },
    growth: base.growth,
    catchRate: base.catchRate,
    baseExp: f.synthetic ? base.baseExp : (optInt((pokemonRows.get(id) as Row).base_experience) ?? (base.baseExp as number)),
    baseHappiness: base.baseHappiness,
    evolvesFrom: 0,
    chain: base.chain,
    species: int(baseId),
    form,
    formName: f.formName,
    folder,
    ...flag,
  };
}
writeJson('pokemon.json', pokemon);

// --------------------------------------------------------------- learnsets

const learnsets: Record<string, [number, number][]> = {};
// Later species and forms: every level-up row by version group, resolved below.
const laterMoves = new Map<string, Map<number, [number, number][]>>();
const movesCsv = readCsv('moves.csv');
// Moves that became Fairy-type later (Sweet Kiss, Charm, Moonlight) were Normal in Gen 4.
const gen4Type = (r: Row): number => (int(r.type_id) > MAX_TYPE ? 1 : int(r.type_id));
const knownMoveIds = new Set(movesCsv.filter((r) => (int(r.generation_id) <= MAX_GENERATION && int(r.id) < 10000) || EXTRA_MOVES.has(r.identifier)).map((r) => r.id));
for (const r of readCsv('pokemon_moves.csv')) {
  if (r.pokemon_move_method_id !== String(LEVEL_UP_METHOD)) continue;
  if (r.version_group_id === String(PLATINUM_VERSION_GROUP) && speciesIds.has(r.pokemon_id)) {
    (learnsets[r.pokemon_id] ??= []).push([int(r.level), int(r.move_id)]);
  }
  if (EXTRA_SPECIES.includes(r.pokemon_id) || formPokemonIds.has(r.pokemon_id)) {
    const byGroup = laterMoves.get(r.pokemon_id) ?? laterMoves.set(r.pokemon_id, new Map()).get(r.pokemon_id)!;
    const vg = int(r.version_group_id);
    (byGroup.get(vg) ?? byGroup.set(vg, []).get(vg)!).push([int(r.level), int(r.move_id)]);
  }
}
/** The newest version group's level-up moves that exist in the Gen 4 table, or none. */
function newestKnownLearnset(pokemonId: string): [number, number][] {
  const byGroup = laterMoves.get(pokemonId);
  if (!byGroup) return [];
  for (const vg of [...byGroup.keys()].sort((a, b) => b - a)) {
    const list = (byGroup.get(vg) ?? []).filter(([, move]) => knownMoveIds.has(String(move)));
    if (list.some(([, move]) => { const m = movesCsv.find((r) => r.id === String(move)); return m && optInt(m.power) !== null; })) return list;
  }
  return [];
}
for (const id of EXTRA_SPECIES) {
  const list = newestKnownLearnset(id);
  if (list.length === 0) throw new Error(`species ${id} has no usable level-up moves`);
  learnsets[id] = list;
}
for (const [gameId, entry] of Object.entries(pokemon)) {
  const e = entry as { species?: number };
  if (e.species === undefined || learnsets[gameId]) continue; // base species, or done above
  const csvId = formIds.get(gameId);
  const own = csvId ? newestKnownLearnset(csvId) : [];
  learnsets[gameId] = own.length > 0 ? own : [...(learnsets[String(e.species)] ?? [])];
}
for (const id of Object.keys(pokemon)) {
  const list = learnsets[id];
  if (!list || list.length === 0) throw new Error(`species ${id} has no level-up moves`);
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
writeJson('learnsets.json', Object.fromEntries(Object.entries(learnsets).sort((a, b) => int(a[0]) - int(b[0]))));

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
const speciesById = new Map(speciesRows.map((r) => [r.id, r]));
// Hisui's evolutions (Stantler -> Wyrdeer and the rest) need PLA mechanics; leave the chains as Gen 4 has them.
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
