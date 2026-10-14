/**
 * The Sinnoh Conference: a sixteen-trainer single-elimination bracket
 * drawn fresh each run from the roster in src/data/conference.json. Pure:
 * the draw, the simulated matches on the board, the round levels and the
 * rewards; no Phaser imports.
 */
import conferenceJson from '../data/conference.json';
import { addPokemon, giveItems, setFlag, hasFlag, type GameState } from './game';
import { createMonster } from './monster';
import { Rng } from './rng';
import type { LevelDef, TrainerDef, TrainerPokemonDef, WaveDef } from './waves';

export type Tier = 'legend' | 'elite' | 'frontier' | 'leader' | 'rival' | 'wildcard';

export interface RosterEntry {
  id: string;
  name: string;
  tier: Tier;
  power: number;
  team: string[];
  signature: string;
  signatures?: Record<string, string>;
  /** Indices of team members that are bosses (default: the last one). */
  bosses?: number[];
  silhouette?: boolean;
  wildcard?: boolean;
  tag?: boolean;
  legend?: boolean;
}

export interface Floor {
  map: string;
  name: string;
  rule: string;
}

const data = conferenceJson as unknown as {
  tiers: Record<Tier, { min: number; max: number; levels: [number, number] }>;
  roster: RosterEntry[];
  floors: Record<string, Floor>;
  rounds: { name: string; pokemon: number; aceHp?: number }[];
  vendor: Record<string, { count: number; price: number }>;
  rewards: { firstWinMoney: number; megaStones: string[] };
};

export const ROSTER: RosterEntry[] = data.roster;
export const FLOORS = data.floors;
export const ROUNDS = data.rounds;
export const VENDOR = data.vendor;
export const PLAYER = 'player';
export const WILDCARD_ODDS = 1 / 6;

export interface Match {
  a: string;
  b: string;
  winner?: string;
}

export interface ConferenceRun {
  seed: number;
  /** Sixteen entrant ids in bracket order; PLAYER is the player. */
  entrants: string[];
  /** Matches per round (8, 4, 2, 1), filled in as rounds resolve. */
  rounds: Match[][];
  /** The round the player is about to play (0..3), or 4 when the run is over. */
  round: number;
  /** Floor per round, drawn by the roulette when the round starts. */
  floors: string[];
  champions: boolean;
  /** Vendor stock left this run. */
  vendor: Record<string, number>;
  /** Set when the run ended: true for a win. */
  result?: 'won' | 'lost';
}

export function rosterEntry(id: string): RosterEntry | undefined {
  return ROSTER.find((r) => r.id === id);
}

export function entrantName(id: string, playerName = 'You'): string {
  return id === PLAYER ? playerName : (rosterEntry(id)?.name ?? id);
}

/**
 * Draws a bracket: the player plus fifteen from the roster. The top four
 * powers are spread one per quarter (so two Legend-tier trainers never meet
 * before the semifinal), wildcards show up about one run in six, and a
 * Champion's bracket keeps only Elite tier and above.
 */
export function drawBracket(seed: number, options: { champions?: boolean } = {}): ConferenceRun {
  const rng = new Rng(seed);
  const champions = options.champions ?? false;
  const tierOrder: Tier[] = ['legend', 'elite', 'frontier', 'leader', 'rival'];
  let pool = ROSTER.filter((r) => !r.wildcard);
  if (champions) pool = pool.filter((r) => r.tier === 'legend' || r.tier === 'elite');
  const picked: RosterEntry[] = [];
  const wildcard = !champions && rng.chance(WILDCARD_ODDS) ? rng.pick(ROSTER.filter((r) => r.wildcard)) : undefined;
  const needed = 15 - (wildcard ? 1 : 0);
  // Shuffle the pool and take, keeping the tiers varied: no more than the pool offers per tier.
  const shuffled = [...pool].sort(() => rng.next() - 0.5);
  for (const r of shuffled) {
    if (picked.length >= needed) break;
    picked.push(r);
  }
  if (picked.length < needed) {
    // A Champion's bracket with a thin roster (nine Elite-or-above today): fill with the strongest of the rest.
    for (const r of ROSTER.filter((x) => !picked.includes(x) && !x.wildcard).sort((a, b) => b.power - a.power)) {
      if (picked.length >= needed) break;
      picked.push(r);
    }
  }
  if (wildcard) picked.push(wildcard);
  picked.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || b.power - a.power);
  // Seeds: the four strongest go one per quarter (slots 0, 4, 8, 12 then shuffled within the quarter), the rest fill the gaps at random.
  const entrants: (string | null)[] = new Array<string | null>(16).fill(null);
  const seeds = picked.slice(0, 4);
  const rest = picked.slice(4).map((r) => r.id);
  seeds.forEach((r, q) => {
    entrants[q * 4 + rng.int(0, 3)] = r.id;
  });
  const free = () => entrants.map((e, i) => (e === null ? i : -1)).filter((i) => i >= 0);
  const playerSlot = rng.pick(free());
  entrants[playerSlot] = PLAYER;
  for (const id of rest) entrants[rng.pick(free())] = id;
  const list = entrants.map((e) => e ?? PLAYER);
  const rounds: Match[][] = [[]];
  for (let i = 0; i < 16; i += 2) rounds[0]!.push({ a: list[i]!, b: list[i + 1]! });
  return { seed, entrants: list, rounds, round: 0, floors: [], champions, vendor: Object.fromEntries(Object.entries(VENDOR).map(([k, v]) => [k, v.count])) };
}

