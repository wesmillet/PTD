import Phaser from 'phaser';
import { COLORS, TEXT } from './styles';

/** A rounded text button matching the theme (see docs/ui.md). */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private hover = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    private readonly bw = 120,
    private readonly bh = 30,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, { ...TEXT, fontStyle: 'bold' }).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(bw, bh);
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

  private draw(): void {
    const g = this.bg;
    g.clear();
    const fill = !this.enabled ? COLORS.buttonDisabled : this.hover ? COLORS.buttonHover : COLORS.button;
    g.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(-this.bw / 2, -this.bh / 2 + 2, this.bw, this.bh, 6);
    g.fillStyle(fill, 1).fillRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 6);
    g.lineStyle(2, this.enabled ? COLORS.panelBorder : COLORS.borderOuter, 1).strokeRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 6);
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.label.setAlpha(enabled ? 1 : 0.5);
    this.draw();
    return this;
  }
}
