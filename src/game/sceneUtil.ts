import type Phaser from 'phaser';

/**
 * Destroys every game object of a scene (the loading label and progress
 * bar a preload leaves behind). `children.removeAll(true)` only removes
 * them from the list, so their textures would live on.
 */
export function destroyChildren(scene: Phaser.Scene): void {
  for (const o of [...scene.children.list]) o.destroy();
}
