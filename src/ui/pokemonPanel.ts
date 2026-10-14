/**
 * In-level Pokémon panel: a DOM overlay (readable at phone width) showing
 * portrait, level, HP, EXP, status and the four moves. Clicking a move makes
 * it active; "Move" hands control back to the scene to pick a new tile.
 */
import { expForLevel, getMove, typeName } from '../data/pokedata';
import type { Monster } from '../sim/monster';
import { resolveMove } from '../sim/moves';
import { evolutionOptions } from '../sim/evolution';
import { capitalizeName } from '../sim/names';
import { capitalize, ensureOverlayStyles, hpBox, isolateFromGame, updateHpBox } from './domOverlay';

export interface PokemonPanelHooks {
  portraitUrl: (species: number) => string | undefined;
  setActiveMove: (mon: Monster, index: number) => void;
  /** Removes a placed Pokémon from the map (build phase); return false if it could not. */
  returnToParty: (mon: Monster) => boolean;
  /** Uses a Potion on this Pokémon; returns the number of potions left, or null if it could not be used. */
  usePotion: (mon: Monster) => number | null;
  potionCount: () => number;
  onClose: () => void;
}

export class PokemonPanel {
  private readonly root: HTMLDivElement;
  private mon: Monster | null = null;
  private placed = false;
  private readonly portrait: HTMLImageElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly hpSlot: HTMLDivElement;
  private hpBoxEl: HTMLDivElement | null = null;
  private readonly expText: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly moveList: HTMLUListElement;
  private readonly moveButton: HTMLSpanElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly potionButton: HTMLButtonElement;
  private lastKey = '';

  constructor(private readonly hooks: PokemonPanelHooks) {
    ensureOverlayStyles();
    this.root = document.createElement('div');
    this.root.className = 'ptd-panel ptd-side';
    this.root.style.display = 'none';
    isolateFromGame(this.root);

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

    // The battle-GUI HP box (name, Lv, HP bar and numbers, EXP bar, status badge).
    this.hpSlot = document.createElement('div');
    this.expText = document.createElement('div');
    this.expText.className = 'ptd-dim';
    this.statusLine = document.createElement('div');
    this.statusLine.className = 'ptd-status';
    this.root.append(this.hpSlot, this.expText, this.statusLine);

    this.moveList = document.createElement('ul');
    this.moveList.className = 'ptd-moves';
    this.root.appendChild(this.moveList);

    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    this.moveButton = document.createElement('span');
    this.moveButton.className = 'ptd-dim';
    this.moveButton.textContent = 'Drag it on the map to move it.';
    actions.appendChild(this.moveButton);
    this.returnButton = document.createElement('button');
    this.returnButton.textContent = 'Return to party';
    this.returnButton.addEventListener('click', () => {
      if (this.mon && this.hooks.returnToParty(this.mon)) this.hide();
    });
    actions.appendChild(this.returnButton);
    this.potionButton = document.createElement('button');
    this.potionButton.id = 'ptd-use-potion';
    this.potionButton.addEventListener('click', () => {
      if (!this.mon) return;
      const left = this.hooks.usePotion(this.mon);
      if (left !== null) {
        this.lastKey = '';
        this.refresh();
      }
    });
    actions.appendChild(this.potionButton);
    this.root.appendChild(actions);
    document.body.appendChild(this.root);
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
    this.hpSlot.innerHTML = '';
    this.hpBoxEl = hpBox(mon, 'player-exp');
    this.hpSlot.appendChild(this.hpBoxEl);
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
    const key = [this.hooks.potionCount(), mon.level, mon.hp, mon.stats.hp, mon.exp, mon.activeMove, mon.status.ailment, mon.status.flinchSeconds > 0, JSON.stringify(mon.status.stages), mon.moves.map((m) => `${m.id}:${m.pp}`).join(','), this.placed].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.title.textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}`;
    this.subtitle.textContent = `Lv ${mon.level}  ${mon.types.map((t) => capitalize(typeName(t))).join(' / ')}  ${this.placed ? 'placed' : 'in party'}`;
    if (this.hpBoxEl) updateHpBox(this.hpBoxEl, mon);
    const next = mon.level >= 100 ? 0 : expForLevel(mon.growth, mon.level + 1) - mon.exp;
    this.expText.textContent = mon.level >= 100 ? 'EXP: max level' : `EXP ${mon.exp}  (${next} to Lv ${mon.level + 1})`;

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

    const evo = evolutionOptions(mon);
    const evoSpan = document.createElement('span');
    if (evo.ready.length) evoSpan.textContent = `Evolves into ${capitalizeName(evo.ready[0]!.toName)} at the next level-up`;
    else if (evo.blocked.length) evoSpan.textContent = `Evolution: ${evo.blocked.map((b) => `${capitalizeName(b.toName)} (${b.reason})`).join(', ')}`;
    else evoSpan.textContent = 'Does not evolve';
    this.statusLine.appendChild(evoSpan);

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
      type.style.background = `var(--type-${typeName(data.type)}, #444)`;
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
    this.moveButton.style.display = this.placed ? '' : 'none';
    this.returnButton.style.display = this.placed ? '' : 'none';
    const potions = this.hooks.potionCount();
    this.potionButton.textContent = `Potion (${potions})`;
    this.potionButton.disabled = potions <= 0 || mon.hp >= mon.stats.hp || !this.placed;
  }

  destroy(): void {
    this.root.remove();
  }
}
