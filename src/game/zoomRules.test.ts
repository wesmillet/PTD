import { describe, expect, it } from 'vitest';
import { clampZoom, fitsWindow, parseZoom, stepZoom, zoomToast, ZOOMS } from './zoomRules';

const canvas = { width: 960, height: 636 };

describe('zoom rules', () => {
  it('a fixed zoom fits only when the whole canvas fits the window; Fit always fits', () => {
    const laptop = { width: 1280, height: 720 };
    expect(fitsWindow('fit', canvas, laptop)).toBe(true);
    expect(fitsWindow(1, canvas, laptop)).toBe(true);
    expect(fitsWindow(1.5, canvas, laptop)).toBe(false); // 954 tall
    expect(fitsWindow(2, canvas, laptop)).toBe(false);
    expect(fitsWindow(1.5, canvas, { width: 1920, height: 1080 })).toBe(true);
    expect(fitsWindow(2, canvas, { width: 1920, height: 1080 })).toBe(false); // 1272 tall
    expect(fitsWindow(1, canvas, { width: 800, height: 500 })).toBe(false);
    expect(fitsWindow('fit', canvas, { width: 320, height: 200 })).toBe(true);
  });

  it('clamps a saved zoom that does not fit to Fit and keeps one that does', () => {
    expect(clampZoom(2, canvas, { width: 1280, height: 720 })).toBe('fit');
    expect(clampZoom(1, canvas, { width: 1280, height: 720 })).toBe(1);
    expect(clampZoom(1.5, canvas, { width: 1920, height: 1080 })).toBe(1.5);
    expect(clampZoom('fit', canvas, { width: 100, height: 100 })).toBe('fit');
  });

  it('steps without wrapping', () => {
    expect(stepZoom('fit', -1)).toBe('fit');
    expect(stepZoom('fit', 1)).toBe(1);
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(2, -1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe('fit');
    expect(ZOOMS).toEqual(['fit', 1, 1.5, 2]);
  });

  it('reads the stored form and rejects anything else', () => {
    expect(parseZoom('fit')).toBe('fit');
    expect(parseZoom('1')).toBe(1);
    expect(parseZoom('1.5')).toBe(1.5);
    expect(parseZoom('2')).toBe(2);
    expect(parseZoom('3')).toBeUndefined();
    expect(parseZoom('')).toBeUndefined();
    expect(parseZoom(null)).toBeUndefined();
    expect(parseZoom(undefined)).toBeUndefined();
  });

  it('words the toast for a change, for Fit and for a rejected saved zoom', () => {
    expect(zoomToast(1.5)).toBe('Zoom 1.5x. Press - to shrink, 0 for Fit');
    expect(zoomToast('fit')).toBe('Zoom Fit. Press + to enlarge');
    expect(zoomToast('fit', 2)).toBe('Zoom Fit (2x did not fit this window). Press + to enlarge');
  });
});
