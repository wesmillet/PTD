import Phaser from 'phaser';
import { iconInfo, iconTextureKey, iconUrl, portraitUrl } from '../game/runtime';
import { getGame, saveGame } from '../game/session';
import { MAX_PARTY } from '../sim/game';
import type { Monster } from '../sim/monster';
import {
  findRef,
  getAt,
  matchesFilter,
  moveMon,
  moveToBox,
  moveToParty,
  PC,
  setWallpaper,
  sortBox,
  type BoxFilter,
  type SlotRef,
  type SortKey,
} from '../sim/pc';
import { Button } from '../ui/button';
import { PcSummary } from '../ui/pcSummary';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from '../ui/styles';

const CELL = 48;
/** Wallpaper layout: a 12 px margin and a 36 px title band (see scripts/build-placeholders.mjs). */
const GRID_X = 12;
const GRID_Y = 36;
const ICON_FRAME_MS = 170;
/** Hovering an arrow while dragging switches boxes after this long. */
const ARROW_HOLD_MS = 450;

interface SlotView {
  ref: SlotRef;
  x: number;
  y: number;
  hit: Phaser.GameObjects.Rectangle;
  icon?: Phaser.GameObjects.Image;
  mon: Monster | null;
}

interface Drag {
  from: SlotRef;
  mon: Monster;
  icon: Phaser.GameObjects.Image;
  startX: number;
  startY: number;
  moved: boolean;
  arrowTimer: number;
  arrowDir: -1 | 1 | 0;
}

/**
 * The PC, laid out like the DS games: the party in a column on the left, a
 * 6x5 box grid on the right over the box's wallpaper inside the frame image,
 * arrows to switch boxes, a cursor image, drag and drop between any slots,
 * and a summary side panel with sort and filter. Frame, cursor and
 * wallpapers are images named in src/data/pc.json.
 */
export class PCScene extends Phaser.Scene {
  private boxIndex = 0;
  private slots: SlotView[] = [];
  private summary?: PcSummary;
  private drag: Drag | null = null;
  private cursor?: Phaser.GameObjects.Image;
  private wallpaper?: Phaser.GameObjects.Image;
  private frame?: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image;
  private boxTitle?: Phaser.GameObjects.Text;
  private countText?: Phaser.GameObjects.Text;
  private leftArrow?: Button;
  private rightArrow?: Button;
  private filter: BoxFilter = {};
  private iconFrame: 0 | 1 = 0;
  private iconTimer = 0;
  private toast?: Phaser.GameObjects.Text;
  private boxX = 0;
  private boxY = 0;
  private partyX = 0;
  private partyY = 0;

  constructor() {
    super('PC');
  }

