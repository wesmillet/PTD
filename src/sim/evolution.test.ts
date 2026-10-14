import { describe, expect, it } from 'vitest';
import { evolutionOptions, evolveMonster } from './evolution';
import { createMonster } from './monster';

describe('evolutionOptions', () => {
  it('reports level-up evolutions as ready at the level and blocked below it', () => {
    expect(evolutionOptions(createMonster(387, 17))).toEqual({ ready: [], blocked: [{ to: 388, toName: 'grotle', reason: 'level 18' }] });
    expect(evolutionOptions(createMonster(387, 18)).ready).toEqual([{ to: 388, toName: 'grotle', level: 18 }]);
    expect(evolutionOptions(createMonster(389, 50))).toEqual({ ready: [], blocked: [] });
  });

  it('stubs stone, trade and happiness evolutions with a visible reason', () => {
    const onix = evolutionOptions(createMonster(95, 40));
    expect(onix.ready).toEqual([]);
    expect(onix.blocked[0]?.reason).toMatch(/trade holding Metal Coat \(not yet\)/);
    const golbat = evolutionOptions(createMonster(42, 40));
    expect(golbat.blocked[0]?.reason).toMatch(/happiness 160 \(not yet\)/);
    const eevee = evolutionOptions(createMonster(133, 40));
    expect(eevee.ready).toEqual([]);
    expect(eevee.blocked.find((b) => b.to === 135)?.reason).toBe('Thunder Stone (not yet)');
    expect(eevee.blocked.find((b) => b.to === 196)?.reason).toMatch(/happiness 160 at day/);
    const kadabra = evolutionOptions(createMonster(64, 40));
    expect(kadabra.blocked[0]?.reason).toBe('trade (not yet)');
  });

  it('evolves in place keeping level, EXP, moves and HP fraction', () => {
    const mon = createMonster(387, 18);
    mon.hp = Math.floor(mon.stats.hp / 2);
    const moves = mon.moves.map((m) => m.id);
    const exp = mon.exp;
    evolveMonster(mon, 388);
    expect(mon.species).toBe(388);
    expect(mon.name).toBe('grotle');
    expect(mon.level).toBe(18);
    expect(mon.exp).toBe(exp);
    expect(mon.moves.map((m) => m.id)).toEqual(moves);
    expect(mon.stats.hp).toBeGreaterThan(createMonster(387, 18).stats.hp);
    expect(mon.hp / mon.stats.hp).toBeCloseTo(0.5, 1);
  });
});
