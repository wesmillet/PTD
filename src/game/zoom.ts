/**
 * Canvas zoom on the live Phaser canvas. "Fit" shows the game at its native
 * size and shrinks it into a smaller window (FIT mode capped at 1x, so a big
 * monitor never blows the pixels up); 1x, 1.5x and 2x are fixed sizes (NONE
 * mode with that zoom factor), centred, scrolling when bigger than the
 * window. The rules are in zoomRules.ts. This file keeps the setting under
 * its own localStorage key (never in a save slot or code), keeps it from
 * trapping the player (a zoom bigger than the window is never saved and
 * falls back to Fit on boot and on resize), binds + - 0 and shows the toast.
 */
import Phaser from 'phaser';
import { runtime, urlParam } from './runtime';
import { clampZoom, fitsWindow, isZoom, parseZoom, stepZoom as stepRule, ZOOM_KEY, zoomToast, type Zoom } from './zoomRules';

export { isZoom, zoomLabel, ZOOMS, type Zoom } from './zoomRules';

let game: Phaser.Game | null = null;

function canvasSize(): { width: number; height: number } {
  const width = game ? Number(game.config.width) : 0;
  const height = game ? Number(game.config.height) : 0;
  return { width: width || 960, height: height || 636 };
}

function windowSize(): { width: number; height: number } {
  return typeof window === 'undefined' ? { width: Infinity, height: Infinity } : { width: window.innerWidth, height: window.innerHeight };
}

/** The stored zoom, or undefined when none was ever stored (or storage is unavailable). */
export function readStoredZoom(): Zoom | undefined {
  try {
    return parseZoom(localStorage.getItem(ZOOM_KEY));
  } catch {
    return undefined;
  }
}

function storeZoom(z: Zoom): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(z));
  } catch {
    // storage unavailable
  }
}

/** Whether the canvas at `z` fits the current window (Fit always does). */
export function zoomFits(z: Zoom): boolean {
  return fitsWindow(z, canvasSize(), windowSize());
}

/**
 * Called once by main.ts. Applies the stored zoom when it fits the window,
 * else Fit (stored, so it does not come back next load); `?zoom=fit` forces
 * and stores Fit. A window that later shrinks under a fixed zoom falls back
 * to Fit the same way, so the Options menu never leaves the screen.
 */
export function registerZoomGame(g: Phaser.Game): void {
  game = g;
  if (typeof window === 'undefined') return;
  // A fixed zoom bigger than the window scrolls the page; Phaser only re-reads the canvas position on
  // resize, so pointer input would drift by the scroll offset without this (capture: body scrolls do not bubble).
  window.addEventListener('scroll', () => game?.scale.updateBounds(), { capture: true, passive: true });
  window.addEventListener('resize', () => {
    if (!zoomFits(runtime.zoom)) setZoom('fit', runtime.zoom);
  });
  if (urlParam('zoom') === 'fit') storeZoom('fit');
  const stored = readStoredZoom() ?? 'fit';
  const applied = clampZoom(stored, canvasSize(), windowSize());
  if (applied !== stored) storeZoom('fit');
  applyZoom(applied);
  // Shown when the first screen appears (BootScene calls flushZoomToast), not over the loading bar.
  if (applied !== stored) pendingToast = zoomToast(applied, stored);
  else if (applied !== 'fit') pendingToast = zoomToast(applied);
}

/** The boot toast waits for the first real screen, so the two seconds are not spent on the loading bar. */
let pendingToast: string | null = null;

/** Shows the boot toast, if any; the Boot scene calls this as it hands off. */
export function flushZoomToast(): void {
  if (!pendingToast) return;
  showZoomToast(pendingToast);
  pendingToast = null;
}

