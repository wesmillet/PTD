import { describe, expect, it } from 'vitest';
import { findPokemonId } from '../data/pokedata';
import { allWildSpecies, speciesAreas } from './dex';

describe('Pokédex areas', () => {
  it('lists the levels a species spawns wild in, in story order, and never trainer-only species', () => {
    expect(speciesAreas(findPokemonId('starly')!)).toEqual(expect.arrayContaining(['Route 201']));
    expect(speciesAreas(findPokemonId('geodude')!)).toEqual(expect.arrayContaining(['Oreburgh Mine 1F']));
    expect(speciesAreas(findPokemonId('kleavor')!)).toEqual([]);
    expect(speciesAreas(findPokemonId('golbat')!)).toEqual(expect.arrayContaining(['Distortion World', 'S.S. Libra']));
    const all = allWildSpecies();
    expect(all.length).toBeGreaterThan(60);
    expect(all).toContain(findPokemonId('bidoof'));
    expect(all).not.toContain(findPokemonId('cranidos'));
    expect([...all]).toEqual([...all].sort((a, b) => a - b));
  });
});
