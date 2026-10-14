// Writes src/data/showcase.json: the curated PC collection a new save gets
// in demo mode (config.json "demoMode"). Levels 20 to 60, shinies first so
// they fill Box 1, movesets as the Platinum learnset would give at that
// level. Deterministic (seeded) so the file only changes when the list does.
// Usage: node scripts/build-showcase.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(resolve(root, 'src/data', f), 'utf8'));
const pokemon = read('pokemon.json');
const learnsets = read('learnsets.json');
const evolutions = read('evolutions.json');
const byName = new Map(Object.entries(pokemon).map(([id, p]) => [p.name, Number(id)]));

const LIST = `Charizard, Blastoise, Venusaur, Pikachu, Gengar*, Dragonite, Gyarados*, Lapras, Snorlax, Arcanine, Ninetales*, Scizor*, Heracross, Tyranitar, Umbreon*, Espeon, Houndoom, Blaziken, Sceptile, Swampert, Gardevoir*, Absol, Aggron, Salamence, Metagross*, Milotic, Flygon, Torterra, Infernape, Empoleon, Luxray*, Staraptor, Lucario*, Garchomp*, Togekiss, Weavile, Honchkrow, Spiritomb, Rhyperior, Electivire, Magmortar, Gible, Riolu*, Eevee*`;

// mulberry32, same generator as src/sim/rng.ts.
let seed = 0x5eed;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/** Lowest level the species is reached by level evolution (so a L20 Charizard is not generated). */
function minLevel(id) {
  let best = 1;
  for (const [from, list] of Object.entries(evolutions)) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (e.to === id && e.trigger === 'level-up' && e.level) best = Math.max(best, e.level, minLevel(Number(from)));
    }
  }
  return best;
}

/** The last four level-up moves known at `level` (same rule as src/sim/moves.ts startingMoves). */
function movesAt(id, level) {
  const known = [];
  for (const [learnLevel, moveId] of learnsets[String(id)] ?? []) {
    if (learnLevel > level) break;
    const i = known.indexOf(moveId);
    if (i >= 0) known.splice(i, 1);
    known.push(moveId);
  }
  return known.slice(-4);
}

const entries = LIST.split(',').map((s) => s.trim()).map((s) => {
  const shiny = s.endsWith('*');
  const name = s.replace('*', '').toLowerCase();
  const id = byName.get(name);
  if (!id) throw new Error(`unknown species ${name}`);
  return { name, id, shiny };
});

const out = [];
for (const e of entries) {
  const floor = Math.max(20, minLevel(e.id));
  const level = Math.min(60, between(floor, 60));
  out.push({ species: e.id, level, shiny: e.shiny, moves: movesAt(e.id, level) });
}
// Shinies first so they fill Box 1 in order; the rest keep the list's order.
out.sort((a, b) => Number(b.shiny) - Number(a.shiny));
writeFileSync(resolve(root, 'src/data/showcase.json'), JSON.stringify({ pokemon: out }, null, 2) + '\n');
console.log(`wrote src/data/showcase.json: ${out.length} Pokémon, ${out.filter((p) => p.shiny).length} shiny, levels ${Math.min(...out.map((p) => p.level))}-${Math.max(...out.map((p) => p.level))}`);
