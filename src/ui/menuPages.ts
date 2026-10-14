/**
 * The pages the start menu opens, as Platinum-framed DOM panels: Pokédex
 * (seen / caught counts), Pokémon (party list), Bag, Trainer Card and
 * Options. Save uses SavePanel. One page is open at a time.
 */
import config from '../data/config.json';
import { getPokemon, typeName } from '../data/pokedata';
import { badgeTextureKey, iconUrl, itemUrl } from '../game/runtime';
import { BALL_IDS, BALLS } from '../sim/catch';
import { allBadges, dexCounts, hasBadge, type GameState } from '../sim/game';
import type { Monster } from '../sim/monster';
import { allBoxed } from '../sim/pc';
import { capitalize, ensureOverlayStyles, iconImage, isolateFromGame, typeBadge, uiUrl } from './domOverlay';

export interface MenuPageHooks {
  game: GameState;
  /** The party as it stands in the level (placed Pokémon carry their current HP). */
  party: () => Monster[];
  isPlaced: (mon: Monster) => boolean;
  openPokemon: (mon: Monster) => void;
  getSpeed: () => number;
  setSpeed: (speed: number) => void;
  onClose: () => void;
}

export class MenuPages {
  private root: HTMLDivElement | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'x') {
      e.stopPropagation();
      this.close();
    }
  };

  constructor(private readonly hooks: MenuPageHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  private openPanel(title: string, id: string): HTMLDivElement {
    ensureOverlayStyles();
    this.close(false);
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = `ptd-page-${id}`;
    root.style.width = 'min(520px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close());
    const h = document.createElement('h2');
    h.textContent = title;
    root.append(close, h);
    document.body.appendChild(root);
    this.root = root;
    window.addEventListener('keydown', this.keyHandler, true);
    return root;
  }

  close(notify = true): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    window.removeEventListener('keydown', this.keyHandler, true);
    if (notify) this.hooks.onClose();
  }

  pokedex(): void {
    const root = this.openPanel('Pokédex', 'pokedex');
    const game = this.hooks.game;
    const counts = dexCounts(game);
    const line = document.createElement('div');
    line.className = 'ptd-dim';
    line.textContent = `Seen ${counts.seen}   Caught ${counts.caught}   Shiny ${counts.shiny}`;
    root.appendChild(line);
    const grid = document.createElement('div');
    grid.className = 'ptd-grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, 72px)';
    const ids = Object.keys(game.pokedex)
      .map(Number)
      .filter((id) => game.pokedex[String(id)]?.seen)
      .sort((a, b) => a - b);
    for (const id of ids) {
      const entry = game.pokedex[String(id)]!;
      const card = document.createElement('div');
      card.className = `ptd-card${entry.caught ? '' : ' unknown'}`;
      const icon = iconImage(iconUrl(id));
      if (icon) card.appendChild(icon);
      const name = document.createElement('div');
      name.textContent = `${entry.caught ? '' : '? '}${capitalize(getPokemon(id).name)}${entry.shinyCaught ? ' ★' : ''}`;
      card.appendChild(name);
      grid.appendChild(card);
    }
    if (ids.length === 0) {
      const none = document.createElement('div');
      none.className = 'ptd-dim';
      none.textContent = 'No Pokémon seen yet.';
      grid.appendChild(none);
    }
    root.appendChild(grid);
  }

  party(): void {
    const root = this.openPanel('Pokémon', 'party');
    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    for (const mon of this.hooks.party()) {
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.gridTemplateColumns = 'auto 1fr auto';
      const icon = iconImage(iconUrl(mon.species)) ?? document.createElement('span');
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}  Lv ${mon.level}`;
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `HP ${mon.hp}/${mon.stats.hp}${this.hooks.isPlaced(mon) ? '  ·  on the field' : ''}${mon.status.ailment !== 'none' ? `  ·  ${capitalize(mon.status.ailment)}` : ''}`;
      li.append(icon, name, typeBadge(typeName(mon.types[0] ?? 1)), meta);
      li.addEventListener('click', () => {
        this.close();
        this.hooks.openPokemon(mon);
      });
      list.appendChild(li);
    }
    root.appendChild(list);
  }

  bag(): void {
    const root = this.openPanel('Bag', 'bag');
    const game = this.hooks.game;
    const section = (title: string, rows: { sprite: string; name: string; count: number }[]) => {
      const h = document.createElement('div');
      h.className = 'ptd-heading';
      h.textContent = title;
      root.appendChild(h);
      const list = document.createElement('ul');
      list.className = 'ptd-moves';
      for (const r of rows) {
        const li = document.createElement('li');
        li.className = 'ptd-move';
        li.style.cursor = 'default';
        li.style.gridTemplateColumns = 'auto 1fr auto';
        const img = document.createElement('img');
        img.className = 'ptd-item';
        img.alt = '';
        img.src = itemUrl(r.sprite);
        const name = document.createElement('span');
        name.className = 'ptd-name';
        name.textContent = r.name;
        const count = document.createElement('span');
        count.textContent = `x${r.count}`;
        li.append(img, name, count);
        list.appendChild(li);
      }
      root.appendChild(list);
    };
    section(
      'Poké Balls',
      BALL_IDS.filter((id) => BALLS[id]?.obtainable !== false).map((id) => ({ sprite: BALLS[id]!.sprite, name: BALLS[id]!.name, count: game.items.balls[id] ?? 0 })),
    );
    section('Medicine', [{ sprite: config.shop.potion.sprite, name: config.shop.potion.name, count: game.items.potions }]);
    section('Items', [{ sprite: config.shop.rareCandy.sprite, name: config.shop.rareCandy.name, count: game.items.rareCandies }]);
  }

  trainerCard(playerName: string): void {
    const root = this.openPanel('Trainer Card', 'card');
    const game = this.hooks.game;
    const rows = document.createElement('div');
    rows.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:8px 0';
    const add = (k: string, v: string) => {
      const a = document.createElement('div');
      a.className = 'ptd-label';
      a.textContent = k;
      const b = document.createElement('div');
      b.textContent = v;
      rows.append(a, b);
    };
    add('Name', playerName);
    add('Money', `$${game.money}`);
    add('Pokémon', `${game.party.length + allBoxed(game).length} (party ${game.party.length})`);
    add('Pokédex', `${dexCounts(game).caught} caught`);
    add('Starter', game.starter !== undefined ? capitalize(getPokemon(game.starter).name) : 'none yet');
    root.appendChild(rows);
    const h = document.createElement('div');
    h.className = 'ptd-heading';
    h.textContent = 'Badges';
    root.appendChild(h);
    const badges = document.createElement('div');
    badges.className = 'ptd-actions';
    for (const b of allBadges()) {
      const earned = hasBadge(game, b.id);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'text-align:center';
      const img = document.createElement('img');
      img.alt = b.name;
      img.src = uiUrl(`assets/badges/${b.id}${earned ? '' : '-off'}.png`);
      img.style.cssText = 'width:32px;height:32px;image-rendering:pixelated;display:block;margin:0 auto';
      img.dataset.key = badgeTextureKey(b.id, earned);
      const label = document.createElement('div');
      label.className = 'ptd-dim';
      label.textContent = earned ? b.name : '???';
      wrap.append(img, label);
      badges.appendChild(wrap);
    }
    if (allBadges().length === 0) badges.textContent = 'No gyms yet.';
    root.appendChild(badges);
  }

  options(): void {
    const root = this.openPanel('Options', 'options');
    const label = document.createElement('div');
    label.className = 'ptd-label';
    label.textContent = 'Game speed';
    const row = document.createElement('div');
    row.className = 'ptd-actions';
    const render = () => {
      row.innerHTML = '';
      for (const speed of config.gameSpeeds as number[]) {
        const b = document.createElement('button');
        b.textContent = `${speed}x`;
        b.style.opacity = speed === this.hooks.getSpeed() ? '1' : '0.6';
        b.addEventListener('click', () => {
          this.hooks.setSpeed(speed);
          render();
        });
        row.appendChild(b);
      }
    };
    render();
    const note = document.createElement('div');
    note.className = 'ptd-dim';
    note.textContent = 'Higher speeds run more simulation steps per frame; the outcome is the same. Sound and accessibility options come with the polish phase.';
    root.append(label, row, note);
  }
}
