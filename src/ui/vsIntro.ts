import Phaser from 'phaser';
import { bannerTextureKey, mugshotTextureKey } from '../game/runtime';
import { TEXT_TITLE } from './styles';

/**
 * Platinum's VS screen before a gym leader (or other mugshot trainer): a
 * dark band across the middle, the mugshot sliding in from the right, the
 * VS mark popping in on the left and the class banner under the mugshot
 * when one exists. About a second; a click or Enter skips it.
 */
export class VsIntro {
  private container: Phaser.GameObjects.Container | null = null;
  private done: (() => void) | null = null;
  private readonly keyHandler = () => this.finish();

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  /** Whether an intro can play for this trainer (its mugshot is loaded). */
  canPlay(trainerId: string): boolean {
    return this.scene.textures.exists(mugshotTextureKey(trainerId));
  }

  play(trainerId: string, label: string, onDone: () => void): void {
    if (this.container || !this.canPlay(trainerId)) {
      onDone();
      return;
    }
    const scene = this.scene;
    const { width, height } = scene.scale;
    this.done = onDone;
    const c = scene.add.container(0, 0).setDepth(2460);
    this.container = c;
    const shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
    shade.on('pointerdown', () => this.finish());
    c.add(shade);
    const bandY = height / 2;
    const bandH = 168;
    c.add(scene.add.rectangle(width / 2, bandY, width, bandH, 0x202028, 1));
    // Diagonal red stripes, the leader VS look.
    const stripes = scene.add.graphics();
    stripes.fillStyle(0xd83838, 0.85);
    for (let x = -bandH; x < width + bandH; x += 56) {
      stripes.fillPoints([
        { x, y: bandY - bandH / 2 },
        { x: x + 24, y: bandY - bandH / 2 },
        { x: x + 24 + bandH, y: bandY + bandH / 2 },
        { x: x + bandH, y: bandY + bandH / 2 },
      ], true);
    }
    c.add(stripes);
    c.add(scene.add.rectangle(width / 2, bandY - bandH / 2, width, 4, 0xf8f8f8, 1));
    c.add(scene.add.rectangle(width / 2, bandY + bandH / 2, width, 4, 0xf8f8f8, 1));

    const mugX = width * 0.68;
    const mug = scene.add.image(width + 200, bandY - 22, mugshotTextureKey(trainerId)).setScale(1.75);
    c.add(mug);
    scene.tweens.add({ targets: mug, x: mugX, duration: 260, ease: 'Cubic.easeOut' });
    const bannerKey = bannerTextureKey(trainerId);
    if (scene.textures.exists(bannerKey)) {
      const banner = scene.add.image(width + 300, bandY + 60, bannerKey).setScale(1.5);
      c.add(banner);
      scene.tweens.add({ targets: banner, x: mugX, duration: 300, delay: 60, ease: 'Cubic.easeOut' });
    }
    if (scene.textures.exists('ui-vs')) {
      const vs = scene.add.image(width * 0.3, bandY - 20, 'ui-vs', 0).setScale(0.2).setAlpha(0);
      c.add(vs);
      scene.tweens.add({ targets: vs, scale: 2, alpha: 1, duration: 220, delay: 180, ease: 'Back.easeOut' });
    }
    const name = scene.add.text(width * 0.3, bandY + 58, label, TEXT_TITLE).setOrigin(0.5).setAlpha(0);
    c.add(name);
    scene.tweens.add({ targets: name, alpha: 1, duration: 200, delay: 320 });

    scene.input.keyboard?.on('keydown-ENTER', this.keyHandler);
    scene.input.keyboard?.on('keydown-SPACE', this.keyHandler);
    scene.time.delayedCall(1300, () => {
      if (this.container !== c) return;
      scene.tweens.add({ targets: c, alpha: 0, duration: 180, onComplete: () => this.finish() });
    });
  }

  private finish(): void {
    if (!this.container) return;
    this.scene.input.keyboard?.off('keydown-ENTER', this.keyHandler);
    this.scene.input.keyboard?.off('keydown-SPACE', this.keyHandler);
    this.container.destroy();
    this.container = null;
    const done = this.done;
    this.done = null;
    done?.();
  }

  destroy(): void {
    this.finish();
  }
}
