/**
 * Pure game-wide state: starter, party, PC boxes, level completion, items,
 * money, badges. No Phaser imports.
 */
import badgesJson from '../data/badges.json';
import config from '../data/config.json';
import { getLevel, levelIds } from '../data/levels';
import type { LevelDef } from './waves';
import type { Monster } from './monster';
import { createBoxes, depositToBox, type Box } from './pc';

export { sortMonsters, type SortKey } from './pc';

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
  boxes: Box[];
  progress: Record<string, LevelProgress>;
  items: Inventory;
  money: number;
  pokedex: Record<string, DexEntry>;
  /** Badge ids in the order they were won. */
  badges: string[];
  /** Story flags, key items, TMs and HMs ("surf", "tm-grass-knot", "oaks-letter", "noble-kleavor"). */
  flags: string[];
  /** Conference wins so far. */
  conferenceWins?: number;
  /** Lottery tickets in hand. */
  tickets?: number;
  /** The Conference run in progress (src/sim/conference.ts). */
  conference?: unknown;
  /** A lottery challenge just finished: the draw is owed ("won") or the ticket is kept ("lost"). */
  lotteryPending?: 'won' | 'lost';
}

export const MAX_PARTY = config.party.maxParty;

export function createGameState(): GameState {
  return {
    party: [],
    boxes: createBoxes(),
    progress: {},
    items: { balls: { ...config.startingItems.balls }, potions: config.startingItems.potions, rareCandies: config.startingItems.rareCandies },
    money: config.money.starting,
    pokedex: {},
    badges: [],
    flags: [],
  };
}

export function hasFlag(game: GameState, flag: string): boolean {
  return game.flags.includes(flag);
}

export function setFlag(game: GameState, flag: string): void {
  if (!game.flags.includes(flag)) game.flags.push(flag);
}

/** Adds items by id: ball ids, "potion", "rare-candy"; anything else becomes a flag (key items, TMs). */
export function giveItems(game: GameState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) {
    if (id in config.balls) game.items.balls[id] = (game.items.balls[id] ?? 0) + n;
    else if (id === 'potion') game.items.potions += n;
    else if (id === 'rare-candy') game.items.rareCandies += n;
    else setFlag(game, id);
  }
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

/** Adds a Pokémon to the party if there is room, else to the first free box slot. Returns where it went. */
export function addPokemon(game: GameState, mon: Monster): 'party' | 'box' {
  markCaught(game, mon.species, mon.shiny);
  if (game.party.length < MAX_PARTY) {
    game.party.push(mon);
    return 'party';
  }
  depositToBox(game, mon);
  return 'box';
}

/** Records a level outcome, awards money and badges, and returns whether the run counted as cleared. */
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
  } else if (outcome === 'won' || (wavesCleared >= 1 && outcome !== 'lost')) {
    progress.completed = true;
    if (outcome === 'won') progress.won = true;
    cleared = true;
  }
  game.progress[levelId] = progress;
  if (!def.noMoney) game.money += levelMoney(kos, cleared);
  const badge = def.badge ?? def.reward?.badge;
  if (outcome === 'won' && badge && !game.badges.includes(badge.id)) game.badges.push(badge.id);
  if (outcome === 'won' && def.reward && !prev.won) {
    const r = def.reward;
    if (r.money) game.money += r.money;
    if (r.items) giveItems(game, r.items);
    if (r.tm) setFlag(game, `tm-${r.tm}`);
    for (const f of r.flags ?? []) setFlag(game, f);
  }
  return cleared;
}

/** Placement limit for a level: demo saves get the level's, others grow one per badge from two. */
export function placementLimit(game: GameState, def: Pick<LevelDef, 'placements'>): number {
  if (DEMO_MODE) return def.placements;
  return Math.max(1, Math.min(def.placements, 2 + game.badges.length));
}

export function hasBadge(game: GameState, badgeId: string): boolean {
  return game.badges.includes(badgeId);
}

export interface BadgeInfo {
  id: string;
  name: string;
  leader: string;
  gym: string;
  /** The level that awards it, once one does. */
  levelId?: string;
}

/** The eight Sinnoh badges (src/data/badges.json), each with the level that awards it when one exists. */
export function allBadges(): BadgeInfo[] {
  const awardedBy = new Map<string, string>();
  for (const id of levelIds()) {
    const badge = getLevel(id).badge;
    if (badge) awardedBy.set(badge.id, id);
  }
  return (badgesJson.badges as Omit<BadgeInfo, 'levelId'>[]).map((b) => {
    const levelId = awardedBy.get(b.id);
    return levelId ? { ...b, levelId } : { ...b };
  });
}

export function isLevelCompleted(game: GameState, levelId: string): boolean {
  return game.progress[levelId]?.completed ?? false;
}

/** Demo builds open every level from the start (config.json `demoMode`; off for release). */
export const DEMO_MODE: boolean = (config as { demoMode?: boolean }).demoMode ?? false;

export function isLevelUnlocked(game: GameState, levelId: string): boolean {
  if (DEMO_MODE) return true;
  return unlockBlockers(game, levelId).length === 0;
}

/** What still keeps a level locked, in words (empty when open). */
export function unlockBlockers(game: GameState, levelId: string): string[] {
  const def = getLevel(levelId);
  const out: string[] = [];
  const requires = (def as { requires?: string | null }).requires;
  if (requires && !isLevelCompleted(game, requires)) out.push(`clear ${getLevel(requires).name}`);
  const u = def.unlock;
  for (const id of u?.levels ?? []) if (!isLevelCompleted(game, id)) out.push(`clear ${getLevel(id).name}`);
  for (const b of u?.badges ?? []) if (!hasBadge(game, b)) out.push(`the ${b} badge`);
  for (const f of [...(u?.items ?? []), ...(u?.flags ?? [])]) if (!hasFlag(game, f)) out.push(f.replace(/-/g, ' '));
  return out;
}

/** Level ids in unlock order (as listed in levels.json). */
export function orderedLevelIds(): string[] {
  return levelIds();
}
