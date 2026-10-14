import Phaser from 'phaser';
import { framePanel } from './button';
import { SIZE_LARGE, TEXT_BIG } from './styles';

export interface DialoguePage {
  text: string;
  /** Texture key of a portrait shown at the left of the box (a trainer card image). */
  portrait?: string;
  /** Icon texture keys shown in a row under the text (a trainer's party). */
  icons?: string[];
}

export interface DialogueOptions {
  /** Letters per second. */
  speed?: number;
  /** Which frame to draw the box with. */
  frame?: string;
  /** Bottom edge of the box (defaults to just above the HUD's bottom bar). */
  bottom?: number;
}

/**
 * The bottom text box of the DS games: a Platinum frame across the width,
 * text typed out letter by letter. A click or Enter completes the page,
 * the next one advances; the last one closes and calls `onDone`.
 */
export class DialogueBox {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly textObj: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Text;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly iconRow: Phaser.GameObjects.Container;
  private readonly shade: Phaser.GameObjects.Rectangle;
  private pages: DialoguePage[] = [];
  private page = 0;
  private shown = 0;
  private timer = 0;
  private readonly msPerLetter: number;
  private onDone: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') this.advance();
  };

  constructor(scene: Phaser.Scene, options: DialogueOptions = {}) {
    this.scene = scene;
    const { width, height } = scene.scale;
    this.msPerLetter = 1000 / (options.speed ?? 40);
    const h = 96;
    const bottom = options.bottom ?? height - 60;
    this.container = scene.add.container(0, 0).setDepth(2450).setVisible(false);
    this.shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.001).setOrigin(0).setInteractive();
    this.shade.on('pointerdown', () => this.advance());
    this.container.add(this.shade);
    this.container.add(framePanel(scene, width / 2, bottom - h / 2, width - 16, h, options.frame ?? 'blue'));
    this.portrait = scene.add.image(44, bottom - h / 2, '').setVisible(false);
    this.container.add(this.portrait);
    this.textObj = scene.add.text(24, bottom - h + 14, '', { ...TEXT_BIG, wordWrap: { width: width - 80 }, lineSpacing: 2 });
    this.container.add(this.textObj);
    this.iconRow = scene.add.container(0, bottom - 24);
    this.container.add(this.iconRow);
    this.arrow = scene.add.text(width - 40, bottom - 22, '▼', { ...TEXT_BIG, fontSize: `${SIZE_LARGE}px` }).setOrigin(0.5).setVisible(false);
    this.container.add(this.arrow);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  /** Shows the pages in order; `onDone` runs after the last one is dismissed. */
  show(pages: DialoguePage[], onDone: () => void): void {
    if (pages.length === 0) {
      onDone();
      return;
    }
    this.pages = pages;
    this.page = 0;
    this.onDone = onDone;
    this.container.setVisible(true);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
    this.startPage();
  }

  private startPage(): void {
    const p = this.pages[this.page];
    if (!p) return;
    this.shown = 0;
    this.timer = 0;
    this.textObj.setText('');
    this.arrow.setVisible(false);
    if (p.portrait && this.scene.textures.exists(p.portrait)) {
      this.portrait.setTexture(p.portrait).setVisible(true);
      this.textObj.setX(96);
      this.textObj.setWordWrapWidth(this.scene.scale.width - 150);
    } else {
      this.portrait.setVisible(false);
      this.textObj.setX(24);
      this.textObj.setWordWrapWidth(this.scene.scale.width - 80);
    }
    this.iconRow.removeAll(true);
    let x = this.textObj.x + 6;
    for (const key of p.icons ?? []) {
      if (!this.scene.textures.exists(key)) continue;
      this.iconRow.add(this.scene.add.image(x, 0, key));
      x += 40;
    }
    this.iconRow.setVisible(false);
  }

  private get pageDone(): boolean {
    const p = this.pages[this.page];
    return p !== undefined && this.shown >= p.text.length;
  }

  /** Completes the current page, or moves to the next one. */
  advance(): void {
    if (!this.isOpen) return;
    const p = this.pages[this.page];
    if (!p) return;
    if (!this.pageDone) {
      this.shown = p.text.length;
      this.textObj.setText(p.text);
      this.finishPage();
      return;
    }
    this.page++;
    if (this.page >= this.pages.length) this.close();
    else this.startPage();
  }

  private finishPage(): void {
    this.arrow.setVisible(true);
    this.iconRow.setVisible(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.container.setVisible(false);
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.container.destroy();
  }

  /** Call every frame: types the next letters. */
  update(deltaMs: number): void {
    if (!this.isOpen || this.pageDone) return;
    const p = this.pages[this.page];
    if (!p) return;
    this.timer += deltaMs;
    const letters = Math.floor(this.timer / this.msPerLetter);
    if (letters <= 0) return;
    this.timer -= letters * this.msPerLetter;
    this.shown = Math.min(p.text.length, this.shown + letters);
    this.textObj.setText(p.text.slice(0, this.shown));
    if (this.pageDone) this.finishPage();
  }
}
