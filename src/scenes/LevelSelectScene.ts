import Phaser from 'phaser';
import config from '../data/config.json';
import { getLevel } from '../data/levels';
import { badgeTextureKey, iconUrl, itemTextureKey } from '../game/runtime';
import {
  currentSaveCode,
  getGame,
  importSaveCode,
  loadDebugPartyIfRequested,
  needsStarter,
  pickStarter,
  resetGame,
  saveGame,
  STARTERS,
} from '../game/session';
import { BALL_IDS, BALLS } from '../sim/catch';
import { allBadges, hasBadge, isLevelCompleted, isLevelUnlocked, orderedLevelIds } from '../sim/game';
import { Button } from '../ui/button';
import { SavePanel } from '../ui/savePanel';
import { ShopScreen } from '../ui/shopScreen';
import { CreditsScreen } from '../ui/creditsScreen';
import { showStarterDialog } from '../ui/starterDialog';
import { COLORS, TEXT_BIG, TEXT_DIM } from '../ui/styles';

/** Level list with the unlock chain, the bag strip, badges, and the PC, Shop and Save entries. */
export class LevelSelectScene extends Phaser.Scene {
  private shop?: ShopScreen;
  private savePanel?: SavePanel;
  private credits?: CreditsScreen;
  private starterRoot?: HTMLDivElement;

  constructor() {
    super('LevelSelect');
  }

  create(): void {
    loadDebugPartyIfRequested();
    const game = getGame();
    const { width } = this.scale;
    this.add.text(width / 2, 40, 'Sinnoh Tower Defense', TEXT_BIG).setOrigin(0.5);
    const partyText = game.party.length ? `Party: ${game.party.map((m) => `${m.name} L${m.level}`).join(', ')}` : 'No Pokémon yet';
    this.add.text(width / 2, 68, partyText, TEXT_DIM).setOrigin(0.5);
    this.drawBag(width / 2, 96);
    this.drawBadges(width - 24, 24);

    let y = 130;
    for (const id of orderedLevelIds()) {
      const def = getLevel(id);
      const unlocked = isLevelUnlocked(game, id);
      const done = isLevelCompleted(game, id);
      const kind = def.objective === 'free' ? 'free roam' : `defend, ${def.waves} waves`;
      const extra = def.trainer ? (def.badge ? ', gym' : ', trainer') : '';
      const label = `${done ? '✓ ' : unlocked ? '' : '🔒 '}${def.name}  (${kind}${extra})`;
      const button = new Button(this, width / 2, y, label, () => this.openLevel(id), 400, 32);
      button.setEnabled(unlocked);
      y += 40;
    }
    const row = y + 16;
    // Start-menu icons from Platinum on the menu buttons.
    new Button(this, width / 2 - 170, row, 'PC', () => this.guard(() => this.scene.start('PC')), 150, 30, 'ui-menu-party');
    new Button(this, width / 2, row, 'Shop', () => this.guard(() => this.shop?.show()), 150, 30, 'ui-menu-bag');
    new Button(this, width / 2 + 170, row, 'Save', () => this.savePanel?.show(), 150, 30, 'ui-menu-save');
    new Button(this, width / 2 - 85, row + 38, 'Credits', () => this.credits?.show(), 150, 26, 'ui-menu-card');
    new Button(this, width / 2 + 85, row + 38, 'Sprite demo', () => this.scene.start('Phase0'), 150, 26, 'ui-menu-options');
    this.add.text(width / 2, this.scale.height - 16, 'Tip: ?level=<id> opens a level, ?party=debug loads the test party', TEXT_DIM).setOrigin(0.5);

    const refresh = () => {
      saveGame();
      this.scene.restart();
    };
    this.shop = new ShopScreen(game, { onChange: () => saveGame(), onClose: refresh });
    this.credits = new CreditsScreen(() => undefined);
    this.savePanel = new SavePanel({
      getCode: () => currentSaveCode(),
      importCode: (code) => importSaveCode(code),
      newGame: () => {
        resetGame();
        this.scene.restart();
      },
      onClose: () => this.scene.restart(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shop?.close();
      this.savePanel?.close();
      this.credits?.close();
      this.starterRoot?.remove();
      this.shop = undefined;
      this.savePanel = undefined;
    });
    if (needsStarter()) this.askStarter();
  }

  /**
   * The bag: the bag screen's round pocket buttons (Poké Balls, Medicine,
   * Items) each followed by that pocket's items with their sprites and
   * counts, plus money.
   */
  private drawBag(cx: number, y: number): void {
    const game = getGame();
    const entries: { key: string; count: number; name: string; pocket?: string }[] = [];
    let first = true;
    for (const id of BALL_IDS) {
      const ball = BALLS[id];
      if (!ball || ball.obtainable === false) continue;
      entries.push({ key: itemTextureKey(ball.sprite), count: game.items.balls[id] ?? 0, name: ball.name, ...(first ? { pocket: 'balls' } : {}) });
      first = false;
    }
    entries.push({ key: itemTextureKey(config.shop.potion.sprite), count: game.items.potions, name: config.shop.potion.name, pocket: 'medicine' });
    entries.push({ key: itemTextureKey(config.shop.rareCandy.sprite), count: game.items.rareCandies, name: config.shop.rareCandy.name, pocket: 'items' });
    const gap = 54;
    const pocketGap = 34;
    const total = entries.length * gap + 3 * pocketGap + 90;
    let x = cx - total / 2;
    this.add.text(x, y, `$${game.money}`, { ...TEXT_DIM, color: '#c87818' }).setOrigin(0, 0.5);
    x += 90;
    for (const e of entries) {
      if (e.pocket) {
        const key = `ui-button-${e.pocket}-normal`;
        if (this.textures.exists(key)) this.add.image(x, y, key).setScale(0.7);
        x += pocketGap;
      }
      if (this.textures.exists(e.key)) this.add.image(x, y, e.key);
      this.add.text(x + 14, y + 2, String(e.count), { ...TEXT_DIM, fontSize: '12px', color: e.count > 0 ? '#404848' : '#a0a8b0' }).setOrigin(0, 0.5);
      x += gap;
    }
  }

  /** Badge case: every badge the story defines, lit when earned. */
  private drawBadges(right: number, y: number): void {
    const game = getGame();
    const badges = allBadges();
    if (badges.length === 0) return;
    let x = right - badges.length * 36 + 18;
    this.add.text(x - 26, y, 'Badges', { ...TEXT_DIM, fontSize: '11px' }).setOrigin(1, 0.5);
    for (const b of badges) {
      const earned = hasBadge(game, b.id);
      const key = badgeTextureKey(b.id, earned);
      if (this.textures.exists(key)) this.add.image(x, y, key).setAlpha(earned ? 1 : 0.6);
      else this.add.circle(x, y, 12, earned ? 0xc0a040 : COLORS.borderOuter);
      x += 36;
    }
  }

  private guard(open: () => void): void {
    if (needsStarter()) this.askStarter();
    else open();
  }

  private askStarter(): void {
    this.starterRoot?.remove();
    this.starterRoot = showStarterDialog(STARTERS, (s) => iconUrl(s), (species) => {
      pickStarter(species);
      this.scene.restart();
    });
  }

  private openLevel(id: string): void {
    this.guard(() => this.scene.start('Level', { levelId: id }));
  }
}
