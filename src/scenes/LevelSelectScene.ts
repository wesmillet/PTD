import Phaser from 'phaser';
import config from '../data/config.json';
import { getLevel } from '../data/levels';
import { badgeTextureKey, iconUrl, itemTextureKey } from '../game/runtime';
import { listSlots } from '../game/storage';
import {
  currentSaveCode,
  currentSlot,
  switchSlot,
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
import { allBadges, DEMO_MODE, hasBadge, isLevelCompleted, isLevelUnlocked, orderedLevelIds, unlockBlockers } from '../sim/game';
import { levelPopup, waveCount } from '../sim/waves';
import { Button, framePanel } from '../ui/button';
import { SavePanel } from '../ui/savePanel';
import { ShopScreen } from '../ui/shopScreen';
import { CreditsScreen } from '../ui/creditsScreen';
import { LotteryScreen } from '../ui/lotteryScreen';
import { claimDailyTicket } from '../sim/lottery';
import { showStarterDialog } from '../ui/starterDialog';
import { COLORS, TEXT, TEXT_DIM, TEXT_LIGHT } from '../ui/styles';
import { findGridPath, nearestWalkable, simplifyPath, type WalkGrid } from '../map/gridPath';

/** Height of the two-line hover frames over markers (26 px name and detail). */
const HOVER_H = 72;

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

/** Town-map pixels per cell of the land grid the cursor walks on. */
const LAND_CELL = 2;
/** The sea colours of ui/gen4/sinnoh-map-land.png (deep and coastal water). */
const SEA_COLOURS = new Set(['98,131,213', '24,164,189', '139,213,255']);
let landGrid: WalkGrid | undefined;

/** The land grid, read once from the land layer's pixels: cells that are sea are solid. */
function readLandGrid(scene: Phaser.Scene): WalkGrid | undefined {
  if (landGrid) return landGrid;
  if (!scene.textures.exists('sinnoh-map-land')) return undefined;
  const source = scene.textures.get('sinnoh-map-land').getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0);
  const px = ctx.getImageData(0, 0, source.width, source.height).data;
  const width = Math.floor(source.width / LAND_CELL);
  const height = Math.floor(source.height / LAND_CELL);
  const solid: boolean[] = [];
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      // A cell is land when any of its pixels is not a sea colour.
      let land = false;
      for (let dy = 0; dy < LAND_CELL && !land; dy++) {
        for (let dx = 0; dx < LAND_CELL && !land; dx++) {
          const i = ((cy * LAND_CELL + dy) * source.width + cx * LAND_CELL + dx) * 4;
          if ((px[i + 3] ?? 0) > 0 && !SEA_COLOURS.has(`${px[i]},${px[i + 1]},${px[i + 2]}`)) land = true;
        }
      }
      solid.push(!land);
    }
  }
  landGrid = { width, height, solid };
  return landGrid;
}

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
  private lottery?: LotteryScreen;
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
    // The map sits at the top; the strip under it holds the PC, Shop, Save, Credits and Demo buttons.
    this.mapY = 6;
    this.markers = [];
    this.walking = false;

    if (this.textures.exists('sinnoh-map')) {
      this.add.image(this.mapX, this.mapY, 'sinnoh-map').setOrigin(0).setScale(MAP_SCALE);
    } else {
      this.add.rectangle(this.mapX, this.mapY, MAP_W * MAP_SCALE, MAP_H * MAP_SCALE, 0x5090d0).setOrigin(0);
    }
    this.add.rectangle(this.mapX, this.mapY, MAP_W * MAP_SCALE, MAP_H * MAP_SCALE).setOrigin(0).setStrokeStyle(2, COLORS.borderOuter);

    this.drawBadges(8, 10);
    this.drawBag(8, 214, height - 10);
    this.drawMenu(this.mapX, this.mapY + MAP_H * MAP_SCALE + (height - this.mapY - MAP_H * MAP_SCALE) / 2);
    this.drawRightColumn(width - 8);
    this.drawMarkers(game);
    this.drawConferenceMarker(game);
    this.drawLotteryMarker(game);
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
    this.lottery = new LotteryScreen({
      game,
      onChange: () => saveGame(),
      onPlay: (def) => {
        saveGame();
        this.scene.start('Level', { levelId: 'lottery', def, returnTo: 'LevelSelect', mode: 'lottery' });
      },
      onClose: () => {
        saveGame();
        this.scene.restart();
      },
    });
    this.credits = new CreditsScreen(() => undefined);
    this.savePanel = new SavePanel({
      getCode: () => currentSaveCode(),
      importCode: (code) => importSaveCode(code),
      newGame: () => {
        resetGame();
        this.scene.restart();
      },
      onClose: () => this.scene.restart(),
      slots: () => listSlots(),
      activeSlot: () => currentSlot(),
      switchSlot: (slot) => {
        switchSlot(slot);
        this.scene.restart();
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shop?.close();
      this.savePanel?.close();
      this.credits?.close();
      this.lottery?.close();
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
      // Platinum colours the places you can go red; cleared ones gold; rifts are purple tears; locked ones stay the plain grey marker, dimmed.
      if (!unlocked) image.setAlpha(0.5);
      else if (def.rift) image.setTintFill(done ? 0xd0a0ff : 0xa040e0);
      else image.setTintFill(done ? 0xf0b020 : 0xf05050);
      if (def.rift) image.setFrame(1).setScale(MAP_SCALE * 0.8);
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

  /** Jubilife TV: the Lottery Corner, a tall marker on Jubilife with the ticket count. */
  private drawLotteryMarker(game: ReturnType<typeof getGame>): void {
    claimDailyTicket(game);
    const { x, y } = this.mapPixel([72, 122]);
    const image = this.textures.exists('map-markers') ? this.add.image(x, y, 'map-markers', 1).setScale(MAP_SCALE) : this.add.image(x, y, '__DEFAULT').setDisplaySize(24, 24);
    image.setTintFill(0x40a0f0).setDepth(10).setInteractive({ useHandCursor: true });
    const tickets = () => game.tickets ?? 0;
    const label = () => {
      this.hideHover();
      const name = this.add.text(0, -15, 'Jubilife TV: Lottery Corner', TEXT).setOrigin(0.5);
      const info = this.add.text(0, 15, `${tickets()} ticket${tickets() === 1 ? '' : 's'} · a shiny for a challenge`, TEXT_DIM).setOrigin(0.5);
      const w = Math.max(name.width, info.width) + 44;
      this.hover = this.add.container(Phaser.Math.Clamp(x, this.mapX + w / 2 + 4, this.mapX + MAP_W * MAP_SCALE - w / 2 - 4), y - 72, [framePanel(this, 0, 0, w, HOVER_H, 'blue'), name, info]).setDepth(50);
    };
    image.on('pointerover', label);
    image.on('pointerout', () => this.hideHover());
    image.on('pointerdown', () => this.guard(() => this.lottery?.show()));
    if (game.lotteryPending) this.time.delayedCall(300, () => this.lottery?.show());
  }

  /** Lily of the Valley island: the Conference, a tall gold marker east of Sunyshore. */
  private drawConferenceMarker(game: ReturnType<typeof getGame>): void {
    const { x, y } = this.mapPixel([238, 70]);
    const open = isLevelUnlocked(game, 'victory-road') && (DEMO_MODE || isLevelCompleted(game, 'victory-road'));
    const image = this.textures.exists('map-markers') ? this.add.image(x, y, 'map-markers', 1).setScale(MAP_SCALE) : this.add.image(x, y, '__DEFAULT').setDisplaySize(24, 24);
    if (open) image.setTintFill(0xf0b020);
    else image.setAlpha(0.5);
    image.setDepth(10).setInteractive({ useHandCursor: open });
    const label = () => {
      this.hideHover();
      const name = this.add.text(0, -15, 'Sinnoh Conference', TEXT).setOrigin(0.5);
      const info = this.add.text(0, 15, open ? 'Sixteen trainers, four rounds' : 'Locked: clear Victory Road', TEXT_DIM).setOrigin(0.5);
      const w = Math.max(name.width, info.width) + 44;
      this.hover = this.add.container(Phaser.Math.Clamp(x, this.mapX + w / 2 + 4, this.mapX + MAP_W * MAP_SCALE - w / 2 - 4), y - 72, [framePanel(this, 0, 0, w, HOVER_H, 'blue'), name, info]).setDepth(50);
    };
    image.on('pointerover', label);
    image.on('pointerout', () => this.hideHover());
    image.on('pointerdown', () => {
      if (!open) {
        label();
        return;
      }
      this.guard(() => this.scene.start('Conference'));
    });
  }

  private showHover(id: string, x: number, y: number): void {
    this.hideHover();
    const def = getLevel(id);
    const game = getGame();
    const unlocked = isLevelUnlocked(game, id);
    const kind = def.objective === 'free' ? 'free roam' : `defend, ${waveCount(def)} waves`;
    const extra = def.trainer ? (def.badge ? ' · gym' : ' · trainer') : '';
    const line2 = unlocked ? `${kind}${extra}${isLevelCompleted(game, id) ? ' · cleared' : ''}` : `Locked: ${unlockBlockers(game, id).slice(0, 2).join(', ') || 'not yet'}`;
    const name = this.add.text(0, -15, def.name, TEXT).setOrigin(0.5);
    const info = this.add.text(0, 15, line2, TEXT_DIM).setOrigin(0.5);
    const w = Math.max(name.width, info.width) + 44;
    const h = HOVER_H;
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
    // Walk over land: route on the land grid from the player's cell to the marker's, one straight leg per corner.
    const legs = this.landRoute(player.x, player.y, marker.x, marker.y - 14);
    const total = legs.reduce((s, [x, y], i) => s + Math.hypot(x - (i ? legs[i - 1]![0] : player.x), y - (i ? legs[i - 1]![1] : player.y)), 0);
    const duration = Math.min(1400, Math.max(200, total * 4));
    const step = (i: number) => {
      const leg = legs[i];
      if (!leg || !player.active) {
        player.stop();
        player.setFrame(FACING_ROWS.down);
        this.walking = false;
        cursorLevelId = marker.id;
        then();
        return;
      }
      const dx = leg[0] - player.x;
      const dy = leg[1] - player.y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      player.play(`ow-player-walk-${facing}`, true);
      this.tweens.add({ targets: player, x: leg[0], y: leg[1], duration: Math.max(40, (Math.hypot(dx, dy) / Math.max(1, total)) * duration), onComplete: () => step(i + 1) });
    };
    step(0);
  }

  /** Canvas points to walk through from (x0, y0) to (x1, y1) over the land grid; a straight line when no land route exists (islands). */
  private landRoute(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const grid = readLandGrid(this);
    if (!grid) return [[x1, y1]];
    const cell = LAND_CELL * MAP_SCALE;
    const toCell = (x: number, y: number): [number, number] => [Math.floor((x - this.mapX) / cell), Math.floor((y - this.mapY) / cell)];
    const toCanvas = ([cx, cy]: readonly [number, number]): [number, number] => [this.mapX + cx * cell + cell / 2, this.mapY + cy * cell + cell / 2];
    const from = nearestWalkable(grid, ...toCell(x0, y0), 8);
    const to = nearestWalkable(grid, ...toCell(x1, y1), 8);
    const path = findGridPath(grid, from, to, 20000);
    if (!path) return [[x1, y1]];
    const legs = simplifyPath(path).map(toCanvas);
    legs.push([x1, y1]); // finish exactly at the marker
    return legs;
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
        this.hover = this.add.container(x + 22, y, [framePanel(this, label.width / 2 + 10, 0, label.width + 20, 40, 'blue'), label]).setDepth(60);
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

  /** PC, Shop, Save, Credits and the sprite demo in a row under the map. */
  private drawMenu(left: number, y: number): void {
    const entries: [string, () => void, string][] = [
      ['PC', () => this.guard(() => this.scene.start('PC')), 'ui-menu-party'],
      ['Shop', () => this.guard(() => this.shop?.show()), 'ui-menu-bag'],
      ['Save', () => this.savePanel?.show(), 'ui-menu-save'],
      ['Credits', () => this.credits?.show(), 'ui-menu-card'],
      ['Demo', () => this.scene.start('Phase0'), 'ui-menu-options'],
    ];
    let x = left;
    for (const [label, action, icon] of entries) {
      const b = new Button(this, 0, y, label, action, 96, Button.HEIGHT, icon);
      b.setX(x + b.frameWidth / 2);
      x += b.frameWidth + 8;
    }
  }

  /** The right column: the party count and the controls hint. */
  private drawRightColumn(right: number): void {
    const game = getGame();
    const x = (right + this.mapX + MAP_W * MAP_SCALE) / 2;
    const party = game.party.length ? `Party\n${game.party.length}/6` : 'No\nparty';
    this.add.text(x, 12, party, { ...TEXT_DIM, align: 'center' }).setOrigin(0.5, 0);
    this.add.text(x, this.scale.height - 10, 'Click a\nmarker\n← → ⏎', { ...TEXT_LIGHT, align: 'center' }).setOrigin(0.5, 1);
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
