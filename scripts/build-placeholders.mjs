// Generates the plain placeholder images the UI loads from config, so a real
// skin is a file swap: PC wallpapers, the PC box frame and cursor, trainer
// portraits and badge icons. Pure Node (uses scripts/png.mjs).
// Usage: node scripts/build-placeholders.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePng, fillRect } from './png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (rel) => resolve(root, 'public', rel);
const pc = JSON.parse(readFileSync(resolve(root, 'src/data/pc.json'), 'utf8'));
const levels = JSON.parse(readFileSync(resolve(root, 'src/data/levels.json'), 'utf8'));

function save(rel, image) {
  mkdirSync(dirname(out(rel)), { recursive: true });
  writeFileSync(out(rel), encodePng(image));
  console.log(`wrote public/${rel}`);
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
}

// Wallpapers come from the Platinum sheet (scripts/build-gen4-ui.mjs); only the frame and cursor are placeholders.

// --------------------------------------------------------------- box frame
// A 9-slice frame: 48x48 with 12 px borders (light outer ring, dark inner).
{
  const img = createImage(48, 48);
  fillRect(img, 0, 0, 48, 48, hex('#d8dce8'));
  fillRect(img, 3, 3, 42, 42, hex('#6f7fcf'));
  fillRect(img, 6, 6, 36, 36, hex('#2c335c'));
  fillRect(img, 12, 12, 24, 24, [0, 0, 0, 0]);
  save(pc.frame, img);
}

// ------------------------------------------------------------------ cursor
// A 24x24 pointing hand (white with a dark outline), hotspot at the top-left.
{
  const img = createImage(24, 24);
  const rows = [
    '......XX........',
    '.....X..X.......',
    '.....X..X.......',
    '.....X..XXX.....',
    '.....X..X..XXX..',
    '.....X..X..X..X.',
    '..XX.X..X..X..X.',
    '.X..XX........X.',
    '.X...X........X.',
    '..X...........X.',
    '...X.........X..',
    '....X........X..',
    '.....X......X...',
    '.....X......X...',
    '.....XXXXXXXX...',
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') fillRect(img, x + 2, y + 2, 1, 1, hex('#202030'));
    }
  });
  // Fill the inside white by scanning between outline pixels on each row.
  rows.forEach((row, y) => {
    let inside = false;
    for (let x = 0; x < row.length; x++) {
      const on = row[x] === 'X';
      const next = row[x + 1] === 'X';
      if (on && !next) inside = !inside;
      else if (!on && inside) fillRect(img, x + 2, y + 2, 1, 1, hex('#ffffff'));
    }
  });
  save(pc.cursor, img);
}

// --------------------------------------------------------- trainer portraits
// 64x64 cards: a coloured silhouette on a light background, one per trainer.
const TRAINER_COLORS = { 'youngster-tristan': '#3a7ac8', 'rival-barry': '#e0a030', 'leader-roark': '#b04040' };
for (const def of Object.values(levels)) {
  if (!def.trainer) continue;
  const id = def.trainer.id;
  const img = createImage(64, 64);
  fillRect(img, 0, 0, 64, 64, hex('#f0ead8'));
  const c = hex(TRAINER_COLORS[id] ?? '#808080');
  fillRect(img, 24, 10, 16, 16, c); // head
  fillRect(img, 16, 28, 32, 24, c); // body
  fillRect(img, 20, 52, 8, 12, c); // legs
  fillRect(img, 36, 52, 8, 12, c);
  save(`assets/trainers/${id}.png`, img);
}

// ------------------------------------------------------------------ badges
// 32x32 octagons in the badge colour, lit and greyed versions.
const BADGE_COLORS = { coal: '#8a8a8a' };
for (const def of Object.values(levels)) {
  if (!def.badge) continue;
  const { id } = def.badge;
  for (const [suffix, color] of [['', BADGE_COLORS[id] ?? '#c0a040'], ['-off', '#2c335c']]) {
    const img = createImage(32, 32);
    const c = hex(color);
    for (let y = 0; y < 32; y++) {
      const inset = Math.max(0, 9 - y, y - 22);
      fillRect(img, inset, y, 32 - inset * 2, 1, c);
    }
    fillRect(img, 12, 12, 8, 8, suffix ? hex('#1b1f36') : hex('#f4ecd8'));
    save(`assets/badges/${id}${suffix}.png`, img);
  }
}
