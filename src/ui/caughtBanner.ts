import Phaser from 'phaser';
import { itemTextureKey } from '../game/runtime';
import { BALLS } from '../sim/catch';
import { framePanel } from './button';
import { TEXT, TEXT_BIG } from './styles';

/**
 * "Gotcha!": a Platinum frame above the party strip with the ball shaking
 * three times, the Pokémon's name and where it went (party or PC box).
 */
export function showCaughtBanner(scene: Phaser.Scene, name: string, ballId: string, destination: 'party' | 'box', bottom: number): void {
  const { width } = scene.scale;
  const w = 380;
  const h = 56;
  const frame = framePanel(scene, 0, 0, w, h, 'green');
  const ballKey = itemTextureKey(BALLS[ballId]?.sprite ?? 'poke-ball');
  const items: Phaser.GameObjects.GameObject[] = [frame];
  let ball: Phaser.GameObjects.Image | undefined;
  if (scene.textures.exists(ballKey)) {
    ball = scene.add.image(-w / 2 + 30, 0, ballKey).setScale(1.5);
    items.push(ball);
  }
  items.push(scene.add.text(-w / 2 + 56, -12, `Gotcha! ${name} was caught!`, TEXT_BIG).setOrigin(0, 0.5));
  items.push(scene.add.text(-w / 2 + 56, 14, destination === 'party' ? 'It joins the party.' : 'Sent to the PC Box.', TEXT).setOrigin(0, 0.5));
  const c = scene.add.container(width / 2, bottom + h, items).setDepth(2350).setAlpha(0);
  scene.tweens.add({ targets: c, y: bottom - h / 2 - 8, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });
  if (ball) scene.tweens.add({ targets: ball, angle: { from: -20, to: 20 }, duration: 140, yoyo: true, repeat: 5, ease: 'Sine.easeInOut' });
  scene.time.delayedCall(2200, () => {
    if (!c.active) return;
    scene.tweens.add({ targets: c, alpha: 0, y: bottom + h, duration: 220, onComplete: () => c.destroy() });
  });
}
