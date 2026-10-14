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

// ---------------------------------------------------------------- wallpapers
// 6x5 slots of 48 px plus a 12 px margin: 312x264. Two tones in a checker so
// the slot grid reads, plus a darker band at the top for the box name.
const WALLPAPER_COLORS = {
  forest: ['#2f6b3a', '#3a7a45'],
  city: ['#4a5566', '#56627a'],
  desert: ['#b08a4a', '#c09a58'],
  savanna: ['#8a8a3a', '#9a9a48'],
  crag: ['#6b5a4a', '#7a6858'],
  volcano: ['#7a2f2f', '#8a3a3a'],
  snow: ['#8fb0c8', '#a0c0d8'],
  cave: ['#3a3348', '#463f58'],
};
const W = 12 + pc.columns * 48 + 12;
const H = 36 + pc.rows * 48 + 12;
for (const wp of pc.wallpapers) {
  const [a, b] = WALLPAPER_COLORS[wp.id] ?? ['#444444', '#505050'];
  const img = createImage(W, H);
  fillRect(img, 0, 0, W, H, hex(a));
  for (let y = 0; y < pc.rows; y++) {
    for (let x = 0; x < pc.columns; x++) {
      if ((x + y) % 2 === 0) fillRect(img, 12 + x * 48, 36 + y * 48, 48, 48, hex(b));
    }
  }
  fillRect(img, 0, 0, W, 28, [0, 0, 0, 90]);
  save(wp.image, img);
}

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
