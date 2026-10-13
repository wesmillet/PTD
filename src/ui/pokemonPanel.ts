/**
 * In-level Pokémon panel: a DOM overlay (readable at phone width) showing
 * portrait, level, HP, EXP, status and the four moves. Clicking a move makes
 * it active; "Move" hands control back to the scene to pick a new tile.
 */
import { expForLevel, getMove, typeName } from '../data/pokedata';
import { expToNextFraction } from '../sim/exp';
import type { Monster } from '../sim/monster';
import { resolveMove } from '../sim/moves';
import { capitalize, ensureOverlayStyles, TYPE_COLORS } from './domOverlay';

export interface PokemonPanelHooks {
  portraitUrl: (species: number) => string | undefined;
  setActiveMove: (mon: Monster, index: number) => void;
  /** Called when the player wants to move this Pokémon; return false if it is not placed. */
  pickUp: (mon: Monster) => boolean;
  /** Removes a placed Pokémon from the map (build phase); return false if it could not. */
  returnToParty: (mon: Monster) => boolean;
  onClose: () => void;
}

export class PokemonPanel {
  private readonly root: HTMLDivElement;
  private mon: Monster | null = null;
  private placed = false;
  private readonly portrait: HTMLImageElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly hpBar: HTMLDivElement;
  private readonly hpText: HTMLElement;
  private readonly expBar: HTMLDivElement;
  private readonly expText: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly moveList: HTMLUListElement;
  private readonly moveButton: HTMLButtonElement;
  private readonly returnButton: HTMLButtonElement;
  private lastKey = '';

