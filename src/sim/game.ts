/**
 * Pure game-wide state: starter, party, PC box, level completion, items.
 * Saved by Phase 4. No Phaser imports.
 */
import config from '../data/config.json';
import { getLevel, levelIds } from '../data/levels';
import { typeName } from '../data/pokedata';
import type { Monster } from './monster';

export interface LevelProgress {
  /** Waves cleared on the best run. */
  wavesCleared: number;
  /** Defend levels: won at least once. */
  won: boolean;
  /** Free levels: completed (left after clearing at least one wave). */
  completed: boolean;
}

export interface GameState {
  starter?: number;
  party: Monster[];
  box: Monster[];
  progress: Record<string, LevelProgress>;
  items: { balls: Record<string, number> };
}

export const MAX_PARTY = config.party.maxParty;

export function createGameState(): GameState {
  return {
    party: [],
    box: [],
    progress: {},
    items: { balls: { ...config.startingItems.balls } },
  };
}

export function chooseStarter(game: GameState, species: number, starter: Monster): void {
  if (game.starter !== undefined) throw new Error('starter already chosen');
  game.starter = species;
  game.party.unshift(starter);
}

/** Adds a Pokémon to the party if there is room, else to the box. Returns where it went. */
export function addPokemon(game: GameState, mon: Monster): 'party' | 'box' {
  if (game.party.length < MAX_PARTY) {
    game.party.push(mon);
    return 'party';
  }
  game.box.push(mon);
  return 'box';
}

export function moveToBox(game: GameState, index: number): void {
  const mon = game.party[index];
  if (!mon) throw new Error(`no party member ${index}`);
  if (game.party.length <= 1) throw new Error('the party needs at least one Pokémon');
  game.party.splice(index, 1);
  game.box.push(mon);
}

export function moveToParty(game: GameState, boxIndex: number): void {
  const mon = game.box[boxIndex];
  if (!mon) throw new Error(`no box entry ${boxIndex}`);
  if (game.party.length >= MAX_PARTY) throw new Error('the party is full');
  game.box.splice(boxIndex, 1);
  game.party.push(mon);
}

/** Swaps a party member with a box Pokémon. */
export function swapPartyBox(game: GameState, partyIndex: number, boxIndex: number): void {
  const a = game.party[partyIndex];
  const b = game.box[boxIndex];
  if (!a || !b) throw new Error('bad swap indices');
  game.party[partyIndex] = b;
  game.box[boxIndex] = a;
}

export type SortKey = 'level' | 'type' | 'name';

export function sortMonsters(list: Monster[], key: SortKey): Monster[] {
  const sorted = [...list];
  switch (key) {
    case 'level':
      sorted.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
      break;
    case 'type':
      sorted.sort((a, b) => typeName(a.types[0] ?? 0).localeCompare(typeName(b.types[0] ?? 0)) || b.level - a.level);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name) || b.level - a.level);
      break;
  }
  return sorted;
}

/** Records a level outcome and returns whether it now counts as completed. */
export function recordLevelResult(game: GameState, levelId: string, outcome: 'won' | 'lost' | 'left', wavesCleared: number): boolean {
  const def = getLevel(levelId);
  const prev = game.progress[levelId] ?? { wavesCleared: 0, won: false, completed: false };
  const progress: LevelProgress = { ...prev, wavesCleared: Math.max(prev.wavesCleared, wavesCleared) };
  if (def.objective === 'defend') {
    if (outcome === 'won') progress.won = true;
    progress.completed = progress.won;
  } else {
    if (wavesCleared >= 1 && outcome !== 'lost') progress.completed = true;
  }
  game.progress[levelId] = progress;
  return progress.completed;
}

export function isLevelCompleted(game: GameState, levelId: string): boolean {
  return game.progress[levelId]?.completed ?? false;
}

export function isLevelUnlocked(game: GameState, levelId: string): boolean {
  const def = getLevel(levelId);
  const requires = (def as { requires?: string | null }).requires;
  if (!requires) return true;
  return isLevelCompleted(game, requires);
}

/** Level ids in unlock order (as listed in levels.json). */
export function orderedLevelIds(): string[] {
  return levelIds();
}
