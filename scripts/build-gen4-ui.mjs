// Cuts the Pokémon Platinum interface sheets in assets-src/ui/gen4/ into the
// pieces the UI loads: 9-slice text-box frames, HP boxes, bar colours, status
// badges, the name and number fonts (packed into fixed cells for a Phaser
// RetroFont), the bag's round buttons, pocket selector and big Poké Ball, the
// start-menu icons and the PC box wallpapers. The sheets' solid background
// colours are keyed out. Writes public/assets/ui/gen4/** and
// src/data/ui-gen4.json (slice insets, font metrics, bar rectangles, lists).
// Usage: node scripts/build-gen4-ui.mjs
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, decodePng, encodePng } from './png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => resolve(root, 'assets-src/ui/gen4', f);
const outDir = resolve(root, 'public/assets/ui/gen4');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const sheets = {};
const sheet = (name) => (sheets[name] ??= decodePng(readFileSync(src(`${name}.png`))));
const near = (a, b, tol = 3) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

/** Copies a region, keying the given background colours to transparent. */
function cut(img, x0, y0, w, h, keys = []) {
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(img, x0 + x, y0 + y);
      const j = (y * w + x) * 4;
      const keyed = keys.some((k) => near(p, k));
      out.data[j] = p[0];
      out.data[j + 1] = p[1];
      out.data[j + 2] = p[2];
      out.data[j + 3] = keyed ? 0 : p[3];
    }
  }
  return out;
}

function save(rel, image) {
  const path = resolve(outDir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(image));
  return `assets/ui/gen4/${rel}`;
}

const meta = { frames: {}, hpBoxes: {}, bars: {}, status: {}, balls: {}, fonts: {}, bag: {}, menu: {}, wallpapers: [] };

// --------------------------------------------------------------- text frames
// Sheet order (left column then right column); the first is the plain
// blue-edged default. Insets are measured from the middle row and column:
// the border ends where the flat interior colour begins.
const FRAME_BG = [192, 192, 192];
const frameBoxes = [
  ['blue', 2, 0, 250, 44], ['grey', 2, 48, 248, 44], ['black', 2, 94, 252, 44], ['pink-lace', 2, 141, 253, 46], ['brown-lace', 2, 189, 253, 46],
  ['red-dots', 2, 236, 253, 47], ['purple', 2, 288, 254, 46], ['lime', 2, 337, 251, 43], ['checker', 2, 383, 254, 46], ['grey-round', 2, 432, 250, 44],
  ['orange', 2, 479, 250, 44],
  ['green', 261, 0, 250, 44], ['teal', 261, 46, 250, 46], ['blue-dots', 261, 94, 250, 44], ['red-tab', 262, 142, 250, 46], ['green-tab', 262, 194, 252, 44],
  ['pink-tab', 262, 240, 252, 44], ['blue-tab', 262, 287, 252, 44], ['grey-tab', 262, 334, 252, 44], ['brown-tab', 262, 385, 252, 44],
];
{
  const img = sheet('text-box-styles');
  for (const [name, x, y, w, h] of frameBoxes) {
    const piece = cut(img, x, y, w, h, [FRAME_BG]);
    const interior = px(piece, Math.floor(w / 2), Math.floor(h / 2));
    const same = (p) => near(p, interior, 6);
    const midY = Math.floor(h / 2);
    const midX = Math.floor(w / 2);
    // The border is everything up to the last non-interior pixel in the outer 40 % of each side
    // (some frames start with a white highlight pixel, so the scan cannot stop at the first match).
    const lastBorder = (n, at) => {
      let last = -1;
      for (let i = 0; i < Math.floor(n * 0.4); i++) if (!same(at(i))) last = i;
      return last + 2; // one extra pixel keeps the inner highlight out of the stretched middle
    };
    const inset = {
      left: lastBorder(w, (i) => px(piece, i, midY)),
      right: lastBorder(w, (i) => px(piece, w - 1 - i, midY)),
      top: lastBorder(h, (i) => px(piece, midX, i)),
      bottom: lastBorder(h, (i) => px(piece, midX, h - 1 - i)),
    };
    meta.frames[name] = { file: save(`frames/${name}.png`, piece), width: w, height: h, ...inset, interior: interior.slice(0, 3) };
  }
}

