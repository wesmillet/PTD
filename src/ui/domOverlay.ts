/**
 * DOM overlay helpers. The stylesheet is src/ui/theme.css (imported from
 * main.ts); see docs/ui.md for the variables and component classes.
 */
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
