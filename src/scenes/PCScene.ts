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
import { Button, framePanel } from '../ui/button';
import { PcSummary } from '../ui/pcSummary';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from '../ui/styles';

/**
 * Layout for the full 960x600 canvas, edge to edge like the DS PC screen:
 * the party column on the left edge, the box (wallpaper at 3x) filling the
 * middle, and the summary side panel (DOM, 350 px) on the right.
 */
const PARTY_W = 112;
const PANEL_W = 362;
const WALL_SCALE = 3;
const ICON_FRAME_MS = 170;
/** Hovering an arrow while dragging switches boxes after this long. */
const ARROW_HOLD_MS = 450;

interface SlotView {
  ref: SlotRef;
  x: number;
  y: number;
  size: number;
  hit: Phaser.GameObjects.Rectangle;
  icon?: Phaser.GameObjects.Image;
  star?: Phaser.GameObjects.Image;
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
 * The PC, laid out like the DS games and filling the whole canvas: the party
 * in a column on the left, a 6x5 box grid over the box's wallpaper inside the
 * frame image, arrows to switch boxes, a cursor image, drag and drop between
 * any slots, and a summary side panel with sort and filter. Frame, cursor and
 * wallpapers are images named in src/data/pc.json.
 */
export class PCScene extends Phaser.Scene {
  private boxIndex = 0;
  private slots: SlotView[] = [];
  private summary?: PcSummary;
  private drag: Drag | null = null;
  private cursor?: Phaser.GameObjects.Image;
  private wallpaper?: Phaser.GameObjects.Image;
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
  private wallW = 0;
  private wallH = 0;
  private cell = 48;
  private iconScale = 1;

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

    // Party column: the left edge, top to bottom.
    framePanel(this, PARTY_W / 2, height / 2, PARTY_W + 8, height + 8, 'blue');
    this.add.text(PARTY_W / 2, 18, 'Party', TEXT_BIG).setOrigin(0.5);
    this.add.text(PARTY_W / 2, 44, `${game.party.length} / ${MAX_PARTY}`, TEXT_DIM).setOrigin(0.5);
    const partyTop = 70;
    const partyStep = Math.floor((height - partyTop - 50) / MAX_PARTY);
    for (let i = 0; i < MAX_PARTY; i++) {
      const y = partyTop + i * partyStep + partyStep / 2;
      this.add.rectangle(PARTY_W / 2, y, 64, partyStep - 8, COLORS.panel2).setStrokeStyle(2, 0xa8b8c8);
      this.makeSlot({ kind: 'party', index: i }, PARTY_W / 2, y, 64);
    }
    new Button(this, PARTY_W / 2, height - 24, 'Back', () => this.scene.start('LevelSelect'), 96, 28, 'ui-menu-exit');

    // Box: everything between the party column and the summary panel.
    const boxAreaX = PARTY_W + 8;
    const boxAreaW = width - PANEL_W - boxAreaX;
    this.wallW = 158 * WALL_SCALE;
    this.wallH = 118 * WALL_SCALE;
    this.boxX = Math.round(boxAreaX + (boxAreaW - this.wallW) / 2);
    this.boxY = 64;
    const frameKeyPc = 'pc-frame';
    if (this.textures.exists(frameKeyPc)) {
      this.add.nineslice(this.boxX + this.wallW / 2, this.boxY + this.wallH / 2, frameKeyPc, undefined, this.wallW + 24, this.wallH + 24, 12, 12, 12, 12);
    } else {
      this.add.rectangle(this.boxX + this.wallW / 2, this.boxY + this.wallH / 2, this.wallW + 24, this.wallH + 24, COLORS.borderOuter);
    }
    this.wallpaper = this.add.image(this.boxX, this.boxY, '').setOrigin(0).setDisplaySize(this.wallW, this.wallH);
    // Title band above the box with the arrows.
    framePanel(this, this.boxX + this.wallW / 2, 30, this.wallW + 24, 40, 'blue');
    this.boxTitle = this.add.text(this.boxX + this.wallW / 2, 30, '', TEXT_BIG).setOrigin(0.5);
    this.leftArrow = new Button(this, this.boxX + 26, 30, '<', () => this.switchBox(-1), 40, 28);
    this.rightArrow = new Button(this, this.boxX + this.wallW - 26, 30, '>', () => this.switchBox(1), 40, 28);
    // Grid cells fill the wallpaper (its 3 px bevel aside).
    const inset = 4 * WALL_SCALE;
    this.cell = Math.floor(Math.min((this.wallW - inset * 2) / PC.columns, (this.wallH - inset * 2) / PC.rows));
    this.iconScale = this.cell >= 64 ? 2 : 1;
    const gridX = this.boxX + Math.round((this.wallW - this.cell * PC.columns) / 2);
    const gridY = this.boxY + Math.round((this.wallH - this.cell * PC.rows) / 2);
    for (let r = 0; r < PC.rows; r++) {
      for (let c = 0; c < PC.columns; c++) {
        this.makeSlot({ kind: 'box', box: -1, slot: r * PC.columns + c }, gridX + c * this.cell + this.cell / 2, gridY + r * this.cell + this.cell / 2, this.cell);
      }
    }
    const footY = this.boxY + this.wallH + 36;
    new Button(this, this.boxX + 70, footY, 'Wallpaper', () => this.nextWallpaper(), 130, 28);
    this.countText = this.add.text(this.boxX + this.wallW, footY, '', TEXT).setOrigin(1, 0.5);
    this.add.text(this.boxX + this.wallW / 2, height - 14, 'Drag between slots and the party; hold over an arrow to turn the page', TEXT_DIM).setOrigin(0.5);

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
      portraitUrl: (s, shiny) => portraitUrl(s, 'Normal', shiny),
      iconUrl: (s, shiny) => iconUrl(s, true, shiny),
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

