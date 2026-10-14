import Phaser from 'phaser';
import { framePanel } from './button';
import { TEXT_BIG, TEXT_DIM } from './styles';

/**
 * The wave banner: a Platinum frame that slides in under the top bar when a
 * wave starts, naming the wave, the trainer and the twist in play (Gust,
 * High tide, Gravity shift), then slides out.
 */
export class WaveBanner {
  private current?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene, private readonly top: number) {}

  show(title: string, detail?: string): void {
    this.current?.destroy();
    const scene = this.scene;
    const { width } = scene.scale;
    const text = scene.add.text(0, detail ? -15 : 0, title, TEXT_BIG).setOrigin(0.5);
    const sub = detail ? scene.add.text(0, 16, detail, { ...TEXT_DIM, color: '#3878e0', wordWrap: { width: width - 80 }, align: 'center' }).setOrigin(0.5) : undefined;
    const w = Math.min(width - 40, Math.max(260, 40 + Math.max(text.width, sub?.width ?? 0)));
    const h = detail ? 76 : 48;
    const frame = framePanel(scene, 0, 0, w, h, 'blue');
    const items: Phaser.GameObjects.GameObject[] = [frame, text];
    if (sub) items.push(sub);
    const c = scene.add.container(-w, this.top + h / 2 + 6, items).setDepth(2300);
    this.current = c;
    scene.tweens.add({ targets: c, x: width / 2, duration: 260, ease: 'Cubic.easeOut' });
    scene.time.delayedCall(2100, () => {
      if (!c.active) return;
      scene.tweens.add({
        targets: c,
        x: width + w,
        duration: 260,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          c.destroy();
          if (this.current === c) this.current = undefined;
        },
      });
    });
  }

  destroy(): void {
    this.current?.destroy();
    this.current = undefined;
  }
}
