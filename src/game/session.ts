/**
 * The running game: a single GameState shared by scenes, loaded from
 * localStorage on startup and saved after every change.
 */
import partyDebug from '../data/party-debug.json';
import { addPokemon, chooseStarter, createGameState, type GameState } from '../sim/game';
import { createMonster } from '../sim/monster';
import { SaveError } from '../sim/save';
import { urlParam } from './runtime';
import { restoreGame } from '../sim/save';
import { applySettings, clearSave, gameFromCode, readSave, saveCodeFor, writeSave } from './storage';

export const STARTERS = [387, 390, 393] as const;
export const STARTER_LEVEL = 5;

let game: GameState = createGameState();
let loaded = false;

/** Loads the stored save once (no-op afterwards). */
export function loadGameOnce(): void {
  if (loaded) return;
  loaded = true;
  const data = readSave();
  if (data) {
    game = restoreGame(data);
    applySettings(data);
  }
}

export function getGame(): GameState {
  loadGameOnce();
  return game;
}

/** Persists the current game and settings. */
export function saveGame(): void {
  writeSave(game);
}

export function resetGame(): GameState {
  clearSave();
  game = createGameState();
  loaded = true;
  return game;
}

/** `?party=debug` loads the test party instead of the starter flow. */
export function loadDebugPartyIfRequested(): boolean {
  if (urlParam('party') !== 'debug' || getGame().party.length > 0) return false;
  const party = (partyDebug as { party: { species: number; level: number; moves?: number[]; shiny?: boolean }[] }).party;
  game.starter = party[0]?.species ?? 387;
  for (const p of party) addPokemon(game, createMonster(p.species, p.level, p.moves, { shiny: p.shiny ?? false }));
  return true;
}

export function pickStarter(species: number): void {
  if (!(STARTERS as readonly number[]).includes(species)) throw new Error(`not a starter: ${species}`);
  chooseStarter(getGame(), species, createMonster(species, STARTER_LEVEL));
  saveGame();
}

export function needsStarter(): boolean {
  const g = getGame();
  return g.starter === undefined && g.party.length === 0;
}

export function currentSaveCode(): string {
  return saveCodeFor(getGame());
}

/** Replaces the game with an imported code. Returns an error message or null. */
export function importSaveCode(code: string): string | null {
  try {
    const { game: imported, data } = gameFromCode(code);
    game = imported;
    loaded = true;
    applySettings(data);
    saveGame();
    return null;
  } catch (err) {
    return err instanceof SaveError ? err.message : 'could not read that code';
  }
}
