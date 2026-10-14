import { describe, expect, it } from 'vitest';
import {
  BL,
  BR,
  E,
  FRAME_WIDTH,
  N,
  NE,
  NW,
  QUARTER,
  S,
  SE,
  SW,
  TILE,
  TL,
  TR,
  W,
  composeCell,
  distinctCells,
  maskGrid,
  neighbourMask,
  quadrantQuarter,
  quarterRect,
} from './autotile';

/** Quarter ref for the given tile (tile units) and quadrant. */
const q = (tx: number, ty: number, quadrant: number) => ({
  x: tx * TILE + (quadrant % 2) * QUARTER,
  y: ty * TILE + Math.floor(quadrant / 2) * QUARTER,
});
const tiles = {
  inner: [2, 0],
  tl: [0, 1], t: [1, 1], tr: [2, 1],
  l: [0, 2], c: [1, 2], r: [2, 2],
  bl: [0, 3], b: [1, 3], br: [2, 3],
} as const;
const Q = (name: keyof typeof tiles, quadrant: number) => q(tiles[name][0], tiles[name][1], quadrant);

/** Parses a hand-drawn grid ('#' = terrain, '.' = none) and returns masks. */
function masks(rows: string[], edgesConnect = false): number[] {
  const width = rows[0]!.length;
  const grid = rows.flatMap((r) => [...r].map((ch) => (ch === '#' ? 'x' : null)));
  return maskGrid(grid, width, rows.length, { edgesConnect });
}

describe('neighbour masks', () => {
  it('sets one bit per neighbour, clockwise from north', () => {
    expect(neighbourMask(() => false)).toBe(0);
    expect(neighbourMask(() => true)).toBe(255);
    expect(neighbourMask((dx, dy) => dx === 0 && dy === -1)).toBe(N);
    expect(neighbourMask((dx, dy) => dx === 1 && dy === 1)).toBe(SE);
    expect(neighbourMask((dx, dy) => dx === -1 && dy === -1)).toBe(NW);
  });

  it('reads a 3x3 full block with bordered map edges', () => {
    const m = masks(['###', '###', '###']);
    expect(m[4]).toBe(255);
    expect(m[0]).toBe(E | SE | S);
    expect(m[2]).toBe(W | SW | S);
    expect(m[8]).toBe(N | NW | W);
    expect(m[1]).toBe(E | SE | S | SW | W);
  });

  it('treats cells past the map edge as terrain when edgesConnect is set', () => {
    const m = masks(['##', '##'], true);
    expect(m).toEqual([255, 255, 255, 255]);
  });

  it('marks cells without terrain as -1', () => {
    expect(masks(['.#.', '...', '...'])).toEqual([-1, 0, -1, -1, -1, -1, -1, -1, -1]);
  });
});

describe('quadrant composition (hand-drawn 3x3 cases)', () => {
  it('an island shows the four outer corners', () => {
    const m = masks(['...', '.#.', '...']);
    expect(composeCell(m[4]!)).toEqual([Q('tl', TL), Q('tr', TR), Q('bl', BL), Q('br', BR)]);
  });

  it('the centre of a full block is all centre quarters', () => {
    const m = masks(['###', '###', '###']);
    expect(composeCell(m[4]!)).toEqual([Q('c', TL), Q('c', TR), Q('c', BL), Q('c', BR)]);
  });

  it('the top-left cell of a full block has an outer corner, two edges and a centre', () => {
    const m = masks(['###', '###', '###']);
    expect(composeCell(m[0]!)).toEqual([Q('tl', TL), Q('t', TR), Q('l', BL), Q('c', BR)]);
  });

  it('the top edge of a block continues the horizontal border on both sides', () => {
    const m = masks(['###', '###', '###']);
    expect(composeCell(m[1]!)).toEqual([Q('t', TL), Q('t', TR), Q('c', BL), Q('c', BR)]);
  });

  it('an L-shape uses the inner corner where the diagonal is missing', () => {
    // ##.
    // #..
    // ...
    const m = masks(['##.', '#..', '...']);
    expect(composeCell(m[0]!)).toEqual([Q('tl', TL), Q('t', TR), Q('l', BL), Q('inner', BR)]);
    // The arm to the right is a horizontal strip end.
    expect(composeCell(m[1]!)).toEqual([Q('t', TL), Q('tr', TR), Q('b', BL), Q('br', BR)]);
    // The arm below is a vertical strip end.
    expect(composeCell(m[3]!)).toEqual([Q('l', TL), Q('r', TR), Q('bl', BL), Q('br', BR)]);
  });

  it('a plus shape has inner corners on every quadrant of the centre', () => {
    const m = masks(['.#.', '###', '.#.']);
    expect(composeCell(m[4]!)).toEqual([Q('inner', TL), Q('inner', TR), Q('inner', BL), Q('inner', BR)]);
  });

  it('a diagonal-only neighbour does not connect', () => {
    const m = masks(['#..', '.#.', '...']);
    expect(composeCell(m[4]!)).toEqual([Q('tl', TL), Q('tr', TR), Q('bl', BL), Q('br', BR)]);
  });

  it('a horizontal strip has top and bottom borders only', () => {
    const m = masks(['...', '###', '...']);
    expect(composeCell(m[4]!)).toEqual([Q('t', TL), Q('t', TR), Q('b', BL), Q('b', BR)]);
    expect(composeCell(m[3]!)).toEqual([Q('tl', TL), Q('t', TR), Q('bl', BL), Q('b', BR)]);
  });

  it('has 47 distinct appearances like RPG Maker', () => {
    expect(distinctCells()).toBe(47);
  });

  it('quadrantQuarter ignores bits that do not touch the quadrant', () => {
    expect(quadrantQuarter(S | E | SE | NE | SW, TL)).toEqual(Q('tl', TL));
    expect(quadrantQuarter(N | W, TL)).toEqual(Q('inner', TL));
    expect(quadrantQuarter(N | W | NW, TL)).toEqual(Q('c', TL));
  });
});

describe('animation frames', () => {
  it('offsets the quarter by one frame width per frame', () => {
    const ref = Q('c', BR);
    expect(quarterRect(ref, 0)).toEqual({ x: ref.x, y: ref.y, w: QUARTER, h: QUARTER });
    expect(quarterRect(ref, 2)).toEqual({ x: ref.x + 2 * FRAME_WIDTH, y: ref.y, w: QUARTER, h: QUARTER });
  });
});
