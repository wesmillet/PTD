/**
 * Side panel of the PC scene: sort and filter controls, and the summary of
 * the selected Pokémon (icon, portrait, level, types, stats, moves, EXP) with
 * the Rare Candy and party / box shortcuts. DOM overlay.
 */
import { expForLevel, getMove, getPokemon, typeName } from '../data/pokedata';
import { runtimeConfig } from '../game/runtime';
import { towerAttacksPerSec } from '../sim/speed';
import typesJson from '../data/types.json';
import { evolutionOptions, evolveMonster } from '../sim/evolution';
import { replaceMove, useRareCandy } from '../sim/items';
import { makeMoveSlot, type Monster } from '../sim/monster';
import { learnableAt } from '../sim/moves';
import { capitalizeName } from '../sim/names';
import type { BoxFilter, SortKey } from '../sim/pc';
import { capitalize, ensureOverlayStyles, hpBox, iconImage, isolateFromGame, typeBadge } from './domOverlay';
import { EvolutionDialog } from './evolutionDialog';
import { LearnDialog } from './learnDialog';

export interface PcSummaryHooks {
  portraitUrl: (species: number) => string | undefined;
  iconUrl: (species: number) => string | undefined;
  rareCandies: () => number;
  useRareCandy: () => void;
  /** Where the selected Pokémon sits; drives the shortcut button. */
  location: (mon: Monster) => 'party' | 'box';
  toParty: (mon: Monster) => void;
  toBox: (mon: Monster) => void;
  onSort: (key: SortKey) => void;
  onFilter: (filter: BoxFilter) => void;
  onChange: () => void;
  onBack: () => void;
}

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'level', label: 'Level' },
  { key: 'type', label: 'Type' },
  { key: 'dex', label: 'Dex number' },
  { key: 'name', label: 'Name' },
];

export class PcSummary {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private mon: Monster | null = null;
  private sortKey: SortKey = 'level';
  private filter: BoxFilter = {};
  private readonly learnDialog = new LearnDialog();
  private readonly evolutionDialog = new EvolutionDialog();

  constructor(private readonly hooks: PcSummaryHooks) {
    ensureOverlayStyles();
    this.root = document.createElement('div');
    this.root.className = 'ptd-panel ptd-side';
    this.root.id = 'ptd-pc-summary';
    isolateFromGame(this.root);

    const title = document.createElement('h2');
    title.textContent = 'PC';
    const back = document.createElement('button');
    back.className = 'ptd-close';
    back.textContent = 'Back';
    back.addEventListener('click', () => hooks.onBack());
    this.root.append(title, back);

    const controls = document.createElement('div');
    controls.className = 'ptd-actions';
    const sortLabel = document.createElement('span');
    sortLabel.className = 'ptd-label';
    sortLabel.textContent = 'Sort box';
    const sort = document.createElement('select');
    sort.id = 'ptd-pc-sort';
    for (const { key, label } of SORT_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      sort.appendChild(opt);
    }
    sort.value = this.sortKey;
    const sortButton = document.createElement('button');
    sortButton.textContent = 'Sort';
    sortButton.addEventListener('click', () => {
      this.sortKey = sort.value as SortKey;
      hooks.onSort(this.sortKey);
    });
    controls.append(sortLabel, sort, sortButton);
    this.root.appendChild(controls);

    const filters = document.createElement('div');
    filters.className = 'ptd-actions';
    const filterLabel = document.createElement('span');
    filterLabel.className = 'ptd-label';
    filterLabel.textContent = 'Show';
    const type = document.createElement('select');
    type.id = 'ptd-pc-filter-type';
    const any = document.createElement('option');
    any.value = '';
    any.textContent = 'All types';
    type.appendChild(any);
    const names = (typesJson as { names: Record<string, string> }).names;
    for (const [id, name] of Object.entries(names)) {
      if (Number(id) > 17) continue; // Fairy and later are not Gen 4
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = capitalize(name);
      type.appendChild(opt);
    }
    const shiny = document.createElement('label');
    shiny.className = 'ptd-dim';
    const shinyBox = document.createElement('input');
    shinyBox.type = 'checkbox';
    shinyBox.id = 'ptd-pc-filter-shiny';
    shiny.append(shinyBox, document.createTextNode(' Shiny only'));
    const apply = () => {
      this.filter = {
        ...(type.value ? { type: Number(type.value) } : {}),
        ...(shinyBox.checked ? { shiny: true } : {}),
      };
      hooks.onFilter(this.filter);
    };
    type.addEventListener('change', apply);
    shinyBox.addEventListener('change', apply);
    filters.append(filterLabel, type, shiny);
    this.root.appendChild(filters);

    this.body = document.createElement('div');
    this.body.id = 'ptd-pc-body';
    this.root.appendChild(this.body);
    document.body.appendChild(this.root);
    this.show(null);
  }

