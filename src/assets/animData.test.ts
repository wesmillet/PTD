// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { animDurationMs, parseAnimData, ticksToMs } from './animData';
// Real fixture: Turtwig's AnimData.xml as fetched from SpriteCollab.
import turtwigXml from '../../public/assets/sprites/0387/AnimData.xml?raw';

const minimal = (anims: string) =>
  `<?xml version="1.0" ?><AnimData><ShadowSize>1</ShadowSize><Anims>${anims}</Anims></AnimData>`;

describe('parseAnimData', () => {
  it('parses a normal entry with frame size and durations', () => {
    const data = parseAnimData(turtwigXml);
    const walk = data.anims['Walk'];
    expect(data.shadowSize).toBe(1);
    expect(walk).toBeDefined();
    expect(walk?.index).toBe(0);
    expect(walk?.sheet).toBe('Walk');
    expect(walk?.frameWidth).toBe(24);
    expect(walk?.frameHeight).toBe(32);
    expect(walk?.durations).toEqual([10, 10, 10, 10]);
    expect(walk?.hitFrame).toBeUndefined();
  });

  it('keeps RushFrame, HitFrame and ReturnFrame on attacks', () => {
    const attack = parseAnimData(turtwigXml).anims['Attack'];
    expect(attack?.rushFrame).toBe(1);
    expect(attack?.hitFrame).toBe(3);
    expect(attack?.returnFrame).toBe(6);
    expect(attack?.durations).toHaveLength(11);
  });

  it('resolves CopyOf aliases to the target sheet and timings', () => {
    const data = parseAnimData(turtwigXml);
    const strike = data.anims['Strike'];
    const attack = data.anims['Attack'];
    expect(strike?.index).toBe(2);
    expect(strike?.sheet).toBe('Attack');
    expect(strike?.frameWidth).toBe(attack?.frameWidth);
    expect(strike?.durations).toEqual(attack?.durations);
    expect(strike?.hitFrame).toBe(attack?.hitFrame);
    // The copy must not share the array with the target.
    expect(strike?.durations).not.toBe(attack?.durations);
  });

  it('includes Idle, Walk, Hurt and Faint for the Phase 0/1 needs', () => {
    const data = parseAnimData(turtwigXml);
    for (const name of ['Idle', 'Walk', 'Hurt', 'Faint', 'Attack']) {
      expect(data.anims[name], name).toBeDefined();
    }
  });

  it('allows entries without an Index (Turtwig Rumble, Piplup Appeal)', () => {
    const rumble = parseAnimData(turtwigXml).anims['Rumble'];
    expect(rumble).toBeDefined();
    expect(rumble?.index).toBeUndefined();
    expect(rumble?.sheet).toBe('Withdraw');
  });

  it('follows chained CopyOf entries', () => {
    const data = parseAnimData(
      minimal(`
        <Anim><Name>A</Name><Index>0</Index><FrameWidth>8</FrameWidth><FrameHeight>8</FrameHeight>
          <Durations><Duration>3</Duration><Duration>5</Duration></Durations></Anim>
        <Anim><Name>B</Name><Index>1</Index><CopyOf>A</CopyOf></Anim>
        <Anim><Name>C</Name><Index>2</Index><CopyOf>B</CopyOf></Anim>`),
    );
    expect(data.anims['C']?.sheet).toBe('A');
    expect(data.anims['C']?.durations).toEqual([3, 5]);
    expect(data.anims['C']?.index).toBe(2);
  });

  it('rejects dangling and cyclic CopyOf', () => {
    expect(() =>
      parseAnimData(minimal(`<Anim><Name>B</Name><Index>1</Index><CopyOf>Nope</CopyOf></Anim>`)),
    ).toThrow(/unknown action Nope/);
    expect(() =>
      parseAnimData(
        minimal(`
          <Anim><Name>A</Name><Index>0</Index><CopyOf>B</CopyOf></Anim>
          <Anim><Name>B</Name><Index>1</Index><CopyOf>A</CopyOf></Anim>`),
      ),
    ).toThrow(/cycle/);
  });

  it('rejects malformed input', () => {
    expect(() => parseAnimData('<AnimData><Anims><Anim>')).toThrow(/parse error/);
    expect(() => parseAnimData('<Other/>')).toThrow(/root element/);
    expect(() =>
      parseAnimData(
        minimal(`<Anim><Name>A</Name><Index>0</Index><FrameWidth>8</FrameWidth><FrameHeight>8</FrameHeight>
          <Durations><Duration>x</Duration></Durations></Anim>`),
      ),
    ).toThrow(/bad <Duration>/);
    expect(() =>
      parseAnimData(
        minimal(`<Anim><Name>A</Name><Index>0</Index><FrameHeight>8</FrameHeight>
          <Durations><Duration>1</Duration></Durations></Anim>`),
      ),
    ).toThrow(/<FrameWidth> missing in A/);
  });
});

describe('timing helpers', () => {
  it('converts 60 fps ticks to milliseconds', () => {
    expect(ticksToMs(60)).toBe(1000);
    expect(ticksToMs(3)).toBe(50);
  });

  it('sums a loop length', () => {
    const walk = parseAnimData(turtwigXml).anims['Walk'];
    expect(walk && animDurationMs(walk)).toBeCloseTo((40 * 1000) / 60);
  });
});