/** The player's match in a round. */
export function playerMatch(run: ConferenceRun, round = run.round): Match | undefined {
  return run.rounds[round]?.find((m) => m.a === PLAYER || m.b === PLAYER);
}

/** The player's next opponent id, if the run is still going. */
export function nextOpponent(run: ConferenceRun): string | undefined {
  const m = playerMatch(run);
  if (!m) return undefined;
  return m.a === PLAYER ? m.b : m.a;
}

/** Simulated result of a match between two roster entries: a logistic roll on the power difference. */
export function simulateMatch(a: string, b: string, rng: Rng): string {
  const pa = rosterEntry(a)?.power ?? 70;
  const pb = rosterEntry(b)?.power ?? 70;
  const pWinA = 1 / (1 + Math.exp(-(pa - pb) / 8));
  return rng.next() < pWinA ? a : b;
}

/** The roulette: the floor for the round about to be played. */
export function spinFloor(run: ConferenceRun): string {
  const rng = new Rng(run.seed * 31 + run.round * 7 + 1);
  const floor = rng.pick(Object.keys(FLOORS));
  run.floors[run.round] = floor;
  return floor;
}

/**
 * Resolves the current round: the player's match by the level outcome, the
 * others by simulation, then builds the next round (or ends the run).
 */
export function resolveRound(run: ConferenceRun, playerWon: boolean): void {
  const round = run.rounds[run.round];
  if (!round) return;
  const rng = new Rng(run.seed * 17 + run.round * 101 + 3);
  for (const m of round) {
    if (m.a === PLAYER || m.b === PLAYER) m.winner = playerWon ? PLAYER : m.a === PLAYER ? m.b : m.a;
    else m.winner = simulateMatch(m.a, m.b, rng);
  }
  if (!playerWon) {
    run.result = 'lost';
    run.round = 4;
    return;
  }
  if (run.round === 3) {
    run.result = 'won';
    run.round = 4;
    return;
  }
  const winners = round.map((m) => m.winner as string);
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i]!, b: winners[i + 1]! });
  run.rounds.push(next);
  run.round += 1;
}

function tierLevels(tier: Tier): [number, number] {
  return data.tiers[tier].levels;
}

/** The opponent's party for a round: its first N Pokémon, the last of them a boss with the signature move. */
export function roundParty(entry: RosterEntry, round: number, rng: Rng): TrainerPokemonDef[] {
  const count = Math.min(entry.team.length, ROUNDS[round]?.pokemon ?? 3);
  const [lo, hi] = tierLevels(entry.tier);
  const team = entry.team.slice(0, count);
  const bossIdx = new Set(entry.bosses ? entry.bosses.filter((i) => i < count) : [count - 1]);
  if (bossIdx.size === 0) bossIdx.add(count - 1);
  const aceHp = ROUNDS[round]?.aceHp;
  return team.map((species, i) => {
    const level = rng.int(lo, hi) + (i === count - 1 ? 2 : 0);
    const d: TrainerPokemonDef = { species, level: Math.min(100, level) };
    if (bossIdx.has(i)) {
      d.boss = true;
      const sig = entry.signatures?.[species] ?? entry.signature;
      d.moves = [{ move: sig, every: sig === 'dark-void' ? 15 : 6 }];
      if (i === count - 1 && aceHp) d.hpMultiplier = aceHp;
    }
    return d;
  });
}

