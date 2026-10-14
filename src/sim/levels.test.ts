/**
 * Content rules for levels.json: every roster resolves, each species is
 * featured in at most one level, rare entries stay at or below 10 %, and
 * trainer parties resolve (including the rival's counter-starter).
 */
import { describe, expect, it } from 'vitest';
import spriteFolders from '../data/spriteFolders.json';
import { getLevel, levelIds } from '../data/levels';
import { findMoveId, findPokemonId, getPokemon } from '../data/pokedata';
import { TRAINER_ART, trainerArtId } from '../data/trainers';
import { allBadges } from './game';
import { counterStarter, featuredSpecies, levelPopup, POPUP_KINDS, rareSpecies, RARE_SHARE, rosterTable, trainerWave, trainerWaveIndex } from './waves';

const folders = spriteFolders as Record<string, unknown>;
// Shipped art, listed by Vite so the tests need no fs access.
const shipped = new Set(
  [
    ...Object.keys(import.meta.glob('../../public/assets/badges/*.png')),
    ...Object.keys(import.meta.glob('../../public/assets/ui/gen4/popups/*.png')),
    ...Object.keys(import.meta.glob('../../public/assets/trainers/*.png')),
    ...Object.keys(import.meta.glob('../../public/assets/trainers/mugshots/*.png')),
    ...Object.keys(import.meta.glob('../../public/assets/trainers/banners/*.png')),
  ].map((p) => p.replace(/^.*\/public\//, 'public/')),
);
const existsSync = (path: string) => shipped.has(path);
const hasSprites = (species: number) => folders[String(species).padStart(4, '0')] !== undefined;

describe('level rosters', () => {
  it('every level has a roster that resolves to real species within sensible level ranges', () => {
    for (const id of levelIds()) {
      const def = getLevel(id);
      expect(def.roster, `${id} needs a roster`).toBeDefined();
      const table = rosterTable(def);
      expect(table.length).toBeGreaterThan(0);
      for (const entry of table) {
        expect(getPokemon(entry.species).name).toBeTruthy();
        expect(entry.min).toBeGreaterThanOrEqual(1);
        expect(entry.max).toBeGreaterThanOrEqual(entry.min);
        expect(entry.max, `${id}: ${getPokemon(entry.species).name} levels`).toBeLessThanOrEqual(15);
        expect(hasSprites(entry.species), `${id}: no sprites fetched for ${getPokemon(entry.species).name}`).toBe(true);
      }
    }
  });

  it('features each species in only one level across the story', () => {
    const featuredIn = new Map<string, string[]>();
    for (const id of levelIds()) {
      const def = getLevel(id);
      for (const species of featuredSpecies(def)) featuredIn.set(species, [...(featuredIn.get(species) ?? []), id]);
    }
    const repeats = [...featuredIn.entries()].filter(([, levels]) => levels.length > 1);
    expect(repeats, `featured in more than one level: ${repeats.map(([s, l]) => `${s} (${l.join(', ')})`).join('; ')}`).toEqual([]);
    expect(featuredIn.size).toBeGreaterThan(10);
  });

  it('keeps rare entries at or below the rare share and uses the given rosters', () => {
    for (const id of levelIds()) {
      const def = getLevel(id);
      const total = def.roster!.reduce((s, e) => s + e.rarity, 0);
      for (const name of rareSpecies(def)) {
        const entry = def.roster!.find((e) => e.species === name)!;
        expect(entry.rarity / total, `${id}: ${name}`).toBeLessThanOrEqual(RARE_SHARE + 1e-9);
      }
    }
    expect(featuredSpecies(getLevel('route-201'))).toEqual(['starly', 'bidoof']);
    expect(rareSpecies(getLevel('route-201'))).toEqual(['kricketot']);
    expect(featuredSpecies(getLevel('lake-verity'))).toEqual(['psyduck', 'magikarp', 'goldeen']);
    expect(rareSpecies(getLevel('route-202'))).toEqual(['sentret']);
    expect(featuredSpecies(getLevel('route-203'))).toEqual(['abra', 'zubat', 'budew']);
    expect(rareSpecies(getLevel('oreburgh-gate'))).toEqual(['golduck', 'zubat']);
    expect(featuredSpecies(getLevel('oreburgh-mine-1f'))).toEqual(['onix', 'machop']);
  });

  it('uses the area level range when a roster entry gives none', () => {
    const route201 = rosterTable(getLevel('route-201'));
    expect(route201.find((e) => e.species === findPokemonId('starly'))).toMatchObject({ min: 2, max: 3 });
    expect(route201.find((e) => e.species === findPokemonId('kricketot'))).toMatchObject({ min: 3, max: 3 });
    expect(() => rosterTable({ ...getLevel('route-201'), roster: [{ species: 'mewthree', rarity: 1 }] })).toThrow(/unknown species/);
    expect(() => rosterTable({ ...getLevel('route-201'), roster: [{ species: 'starly', rarity: 0 }] })).toThrow(/rarity/);
  });
});

describe('level presentation', () => {
  it('places every level on the town map with a popup banner that ships', () => {
    for (const id of levelIds()) {
      const def = getLevel(id);
      expect(def.mapPos, `${id} needs a mapPos`).toBeDefined();
      const [x, y] = def.mapPos!;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(256);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(192);
      const kind = levelPopup(def);
      expect(POPUP_KINDS).toContain(kind);
      expect(existsSync(`public/assets/ui/gen4/popups/${kind}.png`), `${id}: popup ${kind}`).toBe(true);
    }
    expect(levelPopup({ area: 'lake-verity/before-galactic-intervention' })).toBe('lake');
    expect(levelPopup({ area: 'oreburgh-mine/1f' })).toBe('cave');
    expect(levelPopup({ area: 'eterna-forest' })).toBe('forest');
    expect(levelPopup({ area: 'sinnoh-route-201' })).toBe('route');
    expect(levelPopup({ area: 'sinnoh-route-201', popup: 'town' })).toBe('town');
  });

  it('lists the eight Sinnoh badges with their art, and every level badge is one of them', () => {
    const badges = allBadges();
    expect(badges).toHaveLength(8);
    for (const b of badges) {
      expect(existsSync(`public/assets/badges/${b.id}.png`), b.id).toBe(true);
      expect(existsSync(`public/assets/badges/${b.id}-off.png`), b.id).toBe(true);
    }
    for (const id of levelIds()) {
      const badge = getLevel(id).badge;
      if (badge) expect(badges.map((b) => b.id)).toContain(badge.id);
    }
  });

  it('has Platinum art for every trainer the levels name', () => {
    for (const id of levelIds()) {
      const trainer = getLevel(id).trainer;
      if (!trainer) continue;
      const art = TRAINER_ART[trainer.id];
      expect(art, `${id}: ${trainer.id} is not in trainers/index.json`).toBeDefined();
      const file = trainerArtId(trainer.id);
      expect(existsSync(`public/assets/trainers/${file}.png`), file).toBe(true);
      if (art!.poses >= 2) expect(existsSync(`public/assets/trainers/${file}-pose.png`), file).toBe(true);
      if (art!.mugshot) expect(existsSync(`public/assets/trainers/mugshots/${file}.png`), file).toBe(true);
      if (art!.banner) expect(existsSync(`public/assets/trainers/banners/${file}.png`), file).toBe(true);
    }
  });
});

describe('trainers', () => {
  const moveId = (name: string) => findMoveId(name)!;

  it('resolves every trainer party, with sprites, on the right wave', () => {
    for (const id of levelIds()) {
      const def = getLevel(id);
      if (!def.trainer) continue;
      for (const starter of [387, 390, 393]) {
        const spawns = trainerWave(def, starter, moveId);
        expect(spawns).toHaveLength(def.trainer.party.length);
        for (const s of spawns) {
          expect(s.trainer).toBe(true);
          expect(hasSprites(s.species), `${id}: no sprites for ${getPokemon(s.species).name}`).toBe(true);
        }
      }
      const index = trainerWaveIndex(def);
      expect(index).toBeGreaterThanOrEqual(1);
      if (def.objective === 'defend') expect(index).toBe(def.waves! - 1);
    }
    expect(trainerWaveIndex(getLevel('route-201'))).toBe(-1);
  });

  it("gives the rival the starter that beats the player's", () => {
    expect(counterStarter(387)).toBe(390);
    expect(counterStarter(390)).toBe(393);
    expect(counterStarter(393)).toBe(387);
    const barry = trainerWave(getLevel('route-203'), 393, moveId);
    expect(barry.map((s) => s.species)).toEqual([396, 387]);
    expect(barry[1]?.level).toBe(11);
  });

  it('marks Roark’s Cranidos as the boss with its timed moves', () => {
    const roark = trainerWave(getLevel('oreburgh-mine-1f'), 387, moveId);
    expect(roark.map((s) => getPokemon(s.species).name)).toEqual(['geodude', 'onix', 'cranidos']);
    expect(roark[2]).toMatchObject({ boss: true, level: 14 });
    expect(roark[2]?.bossMoves).toEqual([
      { moveId: findMoveId('headbutt'), every: 5 },
      { moveId: findMoveId('zen-headbutt'), every: 12 },
    ]);
    expect(roark[0]?.boss).toBeUndefined();
  });
});
