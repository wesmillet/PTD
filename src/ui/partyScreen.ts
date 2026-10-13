/**
 * Party / PC screen between levels: party (max 6) and box lists, details
 * with stats and moves, move/swap buttons, sorting. DOM overlay.
 */
import { getMove, typeName } from '../data/pokedata';
import { evolutionOptions } from '../sim/evolution';
import { moveToBox, moveToParty, sortMonsters, MAX_PARTY, type GameState, type SortKey } from '../sim/game';
import type { Monster } from '../sim/monster';
import { capitalizeName } from '../sim/names';
import { capitalize, ensureOverlayStyles, isolateFromGame, TYPE_COLORS } from './domOverlay';
import { replaceMove, useRareCandy } from '../sim/items';
import { evolveMonster } from '../sim/evolution';
import { learnableAt } from '../sim/moves';
import { makeMoveSlot } from '../sim/monster';
import { LearnDialog } from './learnDialog';
import { EvolutionDialog } from './evolutionDialog';

export interface PartyScreenHooks {
  portraitUrl: (species: number) => string | undefined;
  onChange: () => void;
  onClose: () => void;
}

export class PartyScreen {
  private root: HTMLDivElement | null = null;
  private selected: Monster | null = null;
  private sortKey: SortKey = 'level';
  private readonly learnDialog = new LearnDialog();
  private readonly evolutionDialog = new EvolutionDialog();

  constructor(private readonly game: GameState, private readonly hooks: PartyScreenHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal ptd-wide';
    root.id = 'ptd-party-screen';
    root.style.width = 'min(880px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    document.body.appendChild(root);
    this.root = root;
    this.render();
  }

  close(): void {
    if (!this.root) return;
    this.learnDialog.close();
    this.evolutionDialog.close();
    this.root.remove();
    this.root = null;
    this.hooks.onClose();
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    root.innerHTML = '';
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close());
    root.appendChild(close);
    const title = document.createElement('h2');
    title.textContent = `Party ${this.game.party.length} / ${MAX_PARTY}   PC box ${this.game.box.length}   Rare Candy ${this.game.items.rareCandies}`;
    root.appendChild(title);

