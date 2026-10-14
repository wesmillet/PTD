/**
 * The zoom rules on their own, without Phaser or the DOM, so they can be
 * unit-tested: which zooms exist, which fit a window, stepping without
 * wrapping, labels, the toast wording and the stored-value format.
 * `game/zoom.ts` applies them to the live canvas.
 */

export type Zoom = 'fit' | 1 | 1.5 | 2;
export const ZOOMS: readonly Zoom[] = ['fit', 1, 1.5, 2];

/** localStorage key of the zoom: its own setting, never part of a save slot or a save code. */
export const ZOOM_KEY = 'ptd.settings.zoom';

export interface Size {
  width: number;
  height: number;
}

export function isZoom(v: unknown): v is Zoom {
  return (ZOOMS as readonly unknown[]).includes(v);
}

/** The stored form ("fit", "1", "1.5", "2") back to a zoom; undefined for anything else. */
export function parseZoom(text: string | null | undefined): Zoom | undefined {
  if (text === 'fit') return 'fit';
  const n = Number(text);
  return isZoom(n) ? n : undefined;
}

export function zoomLabel(z: Zoom): string {
  return z === 'fit' ? 'Fit' : `${z}x`;
}

/** Whether the canvas at `z` is no bigger than the window. Fit always fits: it shrinks. */
export function fitsWindow(z: Zoom, canvas: Size, window: Size): boolean {
  if (z === 'fit') return true;
  return canvas.width * z <= window.width && canvas.height * z <= window.height;
}

/** `z` when it fits the window, else Fit. */
export function clampZoom(z: Zoom, canvas: Size, window: Size): Zoom {
  return fitsWindow(z, canvas, window) ? z : 'fit';
}

/** One step up or down the list without wrapping: minus at Fit stays at Fit, plus at 2x stays at 2x. */
export function stepZoom(z: Zoom, dir: 1 | -1): Zoom {
  const i = ZOOMS.indexOf(z);
  const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
  return next ?? 'fit';
}

/** The toast shown when the zoom changes; `rejected` names a saved zoom that did not fit the window. */
export function zoomToast(z: Zoom, rejected?: Zoom): string {
  if (z !== 'fit') return `Zoom ${zoomLabel(z)}. Press - to shrink, 0 for Fit`;
  if (rejected !== undefined && rejected !== 'fit') return `Zoom Fit (${zoomLabel(rejected)} did not fit this window). Press + to enlarge`;
  return 'Zoom Fit. Press + to enlarge';
}
