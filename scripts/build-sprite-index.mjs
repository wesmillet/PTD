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