    const sortRow = document.createElement('div');
    sortRow.className = 'ptd-dim';
    sortRow.textContent = 'Sort by ';
    const select = document.createElement('select');
    for (const key of ['level', 'type', 'name'] as SortKey[]) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);
    }
    select.value = this.sortKey;
    select.addEventListener('change', () => {
      this.sortKey = select.value as SortKey;
      this.render();
    });
    sortRow.appendChild(select);
    root.appendChild(sortRow);

    const columns = document.createElement('div');
    columns.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:12px;margin-top:8px';
    columns.appendChild(this.list('Party', this.game.party, 'party'));
    columns.appendChild(this.list('PC box', this.game.box, 'box'));
    columns.appendChild(this.details());
    root.appendChild(columns);
  }

  private list(title: string, mons: Monster[], where: 'party' | 'box'): HTMLElement {
    const wrap = document.createElement('div');
    const h = document.createElement('div');
    h.style.fontWeight = 'bold';
    h.textContent = title;
    wrap.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'ptd-moves';
    const sorted = where === 'party' ? mons : sortMonsters(mons, this.sortKey);
    if (sorted.length === 0) {
      const li = document.createElement('li');
      li.className = 'ptd-dim';
      li.textContent = where === 'party' ? 'Empty' : 'Nothing in the box';
      ul.appendChild(li);
    }
    for (const mon of sorted) {
      const li = document.createElement('li');
      li.className = `ptd-move${mon === this.selected ? ' active' : ''}`;
      li.style.gridTemplateColumns = 'auto 1fr auto';
      const img = document.createElement('img');
      img.className = 'ptd-portrait';
      img.style.width = '40px';
      img.style.height = '40px';
      img.alt = '';
      const url = this.hooks.portraitUrl(mon.species);
      if (url) img.src = url;
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}  Lv ${mon.level}`;
      const type = document.createElement('span');
      type.className = 'ptd-type';
      const t = typeName(mon.types[0] ?? 1);
      type.textContent = t;
      type.style.background = TYPE_COLORS[t] ?? '#444';
      li.append(img, name, type);
      li.addEventListener('click', () => {
        this.selected = mon;
        this.render();
      });
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    return wrap;
  }

  private details(): HTMLElement {
    const wrap = document.createElement('div');
    const mon = this.selected;
    if (!mon) {
      wrap.className = 'ptd-dim';
      wrap.textContent = 'Select a Pokémon to see its stats and moves.';
      return wrap;
    }
    const inParty = this.game.party.includes(mon);
    const head = document.createElement('div');
    head.className = 'ptd-head';
    const img = document.createElement('img');
    img.className = 'ptd-portrait';
    img.alt = '';
    const url = this.hooks.portraitUrl(mon.species);
    if (url) img.src = url;
    const text = document.createElement('div');
    text.innerHTML = `<b>${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}</b><br><span class="ptd-dim">Lv ${mon.level}  ${mon.types.map((t) => capitalize(typeName(t))).join(' / ')}  ${inParty ? 'party' : 'box'}</span>`;
    head.append(img, text);
    wrap.appendChild(head);

    const stats = document.createElement('div');
    stats.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2px 10px;margin:8px 0;font-size:12px';
    for (const [k, label] of [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']] as const) {
      const d = document.createElement('div');
      d.textContent = `${label} ${k === 'hp' ? `${mon.hp}/${mon.stats.hp}` : mon.stats[k]}`;
      stats.appendChild(d);
    }
    wrap.appendChild(stats);

    const moves = document.createElement('ul');
    moves.className = 'ptd-moves';
    for (const slot of mon.moves) {
      const data = getMove(slot.id);
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.cursor = 'default';
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = capitalize(data.name);
      const type = document.createElement('span');
      type.className = 'ptd-type';
      type.textContent = typeName(data.type);
      type.style.background = TYPE_COLORS[typeName(data.type)] ?? '#444';
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `Pow ${data.power ?? '—'}  Acc ${data.accuracy ?? '—'}  ${data.category}  PP ${slot.pp}/${slot.maxPp}`;
      li.append(name, type, meta);
      moves.appendChild(li);
    }
    wrap.appendChild(moves);

    const evo = evolutionOptions(mon);
    const evoLine = document.createElement('div');
    evoLine.className = 'ptd-dim';
    if (evo.ready.length) evoLine.textContent = `Ready to evolve into ${capitalizeName(evo.ready[0]!.toName)} at the next level-up.`;
    else if (evo.blocked.length) evoLine.textContent = `Evolves into ${evo.blocked.map((b) => `${capitalizeName(b.toName)} (${b.reason})`).join(', ')}.`;
    else evoLine.textContent = 'Does not evolve.';
    wrap.appendChild(evoLine);

    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const move = document.createElement('button');
    move.textContent = inParty ? 'Send to box' : 'Add to party';
    move.addEventListener('click', () => {
      try {
        if (inParty) moveToBox(this.game, this.game.party.indexOf(mon));
        else moveToParty(this.game, this.game.box.indexOf(mon));
        this.hooks.onChange();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      this.render();
    });
    actions.appendChild(move);
    const candy = document.createElement('button');
    candy.textContent = `Rare Candy (${this.game.items.rareCandies})`;
    candy.disabled = this.game.items.rareCandies <= 0 || mon.level >= 100;
    candy.addEventListener('click', () => this.giveCandy(mon));
    actions.appendChild(candy);
    wrap.appendChild(actions);
    return wrap;
  }

  private giveCandy(mon: Monster): void {
    if (this.game.items.rareCandies <= 0 || mon.level >= 100) return;
    this.game.items.rareCandies--;
    const result = useRareCandy(mon);
    this.hooks.onChange();
    this.render();
    const next = () => {
      const moveId = result.toLearn.shift();
      if (moveId !== undefined) {
        this.learnDialog.show(mon, moveId, (replaceIndex) => {
          if (replaceIndex !== null) replaceMove(mon, replaceIndex, moveId);
          this.hooks.onChange();
          this.render();
          next();
        });
        return;
      }
      if (result.evolution) {
        const to = result.evolution.to;
        this.evolutionDialog.show(mon, to, this.hooks.portraitUrl, (accept) => {
          if (accept) {
            evolveMonster(mon, to);
            for (const id of learnableAt(mon.species, mon.level)) {
              if (!mon.moves.some((m) => m.id === id) && mon.moves.length < 4) mon.moves.push(makeMoveSlot(id));
            }
          }
          this.hooks.onChange();
          this.render();
        });
      }
    };
    next();
  }
}
