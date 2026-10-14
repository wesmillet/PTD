/**
 * Demo-mode showcase: the curated collection a new save's PC starts with
 * (src/data/showcase.json, built by scripts/build-showcase.mjs). Pure.
 */
import showcaseJson from '../data/showcase.json';
import type { GameState } from './game';
import { createMonster } from './monster';
import { depositToBox } from './pc';

export interface ShowcaseEntry {
  species: number;
  level: number;
  shiny: boolean;
  moves: number[];
}

export const SHOWCASE: ShowcaseEntry[] = (showcaseJson as { pokemon: ShowcaseEntry[] }).pokemon;

/** Fills the boxes in list order (shinies first, so they land in Box 1). Returns how many were added. */
export function seedShowcase(game: GameState): number {
  let n = 0;
  for (const e of SHOWCASE) {
    const mon = createMonster(e.species, e.level, e.moves, { shiny: e.shiny });
    depositToBox(game, mon);
    const entry = (game.pokedex[String(e.species)] ??= { seen: false, caught: false, shinyCaught: false });
    entry.seen = true;
    entry.caught = true;
    if (e.shiny) entry.shinyCaught = true;
    n++;
  }
  return n;
}
