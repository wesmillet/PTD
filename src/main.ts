import Phaser from 'phaser';
import './ui/theme.css';
import { BootScene } from './scenes/BootScene';
import { LevelScene } from './scenes/LevelScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { PCScene } from './scenes/PCScene';
import { Phase0Scene } from './scenes/Phase0Scene';
import { TitleScene } from './scenes/TitleScene';
import { Hud } from './ui/hud';

function start(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 960,
    height: Hud.HEIGHT + 14 * 32 + Hud.BOTTOM,
    backgroundColor: '#c0ccdc',
    pixelArt: true,
    loader: { maxRetries: 4 },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, TitleScene, LevelSelectScene, LevelScene, PCScene, Phase0Scene],
  });
}

// Make sure the pixel font is available before any canvas text is created.
const fonts = typeof document !== 'undefined' && 'fonts' in document ? document.fonts : null;
if (fonts) {
  Promise.all([fonts.load('700 16px "Pixelify Sans"'), fonts.load('400 16px "Pixelify Sans"')])
    .catch(() => undefined)
    .finally(start);
} else {
  start();
}
