import Phaser from 'phaser';
import uiGen4 from '../data/ui-gen4.json';
import { COLORS, FONT_BOLD, frameKey, TEXT } from './styles';

interface FrameInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FRAMES = (uiGen4 as { frames: Record<string, FrameInsets> }).frames;

/** Insets of a cut Platinum frame, for Phaser's NineSlice. */
export function frameInsets(name: string): FrameInsets {
  return FRAMES[name] ?? { left: 8, right: 8, top: 8, bottom: 8 };
}

/**
 * A 9-slice panel from a Platinum text-box frame. Falls back to a plain
 * rectangle when the frame texture is not loaded (tests, demo scene).
 */
export function framePanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, name = 'blue'): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle {
  const key = frameKey(name);
  if (!scene.textures.exists(key)) return scene.add.rectangle(x, y, width, height, COLORS.panel).setStrokeStyle(2, COLORS.panelBorder);
  const i = frameInsets(name);
  return scene.add.nineslice(x, y, key, undefined, Math.max(width, i.left + i.right + 2), Math.max(height, i.top + i.bottom + 2), i.left, i.right, i.top, i.bottom);
}

/**
 * A text button on the blue Platinum frame, with an optional menu icon on
 * the left (see docs/ui.md). The label is 26 px bold; the frame grows to
 * fit it when the given width is too narrow, so callers only give a minimum.
 */
export class Button extends Phaser.GameObjects.Container {
  /** Default frame height for a 26 px label. */
  static readonly HEIGHT = 38;
  /** Horizontal padding each side of the label. */
  static readonly PAD = 14;
  private readonly bg: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private enabled = true;
  private hover = false;
  /** Final frame width: the given minimum or the label plus padding. */
  readonly bw: number;
  readonly bh: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    minWidth = 120,
    height = Button.HEIGHT,
    iconKey?: string,
  ) {
    super(scene, x, y);
    this.label = scene.add.text(0, 0, text, { ...TEXT, fontFamily: FONT_BOLD }).setOrigin(0.5);
    this.bw = Math.max(minWidth, Math.ceil(this.label.width) + Button.PAD * 2 + (iconKey ? 28 : 0));
    this.bh = Math.max(height, Button.HEIGHT);
    this.bg = framePanel(scene, 0, 0, this.bw, this.bh, 'blue');
    this.add([this.bg, this.label]);
    if (iconKey) this.setIcon(iconKey);
    this.setSize(this.bw, this.bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      this.hover = true;
      this.draw();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.draw();
    });
    this.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (this.enabled) onClick();
    });
    this.draw();
    scene.add.existing(this);
  }

  /** Shows a 24x24 icon at the left edge and shifts the label right. */
  setIcon(key: string): this {
    this.icon?.destroy();
    if (!this.scene.textures.exists(key)) return this;
    this.icon = this.scene.add.image(-this.bw / 2 + 22, 0, key);
    this.add(this.icon);
    this.label.setX(14);
    return this;
  }

  /** Width of the frame as drawn. */
  get frameWidth(): number {
    return this.bw;
  }

  private draw(): void {
    const tint = !this.enabled ? 0xd0d4d8 : this.hover ? 0xd0e8ff : 0xffffff;
    if (this.bg instanceof Phaser.GameObjects.NineSlice) this.bg.setTint(tint);
    else this.bg.setFillStyle(!this.enabled ? COLORS.buttonDisabled : this.hover ? COLORS.buttonHover : COLORS.button);
    this.label.setAlpha(this.enabled ? 1 : 0.5);
    this.icon?.setAlpha(this.enabled ? 1 : 0.5);
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (this.enabled === enabled) return this; // called every frame by the HUD
    this.enabled = enabled;
    this.draw();
    return this;
  }
}
