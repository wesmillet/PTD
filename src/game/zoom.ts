/**
 * Canvas zoom: "fit" scales the game to the window (Phaser's FIT mode); a
 * fixed zoom shows the 960-wide canvas at exactly 1x, 1.5x or 2x CSS pixels
 * (Phaser's NONE mode with its zoom factor), centred, scrolling when it is
 * bigger than the window. Saved with the other settings; `+` and `-` step it.
 */
import Phaser from 'phaser';
import { runtime } from './runtime';

export type Zoom = 'fit' | 1 | 1.5 | 2;
export const ZOOMS: readonly Zoom[] = ['fit', 1, 1.5, 2];

let game: Phaser.Game | null = null;
let onChange: (() => void) | null = null;

export function isZoom(v: unknown): v is Zoom {
  return (ZOOMS as readonly unknown[]).includes(v);
}

export function zoomLabel(z: Zoom): string {
  return z === 'fit' ? 'Fit' : `${z}x`;
}

/** Called once by main.ts; applies the current setting straight away. */
export function registerZoomGame(g: Phaser.Game, afterChange?: () => void): void {
  game = g;
  onChange = afterChange ?? null;
  applyZoom(runtime.zoom);
}

/** Applies the zoom to the live canvas (no-op before the game exists). */
export function applyZoom(z: Zoom): void {
  runtime.zoom = z;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('ptd-zoomed', z !== 'fit');
  if (!game) return;
  const scale = game.scale;
  // The display size keeps FIT's aspect mode and parent constraint between
  // calls, so a fixed zoom has to drop them or it is clamped to the window.
  if (z === 'fit') {
    scale.scaleMode = Phaser.Scale.FIT;
    scale.displaySize.setAspectMode(Phaser.Scale.FIT);
    scale.displaySize.setParent(scale.parentSize);
    scale.setZoom(1);
  } else {
    scale.scaleMode = Phaser.Scale.NONE;
    scale.displaySize.setAspectMode(Phaser.Scale.NONE);
    scale.displaySize.setParent(undefined as unknown as Phaser.Structs.Size);
    scale.setZoom(z);
  }
  scale.refresh();
}

/** Sets and persists the zoom. */
export function setZoom(z: Zoom): void {
  if (!isZoom(z) || z === runtime.zoom) return;
  applyZoom(z);
  onChange?.();
}

/** Steps through Fit, 1x, 1.5x, 2x (wrapping). */
export function stepZoom(dir: 1 | -1): Zoom {
  const i = ZOOMS.indexOf(runtime.zoom);
  const next = ZOOMS[(i + dir + ZOOMS.length) % ZOOMS.length] ?? 'fit';
  setZoom(next);
  return next;
}

let keysInstalled = false;
/** Binds `+`/`=` and `-` (keyboard and numpad) to step the zoom, except while typing in a field. */
export function installZoomKeys(): void {
  if (keysInstalled || typeof window === 'undefined') return;
  keysInstalled = true;
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') stepZoom(1);
    else if (e.key === '-' || e.key === '_') stepZoom(-1);
  });
}
