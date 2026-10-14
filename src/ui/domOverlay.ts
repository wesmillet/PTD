/**
 * DOM overlay helpers. The stylesheet is src/ui/theme.css (imported from
 * main.ts); see docs/ui.md for the variables and component classes.
 */
import uiGen4 from '../data/ui-gen4.json';
import { expForLevel } from '../data/pokedata';
import type { Monster } from '../sim/monster';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HpBoxMeta {
  file: string;
  width: number;
  height: number;
  hpFill: Rect | null;
  expFill: Rect | null;
  lv: { x: number; y: number } | null;
}

const ui = uiGen4 as { hpBoxes: Record<string, HpBoxMeta>; status: Record<string, string> };

/** URL of a shipped asset path as the config files write it. */
export function uiUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}${rel}`;
}

/** Battle-GUI badge name for an ailment (psn, par, slp, brn, frz), or null. */
export const STATUS_BADGE: Record<string, string | undefined> = { poison: 'psn', paralysis: 'par', sleep: 'slp', burn: 'brn', freeze: 'frz' };

/** The Platinum status badge image for an ailment, or null when it has none. */
export function statusBadge(ailment: string): HTMLImageElement | null {
  const name = STATUS_BADGE[ailment];
  const file = name ? ui.status[name] : undefined;
  if (!file) return null;
  const img = document.createElement('img');
  img.className = 'ptd-status-badge';
  img.alt = ailment;
  img.src = uiUrl(file);
  return img;
}

/** The HP box from the battle GUI at 2x, with name, level, HP bar (and EXP bar) laid over it. */
export function hpBox(mon: Monster, variant: 'player' | 'player-exp' | 'enemy' = 'player-exp'): HTMLDivElement {
  const box = document.createElement('div');
  box.className = `ptd-hpbox ${variant === 'enemy' ? 'enemy' : 'player'}`;
  box.dataset.variant = variant;
  const meta = ui.hpBoxes[variant];
  if (meta) box.style.backgroundImage = `url(${uiUrl(meta.file)})`;
  const name = document.createElement('span');
  name.className = 'ptd-hpbox-name';
  const lv = document.createElement('span');
  lv.className = 'ptd-hpbox-lv';
  const bar = document.createElement('div');
  bar.className = 'ptd-hpbox-bar';
  const fill = document.createElement('div');
  fill.className = 'ptd-hpbox-fill';
  bar.appendChild(fill);
  const numbers = document.createElement('span');
  numbers.className = 'ptd-hpbox-numbers';
  const exp = document.createElement('div');
  exp.className = 'ptd-hpbox-exp';
  const expFill = document.createElement('div');
  expFill.className = 'ptd-hpbox-fill';
  exp.appendChild(expFill);
  const badge = document.createElement('span');
  badge.className = 'ptd-hpbox-badge';
  box.append(name, lv, bar, numbers, exp, badge);
  if (meta) {
    const s = 2;
    if (meta.lv) {
      lv.style.left = `${(meta.lv.x + 13) * s}px`;
      lv.style.top = `${meta.lv.y * s - 1}px`;
    }
    if (meta.hpFill) {
      bar.style.left = `${meta.hpFill.x * s}px`;
      bar.style.top = `${meta.hpFill.y * s}px`;
      bar.style.width = `${meta.hpFill.width * s}px`;
      bar.style.height = `${meta.hpFill.height * s}px`;
      numbers.style.right = `${(meta.width - meta.hpFill.x - meta.hpFill.width) * s + 2}px`;
      numbers.style.top = `${(meta.hpFill.y + 6) * s}px`;
      badge.style.left = `${(meta.hpFill.x - 30) * s}px`;
      badge.style.top = `${(meta.hpFill.y + 5) * s}px`;
    }
    if (meta.expFill) {
      exp.style.left = `${meta.expFill.x * s}px`;
      exp.style.top = `${meta.expFill.y * s}px`;
      exp.style.width = `${meta.expFill.width * s}px`;
      exp.style.height = `${meta.expFill.height * s}px`;
    } else {
      exp.style.display = 'none';
    }
    if (variant === 'enemy') numbers.style.display = 'none';
  }
  updateHpBox(box, mon);
  return box;
}

/** Refreshes an HP box's name, level, bars, numbers and status badge. */
export function updateHpBox(box: HTMLDivElement, mon: Monster): void {
  const q = (cls: string) => box.querySelector(`.${cls}`) as HTMLElement;
  q('ptd-hpbox-name').textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}`;
  q('ptd-hpbox-lv').textContent = String(mon.level);
  const frac = mon.stats.hp > 0 ? Math.max(0, Math.min(1, mon.hp / mon.stats.hp)) : 0;
  const bar = q('ptd-hpbox-bar');
  bar.className = `ptd-hpbox-bar${frac <= 0.2 ? ' critical' : frac <= 0.5 ? ' low' : ''}`;
  (bar.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
  q('ptd-hpbox-numbers').textContent = `${mon.hp}/${mon.stats.hp}`;
  const exp = q('ptd-hpbox-exp');
  const next = mon.level >= 100 ? 0 : expForLevel(mon.growth, mon.level + 1) - expForLevel(mon.growth, mon.level);
  const gained = mon.exp - expForLevel(mon.growth, mon.level);
  (exp.firstElementChild as HTMLElement).style.width = `${next > 0 ? Math.round(Math.max(0, Math.min(1, gained / next)) * 100) : 100}%`;
  const badgeSlot = q('ptd-hpbox-badge');
  const current = badgeSlot.dataset.ailment ?? '';
  if (current !== mon.status.ailment) {
    badgeSlot.innerHTML = '';
    const img = statusBadge(mon.status.ailment);
    if (img) badgeSlot.appendChild(img);
    badgeSlot.dataset.ailment = mon.status.ailment;
  }
}

export function ensureOverlayStyles(): void {
  // Styles ship in theme.css; kept so callers do not need to change.
}

/** Adds a 40x40 (or 80x80) portrait image, or nothing when the folder has none. */
export function portraitImage(url: string | undefined, small = true): HTMLImageElement | null {
  if (!url) return null;
  const img = document.createElement('img');
  img.className = `ptd-portrait${small ? ' small' : ''}`;
  img.alt = '';
  img.src = url;
  return img;
}

/**
 * A 32x32 box icon (animated APNG where available); null when the species has
 * none. A shiny gets a small sparkle badge over the corner (its icon is the
 * shiny portrait scaled down when one ships, see runtime.iconUrl).
 */
export function iconImage(url: string | undefined, shiny = false): HTMLElement | null {
  if (!url) return null;
  const img = document.createElement('img');
  img.className = 'ptd-icon';
  img.alt = '';
  img.src = url;
  if (!shiny) return img;
  const wrap = document.createElement('span');
  wrap.className = 'ptd-icon-wrap';
  const badge = document.createElement('span');
  badge.className = 'ptd-sparkle';
  badge.textContent = '★';
  wrap.append(img, badge);
  return wrap;
}

/** A type badge coloured by the CSS variable for that type. */
export function typeBadge(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'ptd-type';
  span.textContent = name;
  span.style.background = `var(--type-${name}, #444)`;
  return span;
}

/**
 * Keeps clicks on a DOM overlay away from the game: Phaser also listens on
 * `window`, so a mousedown on an overlay button would otherwise land on
 * whatever canvas button sits underneath it.
 */
export function isolateFromGame(el: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'wheel', 'contextmenu']) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
}

export const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038',
  bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0', fire: '#f08030', water: '#6890f0', grass: '#78c850',
  electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848',
};

export function capitalize(name: string): string {
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
