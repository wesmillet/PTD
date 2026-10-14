/**
 * Demo-mode showcase: the curated collection a new save's PC starts with
 * (src/data/showcase.json, built by scripts/build-showcase.mjs). Pure.
 */
import showcaseJson from '../data/showcase.json';
import type { GameState } from './game';
import { createMonster } from './monster';
import { boxCount, depositToBox } from './pc';

export interface ShowcaseEntry {
  species: number;
  level: number;
  shiny: boolean;
  moves: number[];
}

export const SHOWCASE: ShowcaseEntry[] = (showcaseJson as { pokemon: ShowcaseEntry[] }).pokemon;
/** The Legends boxes: every shipped legendary and mythical, shiny, at levels 50 to 70. */
export const LEGENDS: ShowcaseEntry[] = (showcaseJson as { legends?: ShowcaseEntry[] }).legends ?? [];
export const LEGENDS_BOX_NAME = 'Legends';

function seedEntry(game: GameState, e: ShowcaseEntry, startBox: number): void {
  const mon = createMonster(e.species, e.level, e.moves, { shiny: e.shiny });
  depositToBox(game, mon, startBox);
  const entry = (game.pokedex[String(e.species)] ??= { seen: false, caught: false, shinyCaught: false });
  entry.seen = true;
  entry.caught = true;
  if (e.shiny) entry.shinyCaught = true;
}

/**
 * Fills the boxes in list order (shinies first, so they land in Box 1), then
 * the Legends into the first boxes still empty, renamed "Legends", "Legends 2",
 * ... Returns how many Pokémon were added.
 */
export function seedShowcase(game: GameState): number {
  for (const e of SHOWCASE) seedEntry(game, e, 0);
  const firstEmpty = game.boxes.findIndex((b) => boxCount(b) === 0);
  if (LEGENDS.length > 0 && firstEmpty >= 0) {
    const perBox = game.boxes[firstEmpty]!.slots.length;
    for (let i = 0; i * perBox < LEGENDS.length && firstEmpty + i < game.boxes.length; i++) {
      game.boxes[firstEmpty + i]!.name = i === 0 ? LEGENDS_BOX_NAME : `${LEGENDS_BOX_NAME} ${i + 1}`;
    }
    for (const e of LEGENDS) seedEntry(game, e, firstEmpty);
  }
  return SHOWCASE.length + (firstEmpty >= 0 ? LEGENDS.length : 0);
}
