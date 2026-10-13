import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  applyAilment,
  applyFlinch,
  applyStages,
  attackBlockedBy,
  attackRateMultiplier,
  createStatus,
  effectiveStat,
  physicalDamageMultiplier,
  speedMultiplier,
  stageMultiplier,
  tickStatus,
  type StatusConfig,
} from './status';

const cfg: StatusConfig = {
  tickSeconds: 2,
  poisonFraction: 0.125,
  burnFraction: 0.0625,
  burnPhysicalMultiplier: 0.5,
  paralysisSpeedMultiplier: 0.5,
  paralysisAttackRateMultiplier: 0.5,
  paralysisSkipChance: 0.25,
  sleepSeconds: [2, 5],
  freezeSeconds: [3, 6],
  confusionSeconds: [2, 5],
  confusionChance: 0.5,
  flinchSeconds: 0.5,
};

function run(status: ReturnType<typeof createStatus>, seconds: number, maxHp: number, rng: Rng) {
  let damage = 0;
  const ended: string[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    const r = tickStatus(status, maxHp, 0.05, rng, cfg);
    damage += r.damage;
    if (r.ended) ended.push(r.ended);
  }
  return { damage, ended };
}

describe('ailments', () => {
  it('do not stack and cannot be "none"', () => {
    const s = createStatus();
    const rng = new Rng(1);
    expect(applyAilment(s, 'none', rng, cfg)).toBe(false);
    expect(applyAilment(s, 'poison', rng, cfg)).toBe(true);
    expect(applyAilment(s, 'burn', rng, cfg)).toBe(false);
    expect(s.ailment).toBe('poison');
  });

  it('poison deals 1/8 max HP every tick and never ends on its own', () => {
    const s = createStatus();
    applyAilment(s, 'poison', new Rng(1), cfg);
    const r = run(s, 6.01, 80, new Rng(2));
    expect(r.damage).toBe(30); // 3 ticks of 10
    expect(r.ended).toEqual([]);
    expect(speedMultiplier(s, cfg)).toBe(1);
    expect(attackRateMultiplier(s, cfg)).toBe(1);
  });

  it('burn deals 1/16 max HP per tick (min 1) and halves physical damage', () => {
    const s = createStatus();
    applyAilment(s, 'burn', new Rng(1), cfg);
    expect(run(s, 4.01, 80, new Rng(2)).damage).toBe(10);
    const tiny = createStatus();
    applyAilment(tiny, 'burn', new Rng(1), cfg);
    expect(run(tiny, 2.01, 10, new Rng(2)).damage).toBe(1);
    expect(physicalDamageMultiplier(s, cfg)).toBe(0.5);
    expect(physicalDamageMultiplier(createStatus(), cfg)).toBe(1);
  });

  it('paralysis halves speed and attack rate and skips about a quarter of attacks', () => {
    const s = createStatus();
    applyAilment(s, 'paralysis', new Rng(1), cfg);
    expect(speedMultiplier(s, cfg)).toBe(0.5);
    expect(attackRateMultiplier(s, cfg)).toBe(0.5);
    const rng = new Rng(9);
    let skipped = 0;
    for (let i = 0; i < 4000; i++) if (attackBlockedBy(s, rng, cfg) === 'paralysis') skipped++;
    expect(skipped).toBeGreaterThan(850);
    expect(skipped).toBeLessThan(1150);
  });

  it('sleep and freeze stop movement and attacks, then expire within their ranges', () => {
    for (const [ailment, range] of [
      ['sleep', cfg.sleepSeconds],
      ['freeze', cfg.freezeSeconds],
    ] as const) {
      const s = createStatus();
      applyAilment(s, ailment, new Rng(3), cfg);
      expect(s.ailmentSeconds).toBeGreaterThanOrEqual(range[0]);
      expect(s.ailmentSeconds).toBeLessThanOrEqual(range[1]);
      expect(speedMultiplier(s, cfg)).toBe(0);
      expect(attackRateMultiplier(s, cfg)).toBe(0);
      expect(attackBlockedBy(s, new Rng(1), cfg)).toBe(ailment);
      const r = run(s, range[1] + 0.1, 50, new Rng(2));
      expect(r.ended).toEqual([ailment]);
      expect(s.ailment).toBe('none');
      expect(speedMultiplier(s, cfg)).toBe(1);
    }
  });

  it('confusion walks backwards and wastes attacks about half the time, then ends', () => {
    const s = createStatus();
    applyAilment(s, 'confusion', new Rng(4), cfg);
    const rng = new Rng(5);
    let backwards = 0;
    let steps = 0;
    while (s.ailment === 'confusion') {
      tickStatus(s, 50, 0.05, rng, cfg);
      if (s.ailment !== 'confusion') break;
      steps++;
      if (speedMultiplier(s, cfg) < 0) backwards++;
    }
    expect(steps).toBeGreaterThan(30);
    expect(backwards).toBeGreaterThan(0);
    expect(backwards).toBeLessThan(steps);
    // Wasted attacks follow the same roll.
    const c = createStatus();
    applyAilment(c, 'confusion', new Rng(4), cfg);
    c.confused = true;
    expect(attackBlockedBy(c, new Rng(1), cfg)).toBe('confusion');
    c.confused = false;
    expect(attackBlockedBy(c, new Rng(1), cfg)).toBe(null);
  });

  it('flinch stops movement and blocks attacks briefly', () => {
    const s = createStatus();
    applyFlinch(s, cfg);
    expect(s.flinchSeconds).toBe(0.5);
    expect(speedMultiplier(s, cfg)).toBe(0);
    expect(attackBlockedBy(s, new Rng(1), cfg)).toBe('flinch');
    run(s, 0.6, 50, new Rng(2));
    expect(s.flinchSeconds).toBe(0);
    expect(speedMultiplier(s, cfg)).toBe(1);
    expect(attackBlockedBy(s, new Rng(1), cfg)).toBe(null);
  });
});

describe('stat stages', () => {
  it('uses the Gen 4 multiplier table', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(6)).toBe(4);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-2)).toBe(0.5);
    expect(stageMultiplier(-6)).toBe(0.25);
    expect(stageMultiplier(9)).toBe(4);
  });

  it('clamps stages and ignores accuracy, evasion and hp', () => {
    const s = createStatus();
    expect(applyStages(s, [{ stat: 'def', change: 1 }])).toEqual([{ stat: 'def', change: 1 }]);
    expect(applyStages(s, [{ stat: 'def', change: 6 }])).toEqual([{ stat: 'def', change: 5 }]);
    expect(applyStages(s, [{ stat: 'def', change: 1 }])).toEqual([]);
    expect(applyStages(s, [{ stat: 'accuracy', change: -1 }, { stat: 'evasion', change: 1 }, { stat: 'hp', change: 1 }])).toEqual([]);
    expect(s.stages).toEqual({ hp: 0, atk: 0, def: 6, spa: 0, spd: 0, spe: 0 });
    expect(effectiveStat(84, s, 'def')).toBe(336);
    expect(effectiveStat(130, s, 'hp')).toBe(130);
    applyStages(s, [{ stat: 'atk', change: -1 }]);
    expect(effectiveStat(88, s, 'atk')).toBe(58); // floor(88 * 2/3)
  });
});
