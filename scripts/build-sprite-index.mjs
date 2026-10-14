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
// Folders are `0058` (base form) or `0058-hisui` (a tracker.json subgroup,
// slugified: lower case, underscores to dashes), see scripts/fetch-sprites.py.
const present = new Set(
  existsSync(spriteRoot) ? readdirSync(spriteRoot).filter((d) => /^\d{4}(-[a-z0-9-]+)?$/.test(d)) : [],
);

const tracker = JSON.parse(readFileSync(trackerPath, 'utf8'));
const slugify = (name) => name.toLowerCase().replace(/[_ ]/g, '-');
/** The tracker node for a folder: the species entry, or the named subgroup. */
function trackerNode(folder) {
  const [dex, form] = folder.split(/-(.+)/);
  const entry = tracker[dex];
  if (!entry || !form) return { entry, node: entry, dex, form: null };
  const find = (node) => {
    for (const sub of Object.values(node.subgroups ?? {})) {
      if (sub.name && slugify(sub.name) === form) return sub;
      const deeper = find(sub);
      if (deeper) return deeper;
    }
    return null;
  };
  return { entry, node: find(entry), dex, form };
}
const index = {};
for (const folder of [...present].sort()) {
  const { entry, node, form } = trackerNode(folder);
  if (!entry || !entry.name || !node) {
    console.warn(`tracker.json has no entry for ${folder}`);
    continue;
  }
  index[slugify(entry.name) + (form ? `-${form}` : '')] = folder;
}

writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${outPath} with ${Object.keys(index).length} entries`);

// Which optional assets each folder has, so the loader can skip missing ones.
const foldersPath = resolve(dirname(outPath), 'spriteFolders.json');
const folders = {};
for (const folder of [...present].sort()) {
  const { dex, form, node } = trackerNode(folder);
  const shiny = existsSync(resolve(spriteRoot, folder, 'shiny', 'AnimData.xml'));
  const portraitDir = resolve(root, 'public/assets/portraits', folder);
  const portraits = existsSync(portraitDir) ? readdirSync(portraitDir).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')).sort() : [];
  const shinyPortraitDir = resolve(portraitDir, 'shiny');
  const shinyPortraits = existsSync(shinyPortraitDir) ? readdirSync(shinyPortraitDir).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')).sort() : [];
  const iconDir = resolve(root, 'public/assets/icons');
  // Icons are named by unpadded dex number plus the form slug: 58-hisui.png.
  const id = String(Number(dex)) + (form ? `-${form}` : '');
  const icon = existsSync(resolve(iconDir, `${id}.png`));
  const animatedIcon = existsSync(resolve(iconDir, `${id}-f0.png`)) && existsSync(resolve(iconDir, `${id}-f1.png`));
  folders[folder] = form
    ? { shiny, portraits, shinyPortraits, icon, animatedIcon, species: Number(dex), form, formName: node?.name ?? form }
    : { shiny, portraits, shinyPortraits, icon, animatedIcon };
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
for (const folder of [...present].sort()) {
  const { entry, node, form } = trackerNode(folder);
  credits.pokemon.push({
    dex: folder,
    name: (entry?.name ?? folder) + (form ? ` (${node?.name ?? form})` : ''),
    sprite: readCredits(resolve(spriteRoot, folder, 'credits.txt')),
    shiny: readCredits(resolve(spriteRoot, folder, 'shiny', 'credits.txt')),
    portrait: readCredits(resolve(root, 'public/assets/portraits', folder, 'credits.txt')),
    shinyPortrait: readCredits(resolve(root, 'public/assets/portraits', folder, 'shiny', 'credits.txt')),
  });
}
const creditsPath = resolve(dirname(outPath), 'credits.json');
writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');
console.log(`wrote ${creditsPath} for ${credits.pokemon.length} Pokémon`);