  constructor(private readonly hooks: PokemonPanelHooks) {
    ensureOverlayStyles();
    this.root = document.createElement('div');
    this.root.className = 'ptd-panel ptd-side';
    this.root.style.display = 'none';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());

    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.hide());
    this.root.appendChild(close);

    const head = document.createElement('div');
    head.className = 'ptd-head';
    this.portrait = document.createElement('img');
    this.portrait.className = 'ptd-portrait';
    this.portrait.alt = '';
    const titles = document.createElement('div');
    this.title = document.createElement('h2');
    this.subtitle = document.createElement('div');
    this.subtitle.className = 'ptd-dim';
    titles.append(this.title, this.subtitle);
    head.append(this.portrait, titles);
    this.root.appendChild(head);

    this.hpText = document.createElement('div');
    this.hpBar = this.bar('hp');
    this.expText = document.createElement('div');
    this.expText.className = 'ptd-dim';
    this.expBar = this.bar('exp');
    this.statusLine = document.createElement('div');
    this.statusLine.className = 'ptd-status';
    this.root.append(this.hpText, this.hpBar, this.expText, this.expBar, this.statusLine);

    this.moveList = document.createElement('ul');
    this.moveList.className = 'ptd-moves';
    this.root.appendChild(this.moveList);

    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    this.moveButton = document.createElement('button');
    this.moveButton.textContent = 'Move';
    this.moveButton.addEventListener('click', () => {
      if (this.mon && this.hooks.pickUp(this.mon)) this.hide();
    });
    actions.appendChild(this.moveButton);
    this.returnButton = document.createElement('button');
    this.returnButton.textContent = 'Return to party';
    this.returnButton.addEventListener('click', () => {
      if (this.mon && this.hooks.returnToParty(this.mon)) this.hide();
    });
    actions.appendChild(this.returnButton);
    this.root.appendChild(actions);
    document.body.appendChild(this.root);
  }

  private bar(kind: string): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = `ptd-bar ${kind}`;
    bar.appendChild(document.createElement('div'));
    return bar;
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  get current(): Monster | null {
    return this.mon;
  }

  show(mon: Monster, placed: boolean): void {
    this.mon = mon;
    this.placed = placed;
    this.lastKey = '';
    this.root.style.display = 'block';
    const url = this.hooks.portraitUrl(mon.species);
    if (url) {
      this.portrait.src = url;
      this.portrait.style.display = '';
    } else {
      this.portrait.style.display = 'none';
    }
    this.refresh();
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.style.display = 'none';
    this.mon = null;
    this.hooks.onClose();
  }

  /** Cheap per-frame refresh: only rewrites when something visible changed. */
  refresh(): void {
    const mon = this.mon;
    if (!mon || !this.isOpen) return;
    const key = [mon.level, mon.hp, mon.stats.hp, mon.exp, mon.activeMove, mon.status.ailment, mon.status.flinchSeconds > 0, JSON.stringify(mon.status.stages), mon.moves.map((m) => `${m.id}:${m.pp}`).join(','), this.placed].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.title.textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}`;
    this.subtitle.textContent = `Lv ${mon.level}  ${mon.types.map((t) => capitalize(typeName(t))).join(' / ')}  ${this.placed ? 'placed' : 'in party'}`;
    const frac = mon.stats.hp > 0 ? mon.hp / mon.stats.hp : 0;
    this.hpText.textContent = `HP ${mon.hp} / ${mon.stats.hp}`;
    this.hpBar.className = `ptd-bar hp${frac <= 0.2 ? ' critical' : frac <= 0.5 ? ' low' : ''}`;
    (this.hpBar.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    const next = mon.level >= 100 ? 0 : expForLevel(mon.growth, mon.level + 1) - mon.exp;
    this.expText.textContent = mon.level >= 100 ? 'EXP: max level' : `EXP ${mon.exp}  (${next} to Lv ${mon.level + 1})`;
    (this.expBar.firstElementChild as HTMLElement).style.width = `${Math.round(expToNextFraction({ growth: mon.growth, level: mon.level, exp: mon.exp }) * 100)}%`;

    const chips: string[] = [];
    if (mon.status.ailment !== 'none') chips.push(capitalize(mon.status.ailment));
    if (mon.status.flinchSeconds > 0) chips.push('Flinch');
    for (const [stat, stage] of Object.entries(mon.status.stages)) if (stage !== 0) chips.push(`${stat.toUpperCase()} ${stage > 0 ? '+' : ''}${stage}`);
    this.statusLine.innerHTML = '';
    if (chips.length === 0) {
      const ok = document.createElement('span');
      ok.textContent = 'No status';
      this.statusLine.appendChild(ok);
    }
    for (const c of chips) {
      const span = document.createElement('span');
      span.textContent = c;
      this.statusLine.appendChild(span);
    }

    this.moveList.innerHTML = '';
    mon.moves.forEach((slot, index) => {
      const spec = resolveMove(slot.id);
      const data = getMove(slot.id);
      const li = document.createElement('li');
      li.className = `ptd-move${index === mon.activeMove ? ' active' : ''}`;
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${index === mon.activeMove ? '> ' : ''}${capitalize(data.name)}`;
      const type = document.createElement('span');
      type.className = 'ptd-type';
      type.textContent = typeName(data.type);
      type.style.background = TYPE_COLORS[typeName(data.type)] ?? '#444';
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `Pow ${data.power ?? '—'}  Acc ${data.accuracy ?? '—'}  ${data.category}  PP ${slot.pp}/${slot.maxPp}  range ${spec.range}  ${spec.targeting}`;
      li.append(name, type, meta);
      li.addEventListener('click', () => {
        this.hooks.setActiveMove(mon, index);
        this.refresh();
      });
      this.moveList.appendChild(li);
    });
    if (mon.moves.length === 0) {
      const li = document.createElement('li');
      li.className = 'ptd-dim';
      li.textContent = 'No moves';
      this.moveList.appendChild(li);
    }
    this.moveButton.disabled = !this.placed;
    this.moveButton.textContent = this.placed ? 'Move' : 'Not placed';
    this.returnButton.style.display = this.placed ? '' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
