/**
 * Evolution: which evolutions a Pokémon can take now, which are blocked and
 * why, and the species change itself. No Phaser imports.
 */
import { getEvolutions, getPokemon, type EvolutionData } from '../data/pokedata';
import { capitalizeName } from './names';
import type { Monster } from './monster';
import { computeStats } from './stats';

export interface ReadyEvolution {
  to: number;
  toName: string;
  level: number;
}

export interface BlockedEvolution {
  to: number;
  toName: string;
  reason: string;
}

export interface EvolutionOptions {
  ready: ReadyEvolution[];
  blocked: BlockedEvolution[];
}

function describeBlock(e: EvolutionData): string | null {
  if (e.trigger === 'trade') return e.heldItem ? `trade holding ${capitalizeName(e.heldItem)} (not yet)` : 'trade (not yet)';
  if (e.trigger === 'use-item') return `${capitalizeName(e.item ?? 'item')} (not yet)`;
  if (e.trigger === 'shed') return 'shed (not yet)';
  if (e.happiness !== undefined) return `happiness ${e.happiness}${e.time ? ` at ${e.time}` : ''} (not yet)`;
  if (e.item || e.heldItem) return `${capitalizeName((e.item ?? e.heldItem) as string)} (not yet)`;
  if (e.knownMove !== undefined || e.knownMoveType !== undefined) return 'knowing a specific move (not yet)';
  if (e.location !== undefined) return 'a specific location (not yet)';
  if (e.time) return `level up at ${e.time} (not yet)`;
  if (e.gender) return `${e.gender} only (not yet)`;
  if (e.partySpecies !== undefined || e.partyType !== undefined || e.tradeSpecies !== undefined) return 'a party condition (not yet)';
  if (e.relativePhysicalStats !== undefined) return 'a stat condition (not yet)';
  if (e.rain || e.upsideDown) return 'a special condition (not yet)';
  return null;
}

/** Splits a Pokémon's evolutions into ready (plain level-up at or below its level) and blocked. */
export function evolutionOptions(mon: Monster): EvolutionOptions {
  const ready: ReadyEvolution[] = [];
  const blocked: BlockedEvolution[] = [];
  const seen = new Set<number>();
  for (const e of getEvolutions(mon.species)) {
    if (seen.has(e.to)) continue;
    const toName = getPokemon(e.to).name;
    const block = describeBlock(e);
    if (block) {
      if (!blocked.some((b) => b.to === e.to)) blocked.push({ to: e.to, toName, reason: block });
      continue;
    }
    if (e.trigger !== 'level-up') {
      blocked.push({ to: e.to, toName, reason: `${e.trigger} (not yet)` });
      seen.add(e.to);
      continue;
    }
    const level = e.level ?? 1;
    if (mon.level >= level) {
      ready.push({ to: e.to, toName, level });
      seen.add(e.to);
    } else {
      blocked.push({ to: e.to, toName, reason: `level ${level}` });
    }
  }
  return { ready, blocked: blocked.filter((b) => !ready.some((r) => r.to === b.to)) };
}

/** Changes species in place, keeping level, EXP, HP fraction, moves and status. */
export function evolveMonster(mon: Monster, to: number): void {
  const data = getPokemon(to);
  const fraction = mon.stats.hp > 0 ? mon.hp / mon.stats.hp : 1;
  mon.species = to;
  mon.name = data.name;
  mon.types = [...data.types];
  mon.baseExp = data.baseExp;
  mon.growth = data.growth;
  mon.stats = computeStats(data.base, mon.level);
  mon.hp = Math.max(1, Math.round(mon.stats.hp * fraction));
}