// ---------------------------------------------------------------- battle gui
const GUI_BG = [64, 64, 64];
{
  const img = sheet('battle-gui');
  // HP boxes: enemy (name, Lv, bar), player (plus HP numbers) and the player box with the EXP bar.
  const boxes = { enemy: [129, 37, 128, 33], player: [129, 89, 128, 42], 'player-exp': [129, 134, 128, 42] };
  for (const [name, [x, y, w, h]] of Object.entries(boxes)) {
    const piece = cut(img, x, y, w, h, [GUI_BG]);
    // The HP bar interior is the long white run; the EXP bar the long blue/white run near the bottom.
    let hpBar = null;
    let expBar = null;
    for (let yy = 0; yy < h; yy++) {
      let run = 0;
      let start = 0;
      for (let xx = 0; xx <= w; xx++) {
        const p = xx < w ? px(piece, xx, yy) : [0, 0, 0, 0];
        const white = near(p, [251, 251, 251], 8) || near(p, [248, 248, 248], 8);
        const blue = near(p, [72, 136, 232], 40) && p[2] > 180;
        if (white || blue) {
          if (run === 0) start = xx;
          run++;
        } else {
          if (run >= 40) {
            const rect = { x: start, y: yy, width: run, height: 1 };
            if (!hpBar) hpBar = rect;
            else if (hpBar && yy === hpBar.y + hpBar.height) hpBar.height++;
            else if (!expBar && yy > hpBar.y + hpBar.height + 2) expBar = rect;
            else if (expBar && yy === expBar.y + expBar.height) expBar.height++;
          }
          run = 0;
        }
      }
    }
    // The bar detected above is its white top line; the fill area is the two rows below, one pixel in.
    const hpFill = hpBar ? { x: hpBar.x + 1, y: hpBar.y + 1, width: hpBar.width - 2, height: 2 } : null;
    const expFill = expBar ? { x: expBar.x, y: expBar.y, width: expBar.width, height: 1 } : null;
    // The "Lv" label: leftmost white pixel in the top-right quadrant.
    let lv = null;
    for (let xx = Math.floor(w / 3); xx < w && !lv; xx++) {
      for (let yy = 2; yy < Math.floor(h / 2); yy++) {
        if (near(px(piece, xx, yy), [251, 251, 251], 8)) {
          lv = { x: xx, y: yy };
          break;
        }
      }
    }
    meta.hpBoxes[name] = { file: save(`hpbox-${name}.png`, piece), width: w, height: h, hpBar, expBar, hpFill, expFill, lv };
  }
  // Bar fill colours from the swatches beside the sample bars.
  meta.bars = {
    hpHigh: px(img, 93, 44).slice(0, 3),
    hpMid: px(img, 93, 50).slice(0, 3),
    hpLow: px(img, 93, 56).slice(0, 3),
    exp: [72, 136, 232],
    frame: [0, 0, 0],
    back: [251, 251, 251],
  };
  // Status badges.
  const badges = { psn: [26, 64, 22, 7], par: [50, 64, 22, 7], slp: [26, 73, 22, 7], brn: [50, 73, 22, 7], frz: [26, 82, 22, 7] };
  for (const [name, [x, y, w, h]] of Object.entries(badges)) meta.status[name] = save(`status-${name}.png`, cut(img, x, y, w, h, [GUI_BG]));
  // Party ball icons: empty slot, healthy, fainted, with a status.
  const balls = { empty: 26, ok: 43, fnt: 60, status: 77 };
  for (const [name, x] of Object.entries(balls)) meta.balls[name] = save(`ball-${name}.png`, cut(img, x, 113, 15, 15, [GUI_BG]));

  // Name font: 6x10 glyphs (descenders to 12) in five rows. The lowercase
  // rows are split 14 / 12 and a few glyphs are narrower (i, j, l, f), so
  // each glyph is cut at its measured x and width and left-aligned in a 7x13
  // cell, 13 cells per row, for Phaser's RetroFont. A trailing space cell
  // lets names with spaces render.
  const six = (x0, n) => Array.from({ length: n }, (_, k) => [x0 + 7 * k, 6]);
  const rows = [
    ['ABCDEFGHIJKLM', 155, six(15, 13)],
    ['NOPQRSTUVWXYZ', 168, six(15, 13)],
    ['abcdefghijklmn', 182, [[15, 6], [22, 6], [29, 6], [36, 6], [43, 6], [50, 5], [56, 6], [63, 6], [70, 3], [74, 5], [80, 6], [87, 4], [92, 6], [99, 6]]],
    ['opqrstuvwxyz', 195, [[15, 6], [22, 6], [29, 6], [36, 6], [43, 6], [50, 6], [57, 6], [64, 6], [71, 6], [78, 6], [85, 6], [92, 6]]],
    ['1234567890', 210, [[15, 5], [21, 6], [28, 6], [35, 6], [42, 6], [49, 6], [56, 6], [63, 6], [70, 6], [77, 6]]],
  ];
  const cellW = 7;
  const cellH = 13;
  const perRow = 13;
  const chars = rows.map((r) => r[0]).join('') + ' ';
  const packed = createImage(cellW * perRow, cellH * Math.ceil(chars.length / perRow));
  let index = 0;
  for (const [text, y, glyphs] of rows) {
    for (let k = 0; k < text.length; k++) {
      const [gx, gw] = glyphs[k];
      const glyph = cut(img, gx, y, gw, 12, [GUI_BG]);
      const cx = (index % perRow) * cellW;
      const cy = Math.floor(index / perRow) * cellH;
      for (let yy = 0; yy < 12; yy++) {
        for (let xx = 0; xx < gw; xx++) {
          const si = (yy * gw + xx) * 4;
          const di = ((cy + yy) * packed.width + cx + xx) * 4;
          packed.data.set(glyph.data.subarray(si, si + 4), di);
        }
      }
      index++;
    }
  }
  meta.fonts.name = { file: save('font-name.png', packed), chars, width: cellW, height: cellH, charsPerRow: perRow, lineHeight: 13 };
  // Lv / HP numbers: 8x7 glyphs at a 9 px pitch on the HP box's green.
  const NUM_BG = [75, 127, 94];
  const digits = '0123456789';
  const numPacked = createImage(9 * 10, 7);
  for (let k = 0; k < 10; k++) {
    const glyph = cut(img, 135 + 9 * k, 195, 8, 7, [GUI_BG, NUM_BG]);
    for (let yy = 0; yy < 7; yy++) {
      for (let xx = 0; xx < 8; xx++) {
        const si = (yy * 8 + xx) * 4;
        const di = (yy * numPacked.width + k * 9 + xx) * 4;
        numPacked.data.set(glyph.data.subarray(si, si + 4), di);
      }
    }
  }
  meta.fonts.numbers = { file: save('font-numbers.png', numPacked), chars: digits, width: 9, height: 7, charsPerRow: 10, lineHeight: 7 };
}