  get selected(): Monster | null {
    return this.mon;
  }

  show(mon: Monster | null): void {
    this.mon = mon;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    this.learnDialog.close();
    this.evolutionDialog.close();
    this.root.remove();
  }

  private render(): void {
    const body = this.body;
    body.innerHTML = '';
    const mon = this.mon;
    if (!mon) {
      const hint = document.createElement('div');
      hint.className = 'ptd-dim';
      hint.style.marginTop = '10px';
      hint.textContent = 'Click a Pokémon to see its summary. Drag to move it between the party and the boxes; the arrows switch boxes.';
      body.appendChild(hint);
      return;
    }
    const where = this.hooks.location(mon);
    const head = document.createElement('div');
    head.className = 'ptd-head';
    head.style.marginTop = '10px';
    const icon = iconImage(this.hooks.iconUrl(mon.species));
    const portrait = document.createElement('img');
    portrait.className = 'ptd-portrait';
    portrait.alt = '';
    const url = this.hooks.portraitUrl(mon.species);
    if (url) portrait.src = url;
    const text = document.createElement('div');
    const name = document.createElement('div');
    name.innerHTML = `<b>${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}</b> <span class="ptd-dim">#${mon.species}</span>`;
    const line = document.createElement('div');
    line.className = 'ptd-dim';
    line.textContent = `Lv ${mon.level}  ·  ${where === 'party' ? 'in the party' : 'in a box'}`;
    const types = document.createElement('div');
    types.style.marginTop = '4px';
    for (const t of mon.types) types.appendChild(typeBadge(typeName(t)));
    text.append(name, line, types);
    if (icon) head.appendChild(icon);
    head.append(portrait, text);
    body.appendChild(head);

    // The battle-GUI HP box carries name, Lv, HP bar and numbers, EXP bar and the status badge.
    const exp = document.createElement('div');
    exp.className = 'ptd-label';
    const next = mon.level >= 100 ? 0 : expForLevel(mon.growth, mon.level + 1) - mon.exp;
    exp.textContent = `EXP ${mon.exp}${mon.level >= 100 ? '' : `  ·  ${next} to next level`}`;
    body.append(hpBox(mon, 'player-exp'), exp);

    const stats = document.createElement('div');
    stats.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2px 10px;margin:8px 0;font-size:12px';
    for (const [k, label] of [['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']] as const) {
      const d = document.createElement('div');
      d.textContent = `${label} ${mon.stats[k]}`;
      stats.appendChild(d);
    }
    const rate = document.createElement('div');
    rate.textContent = `Attack speed: ${towerAttacksPerSec(getPokemon(mon.species).base.spe, runtimeConfig.speed).toFixed(1)}/s`;
    stats.appendChild(rate);
    body.appendChild(stats);

    const moves = document.createElement('ul');
    moves.className = 'ptd-moves';
    for (const slot of mon.moves) {
      const data = getMove(slot.id);
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.cursor = 'default';
      const mname = document.createElement('span');
      mname.className = 'ptd-name';
      mname.textContent = capitalize(data.name);
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `Pow ${data.power ?? '—'}  Acc ${data.accuracy ?? '—'}  ${data.category}  PP ${slot.pp}/${slot.maxPp}`;
      li.append(mname, typeBadge(typeName(data.type)), meta);
      moves.appendChild(li);
    }
    body.appendChild(moves);

    const evo = evolutionOptions(mon);
    const evoLine = document.createElement('div');
    evoLine.className = 'ptd-dim';
    if (evo.ready.length) evoLine.textContent = `Ready to evolve into ${capitalizeName(evo.ready[0]!.toName)} at the next level-up.`;
    else if (evo.blocked.length) evoLine.textContent = `Evolves into ${evo.blocked.map((b) => `${capitalizeName(b.toName)} (${b.reason})`).join(', ')}.`;
    else evoLine.textContent = 'Does not evolve.';
    body.appendChild(evoLine);

    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const move = document.createElement('button');
    move.id = 'ptd-pc-move';
    move.textContent = where === 'party' ? 'Send to box' : 'Add to party';
    move.addEventListener('click', () => {
      if (where === 'party') this.hooks.toBox(mon);
      else this.hooks.toParty(mon);
      this.render();
    });
    const candy = document.createElement('button');
    candy.id = 'ptd-pc-candy';
    candy.textContent = `Rare Candy (${this.hooks.rareCandies()})`;
    candy.disabled = this.hooks.rareCandies() <= 0 || mon.level >= 100;
    candy.addEventListener('click', () => this.giveCandy(mon));
    actions.append(move, candy);
    body.appendChild(actions);
  }

  private giveCandy(mon: Monster): void {
    if (this.hooks.rareCandies() <= 0 || mon.level >= 100) return;
    this.hooks.useRareCandy();
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
        }, this.hooks.portraitUrl);
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
