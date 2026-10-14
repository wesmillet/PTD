import { describe, expect, it } from 'vitest';
import spriteFolders from '../data/spriteFolders.json';
import { getMove, getPokemon } from '../data/pokedata';
import { createGameState } from './game';
import { startingMoves } from './moves';
import { allBoxed, boxCount } from './pc';
import { LEGENDS, LEGENDS_BOX_NAME, seedShowcase, SHOWCASE } from './showcase';

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

  it('lists every shipped legendary and mythical as a shiny at levels 50 to 70, one per species', () => {
    expect(LEGENDS.length).toBeGreaterThanOrEqual(60);
    const ids = LEGENDS.map((e) => e.species);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of LEGENDS) {
      const data = getPokemon(e.species);
      expect(data.legendary, `${data.name} is not a legendary`).toBe(true);
      expect(e.shiny).toBe(true);
      expect(e.level).toBeGreaterThanOrEqual(50);
      expect(e.level).toBeLessThanOrEqual(70);
      expect(e.moves).toEqual(startingMoves(e.species, e.level));
      const dex = data.folder ?? String(e.species).padStart(4, '0');
      expect((folders[dex] as { shiny?: boolean } | undefined)?.shiny, `${data.name} has no shiny sprites`).toBe(true);
    }
    for (const name of ['mewtwo', 'lugia', 'ho-oh', 'rayquaza', 'dialga', 'palkia', 'giratina', 'arceus', 'shaymin-sky', 'reshiram', 'enamorus']) {
      expect(ids.map((id) => getPokemon(id).name), name).toContain(name);
    }
  });

  it('seeds a new game state into the boxes with the Pokédex marked, the Legends in their own boxes', () => {
    const game = createGameState();
    expect(seedShowcase(game)).toBe(SHOWCASE.length + LEGENDS.length);
    expect(allBoxed(game)).toHaveLength(SHOWCASE.length + LEGENDS.length);
    const legendBoxes = game.boxes.filter((b) => b.name.startsWith(LEGENDS_BOX_NAME));
    expect(legendBoxes.length).toBe(Math.ceil(LEGENDS.length / 30));
    expect(legendBoxes[0]!.name).toBe(LEGENDS_BOX_NAME);
    expect(legendBoxes.flatMap((b) => b.slots).filter((m) => m).every((m) => m!.shiny && getPokemon(m!.species).legendary)).toBe(true);
    expect(legendBoxes[0]!.slots[0]!.species).toBe(LEGENDS[0]!.species);
    expect(game.party).toHaveLength(0);
    expect(boxCount(game.boxes[0]!)).toBe(30);
    expect(game.boxes[0]!.slots.slice(0, SHOWCASE.filter((e) => e.shiny).length).every((m) => m?.shiny)).toBe(true);
    expect(game.pokedex[String(SHOWCASE[0]!.species)]).toEqual({ seen: true, caught: true, shinyCaught: SHOWCASE[0]!.shiny });
  });
});
