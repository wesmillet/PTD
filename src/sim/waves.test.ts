import { describe, expect, it } from 'vitest';
import { encounterTable, getEncounterArea } from '../data/pokedata';
import { Rng } from './rng';
import { generateWave, pickEntry, waveEnemyCount, type LevelDef } from './waves';

const free: LevelDef = {
  name: 'Route 201',
  area: 'sinnoh-route-201',
  time: 'day',
  objective: 'free',
  map: 'route-201',
  enemiesFirstWave: 3,
  enemiesPerWave: 1,
  spawnInterval: 1.5,
  placements: 1,
};
const defend: LevelDef = { ...free, objective: 'defend', waves: 8, lives: 10 };
const opts = { freeWaveMaxEnemies: 12 };

describe('waves', () => {
  it('ramps the enemy count and caps it on free levels only', () => {
    expect(waveEnemyCount(defend, 0, opts)).toBe(3);
    expect(waveEnemyCount(defend, 7, opts)).toBe(10);
    expect(waveEnemyCount(defend, 20, opts)).toBe(23);
    expect(waveEnemyCount(free, 20, opts)).toBe(12);
  });

  it('picks entries proportionally to rarity', () => {
    const table = [
      { species: 1, min: 1, max: 1, rarity: 80 },
      { species: 2, min: 1, max: 1, rarity: 20 },
    ];
    const rng = new Rng(1);
    let twos = 0;
    for (let i = 0; i < 5000; i++) if (pickEntry(table, rng).species === 2) twos++;
    expect(twos).toBeGreaterThan(850);
    expect(twos).toBeLessThan(1150);
    expect(() => pickEntry([], rng)).toThrow();
  });

  it('generates identical waves for the same seed and different ones otherwise', () => {
    const table = encounterTable(getEncounterArea('sinnoh-route-201'), 'walk', 'day');
    const a = generateWave(table, free, 3, new Rng(42), opts);
    const b = generateWave(table, free, 3, new Rng(42), opts);
    const c = generateWave(table, free, 3, new Rng(43), opts);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(6);
    expect(a.map((s) => s.delay)).toEqual([0, 1.5, 3, 4.5, 6, 7.5]);
  });

  it('only spawns species and levels from the table', () => {
    const table = encounterTable(getEncounterArea('oreburgh-mine/1f'), 'walk', 'day');
    const rng = new Rng(9);
    for (let w = 0; w < 30; w++) {
      for (const spawn of generateWave(table, free, w, rng, opts)) {
        expect([74, 41, 95]).toContain(spawn.species);
        expect(spawn.level).toBeGreaterThanOrEqual(4);
        expect(spawn.level).toBeLessThanOrEqual(8);
      }
    }
  });

  it('applies the level override', () => {
    const table = encounterTable(getEncounterArea('sinnoh-route-201'), 'walk', 'day');
    for (const s of generateWave(table, free, 0, new Rng(1), { ...opts, levelOverride: 30 })) expect(s.level).toBe(30);
  });
});
