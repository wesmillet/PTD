/**
 * Which sprite folders a scene needs, so levels load only their own
 * Pokémon instead of every folder in spriteIndex.json.
 */
import type Phaser from 'phaser';
import spriteFolders from '../data/spriteFolders.json';
import { findPokemonId, getEvolutions, getEncounterArea, getPokemon, type EncounterArea } from '../data/pokedata';
import { TRAINER_ART, trainerArtId } from '../data/trainers';
import type { GameState } from '../sim/game';
import { counterStarter, finalStarter, isScripted, levelTrainers, rosterTable, scriptedSpeciesNames, type AllyDef, type LevelDef } from '../sim/waves';
import { assetUrl, bannerTextureKey, dexFolder, mugshotTextureKey, trainerTextureKey } from './runtime';

const folders = spriteFolders as Record<string, { shiny: boolean; portraits: string[] }>;

/** Actions a level loads: Idle and Walk are core; the rest are optional and skipped when a folder or a download lacks them. */
export const ALL_ACTIONS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Hurt', 'Faint'] as const;
export const OPTIONAL_ACTIONS = ['Attack', 'Shoot', 'Hurt', 'Faint'] as const;
/** Actions whose sheets must load for a Pokémon to be usable at all. */
export const CORE_ACTIONS = ['Idle', 'Walk'] as const;

/** A species plus everything it can evolve into (recursively). */
export function evolutionLine(species: number): number[] {
  const out: number[] = [];
  const walk = (id: number) => {
    if (out.includes(id)) return;
    out.push(id);
    for (const e of getEvolutions(id)) walk(e.to);
  };
  walk(species);
  return out;
}

/**
 * Dex folders (base and shiny) a level can show: party lines, the roster (or
 * the area's tables for a level without one) and the trainer's party.
 */
export function levelSpriteFolders(def: LevelDef, game: GameState): string[] {
  const species = new Set<number>();
  for (const mon of game.party) for (const id of evolutionLine(mon.species)) species.add(id);
  const named = (name: string): number | undefined => {
    if (name === 'counter-starter') return counterStarter(game.starter);
    if (name === 'counter-starter-final') return finalStarter(counterStarter(game.starter));
    return findPokemonId(name);
  };
  if (isScripted(def)) {
    for (const name of scriptedSpeciesNames(def)) {
      const id = named(name);
      if (id !== undefined) for (const line of evolutionLine(id)) species.add(line);
    }
  } else if (def.roster) {
    for (const e of rosterTable(def)) for (const id of evolutionLine(e.species)) species.add(id);
  } else {
    const area: EncounterArea = getEncounterArea(def.area);
    for (const e of area.walk ?? []) for (const id of evolutionLine(e.species)) species.add(id);
  }
  for (const t of levelTrainers(def)) {
    for (const p of t.party) {
      const id = named(p.species);
      if (id !== undefined) species.add(id);
    }
  }
  const allies: AllyDef[] = [...(def.allies ?? [])];
  for (const r of def.rules ?? []) {
    if (Array.isArray(r.allies)) allies.push(...(r.allies as AllyDef[]));
    if (typeof r.species === 'string') {
      const id = findPokemonId(r.species);
      if (id !== undefined) species.add(id);
    }
    if (Array.isArray(r.rares)) for (const name of r.rares as string[]) {
      const id = findPokemonId(name);
      if (id !== undefined) species.add(id);
    }
  }
  for (const a of allies) {
    const id = named(a.species);
    if (id !== undefined) species.add(id);
  }
  const out: string[] = [];
  for (const id of species) {
    getPokemon(id); // validate
    const dex = dexFolder(id);
    if (!folders[dex]) continue; // no sprites fetched for this species
    out.push(dex);
    if (folders[dex]?.shiny) out.push(`${dex}/shiny`);
  }
  return out;
}

export function hasSpriteFolder(species: number): boolean {
  return folders[dexFolder(species)] !== undefined;
}

/** Trainer ids a level shows art for: its trainers and every dialogue speaker. */
export function levelTrainerIds(def: LevelDef): string[] {
  const ids = new Set<string>();
  for (const t of levelTrainers(def)) ids.add(t.id);
  if (Array.isArray(def.waves)) {
    for (const w of def.waves) for (const line of [...(w.lines ?? []), ...(w.outro ?? [])]) if (line.speaker) ids.add(line.speaker);
  }
  return [...ids];
}

/**
 * Queues the Platinum art of these trainers on a scene's loader: the
 * standing and throwing poses, the VS mugshot and the class banner when
 * they exist. Ids without art (legendary "event-" trainers, nobles, the
 * silhouetted anime trainers built at boot) are skipped; textures already
 * present are not requested again.
 */
export function queueTrainerArt(scene: Phaser.Scene, ids: Iterable<string>): void {
  for (const id of ids) {
    const art = TRAINER_ART[id];
    if (!art) continue;
    const file = trainerArtId(id);
    const want: [string, string][] = [[trainerTextureKey(id), `assets/trainers/${file}.png`]];
    if ((art.poses ?? 1) >= 2) want.push([trainerTextureKey(id, true), `assets/trainers/${file}-pose.png`]);
    if (art.mugshot) want.push([mugshotTextureKey(id), `assets/trainers/mugshots/${file}.png`]);
    if (art.banner) want.push([bannerTextureKey(id), `assets/trainers/banners/${file}.png`]);
    for (const [key, path] of want) if (!scene.textures.exists(key)) scene.load.image(key, assetUrl(path));
  }
}
