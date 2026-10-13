import Phaser from 'phaser';
import spriteFolders from '../data/spriteFolders.json';
import { urlParam } from '../game/runtime';

/**
 * Loads the small shared assets (portraits, generated textures) and hands
 * off. Pokémon sprite sheets load per level (see LevelScene.preload).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add
      .text(width / 2, height / 2 - 20, 'Loading…', { fontFamily: '"Pixelify Sans", monospace', fontSize: '18px', color: '#f4ecd8' })
      .setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(0x2c335c, 1).fillRoundedRect(width / 2 - 150, height / 2, 300, 12, 6);
      bar.fillStyle(0x6fa8dc, 1).fillRoundedRect(width / 2 - 150, height / 2, Math.max(12, 300 * value), 12, 6);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      label.setText(`Failed to load ${file.src}`).setColor('#ff6b6b');
    });
    const folders = spriteFolders as Record<string, { shiny: boolean; portraits: string[]; icon?: boolean; animatedIcon?: boolean }>;
    for (const [dex, info] of Object.entries(folders)) {
      if (info.portraits.includes('Normal')) {
        this.load.image(`portrait-${dex}`, `${import.meta.env.BASE_URL}assets/portraits/${dex}/Normal.png`);
      }
      const id = Number(dex);
      if (info.animatedIcon) {
        this.load.image(`icon-${id}-0`, `${import.meta.env.BASE_URL}assets/icons/${id}-f0.png`);
        this.load.image(`icon-${id}-1`, `${import.meta.env.BASE_URL}assets/icons/${id}-f1.png`);
      } else if (info.icon) {
        this.load.image(`icon-${id}`, `${import.meta.env.BASE_URL}assets/icons/${id}.png`);
      }
    }
  }

  create(): void {
    // A small star for shiny sparkles.
    const star = this.add.graphics();
    star.fillStyle(0xffffff, 1);
    star.fillPoints([
      { x: 4, y: 0 }, { x: 5, y: 3 }, { x: 8, y: 4 }, { x: 5, y: 5 }, { x: 4, y: 8 }, { x: 3, y: 5 }, { x: 0, y: 4 }, { x: 3, y: 3 },
    ], true);
    star.generateTexture('star', 8, 8);
    star.destroy();
    const scene = urlParam('scene');
    if (scene === 'demo') this.scene.start('Phase0');
    else if (scene === 'select') this.scene.start('LevelSelect');
    else if (urlParam('level')) this.scene.start('Level');
    else this.scene.start('Title');
  }
}
