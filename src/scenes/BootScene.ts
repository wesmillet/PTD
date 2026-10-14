import Phaser from 'phaser';
import config from '../data/config.json';
import spriteFolders from '../data/spriteFolders.json';
import uiGen4 from '../data/ui-gen4.json';
import { assetUrl, badgeTextureKey, folderIconName, itemTextureKey, itemUrl, popupTextureKey, trainerTextureKey, typeIconTextureKey, typeIconUrl, urlParam } from '../game/runtime';
import { allBadges } from '../sim/game';
import { POPUP_KINDS } from '../sim/waves';
import { ROSTER } from '../sim/conference';
import typesJson from '../data/types.json';
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
 * Loads what every screen needs (the interface sheets, box icons, items,
 * badges, the town map) and hands off. Pokémon sheets, portraits and
 * trainer art load with the level or screen that shows them.
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
    // Box icons for every folder (the party strip, box grid and lists need any of them at any time).
    // Portraits are DOM <img> elements loaded on demand; Pokémon sheets load per level; trainer art loads with its level.
    const folders = spriteFolders as Record<string, { icon?: boolean; animatedIcon?: boolean }>;
    for (const [dex, info] of Object.entries(folders)) {
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
    // The Ace Trainer sprite is the base of the blacked-out silhouettes (anime trainers without art), built in create().
    // Every other trainer's art loads with the level or screen that shows it (queueTrainerArt).
    this.load.image(trainerTextureKey('ace-trainer-male'), assetUrl('assets/trainers/ace-trainer-male.png'));
    this.load.image(trainerTextureKey('ace-trainer-male', true), assetUrl('assets/trainers/ace-trainer-male-pose.png'));
    this.load.spritesheet('ui-vs', assetUrl('assets/trainers/vs.png'), { frameWidth: 64, frameHeight: 64 });
    // The eight badges, lit and greyed.
    for (const b of allBadges()) {
      this.load.image(badgeTextureKey(b.id), assetUrl(`assets/badges/${b.id}.png`));
      this.load.image(badgeTextureKey(b.id, false), assetUrl(`assets/badges/${b.id}-off.png`));
    }
    // Type and move-category icons, location popups, the town map and its markers, the player's walking sheet.
    for (const name of [...Object.values((typesJson as { names: Record<string, string> }).names), 'physical', 'special', 'status']) {
      this.load.image(typeIconTextureKey(name), typeIconUrl(name));
    }
    for (const kind of POPUP_KINDS) this.load.image(popupTextureKey(kind), assetUrl(`assets/ui/gen4/popups/${kind}.png`));
    this.load.image('sinnoh-map', assetUrl('assets/ui/gen4/sinnoh-map.png'));
    this.load.image('sinnoh-map-land', assetUrl('assets/ui/gen4/sinnoh-map-land.png'));
    this.load.spritesheet('map-markers', assetUrl('assets/ui/gen4/map-markers.png'), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('ow-player', assetUrl('assets/trainers/overworld/player_m.png'), { frameWidth: 32, frameHeight: 32 });
  }


  /** Blacked-out copies of the Ace Trainer sprite for roster trainers without art (Ash, Paul, Tobias, ...). */
  private buildSilhouettes(): void {
    for (const r of ROSTER) {
      if (!r.silhouette) continue;
      for (const pose of [false, true]) {
        const src = trainerTextureKey('ace-trainer-male', pose);
        const key = trainerTextureKey(r.id, pose);
        if (!this.textures.exists(src) || this.textures.exists(key)) continue;
        const image = this.textures.get(src).getSourceImage() as HTMLImageElement;
        const canvas = this.textures.createCanvas(key, image.width, image.height);
        if (!canvas) continue;
        const ctx = canvas.context;
        ctx.drawImage(image, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#20202c';
        ctx.fillRect(0, 0, image.width, image.height);
        canvas.refresh();
      }
    }
  }

  create(): void {
    // A small star for shiny sparkles, drawn on a canvas (generateTexture would read the GPU back and stall it).
    const star = this.textures.createCanvas('star', 8, 8);
    if (star) {
      const ctx = star.context;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (const [i, [x, y]] of ([[4, 0], [5, 3], [8, 4], [5, 5], [4, 8], [3, 5], [0, 4], [3, 3]] as [number, number][]).entries()) {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      star.refresh();
    }
    this.buildSilhouettes();
    const scene = urlParam('scene');
    if (scene === 'demo') this.scene.start('Phase0');
    else if (scene === 'select') this.scene.start('LevelSelect');
    else if (scene === 'pc') this.scene.start('PC');
    else if (scene === 'conference') this.scene.start('Conference');
    else if (urlParam('level')) this.scene.start('Level');
    else this.scene.start('Title');
  }
}
