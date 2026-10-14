import { describe, expect, it } from 'vitest';
import spriteFolders from '../data/spriteFolders.json';
import { getMove, getPokemon } from '../data/pokedata';
import { createGameState } from './game';
import { startingMoves } from './moves';
import { allBoxed, boxCount } from './pc';
import { seedShowcase, SHOWCASE } from './showcase';

const folders = spriteFolders as Record<string, { icon?: boolean }>;

describe('demo showcase', () => {
  it('lists about forty Pokémon at levels 20 to 60, a quarter shiny, with learnset moves', () => {
    expect(SHOWCASE.length).toBeGreaterThanOrEqual(40);
    const shiny = SHOWCASE.filter((e) => e.shiny);
    expect(shiny.length).toBeGreaterThanOrEqual(10);
    for (const e of SHOWCASE) {
      expect(getPokemon(e.species).name).toBeTruthy();
      expect(e.level).toBeGreaterThanOrEqual(20);
      expect(e.level).toBeLessThanOrEqual(60);
      expect(e.moves.length).toBeGreaterThan(0);
      for (const m of e.moves) expect(getMove(m).name).toBeTruthy();
      expect(e.moves).toEqual(startingMoves(e.species, e.level));
      const dex = String(e.species).padStart(4, '0');
      expect(folders[dex], `${getPokemon(e.species).name} has no sprites`).toBeDefined();
      expect(folders[dex]?.icon, `${getPokemon(e.species).name} has no box icon`).toBe(true);
    }
    // Shinies come first so they fill Box 1.
    const firstNonShiny = SHOWCASE.findIndex((e) => !e.shiny);
    expect(SHOWCASE.slice(0, firstNonShiny).every((e) => e.shiny)).toBe(true);
    expect(SHOWCASE.slice(firstNonShiny).every((e) => !e.shiny)).toBe(true);
  });

  it('seeds a new game state into the boxes with the Pokédex marked', () => {
    const game = createGameState();
    expect(seedShowcase(game)).toBe(SHOWCASE.length);
    expect(allBoxed(game)).toHaveLength(SHOWCASE.length);
    expect(game.party).toHaveLength(0);
    expect(boxCount(game.boxes[0]!)).toBe(30);
    expect(game.boxes[0]!.slots.slice(0, SHOWCASE.filter((e) => e.shiny).length).every((m) => m?.shiny)).toBe(true);
    expect(game.pokedex[String(SHOWCASE[0]!.species)]).toEqual({ seen: true, caught: true, shinyCaught: SHOWCASE[0]!.shiny });
  });
});