// ----------------------------------------------------------------------- bag
const BAG_BG = [0, 255, 0];
{
  const img = sheet('bag');
  // The caption above the balls touches their bounding box; start below it.
  meta.bag.pokeball = save('pokeball-big.png', cut(img, 19, 22, 138, 128, [BAG_BG]));
  meta.bag.pokeballPressed = save('pokeball-big-pressed.png', cut(img, 160, 22, 138, 128, [BAG_BG]));
  // Round bottom-screen buttons: the eight bag pockets in three states.
  const pockets = ['items', 'medicine', 'balls', 'tms', 'berries', 'mail', 'battle', 'key'];
  const xs = [315, 360, 403, 446, 489, 532, 575, 619];
  const states = { normal: 28, selected: 70, pressed: 111 };
  meta.bag.buttons = {};
  pockets.forEach((pocket, i) => {
    meta.bag.buttons[pocket] = {};
    for (const [state, y] of Object.entries(states)) {
      meta.bag.buttons[pocket][state] = save(`button-${pocket}-${state}.png`, cut(img, xs[i], y, 40, 39, [BAG_BG]));
    }
  });
  meta.bag.pocketPanel = save('pocket-panel.png', cut(img, 688, 59, 104, 56, [BAG_BG]));
  meta.bag.pocketIcons = save('pocket-icons.png', cut(img, 688, 29, 103, 12, [BAG_BG]));
  meta.bag.pocketIconsDim = save('pocket-icons-dim.png', cut(img, 688, 45, 103, 12, [BAG_BG]));
  meta.bag.pocketCursor = save('pocket-cursor.png', cut(img, 667, 31, 14, 14, [BAG_BG]));
  meta.bag.itemPanel = save('item-panel.png', cut(img, 607, 204, 163, 140, [BAG_BG]));
  meta.bag.exit = save('exit.png', cut(img, 16, 363, 20, 20, [BAG_BG]));
}

