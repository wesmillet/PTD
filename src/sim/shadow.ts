/**
 * Shadow Pokémon: caught from the Galactic machine's waves or the S.S.
 * Libra, they gain no EXP until purified by sitting through three cleared
 * levels at a lake guardian level (Shadow Lugia needs Spear Pillar's altar,
 * the Relic Stone of this game). Pure; no Phaser imports.
 */
import { getPokemon } from '../data/pokedata';
import { createMonster, setMonsterLevel, type Monster } from './monster';

export const PURIFY_LEVELS = 3;

/** Whether a level counts toward purification for this Pokémon. */
export function purifiesAt(mon: Monster, levelId: string): boolean {
  if (!mon.shadow || mon.shadow.purifiedAt) return false;
  if (getPokemon(mon.species).name === 'lugia-shadow') return levelId === 'spear-pillar' || levelId === 'spear-pillar-origin';
  return levelId.startsWith('lake-');
}

/**
 * Counts a cleared level for the placed Shadow Pokémon; the third one
 * purifies: Shadow Mewtwo and Lugia become their real selves (stats
 * recomputed), ordinary Shadow Pokémon just lose the mark. Returns the
 * Pokémon purified this time.
 */
export function purifyProgress(placed: readonly Monster[], levelId: string): Monster[] {
  const out: Monster[] = [];
  for (const mon of placed) {
    if (!purifiesAt(mon, levelId)) continue;
    mon.shadow!.purified += 1;
    if (mon.shadow!.purified < PURIFY_LEVELS) continue;
    purify(mon, levelId);
    out.push(mon);
  }
  return out;
}

/** Turns a Shadow Pokémon back: the base species for the two with their own form, the mark gone for the rest. */
export function purify(mon: Monster, levelId: string): void {
  const data = getPokemon(mon.species);
  if (data.shadow && data.species) {
    const fresh = createMonster(data.species, mon.level, mon.moves.map((m) => m.id));
    mon.species = data.species;
    mon.name = fresh.name;
    mon.types = fresh.types;
    mon.baseExp = fresh.baseExp;
    mon.growth = fresh.growth;
    setMonsterLevel(mon, mon.level);
  }
  mon.shadow = { purified: PURIFY_LEVELS, purifiedAt: levelId };
}

export function isShadow(mon: Monster): boolean {
  return mon.shadow !== undefined && !mon.shadow.purifiedAt;
}