  create(): void {
    const game = getGame();
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.slots = [];
    this.drag = null;
    this.boxIndex = Math.min(this.boxIndex, game.boxes.length - 1);

    this.add.text(24, 16, 'Pokémon Storage', TEXT_BIG);
    this.add.text(24, 48, `Party ${game.party.length} / ${MAX_PARTY}`, TEXT_DIM);
    new Button(this, width - 70, 28, 'Back', () => this.scene.start('LevelSelect'), 100, 30);

    // Party column (left).
    this.partyX = 60;
    this.partyY = 110;
    this.add.text(this.partyX, this.partyY - 26, 'Party', TEXT).setOrigin(0.5, 1);
    const column = this.add.graphics();
    column.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(this.partyX - 32, this.partyY - 8, 64, MAX_PARTY * 56 + 8, 8);
    column.fillStyle(COLORS.panel, 1).fillRoundedRect(this.partyX - 29, this.partyY - 5, 58, MAX_PARTY * 56 + 2, 6);

    // Box (right): frame image around the wallpaper and grid.
    const gridW = PC.columns * CELL;
    const gridH = PC.rows * CELL;
    const wallW = gridW + GRID_X * 2;
    const wallH = gridH + GRID_Y + 12;
    // The box sits right of the party column; the summary side panel (DOM) takes the right third.
    this.boxX = this.partyX + 76;
    this.boxY = Math.round(height / 2 - wallH / 2 + 10);
    void width;
    const frameKey = 'pc-frame';
    if (this.textures.exists(frameKey)) {
      this.frame = this.add.nineslice(this.boxX + wallW / 2, this.boxY + wallH / 2, frameKey, undefined, wallW + 24, wallH + 24, 12, 12, 12, 12);
    } else {
      this.frame = this.add.rectangle(this.boxX + wallW / 2, this.boxY + wallH / 2, wallW + 24, wallH + 24, COLORS.borderOuter) as unknown as Phaser.GameObjects.Image;
    }
    this.wallpaper = this.add.image(this.boxX, this.boxY, '').setOrigin(0).setDisplaySize(wallW, wallH);
    this.boxTitle = this.add.text(this.boxX + wallW / 2, this.boxY + 14, '', { ...TEXT, fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
    this.leftArrow = new Button(this, this.boxX + 28, this.boxY + 14, '<', () => this.switchBox(-1), 36, 24);
    this.rightArrow = new Button(this, this.boxX + wallW - 28, this.boxY + 14, '>', () => this.switchBox(1), 36, 24);
    this.countText = this.add.text(this.boxX + wallW, this.boxY + wallH + 22, '', TEXT_DIM).setOrigin(1, 0.5);
    new Button(this, this.boxX + 70, this.boxY + wallH + 22, 'Wallpaper', () => this.nextWallpaper(), 120, 24);

    // Slot hit areas: party column and box grid.
    for (let i = 0; i < MAX_PARTY; i++) {
      this.makeSlot({ kind: 'party', index: i }, this.partyX, this.partyY + i * 56 + 24);
    }
    for (let r = 0; r < PC.rows; r++) {
      for (let c = 0; c < PC.columns; c++) {
        this.makeSlot({ kind: 'box', box: -1, slot: r * PC.columns + c }, this.boxX + GRID_X + c * CELL + CELL / 2, this.boxY + GRID_Y + r * CELL + CELL / 2);
      }
    }

    // Cursor image follows the pointer over the canvas.
    if (this.textures.exists('pc-cursor')) {
      this.cursor = this.add.image(-50, -50, 'pc-cursor').setOrigin(0.1, 0.05).setDepth(5000);
      this.input.setDefaultCursor('none');
    }
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('LevelSelect'));
    this.input.keyboard?.on('keydown-LEFT', () => this.switchBox(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.switchBox(1));

    this.summary = new PcSummary({
      portraitUrl: (s) => portraitUrl(s),
      iconUrl: (s) => iconUrl(s),
      rareCandies: () => getGame().items.rareCandies,
      useRareCandy: () => {
        getGame().items.rareCandies--;
      },
      location: (mon) => (getGame().party.includes(mon) ? 'party' : 'box'),
      toParty: (mon) => this.tryMove(() => {
        const ref = findRef(getGame(), mon);
        if (ref?.kind === 'box') moveToParty(getGame(), ref.box, ref.slot);
      }),
      toBox: (mon) => this.tryMove(() => {
        const ref = findRef(getGame(), mon);
        if (ref?.kind === 'party') {
          const to = moveToBox(getGame(), ref.index, this.boxIndex);
          this.boxIndex = to.box;
        }
      }),
      onSort: (key: SortKey) => {
        sortBox(getGame().boxes[this.boxIndex]!, key);
        this.changed();
      },
      onFilter: (filter) => {
        this.filter = filter;
        this.refresh();
      },
      onChange: () => this.changed(),
      onBack: () => this.scene.start('LevelSelect'),
    });

    (window as unknown as { __ptd?: unknown }).__ptd = {
      scene: this,
      game,
      pc: { moveMon, switchBox: (d: -1 | 1) => this.switchBox(d), select: (ref: SlotRef) => this.select(ref), boxIndex: () => this.boxIndex, slots: () => this.slots },
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.summary?.destroy();
      this.summary = undefined;
      this.input.setDefaultCursor('default');
      saveGame();
      (window as unknown as { __ptd?: unknown }).__ptd = undefined;
    });
    this.refresh();
  }

  private makeSlot(ref: SlotRef, x: number, y: number): void {
    const hit = this.add.rectangle(x, y, CELL - 4, CELL - 4, 0xffffff, 0.001).setInteractive({ useHandCursor: false });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onSlotDown(ref, p));
    hit.on('pointerover', () => hit.setStrokeStyle(2, COLORS.placeableHover));
    hit.on('pointerout', () => hit.setStrokeStyle());
    this.slots.push({ ref, x, y, hit, mon: null });
  }

  private currentRef(ref: SlotRef): SlotRef {
    return ref.kind === 'box' ? { kind: 'box', box: this.boxIndex, slot: ref.slot } : ref;
  }

  private switchBox(dir: -1 | 1): void {
    const n = getGame().boxes.length;
    this.boxIndex = (this.boxIndex + dir + n) % n;
    this.refresh();
  }

  private nextWallpaper(): void {
    const box = getGame().boxes[this.boxIndex]!;
    const ids = PC.wallpapers.map((w) => w.id);
    const next = ids[(ids.indexOf(box.wallpaper) + 1) % ids.length] ?? ids[0]!;
    setWallpaper(box, next);
    this.changed();
  }

  private changed(): void {
    saveGame();
    this.refresh();
    this.summary?.refresh();
  }

