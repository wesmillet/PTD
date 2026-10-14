import { describe, expect, it } from 'vitest';
import spriteFolders from './spriteFolders.json';
import {
  allPokemonIds,
  encounterAreaKeys,
  encounterTable,
  expForLevel,
  findMoveId,
  findPokemonId,
  getEncounterArea,
  getEvolutions,
  getLearnset,
  getMove,
  getPokemon,
  typeEffectiveness,
  typeName,
} from './pokedata';

describe('generated PokeAPI data', () => {
  it('has Turtwig with the expected base stats and growth', () => {
    const t = getPokemon(387);
    expect(t.name).toBe('turtwig');
    expect(t.base).toEqual({ hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31 });
    expect(t.types).toEqual([12]);
    expect(t.growth).toBe('medium-slow');
    expect(t.catchRate).toBe(45);
    expect(t.baseExp).toBe(64);
    expect(findPokemonId('Turtwig')).toBe(387);
  });

  it('covers exactly the sprite folders: every folder has data and every entry has a folder', () => {
    const folders = Object.keys(spriteFolders as Record<string, unknown>);
    const entries = allPokemonIds();
    const folderOf = (id: number) => getPokemon(id).folder ?? String(id).padStart(4, '0');
    expect(new Set(entries.map(folderOf))).toEqual(new Set(folders));
    expect(entries).toHaveLength(folders.length);
    expect(getPokemon(493).name).toBe('arceus');
    expect(getPokemon(643).name).toBe('reshiram'); // Gen 5 legendary with a folder
    expect(() => getPokemon(1)).toThrow(); // Bulbasaur ships no sprites
    expect(getPokemon(findPokemonId('xerneas')!).types).toEqual([1]); // Fairy maps to Normal on the Gen 4 chart
    expect(getPokemon(643).legendary).toBe(true);
    expect(getPokemon(387).legendary).toBeUndefined();
  });

  it('has Tackle and the Platinum learnset for Turtwig', () => {
    expect(findMoveId('tackle')).toBe(33);
    expect(getMove(33)).toMatchObject({ name: 'tackle', type: 1, power: 40, accuracy: 100, pp: 35, category: 'physical', priority: 0, target: 'selected-pokemon' });
    expect(getMove(33).effect).toMatchObject({ kind: 'damage', ailment: 'none', ailmentChance: 0, flinchChance: 0, stats: [] });
    const learnset = getLearnset(387);
    expect(learnset[0]).toEqual([1, 33]);
    expect(learnset).toContainEqual([5, 110]); // Withdraw at level 5
    for (let i = 1; i < learnset.length; i++) {
      expect(learnset[i]![0]).toBeGreaterThanOrEqual(learnset[i - 1]![0]);
    }
  });

  it('carries structured secondary effects from move_meta', () => {
    expect(getMove(40).effect).toMatchObject({ kind: 'damage-ailment', ailment: 'poison', ailmentChance: 30 }); // Poison Sting
    expect(getMove(86).effect).toMatchObject({ kind: 'ailment', ailment: 'paralysis', ailmentChance: 0 }); // Thunder Wave
    expect(getMove(45)).toMatchObject({ target: 'all-opponents', effect: { kind: 'net-good-stats', stats: [{ stat: 'atk', change: -1 }] } }); // Growl
    expect(getMove(110)).toMatchObject({ target: 'user', effect: { stats: [{ stat: 'def', change: 1 }] } }); // Withdraw
    expect(getMove(71).effect).toMatchObject({ kind: 'damage-heal', drain: 50 }); // Absorb
    expect(getMove(44).effect).toMatchObject({ flinchChance: 30 }); // Bite
    expect(getMove(98)).toMatchObject({ priority: 1 }); // Quick Attack
    expect(getMove(31).effect.hits).toEqual([2, 5]); // Fury Attack
  });

  it('uses the Gen 4 type chart', () => {
    expect(typeName(10)).toBe('fire');
    expect(typeEffectiveness(10, 12)).toBe(2); // fire vs grass
    expect(typeEffectiveness(11, 10)).toBe(2); // water vs fire
    expect(typeEffectiveness(1, 8)).toBe(0); // normal vs ghost
    expect(typeEffectiveness(1, 1)).toBe(1);
    expect(typeEffectiveness(8, 9)).toBe(0.5); // ghost vs steel, Gen 4 rule
    expect(typeEffectiveness(17, 9)).toBe(0.5); // dark vs steel, Gen 4 rule
    expect(typeName(18)).toBe('type-18'); // no fairy
  });

  it('has the Gen 4 experience curves', () => {
    expect(expForLevel('medium-slow', 1)).toBe(0);
    expect(expForLevel('medium-slow', 100)).toBe(1059860);
    expect(expForLevel('medium', 100)).toBe(1000000);
    expect(expForLevel('fast', 100)).toBe(800000);
    expect(expForLevel('slow', 100)).toBe(1250000);
    expect(expForLevel('slow-then-very-fast', 100)).toBe(600000);
    expect(expForLevel('fast-then-very-slow', 100)).toBe(1640000);
  });

  it('has evolutions keyed by the pre-evolution', () => {
    expect(getEvolutions(387)).toEqual([{ to: 388, trigger: 'level-up', level: 18 }]);
    expect(getEvolutions(133)).toContainEqual({ to: 135, trigger: 'use-item', item: 'thunder-stone' });
    expect(getEvolutions(133).some((e) => e.to === 134)).toBe(false); // Vaporeon ships no sprites
    expect(getEvolutions(389)).toEqual([]);
  });

  it('has the Platinum Route 201 and Oreburgh Mine 1F walk tables', () => {
    const route201 = getEncounterArea('sinnoh-route-201');
    expect(route201.areaId).toBe(141);
    const day = encounterTable(route201, 'walk', 'day');
    expect(day.reduce((s, e) => s + e.rarity, 0)).toBe(100);
    const species = new Set(day.map((e) => e.species));
    expect(species).toEqual(new Set([396, 399])); // Starly, Bidoof
    expect(Math.min(...day.map((e) => e.min))).toBe(2);
    expect(Math.max(...day.map((e) => e.max))).toBe(3);
    const night = encounterTable(route201, 'walk', 'night');
    expect(night.reduce((s, e) => s + e.rarity, 0)).toBe(100);
    expect(night.some((e) => e.species === 401)).toBe(true); // Kricketot at night

    const mine = getEncounterArea('oreburgh-mine/1f');
    expect(mine.areaId).toBe(6);
    const mineDay = encounterTable(mine, 'walk', 'day');
    expect(mineDay.reduce((s, e) => s + e.rarity, 0)).toBe(100);
    expect(new Set(mineDay.map((e) => e.species))).toEqual(new Set([74, 41, 95])); // Geodude, Zubat, Onix
    expect(Math.max(...mineDay.map((e) => e.max))).toBe(8);
  });

  it('keeps only the four encounter methods and no gift entries', () => {
    for (const key of encounterAreaKeys()) {
      const area = getEncounterArea(key);
      for (const method of Object.keys(area)) {
        expect(['location', 'areaId', 'walk', 'surf', 'old-rod', 'good-rod']).toContain(method);
      }
    }
  });
});
