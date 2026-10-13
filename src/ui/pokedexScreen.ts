/** Pokédex: seen / caught / shiny per species, with portraits. DOM overlay. */
import { getPokemon } from '../data/pokedata';
import { dexCounts, type GameState } from '../sim/game';
import { capitalize, ensureOverlayStyles, isolateFromGame } from './domOverlay';

export class PokedexScreen {
  private root: HTMLDivElement | null = null;

  constructor(private readonly game: GameState, private readonly portraitUrl: (species: number) => string | undefined, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-pokedex';
    root.style.width = 'min(860px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close());
    root.appendChild(close);
    const counts = dexCounts(this.game);
    const title = document.createElement('h2');
    title.textContent = 'Pokédex';
    const sub = document.createElement('div');
    sub.className = 'ptd-dim';
    sub.textContent = `Seen ${counts.seen}   Caught ${counts.caught}   Shiny ${counts.shiny}   of 493`;
    root.append(title, sub);
    const grid = document.createElement('div');
    grid.className = 'ptd-grid';
    grid.style.cssText = 'grid-template-columns:repeat(auto-fill, minmax(84px, 1fr));gap:6px;margin-top:10px';
    for (let id = 1; id <= 493; id++) {
      const e = this.game.pokedex[String(id)];
      const cell = document.createElement('div');
      cell.className = 'ptd-card';
      const img = document.createElement('img');
      img.alt = '';
      img.style.cssText = 'width:40px;height:40px;image-rendering:pixelated;display:block;margin:0 auto 2px;background:#0d0d16';
      const url = e?.seen ? this.portraitUrl(id) : undefined;
      const label = document.createElement('div');
      if (e?.caught) {
        if (url) img.src = url;
        else img.style.display = 'none';
        label.textContent = `${id} ${capitalize(getPokemon(id).name)}${e.shinyCaught ? ' ★' : ''}`;
      } else if (e?.seen) {
        if (url) {
          img.src = url;
          img.style.filter = 'brightness(0)';
          img.style.opacity = '0.8';
        } else img.style.display = 'none';
        label.textContent = `${id} ${capitalize(getPokemon(id).name)}`;
        label.style.color = 'var(--ptd-text-dim)';
      } else {
        img.style.display = 'none';
        label.textContent = `${id} ???`;
        label.style.color = 'var(--ptd-text-faint)';
        cell.classList.add('unknown');
      }
      cell.append(img, label);
      grid.appendChild(cell);
    }
    root.appendChild(grid);
    document.body.appendChild(root);
    this.root = root;
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.onClose();
  }
}