/** Applies the zoom to the live canvas without storing it (no-op before the game exists). */
export function applyZoom(z: Zoom): void {
  runtime.zoom = z;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('ptd-zoomed', z !== 'fit');
  if (game) {
    const scale = game.scale;
    // The display size keeps FIT's aspect mode and parent constraint between
    // calls, so a fixed zoom has to drop them or it is clamped to the window.
    if (z === 'fit') {
      scale.scaleMode = Phaser.Scale.FIT;
      scale.displaySize.setAspectMode(Phaser.Scale.FIT);
      scale.displaySize.setParent(scale.parentSize);
      // Never above native size: the page opens at 1x on a big screen and only shrinks on a small one.
      scale.displaySize.setMax(scale.gameSize.width, scale.gameSize.height);
      scale.setZoom(1);
    } else {
      scale.scaleMode = Phaser.Scale.NONE;
      scale.displaySize.setAspectMode(Phaser.Scale.NONE);
      scale.displaySize.setParent(undefined as unknown as Phaser.Structs.Size);
      scale.displaySize.setMax();
      scale.setZoom(z);
    }
    scale.refresh();
  }
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('ptd-zoom'));
}

/**
 * Sets the zoom, stores it when it fits the window (a zoom bigger than the
 * window is never saved, so the next load fits) and shows the toast when it
 * changed. `rejected` names a saved zoom the window could not hold.
 */
export function setZoom(z: Zoom, rejected?: Zoom): void {
  if (!isZoom(z)) return;
  const changed = z !== runtime.zoom;
  applyZoom(z);
  if (zoomFits(z)) storeZoom(z);
  pendingToast = null; // a change during loading makes the boot toast stale
  if (changed || rejected !== undefined) showZoomToast(zoomToast(z, rejected));
}

/** One step up or down (Fit, 1x, 1.5x, 2x) without wrapping. */
export function stepZoom(dir: 1 | -1): Zoom {
  const next = stepRule(runtime.zoom, dir);
  setZoom(next);
  return next;
}

/** Back to Fit (the 0 key). */
export function resetZoom(): void {
  setZoom('fit');
}

/**
 * Reads the zoom an old save carried, once: ignored as soon as the setting
 * has its own stored value, so importing a code or switching slots never
 * changes the zoom again.
 */
export function migrateZoomFromSave(saved: unknown): void {
  if (!isZoom(saved) || readStoredZoom() !== undefined) return;
  const applied = clampZoom(saved, canvasSize(), windowSize());
  setZoom(applied, applied !== saved ? saved : undefined);
  storeZoom(applied);
}

/**
 * The part of the canvas inside the window, in game pixels: the whole
 * canvas at Fit, the top-left region at a fixed zoom that scrolls. Menus
 * that must stay reachable anchor to it.
 */
export function visibleCanvasRect(): { x: number; y: number; width: number; height: number } {
  const size = canvasSize();
  if (!game || typeof window === 'undefined') return { x: 0, y: 0, ...size };
  const r = game.canvas.getBoundingClientRect();
  const s = r.width / size.width || 1;
  const left = Math.max(r.left, 0);
  const top = Math.max(r.top, 0);
  const right = Math.min(r.right, window.innerWidth);
  const bottom = Math.min(r.bottom, window.innerHeight);
  return { x: (left - r.left) / s, y: (top - r.top) / s, width: Math.max(0, right - left) / s, height: Math.max(0, bottom - top) / s };
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
const TOAST_MS = 2000;

/** A two-second line at the top of the window (not the canvas, so it shows at every zoom and scroll). */
export function showZoomToast(text: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ptd-toast';
    toastEl.id = 'ptd-zoom-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.display = 'none';
  }, TOAST_MS);
}

let keysInstalled = false;
/** Binds `+`/`=` and `-` (keyboard and numpad) to step the zoom and `0` to Fit, except while typing in a field. */
export function installZoomKeys(): void {
  if (keysInstalled || typeof window === 'undefined') return;
  keysInstalled = true;
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') stepZoom(1);
    else if (e.key === '-' || e.key === '_') stepZoom(-1);
    else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') resetZoom();
  });
}
