/**
 * Shop between levels, laid out like the Platinum bag: the pocket selector
 * strip with its red cursor, the round pocket buttons as tabs (Poké Balls,
 * Medicine, Items) and the wares of the open pocket. DOM overlay.
 */
import config from '../data/config.json';
import uiGen4 from '../data/ui-gen4.json';
import { itemUrl } from '../game/runtime';
import { BALL_IDS, BALLS } from '../sim/catch';
import { spendMoney, type GameState } from '../sim/game';
import { ensureOverlayStyles, isolateFromGame, uiUrl } from './domOverlay';

export interface ShopHooks {
  onChange: () => void;
  onClose: () => void;
}

type Pocket = 'balls' | 'medicine' | 'items';

interface Ware {
  id: string;
  name: string;
  sprite: string;
  price: number;
  pocket: Pocket;
  count: () => number;
  add: (n: number) => void;
}

const POCKETS: { id: Pocket; name: string; index: number }[] = [
  { id: 'balls', name: 'Poké Balls', index: 2 },
  { id: 'medicine', name: 'Medicine', index: 1 },
  { id: 'items', name: 'Items', index: 0 },
];

const bag = (uiGen4 as { bag: { buttons: Record<string, Record<string, string>>; pocketIcons: string; pocketCursor: string } }).bag;

export class ShopScreen {
  private root: HTMLDivElement | null = null;
  private pocket: Pocket = 'balls';

  constructor(private readonly game: GameState, private readonly hooks: ShopHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  private wares(): Ware[] {
    const g = this.game;
    const balls: Ware[] = BALL_IDS.filter((id) => BALLS[id]?.obtainable !== false).map((id) => ({
      id,
      name: BALLS[id]?.name ?? id,
      sprite: BALLS[id]?.sprite ?? 'poke-ball',
      price: BALLS[id]?.price ?? 0,
      pocket: 'balls',
      count: () => g.items.balls[id] ?? 0,
      add: (n) => (g.items.balls[id] = (g.items.balls[id] ?? 0) + n),
    }));
    return [
      ...balls,
      { id: 'potion', name: config.shop.potion.name, sprite: config.shop.potion.sprite, price: config.shop.potion.price, pocket: 'medicine', count: () => g.items.potions, add: (n) => (g.items.potions += n) },
      { id: 'rareCandy', name: config.shop.rareCandy.name, sprite: config.shop.rareCandy.sprite, price: config.shop.rareCandy.price, pocket: 'items', count: () => g.items.rareCandies, add: (n) => (g.items.rareCandies += n) },
    ];
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-shop';
    root.style.width = 'min(560px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    document.body.appendChild(root);
    this.root = root;
    this.render();
  }

  close(): void {
    if (!this.root) return;
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
    title.textContent = 'Poké Mart';
    const money = document.createElement('div');
    money.className = 'ptd-dim';
    money.id = 'ptd-shop-money';
    money.textContent = `Money: $${this.game.money}`;
    root.append(title, money);

    // Pocket selector strip (2x) with the red cursor over the open pocket, then the round pocket buttons.
    const strip = document.createElement('div');
    strip.style.cssText = 'position:relative;width:206px;height:24px;margin:8px 0 4px;image-rendering:pixelated';
    const icons = document.createElement('img');
    icons.alt = '';
    icons.src = uiUrl(bag.pocketIcons);
    icons.style.cssText = 'width:206px;height:24px;image-rendering:pixelated';
    const cursor = document.createElement('img');
    cursor.alt = '';
    cursor.src = uiUrl(bag.pocketCursor);
    const active = POCKETS.find((p) => p.id === this.pocket) ?? POCKETS[0]!;
    cursor.style.cssText = `position:absolute;top:-2px;left:${active.index * 25.75 - 1}px;width:28px;height:28px;image-rendering:pixelated`;
    strip.append(icons, cursor);
    root.appendChild(strip);
    const tabs = document.createElement('div');
    tabs.className = 'ptd-actions';
    tabs.id = 'ptd-shop-pockets';
    for (const p of POCKETS) {
      const b = document.createElement('button');
      b.className = 'ptd-pocket';
      b.title = p.name;
      b.dataset.pocket = p.id;
      const img = document.createElement('img');
      img.alt = p.name;
      img.src = uiUrl(bag.buttons[p.id]?.[p.id === this.pocket ? 'selected' : 'normal'] ?? '');
      b.appendChild(img);
      b.addEventListener('click', () => {
        this.pocket = p.id;
        this.render();
      });
      tabs.appendChild(b);
      const label = document.createElement('span');
      label.className = 'ptd-label';
      label.textContent = p.id === this.pocket ? p.name : '';
      tabs.appendChild(label);
    }
    root.appendChild(tabs);

    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    for (const ware of this.wares().filter((w) => w.pocket === this.pocket)) {
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.cursor = 'default';
      li.style.gridTemplateColumns = 'auto 1fr auto auto';
      const icon = document.createElement('img');
      icon.className = 'ptd-item';
      icon.alt = '';
      icon.src = itemUrl(ware.sprite);
      li.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'ptd-name';
      name.textContent = `${ware.name}  (have ${ware.count()})`;
      const price = document.createElement('span');
      price.textContent = `$${ware.price}`;
      const buttons = document.createElement('span');
      for (const n of [1, 5]) {
        const b = document.createElement('button');
        b.textContent = `Buy ${n}`;
        b.style.marginLeft = '6px';
        b.disabled = this.game.money < ware.price * n;
        b.addEventListener('click', () => {
          try {
            spendMoney(this.game, ware.price * n);
            ware.add(n);
            this.hooks.onChange();
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
          }
          this.render();
        });
        buttons.appendChild(b);
      }
      li.append(name, price, buttons);
      list.appendChild(li);
    }
    root.appendChild(list);
    const note = document.createElement('div');
    note.className = 'ptd-dim';
    note.textContent = 'Potions restore a placed Pokémon between waves (its panel). Rare Candy raises a level from the PC. Master Balls are not for sale.';
    root.appendChild(note);
  }
}
