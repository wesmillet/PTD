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

export interface DexEntry {
  seen: boolean;
  caught: boolean;
  shinyCaught: boolean;
}

export interface Inventory {
  balls: Record<string, number>;
  potions: number;
  rareCandies: number;
}

export interface GameState {
  starter?: number;
  party: Monster[];
  box: Monster[];
  progress: Record<string, LevelProgress>;
  items: Inventory;
  money: number;
  pokedex: Record<string, DexEntry>;
}

export const MAX_PARTY = config.party.maxParty;

export function createGameState(): GameState {
  return {
    party: [],
    box: [],
    progress: {},
    items: { balls: { ...config.startingItems.balls }, potions: config.startingItems.potions, rareCandies: config.startingItems.rareCandies },
    money: config.money.starting,
    pokedex: {},
  };
}

export function dexEntry(game: GameState, species: number): DexEntry {
  return (game.pokedex[String(species)] ??= { seen: false, caught: false, shinyCaught: false });
}

export function markSeen(game: GameState, species: number): void {
  dexEntry(game, species).seen = true;
}

export function markCaught(game: GameState, species: number, shiny: boolean): void {
  const e = dexEntry(game, species);
  e.seen = true;
  e.caught = true;
  if (shiny) e.shinyCaught = true;
}

export function dexCounts(game: GameState): { seen: number; caught: number; shiny: number } {
  let seen = 0;
  let caught = 0;
  let shiny = 0;
  for (const e of Object.values(game.pokedex)) {
    if (e.seen) seen++;
    if (e.caught) caught++;
    if (e.shinyCaught) shiny++;
  }
  return { seen, caught, shiny };
}

/** Money for a finished level: per KO plus the clear bonus when it counts as cleared. */
export function levelMoney(kos: number, cleared: boolean): number {
  return kos * config.money.perKo + (cleared ? config.money.perLevelCleared : 0);
}

export function spendMoney(game: GameState, amount: number): void {
  if (amount > game.money) throw new Error('not enough money');
  game.money -= amount;
}

export function chooseStarter(game: GameState, species: number, starter: Monster): void {
  if (game.starter !== undefined) throw new Error('starter already chosen');
  game.starter = species;
  game.party.unshift(starter);
  markCaught(game, species, starter.shiny);
}

/** Adds a Pokémon to the party if there is room, else to the box. Returns where it went. */
export function addPokemon(game: GameState, mon: Monster): 'party' | 'box' {
  markCaught(game, mon.species, mon.shiny);
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

/** Records a level outcome, awards money, and returns whether the run counted as cleared. */
export function recordLevelResult(game: GameState, levelId: string, outcome: 'won' | 'lost' | 'left', wavesCleared: number, kos = 0): boolean {
  const def = getLevel(levelId);
  const prev = game.progress[levelId] ?? { wavesCleared: 0, won: false, completed: false };
  const progress: LevelProgress = { ...prev, wavesCleared: Math.max(prev.wavesCleared, wavesCleared) };
  let cleared = false;
  if (def.objective === 'defend') {
    if (outcome === 'won') {
      progress.won = true;
      cleared = true;
    }
    progress.completed = progress.won;
  } else if (wavesCleared >= 1 && outcome !== 'lost') {
    progress.completed = true;
    cleared = true;
  }
  game.progress[levelId] = progress;
  game.money += levelMoney(kos, cleared);
  return cleared;
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
