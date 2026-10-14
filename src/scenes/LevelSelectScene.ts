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
import { allBadges, hasBadge, isLevelCompleted, isLevelUnlocked, orderedLevelIds, unlockBlockers } from '../sim/game';
import { levelPopup, waveCount } from '../sim/waves';
import { Button, framePanel } from '../ui/button';
import { SavePanel } from '../ui/savePanel';
import { ShopScreen } from '../ui/shopScreen';
import { CreditsScreen } from '../ui/creditsScreen';
import { showStarterDialog } from '../ui/starterDialog';
import { COLORS, TEXT, TEXT_DIM, TEXT_LIGHT } from '../ui/styles';

/** The Platinum town map is 256x192; it is shown at 3x. */
const MAP_W = 256;
const MAP_H = 192;
const MAP_SCALE = 3;
/** Marker sheet frames (ui/gen4/map-markers.png): a small dot and the town square. */
const MARKER_DOT = 0;
const MARKER_TOWN = 2;
/** Player walking sheet: four frames per facing, in this order. */
const FACING_ROWS = { up: 0, down: 4, left: 8, right: 12 } as const;
type Facing = keyof typeof FACING_ROWS;

/** Where the player icon stands between visits (the last level opened or hovered). */
let cursorLevelId: string | undefined;

interface Marker {
  id: string;
  x: number;
  y: number;
  image: Phaser.GameObjects.Image;
  unlocked: boolean;
}

/**
 * Level select on the Platinum town map: one marker per level (greyed when
 * locked), a Platinum name frame on hover, and the player's overworld
 * sprite as the cursor walking to the marker you pick. The bag and badge
 * case sit in the left column, the PC, Shop, Save and Credits buttons in
 * the right one.
 */
export class LevelSelectScene extends Phaser.Scene {
  private shop?: ShopScreen;
  private savePanel?: SavePanel;
  private credits?: CreditsScreen;
  private starterRoot?: HTMLDivElement;
  private markers: Marker[] = [];
  private player?: Phaser.GameObjects.Sprite;
  private hover?: Phaser.GameObjects.Container;
  private walking = false;
  private mapX = 0;
  private mapY = 0;

  constructor() {
    super('LevelSelect');
  }