  private makeSlot(ref: SlotRef, x: number, y: number, size: number): void {
    const hit = this.add.rectangle(x, y, size - 4, size - 4, 0xffffff, 0.001).setInteractive({ useHandCursor: false });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onSlotDown(ref, p));
    hit.on('pointerover', () => hit.setStrokeStyle(2, COLORS.placeableHover));
    hit.on('pointerout', () => hit.setStrokeStyle());
    this.slots.push({ ref, x, y, size, hit, mon: null });
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
      this.wallpaper.setDisplaySize(this.wallW, this.wallH);
    }
    this.boxTitle?.setText(`${box.name}  (${this.boxIndex + 1}/${game.boxes.length})`);
    const count = box.slots.filter((m) => m).length;
    this.countText?.setText(`${count} / ${box.slots.length}`);
    for (const slot of this.slots) {
      slot.icon?.destroy();
      delete slot.icon;
      slot.star?.destroy();
      delete slot.star;
      const ref = this.currentRef(slot.ref);
      const mon = getAt(game, ref);
      slot.mon = mon;
      if (!mon || (this.drag && this.drag.mon === mon)) continue;
      const key = iconTextureKey(mon.species, this.iconFrame, mon.shiny);
      if (!this.textures.exists(key)) continue;
      const scale = slot.ref.kind === 'box' ? this.iconScale : 1.5;
      const icon = this.add.image(slot.x, slot.y - 2 * scale, key).setScale(scale).setDepth(10);
      const matches = matchesFilter(mon, this.filter);
      icon.setAlpha(matches ? 1 : 0.25);
      if (mon.shiny) {
        slot.star = this.add.image(slot.x + 10 * scale, slot.y - 12 * scale, 'star').setDepth(11).setScale(scale * 0.75).setTint(0xf8d030);
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
    const key = iconTextureKey(mon.species, this.iconFrame, mon.shiny);
    const icon = this.add.image(pointer.x, pointer.y - 6, key).setDepth(4000).setScale(this.iconScale * 1.15);
    this.drag = { from: real, mon, icon, startX: pointer.x, startY: pointer.y, moved: false, arrowTimer: 0, arrowDir: 0 };
    this.refresh();
  }

  private slotUnder(x: number, y: number): SlotView | undefined {
    return this.slots.find((s) => Math.abs(s.x - x) <= s.size / 2 && Math.abs(s.y - y) <= s.size / 2);
  }

  private arrowUnder(x: number, y: number): -1 | 1 | 0 {
    const hit = (b: Button | undefined) => b !== undefined && Math.abs(b.x - x) <= 24 && Math.abs(b.y - y) <= 18;
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
      .text(this.boxX + this.wallW / 2, this.scale.height - 40, text, { ...TEXT, backgroundColor: '#f8f8f8ee', padding: { x: 8, y: 4 } })
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
        if (slot.icon && slot.mon && !slot.mon.shiny && iconInfo(slot.mon.species).animatedIcon) slot.icon.setTexture(iconTextureKey(slot.mon.species, this.iconFrame));
      }
      if (this.drag && !this.drag.mon.shiny && iconInfo(this.drag.mon.species).animatedIcon) this.drag.icon.setTexture(iconTextureKey(this.drag.mon.species, this.iconFrame));
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
