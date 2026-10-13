// Prints the dex folder numbers for every species that can appear in any
// level (all times of day), their full evolution lines, the starters and the
// debug party, so scripts/fetch-sprites.sh can pull them all.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(resolve(root, 'src/data', f), 'utf8'));
const levels = read('levels.json');
const encounters = read('encounters.json');
const pokemon = read('pokemon.json');
const evolutions = read('evolutions.json');
const party = read('party-debug.json');

const species = new Set([387, 390, 393]);
for (const def of Object.values(levels)) {
  const area = encounters[def.area];
  if (!area) throw new Error(`no encounter area ${def.area}`);
  for (const e of area.walk ?? []) species.add(e.species);
}
for (const p of party.party) species.add(p.species);
const lines = new Set();
for (const id of species) for (const member of evolutions.chains[String(pokemon[String(id)].chain)] ?? [id]) lines.add(member);
console.log([...lines].sort((a, b) => a - b).map((id) => String(id).padStart(4, '0')).join(' '));
