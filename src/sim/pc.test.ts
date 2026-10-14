import { describe, expect, it } from 'vitest';
import { addPokemon, createGameState } from './game';
import { createMonster } from './monster';
import {
  allBoxed,
  boxCount,
  createBoxes,
  depositToBox,
  findRef,
  firstFreeSlot,
  matchesFilter,
  moveMon,
  PC,
  setWallpaper,
  SLOTS_PER_BOX,
  sortBox,
  sortMonsters,
  wallpaperDef,
} from './pc';

describe('PC boxes', () => {
  it('creates the configured boxes with names and wallpapers', () => {
    const boxes = createBoxes();
    expect(boxes).toHaveLength(PC.boxes);
    expect(PC.boxes).toBeGreaterThanOrEqual(8);
    expect(SLOTS_PER_BOX).toBe(30);
    expect(boxes[0]?.name).toBe('Box 1');
    expect(boxes.every((b) => b.slots.length === SLOTS_PER_BOX && b.slots.every((s) => s === null))).toBe(true);
    expect(boxes.every((b) => PC.wallpapers.some((w) => w.id === b.wallpaper))).toBe(true);
    expect(wallpaperDef(boxes[1]!.wallpaper).image).toMatch(/^assets\/ui\/gen4\/wallpapers\//);
    expect(PC.wallpapers.length).toBeGreaterThanOrEqual(32);
  });

  it('deposits into the first free slot, box by box, and reports a full PC', () => {
    const game = createGameState();
    for (let i = 0; i < 35; i++) depositToBox(game, createMonster(399, 2));
    expect(boxCount(game.boxes[0]!)).toBe(30);
    expect(boxCount(game.boxes[1]!)).toBe(5);
    expect(firstFreeSlot(game)).toEqual({ box: 1, slot: 5 });
    expect(allBoxed(game)).toHaveLength(35);
    for (let i = 35; i < PC.boxes * SLOTS_PER_BOX; i++) depositToBox(game, createMonster(399, 2));
    expect(firstFreeSlot(game)).toBeNull();
    expect(() => depositToBox(game, createMonster(399, 2))).toThrow(/full/);
    expect(() => addPokemon(game, createMonster(399, 2))).not.toThrow(); // party has room
  });

  it('moves and swaps between party and box slots, keeping the party dense and non-empty', () => {
    const game = createGameState();
    const a = createMonster(387, 5);
    const b = createMonster(396, 3);
    const c = createMonster(399, 4);
    game.party.push(a, b);
    game.boxes[0]!.slots[7] = c;
    // Party to an empty box slot.
    moveMon(game, { kind: 'party', index: 1 }, { kind: 'box', box: 2, slot: 3 });
    expect(game.party).toEqual([a]);
    expect(game.boxes[2]!.slots[3]).toBe(b);
    expect(() => moveMon(game, { kind: 'party', index: 0 }, { kind: 'box', box: 0, slot: 0 })).toThrow(/at least one/);
    // Swap the last party member with a boxed one instead.
    moveMon(game, { kind: 'party', index: 0 }, { kind: 'box', box: 0, slot: 7 });
    expect(game.party).toEqual([c]);
    expect(game.boxes[0]!.slots[7]).toBe(a);
    // Box to an empty party slot appends; box to box moves; box to a taken party slot swaps.
    moveMon(game, { kind: 'box', box: 2, slot: 3 }, { kind: 'party', index: 5 });
    expect(game.party).toEqual([c, b]);
    moveMon(game, { kind: 'box', box: 0, slot: 7 }, { kind: 'box', box: 1, slot: 0 });
    expect(game.boxes[0]!.slots[7]).toBeNull();
    expect(game.boxes[1]!.slots[0]).toBe(a);
    moveMon(game, { kind: 'box', box: 1, slot: 0 }, { kind: 'party', index: 0 });
    expect(game.party).toEqual([a, b]);
    expect(game.boxes[1]!.slots[0]).toBe(c);
    // Reorder within the party.
    moveMon(game, { kind: 'party', index: 1 }, { kind: 'party', index: 0 });
    expect(game.party).toEqual([b, a]);
    expect(findRef(game, c)).toEqual({ kind: 'box', box: 1, slot: 0 });
    expect(() => moveMon(game, { kind: 'box', box: 1, slot: 1 }, { kind: 'party', index: 0 })).toThrow(/nothing/);
    for (let i = 0; i < 4; i++) game.party.push(createMonster(401, 2));
    expect(() => moveMon(game, { kind: 'box', box: 1, slot: 0 }, { kind: 'party', index: 6 })).toThrow(/no such party slot/);
  });

  it('sorts a box to the front and filters by type and shiny', () => {
    const game = createGameState();
    const box = game.boxes[0]!;
    box.slots[3] = createMonster(387, 5);
    box.slots[9] = createMonster(396, 10);
    box.slots[20] = createMonster(41, 7, undefined, { shiny: true });
    sortBox(box, 'level');
    expect(box.slots.slice(0, 4).map((m) => m?.name ?? null)).toEqual(['starly', 'zubat', 'turtwig', null]);
    sortBox(box, 'dex');
    expect(box.slots.slice(0, 3).map((m) => m?.species)).toEqual([41, 387, 396]);
    expect(sortMonsters(box.slots.filter((m) => m !== null), 'name').map((m) => m.name)).toEqual(['starly', 'turtwig', 'zubat']);
    expect(box.slots.filter((m) => m && matchesFilter(m, { shiny: true })).map((m) => m!.name)).toEqual(['zubat']);
    expect(box.slots.filter((m) => m && matchesFilter(m, { type: 12 })).map((m) => m!.name)).toEqual(['turtwig']); // grass
    expect(box.slots.filter((m) => m && matchesFilter(m, {})).length).toBe(3);
    setWallpaper(box, 'gen4-08');
    expect(box.wallpaper).toBe('gen4-08');
    expect(() => setWallpaper(box, 'nope')).toThrow(/wallpaper/);
  });
});
