/**
 * Jubilife TV's Lottery Corner: one ticket per real day plus Conference
 * tickets, a randomised challenge level on a cleared route, then the
 * three-ball draw from every species with shiny sprites (favourites
 * weighted 3x, legendaries excluded) with one reroll (two with the Shiny
 * Charm). The prize arrives at level 20 in a Premier Ball. Pure.
 */
import { getLevel, levelIds } from '../data/levels';
import { getEvolutions, getPokemon } from '../data/pokedata';
import spriteFolders from '../data/spriteFolders.json';
import { CHALLENGE_MODES, type ChallengeMode } from './rules/challengeModes';
import { addPokemon, DEMO_MODE, hasFlag, isLevelCompleted, type GameState } from './game';
import { createMonster, type Monster } from './monster';
import { Rng } from './rng';
import type { LevelDef } from './waves';

const FOLDERS = spriteFolders as Record<string, { shiny?: boolean }>;
export const PRIZE_LEVEL = 20;
export const PRIZE_BALL = 'premier';
/** Starters, pseudo-legendaries and fan favourites: three times as likely. */
const FAVOURITES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 152, 153, 154, 155, 156, 157, 158, 159, 160, 252, 253, 254, 255, 256, 257, 258, 259, 260, 387, 388, 389, 390, 391, 392, 393, 394, 395,
  133, 134, 135, 136, 196, 197, 470, 471, 443, 444, 445, 448, 149, 131, 143, 248, 373, 376,
]);
const LEGENDARY = new Set([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493]);

export interface LotteryDraw {
  ticketNo: number;
  /** The three balls' species. */
  balls: number[];
  /** Index of the ball picked, once picked. */
  picked?: number;
  rerollsLeft: number;
  /** The first result, kept when a reroll replaces it. */
  previous?: number;
}

export function today(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Claims the day's ticket if it has not been claimed yet; returns whether one was added. */
export function claimDailyTicket(game: GameState, day = today()): boolean {
  if (game.lotteryDay === day) return false;
  game.lotteryDay = day;
  game.tickets = (game.tickets ?? 0) + 1;
  return true;
}

/** Species that can come out of a ball: base species with shiny sprites, no legendaries. */
export function shinyPool(): number[] {
  const out: number[] = [];
  for (const [folder, info] of Object.entries(FOLDERS)) {
    if (!info.shiny || folder.includes('-')) continue;
    const id = Number(folder);
    if (LEGENDARY.has(id)) continue;
    try {
      getPokemon(id);
    } catch {
      continue;
    }
    out.push(id);
  }
  return out.sort((a, b) => a - b);
}

export function prizeWeight(species: number): number {
  if (FAVOURITES.has(species)) return 3;
  // Final evolutions of a favourite line count too (Charizard is listed; Umbreon through Eevee).
  return 1;
}

function weightedPick(pool: readonly number[], rng: Rng): number {
  const total = pool.reduce((s, id) => s + prizeWeight(id), 0);
  let r = rng.next() * total;
  for (const id of pool) {
    r -= prizeWeight(id);
    if (r < 0) return id;
  }
  return pool[pool.length - 1]!;
}

/** The routes a challenge may use: cleared free routes (every opening route in demo mode). */
export function challengeRoutes(game: GameState): string[] {
  return levelIds().filter((id) => {
    const def = getLevel(id);
    if (def.objective !== 'free' || def.rift) return false;
    return DEMO_MODE || isLevelCompleted(game, id);
  });
}

/** A randomised challenge on a cleared route: five defend waves with the modifier drawn for the ticket. */
export function challengeLevel(game: GameState, seed: number): { def: LevelDef; mode: ChallengeMode; route: string } {
  const rng = new Rng(seed);
  const routes = challengeRoutes(game);
  if (routes.length === 0) throw new Error('no cleared route to play the challenge on');
  const route = rng.pick(routes);
  const base = getLevel(route);
  const mode = rng.pick(CHALLENGE_MODES);
  const params: Record<string, unknown> = { id: 'challenge', mode };
  if (mode === 'monotype') params.type = game.party[0]?.types[0] ?? 12;
  if (mode === 'level-cap') params.cap = Math.max(10, Math.min(...game.party.map((m) => m.level), 30));
  if (mode === 'speedrun') params.seconds = 240;
  const def: LevelDef = {
    ...base,
    name: `Lottery: ${base.name} (${mode})`,
    objective: 'defend',
    waves: 5,
    lives: 5,
    rules: [params as LevelDef['rules'] extends (infer R)[] | undefined ? R : never],
    enemiesFirstWave: 4,
    enemiesPerWave: 1,
    trainer: undefined as never,
    reward: undefined as never,
    badge: undefined as never,
  };
  return { def, mode, route };
}

/** Three balls for the counter, seeded by the ticket number. */
export function drawBalls(ticketNo: number, rng: Rng, shinyCharm: boolean): LotteryDraw {
  const pool = shinyPool();
  const balls: number[] = [];
  while (balls.length < 3) {
    const id = weightedPick(pool, rng);
    if (!balls.includes(id)) balls.push(id);
  }
  return { ticketNo, balls, rerollsLeft: shinyCharm ? 2 : 1 };
}

export function pickBall(draw: LotteryDraw, index: number): number {
  if (index < 0 || index >= draw.balls.length) throw new Error('no such ball');
  draw.picked = index;
  return draw.balls[index]!;
}

/** Rerolls the picked ball: the other two shake again and a fresh species replaces it. */
export function reroll(draw: LotteryDraw, rng: Rng): number {
  if (draw.picked === undefined) throw new Error('pick a ball first');
  if (draw.rerollsLeft <= 0) throw new Error('no rerolls left');
  draw.rerollsLeft -= 1;
  draw.previous = draw.balls[draw.picked];
  const pool = shinyPool().filter((id) => !draw.balls.includes(id));
  const fresh = weightedPick(pool, rng);
  draw.balls[draw.picked] = fresh;
  return fresh;
}

/** The prize: level 20, shiny, its Platinum moveset, in a Premier Ball with the ticket number as its memo. */
export function prize(draw: LotteryDraw): Monster {
  if (draw.picked === undefined) throw new Error('pick a ball first');
  const mon = createMonster(draw.balls[draw.picked]!, PRIZE_LEVEL, undefined, { shiny: true });
  mon.ball = PRIZE_BALL;
  mon.memo = `Lottery ticket #${draw.ticketNo}`;
  return mon;
}

/** Spends a ticket for a challenge; returns the ticket number. */
export function playTicket(game: GameState): number {
  if ((game.tickets ?? 0) <= 0) throw new Error('no tickets');
  game.tickets = (game.tickets ?? 0) - 1;
  game.lotteryPlayed = (game.lotteryPlayed ?? 0) + 1;
  return game.lotteryPlayed;
}

/** A lost challenge gives the daily ticket back. */
export function refundTicket(game: GameState): void {
  game.tickets = (game.tickets ?? 0) + 1;
}

/** Starts the draw after a won challenge. */
export function startDraw(game: GameState, seed: number): LotteryDraw {
  return drawBalls(game.lotteryPlayed ?? 1, new Rng(seed), hasFlag(game, 'shiny-charm'));
}

/** Hands the prize over: party if there is room, else the PC. */
export function keepPrize(game: GameState, draw: LotteryDraw): 'party' | 'box' {
  return addPokemon(game, prize(draw));
}

/** Helper for the UI: the evolution family hint shown on the ball. */
export function evolvesFurther(species: number): boolean {
  return getEvolutions(species).length > 0;
}