/** The level definition for the player's current round on the drawn floor. */
export function roundLevel(run: ConferenceRun, opponentId: string, floor: string): LevelDef {
  const entry = rosterEntry(opponentId);
  if (!entry) throw new Error(`conference: unknown entrant ${opponentId}`);
  const rng = new Rng(run.seed * 13 + run.round * 29 + 5);
  const party = roundParty(entry, run.round, rng);
  const roundInfo = ROUNDS[run.round] ?? ROUNDS[0]!;
  const lanes = ['path'];
  const trainer: TrainerDef = {
    id: entry.id,
    name: entry.name,
    party,
    intro: entry.tag ? "Prepare for trouble, and make it double! Both lanes, all at once!" : `${entry.name} steps onto the ${FLOORS[floor]?.name ?? floor}.`,
    ...(entry.tag ? { lane: 'both' } : {}),
  };
  // One wave per Pokémon: the board's suspense comes from the opponent's team walking out one by one, the ace last.
  const waves: WaveDef[] = party.map((p, i) => ({
    trainer: { ...trainer, party: [p], ...(i > 0 ? { intro: undefined } : {}) },
    banner: i === party.length - 1 ? `${entry.name}'s ace` : `${entry.name}: Pokémon ${i + 1} of ${party.length}`,
  }));
  if (entry.tag) {
    // Team Rocket sends two at a time down both lanes.
    const pairs: WaveDef[] = [];
    for (let i = 0; i < party.length; i += 2) pairs.push({ trainer: { ...trainer, party: party.slice(i, i + 2), ...(i > 0 ? { intro: undefined } : {}) }, banner: 'Team Rocket, both lanes' });
    waves.splice(0, waves.length, ...pairs);
  }
  return {
    name: `${roundInfo.name}: ${entry.name}`,
    area: 'sinnoh-route-201',
    time: 'day',
    objective: 'defend',
    map: FLOORS[floor]?.map ?? 'stadium-grass',
    popup: 'city',
    lives: 10,
    enemiesFirstWave: 1,
    enemiesPerWave: 0,
    spawnInterval: 1.5,
    placements: 6,
    levels: tierLevels(entry.tier),
    maxWildLevel: 100,
    lanes,
    rules: [{ id: 'stadium', floor }],
    waves,
    noMoney: false,
  };
}

/** Rewards after a run; returns the lines to show. Mutates the game. */
export function applyConferenceResult(game: GameState, run: ConferenceRun, rng: Rng): string[] {
  const lines: string[] = [];
  if (run.result !== 'won') return lines;
  game.conferenceWins = (game.conferenceWins ?? 0) + 1;
  if (game.conferenceWins === 1) {
    setFlag(game, 'trophy');
    game.money += data.rewards.firstWinMoney;
    game.items.balls.master = (game.items.balls.master ?? 0) + 1;
    lines.push(`Your first Conference win! The trophy, $${data.rewards.firstWinMoney} and a Master Ball.`);
  }
  if (rng.chance(0.5)) {
    const owned = new Set(game.flags);
    const left = data.rewards.megaStones.filter((s) => !owned.has(s));
    if (left.length) {
      const stone = rng.pick(left);
      setFlag(game, stone);
      lines.push(`A Mega Stone: ${stone.replace(/-/g, ' ')}.`);
    } else {
      game.tickets = (game.tickets ?? 0) + 1;
      lines.push('A Lottery ticket.');
    }
  } else {
    game.tickets = (game.tickets ?? 0) + 1;
    lines.push('A Lottery ticket for Jubilife TV.');
  }
  const beatTobias = run.rounds.some((r) => r.some((m) => m.winner === PLAYER && (m.a === 'tobias' || m.b === 'tobias')));
  if (beatTobias && !hasFlag(game, 'legend-ribbon')) {
    setFlag(game, 'legend-ribbon');
    lines.push('You beat Tobias: the Legend ribbon. A "???" entrant wants a word at the stadium tonight.');
  }
  if (game.conferenceWins >= 3 && !hasFlag(game, 'champions-bracket')) {
    setFlag(game, 'champions-bracket');
    lines.push("Three wins: the Champion's bracket is open.");
  }
  return lines;
}

/** Buys from the locker-room vendor; returns an error or null. */
export function buyFromVendor(game: GameState, run: ConferenceRun, item: string): string | null {
  const stock = run.vendor[item] ?? 0;
  const v = VENDOR[item];
  if (!v) return 'not sold here';
  if (stock <= 0) return 'sold out';
  if (game.money < v.price) return 'not enough money';
  game.money -= v.price;
  run.vendor[item] = stock - 1;
  giveItems(game, { [item]: 1 });
  return null;
}

/** Heals the whole party (the locker room). */
export function healParty(game: GameState): void {
  for (const mon of game.party) {
    mon.hp = mon.stats.hp;
    mon.status.ailment = 'none';
    mon.status.ailmentSeconds = 0;
    for (const m of mon.moves) m.pp = m.maxPp;
  }
}

/** A debug helper: a strong party for trying the Conference from the level select. */
export function sparringParty(game: GameState): void {
  for (const species of [389, 392, 395]) addPokemon(game, createMonster(species, 60));
}
