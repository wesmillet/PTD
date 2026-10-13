/**
 * The running game: a single GameState shared by scenes. Phase 4 adds
 * persistence; for now it lives for the page session.
 */
import partyDebug from '../data/party-debug.json';
import { addPokemon, chooseStarter, createGameState, type GameState } from '../sim/game';
import { createMonster } from '../sim/monster';
import { urlParam } from './runtime';

export const STARTERS = [387, 390, 393] as const;
export const STARTER_LEVEL = 5;

let game: GameState = createGameState();

export function getGame(): GameState {
  return game;
}

export function resetGame(): GameState {
  game = createGameState();
  return game;
}

/** `?party=debug` loads the test party instead of the starter flow. */
export function loadDebugPartyIfRequested(): boolean {
  if (urlParam('party') !== 'debug' || game.party.length > 0) return false;
  const party = (partyDebug as { party: { species: number; level: number; moves?: number[]; shiny?: boolean }[] }).party;
  game.starter = party[0]?.species ?? 387;
  for (const p of party) addPokemon(game, createMonster(p.species, p.level, p.moves, { shiny: p.shiny ?? false }));
  return true;
}

export function pickStarter(species: number): void {
  if (!(STARTERS as readonly number[]).includes(species)) throw new Error(`not a starter: ${species}`);
  chooseStarter(game, species, createMonster(species, STARTER_LEVEL));
}

export function needsStarter(): boolean {
  return game.starter === undefined && game.party.length === 0;
}
