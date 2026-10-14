import Phaser from 'phaser';
import config from '../data/config.json';
import levelsJson from '../data/levels.json';
import spriteFolders from '../data/spriteFolders.json';
import { assetUrl, badgeTextureKey, itemTextureKey, itemUrl, trainerTextureKey, urlParam } from '../game/runtime';
import { PC } from '../sim/pc';

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
    // Item sprites (balls, Potion, Rare Candy).
    const items = new Set<string>();
    for (const ball of Object.values(config.balls)) items.add(ball.sprite);
    for (const ware of Object.values(config.shop)) items.add(ware.sprite);
    for (const sprite of items) this.load.image(itemTextureKey(sprite), itemUrl(sprite));
    // PC skin: frame, cursor and wallpapers (placeholders until a real skin is dropped in).
    this.load.image('pc-frame', assetUrl(PC.frame));
    this.load.image('pc-cursor', assetUrl(PC.cursor));
    for (const wp of PC.wallpapers) this.load.image(`wallpaper-${wp.id}`, assetUrl(wp.image));
    // Trainer portraits and badges named by the levels.
    for (const def of Object.values(levelsJson as Record<string, { trainer?: { id: string }; badge?: { id: string } }>)) {
      if (def.trainer) this.load.image(trainerTextureKey(def.trainer.id), assetUrl(`assets/trainers/${def.trainer.id}.png`));
      if (def.badge) {
        this.load.image(badgeTextureKey(def.badge.id), assetUrl(`assets/badges/${def.badge.id}.png`));
        this.load.image(badgeTextureKey(def.badge.id, false), assetUrl(`assets/badges/${def.badge.id}-off.png`));
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
    else if (scene === 'pc') this.scene.start('PC');
    else if (urlParam('level')) this.scene.start('Level');
    else this.scene.start('Title');
  }
}
