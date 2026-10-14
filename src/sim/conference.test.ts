import { describe, expect, it } from 'vitest';
import { getMap } from '../data/maps';
import { findMoveId, findPokemonId } from '../data/pokedata';
import { TRAINER_ART } from '../data/trainers';
import { applyConferenceResult, buyFromVendor, drawBracket, FLOORS, nextOpponent, PLAYER, resolveRound, ROSTER, roundLevel, roundParty, rosterEntry, simulateMatch, spinFloor } from './conference';
import { createGameState, hasFlag } from './game';
import { createLevel, placeTower, startWave, step, type LevelState } from './level';
import { createMonster } from './monster';
import { Rng } from './rng';
import { partySpecies, waveTrainers } from './waves';
import spriteFolders from '../data/spriteFolders.json';
import { dexFolder } from '../game/runtime';

const folders = spriteFolders as Record<string, unknown>;

function run(state: LevelState, seconds: number, dt = 1 / 20): void {
  for (let t = 0; t < seconds; t += dt) step(state, dt);
}

describe('the Sinnoh Conference', () => {
  it('roster: every trainer has art or a silhouette, and every team member has data, sprites and a known signature move', () => {
    for (const r of ROSTER) {
      if (!r.silhouette) expect(TRAINER_ART[r.id], r.id).toBeDefined();
      for (const name of r.team) {
        const id = partySpecies(name, 387, r.id);
        expect(folders[dexFolder(id)], `${r.id}: ${name}`).toBeDefined();
      }
      expect(findMoveId(r.signature), `${r.id}: ${r.signature}`).toBeDefined();
      for (const sig of Object.values(r.signatures ?? {})) expect(findMoveId(sig)).toBeDefined();
    }
    expect(ROSTER.filter((r) => r.tier === 'legend').map((r) => r.id)).toEqual(['champion-cynthia', 'tobias']);
  });

  it('draws sixteen entrants with the player, the top four seeds one per quarter, deterministic per seed', () => {
    const a = drawBracket(42);
    const b = drawBracket(42);
    expect(a).toEqual(b);
    expect(a.entrants).toHaveLength(16);
    expect(new Set(a.entrants).size).toBe(16);
    expect(a.entrants).toContain(PLAYER);
    const quarters = [0, 1, 2, 3].map((q) => a.entrants.slice(q * 4, q * 4 + 4));
    const legends = quarters.map((qs) => qs.filter((id) => rosterEntry(id)?.tier === 'legend').length);
    expect(Math.max(...legends)).toBeLessThanOrEqual(1);
    expect(a.rounds[0]).toHaveLength(8);
    expect(nextOpponent(a)).toBeDefined();
    const champions = drawBracket(7, { champions: true });
    const tiers = champions.entrants.filter((id) => id !== PLAYER).map((id) => rosterEntry(id)?.tier);
    expect(tiers.filter((t) => t === 'legend' || t === 'elite')).toHaveLength(9); // every Elite-or-above trainer in the roster
    expect(tiers).not.toContain('rival');
    expect(tiers).not.toContain('wildcard');
  });

  it('wildcards appear in about one run in six', () => {
    let runs = 0;
    for (let seed = 1; seed <= 120; seed++) if (drawBracket(seed).entrants.some((id) => rosterEntry(id)?.wildcard)) runs++;
    expect(runs).toBeGreaterThan(6);
    expect(runs).toBeLessThan(40);
  });

  it('simulates the other matches from power ratings and advances the player on a win', () => {
    const rng = new Rng(3);
    let strong = 0;
    for (let i = 0; i < 200; i++) if (simulateMatch('champion-cynthia', 'trainer-cheryl', rng) === 'champion-cynthia') strong++;
    expect(strong).toBeGreaterThan(180);
    const run = drawBracket(5);
    spinFloor(run);
    expect(Object.keys(FLOORS)).toContain(run.floors[0]);
    resolveRound(run, true);
    expect(run.round).toBe(1);
    expect(run.rounds[1]).toHaveLength(4);
    expect(run.rounds[0]!.every((m) => m.winner)).toBe(true);
    expect(nextOpponent(run)).toBeDefined();
    resolveRound(run, true);
    resolveRound(run, true);
    resolveRound(run, true);
    expect(run.result).toBe('won');
    expect(run.round).toBe(4);
    const lost = drawBracket(6);
    resolveRound(lost, false);
    expect(lost.result).toBe('lost');
  });

  it('builds round levels: 3, 4, 5 then 6 Pokémon, the ace a boss (5x HP in the final), the floor rule on the stadium map', () => {
    const cynthia = rosterEntry('champion-cynthia')!;
    expect(roundParty(cynthia, 0, new Rng(1))).toHaveLength(3);
    const final = roundParty(cynthia, 3, new Rng(1));
    expect(final).toHaveLength(6);
    expect(final[5]).toMatchObject({ species: 'garchomp', boss: true, hpMultiplier: 5 });
    expect(final[5]!.moves![0]!.move).toBe('dragon-rush');
    const tobias = roundParty(rosterEntry('tobias')!, 0, new Rng(1));
    expect(tobias.filter((p) => p.boss).map((p) => p.species)).toEqual(['darkrai', 'latios']);
    const run = drawBracket(9);
    run.round = 3;
    const def = roundLevel(run, 'champion-cynthia', 'ice');
    expect(def.map).toBe('stadium-ice');
    expect(def.rules?.[0]).toMatchObject({ id: 'stadium', floor: 'ice' });
    expect(def.waves).toHaveLength(6);
    expect(waveTrainers((def.waves as never[])[5])[0]!.party[0]).toMatchObject({ boss: true, hpMultiplier: 5 });
  });

  it('plays a round of 16 against a leader on the grass field to the end', () => {
    const run0 = drawBracket(11);
    const def = roundLevel(run0, 'leader-roark', 'grass');
    const map = getMap(def.map);
    const party = [createMonster(389, 100, [findMoveId('earthquake')!]), createMonster(395, 100, [findMoveId('surf')!])];
    const state = createLevel(def, map, { seed: 2, party, starter: 387 });
    placeTower(state, 0, ...map.placeable[0]!);
    placeTower(state, 1, ...map.placeable[1]!);
    let guard = 0;
    while (state.phase === 'build' && guard++ < 5) {
      startWave(state);
      run(state, 120);
    }
    expect(state.phase).toBe('won');
    expect(state.trainersBeaten).toContain('Roark');
    expect(findPokemonId('cranidos')).toBeDefined();
  });

  it('rewards: trophy, money and a Master Ball the first time; a stone or ticket every time; the Legend ribbon for Tobias', () => {
    const game = createGameState();
    const run = drawBracket(21);
    run.rounds = [[{ a: PLAYER, b: 'tobias', winner: PLAYER }]];
    run.result = 'won';
    const money = game.money;
    const lines = applyConferenceResult(game, run, new Rng(1));
    expect(hasFlag(game, 'trophy')).toBe(true);
    expect(game.money).toBe(money + 20000);
    expect(game.items.balls.master).toBe(1);
    expect(hasFlag(game, 'legend-ribbon')).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    game.conferenceWins = 2;
    applyConferenceResult(game, run, new Rng(2));
    expect(hasFlag(game, 'champions-bracket')).toBe(true);
    expect((game.tickets ?? 0) + game.flags.filter((f) => f.endsWith('ite')).length).toBeGreaterThanOrEqual(1);
  });

  it('locker room vendor sells five potions and five Ultra Balls per run', () => {
    const game = createGameState();
    const run = drawBracket(1);
    game.money = 100000;
    for (let i = 0; i < 5; i++) expect(buyFromVendor(game, run, 'ultra')).toBeNull();
    expect(buyFromVendor(game, run, 'ultra')).toBe('sold out');
    expect(game.items.balls.ultra).toBe(2 + 5);
    expect(buyFromVendor(game, run, 'potion')).toBeNull();
    expect(game.items.potions).toBe(3);
    game.money = 0;
    expect(buyFromVendor(game, run, 'potion')).toBe('not enough money');
  });
});
