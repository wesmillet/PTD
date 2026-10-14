/**
 * The pages the start menu opens, as Platinum-framed DOM panels: Pokédex
 * (seen / caught counts), Pokémon (party list), Bag, Trainer Card and
 * Options. Save uses SavePanel. One page is open at a time.
 */
import config from '../data/config.json';
import { displayName, getPokemon, typeName } from '../data/pokedata';
import { badgeTextureKey, iconUrl, itemUrl, portraitUrl } from '../game/runtime';
import { allWildSpecies, speciesAreas } from '../sim/dex';
import { capitalizeName } from '../sim/names';
import { BALL_IDS, BALLS } from '../sim/catch';
import { allBadges, dexCounts, hasBadge, type GameState } from '../sim/game';
import type { Monster } from '../sim/monster';
import { allBoxed } from '../sim/pc';
import { runtime } from '../game/runtime';
import { setZoom, ZOOMS, zoomLabel } from '../game/zoom';
import { capitalize, ensureOverlayStyles, iconImage, isolateFromGame, typeIcon, uiUrl } from './domOverlay';

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

  /** The Pokédex: seen, caught and shiny counts, then every species some level spawns with its portrait, types and areas. */
  pokedex(): void {
    const root = this.openPanel('Pokédex', 'pokedex');
    root.style.width = 'min(640px, calc(100vw - 24px))';
    const game = this.hooks.game;
    const counts = dexCounts(game);
    const line = document.createElement('div');
    line.className = 'ptd-dim';
    line.textContent = `Seen ${counts.seen}   Caught ${counts.caught}   Shiny ${counts.shiny}`;
    root.appendChild(line);
    const list = document.createElement('ul');
    list.className = 'ptd-moves ptd-dense';
    const ids = new Set<number>(allWildSpecies());
    for (const id of Object.keys(game.pokedex).map(Number)) if (game.pokedex[String(id)]?.seen) ids.add(id);
    for (const id of [...ids].sort((a, b) => a - b)) {
      const entry = game.pokedex[String(id)];
      const data = getPokemon(id);
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.gridTemplateColumns = 'auto 1fr auto';
      li.style.cursor = 'default';
      const portrait = document.createElement('img');
      portrait.className = 'ptd-portrait small';
      portrait.alt = '';
      const url = portraitUrl(id, 'Normal', entry?.shinyCaught ?? false);
      if (url) portrait.src = url;
      if (!entry?.caught) portrait.style.filter = 'brightness(0.15)';
      const text = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'ptd-name';
      name.textContent = `#${String(data.species ?? id).padStart(3, '0')} ${entry?.seen ? capitalizeName(displayName(id)) : '???'}${entry?.shinyCaught ? ' ★' : ''}`;
      const areas = document.createElement('div');
      areas.className = 'ptd-dim';
      const where = speciesAreas(id);
      areas.textContent = entry?.seen ? (where.length ? `Areas: ${where.join(', ')}` : 'No known area') : entry?.caught ? '' : `${entry?.seen ? 'Seen' : 'Not seen yet'}`;
      text.append(name, areas);
      const types = document.createElement('div');
      types.style.cssText = 'display:flex;gap:2px;align-items:center';
      if (entry?.seen) for (const t of data.types) types.appendChild(typeIcon(typeName(t)));
      li.append(portrait, text, types);
      list.appendChild(li);
    }
    if (ids.size === 0) {
      const none = document.createElement('div');
      none.className = 'ptd-dim';
      none.textContent = 'No Pokémon seen yet.';
      list.appendChild(none);
    }
    root.appendChild(list);
  }

  party(): void {
    const root = this.openPanel('Pokémon', 'party');
    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    for (const mon of this.hooks.party()) {
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.gridTemplateColumns = 'auto 1fr auto';
      const icon = iconImage(iconUrl(mon.species, true, mon.shiny), mon.shiny) ?? document.createElement('span');
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${capitalize(mon.name)}${mon.shiny ? ' ★' : ''}  Lv ${mon.level}`;
      const meta = document.createElement('span');
      meta.className = 'ptd-meta';
      meta.textContent = `HP ${mon.hp}/${mon.stats.hp}${this.hooks.isPlaced(mon) ? '  ·  on the field' : ''}${mon.status.ailment !== 'none' ? `  ·  ${capitalize(mon.status.ailment)}` : ''}`;
      li.append(icon, name, typeIcon(typeName(mon.types[0] ?? 1)), meta);
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
    note.textContent = 'Higher speeds run more simulation steps per frame; the outcome is the same.';
    const zoomLabelEl = document.createElement('div');
    zoomLabelEl.className = 'ptd-label';
    zoomLabelEl.textContent = 'Zoom';
    const zoomRow = document.createElement('div');
    zoomRow.className = 'ptd-actions';
    zoomRow.id = 'ptd-zoom-row';
    const renderZoom = () => {
      zoomRow.innerHTML = '';
      for (const z of ZOOMS) {
        const b = document.createElement('button');
        b.textContent = zoomLabel(z);
        b.dataset.zoom = String(z);
        b.style.opacity = z === runtime.zoom ? '1' : '0.6';
        b.addEventListener('click', () => {
          setZoom(z);
          renderZoom();
        });
        zoomRow.appendChild(b);
      }
    };
    renderZoom();
    const zoomNote = document.createElement('div');
    zoomNote.className = 'ptd-dim';
    zoomNote.textContent = 'Fit scales the game to the window; 1x, 1.5x and 2x show it at a fixed size. + and - step through them.';
    root.append(label, row, note, zoomLabelEl, zoomRow, zoomNote);
  }
}
