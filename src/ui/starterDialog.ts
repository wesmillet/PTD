/** One-time starter choice. DOM modal. */
import { getPokemon, typeName } from '../data/pokedata';
import { capitalize, ensureOverlayStyles, isolateFromGame } from './domOverlay';

export function showStarterDialog(starters: readonly number[], portraitUrl: (species: number) => string | undefined, onPick: (species: number) => void): HTMLDivElement {
  ensureOverlayStyles();
  const root = document.createElement('div');
  root.className = 'ptd-panel ptd-modal';
  root.id = 'ptd-starter';
  isolateFromGame(root);
  const title = document.createElement('h2');
  title.textContent = 'Choose your first Pokémon';
  const hint = document.createElement('div');
  hint.className = 'ptd-dim';
  hint.textContent = 'Professor Rowan left these three by Lake Verity. Pick one; it joins your party at level 5.';
  root.append(title, hint);
  const list = document.createElement('ul');
  list.className = 'ptd-moves';
  for (const species of starters) {
    const data = getPokemon(species);
    const li = document.createElement('li');
    li.className = 'ptd-move';
    li.style.gridTemplateColumns = 'auto 1fr auto';
    const img = document.createElement('img');
    img.className = 'ptd-portrait';
    img.style.width = '40px';
    img.style.height = '40px';
    img.alt = '';
    const url = portraitUrl(species);
    if (url) img.src = url;
    const name = document.createElement('span');
    name.className = 'ptd-name';
    name.textContent = capitalize(data.name);
    const type = document.createElement('span');
    type.className = 'ptd-type';
    const t = typeName(data.types[0] ?? 1);
    type.textContent = t;
    type.style.background = `var(--type-${t}, #444)`;
    li.append(img, name, type);
    li.addEventListener('click', () => {
      root.remove();
      onPick(species);
    });
    list.appendChild(li);
  }
  root.appendChild(list);
  document.body.appendChild(root);
  return root;
}
