/**
 * Move-replace dialog: the Pokémon wants to learn a move but knows four.
 * DOM modal; the scene pauses the sim while it is open.
 */
import { getMove, typeName } from '../data/pokedata';
import type { Monster } from '../sim/monster';
import { capitalize, ensureOverlayStyles, isolateFromGame, TYPE_COLORS } from './domOverlay';

export class LearnDialog {
  private root: HTMLDivElement | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Shows the choice; `onChoice` receives the slot to replace or null to decline. */
  show(mon: Monster, newMoveId: number, onChoice: (replaceIndex: number | null) => void): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    isolateFromGame(root);
    const title = document.createElement('h2');
    title.textContent = `${capitalize(mon.name)} wants to learn ${capitalize(getMove(newMoveId).name)}`;
    const hint = document.createElement('div');
    hint.className = 'ptd-dim';
    hint.textContent = 'It already knows four moves. Pick one to forget, or keep the current moves.';
    root.append(title, hint);

    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    const row = (moveId: number, label: string, onClick: (() => void) | null) => {
      const data = getMove(moveId);
      const li = document.createElement('li');
      li.className = `ptd-move${onClick ? '' : ' active'}`;
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${label}${capitalize(data.name)}`;
      const type = document.createElement('span');
      type.className = 'ptd-type';
      type.textContent = typeName(data.type);
      type.style.background = TYPE_COLORS[typeName(data.type)] ?? '#444';
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `Pow ${data.power ?? '—'}  Acc ${data.accuracy ?? '—'}  ${data.category}  PP ${data.pp ?? '—'}`;
      li.append(name, type, meta);
      if (onClick) li.addEventListener('click', onClick);
      else li.style.cursor = 'default';
      return li;
    };
    list.appendChild(row(newMoveId, 'NEW: ', null));
    mon.moves.forEach((slot, index) => {
      list.appendChild(
        row(slot.id, 'Forget ', () => {
          this.close();
          onChoice(index);
        }),
      );
    });
    root.appendChild(list);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const decline = document.createElement('button');
    decline.textContent = `Don't learn ${capitalize(getMove(newMoveId).name)}`;
    decline.addEventListener('click', () => {
      this.close();
      onChoice(null);
    });
    actions.appendChild(decline);
    root.appendChild(actions);
    document.body.appendChild(root);
    this.root = root;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }
}
