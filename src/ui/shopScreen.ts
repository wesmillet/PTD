/** Shop between levels: balls, Potion, Rare Candy. DOM overlay. */
import config from '../data/config.json';
import { BALL_IDS, BALLS } from '../sim/catch';
import { spendMoney, type GameState } from '../sim/game';
import { itemUrl } from '../game/runtime';
import { ensureOverlayStyles, isolateFromGame } from './domOverlay';

export interface ShopHooks {
  onChange: () => void;
  onClose: () => void;
}

interface Ware {
  id: string;
  name: string;
  sprite: string;
  price: number;
  count: () => number;
  add: (n: number) => void;
}

export class ShopScreen {
  private root: HTMLDivElement | null = null;

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
      count: () => g.items.balls[id] ?? 0,
      add: (n) => (g.items.balls[id] = (g.items.balls[id] ?? 0) + n),
    }));
    return [
      ...balls,
      { id: 'potion', name: config.shop.potion.name, sprite: config.shop.potion.sprite, price: config.shop.potion.price, count: () => g.items.potions, add: (n) => (g.items.potions += n) },
      { id: 'rareCandy', name: config.shop.rareCandy.name, sprite: config.shop.rareCandy.sprite, price: config.shop.rareCandy.price, count: () => g.items.rareCandies, add: (n) => (g.items.rareCandies += n) },
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
    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    for (const ware of this.wares()) {
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
    note.textContent = 'Potions restore a placed Pokémon between waves (its panel). Rare Candy raises a level from the Party screen. Master Balls are not for sale.';
    root.appendChild(note);
  }
}
