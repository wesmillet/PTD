// Build src/data/spriteIndex.json from SpriteCollab's tracker.json.
// Usage: node scripts/build-sprite-index.mjs <tracker.json> <out.json>
//
// Only Pokémon whose folder exists under public/assets/sprites/ are included,
// so the bundled index stays tiny. tracker.json itself is never shipped.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [trackerPath, outPath] = process.argv.slice(2);
if (!trackerPath || !outPath) {
  console.error('usage: build-sprite-index.mjs <tracker.json> <out.json>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spriteRoot = resolve(root, 'public/assets/sprites');
const present = new Set(
  existsSync(spriteRoot) ? readdirSync(spriteRoot).filter((d) => /^\d{4}$/.test(d)) : [],
);

const tracker = JSON.parse(readFileSync(trackerPath, 'utf8'));
const index = {};
for (const dex of [...present].sort()) {
  const entry = tracker[dex];
  if (!entry || !entry.name) {
    console.warn(`tracker.json has no entry for ${dex}`);
    continue;
  }
  index[entry.name.toLowerCase()] = dex;
}

writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${outPath} with ${Object.keys(index).length} entries`);

// Which optional assets each folder has, so the loader can skip missing ones.
const foldersPath = resolve(dirname(outPath), 'spriteFolders.json');
const folders = {};
for (const dex of [...present].sort()) {
  const shiny = existsSync(resolve(spriteRoot, dex, 'shiny', 'AnimData.xml'));
  const portraitDir = resolve(root, 'public/assets/portraits', dex);
  const portraits = existsSync(portraitDir) ? readdirSync(portraitDir).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')).sort() : [];
  folders[dex] = { shiny, portraits };
}
writeFileSync(foldersPath, JSON.stringify(folders, null, 2) + '\n');
console.log(`wrote ${foldersPath}`);

// Credits: every credits.txt shipped under public/assets, with SpriteCollab
// credit ids resolved to names via credit_names.txt (kept in assets-src).
const creditNamesPath = process.argv[4] ?? resolve(root, 'assets-src/spritecollab/credit_names.txt');
const creditNames = new Map();
if (existsSync(creditNamesPath)) {
  for (const line of readFileSync(creditNamesPath, 'utf8').split('\n').slice(1)) {
    const [name, discord] = line.split('\t');
    if (name && discord) creditNames.set(discord.trim(), name.trim());
  }
}
const resolveName = (id) => creditNames.get(id) ?? id.replace(/^<@!?(\d+)>$/, 'Discord user $1');
const readCredits = (file) => {
  if (!existsSync(file)) return [];
  const names = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 2 || !cols[1]) continue;
    const name = resolveName(cols[1].trim());
    if (!names.includes(name)) names.push(name);
  }
  return names;
};
const credits = { source: 'PMDCollab SpriteCollab (https://github.com/PMDCollab/SpriteCollab)', pokemon: [] };
for (const dex of [...present].sort()) {
  const entry = tracker[dex];
  credits.pokemon.push({
    dex,
    name: entry?.name ?? dex,
    sprite: readCredits(resolve(spriteRoot, dex, 'credits.txt')),
    shiny: readCredits(resolve(spriteRoot, dex, 'shiny', 'credits.txt')),
    portrait: readCredits(resolve(root, 'public/assets/portraits', dex, 'credits.txt')),
  });
}
const creditsPath = resolve(dirname(outPath), 'credits.json');
writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');
console.log(`wrote ${creditsPath} for ${credits.pokemon.length} Pokémon`);
