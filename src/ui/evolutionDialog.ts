/** "X is evolving into Y" prompt. DOM modal; the scene pauses while it is open. */
import { getPokemon } from '../data/pokedata';
import type { Monster } from '../sim/monster';
import { capitalizeName } from '../sim/names';
import { capitalize, ensureOverlayStyles, isolateFromGame } from './domOverlay';

export class EvolutionDialog {
  private root: HTMLDivElement | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(mon: Monster, to: number, portraitUrl: (species: number) => string | undefined, onChoice: (accept: boolean) => void): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    isolateFromGame(root);
    const title = document.createElement('h2');
    title.textContent = `What? ${capitalizeName(mon.name)} is evolving!`;
    root.appendChild(title);
    const row = document.createElement('div');
    row.className = 'ptd-head';
    const from = document.createElement('img');
    from.className = 'ptd-portrait';
    from.alt = '';
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.style.fontSize = '24px';
    const toImg = document.createElement('img');
    toImg.className = 'ptd-portrait';
    toImg.alt = '';
    const fromUrl = portraitUrl(mon.species);
    const toUrl = portraitUrl(to);
    if (fromUrl) from.src = fromUrl;
    else from.style.display = 'none';
    if (toUrl) toImg.src = toUrl;
    else toImg.style.display = 'none';
    const label = document.createElement('div');
    label.innerHTML = `<b>${capitalize(mon.name)}</b> Lv ${mon.level}<br><span class="ptd-dim">becomes</span><br><b>${capitalize(getPokemon(to).name)}</b>`;
    row.append(from, arrow, toImg, label);
    root.appendChild(row);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const accept = document.createElement('button');
    accept.textContent = 'Evolve';
    accept.addEventListener('click', () => {
      this.close();
      onChoice(true);
    });
    const cancel = document.createElement('button');
    cancel.textContent = 'Stop evolving';
    cancel.addEventListener('click', () => {
      this.close();
      onChoice(false);
    });
    actions.append(accept, cancel);
    root.appendChild(actions);
    document.body.appendChild(root);
    this.root = root;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }
}
