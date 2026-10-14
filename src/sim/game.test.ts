import { describe, expect, it } from 'vitest';
import {
  addPokemon,
  allBadges,
  chooseStarter,
  createGameState,
  DEMO_MODE,
  hasBadge,
  isLevelCompleted,
  isLevelUnlocked,
  orderedLevelIds,
  recordLevelResult,
  sortMonsters,
  MAX_PARTY,
  dexCounts,
  levelMoney,
  markSeen,
  spendMoney,
} from './game';
import { createMonster } from './monster';
import { allBoxed, moveMon, moveToBox, moveToParty } from './pc';

describe('party and box', () => {
  it('fills the party to six then the box', () => {
    const game = createGameState();
    chooseStarter(game, 387, createMonster(387, 5));
    expect(() => chooseStarter(game, 390, createMonster(390, 5))).toThrow();
    for (let i = 0; i < 7; i++) addPokemon(game, createMonster(396, 2));
    expect(game.party).toHaveLength(MAX_PARTY);
    expect(allBoxed(game)).toHaveLength(2);
    expect(game.boxes[0]?.slots.slice(0, 3).map((m) => m?.species ?? null)).toEqual([396, 396, null]);
    expect(game.party[0]?.species).toBe(387);
  });

  it('moves and swaps between party and box with limits', () => {
    const game = createGameState();
    addPokemon(game, createMonster(387, 5));
    addPokemon(game, createMonster(396, 2));
    moveToBox(game, 1);
    expect(game.party).toHaveLength(1);
    expect(game.boxes[0]?.slots[0]?.species).toBe(396);
    expect(() => moveToBox(game, 0)).toThrow(/at least one/);
    moveToParty(game, 0, 0);
    expect(game.party).toHaveLength(2);
    expect(allBoxed(game)).toHaveLength(0);
    for (let i = 0; i < 5; i++) addPokemon(game, createMonster(399, 2));
    expect(() => moveToParty(game, 0, 0)).toThrow(/full/);
    moveMon(game, { kind: 'party', index: 0 }, { kind: 'box', box: 0, slot: 0 });
    expect(game.party[0]?.species).toBe(399);
    expect(game.boxes[0]?.slots[0]?.species).toBe(387);
  });

  it('sorts by level, type and name', () => {
    const list = [createMonster(387, 5), createMonster(396, 10), createMonster(41, 7)];
    expect(sortMonsters(list, 'level').map((m) => m.name)).toEqual(['starly', 'zubat', 'turtwig']);
    expect(sortMonsters(list, 'type').map((m) => m.name)).toEqual(['turtwig', 'starly', 'zubat']); // grass, normal, poison
    expect(sortMonsters(list, 'name').map((m) => m.name)).toEqual(['starly', 'turtwig', 'zubat']);
    expect(list.map((m) => m.name)).toEqual(['turtwig', 'starly', 'zubat']); // input untouched
  });
});

describe('level unlock chain', () => {
  it('follows levels.json order and completion rules', () => {
    const game = createGameState();
    expect(orderedLevelIds()).toEqual(['route-201', 'lake-verity', 'route-202', 'route-203', 'oreburgh-gate', 'oreburgh-mine-1f']);
    expect(isLevelUnlocked(game, 'route-201')).toBe(true);
    if (DEMO_MODE) {
      // Demo builds open everything; completion still records normally.
      expect(isLevelUnlocked(game, 'oreburgh-mine-1f')).toBe(true);
      expect(recordLevelResult(game, 'route-201', 'left', 1)).toBe(true);
      expect(isLevelCompleted(game, 'route-201')).toBe(true);
      return;
    }
    expect(isLevelUnlocked(game, 'lake-verity')).toBe(false);
    expect(recordLevelResult(game, 'route-201', 'left', 0)).toBe(false); // free: needs a cleared wave
    expect(isLevelUnlocked(game, 'lake-verity')).toBe(false);
    expect(recordLevelResult(game, 'route-201', 'left', 1)).toBe(true);
    expect(isLevelUnlocked(game, 'lake-verity')).toBe(true);
    expect(isLevelUnlocked(game, 'route-203')).toBe(false);
    recordLevelResult(game, 'lake-verity', 'left', 2);
    recordLevelResult(game, 'route-202', 'left', 1);
    expect(isLevelUnlocked(game, 'route-203')).toBe(true);
    expect(recordLevelResult(game, 'route-203', 'lost', 5)).toBe(false);
    expect(isLevelUnlocked(game, 'oreburgh-gate')).toBe(false);
    expect(recordLevelResult(game, 'route-203', 'won', 8)).toBe(true);
    expect(isLevelCompleted(game, 'route-203')).toBe(true);
    expect(game.progress['route-203']?.wavesCleared).toBe(8);
    expect(isLevelUnlocked(game, 'oreburgh-gate')).toBe(true);
  });

  it('awards a badge for winning a gym level, once', () => {
    const game = createGameState();
    const badges = allBadges();
    expect(badges.map((b) => b.id)).toEqual(['coal', 'forest', 'cobble', 'fen', 'relic', 'mine', 'icicle', 'beacon']);
    expect(badges[0]).toMatchObject({ id: 'coal', name: 'Coal Badge', levelId: 'oreburgh-mine-1f' });
    expect(badges[1]?.levelId).toBeUndefined();
    recordLevelResult(game, 'oreburgh-mine-1f', 'lost', 7);
    expect(game.badges).toEqual([]);
    recordLevelResult(game, 'oreburgh-mine-1f', 'won', 8);
    recordLevelResult(game, 'oreburgh-mine-1f', 'won', 8);
    expect(game.badges).toEqual(['coal']);
    expect(hasBadge(game, 'coal')).toBe(true);
  });

  it('counts a free level with a beaten trainer as won', () => {
    const game = createGameState();
    expect(recordLevelResult(game, 'route-202', 'won', 6)).toBe(true);
    expect(game.progress['route-202']).toEqual({ wavesCleared: 6, won: true, completed: true });
  });
});

describe('money and Pokédex', () => {
  it('awards money per KO and per cleared level', () => {
    const game = createGameState();
    const start = game.money;
    expect(levelMoney(5, false)).toBe(60);
    expect(levelMoney(5, true)).toBe(660);
    recordLevelResult(game, 'route-201', 'left', 0, 3);
    expect(game.money).toBe(start + 36);
    recordLevelResult(game, 'route-201', 'left', 1, 2);
    expect(game.money).toBe(start + 36 + 624);
    spendMoney(game, 600);
    expect(() => spendMoney(game, 10_000_000)).toThrow(/money/);
  });

  it('tracks seen, caught and shiny caught', () => {
    const game = createGameState();
    markSeen(game, 396);
    addPokemon(game, createMonster(399, 2));
    const shiny = createMonster(41, 5, undefined, { shiny: true });
    addPokemon(game, shiny);
    chooseStarter(game, 387, createMonster(387, 5));
    expect(dexCounts(game)).toEqual({ seen: 4, caught: 3, shiny: 1 });
    expect(game.pokedex['396']).toEqual({ seen: true, caught: false, shinyCaught: false });
  });
});
