import { describe, expect, it } from 'vitest';
import { addPokemon, chooseStarter, createGameState, recordLevelResult } from './game';
import { createMonster } from './monster';
import { allBoxed } from './pc';
import { decodeSaveCode, encodeSaveCode, restoreGame, SaveError, serializeGame, validateSave } from './save';

function sampleGame() {
  const game = createGameState();
  chooseStarter(game, 387, createMonster(387, 12));
  const bidoof = createMonster(399, 4, undefined, { shiny: true });
  bidoof.hp = 3;
  addPokemon(game, bidoof);
  for (let i = 0; i < 6; i++) addPokemon(game, createMonster(396, 3 + i));
  recordLevelResult(game, 'route-201', 'left', 2, 7);
  game.items.balls['great'] = 3;
  game.items.potions = 4;
  return game;
}
const settings = { gameSpeed: 2, speed: { speedBase: 0.9, speedScale: 0.015, enemyClampMin: 0.5, enemyClampMax: 2, speedRef: 60, clampMin: 0.5, clampMax: 2, moveRate: 1 } };

describe('save round trip', () => {
  it('serializes and restores the whole game state', () => {
    const game = sampleGame();
    const data = serializeGame(game, settings, 123);
    expect(data.version).toBe(2);
    expect(data.savedAt).toBe(123);
    const restored = restoreGame(validateSave(JSON.parse(JSON.stringify(data))));
    expect(restored.starter).toBe(387);
    expect(restored.party.map((m) => [m.species, m.level, m.hp, m.shiny])).toEqual(game.party.map((m) => [m.species, m.level, m.hp, m.shiny]));
    expect(allBoxed(restored)).toHaveLength(2);
    expect(restored.boxes).toHaveLength(8);
    expect(restored.boxes[0]?.slots).toHaveLength(30);
    expect(restored.party[1]?.hp).toBe(3);
    expect(restored.party[0]?.moves.map((m) => m.id)).toEqual(game.party[0]?.moves.map((m) => m.id));
    expect(restored.progress).toEqual(game.progress);
    expect(restored.items.balls['great']).toBe(3);
    expect(restored.items.potions).toBe(4);
    expect(restored.money).toBe(game.money);
    expect(restored.pokedex).toEqual(game.pokedex);
    expect(restored.party[0]?.status.ailment).toBe('none');
  });

  it('encodes a compact code that decodes to the same data', () => {
    const data = serializeGame(sampleGame(), settings, 5);
    const code = encodeSaveCode(data);
    expect(code.startsWith('PTD2.')).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(decodeSaveCode(code)).toEqual(data);
    expect(decodeSaveCode(`  ${code}\n`)).toEqual(data);
  });
});

describe('corrupt saves are rejected', () => {
  const data = serializeGame(sampleGame(), settings, 5);
  const code = encodeSaveCode(data);

  it('rejects wrong prefixes, checksums and garbage', () => {
    expect(() => decodeSaveCode('hello')).toThrow(SaveError);
    expect(() => decodeSaveCode('PTD9.abc.def')).toThrow(/version/);
    expect(() => decodeSaveCode(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a'))).toThrow(/checksum/);
    expect(() => decodeSaveCode(code.slice(0, 40))).toThrow(SaveError);
    const tampered = code.replace(/^PTD2\.(.)/, (_m, c: string) => `PTD2.${c === 'A' ? 'B' : 'A'}`);
    expect(() => decodeSaveCode(tampered)).toThrow(SaveError);
    expect(() => decodeSaveCode('')).toThrow(SaveError);
  });

  it('rejects invalid fields without crashing', () => {
    const bad = (mutate: (d: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      mutate(copy);
      return () => validateSave(copy);
    };
    expect(bad((d) => ((d.party as unknown[])[0] = { species: 9999 }))).toThrow(SaveError);
    expect(bad((d) => (((d.party as Record<string, unknown>[])[0] as Record<string, unknown>).level = 101))).toThrow(/level/);
    expect(bad((d) => (((d.party as Record<string, unknown>[])[0] as Record<string, unknown>).moves = [{ id: 1, pp: 5 }, { id: 2, pp: 5 }, { id: 3, pp: 5 }, { id: 4, pp: 5 }, { id: 5, pp: 5 }]))).toThrow(/moves/);
    expect(bad((d) => (((d.party as Record<string, unknown>[])[0] as Record<string, unknown>).moves = [{ id: 99999, pp: 5 }]))).toThrow(/move/);
    expect(bad((d) => (d.money = -5))).toThrow(/money/);
    expect(
      bad((d) => {
        d.party = new Array(7).fill(data.party[0]);
      }),
    ).toThrow(/party/);
    expect(bad((d) => ((d.items as Record<string, unknown>).potions = 'lots'))).toThrow(/item/);
    expect(bad((d) => (d.settings = { gameSpeed: 'fast', speed: {} }))).toThrow(/settings/);
    expect(bad((d) => ((d.settings as Record<string, unknown>).speed = { speedBase: -1 }))).toThrow(/speed/);
    expect(bad((d) => (d.pokedex = { '387': { seen: 'yes' } }))).toThrow(/pokedex/);
    expect(() => validateSave(null)).toThrow(SaveError);
    expect(() => validateSave('nope')).toThrow(SaveError);
  });

  it('drops unknown levels and clamps EXP and HP into range', () => {
    const copy = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    (copy.progress as Record<string, unknown>)['old-level'] = { wavesCleared: 1, won: true, completed: true };
    const party = copy.party as Record<string, unknown>[];
    party[0]!.exp = 1;
    party[0]!.hp = 999;
    const valid = validateSave(copy);
    expect(valid.progress['old-level']).toBeUndefined();
    const restored = restoreGame(valid);
    expect(restored.party[0]?.level).toBe(12);
    expect(restored.party[0]?.hp).toBe(restored.party[0]?.stats.hp);
  });
});
