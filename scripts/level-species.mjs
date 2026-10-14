// Prints the dex folder numbers for every species that can appear in any
// level (rosters, or the area walk tables for levels without one, plus
// trainer parties with every possible rival starter), their full evolution
// lines, the starters and the debug party, so scripts/fetch-sprites.sh and
// scripts/fetch-icons.sh can pull them all.
// Usage: node scripts/level-species.mjs [--ids]   (--ids prints plain numbers)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(resolve(root, 'src/data', f), 'utf8'));
const levels = read('levels/00-opening.json');
const encounters = read('encounters.json');
const pokemon = read('pokemon.json');
const evolutions = read('evolutions.json');
const party = read('party-debug.json');

const byName = new Map(Object.entries(pokemon).map(([id, p]) => [p.name, Number(id)]));
const idOf = (name) => {
  const id = byName.get(name);
  if (!id) throw new Error(`unknown species ${name}`);
  return id;
};

const STARTERS = [387, 390, 393];
const species = new Set(STARTERS);
for (const def of Object.values(levels)) {
  if (def.roster) {
    for (const e of def.roster) species.add(idOf(e.species));
  } else {
    const area = encounters[def.area];
    if (!area) throw new Error(`no encounter area ${def.area}`);
    for (const e of area.walk ?? []) species.add(e.species);
  }
  for (const p of def.trainer?.party ?? []) {
    if (p.species === 'counter-starter') continue; // a starter; already included
    species.add(idOf(p.species));
  }
}
for (const p of party.party) species.add(p.species);
const lines = new Set();
for (const id of species) for (const member of evolutions.chains[String(pokemon[String(id)].chain)] ?? [id]) lines.add(member);
const sorted = [...lines].sort((a, b) => a - b);
console.log(process.argv.includes('--ids') ? sorted.join(' ') : sorted.map((id) => String(id).padStart(4, '0')).join(' '));
