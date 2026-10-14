import Phaser from 'phaser';
import { popupTextureKey } from '../game/runtime';
import { TEXT_BIG } from './styles';

/**
 * Platinum's location popup: the banner for the area kind slides in at the
 * top-left with the place name over it, stays two seconds and slides out.
 */
export function showLocationPopup(scene: Phaser.Scene, kind: string, name: string, top: number): Phaser.GameObjects.Container | null {
  const key = popupTextureKey(kind);
  if (!scene.textures.exists(key)) return null;
  const scale = 2;
  const banner = scene.add.image(0, 0, key).setOrigin(0).setScale(scale);
  const w = banner.width * scale;
  const label = scene.add.text(w / 2, 20, name, TEXT_BIG).setOrigin(0.5, 0);
  const c = scene.add.container(-w - 8, top, [banner, label]).setDepth(2400);
  scene.tweens.add({ targets: c, x: 8, duration: 220, ease: 'Cubic.easeOut' });
  scene.time.delayedCall(2200, () => {
    if (!c.active) return;
    scene.tweens.add({ targets: c, x: -w - 8, duration: 220, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  });
  return c;
}
