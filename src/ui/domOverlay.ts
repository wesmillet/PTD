/** Shared styling for DOM overlays (Pokémon panel, learn dialog). Injected once. */
const STYLE_ID = 'ptd-overlay-style';

export function ensureOverlayStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.ptd-panel { position: fixed; z-index: 20; background: rgba(18,18,30,0.96); color: #e8e8f0; font: 14px/1.4 monospace;
  border: 1px solid #5a5a80; border-radius: 6px; padding: 12px; box-sizing: border-box; box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
.ptd-panel.ptd-side { right: 12px; top: 12px; width: 340px; max-height: calc(100vh - 24px); overflow: auto; }
.ptd-panel.ptd-modal { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100vw - 24px)); }
.ptd-panel h2 { margin: 0 0 6px; font-size: 18px; text-transform: capitalize; }
.ptd-panel .ptd-head { display: flex; gap: 12px; align-items: center; }
.ptd-panel .ptd-portrait { width: 80px; height: 80px; image-rendering: pixelated; border: 1px solid #5a5a80; background: #0d0d16; flex: none; }
.ptd-panel .ptd-dim { color: #9a9ab0; font-size: 12px; }
.ptd-panel .ptd-bar { position: relative; height: 12px; background: #2a2a3a; border-radius: 3px; overflow: hidden; margin: 4px 0; }
.ptd-panel .ptd-bar > div { position: absolute; inset: 0 auto 0 0; }
.ptd-panel .ptd-bar.hp > div { background: #5ad35a; }
.ptd-panel .ptd-bar.hp.low > div { background: #d3b05a; }
.ptd-panel .ptd-bar.hp.critical > div { background: #d35a5a; }
.ptd-panel .ptd-bar.exp > div { background: #6fa8dc; }
.ptd-panel .ptd-moves { list-style: none; margin: 10px 0; padding: 0; }
.ptd-panel .ptd-move { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 10px; margin: 4px 0;
  border: 1px solid #3a3a5a; border-radius: 4px; cursor: pointer; background: #202030; }
.ptd-panel .ptd-move:hover { background: #2c2c44; }
.ptd-panel .ptd-move.active { border-color: #ffe066; background: #2e2a1a; }
.ptd-panel .ptd-move .ptd-name { font-weight: bold; text-transform: capitalize; }
.ptd-panel .ptd-move .ptd-type { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #444; color: #fff; text-transform: uppercase; justify-self: end; }
.ptd-panel .ptd-move .ptd-meta { grid-column: 1 / -1; color: #9a9ab0; font-size: 12px; }
.ptd-panel .ptd-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.ptd-panel button { font: 14px monospace; padding: 8px 14px; background: #3a3a5a; color: #fff; border: 1px solid #5a5a80; border-radius: 4px; cursor: pointer; }
.ptd-panel button:hover { background: #50507a; }
.ptd-panel button.ptd-close { position: absolute; top: 8px; right: 8px; padding: 2px 8px; }
.ptd-panel .ptd-status { margin: 6px 0; font-size: 12px; }
.ptd-panel .ptd-status span { display: inline-block; margin-right: 8px; padding: 1px 6px; border-radius: 3px; background: #333; }
@media (max-width: 600px) {
  .ptd-panel.ptd-side { left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 70vh; border-radius: 10px 10px 0 0; font-size: 16px; }
  .ptd-panel .ptd-move { padding: 12px; }
  .ptd-panel button { padding: 12px 18px; font-size: 16px; }
}`;
  document.head.appendChild(style);
}

export const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038',
  bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0', fire: '#f08030', water: '#6890f0', grass: '#78c850',
  electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848',
};

export function capitalize(name: string): string {
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