// ---------------------------------------------------------------- menu icons
const MENU_BG = [255, 255, 255];
{
  const img = sheet('menu-icons');
  // [name, grey x, colour x, y, w, h]; cut into 24x24 cells centred on the icon.
  const icons = [
    ['pokedex', 210, 248, 107, 23, 16], ['party', 213, 251, 138, 17, 17], ['bag', 213, 251, 169, 18, 20], ['card', 212, 250, 204, 19, 14],
    ['save', 212, 250, 234, 21, 18], ['options', 214, 252, 265, 16, 20], ['exit', 214, 252, 300, 17, 15], ['chat', 213, 251, 330, 18, 18],
    ['flag', 212, 250, 361, 20, 19], ['poketch', 212, 250, 393, 20, 20],
  ];
  for (const [name, gx, cx, y, w, h] of icons) {
    const cell = (x) => {
      const out = createImage(24, 24);
      const piece = cut(img, x, y, w, h, [MENU_BG]);
      const ox = Math.floor((24 - w) / 2);
      const oy = Math.floor((24 - h) / 2);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.data.set(piece.data.subarray((yy * w + xx) * 4, (yy * w + xx) * 4 + 4), ((oy + yy) * 24 + ox + xx) * 4);
      return out;
    };
    meta.menu[name] = { on: save(`menu-${name}.png`, cell(cx)), off: save(`menu-${name}-off.png`, cell(gx)) };
  }
}

// ---------------------------------------------------------------- wallpapers
// 158x118 tiles in a 3-column grid, eleven rows, plus the custom Croagunk
// recolour at the bottom left. The "Next" tile (row 11, column 3) and the
// credit tile are skipped. Tiles keep their own bevel; nothing to key out.
{
  const img = sheet('box-backgrounds');
  const names = [
    'grass', 'stone', 'sand-pale', 'desert', 'lilac', 'coral', 'ice', 'cave', 'beach', 'sea', 'tiles', 'sky', 'checker-orange', 'plaid', 'gingham',
    'ribbon', 'torterra', 'contest', 'room', 'croagunk-blue', 'starters', 'pikachu-trio', 'giratina', 'team', 'palkia', 'route', 'torchic', 'space',
    'machine', 'seal', 'pikachu', 'dialga', 'mew',
  ];
  let n = 0;
  const tile = (col, row, name) => {
    const piece = cut(img, col * 158, row * 118, 158, 118, []);
    const id = `gen4-${String(n + 1).padStart(2, '0')}`;
    meta.wallpapers.push({ id, name, image: save(`wallpapers/${id}.png`, piece) });
    n++;
  };
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 10 && col === 2) continue; // "Next: I don't know"
      tile(col, row, names[row * 3 + col] ?? `wallpaper-${row * 3 + col + 1}`);
    }
  }
  tile(0, 11, 'croagunk'); // custom shiny Croagunk recolour (bottom left)
}

writeFileSync(resolve(root, 'src/data/ui-gen4.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`wrote ${Object.keys(meta.frames).length} frames, ${meta.wallpapers.length} wallpapers, ${Object.keys(meta.menu).length} menu icons to public/assets/ui/gen4 and src/data/ui-gen4.json`);
