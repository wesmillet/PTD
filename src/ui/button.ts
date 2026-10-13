import Phaser from 'phaser';
import { COLORS, TEXT } from './styles';

/** A flat rectangular text button. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, width = 120, height = 28) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, width, height, COLORS.button).setStrokeStyle(1, COLORS.panelBorder);
    this.label = scene.add.text(0, 0, text, TEXT).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabled && this.bg.setFillStyle(COLORS.buttonHover));
    this.on('pointerout', () => this.enabled && this.bg.setFillStyle(COLORS.button));
    this.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (this.enabled) onClick();
    });
    scene.add.existing(this);
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.bg.setFillStyle(enabled ? COLORS.button : COLORS.buttonDisabled);
    this.label.setAlpha(enabled ? 1 : 0.5);
    return this;
  }
}