  create(): void {
    loadDebugPartyIfRequested();
    const game = getGame();
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.mapX = Math.round((width - MAP_W * MAP_SCALE) / 2);
    this.mapY = Math.round((height - MAP_H * MAP_SCALE) / 2);
    this.markers = [];
    this.walking = false;

    if (this.textures.exists('sinnoh-map')) {
      this.add.image(this.mapX, this.mapY, 'sinnoh-map').setOrigin(0).setScale(MAP_SCALE);
    } else {
      this.add.rectangle(this.mapX, this.mapY, MAP_W * MAP_SCALE, MAP_H * MAP_SCALE, 0x5090d0).setOrigin(0);
    }
    this.add.rectangle(this.mapX, this.mapY, MAP_W * MAP_SCALE, MAP_H * MAP_SCALE).setOrigin(0).setStrokeStyle(2, COLORS.borderOuter);

    this.drawBadges(8, 16);
    this.drawBag(8, 200, height - 12);
    this.drawMenu(width - 8, 30);
    this.drawMarkers(game);
    this.createPlayer();

    this.input.keyboard?.on('keydown-LEFT', () => this.stepCursor(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.stepCursor(1));
    this.input.keyboard?.on('keydown-ENTER', () => {
      const id = cursorLevelId;
      if (id) this.pick(id);
    });

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
    // Debug hook for automated checks.
    (window as unknown as { __ptdSelect?: unknown }).__ptdSelect = { scene: this, markers: this.markers, cursor: () => cursorLevelId, player: this.player };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      (window as unknown as { __ptdSelect?: unknown }).__ptdSelect = undefined;
    });
  }

  // ------------------------------------------------------------------ map

  /** Canvas position of a town-map pixel. */
  private mapPixel(pos: [number, number]): { x: number; y: number } {
    return { x: this.mapX + pos[0] * MAP_SCALE, y: this.mapY + pos[1] * MAP_SCALE };
  }

  private drawMarkers(game: ReturnType<typeof getGame>): void {
    const ids = orderedLevelIds();
    for (const id of ids) {
      const def = getLevel(id);
      if (!def.mapPos) continue;
      const { x, y } = this.mapPixel(def.mapPos);
      const unlocked = isLevelUnlocked(game, id);
      const done = isLevelCompleted(game, id);
      const kind = levelPopup(def);
      const frame = kind === 'town' || kind === 'city' ? MARKER_TOWN : MARKER_DOT;
      const image = this.textures.exists('map-markers')
        ? this.add.image(x, y, 'map-markers', frame).setScale(MAP_SCALE)
        : this.add.image(x, y, '__DEFAULT').setDisplaySize(24, 24);
      // Platinum colours the places you can go red; cleared ones gold; locked ones stay the plain grey marker, dimmed.
      if (!unlocked) image.setAlpha(0.5);
      else image.setTintFill(done ? 0xf0b020 : 0xf05050);
      image.setDepth(10).setInteractive({ useHandCursor: unlocked });
      image.on('pointerover', () => this.showHover(id, x, y));
      image.on('pointerout', () => this.hideHover());
      image.on('pointerdown', () => this.pick(id));
      this.markers.push({ id, x, y, image, unlocked });
    }
    if (!cursorLevelId || !this.markers.some((m) => m.id === cursorLevelId)) {
      // Start on the furthest open level.
      const open = this.markers.filter((m) => m.unlocked);
      cursorLevelId = (open[open.length - 1] ?? this.markers[0])?.id;
    }
  }

  private showHover(id: string, x: number, y: number): void {
    this.hideHover();
    const def = getLevel(id);
    const game = getGame();
    const unlocked = isLevelUnlocked(game, id);
    const kind = def.objective === 'free' ? 'free roam' : `defend, ${waveCount(def)} waves`;
    const extra = def.trainer ? (def.badge ? ' · gym' : ' · trainer') : '';
    const line2 = unlocked ? `${kind}${extra}${isLevelCompleted(game, id) ? ' · cleared' : ''}` : `Locked: ${unlockBlockers(game, id).slice(0, 2).join(', ') || 'not yet'}`;
    const name = this.add.text(0, -8, def.name, TEXT).setOrigin(0.5);
    const info = this.add.text(0, 8, line2, TEXT_DIM).setOrigin(0.5);
    const w = Math.max(name.width, info.width) + 28;
    const h = 44;
    const frame = framePanel(this, 0, 0, w, h, 'blue');
    const above = y - 40 - h / 2 > this.mapY;
    const cx = Phaser.Math.Clamp(x, this.mapX + w / 2 + 4, this.mapX + MAP_W * MAP_SCALE - w / 2 - 4);
    this.hover = this.add.container(cx, above ? y - 40 - h / 2 : y + 40 + h / 2, [frame, name, info]).setDepth(50);
  }

  private hideHover(): void {
    this.hover?.destroy();
    this.hover = undefined;
  }

  // --------------------------------------------------------------- player

  private createPlayer(): void {
    if (!this.textures.exists('ow-player')) return;
    for (const [facing, row] of Object.entries(FACING_ROWS)) {
      const key = `ow-player-walk-${facing}`;
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers('ow-player', { start: row, end: row + 3 }), frameRate: 8, repeat: -1 });
      }
    }
    const marker = this.markers.find((m) => m.id === cursorLevelId) ?? this.markers[0];
    if (!marker) return;
    this.player = this.add.sprite(marker.x, marker.y - 14, 'ow-player', FACING_ROWS.down).setScale(2).setDepth(20);
  }

  /** Walks the player icon to a marker, then runs `then`. Straight line, facing the way it goes. */
  private walkTo(marker: Marker, then: () => void): void {
    const player = this.player;
    if (!player || (Math.abs(player.x - marker.x) < 2 && Math.abs(player.y - (marker.y - 14)) < 2)) {
      cursorLevelId = marker.id;
      then();
      return;
    }
    if (this.walking) return;
    this.walking = true;
    const dx = marker.x - player.x;
    const dy = marker.y - 14 - player.y;
    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    player.play(`ow-player-walk-${facing}`);
    const distance = Math.hypot(dx, dy);
    this.tweens.add({
      targets: player,
      x: marker.x,
      y: marker.y - 14,
      duration: Math.min(900, Math.max(200, distance * 4)),
      onComplete: () => {
        player.stop();
        player.setFrame(FACING_ROWS.down);
        this.walking = false;
        cursorLevelId = marker.id;
        then();
      },
    });
  }

  /** Picks a marker: locked ones only show why; open ones are walked to and opened. */
  private pick(id: string): void {
    const marker = this.markers.find((m) => m.id === id);
    if (!marker || this.walking) return;
    if (!marker.unlocked) {
      this.showHover(id, marker.x, marker.y);
      return;
    }
    this.walkTo(marker, () => this.openLevel(id));
  }

  private stepCursor(dir: 1 | -1): void {
    if (this.markers.length === 0 || this.walking) return;
    const i = this.markers.findIndex((m) => m.id === cursorLevelId);
    const next = this.markers[(i + dir + this.markers.length) % this.markers.length]!;
    this.hideHover();
    this.walkTo(next, () => this.showHover(next.id, next.x, next.y));
  }

  // ------------------------------------------------------------- columns

  /** Badge case: the eight Sinnoh badges in two columns, lit when earned. */
  private drawBadges(left: number, top: number): void {
    const game = getGame();
    const badges = allBadges();
    this.add.text(left + 40, top, 'Badges', TEXT_DIM).setOrigin(0.5, 0);
    badges.forEach((b, i) => {
      const x = left + 20 + (i % 2) * 40;
      const y = top + 34 + Math.floor(i / 2) * 40;
      const earned = hasBadge(game, b.id);
      const key = badgeTextureKey(b.id, earned);
      const img = this.textures.exists(key) ? this.add.image(x, y, key).setScale(0.5) : this.add.circle(x, y, 12, earned ? 0xc0a040 : COLORS.borderOuter);
      img.setAlpha(earned ? 1 : 0.7).setInteractive();
      img.on('pointerover', () => {
        this.hideHover();
        const label = this.add.text(0, 0, earned ? b.name : `${b.name}: ${b.leader}, ${b.gym}`, TEXT).setOrigin(0, 0.5);
        this.hover = this.add.container(x + 22, y, [framePanel(this, label.width / 2 + 10, 0, label.width + 20, 28, 'blue'), label]).setDepth(60);
      });
      img.on('pointerout', () => this.hideHover());
    });
  }

  /** The bag down the left column: each pocket's items with sprite and count, money underneath. */
  private drawBag(left: number, top: number, bottom: number): void {
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
    let y = top;
    for (const e of entries) {
      if (e.pocket) {
        const key = `ui-button-${e.pocket}-normal`;
        if (this.textures.exists(key)) this.add.image(left + 16, y, key).setScale(0.6);
        y += 24;
      }
      if (this.textures.exists(e.key)) this.add.image(left + 16, y, e.key);
      this.add.text(left + 34, y + 1, String(e.count), { ...TEXT, color: e.count > 0 ? '#484848' : '#a0a8b0' }).setOrigin(0, 0.5);
      y += 26;
    }
    this.add.text(left + 40, bottom, `$${game.money}`, { ...TEXT, color: '#c87818' }).setOrigin(0.5, 1);
  }

  /** PC, Shop, Save, Credits and the sprite demo down the right column. */
  private drawMenu(right: number, top: number): void {
    const x = right - 44;
    new Button(this, x, top, 'PC', () => this.guard(() => this.scene.start('PC')), 88, 30, 'ui-menu-party');
    new Button(this, x, top + 38, 'Shop', () => this.guard(() => this.shop?.show()), 88, 30, 'ui-menu-bag');
    new Button(this, x, top + 76, 'Save', () => this.savePanel?.show(), 88, 30, 'ui-menu-save');
    new Button(this, x, top + 114, 'Credits', () => this.credits?.show(), 88, 30, 'ui-menu-card');
    new Button(this, x, top + 152, 'Demo', () => this.scene.start('Phase0'), 88, 30, 'ui-menu-options');
    const game = getGame();
    const party = game.party.length ? `Party ${game.party.length}/6` : 'No Pokémon yet';
    this.add.text(x, top + 190, party, TEXT_DIM).setOrigin(0.5, 0);
    this.add.text(x, this.scale.height - 12, 'Click a marker\n← → Enter', { ...TEXT_LIGHT, align: 'center' }).setOrigin(0.5, 1);
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
    cursorLevelId = id;
    this.guard(() => this.scene.start('Level', { levelId: id }));
  }
}
