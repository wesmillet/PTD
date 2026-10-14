import { describe, expect, it } from 'vitest';
import { getPokemon } from '../data/pokedata';
import { createGameState } from './game';
import { createMonster } from './monster';
import { challengeLevel, challengeRoutes, claimDailyTicket, drawBalls, keepPrize, pickBall, playTicket, prize, PRIZE_LEVEL, refundTicket, reroll, shinyPool, startDraw } from './lottery';
import { Rng } from './rng';

describe('the Shiny lottery', () => {
  it('gives one ticket per real day', () => {
    const game = createGameState();
    expect(claimDailyTicket(game, '2026-10-14')).toBe(true);
    expect(claimDailyTicket(game, '2026-10-14')).toBe(false);
    expect(game.tickets).toBe(1);
    expect(claimDailyTicket(game, '2026-10-15')).toBe(true);
    expect(game.tickets).toBe(2);
  });

  it('draws from every base species with shiny sprites, legendaries excluded, favourites three times as likely', () => {
    const pool = shinyPool();
    expect(pool.length).toBeGreaterThan(200);
    expect(pool).not.toContain(150);
    expect(pool).not.toContain(493);
    expect(pool).toContain(133);
    const counts = new Map<number, number>();
    for (let i = 0; i < 3000; i++) for (const id of drawBalls(i, new Rng(i), false).balls) counts.set(id, (counts.get(id) ?? 0) + 1);
    const fav = [133, 443, 448, 6, 149, 131, 143].reduce((s, id) => s + (counts.get(id) ?? 0), 0) / 7;
    const plain = pool.filter((id) => ![133, 443, 448, 6, 149, 131, 143].includes(id)).slice(0, 60).reduce((s, id) => s + (counts.get(id) ?? 0), 0) / 60;
    expect(fav).toBeGreaterThan(plain * 1.8);
  });

  it('pick, reroll once (twice with the Shiny Charm), prize at level 20 in a Premier Ball', () => {
    const draw = drawBalls(7, new Rng(7), false);
    expect(draw.balls).toHaveLength(3);
    expect(new Set(draw.balls).size).toBe(3);
    expect(() => reroll(draw, new Rng(1))).toThrow(/pick/);
    const first = pickBall(draw, 1);
    const second = reroll(draw, new Rng(2));
    expect(second).not.toBe(first);
    expect(draw.previous).toBe(first);
    expect(() => reroll(draw, new Rng(3))).toThrow(/no rerolls/);
    const mon = prize(draw);
    expect(mon.level).toBe(PRIZE_LEVEL);
    expect(mon.shiny).toBe(true);
    expect(mon.ball).toBe('premier');
    expect(mon.memo).toBe('Lottery ticket #7');
    expect(mon.moves.length).toBeGreaterThan(0);
    const game = createGameState();
    game.flags.push('shiny-charm');
    const charmed = startDraw(game, 3);
    expect(charmed.rerollsLeft).toBe(2);
    expect(keepPrize(game, { ...draw })).toBe('party');
    expect(game.party[0]?.species).toBe(second);
    expect(getPokemon(second).name).toBeTruthy();
  });

  it('a ticket buys a challenge on a cleared route with a modifier; a lost one is refunded', () => {
    const game = createGameState();
    game.party.push(createMonster(387, 20));
    game.tickets = 1;
    expect(challengeRoutes(game).length).toBeGreaterThan(0);
    const no = playTicket(game);
    expect(no).toBe(1);
    expect(game.tickets).toBe(0);
    const { def, mode, route } = challengeLevel(game, 11);
    expect(def.objective).toBe('defend');
    expect(def.waves).toBe(5);
    expect(def.rules?.[0]).toMatchObject({ id: 'challenge', mode });
    expect(def.name).toContain(route.includes('route') ? 'Route' : 'Lake');
    expect(def.trainer).toBeUndefined();
    expect(() => playTicket(game)).toThrow(/no tickets/);
    refundTicket(game);
    expect(game.tickets).toBe(1);
  });
});
