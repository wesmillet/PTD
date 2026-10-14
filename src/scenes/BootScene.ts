import Phaser from 'phaser';
import config from '../data/config.json';
import levelsJson from '../data/levels.json';
import spriteFolders from '../data/spriteFolders.json';
import uiGen4 from '../data/ui-gen4.json';
import { assetUrl, badgeTextureKey, folderIconName, itemTextureKey, itemUrl, trainerTextureKey, urlParam } from '../game/runtime';
import { PC } from '../sim/pc';
import { frameKey, TEXT_BIG } from '../ui/styles';

const ui = uiGen4 as {
  frames: Record<string, { file: string }>;
  hpBoxes: Record<string, { file: string }>;
  status: Record<string, string>;
  balls: Record<string, string>;
  bag: { pokeball: string; pokeballPressed: string; buttons: Record<string, Record<string, string>>; pocketIcons: string; pocketIconsDim: string; pocketCursor: string; pocketPanel: string };
  menu: Record<string, { on: string; off: string }>;
};

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
      .text(width / 2, height / 2 - 20, 'Loading…', TEXT_BIG)
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
    const folders = spriteFolders as Record<string, { shiny: boolean; portraits: string[]; shinyPortraits?: string[]; icon?: boolean; animatedIcon?: boolean }>;
    for (const [dex, info] of Object.entries(folders)) {
      if (info.portraits.includes('Normal')) {
        this.load.image(`portrait-${dex}`, `${import.meta.env.BASE_URL}assets/portraits/${dex}/Normal.png`);
      }
      if (info.shinyPortraits?.includes('Normal')) {
        this.load.image(`portrait-${dex}-shiny`, `${import.meta.env.BASE_URL}assets/portraits/${dex}/shiny/Normal.png`);
      }
      const id = folderIconName(dex);
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
    // Platinum interface pieces (scripts/build-gen4-ui.mjs): frames, HP boxes, badges, fonts, bag, menu icons.
    for (const [name, f] of Object.entries(ui.frames)) this.load.image(frameKey(name), assetUrl(f.file));
    for (const [name, b] of Object.entries(ui.hpBoxes)) this.load.image(`ui-hpbox-${name}`, assetUrl(b.file));
    for (const [name, file] of Object.entries(ui.status)) this.load.image(`ui-status-${name}`, assetUrl(file));
    for (const [name, file] of Object.entries(ui.balls)) this.load.image(`ui-ball-${name}`, assetUrl(file));
    this.load.image('ui-pokeball', assetUrl(ui.bag.pokeball));
    this.load.image('ui-pokeball-pressed', assetUrl(ui.bag.pokeballPressed));
    for (const [pocket, states] of Object.entries(ui.bag.buttons)) for (const [state, file] of Object.entries(states)) this.load.image(`ui-button-${pocket}-${state}`, assetUrl(file));
    this.load.image('ui-pocket-icons', assetUrl(ui.bag.pocketIcons));
    this.load.image('ui-pocket-cursor', assetUrl(ui.bag.pocketCursor));
    this.load.image('ui-pocket-panel', assetUrl(ui.bag.pocketPanel));
    for (const [name, icon] of Object.entries(ui.menu)) {
      this.load.image(`ui-menu-${name}`, assetUrl(icon.on));
      this.load.image(`ui-menu-${name}-off`, assetUrl(icon.off));
    }
    // Trainer portraits and badges named by the levels.
    for (const def of Object.values(levelsJson as Record<string, { trainer?: { id: string }; badge?: { id: string } }>)) {
      if (def.trainer) this.load.image(trainerTextureKey(def.trainer.id), assetUrl(`assets/trainers/${def.trainer.id}.png`));
      if (def.badge) {
        this.load.image(badgeTextureKey(def.badge.id), assetUrl(`assets/badges/${def.badge.id}.png`));
        this.load.image(badgeTextureKey(def.badge.id, false), assetUrl(`assets/badges/${def.badge.id}-off.png`));
      }
    }
  }

  /**
   * Box icons for shinies: the shiny Normal portrait scaled to 32x32 with
   * nearest filtering (what scripts/make-fallback-icons.py does for folders
   * without a PokeAPI icon), keyed "icon-<species>[-form]-shiny".
   */
  private buildShinyIcons(): void {
    const folders = spriteFolders as Record<string, { shinyPortraits?: string[] }>;
    for (const [dex, info] of Object.entries(folders)) {
      if (!info.shinyPortraits?.includes('Normal')) continue;
      const src = `portrait-${dex}-shiny`;
      const key = `icon-${folderIconName(dex)}-shiny`;
      if (!this.textures.exists(src) || this.textures.exists(key)) continue;
      const canvas = this.textures.createCanvas(key, 32, 32);
      if (!canvas) continue;
      const ctx = canvas.context;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.textures.get(src).getSourceImage() as HTMLImageElement, 0, 0, 32, 32);
      canvas.refresh();
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
    this.buildShinyIcons();
    const scene = urlParam('scene');
    if (scene === 'demo') this.scene.start('Phase0');
    else if (scene === 'select') this.scene.start('LevelSelect');
    else if (scene === 'pc') this.scene.start('PC');
    else if (urlParam('level')) this.scene.start('Level');
    else this.scene.start('Title');
  }
}