  private tryMove(action: () => void): void {
    try {
      action();
      this.changed();
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err));
    }
  }

  /** Rebuilds the icons from the game state for the current box. */
  private refresh(): void {
    const game = getGame();
    const box = game.boxes[this.boxIndex]!;
    const wpKey = `wallpaper-${box.wallpaper}`;
    if (this.wallpaper) {
      if (this.textures.exists(wpKey)) this.wallpaper.setTexture(wpKey).setVisible(true);
      else this.wallpaper.setVisible(false);
      this.wallpaper.setDisplaySize(PC.columns * CELL + GRID_X * 2, PC.rows * CELL + GRID_Y + 12);
    }
    this.boxTitle?.setText(`${box.name}  (${this.boxIndex + 1}/${game.boxes.length})`);
    const count = box.slots.filter((m) => m).length;
    this.countText?.setText(`${count} / ${box.slots.length}`);
    for (const slot of this.slots) {
      slot.icon?.destroy();
      delete slot.icon;
      const ref = this.currentRef(slot.ref);
      const mon = getAt(game, ref);
      slot.mon = mon;
      if (!mon || (this.drag && this.drag.mon === mon)) continue;
      const key = iconTextureKey(mon.species, this.iconFrame);
      if (!this.textures.exists(key)) continue;
      const icon = this.add.image(slot.x, slot.y - 4, key).setDepth(10);
      const matches = matchesFilter(mon, this.filter);
      icon.setAlpha(matches ? 1 : 0.25);
      if (mon.shiny) {
        icon.setTint(0xfff5c0);
      }
      if (mon === this.summary?.selected) slot.hit.setStrokeStyle(2, COLORS.selected);
      else slot.hit.setStrokeStyle();
      slot.icon = icon;
    }
  }

  private select(ref: SlotRef): void {
    const mon = getAt(getGame(), this.currentRef(ref));
    this.summary?.show(mon);
    this.refresh();
  }

  private onSlotDown(ref: SlotRef, pointer: Phaser.Input.Pointer): void {
    const real = this.currentRef(ref);
    const mon = getAt(getGame(), real);
    if (!mon) {
      this.summary?.show(null);
      this.refresh();
      return;
    }
    const key = iconTextureKey(mon.species, this.iconFrame);
    const icon = this.add.image(pointer.x, pointer.y - 6, key).setDepth(4000).setScale(1.15);
    this.drag = { from: real, mon, icon, startX: pointer.x, startY: pointer.y, moved: false, arrowTimer: 0, arrowDir: 0 };
    this.refresh();
  }

  private slotUnder(x: number, y: number): SlotView | undefined {
    return this.slots.find((s) => Math.abs(s.x - x) <= CELL / 2 && Math.abs(s.y - y) <= CELL / 2);
  }

  private arrowUnder(x: number, y: number): -1 | 1 | 0 {
    const hit = (b: Button | undefined) => b !== undefined && Math.abs(b.x - x) <= 22 && Math.abs(b.y - y) <= 16;
    if (hit(this.leftArrow)) return -1;
    if (hit(this.rightArrow)) return 1;
    return 0;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.cursor?.setPosition(pointer.x, pointer.y);
    const drag = this.drag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > 6) drag.moved = true;
    drag.icon.setPosition(pointer.x, pointer.y - 6);
    const dir = this.arrowUnder(pointer.x, pointer.y);
    if (dir !== drag.arrowDir) {
      drag.arrowDir = dir;
      drag.arrowTimer = 0;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.icon.destroy();
    if (!drag.moved) {
      this.summary?.show(drag.mon);
      this.refresh();
      return;
    }
    const slot = this.slotUnder(pointer.x, pointer.y);
    if (slot) {
      const to = this.currentRef(slot.ref);
      const from = findRef(getGame(), drag.mon) ?? drag.from;
      this.tryMove(() => moveMon(getGame(), from, to));
    } else {
      this.refresh();
    }
  }

  private showToast(text: string): void {
    this.toast?.destroy();
    this.toast = this.add
      .text(this.scale.width / 2, this.scale.height - 24, text, { ...TEXT, backgroundColor: '#000000aa', padding: { x: 8, y: 4 } })
      .setOrigin(0.5)
      .setDepth(4500);
    this.time.delayedCall(1800, () => this.toast?.destroy());
  }

  override update(_time: number, delta: number): void {
    // Box icons bob at the Gen 5 rate.
    this.iconTimer += delta;
    if (this.iconTimer >= ICON_FRAME_MS) {
      this.iconTimer -= ICON_FRAME_MS;
      this.iconFrame = this.iconFrame === 0 ? 1 : 0;
      for (const slot of this.slots) {
        if (slot.icon && slot.mon && iconInfo(slot.mon.species).animatedIcon) slot.icon.setTexture(iconTextureKey(slot.mon.species, this.iconFrame));
      }
      if (this.drag && iconInfo(this.drag.mon.species).animatedIcon) this.drag.icon.setTexture(iconTextureKey(this.drag.mon.species, this.iconFrame));
    }
    // Holding a dragged Pokémon over an arrow turns the page.
    const drag = this.drag;
    if (drag && drag.arrowDir !== 0) {
      drag.arrowTimer += delta;
      if (drag.arrowTimer >= ARROW_HOLD_MS) {
        drag.arrowTimer = 0;
        this.switchBox(drag.arrowDir);
      }
    }
  }
}
